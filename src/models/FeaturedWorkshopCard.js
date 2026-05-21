const db = require('../config/db');

const CARD_TABLE = 'featured_workshop_cards';
const MAX_TITLE_LENGTH = 120;
const MAX_POSITION = 6;

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

function parsePosition(value) {
  if (value === null || value === undefined || value === '') {
    return { position: null, error: 'position is required' };
  }

  const numeric = Number(value);

  if (!Number.isInteger(numeric) || numeric < 1 || numeric > MAX_POSITION) {
    return {
      position: null,
      error: `position must be between 1 and ${MAX_POSITION}`,
    };
  }

  return { position: numeric, error: null };
}

function normalizeFeaturedWorkshopCardPayload(input = {}) {
  const title = cleanText(input.title);
  const { position, error: positionError } = parsePosition(input.position);
  const isActive = toBoolean(input.is_active ?? input.isActive, true);

  const errors = [];

  if (!title) {
    errors.push('title is required');
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.push(`title cannot exceed ${MAX_TITLE_LENGTH} characters`);
  }

  if (positionError) {
    errors.push(positionError);
  }

  return {
    payload: {
      title,
      position,
      is_active: isActive,
    },
    errors,
  };
}

function normalizeFeaturedWorkshopCardUpdatePayload(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const existingCard =
    options.existingCard && typeof options.existingCard === 'object'
      ? options.existingCard
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

  if (hasOwnField(source, ['position'])) {
    const { position, error } = parsePosition(source.position);

    if (error) {
      errors.push(error);
    } else {
      updates.position = position;
    }
  }

  if (hasOwnField(source, ['is_active', 'isActive'])) {
    const fallback = existingCard ? Boolean(existingCard.is_active) : true;
    updates.is_active = toBoolean(source.is_active ?? source.isActive, fallback);
  }

  return { updates, errors };
}

async function ensureFeaturedWorkshopCardsTable(connection = db) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS ${CARD_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      section_id INT NOT NULL,
      title VARCHAR(120) NOT NULL,
      image_path VARCHAR(1024) NULL,
      image_file_name VARCHAR(255) NULL,
      image_storage ENUM('s3') NOT NULL DEFAULT 's3',
      position INT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_featured_workshop_cards_section_position (section_id, position),
      INDEX idx_featured_workshop_cards_active_position (is_active, position),
      UNIQUE KEY uniq_featured_workshop_cards_section_position (section_id, position)
    )`
  );
}

function mapCardRow(row) {
  return {
    id: Number(row.id),
    section_id: Number(row.section_id),
    title: cleanText(row.title),
    image_path: toNullableText(row.image_path),
    image_file_name: toNullableText(row.image_file_name),
    image_storage: toNullableText(row.image_storage),
    position: Number(row.position),
    is_active: Number(row.is_active) === 1,
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
  };
}

async function getFeaturedWorkshopCardById(id, connection = db) {
  const [rows] = await connection.query(
    `SELECT id,
            section_id,
            title,
            image_path,
            image_file_name,
            image_storage,
            position,
            is_active,
            created_at,
            updated_at
     FROM ${CARD_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] ? mapCardRow(rows[0]) : null;
}

async function getFeaturedWorkshopCardsBySection(sectionId, options = {}, connection = db) {
  const activeOnly = Boolean(options.activeOnly);
  const [rows] = await connection.query(
    `SELECT id,
            section_id,
            title,
            image_path,
            image_file_name,
            image_storage,
            position,
            is_active,
            created_at,
            updated_at
     FROM ${CARD_TABLE}
     WHERE section_id = ?${activeOnly ? ' AND is_active = 1' : ''}
     ORDER BY position ASC, id ASC`,
    [sectionId]
  );

  return rows.map(mapCardRow);
}

async function countFeaturedWorkshopCardsBySection(sectionId, connection = db) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total FROM ${CARD_TABLE} WHERE section_id = ?`,
    [sectionId]
  );

  return Number(rows?.[0]?.total || 0);
}

async function createFeaturedWorkshopCard(payload, connection = db) {
  const columns = [
    'section_id',
    'title',
    'image_path',
    'image_file_name',
    'image_storage',
    'position',
    'is_active',
  ];

  const values = [
    payload.section_id,
    payload.title,
    payload.image_path || null,
    payload.image_file_name || null,
    payload.image_storage || 's3',
    payload.position,
    payload.is_active ? 1 : 0,
  ];

  const placeholders = columns.map(() => '?').join(', ');

  const [result] = await connection.query(
    `INSERT INTO ${CARD_TABLE} (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );

  const createdId = Number(result.insertId);
  return getFeaturedWorkshopCardById(createdId, connection);
}

async function updateFeaturedWorkshopCardById(id, updates, connection = db) {
  const allowedColumns = [
    'title',
    'image_path',
    'image_file_name',
    'image_storage',
    'position',
    'is_active',
  ];

  const columnsToUpdate = allowedColumns.filter((column) =>
    Object.prototype.hasOwnProperty.call(updates || {}, column)
  );

  if (columnsToUpdate.length === 0) {
    return getFeaturedWorkshopCardById(id, connection);
  }

  const setClause = columnsToUpdate.map((column) => `${column} = ?`).join(', ');
  const values = columnsToUpdate.map((column) => updates[column]);

  await connection.query(
    `UPDATE ${CARD_TABLE}
     SET ${setClause}
     WHERE id = ?
     LIMIT 1`,
    [...values, id]
  );

  return getFeaturedWorkshopCardById(id, connection);
}

async function deleteFeaturedWorkshopCardById(id, connection = db) {
  const [result] = await connection.query(
    `DELETE FROM ${CARD_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return Number(result.affectedRows || 0) > 0;
}

module.exports = {
  ensureFeaturedWorkshopCardsTable,
  normalizeFeaturedWorkshopCardPayload,
  normalizeFeaturedWorkshopCardUpdatePayload,
  getFeaturedWorkshopCardById,
  getFeaturedWorkshopCardsBySection,
  countFeaturedWorkshopCardsBySection,
  createFeaturedWorkshopCard,
  updateFeaturedWorkshopCardById,
  deleteFeaturedWorkshopCardById,
};
