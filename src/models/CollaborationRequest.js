const db = require('../config/db');

const COLLABORATION_REQUEST_TABLE = 'collaboration_requests';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COLLABORATION_STATUS_PENDING = 'pending';
const COLLABORATION_STATUS_ACTIVE = 'active';
const COLLABORATION_STATUS_REJECTED = 'rejected';
const VALID_COLLABORATION_STATUSES = new Set([
  COLLABORATION_STATUS_PENDING,
  COLLABORATION_STATUS_ACTIVE,
  COLLABORATION_STATUS_REJECTED,
]);

const ALLOWED_PROGRAMMES = new Set([
  'Defence Drone Workshop',
  'Artificial Intelligence',
  'Rocketry',
  'Robotics',
  'Space Entrepreneurship',
  'Aircraft Design Technology',
]);

const ALLOWED_WORKSHOP_TYPES = new Set([
  'Paid Workshop',
  'Granted / Sponsored',
  'Hybrid Model',
]);

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

function toNullableInteger(value) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.round(numeric);
}

function toNullableDate(value) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function toBoolean(value, defaultValue = false) {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  const normalized = cleanText(value).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function toProgrammesArray(value) {
  let raw = value;

  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [raw];
    }
  }

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => cleanText(item))
    .filter((item) => ALLOWED_PROGRAMMES.has(item));
}

function toJsonArrayText(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  return JSON.stringify(values);
}

function parseJsonArray(value) {
  if (!value || typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => Boolean(item));
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

function normalizeCollaborationPayload(input = {}, options = {}) {
  const file = options.file && typeof options.file === 'object' ? options.file : null;

  const workshopType = cleanText(input.workshop_type);

  const payload = {
    institution_name: cleanText(input.institution_name),
    registered_address: cleanText(input.registered_address),
    website: toNullableText(input.website),
    signatory_name: cleanText(input.signatory_name),
    signatory_designation: cleanText(input.signatory_designation),
    official_email: normalizeEmail(input.official_email),
    official_phone: cleanText(input.official_phone),
    alternative_email: input.alternative_email ? normalizeEmail(input.alternative_email) : null,
    purpose_scope: cleanText(input.purpose_scope),
    programmes: toProgrammesArray(input.programmes),
    preferred_focus: toNullableText(input.preferred_focus),
    preferred_start_date: toNullableDate(input.preferred_start_date),
    duration_timings: toNullableText(input.duration_timings),
    additional_requirements: toNullableText(input.additional_requirements),
    expected_participants: toNullableInteger(input.expected_participants),
    workshop_type: ALLOWED_WORKSHOP_TYPES.has(workshopType) ? workshopType : null,
    expected_outcomes: toNullableText(input.expected_outcomes),
    project_help: toBoolean(input.project_help),
    supporting_document_name: toNullableText(file ? file.originalname : null),
    supporting_document_mime: toNullableText(file ? file.mimetype : null),
    supporting_document_size: toNullableInteger(file ? file.size : null),
    supporting_document_path: null,
  };

  const errors = [];

  if (!payload.institution_name) {
    errors.push('institution_name is required');
  }

  if (!payload.registered_address) {
    errors.push('registered_address is required');
  }

  if (!payload.signatory_name) {
    errors.push('signatory_name is required');
  }

  if (!payload.signatory_designation) {
    errors.push('signatory_designation is required');
  }

  if (!payload.official_email) {
    errors.push('official_email is required');
  } else if (!EMAIL_REGEX.test(payload.official_email)) {
    errors.push('Invalid official_email format');
  }

  if (payload.alternative_email && !EMAIL_REGEX.test(payload.alternative_email)) {
    errors.push('Invalid alternative_email format');
  }

  if (!payload.official_phone) {
    errors.push('official_phone is required');
  }

  if (!payload.purpose_scope) {
    errors.push('purpose_scope is required');
  } else {
    if (payload.purpose_scope.length < 100) {
      errors.push('purpose_scope must be at least 100 characters long');
    }

    if (payload.purpose_scope.length > 2000) {
      errors.push('purpose_scope cannot exceed 2000 characters');
    }
  }

  return { payload, errors };
}

async function ensureCollaborationRequestTable(connection = db) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS ${COLLABORATION_REQUEST_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      institution_name VARCHAR(255) NOT NULL,
      registered_address TEXT NOT NULL,
      website VARCHAR(500) NULL,
      signatory_name VARCHAR(255) NOT NULL,
      signatory_designation VARCHAR(150) NOT NULL,
      official_email VARCHAR(255) NOT NULL,
      official_phone VARCHAR(40) NOT NULL,
      alternative_email VARCHAR(255) NULL,
      purpose_scope TEXT NOT NULL,
      programmes_json LONGTEXT NULL,
      preferred_focus VARCHAR(255) NULL,
      preferred_start_date DATE NULL,
      duration_timings VARCHAR(255) NULL,
      additional_requirements TEXT NULL,
      expected_participants INT NULL,
      workshop_type VARCHAR(50) NULL,
      expected_outcomes TEXT NULL,
      project_help TINYINT(1) NOT NULL DEFAULT 0,
      supporting_document_name VARCHAR(255) NULL,
      supporting_document_mime VARCHAR(120) NULL,
      supporting_document_size INT NULL,
      supporting_document_path VARCHAR(1024) NULL,
      status ENUM('pending', 'active', 'rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_collaboration_status (status),
      INDEX idx_collaboration_created_at (created_at),
      INDEX idx_collaboration_official_email (official_email)
    )`
  );
}

const SELECT_COLUMNS = `id,
            institution_name,
            registered_address,
            website,
            signatory_name,
            signatory_designation,
            official_email,
            official_phone,
            alternative_email,
            purpose_scope,
            programmes_json,
            preferred_focus,
            preferred_start_date,
            duration_timings,
            additional_requirements,
            expected_participants,
            workshop_type,
            expected_outcomes,
            project_help,
            supporting_document_name,
            supporting_document_mime,
            supporting_document_size,
            supporting_document_path,
            status,
            created_at,
            updated_at`;

function mapCollaborationRequestRow(row) {
  return {
    id: Number(row.id),
    institution_name: cleanText(row.institution_name),
    registered_address: cleanText(row.registered_address),
    website: cleanText(row.website) || null,
    signatory_name: cleanText(row.signatory_name),
    signatory_designation: cleanText(row.signatory_designation),
    official_email: cleanText(row.official_email),
    official_phone: cleanText(row.official_phone),
    alternative_email: cleanText(row.alternative_email) || null,
    purpose_scope: cleanText(row.purpose_scope),
    programmes: parseJsonArray(row.programmes_json),
    preferred_focus: cleanText(row.preferred_focus) || null,
    preferred_start_date: row.preferred_start_date
      ? formatDateTime(row.preferred_start_date).slice(0, 10)
      : null,
    duration_timings: cleanText(row.duration_timings) || null,
    additional_requirements: cleanText(row.additional_requirements) || null,
    expected_participants: toNullableInteger(row.expected_participants),
    workshop_type: cleanText(row.workshop_type) || null,
    expected_outcomes: cleanText(row.expected_outcomes) || null,
    project_help: Number(row.project_help) === 1,
    supporting_document_name: cleanText(row.supporting_document_name) || null,
    supporting_document_mime: cleanText(row.supporting_document_mime) || null,
    supporting_document_size: toNullableInteger(row.supporting_document_size),
    has_supporting_document: Boolean(cleanText(row.supporting_document_path)),
    status: cleanText(row.status).toLowerCase() || COLLABORATION_STATUS_PENDING,
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
  };
}

async function createCollaborationRequest(payload, connection = db) {
  const columns = [
    'institution_name',
    'registered_address',
    'website',
    'signatory_name',
    'signatory_designation',
    'official_email',
    'official_phone',
    'alternative_email',
    'purpose_scope',
    'programmes_json',
    'preferred_focus',
    'preferred_start_date',
    'duration_timings',
    'additional_requirements',
    'expected_participants',
    'workshop_type',
    'expected_outcomes',
    'project_help',
    'supporting_document_name',
    'supporting_document_mime',
    'supporting_document_size',
    'supporting_document_path',
    'status',
  ];

  const values = [
    payload.institution_name,
    payload.registered_address,
    payload.website,
    payload.signatory_name,
    payload.signatory_designation,
    payload.official_email,
    payload.official_phone,
    payload.alternative_email,
    payload.purpose_scope,
    toJsonArrayText(payload.programmes),
    payload.preferred_focus,
    payload.preferred_start_date,
    payload.duration_timings,
    payload.additional_requirements,
    payload.expected_participants,
    payload.workshop_type,
    payload.expected_outcomes,
    payload.project_help ? 1 : 0,
    payload.supporting_document_name,
    payload.supporting_document_mime,
    payload.supporting_document_size,
    payload.supporting_document_path,
    COLLABORATION_STATUS_PENDING,
  ];

  const placeholders = columns.map(() => '?').join(', ');

  const [insertResult] = await connection.query(
    `INSERT INTO ${COLLABORATION_REQUEST_TABLE} (${columns.join(', ')})
     VALUES (${placeholders})`,
    values
  );

  const createdId = Number(insertResult.insertId);

  const [rows] = await connection.query(
    `SELECT ${SELECT_COLUMNS}
     FROM ${COLLABORATION_REQUEST_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [createdId]
  );

  return rows[0] ? mapCollaborationRequestRow(rows[0]) : null;
}

async function getCollaborationRequestById(id, connection = db) {
  const [rows] = await connection.query(
    `SELECT ${SELECT_COLUMNS}
     FROM ${COLLABORATION_REQUEST_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] ? mapCollaborationRequestRow(rows[0]) : null;
}

async function getCollaborationRequestsByStatus(status, connection = db) {
  if (!VALID_COLLABORATION_STATUSES.has(status)) {
    return [];
  }

  const [rows] = await connection.query(
    `SELECT ${SELECT_COLUMNS}
     FROM ${COLLABORATION_REQUEST_TABLE}
     WHERE status = ?
     ORDER BY created_at DESC, id DESC`,
    [status]
  );

  return rows.map(mapCollaborationRequestRow);
}

async function getCollaborationRequestDocumentById(id, connection = db) {
  const [rows] = await connection.query(
    `SELECT id,
            supporting_document_name,
            supporting_document_mime,
            supporting_document_size,
            supporting_document_path
     FROM ${COLLABORATION_REQUEST_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    supporting_document_name: cleanText(row.supporting_document_name) || null,
    supporting_document_mime: cleanText(row.supporting_document_mime) || null,
    supporting_document_size: toNullableInteger(row.supporting_document_size),
    supporting_document_path: cleanText(row.supporting_document_path) || null,
  };
}

async function updateCollaborationRequestDocumentStorage(id, updates = {}, connection = db) {
  const columns = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(updates, 'supporting_document_name')) {
    columns.push('supporting_document_name = ?');
    values.push(toNullableText(updates.supporting_document_name));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'supporting_document_mime')) {
    columns.push('supporting_document_mime = ?');
    values.push(toNullableText(updates.supporting_document_mime));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'supporting_document_size')) {
    columns.push('supporting_document_size = ?');
    values.push(toNullableInteger(updates.supporting_document_size));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'supporting_document_path')) {
    columns.push('supporting_document_path = ?');
    values.push(toNullableText(updates.supporting_document_path));
  }

  if (columns.length === 0) {
    return false;
  }

  values.push(id);

  const [result] = await connection.query(
    `UPDATE ${COLLABORATION_REQUEST_TABLE}
     SET ${columns.join(', ')}
     WHERE id = ?
     LIMIT 1`,
    values,
  );

  return Number(result.affectedRows) > 0;
}

async function approveCollaborationRequestById(id) {
  await ensureCollaborationRequestTable();

  const [rows] = await db.query(
    `SELECT id, status
     FROM ${COLLABORATION_REQUEST_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return { outcome: 'not_found' };
  }

  const currentStatus = cleanText(rows[0].status).toLowerCase();

  if (currentStatus === COLLABORATION_STATUS_ACTIVE) {
    const request = await getCollaborationRequestById(id);
    return { outcome: 'already_active', request };
  }

  await db.query(
    `UPDATE ${COLLABORATION_REQUEST_TABLE}
     SET status = ?
     WHERE id = ?`,
    [COLLABORATION_STATUS_ACTIVE, id]
  );

  const request = await getCollaborationRequestById(id);

  return { outcome: 'approved', request };
}

async function rejectCollaborationRequestById(id) {
  await ensureCollaborationRequestTable();

  const [rows] = await db.query(
    `SELECT id, status
     FROM ${COLLABORATION_REQUEST_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return { outcome: 'not_found' };
  }

  const currentStatus = cleanText(rows[0].status).toLowerCase();

  if (currentStatus === COLLABORATION_STATUS_REJECTED) {
    const request = await getCollaborationRequestById(id);
    return { outcome: 'already_rejected', request };
  }

  await db.query(
    `UPDATE ${COLLABORATION_REQUEST_TABLE}
     SET status = ?
     WHERE id = ?`,
    [COLLABORATION_STATUS_REJECTED, id]
  );

  const request = await getCollaborationRequestById(id);

  return { outcome: 'rejected', request };
}

async function deleteCollaborationRequest(id, connection = db) {
  const [result] = await connection.query(
    `DELETE FROM ${COLLABORATION_REQUEST_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return Number(result.affectedRows) > 0;
}

module.exports = {
  COLLABORATION_REQUEST_TABLE,
  COLLABORATION_STATUS_PENDING,
  COLLABORATION_STATUS_ACTIVE,
  COLLABORATION_STATUS_REJECTED,
  normalizeCollaborationPayload,
  ensureCollaborationRequestTable,
  createCollaborationRequest,
  getCollaborationRequestById,
  getCollaborationRequestsByStatus,
  getCollaborationRequestDocumentById,
  updateCollaborationRequestDocumentStorage,
  approveCollaborationRequestById,
  rejectCollaborationRequestById,
  deleteCollaborationRequest,
};
