const crypto = require('crypto');
const Razorpay = require('razorpay');

const db = require('../config/db');
const StudentRegistration = require('../models/StudentRegistration');

const SUMMER_SCHOOL_SETTINGS_TABLE = 'summer_school_registration_settings';
const DEFAULT_INDIAN_FEE_AMOUNT = 1350;
const DEFAULT_EWS_FEE_AMOUNT = 750;
const DEFAULT_OTHER_FEE_AMOUNT = 150;
const DEFAULT_BATCH_OPTIONS = Object.freeze([
  'Batch 1: 15th May - 30th June',
  'Batch 2: 19th June - 30th July',
]);
const GENERAL_CATEGORY = 'General Category';
const EWS_CATEGORY = 'EWS(Economically weaker section)';
const LEGACY_EWS_CATEGORY = 'EWS(Economily weaker section)';
const CATEGORY_OPTIONS = Object.freeze([GENERAL_CATEGORY, EWS_CATEGORY]);
const PAYMENT_STATUS_FAILED = 'failed';
const SUMMER_SCHOOL_PAYMENT_CURRENCIES = Object.freeze({
  Indian: 'INR',
  Other: 'USD',
});

const SUCCESSFUL_PAYMENT_STATUSES = new Set(['captured', 'authorized']);
const COMPLETED_PAYMENT_STATUSES = new Set(['captured', 'authorized', 'not_required']);
const TRANSIENT_PAYMENT_STATUSES = new Set(['created', 'pending']);
const PAYMENT_FETCH_RETRY_ATTEMPTS = 6;
const PAYMENT_FETCH_RETRY_DELAY_MS = 1200;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseStudentRegistrationId(rawId) {
  const numeric = Number(rawId);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return 0;
  }

  return numeric;
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function toMoneyInMinorUnits(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.round(numeric * 100);
}

function normalizeNationality(value) {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === 'indian') {
    return 'Indian';
  }

  if (normalized === 'other' || normalized === 'others') {
    return 'Other';
  }

  return '';
}

function normalizeCategory(value) {
  const normalized = cleanText(value).toLowerCase();

  if (normalized === 'genral' || normalized === 'general' || normalized === 'general category') {
    return GENERAL_CATEGORY;
  }

  if (
    normalized === EWS_CATEGORY.toLowerCase()
    || normalized === 'ews (economically weaker section)'
    || normalized === LEGACY_EWS_CATEGORY.toLowerCase()
    || normalized === 'ews (economily weaker section)'
  ) {
    return EWS_CATEGORY;
  }

  return '';
}

function normalizePaymentAttemptStatus(value) {
  const normalized = cleanText(value).toLowerCase();

  if (
    normalized === 'pending'
    || normalized === 'created'
    || normalized === 'order_created'
  ) {
    return 'pending';
  }

  if (normalized === 'failed' || normalized === 'payment_failed') {
    return PAYMENT_STATUS_FAILED;
  }

  if (
    normalized === 'cancelled'
    || normalized === 'canceled'
    || normalized === 'dismissed'
    || normalized === 'payment_cancelled'
  ) {
    return PAYMENT_STATUS_FAILED;
  }

  return '';
}

function normalizeStoredPaymentStatus(value) {
  const normalized = cleanText(value).toLowerCase();

  if (!normalized) {
    return '';
  }

  if (normalized === 'cancelled' || normalized === 'canceled') {
    return PAYMENT_STATUS_FAILED;
  }

  if (normalized === 'success') {
    return 'captured';
  }

  return normalized;
}

function isCompletedPaymentStatus(value) {
  const normalized = normalizeStoredPaymentStatus(value);
  return COMPLETED_PAYMENT_STATUSES.has(normalized);
}

async function findLatestOpenStudentAttempt(connection, email, orderId) {
  if (orderId) {
    const [rows] = await connection.query(
      `SELECT id, payment_status
       FROM ${StudentRegistration.STUDENT_REGISTRATION_TABLE}
       WHERE LOWER(email) = LOWER(?)
         AND razorpay_order_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [email, orderId]
    );

    const row = rows[0] || null;
    if (row && !isCompletedPaymentStatus(row.payment_status)) {
      return row;
    }
  }

  const [rows] = await connection.query(
    `SELECT id, payment_status
     FROM ${StudentRegistration.STUDENT_REGISTRATION_TABLE}
     WHERE LOWER(email) = LOWER(?)
       AND (
         payment_status IS NULL
         OR LOWER(payment_status) NOT IN ('captured', 'authorized', 'not_required')
       )
     ORDER BY id DESC
     LIMIT 1`,
    [email]
  );

  const row = rows[0] || null;
  if (!row) {
    return null;
  }

  return isCompletedPaymentStatus(row.payment_status) ? null : row;
}

async function upsertStudentPaymentAttempt(normalizedPayload, paymentDetails) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const orderId = cleanText(paymentDetails?.razorpay_order_id);
    const existingAttempt = await findLatestOpenStudentAttempt(
      connection,
      normalizedPayload.email,
      orderId
    );

    if (existingAttempt) {
      await connection.query(
        `UPDATE ${StudentRegistration.STUDENT_REGISTRATION_TABLE}
         SET full_name = ?,
             dob = ?,
             category = ?,
             alternative_email = ?,
             grade = ?,
             school = ?,
             board = ?,
             nationality = ?,
             gender = ?,
             guardian_name = ?,
             relationship = ?,
             guardian_email = ?,
             guardian_phone = ?,
             alt_phone = ?,
             batch = ?,
             experience = ?,
             guidelines_accepted = ?,
             conduct_accepted = ?,
             payment_amount = ?,
             payment_currency = ?,
             razorpay_order_id = ?,
             razorpay_payment_id = ?,
             payment_status = ?,
             payment_mode = ?
         WHERE id = ?
         LIMIT 1`,
        [
          normalizedPayload.full_name,
          normalizedPayload.dob,
          normalizedPayload.category,
          normalizedPayload.alternative_email,
          normalizedPayload.grade,
          normalizedPayload.school,
          normalizedPayload.board,
          normalizedPayload.nationality,
          normalizedPayload.gender,
          normalizedPayload.guardian_name,
          normalizedPayload.relationship,
          normalizedPayload.guardian_email,
          normalizedPayload.guardian_phone,
          normalizedPayload.alt_phone,
          normalizedPayload.batch,
          normalizedPayload.experience,
          normalizedPayload.guidelines_accepted,
          normalizedPayload.conduct_accepted,
          paymentDetails?.payment_amount ?? null,
          paymentDetails?.payment_currency || null,
          paymentDetails?.razorpay_order_id || null,
          paymentDetails?.razorpay_payment_id || null,
          paymentDetails?.payment_status || null,
          paymentDetails?.payment_mode || null,
          Number(existingAttempt.id),
        ]
      );

      const [updatedRows] = await connection.query(
        `SELECT *
         FROM ${StudentRegistration.STUDENT_REGISTRATION_TABLE}
         WHERE id = ?
         LIMIT 1`,
        [Number(existingAttempt.id)]
      );

      await connection.commit();
      return updatedRows[0] || null;
    }

    const created = await StudentRegistration.createStudentRegistration(
      {
        ...normalizedPayload,
        payment_amount: paymentDetails?.payment_amount ?? null,
        payment_currency: paymentDetails?.payment_currency || null,
        razorpay_order_id: paymentDetails?.razorpay_order_id || null,
        razorpay_payment_id: paymentDetails?.razorpay_payment_id || null,
        payment_status: paymentDetails?.payment_status || null,
        payment_mode: paymentDetails?.payment_mode || null,
      },
      connection
    );

    await connection.commit();
    return created;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function reconcilePendingStudentRegistrationByEmail(email, connection = db) {
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
       payment_status,
       razorpay_order_id,
       razorpay_payment_id
     FROM ${StudentRegistration.STUDENT_REGISTRATION_TABLE}
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

  const paymentAmountInMinorUnits = Number(successfulPayment.amount);
  const paymentAmount =
    Number.isFinite(paymentAmountInMinorUnits) && paymentAmountInMinorUnits >= 0
      ? paymentAmountInMinorUnits / 100
      : null;
  const paymentCurrency = cleanText(successfulPayment.currency).toUpperCase() || null;
  const paymentId = cleanText(successfulPayment.id) || existingPaymentId || null;
  const paymentStatus = cleanText(successfulPayment.status) || 'captured';
  const paymentMode = cleanText(successfulPayment.method) || 'gateway_verified';

  await connection.query(
    `UPDATE ${StudentRegistration.STUDENT_REGISTRATION_TABLE}
     SET payment_amount = ?,
         payment_currency = ?,
         razorpay_order_id = ?,
         razorpay_payment_id = ?,
         payment_status = ?,
         payment_mode = ?
     WHERE id = ?
     LIMIT 1`,
    [
      paymentAmount,
      paymentCurrency,
      orderId,
      paymentId,
      paymentStatus,
      paymentMode,
      Number(attempt.id),
    ]
  );

  return true;
}

function toFeeAmount(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }

  return Number(numeric.toFixed(2));
}

function parseFeeAmountInput(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Number(numeric.toFixed(2));
}

function normalizeBatchOptions(rawOptions) {
  const source = Array.isArray(rawOptions) ? rawOptions : [];
  const normalized = source
    .map((option) => cleanText(option))
    .filter(Boolean);

  return [...new Set(normalized)];
}

function parseBatchOptionsInput(value) {
  if (Array.isArray(value)) {
    return normalizeBatchOptions(value);
  }

  if (typeof value === 'string') {
    const options = value
      .split(/\r?\n/)
      .map((option) => option.trim())
      .filter(Boolean);

    return normalizeBatchOptions(options);
  }

  return [];
}

async function ensureSummerSchoolSettingsSchema(connection = db) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS ${SUMMER_SCHOOL_SETTINGS_TABLE} (
      id TINYINT PRIMARY KEY,
      indian_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 1350.00,
      ews_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 750.00,
      other_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 150.00,
      batch_options_json TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  );

  const [ewsFeeColumn] = await connection.query(
    `SHOW COLUMNS FROM ${SUMMER_SCHOOL_SETTINGS_TABLE} LIKE 'ews_fee_amount'`
  );

  const ewsFeeColumnMissing = ewsFeeColumn.length === 0;

  if (ewsFeeColumnMissing) {
    await connection.query(
      `ALTER TABLE ${SUMMER_SCHOOL_SETTINGS_TABLE}
       ADD COLUMN ews_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 750.00 AFTER indian_fee_amount`
    );
  }

  await connection.query(
    `INSERT INTO ${SUMMER_SCHOOL_SETTINGS_TABLE} (id, indian_fee_amount, ews_fee_amount, other_fee_amount, batch_options_json)
     VALUES (1, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      DEFAULT_INDIAN_FEE_AMOUNT,
      DEFAULT_EWS_FEE_AMOUNT,
      DEFAULT_OTHER_FEE_AMOUNT,
      JSON.stringify(DEFAULT_BATCH_OPTIONS),
    ]
  );

  if (ewsFeeColumnMissing) {
    await connection.query(
      `UPDATE ${SUMMER_SCHOOL_SETTINGS_TABLE}
       SET indian_fee_amount = ?
       WHERE id = 1 AND (indian_fee_amount IS NULL OR indian_fee_amount = 1750.00)`,
      [DEFAULT_INDIAN_FEE_AMOUNT]
    );
  }

  await connection.query(
    `UPDATE ${SUMMER_SCHOOL_SETTINGS_TABLE}
     SET ews_fee_amount = ?
     WHERE id = 1 AND (ews_fee_amount IS NULL OR ews_fee_amount <= 0)`,
    [DEFAULT_EWS_FEE_AMOUNT]
  );
}

function parseStoredBatchOptions(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return [...DEFAULT_BATCH_OPTIONS];
  }

  try {
    const parsed = JSON.parse(rawValue);
    const normalized = normalizeBatchOptions(parsed);
    return normalized.length > 0 ? normalized : [...DEFAULT_BATCH_OPTIONS];
  } catch {
    return [...DEFAULT_BATCH_OPTIONS];
  }
}

async function readSummerSchoolSettings(connection = db) {
  await ensureSummerSchoolSettingsSchema(connection);

  const [rows] = await connection.query(
    `SELECT indian_fee_amount, ews_fee_amount, other_fee_amount, batch_options_json
     FROM ${SUMMER_SCHOOL_SETTINGS_TABLE}
     WHERE id = 1
     LIMIT 1`
  );

  const row = rows[0] || {};

  return {
    indian_fee_amount: toFeeAmount(row.indian_fee_amount, DEFAULT_INDIAN_FEE_AMOUNT),
    ews_fee_amount: toFeeAmount(row.ews_fee_amount, DEFAULT_EWS_FEE_AMOUNT),
    other_fee_amount: toFeeAmount(row.other_fee_amount, DEFAULT_OTHER_FEE_AMOUNT),
    batch_options: parseStoredBatchOptions(row.batch_options_json),
  };
}

function resolveSummerSchoolPaymentConfig(nationality, category, settings) {
  const normalizedNationality = normalizeNationality(nationality);
  if (!normalizedNationality) {
    return null;
  }

  const normalizedCategory = normalizeCategory(category);

  let amount = settings.other_fee_amount;

  if (normalizedNationality === 'Indian') {
    if (!CATEGORY_OPTIONS.includes(normalizedCategory)) {
      return null;
    }

    amount = normalizedCategory === EWS_CATEGORY
      ? settings.ews_fee_amount
      : settings.indian_fee_amount;
  }

  const currency = SUMMER_SCHOOL_PAYMENT_CURRENCIES[normalizedNationality];

  return {
    nationality: normalizedNationality,
    category: normalizedCategory || GENERAL_CATEGORY,
    amount,
    currency,
  };
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
    const matchingPayment = items.find((item) => cleanText(item?.id) === paymentId);

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

async function registerStudent(payload) {
  await StudentRegistration.ensureStudentRegistrationTable();

  const {
    payload: normalizedPayload,
    errors,
  } = StudentRegistration.normalizeStudentRegistrationPayload(payload || {});

  if (errors.length > 0) {
    return {
      status: 400,
      body: {
        success: false,
        message: errors.join('. '),
        errors,
      },
    };
  }

  const registration = await StudentRegistration.createStudentRegistration({
    ...normalizedPayload,
    payment_status: 'not_required',
    payment_mode: 'not_required',
  });

  return {
    status: 200,
    body: {
      success: true,
      message: 'Student registration submitted successfully',
      data: registration,
    },
  };
}

async function logPaymentAttempt(payload) {
  await StudentRegistration.ensureStudentRegistrationTable();

  const {
    payload: normalizedPayload,
    errors,
  } = StudentRegistration.normalizeStudentRegistrationPayload(payload || {});

  if (errors.length > 0) {
    return {
      status: 400,
      body: {
        success: false,
        message: errors.join('. '),
        errors,
      },
    };
  }

  const paymentStatus = normalizePaymentAttemptStatus(
    payload?.payment_status || payload?.status
  );

  if (!paymentStatus) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'payment_status must be failed, cancelled/dismissed, or pending/created',
      },
    };
  }

  if (await StudentRegistration.isStudentEmailTaken(normalizedPayload.email)) {
    return {
      status: 200,
      body: {
        success: true,
        already_registered: true,
        message: 'Email already registered for summer school.',
      },
    };
  }

  const providedOrderId = cleanText(payload?.razorpay_order_id);
  const providedPaymentId = cleanText(payload?.razorpay_payment_id);

  let upgradedSuccessfulPayment = null;

  if (paymentStatus === PAYMENT_STATUS_FAILED && providedOrderId) {
    const razorpayClient = getRazorpayClient();

    if (razorpayClient) {
      let orderBelongsToApplicant = true;

      try {
        const order = await razorpayClient.orders.fetch(providedOrderId);
        const orderApplicantEmail = normalizeEmail(order?.notes?.applicant_email);

        if (orderApplicantEmail && orderApplicantEmail !== normalizedPayload.email) {
          orderBelongsToApplicant = false;
        }
      } catch {
        // Ignore order fetch errors for failed-attempt persistence fallback.
      }

      if (orderBelongsToApplicant) {
        if (providedPaymentId) {
          try {
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
          } catch {
            // Ignore reconciliation fetch errors and keep failed-attempt fallback.
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
      }
    }
  }

  if (upgradedSuccessfulPayment) {
    const reconciledAmountMinorUnits = Number(upgradedSuccessfulPayment.amount);
    const reconciledCurrency = cleanText(upgradedSuccessfulPayment.currency).toUpperCase();
    const reconciledPaymentId = cleanText(upgradedSuccessfulPayment.id);
    const reconciledStatus = cleanText(upgradedSuccessfulPayment.status).toLowerCase();
    const reconciledMethod = cleanText(upgradedSuccessfulPayment.method);

    const reconciledRegistration = await upsertStudentPaymentAttempt(normalizedPayload, {
      payment_amount:
        Number.isFinite(reconciledAmountMinorUnits) && reconciledAmountMinorUnits >= 0
          ? reconciledAmountMinorUnits / 100
          : null,
      payment_currency: reconciledCurrency || null,
      razorpay_order_id: providedOrderId,
      razorpay_payment_id: reconciledPaymentId || providedPaymentId,
      payment_status: reconciledStatus || 'captured',
      payment_mode: reconciledMethod || 'gateway_verified',
    });

    return {
      status: 201,
      body: {
        success: true,
        message: 'Payment attempt reconciled and student registration stored successfully',
        data: reconciledRegistration,
      },
    };
  }

  const settings = await readSummerSchoolSettings();
  const paymentConfig = resolveSummerSchoolPaymentConfig(
    normalizedPayload.nationality,
    normalizedPayload.category,
    settings
  );

  if (!paymentConfig) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Unable to resolve fee for selected nationality and category',
      },
    };
  }

  const normalizedAttemptStatus = paymentStatus === 'pending' ? 'pending' : PAYMENT_STATUS_FAILED;

  const registration = await upsertStudentPaymentAttempt(normalizedPayload, {
    payment_amount: paymentConfig.amount,
    payment_currency: paymentConfig.currency,
    razorpay_order_id: providedOrderId,
    razorpay_payment_id: providedPaymentId,
    payment_status: normalizedAttemptStatus,
    payment_mode:
      cleanText(payload?.payment_mode)
      || (normalizedAttemptStatus === 'pending' ? 'order_created' : 'gateway_failed'),
  });

  return {
    status: 201,
    body: {
      success: true,
      message:
        normalizedAttemptStatus === 'pending'
          ? 'Payment attempt saved with pending status'
          : 'Failed payment attempt stored successfully',
      data: registration,
    },
  };
}

async function createPaymentOrder(payload) {
  await StudentRegistration.ensureStudentRegistrationTable();

  const email = normalizeEmail(payload?.email);
  const normalizedNationality = normalizeNationality(payload?.nationality);
  const normalizedCategory = normalizeCategory(payload?.category);
  const settings = await readSummerSchoolSettings();
  const paymentConfig = resolveSummerSchoolPaymentConfig(
    normalizedNationality,
    normalizedCategory,
    settings
  );

  if (!email) {
    return {
      status: 400,
      body: { message: 'email is required' },
    };
  }

  if (!EMAIL_REGEX.test(email)) {
    return {
      status: 400,
      body: { message: 'Invalid email format' },
    };
  }

  if (!normalizedNationality) {
    return {
      status: 400,
      body: { message: 'nationality must be Indian or Other' },
    };
  }

  if (normalizedNationality === 'Indian' && !CATEGORY_OPTIONS.includes(normalizedCategory)) {
    return {
      status: 400,
      body: {
        message: `category must be one of: ${CATEGORY_OPTIONS.join(', ')}`,
      },
    };
  }

  if (!paymentConfig) {
    return {
      status: 400,
      body: { message: 'Unable to resolve payment configuration for the selected category' },
    };
  }

  if (await StudentRegistration.isStudentEmailTaken(email)) {
    return {
      status: 200,
      body: {
        requires_payment: false,
        already_registered: true,
        amount: 0,
        currency: paymentConfig.currency,
        message: 'Email already registered for summer school.',
      },
    };
  }

  try {
    await reconcilePendingStudentRegistrationByEmail(email);
  } catch {
    // Best effort only: do not block order creation if reconciliation lookup fails.
  }

  if (await StudentRegistration.isStudentEmailTaken(email)) {
    return {
      status: 200,
      body: {
        requires_payment: false,
        already_registered: true,
        amount: 0,
        currency: paymentConfig.currency,
        message: 'Email already registered for summer school.',
      },
    };
  }

  const amountInMinorUnits = toMoneyInMinorUnits(paymentConfig.amount);
  if (amountInMinorUnits === null || amountInMinorUnits <= 0) {
    return {
      status: 500,
      body: { message: 'Invalid summer school registration fee configuration' },
    };
  }

  const { keyId } = getRazorpayCredentials();
  const razorpayClient = getRazorpayClient();

  if (!keyId || !razorpayClient) {
    return {
      status: 500,
      body: { message: 'Razorpay credentials are missing on the server' },
    };
  }

  const order = await razorpayClient.orders.create({
    amount: amountInMinorUnits,
    currency: paymentConfig.currency,
    receipt: `summer_school_student_${Date.now()}`,
    notes: {
      source: 'summer_school_student_registration',
      applicant_email: email,
      nationality: paymentConfig.nationality,
      category: paymentConfig.category,
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
      registration_fee: paymentConfig.amount,
      nationality: paymentConfig.nationality,
      category: paymentConfig.category,
    },
  };
}

async function verifyPaymentAndRegister(payload) {
  await StudentRegistration.ensureStudentRegistrationTable();

  const {
    payload: normalizedPayload,
    errors,
  } = StudentRegistration.normalizeStudentRegistrationPayload(payload || {});

  if (errors.length > 0) {
    return {
      status: 400,
      body: {
        message: errors.join('. '),
        errors,
      },
    };
  }

  const orderId = cleanText(payload?.razorpay_order_id);
  const paymentId = cleanText(payload?.razorpay_payment_id);
  const signature = cleanText(payload?.razorpay_signature);

  if (!orderId || !paymentId || !signature) {
    return {
      status: 400,
      body: {
        message: 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required',
      },
    };
  }

  const normalizedNationality = normalizeNationality(normalizedPayload.nationality);
  const expectedCurrency = SUMMER_SCHOOL_PAYMENT_CURRENCIES[normalizedNationality];

  if (!expectedCurrency) {
    return {
      status: 400,
      body: { message: 'Unable to resolve payment currency for selected nationality' },
    };
  }

  const { keySecret } = getRazorpayCredentials();
  const razorpayClient = getRazorpayClient();

  if (!keySecret || !razorpayClient) {
    return {
      status: 500,
      body: { message: 'Razorpay credentials are missing on the server' },
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

  const orderAmountInMinorUnits = Number(order?.amount);
  if (!Number.isFinite(orderAmountInMinorUnits) || orderAmountInMinorUnits <= 0) {
    return {
      status: 400,
      body: { message: 'Invalid order amount received from Razorpay' },
    };
  }

  const orderCurrency = cleanText(order?.currency).toUpperCase();
  if (orderCurrency !== expectedCurrency) {
    return {
      status: 400,
      body: {
        message: `Order currency mismatch. Expected ${expectedCurrency}, received ${orderCurrency || 'unknown'}`,
      },
    };
  }

  const orderApplicantEmail = normalizeEmail(order?.notes?.applicant_email);
  if (orderApplicantEmail && orderApplicantEmail !== normalizedPayload.email) {
    return {
      status: 400,
      body: { message: 'Order does not belong to the provided email address' },
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

  if (Number(payment.amount) !== orderAmountInMinorUnits) {
    return {
      status: 400,
      body: { message: 'Paid amount does not match summer school registration fee' },
    };
  }

  const paymentCurrency = cleanText(payment.currency).toUpperCase();
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

  if (await StudentRegistration.isStudentEmailTaken(normalizedPayload.email)) {
    return {
      status: 200,
      body: {
        success: true,
        message: 'Payment verified. Email already registered for summer school.',
        payment: {
          amount: Number(payment.amount) / 100,
          currency: paymentCurrency,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          status: cleanText(payment.status) || 'captured',
          mode: cleanText(payment.method) || null,
        },
      },
    };
  }

  const registration = await upsertStudentPaymentAttempt(normalizedPayload, {
    payment_amount: Number(payment.amount) / 100,
    payment_currency: paymentCurrency,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    payment_status: cleanText(payment.status) || 'captured',
    payment_mode: cleanText(payment.method) || null,
  });

  return {
    status: 201,
    body: {
      success: true,
      message: 'Payment verified and student registration submitted successfully',
      data: registration,
      payment: {
        amount: Number(payment.amount) / 100,
        currency: paymentCurrency,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        status: cleanText(payment.status) || 'captured',
        mode: cleanText(payment.method) || null,
      },
    },
  };
}

async function listStudentRegistrations(options = {}) {
  await StudentRegistration.ensureStudentRegistrationTable();
  const result = await StudentRegistration.getStudentRegistrations(options);

  return {
    status: 200,
    body: {
      success: true,
      data: result.data,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
  };
}

async function deleteStudentRegistration(rawId) {
  await StudentRegistration.ensureStudentRegistrationTable();

  const registrationId = parseStudentRegistrationId(rawId);

  if (!registrationId) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Invalid summer school registration id',
      },
    };
  }

  const [rows] = await db.query(
    `SELECT id, full_name, email
     FROM ${StudentRegistration.STUDENT_REGISTRATION_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [registrationId]
  );

  const existing = rows[0] || null;

  if (!existing) {
    return {
      status: 404,
      body: {
        success: false,
        message: 'Summer school registration not found',
      },
    };
  }

  await db.query(
    `DELETE FROM ${StudentRegistration.STUDENT_REGISTRATION_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [registrationId]
  );

  return {
    status: 200,
    body: {
      success: true,
      message: 'Summer school registration deleted successfully',
      data: {
        id: Number(existing.id),
        full_name: cleanText(existing.full_name),
        email: cleanText(existing.email),
      },
    },
  };
}

async function getSummerSchoolRegistrationSettings() {
  const settings = await readSummerSchoolSettings();

  return {
    status: 200,
    body: settings,
  };
}

async function updateSummerSchoolRegistrationSettings(payload) {
  const currentSettings = await readSummerSchoolSettings();

  const hasIndianFee = Object.prototype.hasOwnProperty.call(payload || {}, 'indian_fee_amount');
  const hasEwsFee = Object.prototype.hasOwnProperty.call(payload || {}, 'ews_fee_amount');
  const hasOtherFee = Object.prototype.hasOwnProperty.call(payload || {}, 'other_fee_amount');
  const hasBatchOptions = Object.prototype.hasOwnProperty.call(payload || {}, 'batch_options');

  const indianFeeAmount = hasIndianFee
    ? parseFeeAmountInput(payload.indian_fee_amount)
    : currentSettings.indian_fee_amount;
  const ewsFeeAmount = hasEwsFee
    ? parseFeeAmountInput(payload.ews_fee_amount)
    : currentSettings.ews_fee_amount;
  const otherFeeAmount = hasOtherFee
    ? parseFeeAmountInput(payload.other_fee_amount)
    : currentSettings.other_fee_amount;
  const batchOptions = hasBatchOptions
    ? parseBatchOptionsInput(payload.batch_options)
    : currentSettings.batch_options;

  if (indianFeeAmount === null || ewsFeeAmount === null || otherFeeAmount === null) {
    return {
      status: 400,
      body: {
        message: 'indian_fee_amount, ews_fee_amount, and other_fee_amount must be non-negative numbers',
      },
    };
  }

  if (batchOptions.length === 0) {
    return {
      status: 400,
      body: {
        message: 'At least one batch option is required',
      },
    };
  }

  await ensureSummerSchoolSettingsSchema();

  await db.query(
    `UPDATE ${SUMMER_SCHOOL_SETTINGS_TABLE}
     SET indian_fee_amount = ?, ews_fee_amount = ?, other_fee_amount = ?, batch_options_json = ?
     WHERE id = 1`,
    [indianFeeAmount, ewsFeeAmount, otherFeeAmount, JSON.stringify(batchOptions)]
  );

  const updatedSettings = await readSummerSchoolSettings();

  return {
    status: 200,
    body: {
      ...updatedSettings,
      message: 'Summer school registration settings updated successfully',
    },
  };
}

module.exports = {
  registerStudent,
  logPaymentAttempt,
  createPaymentOrder,
  verifyPaymentAndRegister,
  listStudentRegistrations,
  deleteStudentRegistration,
  getSummerSchoolRegistrationSettings,
  updateSummerSchoolRegistrationSettings,
};