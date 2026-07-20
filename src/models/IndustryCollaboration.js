const db = require('../config/db');

const INDUSTRY_COLLAB_TABLE = 'industry_collaborations';
const INDUSTRY_COLLAB_STATUS_PENDING = 'pending';
const INDUSTRY_COLLAB_STATUS_ACTIVE = 'active';
const INDUSTRY_COLLAB_STATUS_REJECTED = 'rejected';
const VALID_INDUSTRY_COLLAB_STATUSES = new Set([
  INDUSTRY_COLLAB_STATUS_PENDING,
  INDUSTRY_COLLAB_STATUS_ACTIVE,
  INDUSTRY_COLLAB_STATUS_REJECTED,
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

function mapIndustryCollaborationRecord(row) {
  return {
    id: Number(row.id),
    contact_email: row.contact_email,
    organization_name: row.organization_name,
    organization_type: row.organization_type,
    other_organization_type: row.other_organization_type,
    website_url: row.website_url,
    registered_address: row.registered_address,
    country_state_city: row.country_state_city,
    representative_full_name: row.representative_full_name,
    representative_designation: row.representative_designation,
    representative_department: row.representative_department,
    representative_official_email: row.representative_official_email,
    representative_contact_number: row.representative_contact_number,
    representative_linkedin: row.representative_linkedin,
    certification_academic_interests: parseJsonArray(row.certification_academic_interests_json),
    sponsorship_outreach_interests: parseJsonArray(row.sponsorship_outreach_interests_json),
    technical_industry_interests: parseJsonArray(row.technical_industry_interests_json),
    domain_areas: parseJsonArray(row.domain_areas_json),
    other_domain_area: row.other_domain_area,
    sponsorship_categories: parseJsonArray(row.sponsorship_categories_json),
    support_category: row.support_category,
    other_support_category: row.other_support_category,
    declaration_agree: Boolean(row.declaration_agree),
    signatory_name: row.signatory_name,
    signatory_designation: row.signatory_designation,
    contact_information: row.contact_information,
    any_query: row.any_query,
    status: cleanText(row.status).toLowerCase() || INDUSTRY_COLLAB_STATUS_PENDING,
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
  };
}

async function ensureIndustryCollaborationsTable(connection = db) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS ${INDUSTRY_COLLAB_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contact_email VARCHAR(255) NOT NULL,
      organization_name VARCHAR(255) NOT NULL,
      organization_type VARCHAR(100) NOT NULL,
      other_organization_type VARCHAR(255) NULL,
      website_url VARCHAR(255) NOT NULL,
      registered_address TEXT NOT NULL,
      country_state_city VARCHAR(255) NOT NULL,
      representative_full_name VARCHAR(200) NOT NULL,
      representative_designation VARCHAR(200) NOT NULL,
      representative_department VARCHAR(200) NOT NULL,
      representative_official_email VARCHAR(255) NOT NULL,
      representative_contact_number VARCHAR(50) NOT NULL,
      representative_linkedin VARCHAR(255) NULL,
      certification_academic_interests_json LONGTEXT NULL,
      sponsorship_outreach_interests_json LONGTEXT NULL,
      technical_industry_interests_json LONGTEXT NULL,
      domain_areas_json LONGTEXT NULL,
      other_domain_area VARCHAR(255) NULL,
      sponsorship_categories_json LONGTEXT NULL,
      support_category VARCHAR(100) NOT NULL,
      other_support_category VARCHAR(255) NULL,
      declaration_agree TINYINT(1) NOT NULL DEFAULT 0,
      signatory_name VARCHAR(200) NOT NULL,
      signatory_designation VARCHAR(200) NOT NULL,
      contact_information VARCHAR(255) NOT NULL,
      any_query TEXT NULL,
      status ENUM('pending', 'active', 'rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_industry_collab_status (status),
      INDEX idx_industry_collab_created_at (created_at),
      INDEX idx_industry_collab_email (contact_email)
    )`
  );
}

async function createIndustryCollaboration(payload, connection = db) {
  await ensureIndustryCollaborationsTable(connection);

  const [result] = await connection.query(
    `INSERT INTO ${INDUSTRY_COLLAB_TABLE} (
      contact_email, organization_name, organization_type, other_organization_type, website_url,
      registered_address, country_state_city, representative_full_name, representative_designation,
      representative_department, representative_official_email, representative_contact_number,
      representative_linkedin, certification_academic_interests_json, sponsorship_outreach_interests_json,
      technical_industry_interests_json, domain_areas_json, other_domain_area, sponsorship_categories_json,
      support_category, other_support_category, declaration_agree, signatory_name, signatory_designation,
      contact_information, any_query, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      normalizeEmail(payload.contact_email),
      cleanText(payload.organization_name),
      cleanText(payload.organization_type),
      toNullableText(payload.other_organization_type),
      cleanText(payload.website_url),
      cleanText(payload.registered_address),
      cleanText(payload.country_state_city),
      cleanText(payload.representative_full_name),
      cleanText(payload.representative_designation),
      cleanText(payload.representative_department),
      normalizeEmail(payload.representative_official_email),
      cleanText(payload.representative_contact_number),
      toNullableText(payload.representative_linkedin),
      toJsonArrayText(payload.certification_academic_interests),
      toJsonArrayText(payload.sponsorship_outreach_interests),
      toJsonArrayText(payload.technical_industry_interests),
      toJsonArrayText(payload.domain_areas),
      toNullableText(payload.other_domain_area),
      toJsonArrayText(payload.sponsorship_categories),
      cleanText(payload.support_category),
      toNullableText(payload.other_support_category),
      toBooleanFlag(payload.declaration_agree),
      cleanText(payload.signatory_name),
      cleanText(payload.signatory_designation),
      cleanText(payload.contact_information),
      toNullableText(payload.any_query),
      INDUSTRY_COLLAB_STATUS_PENDING,
    ]
  );

  return Number(result.insertId);
}

async function getIndustryCollaborationById(id) {
  await ensureIndustryCollaborationsTable();

  const [rows] = await db.query(
    `SELECT * FROM ${INDUSTRY_COLLAB_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapIndustryCollaborationRecord(rows[0]);
}

async function getIndustryCollaborationsByStatus(status) {
  await ensureIndustryCollaborationsTable();

  if (!VALID_INDUSTRY_COLLAB_STATUSES.has(status)) {
    return [];
  }

  const [rows] = await db.query(
    `SELECT * FROM ${INDUSTRY_COLLAB_TABLE} WHERE status = ? ORDER BY created_at DESC, id DESC`,
    [status]
  );

  return rows.map(mapIndustryCollaborationRecord);
}

async function approveIndustryCollaborationById(id) {
  await ensureIndustryCollaborationsTable();

  const [rows] = await db.query(
    `SELECT id, status FROM ${INDUSTRY_COLLAB_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return { outcome: 'not_found' };
  }

  const currentStatus = cleanText(rows[0].status).toLowerCase();

  if (currentStatus === INDUSTRY_COLLAB_STATUS_ACTIVE) {
    const application = await getIndustryCollaborationById(id);
    return { outcome: 'already_active', application };
  }

  await db.query(
    `UPDATE ${INDUSTRY_COLLAB_TABLE} SET status = ? WHERE id = ?`,
    [INDUSTRY_COLLAB_STATUS_ACTIVE, id]
  );

  const application = await getIndustryCollaborationById(id);

  return { outcome: 'approved', application };
}

async function rejectIndustryCollaborationById(id) {
  await ensureIndustryCollaborationsTable();

  const [rows] = await db.query(
    `SELECT id, status FROM ${INDUSTRY_COLLAB_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return { outcome: 'not_found' };
  }

  const currentStatus = cleanText(rows[0].status).toLowerCase();

  if (currentStatus === INDUSTRY_COLLAB_STATUS_REJECTED) {
    const application = await getIndustryCollaborationById(id);
    return { outcome: 'already_rejected', application };
  }

  await db.query(
    `UPDATE ${INDUSTRY_COLLAB_TABLE} SET status = ? WHERE id = ?`,
    [INDUSTRY_COLLAB_STATUS_REJECTED, id]
  );

  const application = await getIndustryCollaborationById(id);

  return { outcome: 'rejected', application };
}

module.exports = {
  INDUSTRY_COLLAB_STATUS_PENDING,
  INDUSTRY_COLLAB_STATUS_ACTIVE,
  INDUSTRY_COLLAB_STATUS_REJECTED,
  ensureIndustryCollaborationsTable,
  createIndustryCollaboration,
  getIndustryCollaborationById,
  getIndustryCollaborationsByStatus,
  approveIndustryCollaborationById,
  rejectIndustryCollaborationById,
};
