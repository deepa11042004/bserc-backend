const db = require('../config/db');

const ADVISORY_REGISTRATION_TABLE = 'advisory_board_applications';
const ADVISORY_STATUS_PENDING = 'pending';
const ADVISORY_STATUS_ACTIVE = 'active';
const VALID_ADVISORY_STATUSES = new Set([
  ADVISORY_STATUS_PENDING,
  ADVISORY_STATUS_ACTIVE,
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

function toNullableInt(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
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

function toJsonArrayText(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((item) => cleanText(item))
    .filter((item) => Boolean(item));

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

function mapAdvisoryRecord(row) {
  return {
    id: Number(row.id),
    full_name: row.full_name,
    designation: row.designation,
    organization_institution: row.organization_institution,
    department_specialisation: row.department_specialisation,
    official_email: row.official_email,
    alternative_email: row.alternative_email,
    mobile_number: row.mobile_number,
    location_text: row.location_text,
    highest_qualification: row.highest_qualification,
    qualification_year: row.qualification_year,
    experience_years: row.experience_years === null ? null : Number(row.experience_years),
    key_research_areas: row.key_research_areas,
    professional_expertise: row.professional_expertise,
    preferred_contributions: parseJsonArray(row.preferred_contributions_json),
    preferred_contribution_other: row.preferred_contribution_other,
    contribution_modes: parseJsonArray(row.contribution_modes_json),
    contribution_mode_other: row.contribution_mode_other,
    monthly_hours: row.monthly_hours === null ? null : Number(row.monthly_hours),
    interaction_modes: parseJsonArray(row.interaction_modes_json),
    availability_period: row.availability_period,
    suggestions: parseJsonArray(row.suggestions_json),
    viksit_bharat_contribution: row.viksit_bharat_contribution,
    media_support: row.media_support === null ? null : toBoolean(row.media_support),
    media_tools: row.media_tools,
    declaration_accepted: toBoolean(row.declaration_accepted),
    status: cleanText(row.status).toLowerCase() || ADVISORY_STATUS_PENDING,
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
  };
}

async function ensureAdvisoryRegistrationTable(connection = db) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS ${ADVISORY_REGISTRATION_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(200) NOT NULL,
      designation VARCHAR(200) NOT NULL,
      organization_institution VARCHAR(255) NOT NULL,
      department_specialisation VARCHAR(255) NULL,
      official_email VARCHAR(255) NOT NULL,
      alternative_email VARCHAR(255) NULL,
      mobile_number VARCHAR(50) NOT NULL,
      location_text VARCHAR(255) NULL,
      highest_qualification VARCHAR(255) NULL,
      qualification_year VARCHAR(20) NULL,
      experience_years INT NULL,
      key_research_areas TEXT NULL,
      professional_expertise TEXT NULL,
      preferred_contributions_json LONGTEXT NULL,
      preferred_contribution_other VARCHAR(255) NULL,
      contribution_modes_json LONGTEXT NULL,
      contribution_mode_other VARCHAR(255) NULL,
      monthly_hours INT NULL,
      interaction_modes_json LONGTEXT NULL,
      availability_period VARCHAR(255) NULL,
      suggestions_json LONGTEXT NULL,
      viksit_bharat_contribution TEXT NULL,
      media_support TINYINT(1) NULL,
      media_tools TEXT NULL,
      declaration_accepted TINYINT(1) NOT NULL DEFAULT 0,
      status ENUM('pending', 'active') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_advisory_status (status),
      INDEX idx_advisory_created_at (created_at),
      INDEX idx_advisory_official_email (official_email)
    )`
  );
}

async function createAdvisoryRegistration(payload, connection = db) {
  await ensureAdvisoryRegistrationTable(connection);

  const [result] = await connection.query(
    `INSERT INTO ${ADVISORY_REGISTRATION_TABLE} (
      full_name,
      designation,
      organization_institution,
      department_specialisation,
      official_email,
      alternative_email,
      mobile_number,
      location_text,
      highest_qualification,
      qualification_year,
      experience_years,
      key_research_areas,
      professional_expertise,
      preferred_contributions_json,
      preferred_contribution_other,
      contribution_modes_json,
      contribution_mode_other,
      monthly_hours,
      interaction_modes_json,
      availability_period,
      suggestions_json,
      viksit_bharat_contribution,
      media_support,
      media_tools,
      declaration_accepted,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cleanText(payload.full_name),
      cleanText(payload.designation),
      cleanText(payload.organization_institution),
      toNullableText(payload.department_specialisation),
      normalizeEmail(payload.official_email),
      toNullableText(payload.alternative_email),
      cleanText(payload.mobile_number),
      toNullableText(payload.location_text),
      toNullableText(payload.highest_qualification),
      toNullableText(payload.qualification_year),
      toNullableInt(payload.experience_years),
      toNullableText(payload.key_research_areas),
      toNullableText(payload.professional_expertise),
      toJsonArrayText(payload.preferred_contributions),
      toNullableText(payload.preferred_contribution_other),
      toJsonArrayText(payload.contribution_modes),
      toNullableText(payload.contribution_mode_other),
      toNullableInt(payload.monthly_hours),
      toJsonArrayText(payload.interaction_modes),
      toNullableText(payload.availability_period),
      toJsonArrayText(payload.suggestions),
      toNullableText(payload.viksit_bharat_contribution),
      payload.media_support === null || payload.media_support === undefined
        ? null
        : (toBoolean(payload.media_support) ? 1 : 0),
      toNullableText(payload.media_tools),
      toBoolean(payload.declaration_accepted) ? 1 : 0,
      ADVISORY_STATUS_PENDING,
    ]
  );

  return Number(result.insertId);
}

async function getAdvisoryById(id) {
  await ensureAdvisoryRegistrationTable();

  const [rows] = await db.query(
    `SELECT *
     FROM ${ADVISORY_REGISTRATION_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapAdvisoryRecord(rows[0]);
}

async function getAdvisoriesByStatus(status) {
  await ensureAdvisoryRegistrationTable();

  if (!VALID_ADVISORY_STATUSES.has(status)) {
    return [];
  }

  const [rows] = await db.query(
    `SELECT *
     FROM ${ADVISORY_REGISTRATION_TABLE}
     WHERE status = ?
     ORDER BY created_at DESC, id DESC`,
    [status]
  );

  return rows.map(mapAdvisoryRecord);
}

async function getPendingAdvisoryMembers() {
  return getAdvisoriesByStatus(ADVISORY_STATUS_PENDING);
}

async function getActiveAdvisoryMembers() {
  return getAdvisoriesByStatus(ADVISORY_STATUS_ACTIVE);
}

async function getAdvisoriesForAdmin(status, options = {}) {
  await ensureAdvisoryRegistrationTable();

  if (!VALID_ADVISORY_STATUSES.has(status)) {
    return { advisories: [], page: 1, pageSize: 50, total: 0, totalPages: 1 };
  }

  const isExportAll = options.exportAll === true || options.exportAll === 'true';
  const page = Number(options.page) || 1;
  const pageSize = Number(options.pageSize) || 50;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = isExportAll
    ? null
    : (Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 200) : 50);
  const offset = isExportAll ? 0 : (safePage - 1) * safePageSize;

  const contributionArea = cleanText(options.contributionArea);
  const contributionMode = cleanText(options.contributionMode);
  const search = cleanText(options.search).toLowerCase();

  const whereClauses = ['status = ?'];
  const whereParams = [status];

  if (contributionArea && contributionArea.toLowerCase() !== 'all') {
    whereClauses.push('preferred_contributions_json LIKE ?');
    whereParams.push(`%"${contributionArea}"%`);
  }

  if (contributionMode && contributionMode.toLowerCase() !== 'all') {
    whereClauses.push('contribution_modes_json LIKE ?');
    whereParams.push(`%"${contributionMode}"%`);
  }

  if (search) {
    whereClauses.push(
      '(LOWER(full_name) LIKE ? OR LOWER(official_email) LIKE ? OR mobile_number LIKE ?)'
    );
    const likeValue = `%${search}%`;
    whereParams.push(likeValue, likeValue, `%${cleanText(options.search)}%`);
  }

  const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

  const [rows] = await db.query(
    `SELECT *
     FROM ${ADVISORY_REGISTRATION_TABLE}
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     ${isExportAll ? '' : 'LIMIT ? OFFSET ?'}`,
    isExportAll ? [...whereParams] : [...whereParams, safePageSize, offset]
  );

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM ${ADVISORY_REGISTRATION_TABLE}
     ${whereSql}`,
    whereParams
  );

  const total = Number(countRows?.[0]?.total || 0);
  const effectivePageSize = isExportAll ? (total || 1) : safePageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

  return {
    advisories: rows.map(mapAdvisoryRecord),
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
  };
}

async function getActiveAdvisoriesForAdmin(options = {}) {
  return getAdvisoriesForAdmin(ADVISORY_STATUS_ACTIVE, options);
}

async function getPendingAdvisoriesForAdmin(options = {}) {
  return getAdvisoriesForAdmin(ADVISORY_STATUS_PENDING, options);
}

async function approveAdvisoryById(id) {
  await ensureAdvisoryRegistrationTable();

  const [rows] = await db.query(
    `SELECT id, status
     FROM ${ADVISORY_REGISTRATION_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return { outcome: 'not_found' };
  }

  const currentStatus = cleanText(rows[0].status).toLowerCase();

  if (currentStatus === ADVISORY_STATUS_ACTIVE) {
    const advisory = await getAdvisoryById(id);
    return { outcome: 'already_active', advisory };
  }

  if (currentStatus && currentStatus !== ADVISORY_STATUS_PENDING) {
    return { outcome: 'invalid_status', status: currentStatus };
  }

  await db.query(
    `UPDATE ${ADVISORY_REGISTRATION_TABLE}
     SET status = ?
     WHERE id = ?`,
    [ADVISORY_STATUS_ACTIVE, id]
  );

  const advisory = await getAdvisoryById(id);

  return {
    outcome: 'approved',
    advisory,
  };
}

async function moveAdvisoryToPendingById(id) {
  await ensureAdvisoryRegistrationTable();

  const [rows] = await db.query(
    `SELECT id, status
     FROM ${ADVISORY_REGISTRATION_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return { outcome: 'not_found' };
  }

  const currentStatus = cleanText(rows[0].status).toLowerCase();

  if (currentStatus === ADVISORY_STATUS_PENDING) {
    const advisory = await getAdvisoryById(id);
    return { outcome: 'already_pending', advisory };
  }

  if (currentStatus && currentStatus !== ADVISORY_STATUS_ACTIVE) {
    return { outcome: 'invalid_status', status: currentStatus };
  }

  await db.query(
    `UPDATE ${ADVISORY_REGISTRATION_TABLE}
     SET status = ?
     WHERE id = ?`,
    [ADVISORY_STATUS_PENDING, id]
  );

  const advisory = await getAdvisoryById(id);

  return {
    outcome: 'moved_to_pending',
    advisory,
  };
}

async function rejectAdvisoryById(id) {
  await ensureAdvisoryRegistrationTable();

  const [result] = await db.query(
    `DELETE FROM ${ADVISORY_REGISTRATION_TABLE}
     WHERE id = ?`,
    [id]
  );

  if (!result || Number(result.affectedRows || 0) === 0) {
    return { outcome: 'not_found' };
  }

  return { outcome: 'deleted' };
}

module.exports = {
  ensureAdvisoryRegistrationTable,
  createAdvisoryRegistration,
  getAdvisoryById,
  getPendingAdvisoryMembers,
  getActiveAdvisoryMembers,
  getActiveAdvisoriesForAdmin,
  getPendingAdvisoriesForAdmin,
  approveAdvisoryById,
  moveAdvisoryToPendingById,
  rejectAdvisoryById,
};
