const db = require('../config/db');

const INSTITUTIONAL_REGISTRATION_TABLE = 'institutional_registrations';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_CODE_REGEX = /^[0-9A-Za-z\s-]{4,12}$/;
const PAYMENT_STATUS_VALUES = new Set(['success', 'failed', 'pending']);

function cleanText(value) {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : '';
  }

  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveId(rawId) {
  const numeric = Number(rawId);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}

function toNullableText(value) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function normalizeCountry(value) {
  const cleaned = cleanText(value);
  const normalized = cleaned.toLowerCase();

  if (normalized === 'india') {
    return 'India';
  }

  if (normalized === 'other' || normalized === 'others') {
    return 'Others';
  }

  return cleaned;
}

function normalizePaymentStatus(value) {
  const normalized = cleanText(value).toLowerCase();

  if (normalized === 'captured' || normalized === 'authorized' || normalized === 'success') {
    return 'success';
  }

  if (
    normalized === 'failed'
    || normalized === 'failure'
    || normalized === 'cancelled'
    || normalized === 'canceled'
  ) {
    return 'failed';
  }

  if (normalized === 'pending' || normalized === 'created') {
    return 'pending';
  }

  return normalized;
}

function normalizePaymentAmount(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.round(numeric * 100) / 100;
}

function formatDateTime(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const asString = String(value).trim();
  return asString || null;
}

function normalizeInstitutionalRegistrationPayload(input = {}) {
  const payload = {
    institute_name: cleanText(
      input.institute_name || input.instituteName || input.school_name || input.schoolName
    ),
    board: cleanText(input.board),
    city: cleanText(input.city),
    state: cleanText(input.state),
    pin_code: toNullableText(input.pin_code || input.pinCode),
    country: normalizeCountry(input.country),
    contact_name: cleanText(input.contact_name || input.contactName),
    designation: cleanText(input.designation),
    email: normalizeEmail(input.email),
    phone: cleanText(input.phone),
    student_count: cleanText(input.student_count || input.studentCount),
    head_name: cleanText(input.head_name || input.headName),
    head_email: normalizeEmail(input.head_email || input.headEmail),
    head_phone: toNullableText(input.head_phone || input.headPhone),
    message: toNullableText(input.message),
    payment_status: normalizePaymentStatus(
      input.payment_status || input.paymentStatus || 'pending'
    ) || 'pending',
    payment_amount: normalizePaymentAmount(
      input.payment_amount || input.paymentAmount
    ),
    payment_currency: toNullableText(
      input.payment_currency || input.paymentCurrency
    ),
    razorpay_order_id: toNullableText(
      input.razorpay_order_id || input.order_id || input.orderId
    ),
    transaction_id: toNullableText(
      input.transaction_id || input.transactionId || input.razorpay_payment_id
    ),
    failure_reason: toNullableText(
      input.failure_reason
      || input.failureReason
      || input.payment_error_description
      || input.payment_error_reason
    ),
  };

  const errors = [];

  if (!payload.institute_name) {
    errors.push('institute_name is required');
  }

  if (!payload.board) {
    errors.push('board is required');
  }

  if (!payload.city) {
    errors.push('city is required');
  }

  if (!payload.state) {
    errors.push('state is required');
  }

  if (!payload.country) {
    errors.push('country is required');
  }

  if (!payload.contact_name) {
    errors.push('contact_name is required');
  }

  if (!payload.designation) {
    errors.push('designation is required');
  }

  if (!payload.email) {
    errors.push('email is required');
  } else if (!EMAIL_REGEX.test(payload.email)) {
    errors.push('Invalid email format');
  }

  if (!payload.phone) {
    errors.push('phone is required');
  }

  if (!payload.student_count) {
    errors.push('student_count is required');
  }

  if (!payload.head_name) {
    errors.push('head_name is required');
  }

  if (!payload.head_email) {
    errors.push('head_email is required');
  } else if (!EMAIL_REGEX.test(payload.head_email)) {
    errors.push('Invalid head_email format');
  }

  if (payload.pin_code && !PIN_CODE_REGEX.test(payload.pin_code)) {
    errors.push('Invalid pin_code format');
  }

  if (payload.message && payload.message.length > 500) {
    errors.push('message cannot exceed 500 characters');
  }

  if (!PAYMENT_STATUS_VALUES.has(payload.payment_status)) {
    errors.push('payment_status must be one of: success, failed, pending');
  }

  if (payload.payment_amount === null) {
    const hasRawPaymentAmount = Object.prototype.hasOwnProperty.call(input, 'payment_amount')
      || Object.prototype.hasOwnProperty.call(input, 'paymentAmount');

    if (hasRawPaymentAmount) {
      errors.push('payment_amount must be a non-negative number');
    }
  }

  if (payload.payment_currency && payload.payment_currency.length > 10) {
    errors.push('payment_currency cannot exceed 10 characters');
  }

  if (payload.razorpay_order_id && payload.razorpay_order_id.length > 120) {
    errors.push('razorpay_order_id cannot exceed 120 characters');
  }

  if (payload.transaction_id && payload.transaction_id.length > 120) {
    errors.push('transaction_id cannot exceed 120 characters');
  }

  return { payload, errors };
}

async function ensureInstitutionalRegistrationTable(connection = db) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS ${INSTITUTIONAL_REGISTRATION_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      institute_name VARCHAR(255) NOT NULL,
      board VARCHAR(120) NOT NULL,
      city VARCHAR(120) NOT NULL,
      state VARCHAR(120) NOT NULL,
      pin_code VARCHAR(20) NULL,
      country VARCHAR(120) NOT NULL DEFAULT 'India',
      contact_name VARCHAR(255) NOT NULL,
      designation VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      student_count VARCHAR(80) NOT NULL,
      head_name VARCHAR(255) NOT NULL,
      head_email VARCHAR(255) NOT NULL,
      head_phone VARCHAR(30) NULL,
      message TEXT NULL,
      payment_status ENUM('success', 'failed', 'pending') NOT NULL DEFAULT 'pending',
      payment_amount DECIMAL(10,2) NULL,
      payment_currency VARCHAR(10) NULL,
      razorpay_order_id VARCHAR(120) NULL,
      transaction_id VARCHAR(120) NULL,
      failure_reason TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_institutional_registrations_created_at (created_at),
      INDEX idx_institutional_registrations_email (email),
      INDEX idx_institutional_registrations_head_email (head_email)
    )`
  );

  const [countryColumn] = await connection.query(
    `SHOW COLUMNS FROM ${INSTITUTIONAL_REGISTRATION_TABLE} LIKE 'country'`
  );

  if (countryColumn.length === 0) {
    await connection.query(
      `ALTER TABLE ${INSTITUTIONAL_REGISTRATION_TABLE}
       ADD COLUMN country VARCHAR(120) NOT NULL DEFAULT 'India' AFTER pin_code`
    );
  }

  const [paymentStatusColumn] = await connection.query(
    `SHOW COLUMNS FROM ${INSTITUTIONAL_REGISTRATION_TABLE} LIKE 'payment_status'`
  );

  if (paymentStatusColumn.length === 0) {
    await connection.query(
      `ALTER TABLE ${INSTITUTIONAL_REGISTRATION_TABLE}
       ADD COLUMN payment_status ENUM('success', 'failed', 'pending') NOT NULL DEFAULT 'pending' AFTER message`
    );
  } else {
    await connection.query(
      `UPDATE ${INSTITUTIONAL_REGISTRATION_TABLE}
       SET payment_status = 'success'
       WHERE LOWER(payment_status) IN ('captured', 'authorized', 'success')`
    );

    await connection.query(
      `UPDATE ${INSTITUTIONAL_REGISTRATION_TABLE}
       SET payment_status = 'failed'
       WHERE LOWER(payment_status) IN ('failed', 'failure', 'cancelled', 'canceled')`
    );

    await connection.query(
      `UPDATE ${INSTITUTIONAL_REGISTRATION_TABLE}
       SET payment_status = 'pending'
       WHERE payment_status IS NULL
          OR LOWER(payment_status) IN ('pending', 'created', '')`
    );

    await connection.query(
      `ALTER TABLE ${INSTITUTIONAL_REGISTRATION_TABLE}
       MODIFY COLUMN payment_status ENUM('success', 'failed', 'pending') NOT NULL DEFAULT 'pending'`
    );
  }

  const [paymentAmountColumn] = await connection.query(
    `SHOW COLUMNS FROM ${INSTITUTIONAL_REGISTRATION_TABLE} LIKE 'payment_amount'`
  );

  if (paymentAmountColumn.length === 0) {
    await connection.query(
      `ALTER TABLE ${INSTITUTIONAL_REGISTRATION_TABLE}
       ADD COLUMN payment_amount DECIMAL(10,2) NULL AFTER payment_status`
    );
  }

  const [paymentCurrencyColumn] = await connection.query(
    `SHOW COLUMNS FROM ${INSTITUTIONAL_REGISTRATION_TABLE} LIKE 'payment_currency'`
  );

  if (paymentCurrencyColumn.length === 0) {
    await connection.query(
      `ALTER TABLE ${INSTITUTIONAL_REGISTRATION_TABLE}
       ADD COLUMN payment_currency VARCHAR(10) NULL AFTER payment_amount`
    );
  }

  const [razorpayOrderIdColumn] = await connection.query(
    `SHOW COLUMNS FROM ${INSTITUTIONAL_REGISTRATION_TABLE} LIKE 'razorpay_order_id'`
  );

  if (razorpayOrderIdColumn.length === 0) {
    await connection.query(
      `ALTER TABLE ${INSTITUTIONAL_REGISTRATION_TABLE}
       ADD COLUMN razorpay_order_id VARCHAR(120) NULL AFTER payment_currency`
    );
  }

  const [transactionIdColumn] = await connection.query(
    `SHOW COLUMNS FROM ${INSTITUTIONAL_REGISTRATION_TABLE} LIKE 'transaction_id'`
  );

  if (transactionIdColumn.length === 0) {
    await connection.query(
      `ALTER TABLE ${INSTITUTIONAL_REGISTRATION_TABLE}
       ADD COLUMN transaction_id VARCHAR(120) NULL AFTER payment_currency`
    );
  }

  const [failureReasonColumn] = await connection.query(
    `SHOW COLUMNS FROM ${INSTITUTIONAL_REGISTRATION_TABLE} LIKE 'failure_reason'`
  );

  if (failureReasonColumn.length === 0) {
    await connection.query(
      `ALTER TABLE ${INSTITUTIONAL_REGISTRATION_TABLE}
       ADD COLUMN failure_reason TEXT NULL AFTER transaction_id`
    );
  }
}

function mapInstitutionalRegistrationRow(row) {
  return {
    id: Number(row.id),
    institute_name: cleanText(row.institute_name),
    board: cleanText(row.board),
    city: cleanText(row.city),
    state: cleanText(row.state),
    pin_code: cleanText(row.pin_code) || null,
    country: cleanText(row.country) || 'India',
    contact_name: cleanText(row.contact_name),
    designation: cleanText(row.designation),
    email: cleanText(row.email),
    phone: cleanText(row.phone),
    student_count: cleanText(row.student_count),
    head_name: cleanText(row.head_name),
    head_email: cleanText(row.head_email),
    head_phone: cleanText(row.head_phone) || null,
    message: cleanText(row.message) || null,
    payment_status: cleanText(row.payment_status) || 'pending',
    payment_amount:
      row.payment_amount === null || row.payment_amount === undefined
        ? null
        : Number(row.payment_amount),
    payment_currency: cleanText(row.payment_currency) || null,
    razorpay_order_id: cleanText(row.razorpay_order_id) || null,
    transaction_id: cleanText(row.transaction_id) || null,
    failure_reason: cleanText(row.failure_reason) || null,
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
  };
}

async function createInstitutionalRegistration(payload, connection = db) {
  const columns = [
    'institute_name',
    'board',
    'city',
    'state',
    'pin_code',
    'country',
    'contact_name',
    'designation',
    'email',
    'phone',
    'student_count',
    'head_name',
    'head_email',
    'head_phone',
    'message',
    'payment_status',
    'payment_amount',
    'payment_currency',
    'razorpay_order_id',
    'transaction_id',
    'failure_reason',
  ];

  const values = [
    payload.institute_name,
    payload.board,
    payload.city,
    payload.state,
    payload.pin_code,
    payload.country,
    payload.contact_name,
    payload.designation,
    payload.email,
    payload.phone,
    payload.student_count,
    payload.head_name,
    payload.head_email,
    payload.head_phone,
    payload.message,
    payload.payment_status,
    payload.payment_amount,
    payload.payment_currency,
    payload.razorpay_order_id,
    payload.transaction_id,
    payload.failure_reason,
  ];

  const placeholders = columns.map(() => '?').join(', ');

  const [insertResult] = await connection.query(
    `INSERT INTO ${INSTITUTIONAL_REGISTRATION_TABLE} (${columns.join(', ')})
     VALUES (${placeholders})`,
    values
  );

  const createdId = Number(insertResult.insertId);
  const [rows] = await connection.query(
    `SELECT *
     FROM ${INSTITUTIONAL_REGISTRATION_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [createdId]
  );

  return rows[0] ? mapInstitutionalRegistrationRow(rows[0]) : null;
}

async function getInstitutionalRegistrations(options = {}, connection = db) {
  const isExportAll = options.exportAll === true || options.exportAll === 'true';
  const page = Number(options.page) || 1;
  const pageSize = Number(options.pageSize) || 50;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = isExportAll
    ? null
    : (Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 200) : 50);
  const offset = isExportAll ? 0 : (safePage - 1) * safePageSize;

  const paymentStatus = String(options.paymentStatus || '').trim().toLowerCase();
  const search = String(options.search || '').trim().toLowerCase();

  const whereClauses = [];
  const whereParams = [];

  if (paymentStatus && paymentStatus !== 'all' && PAYMENT_STATUS_VALUES.has(paymentStatus)) {
    whereClauses.push('LOWER(payment_status) = ?');
    whereParams.push(paymentStatus);
  }

  if (search) {
    whereClauses.push(
      '(LOWER(institute_name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(contact_name) LIKE ?)'
    );
    const likeValue = `%${search}%`;
    whereParams.push(likeValue, likeValue, likeValue);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const [rows] = await connection.query(
    `SELECT *
     FROM ${INSTITUTIONAL_REGISTRATION_TABLE}
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     ${isExportAll ? '' : 'LIMIT ? OFFSET ?'}`,
    isExportAll ? [...whereParams] : [...whereParams, safePageSize, offset]
  );

  const [countRows] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM ${INSTITUTIONAL_REGISTRATION_TABLE}
     ${whereSql}`,
    whereParams
  );

  const total = Number(countRows?.[0]?.total || 0);
  const effectivePageSize = isExportAll ? (total || 1) : safePageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

  return {
    data: rows.map(mapInstitutionalRegistrationRow),
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
  };
}

async function deleteInstitutionalRegistration(rawId, connection = db) {
  const registrationId = parsePositiveId(rawId);

  if (!registrationId) {
    return null;
  }

  const [rows] = await connection.query(
    `SELECT *
     FROM ${INSTITUTIONAL_REGISTRATION_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [registrationId],
  );

  const existing = rows[0];
  if (!existing) {
    return null;
  }

  await connection.query(
    `DELETE FROM ${INSTITUTIONAL_REGISTRATION_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [registrationId],
  );

  return mapInstitutionalRegistrationRow(existing);
}

module.exports = {
  INSTITUTIONAL_REGISTRATION_TABLE,
  normalizeInstitutionalRegistrationPayload,
  ensureInstitutionalRegistrationTable,
  createInstitutionalRegistration,
  getInstitutionalRegistrations,
  deleteInstitutionalRegistration,
};
