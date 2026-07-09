const db = require('../config/db');

const STUDENT_REGISTRATION_TABLE = 'summer_school_student_registrations';
const NATIONALITY_OPTIONS = Object.freeze(['Indian', 'Other']);
const EWS_CATEGORY = 'EWS(Economically weaker section)';
const LEGACY_EWS_CATEGORY = 'EWS(Economily weaker section)';
const CATEGORY_OPTIONS = Object.freeze(['General Category', EWS_CATEGORY]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const PAYMENT_COLUMNS = Object.freeze([
  {
    name: 'payment_amount',
    definition: 'DECIMAL(10,2) NULL AFTER conduct_accepted',
  },
  {
    name: 'payment_currency',
    definition: 'VARCHAR(10) NULL AFTER payment_amount',
  },
  {
    name: 'razorpay_order_id',
    definition: 'VARCHAR(120) NULL AFTER payment_currency',
  },
  {
    name: 'razorpay_payment_id',
    definition: 'VARCHAR(120) NULL AFTER razorpay_order_id',
  },
  {
    name: 'payment_status',
    definition: 'VARCHAR(40) NULL AFTER razorpay_payment_id',
  },
  {
    name: 'payment_mode',
    definition: 'VARCHAR(40) NULL AFTER payment_status',
  },
]);

const studentRegistrationSchema = Object.freeze({
  full_name: { type: String, required: true },
  dob: { type: String, required: true },
  email: { type: String, required: true },
  category: {
    type: String,
    enum: CATEGORY_OPTIONS,
    required: true,
  },
  alternative_email: { type: String, required: true },
  grade: { type: String, required: true },
  school: { type: String, required: true },
  board: { type: String, required: true },
  nationality: {
    type: String,
    enum: NATIONALITY_OPTIONS,
    required: true,
  },
  gender: { type: String, required: false },
  guardian_name: { type: String, required: true },
  relationship: { type: String, required: true },
  guardian_email: { type: String, required: true },
  guardian_phone: { type: String, required: true },
  alt_phone: { type: String, required: false },
  batch: { type: String, required: true },
  experience: { type: String, required: false },
  guidelines_accepted: { type: Boolean, required: true },
  conduct_accepted: { type: Boolean, required: true },
});

function cleanText(value) {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : '';
  }

  return typeof value === 'string' ? value.trim() : '';
}

function toNullableText(value) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function normalizeCategory(value) {
  const cleaned = cleanText(value);
  const normalized = cleaned.toLowerCase();

  if (
    normalized === 'genral'
    || normalized === 'general'
    || normalized === 'general category'
  ) {
    return 'General Category';
  }

  if (
    normalized === EWS_CATEGORY.toLowerCase()
    || normalized === 'ews (economically weaker section)'
    || normalized === LEGACY_EWS_CATEGORY.toLowerCase()
    || normalized === 'ews (economily weaker section)'
  ) {
    return EWS_CATEGORY;
  }

  return cleaned;
}

function toNullableUpperText(value) {
  const cleaned = toNullableText(value);
  return cleaned ? cleaned.toUpperCase() : null;
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

function formatDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }

  const asString = String(value).trim();
  return asString || null;
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

function normalizeStudentRegistrationPayload(input = {}) {
  const payload = {
    full_name: cleanText(input.full_name || input.fullName),
    dob: cleanText(input.dob),
    email: normalizeEmail(input.email),
    category: normalizeCategory(input.category),
    alternative_email: normalizeEmail(
      input.alternative_email || input.alternativeEmail || input.altEmail
    ),
    grade: cleanText(input.grade),
    school: cleanText(input.school),
    board: cleanText(input.board),
    nationality: cleanText(input.nationality),
    gender: toNullableText(input.gender),
    guardian_name: cleanText(input.guardian_name || input.guardianName),
    relationship: cleanText(input.relationship),
    guardian_email: normalizeEmail(input.guardian_email || input.guardianEmail),
    guardian_phone: cleanText(input.guardian_phone || input.guardianPhone),
    alt_phone: toNullableText(input.alt_phone || input.altPhone),
    batch: cleanText(input.batch),
    experience: toNullableText(input.experience),
    guidelines_accepted: toBoolean(input.guidelines_accepted ?? input.guidelinesAccepted),
    conduct_accepted: toBoolean(input.conduct_accepted ?? input.conductAccepted),
  };

  const errors = [];

  if (!payload.full_name) {
    errors.push('full_name is required');
  }

  if (!payload.dob || !isValidDateString(payload.dob)) {
    errors.push('dob is required in YYYY-MM-DD format');
  }

  if (!payload.email) {
    errors.push('email is required');
  } else if (!EMAIL_REGEX.test(payload.email)) {
    errors.push('Invalid email format');
  }

  if (!payload.category) {
    errors.push('category is required');
  } else if (!CATEGORY_OPTIONS.includes(payload.category)) {
    errors.push(`category must be one of: ${CATEGORY_OPTIONS.join(', ')}`);
  }

  if (!payload.alternative_email) {
    errors.push('alternative_email is required');
  } else if (!EMAIL_REGEX.test(payload.alternative_email)) {
    errors.push('Invalid alternative_email format');
  }

  if (!payload.grade) {
    errors.push('grade is required');
  }

  if (!payload.school) {
    errors.push('school is required');
  }

  if (!payload.board) {
    errors.push('board is required');
  }

  if (!payload.nationality) {
    errors.push('nationality is required');
  } else if (!NATIONALITY_OPTIONS.includes(payload.nationality)) {
    errors.push(`nationality must be one of: ${NATIONALITY_OPTIONS.join(', ')}`);
  }

  if (!payload.guardian_name) {
    errors.push('guardian_name is required');
  }

  if (!payload.relationship) {
    errors.push('relationship is required');
  }

  if (!payload.guardian_email) {
    errors.push('guardian_email is required');
  } else if (!EMAIL_REGEX.test(payload.guardian_email)) {
    errors.push('Invalid guardian_email format');
  }

  if (!payload.guardian_phone) {
    errors.push('guardian_phone is required');
  }

  if (!payload.batch) {
    errors.push('batch is required');
  }

  if (!payload.guidelines_accepted) {
    errors.push('guidelines_accepted must be true');
  }

  if (!payload.conduct_accepted) {
    errors.push('conduct_accepted must be true');
  }

  return { payload, errors };
}

async function ensureStudentRegistrationTable(connection = db) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS ${STUDENT_REGISTRATION_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      dob DATE NOT NULL,
      email VARCHAR(255) NOT NULL,
      category VARCHAR(80) NOT NULL,
      alternative_email VARCHAR(255) NULL,
      grade VARCHAR(80) NOT NULL,
      school VARCHAR(255) NOT NULL,
      board VARCHAR(120) NOT NULL,
      nationality ENUM('Indian', 'Other') NOT NULL,
      gender VARCHAR(40) NULL,
      guardian_name VARCHAR(255) NOT NULL,
      relationship VARCHAR(80) NOT NULL,
      guardian_email VARCHAR(255) NOT NULL,
      guardian_phone VARCHAR(30) NOT NULL,
      alt_phone VARCHAR(30) NULL,
      batch VARCHAR(255) NOT NULL,
      experience TEXT NULL,
      guidelines_accepted BOOLEAN NOT NULL DEFAULT FALSE,
      conduct_accepted BOOLEAN NOT NULL DEFAULT FALSE,
      payment_amount DECIMAL(10,2) NULL,
      payment_currency VARCHAR(10) NULL,
      razorpay_order_id VARCHAR(120) NULL,
      razorpay_payment_id VARCHAR(120) NULL,
      payment_status VARCHAR(40) NULL,
      payment_mode VARCHAR(40) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_summer_school_students_created_at (created_at),
      INDEX idx_summer_school_students_email (email),
      INDEX idx_summer_school_students_razorpay_order_id (razorpay_order_id),
      INDEX idx_summer_school_students_razorpay_payment_id (razorpay_payment_id)
    )`
  );

  const [nationalityColumn] = await connection.query(
    `SHOW COLUMNS FROM ${STUDENT_REGISTRATION_TABLE} LIKE 'nationality'`
  );

  if (nationalityColumn.length === 0) {
    await connection.query(
      `ALTER TABLE ${STUDENT_REGISTRATION_TABLE}
       ADD COLUMN nationality ENUM('Indian', 'Other') NOT NULL DEFAULT 'Indian' AFTER board`
    );
  }

  const [alternativeEmailColumn] = await connection.query(
    `SHOW COLUMNS FROM ${STUDENT_REGISTRATION_TABLE} LIKE 'alternative_email'`
  );

  if (alternativeEmailColumn.length === 0) {
    await connection.query(
      `ALTER TABLE ${STUDENT_REGISTRATION_TABLE}
       ADD COLUMN alternative_email VARCHAR(255) NULL AFTER email`
    );
  }

  const [categoryColumn] = await connection.query(
    `SHOW COLUMNS FROM ${STUDENT_REGISTRATION_TABLE} LIKE 'category'`
  );

  if (categoryColumn.length === 0) {
    await connection.query(
      `ALTER TABLE ${STUDENT_REGISTRATION_TABLE}
       ADD COLUMN category VARCHAR(80) NOT NULL DEFAULT 'General Category' AFTER email`
    );
  } else {
    const existingDefault = cleanText(categoryColumn[0]?.Default);

    if (existingDefault !== 'General Category') {
      await connection.query(
        `ALTER TABLE ${STUDENT_REGISTRATION_TABLE}
         MODIFY COLUMN category VARCHAR(80) NOT NULL DEFAULT 'General Category'`
      );
    }
  }

  for (const paymentColumn of PAYMENT_COLUMNS) {
    const [column] = await connection.query(
      `SHOW COLUMNS FROM ${STUDENT_REGISTRATION_TABLE} LIKE ?`,
      [paymentColumn.name]
    );

    if (column.length === 0) {
      await connection.query(
        `ALTER TABLE ${STUDENT_REGISTRATION_TABLE}
         ADD COLUMN ${paymentColumn.name} ${paymentColumn.definition}`
      );
    }
  }
}

function mapStudentRegistrationRow(row) {
  const numericPaymentAmount =
    row.payment_amount === null || row.payment_amount === undefined
      ? null
      : Number(row.payment_amount);

  return {
    id: Number(row.id),
    full_name: cleanText(row.full_name),
    dob: formatDate(row.dob),
    email: cleanText(row.email),
    category: normalizeCategory(row.category),
    alternative_email: cleanText(row.alternative_email),
    grade: cleanText(row.grade),
    school: cleanText(row.school),
    board: cleanText(row.board),
    nationality: cleanText(row.nationality),
    gender: cleanText(row.gender) || null,
    guardian_name: cleanText(row.guardian_name),
    relationship: cleanText(row.relationship),
    guardian_email: cleanText(row.guardian_email),
    guardian_phone: cleanText(row.guardian_phone),
    alt_phone: cleanText(row.alt_phone) || null,
    batch: cleanText(row.batch),
    experience: cleanText(row.experience) || null,
    guidelines_accepted: Number(row.guidelines_accepted || 0) === 1,
    conduct_accepted: Number(row.conduct_accepted || 0) === 1,
    payment_amount: Number.isFinite(numericPaymentAmount) ? numericPaymentAmount : null,
    payment_currency: cleanText(row.payment_currency) || null,
    razorpay_order_id: cleanText(row.razorpay_order_id) || null,
    razorpay_payment_id: cleanText(row.razorpay_payment_id) || null,
    payment_status: cleanText(row.payment_status) || null,
    payment_mode: cleanText(row.payment_mode) || null,
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
  };
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

async function createStudentRegistration(payload, connection = db) {
  const baseColumns = [
    'full_name',
    'dob',
    'email',
    'category',
    'alternative_email',
    'grade',
    'school',
    'board',
    'nationality',
    'gender',
    'guardian_name',
    'relationship',
    'guardian_email',
    'guardian_phone',
    'alt_phone',
    'batch',
    'experience',
    'guidelines_accepted',
    'conduct_accepted',
  ];

  const baseValues = [
    payload.full_name,
    payload.dob,
    payload.email,
    payload.category,
    payload.alternative_email,
    payload.grade,
    payload.school,
    payload.board,
    payload.nationality,
    payload.gender,
    payload.guardian_name,
    payload.relationship,
    payload.guardian_email,
    payload.guardian_phone,
    payload.alt_phone,
    payload.batch,
    payload.experience,
    payload.guidelines_accepted,
    payload.conduct_accepted,
  ];

  const paymentColumns = [
    'payment_amount',
    'payment_currency',
    'razorpay_order_id',
    'razorpay_payment_id',
    'payment_status',
    'payment_mode',
  ];

  const valuesWithPayment = [
    ...baseValues,
    normalizePaymentAmount(payload.payment_amount),
    toNullableUpperText(payload.payment_currency),
    toNullableText(payload.razorpay_order_id),
    toNullableText(payload.razorpay_payment_id),
    toNullableText(payload.payment_status),
    toNullableText(payload.payment_mode),
  ];

  let result = null;

  try {
    const columnsWithPayment = [...baseColumns, ...paymentColumns];
    const placeholders = columnsWithPayment.map(() => '?').join(', ');

    const [insertResult] = await connection.query(
      `INSERT INTO ${STUDENT_REGISTRATION_TABLE} (${columnsWithPayment.join(', ')})
       VALUES (${placeholders})`,
      valuesWithPayment
    );

    result = insertResult;
  } catch (err) {
    if (!err || err.code !== 'ER_BAD_FIELD_ERROR') {
      throw err;
    }

    const basePlaceholders = baseColumns.map(() => '?').join(', ');
    const [fallbackResult] = await connection.query(
      `INSERT INTO ${STUDENT_REGISTRATION_TABLE} (${baseColumns.join(', ')})
       VALUES (${basePlaceholders})`,
      baseValues
    );

    result = fallbackResult;
  }

  const createdId = Number(result.insertId);
  const [rows] = await connection.query(
    `SELECT *
     FROM ${STUDENT_REGISTRATION_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [createdId]
  );

  return rows[0] ? mapStudentRegistrationRow(rows[0]) : null;
}

async function isStudentEmailTaken(email, connection = db) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  const [rows] = await connection.query(
    `SELECT id
     FROM ${STUDENT_REGISTRATION_TABLE}
     WHERE LOWER(email) = LOWER(?)
       AND (
         payment_status IS NULL
         OR LOWER(payment_status) IN ('captured', 'authorized', 'not_required')
       )
     LIMIT 1`,
    [normalizedEmail]
  );

  return rows.length > 0;
}

async function getStudentRegistrations(options = {}, connection = db) {
  const isExportAll = options.exportAll === true || options.exportAll === 'true';
  const page = Number(options.page) || 1;
  const pageSize = Number(options.pageSize) || 50;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = isExportAll
    ? null
    : (Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 200) : 50);
  const offset = isExportAll ? 0 : (safePage - 1) * safePageSize;

  const category = String(options.category || '').trim().toLowerCase();
  const nationality = String(options.nationality || '').trim().toLowerCase();
  const paymentStatus = String(options.paymentStatus || '').trim().toLowerCase();
  const emailSearch = String(options.emailSearch || '').trim().toLowerCase();

  const whereClauses = [];
  const whereParams = [];

  if (category === 'general') {
    whereClauses.push("LOWER(category) = 'general category'");
  } else if (category === 'ews') {
    whereClauses.push("LOWER(category) LIKE 'ews%'");
  }

  if (nationality === 'indian' || nationality === 'other') {
    whereClauses.push('LOWER(nationality) = ?');
    whereParams.push(nationality);
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

  const [rows] = await connection.query(
    `SELECT *
     FROM ${STUDENT_REGISTRATION_TABLE}
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     ${isExportAll ? '' : 'LIMIT ? OFFSET ?'}`,
    isExportAll ? [...whereParams] : [...whereParams, safePageSize, offset]
  );

  const [countRows] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM ${STUDENT_REGISTRATION_TABLE}
     ${whereSql}`,
    whereParams
  );

  const total = Number(countRows?.[0]?.total || 0);
  const effectivePageSize = isExportAll ? (total || 1) : safePageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

  return {
    data: rows.map(mapStudentRegistrationRow),
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
  };
}

module.exports = {
  STUDENT_REGISTRATION_TABLE,
  NATIONALITY_OPTIONS,
  CATEGORY_OPTIONS,
  studentRegistrationSchema,
  normalizeStudentRegistrationPayload,
  ensureStudentRegistrationTable,
  createStudentRegistration,
  getStudentRegistrations,
  isStudentEmailTaken,
};