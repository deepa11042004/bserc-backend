const db = require('../config/db');

const SPEAKER_TABLE = 'speaker_applications';
const SPEAKER_STATUS_PENDING = 'pending';
const SPEAKER_STATUS_ACTIVE = 'active';
const SPEAKER_STATUS_REJECTED = 'rejected';
const VALID_SPEAKER_STATUSES = new Set([
  SPEAKER_STATUS_PENDING,
  SPEAKER_STATUS_ACTIVE,
  SPEAKER_STATUS_REJECTED,
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

function toBooleanFlag(value) {
  return value ? 1 : 0;
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

function mapSpeakerRecord(row) {
  return {
    id: Number(row.id),
    full_name: row.full_name,
    preferred_name: row.preferred_name,
    email: row.email,
    mobile_number: row.mobile_number,
    whatsapp_number: row.whatsapp_number,
    designation: row.designation,
    organization: row.organization,
    country: row.country,
    city: row.city,
    linkedin_profile: row.linkedin_profile,
    website_url: row.website_url,
    bio: row.bio,
    areas_of_expertise: parseJsonArray(row.areas_of_expertise_json),
    other_expertise_specify: row.other_expertise_specify,
    years_experience: row.years_experience,
    prior_speaking_links: row.prior_speaking_links,
    prior_speaking_events: row.prior_speaking_events,
    session_title: row.session_title,
    session_type: row.session_type,
    track: row.track,
    target_audience: parseJsonArray(row.target_audience_json),
    audience_level: row.audience_level,
    abstract: row.abstract,
    learning_outcomes: row.learning_outcomes,
    duration: row.duration,
    session_format: row.session_format,
    preferred_mode: row.preferred_mode,
    availability_window: row.availability_window,
    timezone: row.timezone,
    technical_requirements: parseJsonArray(row.technical_requirements_json),
    other_technical_requirement: row.other_technical_requirement,
    needs_bserc_support: row.needs_bserc_support,
    bserc_support_details: row.bserc_support_details,
    permission_promo: Boolean(row.permission_promo),
    permission_recording: Boolean(row.permission_recording),
    honorarium_expectation: row.honorarium_expectation,
    willingness: parseJsonArray(row.willingness_json),
    declaration_confirm: Boolean(row.declaration_confirm),
    data_consent: Boolean(row.data_consent),
    has_ppt_outline: Boolean(row.ppt_outline_path),
    has_speaker_photo: Boolean(row.speaker_photo_path),
    has_brochure: Boolean(row.brochure_path),
    status: cleanText(row.status).toLowerCase() || SPEAKER_STATUS_PENDING,
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
  };
}

async function ensureSpeakerApplicationsTable(connection = db) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS ${SPEAKER_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(200) NOT NULL,
      preferred_name VARCHAR(200) NULL,
      email VARCHAR(255) NOT NULL,
      mobile_number VARCHAR(50) NOT NULL,
      whatsapp_number VARCHAR(50) NULL,
      designation VARCHAR(200) NOT NULL,
      organization VARCHAR(255) NOT NULL,
      country VARCHAR(100) NOT NULL,
      city VARCHAR(100) NOT NULL,
      linkedin_profile VARCHAR(255) NULL,
      website_url VARCHAR(255) NULL,
      bio TEXT NOT NULL,
      areas_of_expertise_json LONGTEXT NULL,
      other_expertise_specify VARCHAR(255) NULL,
      years_experience VARCHAR(50) NOT NULL,
      prior_speaking_links TEXT NULL,
      prior_speaking_events TEXT NULL,
      session_title VARCHAR(255) NOT NULL,
      session_type VARCHAR(100) NOT NULL,
      track VARCHAR(150) NOT NULL,
      target_audience_json LONGTEXT NULL,
      audience_level VARCHAR(50) NOT NULL,
      abstract TEXT NOT NULL,
      learning_outcomes TEXT NOT NULL,
      duration VARCHAR(100) NOT NULL,
      session_format VARCHAR(100) NOT NULL,
      preferred_mode VARCHAR(150) NOT NULL,
      availability_window VARCHAR(255) NOT NULL,
      timezone VARCHAR(100) NOT NULL,
      technical_requirements_json LONGTEXT NULL,
      other_technical_requirement VARCHAR(255) NULL,
      needs_bserc_support VARCHAR(10) NOT NULL,
      bserc_support_details TEXT NULL,
      permission_promo TINYINT(1) NOT NULL DEFAULT 0,
      permission_recording TINYINT(1) NOT NULL DEFAULT 0,
      honorarium_expectation VARCHAR(255) NULL,
      willingness_json LONGTEXT NULL,
      declaration_confirm TINYINT(1) NOT NULL DEFAULT 0,
      data_consent TINYINT(1) NOT NULL DEFAULT 0,
      ppt_outline_path VARCHAR(500) NULL,
      speaker_photo_path VARCHAR(500) NULL,
      brochure_path VARCHAR(500) NULL,
      status ENUM('pending', 'active', 'rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_speaker_status (status),
      INDEX idx_speaker_created_at (created_at),
      INDEX idx_speaker_email (email)
    )`
  );
}

async function createSpeakerApplication(payload, connection = db) {
  await ensureSpeakerApplicationsTable(connection);

  const [result] = await connection.query(
    `INSERT INTO ${SPEAKER_TABLE} (
      full_name, preferred_name, email, mobile_number, whatsapp_number, designation, organization,
      country, city, linkedin_profile, website_url, bio, areas_of_expertise_json, other_expertise_specify,
      years_experience, prior_speaking_links, prior_speaking_events, session_title, session_type, track,
      target_audience_json, audience_level, abstract, learning_outcomes, duration, session_format,
      preferred_mode, availability_window, timezone, technical_requirements_json, other_technical_requirement,
      needs_bserc_support, bserc_support_details, permission_promo, permission_recording,
      honorarium_expectation, willingness_json, declaration_confirm, data_consent,
      ppt_outline_path, speaker_photo_path, brochure_path, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cleanText(payload.full_name),
      toNullableText(payload.preferred_name),
      normalizeEmail(payload.email),
      cleanText(payload.mobile_number),
      toNullableText(payload.whatsapp_number),
      cleanText(payload.designation),
      cleanText(payload.organization),
      cleanText(payload.country),
      cleanText(payload.city),
      toNullableText(payload.linkedin_profile),
      toNullableText(payload.website_url),
      cleanText(payload.bio),
      toJsonArrayText(payload.areas_of_expertise),
      toNullableText(payload.other_expertise_specify),
      cleanText(payload.years_experience),
      toNullableText(payload.prior_speaking_links),
      toNullableText(payload.prior_speaking_events),
      cleanText(payload.session_title),
      cleanText(payload.session_type),
      cleanText(payload.track),
      toJsonArrayText(payload.target_audience),
      cleanText(payload.audience_level),
      cleanText(payload.abstract),
      cleanText(payload.learning_outcomes),
      cleanText(payload.duration),
      cleanText(payload.session_format),
      cleanText(payload.preferred_mode),
      cleanText(payload.availability_window),
      cleanText(payload.timezone),
      toJsonArrayText(payload.technical_requirements),
      toNullableText(payload.other_technical_requirement),
      cleanText(payload.needs_bserc_support),
      toNullableText(payload.bserc_support_details),
      toBooleanFlag(payload.permission_promo),
      toBooleanFlag(payload.permission_recording),
      toNullableText(payload.honorarium_expectation),
      toJsonArrayText(payload.willingness),
      toBooleanFlag(payload.declaration_confirm),
      toBooleanFlag(payload.data_consent),
      toNullableText(payload.ppt_outline_path),
      toNullableText(payload.speaker_photo_path),
      toNullableText(payload.brochure_path),
      SPEAKER_STATUS_PENDING,
    ]
  );

  return Number(result.insertId);
}

async function getSpeakerApplicationById(id) {
  await ensureSpeakerApplicationsTable();

  const [rows] = await db.query(
    `SELECT * FROM ${SPEAKER_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapSpeakerRecord(rows[0]);
}

async function getSpeakerApplicationFilePath(id, field) {
  await ensureSpeakerApplicationsTable();

  const columnByField = {
    ppt_outline: 'ppt_outline_path',
    speaker_photo: 'speaker_photo_path',
    brochure: 'brochure_path',
  };

  const column = columnByField[field];
  if (!column) {
    return null;
  }

  const [rows] = await db.query(
    `SELECT ${column} AS file_path FROM ${SPEAKER_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );

  if (rows.length === 0 || !rows[0].file_path) {
    return null;
  }

  return rows[0].file_path;
}

async function getSpeakerApplicationsByStatus(status) {
  await ensureSpeakerApplicationsTable();

  if (!VALID_SPEAKER_STATUSES.has(status)) {
    return [];
  }

  const [rows] = await db.query(
    `SELECT * FROM ${SPEAKER_TABLE} WHERE status = ? ORDER BY created_at DESC, id DESC`,
    [status]
  );

  return rows.map(mapSpeakerRecord);
}

async function approveSpeakerApplicationById(id) {
  await ensureSpeakerApplicationsTable();

  const [rows] = await db.query(
    `SELECT id, status FROM ${SPEAKER_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return { outcome: 'not_found' };
  }

  const currentStatus = cleanText(rows[0].status).toLowerCase();

  if (currentStatus === SPEAKER_STATUS_ACTIVE) {
    const application = await getSpeakerApplicationById(id);
    return { outcome: 'already_active', application };
  }

  await db.query(
    `UPDATE ${SPEAKER_TABLE} SET status = ? WHERE id = ?`,
    [SPEAKER_STATUS_ACTIVE, id]
  );

  const application = await getSpeakerApplicationById(id);

  return { outcome: 'approved', application };
}

async function rejectSpeakerApplicationById(id) {
  await ensureSpeakerApplicationsTable();

  const [rows] = await db.query(
    `SELECT id, status FROM ${SPEAKER_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return { outcome: 'not_found' };
  }

  const currentStatus = cleanText(rows[0].status).toLowerCase();

  if (currentStatus === SPEAKER_STATUS_REJECTED) {
    const application = await getSpeakerApplicationById(id);
    return { outcome: 'already_rejected', application };
  }

  await db.query(
    `UPDATE ${SPEAKER_TABLE} SET status = ? WHERE id = ?`,
    [SPEAKER_STATUS_REJECTED, id]
  );

  const application = await getSpeakerApplicationById(id);

  return { outcome: 'rejected', application };
}

module.exports = {
  SPEAKER_STATUS_PENDING,
  SPEAKER_STATUS_ACTIVE,
  SPEAKER_STATUS_REJECTED,
  ensureSpeakerApplicationsTable,
  createSpeakerApplication,
  getSpeakerApplicationById,
  getSpeakerApplicationFilePath,
  getSpeakerApplicationsByStatus,
  approveSpeakerApplicationById,
  rejectSpeakerApplicationById,
};
