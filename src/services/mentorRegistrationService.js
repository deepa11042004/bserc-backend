const crypto = require('crypto');
const Razorpay = require('razorpay');

const db = require('../config/db');
const {
  uploadMentorResume,
  uploadMentorProfilePhoto,
} = require('./s3StorageService');

const MENTOR_REGISTRATION_TABLE = 'mentor_registrations';
const FILE_COLUMNS = new Set(['resume', 'profile_photo']);
const MENTOR_STATUS_PENDING = 'pending';
const MENTOR_STATUS_ACTIVE = 'active';
const VALID_MENTOR_STATUSES = new Set([MENTOR_STATUS_PENDING, MENTOR_STATUS_ACTIVE]);
const ALLOWED_MENTOR_NATIONALITIES = new Set(['Indian', 'Others']);
const MENTOR_REGISTRATION_FEES = Object.freeze({
  Indian: {
    amount: 1000,
    currency: 'INR',
  },
  Others: {
    amount: 150,
    currency: 'USD',
  },
});
const SUCCESSFUL_PAYMENT_STATUSES = new Set(['captured', 'authorized']);
const COMPLETED_PAYMENT_STATUSES = new Set(['captured', 'authorized', 'not_required']);
const TRANSIENT_PAYMENT_STATUSES = new Set(['created', 'pending']);
const PAYMENT_STATUS_FAILED = 'failed';
const PAYMENT_FETCH_RETRY_ATTEMPTS = 6;
const PAYMENT_FETCH_RETRY_DELAY_MS = 1200;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OPTIONAL_MENTOR_COLUMNS = [
  'nationality',
  'currency',
  'honorarium_hourly',
  'honorarium_daily',
  'honorarium_weekly',
  'honorarium_project',
  'payment_amount',
  'payment_currency',
  'razorpay_order_id',
  'razorpay_payment_id',
  'payment_status',
  'payment_mode',
];
const MENTOR_FILE_S3_COLUMNS = [
  'resume_path',
  'profile_photo_path',
];
const FILE_COALESCE_COLUMNS = new Set([
  'resume_path',
  'profile_photo_path',
]);
const MENTOR_REGISTRATION_BASE_COLUMNS = [
  'full_name',
  'email',
  'phone',
  'dob',
  'current_position',
  'organization',
  'years_experience',
  'professional_bio',
  'primary_track',
  'secondary_skills',
  'key_competencies',
  'video_call',
  'phone_call',
  'live_chat',
  'email_support',
  'availability',
  'max_students',
  'session_duration',
  'consultation_fee',
  'price_5_sessions',
  'price_10_sessions',
  'price_extended',
  'complimentary_session',
  'linkedin_url',
  'portfolio_url',
  'has_mentored_before',
  'mentoring_experience',
  'accepted_guidelines',
  'accepted_code_of_conduct',
];

let mentorTableColumnsPromise = null;

const BASE_MENTOR_DETAIL_COLUMNS = [
  'id',
  'full_name',
  'email',
  'phone',
  'dob',
  'current_position',
  'organization',
  'years_experience',
  'professional_bio',
  'primary_track',
  'secondary_skills',
  'key_competencies',
  'video_call',
  'phone_call',
  'live_chat',
  'email_support',
  'availability',
  'max_students',
  'session_duration',
  'consultation_fee',
  'price_5_sessions',
  'price_10_sessions',
  'price_extended',
  'complimentary_session',
  'linkedin_url',
  'portfolio_url',
  'has_mentored_before',
  'mentoring_experience',
  'accepted_guidelines',
  'accepted_code_of_conduct',
];

function cleanText(value) {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : '';
  }

  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function normalizeMentorNationality(value) {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === 'indian') {
    return 'Indian';
  }

  if (normalized === 'other' || normalized === 'others') {
    return 'Others';
  }

  return '';
}

function resolveMentorPaymentConfig(nationality) {
  const normalizedNationality = normalizeMentorNationality(nationality);

  if (!ALLOWED_MENTOR_NATIONALITIES.has(normalizedNationality)) {
    return null;
  }

  return {
    nationality: normalizedNationality,
    amount: MENTOR_REGISTRATION_FEES[normalizedNationality].amount,
    currency: MENTOR_REGISTRATION_FEES[normalizedNationality].currency,
  };
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

  if (
    normalized === 'failed'
    || normalized === 'failure'
    || normalized === 'payment_failed'
    || normalized === 'cancelled'
    || normalized === 'canceled'
    || normalized === 'payment_cancelled'
    || normalized === 'dismissed'
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

  if (normalized === 'success') {
    return 'captured';
  }

  if (normalized === 'cancelled' || normalized === 'canceled') {
    return PAYMENT_STATUS_FAILED;
  }

  return normalized;
}

function isCompletedPaymentStatus(value) {
  return COMPLETED_PAYMENT_STATUSES.has(normalizeStoredPaymentStatus(value));
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

function toMajorUnits(valueInMinorUnits, fallback = null) {
  const numeric = Number(valueInMinorUnits);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }

  return numeric / 100;
}

function getMentorWritableColumns(mentorTableColumns) {
  if (!mentorTableColumns) {
    return [...MENTOR_REGISTRATION_BASE_COLUMNS];
  }

  return [...MENTOR_REGISTRATION_BASE_COLUMNS, ...OPTIONAL_MENTOR_COLUMNS, ...MENTOR_FILE_S3_COLUMNS].filter((column) =>
    mentorTableColumns.has(column)
  );
}

function hasMentorS3Columns(mentorTableColumns) {
  if (!mentorTableColumns) {
    return false;
  }

  return MENTOR_FILE_S3_COLUMNS.every((column) => mentorTableColumns.has(column));
}

function normalizeMimeType(value, fallback = 'application/octet-stream') {
  const normalized = cleanText(value).toLowerCase();
  return normalized || fallback;
}

function normalizeFileName(value, fallback) {
  const normalized = cleanText(value);
  return normalized || fallback;
}

async function prepareMentorPayloadBeforePersist(payload, mentorTableColumns) {
  const nextPayload = {
    ...payload,
  };

  if (!hasMentorS3Columns(mentorTableColumns)) {
    return nextPayload;
  }

  const normalizedEmail = normalizeEmail(payload?.email);

  if (Buffer.isBuffer(payload?.resume)) {
    const resumeMimeType = normalizeMimeType(payload?.resume_mime_type);
    const resumeFileName = normalizeFileName(payload?.resume_file_name, 'mentor-resume');
    const uploadResult = await uploadMentorResume({
      buffer: payload.resume,
      mimeType: resumeMimeType,
      originalName: resumeFileName,
      email: normalizedEmail,
    });

    nextPayload.resume_path = uploadResult.s3Path;
  }

  if (Buffer.isBuffer(payload?.profile_photo)) {
    const profilePhotoMimeType = normalizeMimeType(payload?.profile_photo_mime_type);
    const profilePhotoFileName = normalizeFileName(payload?.profile_photo_file_name, 'mentor-profile-photo');
    const uploadResult = await uploadMentorProfilePhoto({
      buffer: payload.profile_photo,
      mimeType: profilePhotoMimeType,
      originalName: profilePhotoFileName,
      email: normalizedEmail,
    });

    nextPayload.profile_photo_path = uploadResult.s3Path;
  }

  return nextPayload;
}

function toBoolean(value) {
  return value === true || value === 1;
}

function mapMentorDetails(row) {
  return {
    id: Number(row.id),
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    dob: row.dob,
    nationality: typeof row.nationality === 'string' && row.nationality.trim()
      ? row.nationality
      : null,
    current_position: row.current_position,
    organization: row.organization,
    years_experience: row.years_experience,
    professional_bio: row.professional_bio,
    primary_track: row.primary_track,
    secondary_skills: row.secondary_skills,
    key_competencies: row.key_competencies,
    video_call: toBoolean(row.video_call),
    phone_call: toBoolean(row.phone_call),
    live_chat: toBoolean(row.live_chat),
    email_support: toBoolean(row.email_support),
    availability: row.availability,
    max_students: row.max_students,
    session_duration: row.session_duration,
    currency: typeof row.currency === 'string' && row.currency.trim()
      ? row.currency
      : null,
    honorarium_hourly:
      row.honorarium_hourly === null || row.honorarium_hourly === undefined
        ? null
        : Number(row.honorarium_hourly),
    honorarium_daily:
      row.honorarium_daily === null || row.honorarium_daily === undefined
        ? null
        : Number(row.honorarium_daily),
    honorarium_weekly:
      row.honorarium_weekly === null || row.honorarium_weekly === undefined
        ? null
        : Number(row.honorarium_weekly),
    honorarium_project:
      row.honorarium_project === null || row.honorarium_project === undefined
        ? null
        : Number(row.honorarium_project),
    payment_amount:
      row.payment_amount === null || row.payment_amount === undefined
        ? null
        : Number(row.payment_amount),
    payment_currency:
      typeof row.payment_currency === 'string' && row.payment_currency.trim()
        ? row.payment_currency
        : null,
    razorpay_order_id:
      typeof row.razorpay_order_id === 'string' && row.razorpay_order_id.trim()
        ? row.razorpay_order_id
        : null,
    razorpay_payment_id:
      typeof row.razorpay_payment_id === 'string' && row.razorpay_payment_id.trim()
        ? row.razorpay_payment_id
        : null,
    payment_status:
      typeof row.payment_status === 'string' && row.payment_status.trim()
        ? row.payment_status
        : null,
    payment_mode:
      typeof row.payment_mode === 'string' && row.payment_mode.trim()
        ? row.payment_mode
        : null,
    consultation_fee: row.consultation_fee === null ? null : Number(row.consultation_fee),
    price_5_sessions: row.price_5_sessions === null ? null : Number(row.price_5_sessions),
    price_10_sessions: row.price_10_sessions === null ? null : Number(row.price_10_sessions),
    price_extended: row.price_extended === null ? null : Number(row.price_extended),
    complimentary_session: toBoolean(row.complimentary_session),
    linkedin_url: row.linkedin_url,
    portfolio_url: row.portfolio_url,
    has_mentored_before: row.has_mentored_before === null ? null : toBoolean(row.has_mentored_before),
    mentoring_experience: row.mentoring_experience,
    accepted_guidelines: row.accepted_guidelines === null ? null : toBoolean(row.accepted_guidelines),
    accepted_code_of_conduct: row.accepted_code_of_conduct === null
      ? null
      : toBoolean(row.accepted_code_of_conduct),
    status:
      typeof row.status === 'string' && row.status.trim()
        ? row.status
        : MENTOR_STATUS_PENDING,
    has_resume: toBoolean(row.has_resume),
    has_profile_photo: toBoolean(row.has_profile_photo),
    created_at: row.created_at,
  };
}

async function getMentorTableColumns() {
  if (!mentorTableColumnsPromise) {
    mentorTableColumnsPromise = db
      .query(`SHOW COLUMNS FROM ${MENTOR_REGISTRATION_TABLE}`)
      .then(([rows]) => new Set(rows.map((row) => String(row.Field))))
      .catch(() => null);
  }

  return mentorTableColumnsPromise;
}

async function getMentorDetailColumns() {
  const mentorTableColumns = await getMentorTableColumns();
  const detailColumns = [...BASE_MENTOR_DETAIL_COLUMNS];
  const insertIndex = detailColumns.indexOf('consultation_fee');
  const hasResumePathColumn = Boolean(mentorTableColumns && mentorTableColumns.has('resume_path'));
  const hasProfilePhotoPathColumn = Boolean(mentorTableColumns && mentorTableColumns.has('profile_photo_path'));

  const availableOptionalColumns = mentorTableColumns
    ? OPTIONAL_MENTOR_COLUMNS.filter((column) => mentorTableColumns.has(column))
    : [];

  const remainingOptionalColumns = availableOptionalColumns.filter(
    (column) => column !== 'nationality'
  );

  if (availableOptionalColumns.includes('nationality')) {
    const dobIndex = detailColumns.indexOf('dob');
    if (dobIndex >= 0) {
      detailColumns.splice(dobIndex + 1, 0, 'nationality');
    }
  }

  if (insertIndex >= 0 && remainingOptionalColumns.length > 0) {
    detailColumns.splice(insertIndex, 0, ...remainingOptionalColumns);
  }

  const derivedColumns = [
    hasResumePathColumn
      ? "(resume_path IS NOT NULL AND resume_path <> '') AS has_resume"
      : '0 AS has_resume',
    hasProfilePhotoPathColumn
      ? "(profile_photo_path IS NOT NULL AND profile_photo_path <> '') AS has_profile_photo"
      : '0 AS has_profile_photo',
    'created_at',
  ];

  return [...detailColumns, ...derivedColumns].join(',\n  ');
}

async function findMentorByEmail(email, connection = db) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const [rows] = await connection.query(
    `SELECT id, payment_status, razorpay_order_id, razorpay_payment_id
     FROM ${MENTOR_REGISTRATION_TABLE}
     WHERE LOWER(email) = LOWER(?)
     LIMIT 1`,
    [normalizedEmail]
  );

  return rows[0] || null;
}

async function isMentorEmailTaken(email) {
  const existing = await findMentorByEmail(email);
  if (!existing) {
    return false;
  }

  return isCompletedPaymentStatus(existing.payment_status);
}

async function resolveSuccessfulMentorPaymentForAttempt({ orderId, paymentId }) {
  const normalizedOrderId = cleanText(orderId);
  const normalizedPaymentId = cleanText(paymentId);

  if (!normalizedOrderId) {
    return null;
  }

  const razorpayClient = getRazorpayClient();
  if (!razorpayClient) {
    return null;
  }

  if (normalizedPaymentId) {
    const resolved = await resolvePaymentFromOrderContext(
      razorpayClient,
      normalizedOrderId,
      normalizedPaymentId
    );

    const resolvedStatus = cleanText(resolved.payment?.status).toLowerCase();
    if (
      resolved.payment
      && String(resolved.payment.order_id) === normalizedOrderId
      && SUCCESSFUL_PAYMENT_STATUSES.has(resolvedStatus)
    ) {
      return resolved.payment;
    }
  }

  const resolvedFromOrder = await resolveSuccessfulOrderPayment(
    razorpayClient,
    normalizedOrderId
  );

  if (resolvedFromOrder && String(resolvedFromOrder.order_id) === normalizedOrderId) {
    return resolvedFromOrder;
  }

  return null;
}

async function reconcilePendingMentorRegistrationByEmail(email, connection = db) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  const [rows] = await connection.query(
    `SELECT id, payment_status, razorpay_order_id, razorpay_payment_id
     FROM ${MENTOR_REGISTRATION_TABLE}
     WHERE LOWER(email) = LOWER(?)
       AND (
         payment_status IS NULL
         OR LOWER(payment_status) NOT IN ('captured', 'authorized', 'not_required')
       )
       AND razorpay_order_id IS NOT NULL
       AND razorpay_order_id <> ''
     LIMIT 1`,
    [normalizedEmail]
  );

  const attempt = rows[0] || null;
  if (!attempt) {
    return false;
  }

  const successfulPayment = await resolveSuccessfulMentorPaymentForAttempt({
    orderId: attempt.razorpay_order_id,
    paymentId: attempt.razorpay_payment_id,
  });

  if (!successfulPayment) {
    return false;
  }

  await connection.query(
    `UPDATE ${MENTOR_REGISTRATION_TABLE}
     SET payment_amount = ?,
         payment_currency = ?,
         razorpay_order_id = ?,
         razorpay_payment_id = ?,
         payment_status = ?,
         payment_mode = ?
     WHERE id = ?
     LIMIT 1`,
    [
      toMajorUnits(successfulPayment.amount, null),
      cleanText(successfulPayment.currency).toUpperCase() || null,
      cleanText(successfulPayment.order_id) || cleanText(attempt.razorpay_order_id) || null,
      cleanText(successfulPayment.id) || cleanText(attempt.razorpay_payment_id) || null,
      cleanText(successfulPayment.status) || 'captured',
      cleanText(successfulPayment.method) || 'gateway_verified',
      Number(attempt.id),
    ]
  );

  return true;
}

async function updateMentorRegistrationById(connection, mentorId, payload, mentorTableColumns) {
  const writableColumns = getMentorWritableColumns(mentorTableColumns);
  if (writableColumns.length === 0) {
    return;
  }

  const assignments = writableColumns.map((column) => {
    if (FILE_COALESCE_COLUMNS.has(column)) {
      return `${column} = COALESCE(?, ${column})`;
    }

    return `${column} = ?`;
  });

  const values = writableColumns.map((column) => payload[column] ?? null);

  await connection.query(
    `UPDATE ${MENTOR_REGISTRATION_TABLE}
     SET ${assignments.join(', ')}
     WHERE id = ?
     LIMIT 1`,
    [...values, mentorId]
  );
}

async function upsertMentorRegistration(payload) {
  const normalizedEmail = normalizeEmail(payload?.email);
  if (!normalizedEmail) {
    throw new Error('email is required');
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const mentorTableColumns = await getMentorTableColumns();
    const existing = await findMentorByEmail(normalizedEmail, connection);
    const normalizedPayload = await prepareMentorPayloadBeforePersist({
      ...payload,
      email: normalizedEmail,
    }, mentorTableColumns);

    if (existing) {
      if (isCompletedPaymentStatus(existing.payment_status)) {
        await connection.commit();
        return {
          outcome: 'already_completed',
          id: Number(existing.id),
        };
      }

      await updateMentorRegistrationById(
        connection,
        Number(existing.id),
        normalizedPayload,
        mentorTableColumns
      );

      await connection.commit();
      return {
        outcome: 'updated',
        id: Number(existing.id),
      };
    }

    const createdId = await createMentorRegistration(normalizedPayload, connection);

    await connection.commit();
    return {
      outcome: 'created',
      id: Number(createdId),
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
  const paymentConfig = resolveMentorPaymentConfig(input?.nationality);

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

  if (!paymentConfig) {
    return {
      status: 400,
      body: { message: 'nationality must be Indian or Others' },
    };
  }

  await reconcilePendingMentorRegistrationByEmail(applicantEmail);

  if (await isMentorEmailTaken(applicantEmail)) {
    return {
      status: 200,
      body: {
        requires_payment: false,
        already_registered: true,
        amount: 0,
        currency: paymentConfig.currency,
        message: 'Email already registered.',
      },
    };
  }

  const amountInMinorUnits = toMoneyInMinorUnits(paymentConfig.amount);
  if (amountInMinorUnits === null) {
    return {
      status: 500,
      body: { message: 'Invalid mentor registration fee configuration' },
    };
  }

  if (amountInMinorUnits <= 0) {
    return {
      status: 200,
      body: {
        requires_payment: false,
        amount: 0,
        currency: paymentConfig.currency,
        registration_fee: paymentConfig.amount,
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
    amount: amountInMinorUnits,
    currency: paymentConfig.currency,
    receipt: `mentor_registration_${Date.now()}`,
    notes: {
      source: 'mentor_registration',
      applicant_email: applicantEmail,
      nationality: paymentConfig.nationality,
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
    },
  };
}

async function verifyPaymentForRegistration(input) {
  const orderId = cleanText(input?.razorpay_order_id);
  const paymentId = cleanText(input?.razorpay_payment_id);
  const signature = cleanText(input?.razorpay_signature);

  if (!orderId || !paymentId || !signature) {
    return {
      status: 400,
      body: {
        message: 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required',
      },
      paymentDetails: null,
    };
  }

  const paymentConfig = resolveMentorPaymentConfig(input?.nationality);
  if (!paymentConfig) {
    return {
      status: 400,
      body: { message: 'nationality must be Indian or Others' },
      paymentDetails: null,
    };
  }

  const amountInMinorUnits = toMoneyInMinorUnits(paymentConfig.amount);
  if (amountInMinorUnits === null || amountInMinorUnits <= 0) {
    return {
      status: 400,
      body: { message: 'Payment is not required for mentor registration' },
      paymentDetails: null,
    };
  }

  const { keySecret } = getRazorpayCredentials();
  const razorpayClient = getRazorpayClient();

  if (!keySecret || !razorpayClient) {
    return {
      status: 500,
      body: { message: 'Razorpay credentials are missing on the server' },
      paymentDetails: null,
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
      paymentDetails: null,
    };
  }

  const { payment, fetchError } = await fetchPaymentFromRazorpayWithRetry(
    razorpayClient,
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
      paymentDetails: null,
    };
  }

  if (String(payment.order_id) !== orderId) {
    return {
      status: 400,
      body: { message: 'Payment does not belong to this order' },
      paymentDetails: null,
    };
  }

  if (Number(payment.amount) !== amountInMinorUnits) {
    return {
      status: 400,
      body: { message: 'Paid amount does not match mentor registration fee' },
      paymentDetails: null,
    };
  }

  const paymentCurrency = cleanText(payment.currency).toUpperCase();
  if (paymentCurrency !== paymentConfig.currency) {
    return {
      status: 400,
      body: {
        message: `Payment currency mismatch. Expected ${paymentConfig.currency}, received ${paymentCurrency || 'unknown'}`,
      },
      paymentDetails: null,
    };
  }

  const paymentStatus = cleanText(payment.status).toLowerCase();
  if (!SUCCESSFUL_PAYMENT_STATUSES.has(paymentStatus)) {
    return {
      status: 400,
      body: {
        message: `Payment is not successful yet (status: ${paymentStatus || 'unknown'})`,
      },
      paymentDetails: null,
    };
  }

  return {
    status: 200,
    body: {
      message: 'Payment verified successfully',
    },
    paymentDetails: {
      payment_amount: amountInMinorUnits / 100,
      payment_currency: paymentConfig.currency,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      payment_status: cleanText(payment.status) || 'captured',
      payment_mode: cleanText(payment.method) || null,
    },
  };
}

async function logPaymentAttempt(input) {
  const applicantEmail = normalizeEmail(input?.email);
  const paymentConfig = resolveMentorPaymentConfig(input?.nationality);
  const attemptStatus = normalizePaymentAttemptStatus(input?.payment_status);

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

  if (!paymentConfig) {
    return {
      status: 400,
      body: { message: 'nationality must be Indian or Others' },
    };
  }

  if (!attemptStatus) {
    return {
      status: 400,
      body: {
        message: 'payment_status must be pending or failed',
      },
    };
  }

  let paymentDetails = {
    payment_amount: paymentConfig.amount,
    payment_currency: paymentConfig.currency,
    razorpay_order_id: cleanText(input?.razorpay_order_id) || null,
    razorpay_payment_id: cleanText(input?.razorpay_payment_id || input?.transaction_id) || null,
    payment_status: attemptStatus,
    payment_mode:
      cleanText(input?.payment_mode)
      || (attemptStatus === 'pending' ? 'order_created' : 'gateway_failed'),
  };

  if (attemptStatus === PAYMENT_STATUS_FAILED) {
    const successfulPayment = await resolveSuccessfulMentorPaymentForAttempt({
      orderId: paymentDetails.razorpay_order_id,
      paymentId: paymentDetails.razorpay_payment_id,
    });

    if (successfulPayment) {
      paymentDetails = {
        payment_amount: toMajorUnits(successfulPayment.amount, paymentConfig.amount),
        payment_currency:
          cleanText(successfulPayment.currency).toUpperCase() || paymentConfig.currency,
        razorpay_order_id:
          cleanText(successfulPayment.order_id) || paymentDetails.razorpay_order_id || null,
        razorpay_payment_id:
          cleanText(successfulPayment.id) || paymentDetails.razorpay_payment_id || null,
        payment_status: cleanText(successfulPayment.status) || 'captured',
        payment_mode: cleanText(successfulPayment.method) || 'gateway_verified',
      };
    }
  }

  const upsertResult = await upsertMentorRegistration({
    ...input,
    email: applicantEmail,
    nationality: paymentConfig.nationality,
    payment_amount: paymentDetails.payment_amount,
    payment_currency: paymentDetails.payment_currency,
    razorpay_order_id: paymentDetails.razorpay_order_id,
    razorpay_payment_id: paymentDetails.razorpay_payment_id,
    payment_status: paymentDetails.payment_status,
    payment_mode: paymentDetails.payment_mode,
  });

  const normalizedPaymentStatus = normalizeStoredPaymentStatus(paymentDetails.payment_status);
  const isSuccessfulAttempt = isCompletedPaymentStatus(normalizedPaymentStatus);
  const statusCode = upsertResult.outcome === 'created' ? 201 : 200;

  return {
    status: statusCode,
    body: {
      message: isSuccessfulAttempt
        ? 'Payment reconciled successfully and mentor registration saved.'
        : `Mentor registration saved with ${normalizedPaymentStatus || attemptStatus} payment status.`,
      payment_status: normalizedPaymentStatus || attemptStatus,
      registration_id: upsertResult.id,
    },
  };
}

async function createMentorRegistration(payload, connection = db) {
  const mentorTableColumns = await getMentorTableColumns();
  const baseColumns = getMentorWritableColumns(mentorTableColumns);

  const baseValues = baseColumns.map((column) => payload[column] ?? null);

  const shouldIncludeStatus = !mentorTableColumns || mentorTableColumns.has('status');
  const columnsWithStatus = shouldIncludeStatus
    ? [...baseColumns, 'status']
    : baseColumns;
  const valuesWithStatus = shouldIncludeStatus
    ? [...baseValues, MENTOR_STATUS_PENDING]
    : baseValues;

  const placeholdersWithStatus = columnsWithStatus.map(() => '?').join(', ');

  let result;

  try {
    [result] = await connection.query(
      `INSERT INTO ${MENTOR_REGISTRATION_TABLE} (${columnsWithStatus.join(', ')})
       VALUES (${placeholdersWithStatus})`,
      valuesWithStatus
    );
  } catch (err) {
    // Keep registration backward compatible before status-column migration.
    if (!shouldIncludeStatus || !err || err.code !== 'ER_BAD_FIELD_ERROR') {
      throw err;
    }

    const placeholders = baseColumns.map(() => '?').join(', ');

    [result] = await connection.query(
      `INSERT INTO ${MENTOR_REGISTRATION_TABLE} (${baseColumns.join(', ')})
       VALUES (${placeholders})`,
      baseValues
    );
  }

  return Number(result.insertId);
}

async function getMentorById(id) {
  let rows;
  const detailColumns = await getMentorDetailColumns();

  try {
    [rows] = await db.query(
      `SELECT
        ${detailColumns},
        status
       FROM ${MENTOR_REGISTRATION_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
  } catch (err) {
    if (!err || err.code !== 'ER_BAD_FIELD_ERROR') {
      throw err;
    }

    [rows] = await db.query(
      `SELECT
        ${detailColumns}
       FROM ${MENTOR_REGISTRATION_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    rows = rows.map((row) => ({
      ...row,
      status: MENTOR_STATUS_PENDING,
    }));
  }

  if (rows.length === 0) {
    return null;
  }

  return mapMentorDetails(rows[0]);
}

async function getMentorsByStatus(status) {
  if (!VALID_MENTOR_STATUSES.has(status)) {
    return [];
  }

  let rows;
  const detailColumns = await getMentorDetailColumns();

  try {
    [rows] = await db.query(
      `SELECT
        ${detailColumns},
        status
       FROM ${MENTOR_REGISTRATION_TABLE}
       WHERE status = ?
       ORDER BY created_at DESC, id DESC`,
      [status]
    );
  } catch (err) {
    if (!err || err.code !== 'ER_BAD_FIELD_ERROR') {
      throw err;
    }

    // Graceful fallback for pre-migration environments.
    if (status === MENTOR_STATUS_ACTIVE) {
      return [];
    }

    [rows] = await db.query(
      `SELECT
        ${detailColumns}
       FROM ${MENTOR_REGISTRATION_TABLE}
       ORDER BY created_at DESC, id DESC`
    );

    rows = rows.map((row) => ({
      ...row,
      status: MENTOR_STATUS_PENDING,
    }));
  }

  return rows.map(mapMentorDetails);
}

async function getPendingMentors() {
  return getMentorsByStatus(MENTOR_STATUS_PENDING);
}

async function getActiveMentors() {
  return getMentorsByStatus(MENTOR_STATUS_ACTIVE);
}

async function approveMentorById(id) {
  try {
    const [rows] = await db.query(
      `SELECT id, status
       FROM ${MENTOR_REGISTRATION_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return { outcome: 'not_found' };
    }

    const currentStatus = String(rows[0].status || '').trim().toLowerCase();

    if (currentStatus === MENTOR_STATUS_ACTIVE) {
      const mentor = await getMentorById(id);
      return { outcome: 'already_active', mentor };
    }

    if (currentStatus && currentStatus !== MENTOR_STATUS_PENDING) {
      return { outcome: 'invalid_status', status: currentStatus };
    }

    await db.query(
      `UPDATE ${MENTOR_REGISTRATION_TABLE}
       SET status = ?
       WHERE id = ?`,
      [MENTOR_STATUS_ACTIVE, id]
    );

    const mentor = await getMentorById(id);

    return {
      outcome: 'approved',
      mentor,
    };
  } catch (err) {
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      return { outcome: 'status_column_missing' };
    }

    throw err;
  }
}

async function moveMentorToPendingById(id) {
  try {
    const [rows] = await db.query(
      `SELECT id, status
       FROM ${MENTOR_REGISTRATION_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return { outcome: 'not_found' };
    }

    const currentStatus = String(rows[0].status || '').trim().toLowerCase();

    if (currentStatus === MENTOR_STATUS_PENDING) {
      const mentor = await getMentorById(id);
      return { outcome: 'already_pending', mentor };
    }

    if (currentStatus && currentStatus !== MENTOR_STATUS_ACTIVE) {
      return { outcome: 'invalid_status', status: currentStatus };
    }

    await db.query(
      `UPDATE ${MENTOR_REGISTRATION_TABLE}
       SET status = ?
       WHERE id = ?`,
      [MENTOR_STATUS_PENDING, id]
    );

    const mentor = await getMentorById(id);

    return {
      outcome: 'moved_to_pending',
      mentor,
    };
  } catch (err) {
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      return { outcome: 'status_column_missing' };
    }

    throw err;
  }
}

async function rejectMentorById(id) {
  const [result] = await db.query(
    `DELETE FROM ${MENTOR_REGISTRATION_TABLE}
     WHERE id = ?`,
    [id]
  );

  if (!result || Number(result.affectedRows || 0) === 0) {
    return { outcome: 'not_found' };
  }

  return { outcome: 'deleted' };
}

const ADMIN_EDITABLE_COLUMNS = new Set([
  'full_name', 'email', 'phone', 'dob', 'nationality',
  'current_position', 'organization', 'years_experience', 'professional_bio',
  'primary_track', 'secondary_skills', 'key_competencies',
  'video_call', 'phone_call', 'live_chat', 'email_support',
  'availability', 'max_students', 'session_duration',
  'consultation_fee', 'price_5_sessions', 'price_10_sessions', 'price_extended',
  'currency', 'honorarium_hourly', 'honorarium_daily', 'honorarium_weekly', 'honorarium_project',
  'complimentary_session', 'linkedin_url', 'portfolio_url',
  'has_mentored_before', 'mentoring_experience',
  'accepted_guidelines', 'accepted_code_of_conduct',
]);

async function updateMentorProfileById(mentorId, fields) {
  // Check mentor exists first so we can give an accurate not_found response
  // (affectedRows = 0 in mysql2 default mode also means "no values changed",
  //  so it cannot reliably distinguish between not-found and no-op updates)
  const [existRows] = await db.query(
    `SELECT id FROM ${MENTOR_REGISTRATION_TABLE} WHERE id = ? LIMIT 1`,
    [mentorId]
  );

  if (!existRows || existRows.length === 0) {
    return { outcome: 'not_found' };
  }

  const tableColumns = await getMentorTableColumns();

  const assignments = [];
  const values = [];

  for (const [key, value] of Object.entries(fields)) {
    if (!ADMIN_EDITABLE_COLUMNS.has(key)) {
      continue;
    }
    // Skip columns that don't exist in this DB schema
    if (tableColumns && !tableColumns.has(key)) {
      continue;
    }
    assignments.push(`${key} = ?`);
    values.push(value ?? null);
  }

  if (assignments.length === 0) {
    return { outcome: 'updated' };
  }

  await db.query(
    `UPDATE ${MENTOR_REGISTRATION_TABLE}
     SET ${assignments.join(', ')}
     WHERE id = ?
     LIMIT 1`,
    [...values, mentorId]
  );

  return { outcome: 'updated' };
}

async function getMentorFileById(id, column) {
  if (!FILE_COLUMNS.has(column)) {
    throw new Error('Invalid file column');
  }

  const pathColumn = `${column}_path`;

  const [rows] = await db.query(
    `SELECT ${pathColumn}
     FROM ${MENTOR_REGISTRATION_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return { found: false, file: null };
  }

  const row = rows[0] || {};
  const s3Path = typeof row[pathColumn] === 'string' && row[pathColumn].trim()
    ? row[pathColumn].trim()
    : null;

  if (!s3Path) {
    return { found: true, file: null };
  }

  return {
    found: true,
    file: { s3Path },
  };
}

module.exports = {
  createPaymentOrder,
  verifyPaymentForRegistration,
  logPaymentAttempt,
  isMentorEmailTaken,
  upsertMentorRegistration,
  createMentorRegistration,
  getMentorById,
  getMentorFileById,
  getPendingMentors,
  getActiveMentors,
  approveMentorById,
  moveMentorToPendingById,
  rejectMentorById,
  updateMentorProfileById,
};
