const db = require('../config/db');

const SECTION_TABLE = 'featured_workshop_section';
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

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

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const cleaned = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(cleaned)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(cleaned)) {
    return false;
  }

  return fallback;
}

function hasOwnField(input, fieldNames) {
  if (!input || typeof input !== 'object') {
    return false;
  }

  return fieldNames.some((fieldName) =>
    Object.prototype.hasOwnProperty.call(input, fieldName)
  );
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

function normalizeFeaturedWorkshopSectionPayload(input = {}) {
  const title = cleanText(input.title);
  const description = toNullableText(input.description);
  const isActive = toBoolean(input.is_active ?? input.isActive, true);

  const errors = [];

  if (!title) {
    errors.push('title is required');
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.push(`title cannot exceed ${MAX_TITLE_LENGTH} characters`);
  }

  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`);
  }

  return {
    payload: {
      title,
      description,
      is_active: isActive,
    },
    errors,
  };
}

function normalizeFeaturedWorkshopSectionUpdatePayload(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const existingSection =
    options.existingSection && typeof options.existingSection === 'object'
      ? options.existingSection
      : null;

  const updates = {};
  const errors = [];

  if (hasOwnField(source, ['title'])) {
    const title = cleanText(source.title);

    if (!title) {
      errors.push('title is required');
    } else if (title.length > MAX_TITLE_LENGTH) {
      errors.push(`title cannot exceed ${MAX_TITLE_LENGTH} characters`);
    } else {
      updates.title = title;
    }
  }

  if (hasOwnField(source, ['description'])) {
    const description = toNullableText(source.description);

    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`);
    } else {
      updates.description = description;
    }
  }

  if (hasOwnField(source, ['is_active', 'isActive'])) {
    const fallback = existingSection ? Boolean(existingSection.is_active) : true;
    updates.is_active = toBoolean(source.is_active ?? source.isActive, fallback);
  }

  return { updates, errors };
}

async function ensureFeaturedWorkshopSectionTable(connection = db) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS ${SECTION_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT NULL,
      background_path VARCHAR(1024) NULL,
      background_file_name VARCHAR(255) NULL,
      background_storage ENUM('s3') NOT NULL DEFAULT 's3',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_featured_workshop_section_active (is_active)
    )`
  );
}

function mapSectionRow(row) {
  return {
    id: Number(row.id),
    title: cleanText(row.title),
    description: toNullableText(row.description),
    background_path: toNullableText(row.background_path),
    background_file_name: toNullableText(row.background_file_name),
    background_storage: toNullableText(row.background_storage),
    is_active: Number(row.is_active) === 1,
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
  };
}

async function getLatestFeaturedWorkshopSection(options = {}, connection = db) {
  const activeOnly = Boolean(options.activeOnly);
  const [rows] = await connection.query(
    `SELECT id,
            title,
            description,
            background_path,
            background_file_name,
            background_storage,
            is_active,
            created_at,
            updated_at
     FROM ${SECTION_TABLE}
     ${activeOnly ? 'WHERE is_active = 1' : ''}
     ORDER BY id DESC
     LIMIT 1`
  );

  return rows[0] ? mapSectionRow(rows[0]) : null;
}

async function getFeaturedWorkshopSectionById(id, connection = db) {
  const [rows] = await connection.query(
    `SELECT id,
            title,
            description,
            background_path,
            background_file_name,
            background_storage,
            is_active,
            created_at,
            updated_at
     FROM ${SECTION_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] ? mapSectionRow(rows[0]) : null;
}

async function createFeaturedWorkshopSection(payload, connection = db) {
  const columns = [
    'title',
    'description',
    'background_path',
    'background_file_name',
    'background_storage',
    'is_active',
  ];

  const values = [
    payload.title,
    payload.description,
    payload.background_path || null,
    payload.background_file_name || null,
    payload.background_storage || 's3',
    payload.is_active ? 1 : 0,
  ];

  const placeholders = columns.map(() => '?').join(', ');

  const [result] = await connection.query(
    `INSERT INTO ${SECTION_TABLE} (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );

  const createdId = Number(result.insertId);
  return getFeaturedWorkshopSectionById(createdId, connection);
}

async function updateFeaturedWorkshopSectionById(id, updates, connection = db) {
  const allowedColumns = [
    'title',
    'description',
    'background_path',
    'background_file_name',
    'background_storage',
    'is_active',
  ];

  const columnsToUpdate = allowedColumns.filter((column) =>
    Object.prototype.hasOwnProperty.call(updates || {}, column)
  );

  if (columnsToUpdate.length === 0) {
    return getFeaturedWorkshopSectionById(id, connection);
  }

  const setClause = columnsToUpdate.map((column) => `${column} = ?`).join(', ');
  const values = columnsToUpdate.map((column) => updates[column]);

  await connection.query(
    `UPDATE ${SECTION_TABLE}
     SET ${setClause}
     WHERE id = ?
     LIMIT 1`,
    [...values, id]
  );

  return getFeaturedWorkshopSectionById(id, connection);
}

module.exports = {
  ensureFeaturedWorkshopSectionTable,
  normalizeFeaturedWorkshopSectionPayload,
  normalizeFeaturedWorkshopSectionUpdatePayload,
  getLatestFeaturedWorkshopSection,
  createFeaturedWorkshopSection,
  updateFeaturedWorkshopSectionById,
};
