const db = require('../config/db');

const PROJECT_LISTING_TABLE = 'project_listings';

const PROGRAMME_OPTIONS = Object.freeze(['ug', 'pg', 'phd', 'faculty', 'other']);
const THEME_OPTIONS = Object.freeze([
  'defence-space',
  'ai-ml',
  'aerospace',
  'drone-uav',
  'remote-sensing',
  'robotics',
  'satellite',
  'other',
]);
const LEVEL_OPTIONS = Object.freeze(['concept', 'proposal', 'ongoing', 'completed']);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const URL_REGEX = /^https?:\/\/.+/;
const PIN_REGEX = /^[0-9]{6}$/;

// ─── Text helpers ────────────────────────────────────────────────────────────

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

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (value === null || value === undefined) return null;
  const normalized = cleanText(value).toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  return null;
}

function toNullableBoolean(value) {
  const result = toBoolean(value);
  return result === null ? null : result;
}

function isValidDateString(value) {
  if (!DATE_REGEX.test(value)) return false;
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day
  );
}

function formatDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split('T')[0];
  const asString = String(value).trim();
  return asString || null;
}

function formatDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const asString = String(value).trim();
  return asString || null;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value.map((v) => cleanText(v)).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch {
      // Not JSON — treat as single-value or comma-separated
      return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
    }
  }
  return [];
}

function serializeJsonArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return JSON.stringify(arr);
}

function deserializeJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  return [];
}

// ─── Table creation ──────────────────────────────────────────────────────────

async function ensureProjectListingsTable(connection = db) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS ${PROJECT_LISTING_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,

      -- Section 1: Personal & Institutional Details
      full_name VARCHAR(255) NOT NULL,
      primary_email VARCHAR(255) NOT NULL,
      alternative_email VARCHAR(255) NULL,
      whatsapp_number VARCHAR(30) NULL,
      institution VARCHAR(255) NOT NULL,
      department VARCHAR(255) NOT NULL,
      programme VARCHAR(40) NOT NULL,
      programme_other VARCHAR(255) NULL,

      -- Section 2: Registration Details
      is_registered TINYINT(1) NULL DEFAULT NULL,
      portal_name VARCHAR(255) NULL,
      registration_number VARCHAR(255) NULL,
      registration_date DATE NULL,

      -- Section 2: Publication Details
      is_published TINYINT(1) NULL DEFAULT NULL,
      publication_type JSON NULL,
      publication_title VARCHAR(500) NULL,
      publication_venue VARCHAR(500) NULL,
      publication_date DATE NULL,
      publication_link VARCHAR(1000) NULL,

      -- Section 2: Address Details
      address_line1 TEXT NOT NULL,
      city VARCHAR(120) NOT NULL,
      state VARCHAR(120) NOT NULL,
      pin_code VARCHAR(10) NOT NULL,
      country VARCHAR(80) NOT NULL DEFAULT 'India',

      -- Section 3: Project Basic Info
      project_title VARCHAR(500) NOT NULL,
      project_theme VARCHAR(60) NOT NULL,
      project_theme_other VARCHAR(255) NULL,
      project_level VARCHAR(40) NOT NULL,
      project_start_date DATE NOT NULL,
      project_end_date DATE NULL,

      -- Section 4: Project Description
      project_objective TEXT NOT NULL,
      project_methodology TEXT NOT NULL,
      project_outcome TEXT NOT NULL,

      -- Section 5: Thesis / Dissertation Link
      is_thesis_linked TINYINT(1) NULL DEFAULT NULL,
      thesis_title VARCHAR(500) NULL,
      thesis_degree VARCHAR(255) NULL,
      thesis_supervisor VARCHAR(255) NULL,
      thesis_institution VARCHAR(255) NULL,

      -- Section 6: Collaboration Preferences
      seeking_collaborators TINYINT(1) NULL DEFAULT NULL,
      collaborator_types JSON NULL,
      collaboration_types JSON NULL,
      collaboration_other VARCHAR(500) NULL,

      -- Section 7: Funding & Support
      open_to_funding TINYINT(1) NULL DEFAULT NULL,
      funding_sources JSON NULL,
      funding_other VARCHAR(500) NULL,
      estimated_budget VARCHAR(120) NULL,
      current_support TEXT NULL,

      -- Section 8: Document & Link Details
      synopsis_link VARCHAR(1000) NULL,
      github_link VARCHAR(1000) NULL,
      drive_link VARCHAR(1000) NULL,
      demo_link VARCHAR(1000) NULL,
      supporting_doc_path VARCHAR(500) NULL,
      supporting_doc_mime_type VARCHAR(100) NULL,
      supporting_doc_file_name VARCHAR(255) NULL,

      -- Section 9: Contact & Additional
      preferred_contact JSON NULL,
      collaboration_requirements TEXT NULL,
      additional_remarks TEXT NULL,

      -- Section 10: Declaration
      declaration_accepted TINYINT(1) NOT NULL DEFAULT 0,

      -- Metadata
      submission_type VARCHAR(40) NOT NULL DEFAULT 'project_listing',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      -- Indexes
      INDEX idx_project_listings_email (primary_email),
      INDEX idx_project_listings_created_at (created_at),
      INDEX idx_project_listings_theme (project_theme)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

// ─── Normalize + validate input ──────────────────────────────────────────────

function normalizeProjectListingPayload(input = {}) {
  const payload = {
    // Section 1
    full_name: cleanText(input.fullName || input.full_name),
    primary_email: normalizeEmail(input.primaryEmail || input.primary_email),
    alternative_email: normalizeEmail(input.alternativeEmail || input.alternative_email) || null,
    whatsapp_number: toNullableText(input.whatsappNumber || input.whatsapp_number),
    institution: cleanText(input.institution),
    department: cleanText(input.department),
    programme: cleanText(input.programme),
    programme_other: toNullableText(input.programmeOther || input.programme_other),

    // Section 2: Registration
    is_registered: toNullableBoolean(input.isRegistered ?? input.is_registered),
    portal_name: toNullableText(input.portalName || input.portal_name),
    registration_number: toNullableText(input.registrationNumber || input.registration_number),
    registration_date: toNullableText(input.registrationDate || input.registration_date),

    // Section 2: Publication
    is_published: toNullableBoolean(input.isPublished ?? input.is_published),
    publication_type: parseJsonArray(input.publicationType || input.publication_type),
    publication_title: toNullableText(input.publicationTitle || input.publication_title),
    publication_venue: toNullableText(input.publicationVenue || input.publication_venue),
    publication_date: toNullableText(input.publicationDate || input.publication_date),
    publication_link: toNullableText(input.publicationLink || input.publication_link),

    // Section 2: Address
    address_line1: cleanText(input.addressLine1 || input.address_line1),
    city: cleanText(input.city),
    state: cleanText(input.state),
    pin_code: cleanText(input.pinCode || input.pin_code),
    country: cleanText(input.country) || 'India',

    // Section 3
    project_title: cleanText(input.projectTitle || input.project_title),
    project_theme: cleanText(input.projectTheme || input.project_theme),
    project_theme_other: toNullableText(input.projectThemeOther || input.project_theme_other),
    project_level: cleanText(input.projectLevel || input.project_level),
    project_start_date: cleanText(input.projectStartDate || input.project_start_date),
    project_end_date: toNullableText(input.projectEndDate || input.project_end_date),

    // Section 4
    project_objective: cleanText(input.projectObjective || input.project_objective),
    project_methodology: cleanText(input.projectMethodology || input.project_methodology),
    project_outcome: cleanText(input.projectOutcome || input.project_outcome),

    // Section 5
    is_thesis_linked: toNullableBoolean(input.isThesisLinked ?? input.is_thesis_linked),
    thesis_title: toNullableText(input.thesisTitle || input.thesis_title),
    thesis_degree: toNullableText(input.thesisDegree || input.thesis_degree),
    thesis_supervisor: toNullableText(input.thesisSupervisor || input.thesis_supervisor),
    thesis_institution: toNullableText(input.thesisInstitution || input.thesis_institution),

    // Section 6
    seeking_collaborators: toNullableBoolean(input.seekingCollaborators ?? input.seeking_collaborators),
    collaborator_types: parseJsonArray(input.collaboratorTypes || input.collaborator_types),
    collaboration_types: parseJsonArray(input.collaborationTypes || input.collaboration_types),
    collaboration_other: toNullableText(input.collaborationOther || input.collaboration_other),

    // Section 7
    open_to_funding: toNullableBoolean(input.openToFunding ?? input.open_to_funding),
    funding_sources: parseJsonArray(input.fundingSources || input.funding_sources),
    funding_other: toNullableText(input.fundingOther || input.funding_other),
    estimated_budget: toNullableText(input.estimatedBudget || input.estimated_budget),
    current_support: toNullableText(input.currentSupport || input.current_support),

    // Section 8
    synopsis_link: toNullableText(input.synopsisLink || input.synopsis_link),
    github_link: toNullableText(input.githubLink || input.github_link),
    drive_link: toNullableText(input.driveLink || input.drive_link),
    demo_link: toNullableText(input.demoLink || input.demo_link),
    supporting_doc_path: toNullableText(input.supporting_doc_path || input.supportingDocPath),
    supporting_doc_mime_type: toNullableText(input.supporting_doc_mime_type || input.supportingDocMimeType),
    supporting_doc_file_name: toNullableText(input.supporting_doc_file_name || input.supportingDocFileName),

    // Section 9
    preferred_contact: parseJsonArray(input.preferredContact || input.preferred_contact),
    collaboration_requirements: toNullableText(input.collaborationRequirements || input.collaboration_requirements),
    additional_remarks: toNullableText(input.additionalRemarks || input.additional_remarks),

    // Section 10
    declaration_accepted: toBoolean(input.declarationAccepted ?? input.declaration_accepted) === true,

    // Metadata
    submission_type: cleanText(input.submissionType || input.submission_type) || 'project_listing',
  };

  const errors = [];

  // Section 1 validations
  if (!payload.full_name) errors.push('Full name is required');
  if (!payload.primary_email) {
    errors.push('Primary email is required');
  } else if (!EMAIL_REGEX.test(payload.primary_email)) {
    errors.push('Invalid primary email format');
  }
  if (payload.alternative_email && !EMAIL_REGEX.test(payload.alternative_email)) {
    errors.push('Invalid alternative email format');
  }
  if (!payload.institution) errors.push('Institution is required');
  if (!payload.department) errors.push('Department is required');
  if (!payload.programme) {
    errors.push('Programme is required');
  } else if (!PROGRAMME_OPTIONS.includes(payload.programme)) {
    errors.push(`Programme must be one of: ${PROGRAMME_OPTIONS.join(', ')}`);
  }
  if (payload.programme === 'other' && !payload.programme_other) {
    errors.push('Please specify programme');
  }

  // Section 2: Registration conditional validations
  if (payload.is_registered === true) {
    if (!payload.portal_name) errors.push('Portal name is required');
    if (!payload.registration_number) errors.push('Registration number is required');
    if (!payload.registration_date) {
      errors.push('Registration date is required');
    } else if (!isValidDateString(payload.registration_date)) {
      errors.push('Invalid registration date format');
    }
  }

  // Section 2: Publication conditional validations
  if (payload.is_published === true) {
    if (payload.publication_type.length === 0) errors.push('Publication type is required');
    if (!payload.publication_title) errors.push('Publication title is required');
    if (!payload.publication_venue) errors.push('Publication venue is required');
    if (!payload.publication_date) {
      errors.push('Publication date is required');
    } else if (!isValidDateString(payload.publication_date)) {
      errors.push('Invalid publication date format');
    }
    if (payload.publication_link && !URL_REGEX.test(payload.publication_link)) {
      errors.push('Invalid publication link URL');
    }
  }

  // Section 2: Address validations
  if (!payload.address_line1) errors.push('Address is required');
  if (!payload.city) errors.push('City is required');
  if (!payload.state) errors.push('State is required');
  if (!payload.pin_code) {
    errors.push('PIN code is required');
  } else if (!PIN_REGEX.test(payload.pin_code)) {
    errors.push('Invalid 6-digit PIN code');
  }
  if (!payload.country) errors.push('Country is required');

  // Section 3 validations
  if (!payload.project_title) errors.push('Project title is required');
  if (!payload.project_theme) {
    errors.push('Project theme is required');
  } else if (!THEME_OPTIONS.includes(payload.project_theme)) {
    errors.push(`Project theme must be one of: ${THEME_OPTIONS.join(', ')}`);
  }
  if (payload.project_theme === 'other' && !payload.project_theme_other) {
    errors.push('Please specify project theme');
  }
  if (!payload.project_level) {
    errors.push('Project level is required');
  } else if (!LEVEL_OPTIONS.includes(payload.project_level)) {
    errors.push(`Project level must be one of: ${LEVEL_OPTIONS.join(', ')}`);
  }
  if (!payload.project_start_date) {
    errors.push('Project start date is required');
  } else if (!isValidDateString(payload.project_start_date)) {
    errors.push('Invalid project start date format');
  }
  if (payload.project_end_date && !isValidDateString(payload.project_end_date)) {
    errors.push('Invalid project end date format');
  }

  // Section 4 validations
  if (!payload.project_objective) errors.push('Project objective is required');
  if (!payload.project_methodology) errors.push('Project methodology is required');
  if (!payload.project_outcome) errors.push('Project outcome is required');

  // Section 5: Thesis conditional validations
  if (payload.is_thesis_linked === true) {
    if (!payload.thesis_title) errors.push('Thesis title is required');
    if (!payload.thesis_degree) errors.push('Thesis degree is required');
    if (!payload.thesis_supervisor) errors.push('Thesis supervisor is required');
    if (!payload.thesis_institution) errors.push('Thesis institution is required');
  }

  // Section 6: Collaboration conditional validations
  if (payload.seeking_collaborators === true) {
    if (payload.collaborator_types.length === 0) errors.push('Collaborator types are required');
    if (payload.collaboration_types.length === 0) errors.push('Collaboration types are required');
    if (payload.collaboration_types.includes('other') && !payload.collaboration_other) {
      errors.push('Please specify collaboration type');
    }
  }

  // Section 7: Funding conditional validations
  if (payload.open_to_funding === true) {
    if (payload.funding_sources.length === 0) errors.push('Funding sources are required');
    if (payload.funding_sources.includes('other') && !payload.funding_other) {
      errors.push('Please specify funding source');
    }
  }

  // Section 8: URL validations
  if (payload.synopsis_link && !URL_REGEX.test(payload.synopsis_link)) {
    errors.push('Invalid synopsis link URL');
  }
  if (payload.github_link && !URL_REGEX.test(payload.github_link)) {
    errors.push('Invalid GitHub link URL');
  }
  if (payload.drive_link && !URL_REGEX.test(payload.drive_link)) {
    errors.push('Invalid drive link URL');
  }
  if (payload.demo_link && !URL_REGEX.test(payload.demo_link)) {
    errors.push('Invalid demo link URL');
  }

  // Section 9 validations
  if (payload.preferred_contact.length === 0) {
    errors.push('Preferred contact method is required');
  }

  // Section 10 validation
  if (!payload.declaration_accepted) {
    errors.push('Declaration must be accepted');
  }

  return { payload, errors };
}

// ─── Row mapping ─────────────────────────────────────────────────────────────

function mapProjectListingRow(row) {
  return {
    id: Number(row.id),
    full_name: cleanText(row.full_name),
    primary_email: cleanText(row.primary_email),
    alternative_email: cleanText(row.alternative_email) || null,
    whatsapp_number: cleanText(row.whatsapp_number) || null,
    institution: cleanText(row.institution),
    department: cleanText(row.department),
    programme: cleanText(row.programme),
    programme_other: cleanText(row.programme_other) || null,

    is_registered: row.is_registered === null ? null : Number(row.is_registered) === 1,
    portal_name: cleanText(row.portal_name) || null,
    registration_number: cleanText(row.registration_number) || null,
    registration_date: formatDate(row.registration_date),

    is_published: row.is_published === null ? null : Number(row.is_published) === 1,
    publication_type: deserializeJsonArray(row.publication_type),
    publication_title: cleanText(row.publication_title) || null,
    publication_venue: cleanText(row.publication_venue) || null,
    publication_date: formatDate(row.publication_date),
    publication_link: cleanText(row.publication_link) || null,

    address_line1: cleanText(row.address_line1),
    city: cleanText(row.city),
    state: cleanText(row.state),
    pin_code: cleanText(row.pin_code),
    country: cleanText(row.country),

    project_title: cleanText(row.project_title),
    project_theme: cleanText(row.project_theme),
    project_theme_other: cleanText(row.project_theme_other) || null,
    project_level: cleanText(row.project_level),
    project_start_date: formatDate(row.project_start_date),
    project_end_date: formatDate(row.project_end_date),

    project_objective: cleanText(row.project_objective),
    project_methodology: cleanText(row.project_methodology),
    project_outcome: cleanText(row.project_outcome),

    is_thesis_linked: row.is_thesis_linked === null ? null : Number(row.is_thesis_linked) === 1,
    thesis_title: cleanText(row.thesis_title) || null,
    thesis_degree: cleanText(row.thesis_degree) || null,
    thesis_supervisor: cleanText(row.thesis_supervisor) || null,
    thesis_institution: cleanText(row.thesis_institution) || null,

    seeking_collaborators: row.seeking_collaborators === null ? null : Number(row.seeking_collaborators) === 1,
    collaborator_types: deserializeJsonArray(row.collaborator_types),
    collaboration_types: deserializeJsonArray(row.collaboration_types),
    collaboration_other: cleanText(row.collaboration_other) || null,

    open_to_funding: row.open_to_funding === null ? null : Number(row.open_to_funding) === 1,
    funding_sources: deserializeJsonArray(row.funding_sources),
    funding_other: cleanText(row.funding_other) || null,
    estimated_budget: cleanText(row.estimated_budget) || null,
    current_support: cleanText(row.current_support) || null,

    synopsis_link: cleanText(row.synopsis_link) || null,
    github_link: cleanText(row.github_link) || null,
    drive_link: cleanText(row.drive_link) || null,
    demo_link: cleanText(row.demo_link) || null,
    supporting_doc_path: cleanText(row.supporting_doc_path) || null,
    supporting_doc_mime_type: cleanText(row.supporting_doc_mime_type) || null,
    supporting_doc_file_name: cleanText(row.supporting_doc_file_name) || null,

    preferred_contact: deserializeJsonArray(row.preferred_contact),
    collaboration_requirements: cleanText(row.collaboration_requirements) || null,
    additional_remarks: cleanText(row.additional_remarks) || null,

    declaration_accepted: Number(row.declaration_accepted || 0) === 1,
    submission_type: cleanText(row.submission_type) || 'project_listing',
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
  };
}

// ─── CRUD helpers ────────────────────────────────────────────────────────────

async function createProjectListing(payload, connection = db) {
  const columns = [
    'full_name', 'primary_email', 'alternative_email',
    'whatsapp_number', 'institution', 'department', 'programme', 'programme_other',
    'is_registered', 'portal_name', 'registration_number', 'registration_date',
    'is_published', 'publication_type', 'publication_title', 'publication_venue',
    'publication_date', 'publication_link',
    'address_line1', 'city', 'state', 'pin_code', 'country',
    'project_title', 'project_theme', 'project_theme_other', 'project_level',
    'project_start_date', 'project_end_date',
    'project_objective', 'project_methodology', 'project_outcome',
    'is_thesis_linked', 'thesis_title', 'thesis_degree', 'thesis_supervisor', 'thesis_institution',
    'seeking_collaborators', 'collaborator_types', 'collaboration_types', 'collaboration_other',
    'open_to_funding', 'funding_sources', 'funding_other', 'estimated_budget', 'current_support',
    'synopsis_link', 'github_link', 'drive_link', 'demo_link',
    'supporting_doc_path', 'supporting_doc_mime_type', 'supporting_doc_file_name',
    'preferred_contact', 'collaboration_requirements', 'additional_remarks',
    'declaration_accepted', 'submission_type',
  ];

  const values = [
    payload.full_name,
    payload.primary_email,
    payload.alternative_email,
    payload.whatsapp_number,
    payload.institution,
    payload.department,
    payload.programme,
    payload.programme_other,
    payload.is_registered,
    payload.portal_name,
    payload.registration_number,
    payload.registration_date || null,
    payload.is_published,
    serializeJsonArray(payload.publication_type),
    payload.publication_title,
    payload.publication_venue,
    payload.publication_date || null,
    payload.publication_link,
    payload.address_line1,
    payload.city,
    payload.state,
    payload.pin_code,
    payload.country,
    payload.project_title,
    payload.project_theme,
    payload.project_theme_other,
    payload.project_level,
    payload.project_start_date,
    payload.project_end_date || null,
    payload.project_objective,
    payload.project_methodology,
    payload.project_outcome,
    payload.is_thesis_linked,
    payload.thesis_title,
    payload.thesis_degree,
    payload.thesis_supervisor,
    payload.thesis_institution,
    payload.seeking_collaborators,
    serializeJsonArray(payload.collaborator_types),
    serializeJsonArray(payload.collaboration_types),
    payload.collaboration_other,
    payload.open_to_funding,
    serializeJsonArray(payload.funding_sources),
    payload.funding_other,
    payload.estimated_budget,
    payload.current_support,
    payload.synopsis_link,
    payload.github_link,
    payload.drive_link,
    payload.demo_link,
    payload.supporting_doc_path,
    payload.supporting_doc_mime_type,
    payload.supporting_doc_file_name,
    serializeJsonArray(payload.preferred_contact),
    payload.collaboration_requirements,
    payload.additional_remarks,
    payload.declaration_accepted,
    payload.submission_type,
  ];

  const placeholders = columns.map(() => '?').join(', ');

  const [insertResult] = await connection.query(
    `INSERT INTO ${PROJECT_LISTING_TABLE} (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );

  const createdId = Number(insertResult.insertId);
  const [rows] = await connection.query(
    `SELECT * FROM ${PROJECT_LISTING_TABLE} WHERE id = ? LIMIT 1`,
    [createdId]
  );

  return rows[0] ? mapProjectListingRow(rows[0]) : null;
}

async function getProjectListingsPaginated({ page = 1, pageSize = 20, emailSearch = '' } = {}, connection = db) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = (safePage - 1) * safePageSize;

  let whereClause = '';
  const queryParams = [];

  if (emailSearch) {
    whereClause = 'WHERE LOWER(primary_email) LIKE LOWER(?)';
    queryParams.push(`%${emailSearch}%`);
  }

  const [[{ total }]] = await connection.query(
    `SELECT COUNT(*) as total FROM ${PROJECT_LISTING_TABLE} ${whereClause}`,
    queryParams
  );

  const [rows] = await connection.query(
    `SELECT * FROM ${PROJECT_LISTING_TABLE} ${whereClause}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, safePageSize, offset]
  );

  return {
    data: rows.map(mapProjectListingRow),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / safePageSize),
    },
  };
}

async function getProjectListingById(id, connection = db) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;

  const [rows] = await connection.query(
    `SELECT * FROM ${PROJECT_LISTING_TABLE} WHERE id = ? LIMIT 1`,
    [numericId]
  );

  return rows[0] ? mapProjectListingRow(rows[0]) : null;
}

async function deleteProjectListing(id, connection = db) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return false;

  const [result] = await connection.query(
    `DELETE FROM ${PROJECT_LISTING_TABLE} WHERE id = ? LIMIT 1`,
    [numericId]
  );

  return result.affectedRows > 0;
}

async function getProjectListingSupportingDocPath(id, connection = db) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;

  const [rows] = await connection.query(
    `SELECT supporting_doc_path FROM ${PROJECT_LISTING_TABLE} WHERE id = ? LIMIT 1`,
    [numericId]
  );

  return rows[0]?.supporting_doc_path || null;
}

module.exports = {
  PROJECT_LISTING_TABLE,
  PROGRAMME_OPTIONS,
  THEME_OPTIONS,
  LEVEL_OPTIONS,
  ensureProjectListingsTable,
  normalizeProjectListingPayload,
  mapProjectListingRow,
  createProjectListing,
  getProjectListingsPaginated,
  getProjectListingById,
  deleteProjectListing,
  getProjectListingSupportingDocPath,
};
