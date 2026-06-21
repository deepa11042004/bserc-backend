const crypto = require('crypto');
const Razorpay = require('razorpay');

const db = require('../config/db');
const roles = require('../constants/roles');
const { hashPassword } = require('../utils/hashPassword');

const INTERNSHIP_TABLE = 'summer_internship_registrations';
const INTERNSHIP_FEE_SETTINGS_TABLE = 'summer_internship_fee_settings';
const PAYMENT_CURRENCY = 'INR';
const DEFAULT_GENERAL_INTERNSHIP_FEE_RUPEES = 100;
const DEFAULT_LATERAL_INTERNSHIP_FEE_RUPEES = 100;
const DEFAULT_LATERAL_EWS_INTERNSHIP_FEE_RUPEES = 1350;
const SUCCESSFUL_PAYMENT_STATUSES = new Set(['captured', 'authorized']);
const COMPLETED_PAYMENT_STATUSES = new Set(['captured', 'authorized', 'not_required']);
const FAILED_PAYMENT_STATUSES = new Set(['failed', 'cancelled', 'canceled']);
const TRANSIENT_PAYMENT_STATUSES = new Set(['created', 'pending']);
const PAYMENT_FETCH_RETRY_ATTEMPTS = 6;
const PAYMENT_FETCH_RETRY_DELAY_MS = 1200;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const INTERNSHIP_GENERAL_CATEGORY = 'General Category';
const INTERNSHIP_EWS_CATEGORY = 'EWS(Economically weaker section)';
const INTERNSHIP_LEGACY_EWS_CATEGORY = 'EWS(Economily weaker section)';

function cleanText(value) {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : '';
  }

  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function normalizeInternshipCategory(value) {
  const normalized = cleanText(value).toLowerCase();

  if (!normalized) {
    return '';
  }

  if (normalized === 'genral' || normalized === 'general' || normalized === 'general category') {
    return INTERNSHIP_GENERAL_CATEGORY;
  }

  if (
    normalized === 'ews'
    || normalized === 'ews category'
    || normalized === INTERNSHIP_EWS_CATEGORY.toLowerCase()
    || normalized === INTERNSHIP_LEGACY_EWS_CATEGORY.toLowerCase()
    || normalized === 'ews (economically weaker section)'
    || normalized === 'ews (economily weaker section)'
  ) {
    return INTERNSHIP_EWS_CATEGORY;
  }

  return '';
}

function toNullableText(value) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  const normalized = cleanText(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function normalizePaymentStatus(value) {
  const normalized = toNullableText(value)?.toLowerCase() || null;
  if (!normalized) {
    return null;
  }

  if (normalized === 'cancelled' || normalized === 'canceled') {
    return 'failed';
  }

  return normalized;
}

function isCompletedRegistrationStatus(status) {
  if (!status) {
    // Legacy rows may not include payment_status; treat them as completed.
    return true;
  }

  return COMPLETED_PAYMENT_STATUSES.has(status);
}

function isFailedPaymentStatus(status) {
  return Boolean(status) && FAILED_PAYMENT_STATUSES.has(status);
}

function isTransientPaymentStatus(status) {
  return Boolean(status) && TRANSIENT_PAYMENT_STATUSES.has(status);
}

function toMoneyInPaise(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.round(numeric * 100);
}

function toFeeRupees(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }

  return Number(numeric.toFixed(2));
}

function parseFeeRupeesInput(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Number(numeric.toFixed(2));
}

async function ensureInternshipFeeSettingsSchema(connection = db) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS ${INTERNSHIP_FEE_SETTINGS_TABLE} (
      id TINYINT PRIMARY KEY,
      general_fee_rupees DECIMAL(10,2) NOT NULL DEFAULT 100.00,
      lateral_fee_rupees DECIMAL(10,2) NOT NULL DEFAULT 100.00,
      ews_lateral_fee_rupees DECIMAL(10,2) NOT NULL DEFAULT 1350.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  );

  const [ewsLateralFeeColumn] = await connection.query(
    `SHOW COLUMNS FROM ${INTERNSHIP_FEE_SETTINGS_TABLE} LIKE 'ews_lateral_fee_rupees'`
  );

  if (ewsLateralFeeColumn.length === 0) {
    await connection.query(
      `ALTER TABLE ${INTERNSHIP_FEE_SETTINGS_TABLE}
       ADD COLUMN ews_lateral_fee_rupees DECIMAL(10,2) NOT NULL DEFAULT 1350.00 AFTER lateral_fee_rupees`
    );
  }

  await connection.query(
    `INSERT INTO ${INTERNSHIP_FEE_SETTINGS_TABLE} (id, general_fee_rupees, lateral_fee_rupees, ews_lateral_fee_rupees)
     VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      DEFAULT_GENERAL_INTERNSHIP_FEE_RUPEES,
      DEFAULT_LATERAL_INTERNSHIP_FEE_RUPEES,
      DEFAULT_LATERAL_EWS_INTERNSHIP_FEE_RUPEES,
    ]
  );

  await connection.query(
    `UPDATE ${INTERNSHIP_FEE_SETTINGS_TABLE}
     SET ews_lateral_fee_rupees = ?
     WHERE id = 1 AND ews_lateral_fee_rupees IS NULL`,
    [DEFAULT_LATERAL_EWS_INTERNSHIP_FEE_RUPEES]
  );
}

async function readInternshipFeeSettings(connection = db) {
  await ensureInternshipFeeSettingsSchema(connection);

  const [rows] = await connection.query(
    `SELECT general_fee_rupees, lateral_fee_rupees, ews_lateral_fee_rupees
     FROM ${INTERNSHIP_FEE_SETTINGS_TABLE}
     WHERE id = 1
     LIMIT 1`
  );

  const row = rows[0] || {};

  return {
    general_fee_rupees: toFeeRupees(
      row.general_fee_rupees,
      DEFAULT_GENERAL_INTERNSHIP_FEE_RUPEES
    ),
    lateral_fee_rupees: toFeeRupees(
      row.lateral_fee_rupees,
      DEFAULT_LATERAL_INTERNSHIP_FEE_RUPEES
    ),
    ews_lateral_fee_rupees: toFeeRupees(
      row.ews_lateral_fee_rupees,
      DEFAULT_LATERAL_EWS_INTERNSHIP_FEE_RUPEES
    ),
  };
}

function getApplicableInternshipFeeRupees(settings, isLateral, category) {
  if (!isLateral) {
    return settings.general_fee_rupees;
  }

  const normalizedCategory = normalizeInternshipCategory(category);

  if (normalizedCategory === INTERNSHIP_EWS_CATEGORY) {
    return settings.ews_lateral_fee_rupees;
  }

  return settings.lateral_fee_rupees;
}

function isValidDateString(value) {
  if (!DATE_REGEX.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day
  );
}

function getRazorpayCredentials() {
  return {
    keyId: cleanText(process.env.RAZORPAY_KEY_ID),
    keySecret: cleanText(process.env.RAZORPAY_KEY_SECRET),
  };
}

function getRazorpayClient() {
  const { keyId, keySecret } = getRazorpayCredentials();

  if (!keyId || !keySecret) {
    return null;
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

function isValidRazorpaySignature({ orderId, paymentId, signature, keySecret }) {
  if (!orderId || !paymentId || !signature || !keySecret) {
    return false;
  }

  if (!/^[0-9a-f]+$/i.test(signature)) {
    return false;
  }

  const digest = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const expected = Buffer.from(digest, 'hex');
  const received = Buffer.from(signature.toLowerCase(), 'hex');

  if (expected.length !== received.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPaymentFromRazorpayWithRetry(razorpayClient, paymentId) {
  let lastError = null;
  let latestPayment = null;

  for (let attempt = 1; attempt <= PAYMENT_FETCH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      latestPayment = await razorpayClient.payments.fetch(paymentId);

      const paymentStatus = cleanText(latestPayment?.status).toLowerCase();
      if (latestPayment && !TRANSIENT_PAYMENT_STATUSES.has(paymentStatus)) {
        return { payment: latestPayment, fetchError: null };
      }
    } catch (err) {
      lastError = err;
    }

    if (attempt < PAYMENT_FETCH_RETRY_ATTEMPTS) {
      await wait(PAYMENT_FETCH_RETRY_DELAY_MS);
    }
  }

  return { payment: latestPayment, fetchError: lastError };
}

async function resolvePaymentFromOrderContext(razorpayClient, orderId, paymentId) {
  const { payment, fetchError } = await fetchPaymentFromRazorpayWithRetry(
    razorpayClient,
    paymentId
  );

  if (payment && String(payment.order_id) === orderId) {
    return { payment, fetchError: null };
  }

  let lastError = fetchError;

  try {
    const orderPayments = await razorpayClient.orders.fetchPayments(orderId);
    const items = Array.isArray(orderPayments?.items) ? orderPayments.items : [];
    const matchingPayment = items.find(
      (item) => cleanText(item?.id) === paymentId
    );

    if (matchingPayment) {
      return { payment: matchingPayment, fetchError: null };
    }
  } catch (err) {
    lastError = err;
  }

  return { payment, fetchError: lastError };
}

async function resolveSuccessfulOrderPayment(razorpayClient, orderId) {
  try {
    const orderPayments = await razorpayClient.orders.fetchPayments(orderId);
    const items = Array.isArray(orderPayments?.items) ? orderPayments.items : [];

    const successfulPayment = items.find((item) =>
      SUCCESSFUL_PAYMENT_STATUSES.has(cleanText(item?.status).toLowerCase())
    );

    return successfulPayment || null;
  } catch {
    return null;
  }
}

async function hasExistingCompletedInternshipRegistration(email, connection = db) {
  const [rows] = await connection.query(
    `SELECT id
     FROM ${INTERNSHIP_TABLE}
     WHERE LOWER(email) = LOWER(?)
       AND (
         payment_status IS NULL
         OR LOWER(payment_status) IN ('captured', 'authorized', 'not_required')
       )
     LIMIT 1`,
    [email]
  );

  return Boolean(rows[0]);
}

async function reconcilePendingInternshipRegistrationByEmail(email, connection = db) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  const razorpayClient = getRazorpayClient();
  if (!razorpayClient) {
    return false;
  }

  const [attemptRows] = await connection.query(
    `SELECT
       id,
       full_name,
       mobile_number,
       payment_status,
       razorpay_order_id,
       razorpay_payment_id
     FROM ${INTERNSHIP_TABLE}
     WHERE LOWER(email) = LOWER(?)
       AND (
         payment_status IS NULL
         OR LOWER(payment_status) NOT IN ('captured', 'authorized', 'not_required')
       )
       AND razorpay_order_id IS NOT NULL
       AND razorpay_order_id <> ''
     ORDER BY id DESC
     LIMIT 1`,
    [normalizedEmail]
  );

  const attempt = attemptRows[0] || null;
  if (!attempt) {
    return false;
  }

  const orderId = cleanText(attempt.razorpay_order_id);
  const existingPaymentId = cleanText(attempt.razorpay_payment_id);

  if (!orderId) {
    return false;
  }

  let successfulPayment = null;

  if (existingPaymentId) {
    const resolved = await resolvePaymentFromOrderContext(
      razorpayClient,
      orderId,
      existingPaymentId
    );

    const resolvedStatus = cleanText(resolved.payment?.status).toLowerCase();
    if (
      resolved.payment
      && String(resolved.payment.order_id) === orderId
      && SUCCESSFUL_PAYMENT_STATUSES.has(resolvedStatus)
    ) {
      successfulPayment = resolved.payment;
    }
  }

  if (!successfulPayment) {
    const resolvedFromOrder = await resolveSuccessfulOrderPayment(
      razorpayClient,
      orderId
    );

    if (resolvedFromOrder && String(resolvedFromOrder.order_id) === orderId) {
      successfulPayment = resolvedFromOrder;
    }
  }

  if (!successfulPayment) {
    return false;
  }

  const successfulStatus = cleanText(successfulPayment.status).toLowerCase();
  if (!SUCCESSFUL_PAYMENT_STATUSES.has(successfulStatus)) {
    return false;
  }

  const paymentAmountInPaise = Number(successfulPayment.amount);
  const paymentAmount =
    Number.isFinite(paymentAmountInPaise) && paymentAmountInPaise >= 0
      ? paymentAmountInPaise / 100
      : 0;
  const paymentCurrency =
    cleanText(successfulPayment.currency).toUpperCase() || PAYMENT_CURRENCY;
  const paymentId = cleanText(successfulPayment.id) || existingPaymentId || null;
  const paymentStatus = cleanText(successfulPayment.status) || 'captured';

  await connection.query(
    `UPDATE ${INTERNSHIP_TABLE}
     SET payment_amount = ?,
         payment_currency = ?,
         razorpay_payment_id = ?,
         payment_status = ?
     WHERE id = ?
     LIMIT 1`,
    [
      paymentAmount,
      paymentCurrency,
      paymentId,
      paymentStatus,
      Number(attempt.id),
    ]
  );

  await createUserIfMissing(
    connection,
    normalizedEmail,
    cleanText(attempt.full_name),
    cleanText(attempt.mobile_number)
  );

  return true;
}

function normalizeRegistrationPayload(input) {
  const payload = {
    internship_name:
      cleanText(input.internship_name || input.internshipName) || 'Def-Space Summer Internship',
    internship_designation:
      cleanText(input.internship_designation || input.internshipDesignation)
      || 'Def-Space Tech Intern',
    full_name: cleanText(input.full_name || input.fullName),
    guardian_name: cleanText(input.guardian_name || input.guardianName),
    gender: cleanText(input.gender),
    dob: cleanText(input.dob),
    mobile_number: cleanText(input.mobile_number || input.mobileNumber || input.contact_number),
    email: normalizeEmail(input.email),
    alternative_email: normalizeEmail(
      input.alternative_email || input.alternativeEmail || input.altEmail
    ),
    address: cleanText(input.address),
    city: cleanText(input.city),
    state: cleanText(input.state),
    pin_code: cleanText(input.pin_code || input.pinCode),
    institution_name: cleanText(input.institution_name || input.institutionName),
    educational_qualification: cleanText(
      input.educational_qualification || input.educationalQualification
    ),
    is_lateral: toBoolean(input.is_lateral ?? input.isLateral ?? input.islateral),
    declaration_accepted: toBoolean(
      input.declaration_accepted ?? input.declarationAccepted
    ),
    passport_photo_path: toNullableText(
      input.passport_photo_path
      || input.passportPhotoPath
      || input.passport_photo_url
      || input.passportPhotoUrl
    ),
    passport_photo_mime_type: toNullableText(
      input.passport_photo_mime_type || input.passportPhotoMimeType
    ),
    passport_photo_file_name: toNullableText(
      input.passport_photo_file_name || input.passportPhotoFileName
    ),
  };

  const errors = [];

  if (!payload.full_name) {
    errors.push('full_name is required');
  }

  if (!payload.guardian_name) {
    errors.push('guardian_name is required');
  }

  if (!payload.gender) {
    errors.push('gender is required');
  }

  if (!payload.dob || !isValidDateString(payload.dob)) {
    errors.push('dob is required in YYYY-MM-DD format');
  }

  if (!payload.mobile_number) {
    errors.push('mobile_number is required');
  }

  if (!payload.email) {
    errors.push('email is required');
  } else if (!EMAIL_REGEX.test(payload.email)) {
    errors.push('Invalid email format');
  }

  if (!payload.alternative_email) {
    errors.push('alternative_email is required');
  } else if (!EMAIL_REGEX.test(payload.alternative_email)) {
    errors.push('Invalid alternative_email format');
  }

  if (!payload.address) {
    errors.push('address is required');
  }

  if (!payload.city) {
    errors.push('city is required');
  }

  if (!payload.state) {
    errors.push('state is required');
  }

  if (!payload.pin_code) {
    errors.push('pin_code is required');
  }

  if (!payload.institution_name) {
    errors.push('institution_name is required');
  }

  if (!payload.educational_qualification) {
    errors.push('educational_qualification is required');
  }

  if (!payload.declaration_accepted) {
    errors.push('declaration_accepted must be true');
  }

  return { payload, errors };
}

function normalizeMobileForPassword(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

async function createUserIfMissing(connection, email, fullName, mobileNumber) {
  const [existingUsers] = await connection.query(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [email]
  );

  if (existingUsers[0]) {
    return;
  }

  const hashedPassword = await hashPassword(normalizeMobileForPassword(mobileNumber));

  try {
    await connection.query(
      'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
      [fullName, email, hashedPassword, roles.USER]
    );
  } catch (err) {
    if (err && err.code !== 'ER_DUP_ENTRY') {
      throw err;
    }
  }
}

async function createInternshipRegistrationRecord(connection, payload, paymentInfo) {
  await connection.query(
    `INSERT INTO ${INTERNSHIP_TABLE} (
      internship_name,
      internship_designation,
      full_name,
      guardian_name,
      gender,
      dob,
      mobile_number,
      email,
      alternative_email,
      address,
      city,
      state,
      pin_code,
      institution_name,
      educational_qualification,
      is_lateral,
      declaration_accepted,
      passport_photo_path,
      passport_photo_mime_type,
      passport_photo_file_name,
      payment_amount,
      payment_currency,
      razorpay_order_id,
      razorpay_payment_id,
      payment_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.internship_name,
      payload.internship_designation,
      payload.full_name,
      payload.guardian_name,
      payload.gender,
      payload.dob,
      payload.mobile_number,
      payload.email,
      payload.alternative_email,
      payload.address,
      payload.city,
      payload.state,
      payload.pin_code,
      payload.institution_name,
      payload.educational_qualification,
      payload.is_lateral,
      payload.declaration_accepted,
      payload.passport_photo_path,
      payload.passport_photo_mime_type,
      payload.passport_photo_file_name,
      paymentInfo.payment_amount,
      paymentInfo.payment_currency,
      paymentInfo.razorpay_order_id,
      paymentInfo.razorpay_payment_id,
      paymentInfo.payment_status,
    ]
  );
}

async function registerInternshipInternal(input, paymentInfo, options = {}) {
  const { requirePhoto = true, createUser = true } = options;
  const { payload, errors } = normalizeRegistrationPayload(input || {});

  if (requirePhoto && !payload.passport_photo_path) {
    errors.push('passport_photo is required');
  }

  if (errors.length > 0) {
    return {
      status: 400,
      body: {
        message: errors.join('. '),
      },
    };
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const normalizedPaymentStatus = normalizePaymentStatus(paymentInfo?.payment_status);

    const [existingRegistrations] = await connection.query(
      `SELECT id, payment_status
       FROM ${INTERNSHIP_TABLE}
       WHERE LOWER(email) = LOWER(?)
       ORDER BY id DESC
       LIMIT 1`,
      [payload.email]
    );

    const existingRow = existingRegistrations[0] || null;
    const existingStatus = normalizePaymentStatus(existingRow?.payment_status);

    if (
      existingRow
      && isCompletedRegistrationStatus(existingStatus)
    ) {
      await connection.rollback();
      return {
        status: 409,
        body: { message: 'You have already applied for this internship' },
      };
    }

    let reusedFailedAttempt = false;

    try {
      await createInternshipRegistrationRecord(connection, payload, paymentInfo);
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        if (existingRow && !isCompletedRegistrationStatus(existingStatus)) {
          await connection.query(
            `UPDATE ${INTERNSHIP_TABLE}
             SET payment_amount = ?,
                 payment_currency = ?,
                 razorpay_order_id = ?,
                 razorpay_payment_id = ?,
                 payment_status = ?
             WHERE id = ?
             LIMIT 1`,
            [
              paymentInfo.payment_amount,
              paymentInfo.payment_currency,
              paymentInfo.razorpay_order_id,
              paymentInfo.razorpay_payment_id,
              paymentInfo.payment_status,
              Number(existingRow.id),
            ]
          );

          reusedFailedAttempt = true;
        } else {
          await connection.rollback();
          return {
            status: 409,
            body: { message: 'You have already applied for this internship' },
          };
        }
      } else {
        throw err;
      }
    }

    if (createUser && isCompletedRegistrationStatus(normalizedPaymentStatus)) {
      await createUserIfMissing(connection, payload.email, payload.full_name, payload.mobile_number);
    }

    await connection.commit();

    const attemptPaymentStatus = normalizedPaymentStatus || 'failed';

    return {
      status: 201,
      body: {
        message: isCompletedRegistrationStatus(normalizedPaymentStatus)
          ? (reusedFailedAttempt
            ? 'Internship application submitted successfully after retry'
            : 'Internship application submitted successfully')
          : `Internship application attempt saved with payment status: ${attemptPaymentStatus}`,
      },
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function createPaymentOrder(input) {
  const applicantEmail = normalizeEmail(input?.email);
  const isLateral = toBoolean(input?.is_lateral ?? input?.isLateral ?? input?.islateral);
  const category = normalizeInternshipCategory(input?.category);

  if (!applicantEmail) {
    return {
      status: 400,
      body: { message: 'email is required' },
    };
  }

  if (!EMAIL_REGEX.test(applicantEmail)) {
    return {
      status: 400,
      body: { message: 'Invalid email format' },
    };
  }

  if (await hasExistingCompletedInternshipRegistration(applicantEmail)) {
    return {
      status: 200,
      body: {
        requires_payment: false,
        already_registered: true,
        amount: 0,
        currency: PAYMENT_CURRENCY,
        message: 'You have already applied for this internship',
      },
    };
  }

  try {
    await reconcilePendingInternshipRegistrationByEmail(applicantEmail);
  } catch {
    // Best effort only: do not block order creation if reconciliation lookup fails.
  }

  if (await hasExistingCompletedInternshipRegistration(applicantEmail)) {
    return {
      status: 200,
      body: {
        requires_payment: false,
        already_registered: true,
        amount: 0,
        currency: PAYMENT_CURRENCY,
        message: 'You have already applied for this internship',
      },
    };
  }

  const feeSettings = await readInternshipFeeSettings();
  const internshipFeeRupees = getApplicableInternshipFeeRupees(feeSettings, isLateral, category);
  const amountInPaise = toMoneyInPaise(internshipFeeRupees);

  if (amountInPaise === null) {
    return {
      status: 500,
      body: { message: 'Invalid internship fee settings value' },
    };
  }

  if (amountInPaise <= 0) {
    return {
      status: 200,
      body: {
        requires_payment: false,
        amount: 0,
        application_fee: internshipFeeRupees,
        currency: PAYMENT_CURRENCY,
      },
    };
  }

  const { keyId } = getRazorpayCredentials();
  const razorpayClient = getRazorpayClient();

  if (!keyId || !razorpayClient) {
    return {
      status: 500,
      body: {
        message: 'Razorpay credentials are missing on the server',
      },
    };
  }

  const order = await razorpayClient.orders.create({
    amount: amountInPaise,
    currency: PAYMENT_CURRENCY,
    receipt: `summer_internship_${Date.now()}`,
    notes: {
      source: 'summer_internship_application',
      applicant_email: applicantEmail,
      ...(isLateral
        ? {
          registration_type: 'lateral',
          ...(category ? { category } : {}),
        }
        : { registration_type: 'general' }),
    },
  });

  return {
    status: 201,
    body: {
      requires_payment: true,
      key_id: keyId,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      application_fee: internshipFeeRupees,
      is_lateral: isLateral,
    },
  };
}

async function verifyPaymentAndRegister(input) {
  const orderId = cleanText(input.razorpay_order_id);
  const paymentId = cleanText(input.razorpay_payment_id);
  const signature = cleanText(input.razorpay_signature);

  if (!orderId || !paymentId || !signature) {
    return {
      status: 400,
      body: {
        message:
          'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required',
      },
    };
  }

  const { keySecret } = getRazorpayCredentials();
  const razorpayClient = getRazorpayClient();

  if (!keySecret || !razorpayClient) {
    return {
      status: 500,
      body: {
        message: 'Razorpay credentials are missing on the server',
      },
    };
  }

  const validSignature = isValidRazorpaySignature({
    orderId,
    paymentId,
    signature,
    keySecret,
  });

  if (!validSignature) {
    return {
      status: 400,
      body: { message: 'Invalid payment signature' },
    };
  }

  let order = null;

  try {
    order = await razorpayClient.orders.fetch(orderId);
  } catch (err) {
    const reason = err instanceof Error ? cleanText(err.message) : '';
    return {
      status: 400,
      body: {
        message: 'Unable to validate order with Razorpay',
        ...(reason ? { reason } : {}),
      },
    };
  }

  const orderAmountInPaise = Number(order?.amount);
  if (!Number.isFinite(orderAmountInPaise) || orderAmountInPaise <= 0) {
    return {
      status: 400,
      body: { message: 'Invalid order amount received from Razorpay' },
    };
  }

  const orderCurrency = cleanText(order?.currency).toUpperCase() || PAYMENT_CURRENCY;

  if (orderCurrency !== PAYMENT_CURRENCY) {
    return {
      status: 400,
      body: {
        message: `Order currency mismatch. Expected ${PAYMENT_CURRENCY}, received ${orderCurrency || 'unknown'}`,
      },
    };
  }

  const { payment, fetchError } = await resolvePaymentFromOrderContext(
    razorpayClient,
    orderId,
    paymentId
  );

  if (!payment) {
    const reason = fetchError instanceof Error ? cleanText(fetchError.message) : '';
    return {
      status: 400,
      body: {
        message: 'Unable to validate payment with Razorpay',
        ...(reason ? { reason } : {}),
      },
    };
  }

  if (String(payment.order_id) !== orderId) {
    return {
      status: 400,
      body: { message: 'Payment does not belong to this order' },
    };
  }

  if (Number(payment.amount) !== orderAmountInPaise) {
    return {
      status: 400,
      body: { message: 'Paid amount does not match internship application fee' },
    };
  }

  const paymentCurrency = cleanText(payment.currency).toUpperCase() || orderCurrency;
  if (paymentCurrency !== orderCurrency) {
    return {
      status: 400,
      body: {
        message: `Payment currency mismatch. Expected ${orderCurrency}, received ${paymentCurrency || 'unknown'}`,
      },
    };
  }

  const paymentStatus = cleanText(payment.status).toLowerCase();
  if (!SUCCESSFUL_PAYMENT_STATUSES.has(paymentStatus)) {
    return {
      status: 400,
      body: {
        message: `Payment is not successful yet (status: ${paymentStatus || 'unknown'})`,
      },
    };
  }

  const registrationResult = await registerInternshipInternal(
    input,
    {
      payment_amount: orderAmountInPaise / 100,
      payment_currency: paymentCurrency,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      payment_status: cleanText(payment.status) || 'captured',
    },
    { requirePhoto: true }
  );

  if (registrationResult.status === 409) {
    return {
      status: 200,
      body: {
        message: 'Payment verified. You have already applied for this internship',
      },
    };
  }

  if (registrationResult.status !== 201) {
    return registrationResult;
  }

  return {
    status: 201,
    body: {
      message: 'Payment verified and internship application submitted successfully',
      payment: {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        status: payment.status,
      },
    },
  };
}

async function registerWithoutPayment(input) {
  const isLateral = toBoolean(input?.is_lateral ?? input?.isLateral ?? input?.islateral);
  const category = normalizeInternshipCategory(input?.category);
  const feeSettings = await readInternshipFeeSettings();
  const internshipFeeRupees = getApplicableInternshipFeeRupees(feeSettings, isLateral, category);
  const amountInPaise = toMoneyInPaise(internshipFeeRupees);
  const paymentStatus = normalizePaymentStatus(input?.payment_status);
  const isFailedAttempt = isFailedPaymentStatus(paymentStatus);
  const isTransientAttempt = isTransientPaymentStatus(paymentStatus);
  const isPaymentAttempt = isFailedAttempt || isTransientAttempt;
  let effectiveFailedAttempt = isFailedAttempt;

  if (amountInPaise === null) {
    return {
      status: 500,
      body: { message: 'Invalid internship fee settings value' },
    };
  }

  if (amountInPaise > 0 && !isPaymentAttempt) {
    return {
      status: 400,
      body: { message: 'Payment is required before internship application submission' },
    };
  }

  const providedOrderId = toNullableText(input?.razorpay_order_id);
  const providedPaymentId = toNullableText(input?.razorpay_payment_id);
  const razorpayClient = getRazorpayClient();

  let orderPaymentAmount = amountInPaise / 100;
  let orderPaymentCurrency = PAYMENT_CURRENCY;

  if (isPaymentAttempt && providedOrderId && razorpayClient) {
    try {
      const order = await razorpayClient.orders.fetch(providedOrderId);
      const orderAmountInPaise = Number(order?.amount);
      const orderCurrency = cleanText(order?.currency).toUpperCase();

      if (Number.isFinite(orderAmountInPaise) && orderAmountInPaise >= 0) {
        orderPaymentAmount = orderAmountInPaise / 100;
      }

      if (orderCurrency) {
        orderPaymentCurrency = orderCurrency;
      }
    } catch {
      // Keep fee-based fallback when order lookup is unavailable.
    }
  }

  let paymentInfo = {
    payment_amount: 0,
    payment_currency: PAYMENT_CURRENCY,
    razorpay_order_id: null,
    razorpay_payment_id: null,
    payment_status: 'not_required',
  };

  if (isFailedAttempt) {
    let upgradedSuccessfulPayment = null;

    if (providedOrderId) {
      if (razorpayClient) {
        try {
          if (providedPaymentId) {
            const resolved = await resolvePaymentFromOrderContext(
              razorpayClient,
              providedOrderId,
              providedPaymentId
            );

            const resolvedStatus = cleanText(resolved.payment?.status).toLowerCase();
            if (
              resolved.payment
              && String(resolved.payment.order_id) === providedOrderId
              && SUCCESSFUL_PAYMENT_STATUSES.has(resolvedStatus)
            ) {
              upgradedSuccessfulPayment = resolved.payment;
            }
          }

          if (!upgradedSuccessfulPayment) {
            const resolvedFromOrder = await resolveSuccessfulOrderPayment(
              razorpayClient,
              providedOrderId
            );

            if (
              resolvedFromOrder
              && String(resolvedFromOrder.order_id) === providedOrderId
            ) {
              upgradedSuccessfulPayment = resolvedFromOrder;
            }
          }
        } catch {
          // Keep fallback failed-attempt behavior when Razorpay lookup fails.
        }
      }
    }

    if (upgradedSuccessfulPayment) {
      effectiveFailedAttempt = false;

      const upgradedAmountInPaise = Number(upgradedSuccessfulPayment.amount);
      const upgradedCurrency = cleanText(upgradedSuccessfulPayment.currency).toUpperCase();
      const upgradedPaymentId = cleanText(upgradedSuccessfulPayment.id);
      const upgradedStatus = cleanText(upgradedSuccessfulPayment.status).toLowerCase();

      paymentInfo = {
        payment_amount:
          Number.isFinite(upgradedAmountInPaise) && upgradedAmountInPaise >= 0
            ? upgradedAmountInPaise / 100
            : amountInPaise / 100,
        payment_currency: upgradedCurrency || PAYMENT_CURRENCY,
        razorpay_order_id: providedOrderId,
        razorpay_payment_id: upgradedPaymentId || providedPaymentId,
        payment_status: upgradedStatus || 'captured',
      };
    } else {
      paymentInfo = {
        payment_amount: orderPaymentAmount,
        payment_currency: orderPaymentCurrency,
        razorpay_order_id: providedOrderId,
        razorpay_payment_id: providedPaymentId,
        payment_status: paymentStatus || 'failed',
      };
    }
  } else if (isTransientAttempt) {
    paymentInfo = {
      payment_amount: orderPaymentAmount,
      payment_currency: orderPaymentCurrency,
      razorpay_order_id: providedOrderId,
      razorpay_payment_id: providedPaymentId,
      payment_status: paymentStatus || 'pending',
    };
  }

  const shouldCreateUser = isCompletedRegistrationStatus(
    normalizePaymentStatus(paymentInfo.payment_status)
  );

  return registerInternshipInternal(
    input,
    paymentInfo,
    { requirePhoto: true, createUser: shouldCreateUser && !effectiveFailedAttempt }
  );
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseInternshipRegistrationId(rawId) {
  const parsed = Number.parseInt(String(rawId || ''), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function normalizeTransferPaymentStatus(value) {
  const normalized = normalizePaymentStatus(value);
  if (normalized === 'failed' || normalized === 'captured') {
    return normalized;
  }

  return null;
}

function mapInternshipApplicationRow(row) {
  return {
    ...row,
    is_lateral: toBoolean(row.is_lateral),
    declaration_accepted: toBoolean(row.declaration_accepted),
    has_passport_photo: toBoolean(row.has_passport_photo),
    payment_amount: toNumberOrNull(row.payment_amount),
  };
}

async function getInternshipApplicationById(id, connection = db) {
  const [rows] = await connection.query(
    `SELECT
      id,
      internship_name,
      internship_designation,
      full_name,
      guardian_name,
      gender,
      DATE_FORMAT(dob, '%Y-%m-%d') AS dob,
      mobile_number,
      email,
      alternative_email,
      address,
      city,
      state,
      pin_code,
      institution_name,
      educational_qualification,
      is_lateral,
      declaration_accepted,
      CASE WHEN passport_photo_path IS NULL THEN 0 ELSE 1 END AS has_passport_photo,
      passport_photo_path,
      passport_photo_mime_type,
      passport_photo_file_name,
      payment_amount,
      payment_currency,
      razorpay_order_id,
      razorpay_payment_id,
      payment_status,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM ${INTERNSHIP_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  if (!rows[0]) {
    return null;
  }

  return mapInternshipApplicationRow(rows[0]);
}

async function getInternshipRegistrations(options = {}) {
  const isExportAll = options.exportAll === true || options.exportAll === 'true';
  const page = Number(options.page) || 1;
  const pageSize = Number(options.pageSize) || 50;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = isExportAll
    ? null
    : (Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 200) : 50);
  const offset = isExportAll ? 0 : (safePage - 1) * safePageSize;

  const registrationType = String(options.registrationType || '').trim().toLowerCase();
  const paymentStatus = String(options.paymentStatus || '').trim().toLowerCase();
  const emailSearch = String(options.emailSearch || '').trim().toLowerCase();

  const whereClauses = [];
  const whereParams = [];

  if (registrationType === 'regular') {
    whereClauses.push('is_lateral = 0');
  } else if (registrationType === 'lateral') {
    whereClauses.push('is_lateral = 1');
  }

  if (paymentStatus && paymentStatus !== 'all') {
    whereClauses.push('LOWER(payment_status) = ?');
    whereParams.push(paymentStatus);
  }

  if (emailSearch) {
    whereClauses.push('LOWER(email) LIKE ?');
    whereParams.push(`%${emailSearch}%`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const [rows] = await db.query(
    `SELECT
      id,
      internship_name,
      internship_designation,
      full_name,
      guardian_name,
      gender,
      DATE_FORMAT(dob, '%Y-%m-%d') AS dob,
      mobile_number,
      email,
      alternative_email,
      address,
      city,
      state,
      pin_code,
      institution_name,
      educational_qualification,
      is_lateral,
      declaration_accepted,
      CASE WHEN passport_photo_path IS NULL THEN 0 ELSE 1 END AS has_passport_photo,
      passport_photo_path,
      passport_photo_mime_type,
      passport_photo_file_name,
      payment_amount,
      payment_currency,
      razorpay_order_id,
      razorpay_payment_id,
      payment_status,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM ${INTERNSHIP_TABLE}
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     ${isExportAll ? '' : 'LIMIT ? OFFSET ?'}`,
    isExportAll ? [...whereParams] : [...whereParams, safePageSize, offset]
  );

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM ${INTERNSHIP_TABLE}
     ${whereSql}`,
    whereParams
  );

  const total = Number(countRows?.[0]?.total || 0);
  const effectivePageSize = isExportAll ? total || 1 : safePageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

  return {
    status: 200,
    body: {
      applications: rows.map(mapInternshipApplicationRow),
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages,
    },
  };
}

async function getInternshipPassportPhotoPath(registrationId) {
  const [rows] = await db.query(
    `SELECT passport_photo_path
     FROM ${INTERNSHIP_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [registrationId]
  );

  if (!rows[0]) {
    return null;
  }

  return rows[0].passport_photo_path || null;
}

async function getInternshipFeeSettings() {
  const settings = await readInternshipFeeSettings();

  return {
    status: 200,
    body: settings,
  };
}

async function deleteInternshipRegistration(rawId) {
  const registrationId = parseInternshipRegistrationId(rawId);

  if (!registrationId) {
    return {
      status: 400,
      body: { message: 'Invalid internship registration id' },
    };
  }

  const existingApplication = await getInternshipApplicationById(registrationId);

  if (!existingApplication) {
    return {
      status: 404,
      body: { message: 'Internship registration not found' },
    };
  }

  await db.query(
    `DELETE FROM ${INTERNSHIP_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [registrationId]
  );

  return {
    status: 200,
    body: {
      message: 'Internship registration deleted successfully',
      application: existingApplication,
    },
  };
}

async function transferInternshipRegistrationPaymentStatus(rawId, input = {}) {
  const registrationId = parseInternshipRegistrationId(rawId);
  const targetPaymentStatus = normalizeTransferPaymentStatus(
    input.payment_status || input.paymentStatus || input.status
  );

  if (!registrationId) {
    return {
      status: 400,
      body: { message: 'Invalid internship registration id' },
    };
  }

  if (!targetPaymentStatus) {
    return {
      status: 400,
      body: {
        message: 'payment_status must be either failed or captured',
      },
    };
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const existingApplication = await getInternshipApplicationById(registrationId, connection);

    if (!existingApplication) {
      await connection.rollback();
      return {
        status: 404,
        body: { message: 'Internship registration not found' },
      };
    }

    const existingPaymentStatus = normalizePaymentStatus(existingApplication.payment_status);

    if (existingPaymentStatus === targetPaymentStatus) {
      await connection.rollback();
      return {
        status: 200,
        body: {
          message: `Payment status is already ${targetPaymentStatus}`,
          application: existingApplication,
        },
      };
    }

    await connection.query(
      `UPDATE ${INTERNSHIP_TABLE}
       SET payment_status = ?
       WHERE id = ?
       LIMIT 1`,
      [targetPaymentStatus, registrationId]
    );

    const updatedApplication = await getInternshipApplicationById(registrationId, connection);

    if (!updatedApplication) {
      await connection.rollback();
      return {
        status: 500,
        body: { message: 'Unable to read updated internship registration' },
      };
    }

    if (targetPaymentStatus === 'captured') {
      await createUserIfMissing(
        connection,
        updatedApplication.email,
        updatedApplication.full_name,
        updatedApplication.mobile_number
      );
    }

    await connection.commit();

    return {
      status: 200,
      body: {
        message: `Internship registration payment status updated to ${targetPaymentStatus}`,
        application: updatedApplication,
      },
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function updateInternshipFeeSettings(input) {
  const currentSettings = await readInternshipFeeSettings();

  const generalFee = parseFeeRupeesInput(
    input?.general_fee_rupees ?? input?.generalFeeRupees ?? input?.general_fee
  );
  const lateralFee = parseFeeRupeesInput(
    input?.lateral_fee_rupees ?? input?.lateralFeeRupees ?? input?.lateral_fee
  );

  const hasEwsLateralFeeInput =
    Object.prototype.hasOwnProperty.call(input || {}, 'ews_lateral_fee_rupees')
    || Object.prototype.hasOwnProperty.call(input || {}, 'ewsLateralFeeRupees')
    || Object.prototype.hasOwnProperty.call(input || {}, 'ews_lateral_fee');

  const ewsLateralFee = hasEwsLateralFeeInput
    ? parseFeeRupeesInput(
      input?.ews_lateral_fee_rupees
      ?? input?.ewsLateralFeeRupees
      ?? input?.ews_lateral_fee
    )
    : currentSettings.ews_lateral_fee_rupees;

  if (generalFee === null || lateralFee === null || ewsLateralFee === null) {
    return {
      status: 400,
      body: {
        message: 'general_fee_rupees, lateral_fee_rupees, and ews_lateral_fee_rupees must be non-negative numbers',
      },
    };
  }

  await ensureInternshipFeeSettingsSchema();

  await db.query(
    `UPDATE ${INTERNSHIP_FEE_SETTINGS_TABLE}
     SET general_fee_rupees = ?, lateral_fee_rupees = ?, ews_lateral_fee_rupees = ?
     WHERE id = 1`,
    [generalFee, lateralFee, ewsLateralFee]
  );

  return {
    status: 200,
    body: {
      message: 'Internship fee settings updated successfully',
      general_fee_rupees: generalFee,
      lateral_fee_rupees: lateralFee,
      ews_lateral_fee_rupees: ewsLateralFee,
    },
  };
}

module.exports = {
  createPaymentOrder,
  verifyPaymentAndRegister,
  registerWithoutPayment,
  getInternshipRegistrations,
  getInternshipPassportPhotoPath,
  getInternshipFeeSettings,
  updateInternshipFeeSettings,
  deleteInternshipRegistration,
  transferInternshipRegistrationPaymentStatus,
};
