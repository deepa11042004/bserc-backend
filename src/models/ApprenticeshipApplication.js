const db = require('../config/db');

const APPRENTICESHIP_TABLE = 'apprenticeship_applications';
const APPRENTICESHIP_STATUS_PENDING = 'pending';
const APPRENTICESHIP_STATUS_ACTIVE = 'active';
const APPRENTICESHIP_STATUS_REJECTED = 'rejected';
const VALID_APPRENTICESHIP_STATUSES = new Set([
  APPRENTICESHIP_STATUS_PENDING,
  APPRENTICESHIP_STATUS_ACTIVE,
  APPRENTICESHIP_STATUS_REJECTED,
]);

function cleanText(value) {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : '';
  }

  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function toNullableText(value) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function toJsonArrayText(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => item !== null && item !== undefined && item !== '');

  if (normalized.length === 0) {
    return null;
  }

  return JSON.stringify(normalized);
}

function parseJsonArray(value) {
  if (!value || typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

function mapApprenticeshipRecord(row) {
  return {
    id: Number(row.id),
    full_name: row.full_name,
    father_name: row.father_name,
    mother_name: row.mother_name,
    dob: row.dob,
    gender: row.gender,
    address: row.address,
    city: row.city,
    state: row.state,
    pin_code: row.pin_code,
    permanent_address: row.permanent_address,
    mobile_number: row.mobile_number,
    alt_mobile_number: row.alt_mobile_number,
    email: row.email,
    aadhaar_number: row.aadhaar_number,
    pan_number: row.pan_number,
    linkedin_profile: row.linkedin_profile,
    education: parseJsonArray(row.education_json),
    preferred_roles: parseJsonArray(row.preferred_roles_json),
    other_role_specify: row.other_role_specify,
    duration: row.duration,
    start_date: row.start_date,
    occupation: row.occupation,
    motivation: row.motivation,
    declaration_place: row.declaration_place,
    declaration_date: row.declaration_date,
    signature: row.signature,
    has_resume: Boolean(row.resume_path),
    has_certificates: Boolean(row.certificates_path),
    has_aadhaar_copy: Boolean(row.aadhaar_copy_path),
    has_photo: Boolean(row.photo_path),
    status: cleanText(row.status).toLowerCase() || APPRENTICESHIP_STATUS_PENDING,
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
  };
}

async function ensureApprenticeshipApplicationsTable(connection = db) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS ${APPRENTICESHIP_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(200) NOT NULL,
      father_name VARCHAR(200) NOT NULL,
      mother_name VARCHAR(200) NULL,
      dob DATE NOT NULL,
      gender VARCHAR(20) NOT NULL,
      address VARCHAR(255) NOT NULL,
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100) NOT NULL,
      pin_code VARCHAR(20) NOT NULL,
      permanent_address VARCHAR(255) NULL,
      mobile_number VARCHAR(50) NOT NULL,
      alt_mobile_number VARCHAR(50) NULL,
      email VARCHAR(255) NOT NULL,
      aadhaar_number VARCHAR(50) NULL,
      pan_number VARCHAR(20) NULL,
      linkedin_profile VARCHAR(255) NULL,
      education_json LONGTEXT NULL,
      preferred_roles_json LONGTEXT NULL,
      other_role_specify VARCHAR(255) NULL,
      duration VARCHAR(50) NOT NULL,
      start_date DATE NOT NULL,
      occupation VARCHAR(255) NOT NULL,
      motivation TEXT NOT NULL,
      declaration_place VARCHAR(255) NULL,
      declaration_date DATE NULL,
      signature VARCHAR(255) NULL,
      resume_path VARCHAR(500) NULL,
      certificates_path VARCHAR(500) NULL,
      aadhaar_copy_path VARCHAR(500) NULL,
      photo_path VARCHAR(500) NULL,
      status ENUM('pending', 'active', 'rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_apprenticeship_status (status),
      INDEX idx_apprenticeship_created_at (created_at),
      INDEX idx_apprenticeship_email (email)
    )`
  );
}

async function createApprenticeshipApplication(payload, connection = db) {
  await ensureApprenticeshipApplicationsTable(connection);

  const [result] = await connection.query(
    `INSERT INTO ${APPRENTICESHIP_TABLE} (
      full_name, father_name, mother_name, dob, gender, address, city, state, pin_code,
      permanent_address, mobile_number, alt_mobile_number, email, aadhaar_number, pan_number,
      linkedin_profile, education_json, preferred_roles_json, other_role_specify, duration,
      start_date, occupation, motivation, declaration_place, declaration_date, signature,
      resume_path, certificates_path, aadhaar_copy_path, photo_path, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cleanText(payload.full_name),
      cleanText(payload.father_name),
      toNullableText(payload.mother_name),
      cleanText(payload.dob),
      cleanText(payload.gender),
      cleanText(payload.address),
      cleanText(payload.city),
      cleanText(payload.state),
      cleanText(payload.pin_code),
      toNullableText(payload.permanent_address),
      cleanText(payload.mobile_number),
      toNullableText(payload.alt_mobile_number),
      normalizeEmail(payload.email),
      toNullableText(payload.aadhaar_number),
      toNullableText(payload.pan_number),
      toNullableText(payload.linkedin_profile),
      toJsonArrayText(payload.education),
      toJsonArrayText(payload.preferred_roles),
      toNullableText(payload.other_role_specify),
      cleanText(payload.duration),
      cleanText(payload.start_date),
      cleanText(payload.occupation),
      cleanText(payload.motivation),
      toNullableText(payload.declaration_place),
      toNullableText(payload.declaration_date) ? cleanText(payload.declaration_date) : null,
      toNullableText(payload.signature),
      toNullableText(payload.resume_path),
      toNullableText(payload.certificates_path),
      toNullableText(payload.aadhaar_copy_path),
      toNullableText(payload.photo_path),
      APPRENTICESHIP_STATUS_PENDING,
    ]
  );

  return Number(result.insertId);
}

async function getApprenticeshipById(id) {
  await ensureApprenticeshipApplicationsTable();

  const [rows] = await db.query(
    `SELECT * FROM ${APPRENTICESHIP_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapApprenticeshipRecord(rows[0]);
}

async function getApprenticeshipFilePath(id, field) {
  await ensureApprenticeshipApplicationsTable();

  const columnByField = {
    resume: 'resume_path',
    certificates: 'certificates_path',
    aadhaar_copy: 'aadhaar_copy_path',
    photo: 'photo_path',
  };

  const column = columnByField[field];
  if (!column) {
    return null;
  }

  const [rows] = await db.query(
    `SELECT ${column} AS file_path FROM ${APPRENTICESHIP_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );

  if (rows.length === 0 || !rows[0].file_path) {
    return null;
  }

  return rows[0].file_path;
}

async function getApprenticeshipsByStatus(status) {
  await ensureApprenticeshipApplicationsTable();

  if (!VALID_APPRENTICESHIP_STATUSES.has(status)) {
    return [];
  }

  const [rows] = await db.query(
    `SELECT * FROM ${APPRENTICESHIP_TABLE} WHERE status = ? ORDER BY created_at DESC, id DESC`,
    [status]
  );

  return rows.map(mapApprenticeshipRecord);
}

async function approveApprenticeshipById(id) {
  await ensureApprenticeshipApplicationsTable();

  const [rows] = await db.query(
    `SELECT id, status FROM ${APPRENTICESHIP_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return { outcome: 'not_found' };
  }

  const currentStatus = cleanText(rows[0].status).toLowerCase();

  if (currentStatus === APPRENTICESHIP_STATUS_ACTIVE) {
    const application = await getApprenticeshipById(id);
    return { outcome: 'already_active', application };
  }

  await db.query(
    `UPDATE ${APPRENTICESHIP_TABLE} SET status = ? WHERE id = ?`,
    [APPRENTICESHIP_STATUS_ACTIVE, id]
  );

  const application = await getApprenticeshipById(id);

  return { outcome: 'approved', application };
}

async function rejectApprenticeshipById(id) {
  await ensureApprenticeshipApplicationsTable();

  const [rows] = await db.query(
    `SELECT id, status FROM ${APPRENTICESHIP_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return { outcome: 'not_found' };
  }

  const currentStatus = cleanText(rows[0].status).toLowerCase();

  if (currentStatus === APPRENTICESHIP_STATUS_REJECTED) {
    const application = await getApprenticeshipById(id);
    return { outcome: 'already_rejected', application };
  }

  await db.query(
    `UPDATE ${APPRENTICESHIP_TABLE} SET status = ? WHERE id = ?`,
    [APPRENTICESHIP_STATUS_REJECTED, id]
  );

  const application = await getApprenticeshipById(id);

  return { outcome: 'rejected', application };
}

module.exports = {
  APPRENTICESHIP_STATUS_PENDING,
  APPRENTICESHIP_STATUS_ACTIVE,
  APPRENTICESHIP_STATUS_REJECTED,
  ensureApprenticeshipApplicationsTable,
  createApprenticeshipApplication,
  getApprenticeshipById,
  getApprenticeshipFilePath,
  getApprenticeshipsByStatus,
  approveApprenticeshipById,
  rejectApprenticeshipById,
};
