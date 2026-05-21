const db = require('../config/db');

const ANNOUNCEMENT_BANNER_TABLE = 'announcement_banners';
const ALLOWED_SECTIONS = Object.freeze(['summer-internship', 'summer-school']);
const MAX_TITLE_LENGTH = 255;
const MAX_LINK_LENGTH = 2000;

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

function hasOwnField(input, fieldNames) {
  if (!input || typeof input !== 'object') {
    return false;
  }

  return fieldNames.some((fieldName) =>
    Object.prototype.hasOwnProperty.call(input, fieldName)
  );
}

function parseOptionalPosition(value) {
  if (value === undefined || value === null || value === '') {
    return {
      position: null,
      error: null,
    };
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 1) {
    return {
      position: null,
      error: 'position must be a positive integer',
    };
  }

  return {
    position: Math.round(numeric),
    error: null,
  };
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

function normalizeAnnouncementBannerSection(value) {
  const cleaned = cleanText(value).toLowerCase();

  if (!cleaned) {
    return '';
  }

  const normalized = cleaned.replace(/[\s_]+/g, '-');

  if (ALLOWED_SECTIONS.includes(normalized)) {
    return normalized;
  }

  return '';
}

function isValidLink(value) {
  const cleaned = cleanText(value);

  if (!cleaned) {
    return false;
  }

  if (
    cleaned.startsWith('/')
    || cleaned.startsWith('#')
    || cleaned.startsWith('mailto:')
    || cleaned.startsWith('tel:')
  ) {
    return true;
  }

  try {
    const parsed = new URL(cleaned);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeAnnouncementBannerPayload(input = {}) {
  const title = cleanText(input.title || input.message || input.text || input.heading);
  const link = cleanText(input.link || input.href || input.url);
  const section = normalizeAnnouncementBannerSection(input.section || input.area || input.category);
  const { position, error: positionError } = parseOptionalPosition(input.position);

  const payload = {
    section,
    title,
    link,
    position,
    is_active: toBoolean(input.is_active ?? input.isActive, true),
  };

  const errors = [];

  if (!payload.section) {
    errors.push('section is required');
  }

  if (!payload.title) {
    errors.push('title is required');
  } else if (payload.title.length > MAX_TITLE_LENGTH) {
    errors.push(`title cannot exceed ${MAX_TITLE_LENGTH} characters`);
  }

  if (!payload.link) {
    errors.push('link is required');
  } else if (payload.link.length > MAX_LINK_LENGTH) {
    errors.push(`link cannot exceed ${MAX_LINK_LENGTH} characters`);
  } else if (!isValidLink(payload.link)) {
    errors.push('link must be a valid URL or site-relative path');
  }

  if (positionError) {
    errors.push(positionError);
  }

  return { payload, errors };
}

function normalizeAnnouncementBannerUpdatePayload(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const existingItem =
    options.existingItem && typeof options.existingItem === 'object'
      ? options.existingItem
      : null;

  const updates = {};
  const errors = [];

  if (hasOwnField(source, ['section', 'area', 'category'])) {
    const section = normalizeAnnouncementBannerSection(
      source.section ?? source.area ?? source.category,
    );

    if (!section) {
      errors.push('section is required');
    } else {
      updates.section = section;
    }
  }

  if (hasOwnField(source, ['title', 'message', 'text', 'heading'])) {
    const title = cleanText(source.title ?? source.message ?? source.text ?? source.heading);

    if (!title) {
      errors.push('title is required');
    } else if (title.length > MAX_TITLE_LENGTH) {
      errors.push(`title cannot exceed ${MAX_TITLE_LENGTH} characters`);
    } else {
      updates.title = title;
    }
  }

  if (hasOwnField(source, ['link', 'href', 'url'])) {
    const link = cleanText(source.link ?? source.href ?? source.url);

    if (!link) {
      errors.push('link is required');
    } else if (link.length > MAX_LINK_LENGTH) {
      errors.push(`link cannot exceed ${MAX_LINK_LENGTH} characters`);
    } else if (!isValidLink(link)) {
      errors.push('link must be a valid URL or site-relative path');
    } else {
      updates.link = link;
    }
  }

  if (hasOwnField(source, ['position'])) {
    const { position, error } = parseOptionalPosition(source.position);

    if (error) {
      errors.push(error);
    } else {
      updates.position = position;
    }
  }

  if (hasOwnField(source, ['is_active', 'isActive'])) {
    const fallback = existingItem ? Boolean(existingItem.is_active) : true;
    updates.is_active = toBoolean(source.is_active ?? source.isActive, fallback);
  }

  return { updates, errors };
}

async function ensureAnnouncementBannersTable(connection = db) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS ${ANNOUNCEMENT_BANNER_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      section VARCHAR(40) NOT NULL,
      title VARCHAR(255) NOT NULL,
      link TEXT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      position INT NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_announcement_banners_section_active_position (section, is_active, position),
      INDEX idx_announcement_banners_position (position)
    )`
  );

  await connection.query(
    `ALTER TABLE ${ANNOUNCEMENT_BANNER_TABLE}
     MODIFY COLUMN position INT NULL DEFAULT NULL`
  );
}

function mapAnnouncementBannerRow(row) {
  const numericPosition = row.position === null || row.position === undefined
    ? null
    : Number(row.position);

  return {
    id: Number(row.id),
    section: cleanText(row.section),
    title: cleanText(row.title),
    link: cleanText(row.link),
    is_active: Number(row.is_active) === 1,
    position: Number.isInteger(numericPosition) && numericPosition > 0 ? numericPosition : null,
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
  };
}

async function getAnnouncementBannerById(id, connection = db) {
  const [rows] = await connection.query(
    `SELECT id,
            section,
            title,
            link,
            is_active,
            position,
            created_at,
            updated_at
     FROM ${ANNOUNCEMENT_BANNER_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] ? mapAnnouncementBannerRow(rows[0]) : null;
}

async function getNextPosition(section, connection = db) {
  const [rows] = await connection.query(
    `SELECT COALESCE(MAX(position), 0) + 1 AS next_position
     FROM ${ANNOUNCEMENT_BANNER_TABLE}
     WHERE position IS NOT NULL AND section = ?`,
    [section]
  );

  return Number(rows?.[0]?.next_position || 1);
}

async function createAnnouncementBanner(payload, connection = db) {
  const resolvedPosition = payload.position === null
    ? await getNextPosition(payload.section, connection)
    : payload.position;

  const [insertResult] = await connection.query(
    `INSERT INTO ${ANNOUNCEMENT_BANNER_TABLE} (section, title, link, is_active, position)
     VALUES (?, ?, ?, ?, ?)`,
    [
      payload.section,
      payload.title,
      payload.link,
      payload.is_active ? 1 : 0,
      resolvedPosition,
    ]
  );

  return getAnnouncementBannerById(Number(insertResult.insertId), connection);
}

async function updateAnnouncementBannerById(id, updates, connection = db) {
  const allowedColumns = ['section', 'title', 'link', 'is_active', 'position'];

  const columnsToUpdate = allowedColumns.filter((column) =>
    Object.prototype.hasOwnProperty.call(updates || {}, column)
  );

  if (columnsToUpdate.length === 0) {
    return getAnnouncementBannerById(id, connection);
  }

  const setClause = columnsToUpdate.map((column) => `${column} = ?`).join(', ');
  const values = columnsToUpdate.map((column) => {
    if (column === 'is_active') {
      return updates[column] ? 1 : 0;
    }

    return updates[column];
  });

  const [result] = await connection.query(
    `UPDATE ${ANNOUNCEMENT_BANNER_TABLE}
     SET ${setClause}
     WHERE id = ?
     LIMIT 1`,
    [...values, id]
  );

  if (Number(result.affectedRows) <= 0) {
    return getAnnouncementBannerById(id, connection);
  }

  return getAnnouncementBannerById(id, connection);
}

async function getAnnouncementBannersList(options = {}, connection = db) {
  const activeOnly = Boolean(options.activeOnly);
  const section = typeof options.section === 'string' ? options.section : null;

  const whereClauses = [];
  const params = [];

  if (section) {
    whereClauses.push('section = ?');
    params.push(section);
  }

  if (activeOnly) {
    whereClauses.push('is_active = 1');
  }

  const whereClause = whereClauses.length > 0
    ? `WHERE ${whereClauses.join(' AND ')}`
    : '';

  const [rows] = await connection.query(
    `SELECT id,
            section,
            title,
            link,
            is_active,
            position,
            created_at,
            updated_at
     FROM ${ANNOUNCEMENT_BANNER_TABLE}
     ${whereClause}
     ORDER BY
       CASE WHEN position IS NULL THEN 1 ELSE 0 END,
       position ASC,
       id DESC`,
    params
  );

  return rows.map(mapAnnouncementBannerRow);
}

async function deleteAnnouncementBannerById(id, connection = db) {
  const [result] = await connection.query(
    `DELETE FROM ${ANNOUNCEMENT_BANNER_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return Number(result.affectedRows) > 0;
}

module.exports = {
  ANNOUNCEMENT_BANNER_TABLE,
  normalizeAnnouncementBannerSection,
  normalizeAnnouncementBannerPayload,
  normalizeAnnouncementBannerUpdatePayload,
  ensureAnnouncementBannersTable,
  createAnnouncementBanner,
  getAnnouncementBannerById,
  updateAnnouncementBannerById,
  getAnnouncementBannersList,
  deleteAnnouncementBannerById,
};
