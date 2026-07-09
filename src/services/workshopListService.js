const db = require('../config/db');
const {
  uploadWorkshopThumbnail,
  streamWorkshopThumbnail,
  deleteWorkshopThumbnail,
} = require('./s3StorageService');

const WORKSHOP_LIST_TABLE = 'workshop_list';
const TOTAL_ENROLLMENTS_COLUMN = 'total_enrollments';
const REGISTRATION_TABLE = 'workshop_registrations';
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const IMAGE_COLUMNS = new Set(['thumbnail']);

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

function toNullableFee(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric;
}

function toBoolean(value, defaultValue = true) {
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
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function toPositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function isValidDate(value) {
  if (!value) {
    return true;
  }

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

function isValidTime(value) {
  if (!value) {
    return true;
  }

  return TIME_REGEX.test(value);
}

function isValidUrlOrPath(value) {
  if (!value) {
    return true;
  }

  const candidate = cleanText(value);
  if (!candidate) {
    return false;
  }

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_err) {
    // Not a full URL. Continue with local/relative path validation.
  }

  return /^(\/|\.\/|\.\.\/|[A-Za-z]:\\|[A-Za-z0-9_./\\-]+)$/.test(candidate);
}

function failedResponse(status) {
  return {
    status,
    body: {
      success: false,
      message: 'Failed to create workshop',
    },
  };
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

function formatTime(value) {
  if (!value) {
    return null;
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

function buildWorkshopImageUrl(id, type) {
  return `/api/workshop-list/${id}/${type}`;
}

function resolveWorkshopThumbnailUrl(row, id) {
  const hasManagedThumbnail = Boolean(row.thumbnail_path);

  if (hasManagedThumbnail) {
    return buildWorkshopImageUrl(id, 'thumbnail');
  }

  return null;
}

function mapWorkshopRow(row) {
  const id = Number(row.id);
  const thumbnailUrl = resolveWorkshopThumbnailUrl(row, id);
  const registeredCount = Number(row.registered_count);
  const totalEnrollments = Number(row.total_enrollments);

  return {
    id,
    title: row.title,
    description: row.description,
    eligibility: row.eligibility,
    mode: row.mode,
    workshop_date: formatDate(row.workshop_date),
    start_time: formatTime(row.start_time),
    end_time: formatTime(row.end_time),
    duration: row.duration,
    certificate: Number(row.certificate || 0) === 1,
    fee: row.fee === null ? null : Number(row.fee),
    created_at: formatDateTime(row.created_at),
    total_enrollments: Number.isFinite(totalEnrollments)
      ? totalEnrollments
      : (Number.isFinite(registeredCount) ? registeredCount : 0),
    registered_count: Number.isFinite(registeredCount) ? registeredCount : 0,
    thumbnail_url: thumbnailUrl,
    certificate_url: null,
    has_thumbnail: Boolean(row.thumbnail_path),
    has_certificate_file: false,
  };
}

function buildWorkshopListQuery(registeredCountExpression, includeThumbnailS3Columns = true) {
  const thumbnailS3Columns = includeThumbnailS3Columns
    ? 'wl.thumbnail_path,\n      wl.thumbnail_file_name,\n      wl.thumbnail_storage,'
    : '';

  return `SELECT
      wl.id,
      wl.title,
      wl.description,
      wl.eligibility,
      wl.mode,
      wl.workshop_date,
      wl.start_time,
      wl.end_time,
      wl.duration,
      wl.certificate,
      wl.fee,
      wl.created_at,
      ${thumbnailS3Columns}
      ${registeredCountExpression} AS total_enrollments,
      ${registeredCountExpression} AS registered_count
    FROM ${WORKSHOP_LIST_TABLE} wl
    ORDER BY wl.id DESC`;
}

function buildWorkshopListFilteredQuery(registeredCountExpression, includeThumbnailS3Columns, options) {
  const thumbnailS3Columns = includeThumbnailS3Columns
    ? 'wl.thumbnail_path,\n      wl.thumbnail_file_name,\n      wl.thumbnail_storage,'
    : '';

  const whereClauses = [];
  const whereParams = [];

  const mode = cleanText(options.mode);
  if (mode && mode.toLowerCase() !== 'all') {
    whereClauses.push('t.mode = ?');
    whereParams.push(mode);
  }

  const status = cleanText(options.status).toLowerCase();
  if (status && status !== 'all' && ['active', 'pending', 'inactive'].includes(status)) {
    whereClauses.push('t.computed_status = ?');
    whereParams.push(status);
  }

  const search = cleanText(options.search).toLowerCase();
  if (search) {
    whereClauses.push('LOWER(t.title) LIKE ?');
    whereParams.push(`%${search}%`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const isExportAll = options.exportAll === true || options.exportAll === 'true';
  const hasPagination = options.page !== undefined || options.pageSize !== undefined;
  const page = Number(options.page) || 1;
  const pageSize = Number(options.pageSize) || 50;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = (!hasPagination || isExportAll)
    ? null
    : (Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 200) : 50);
  const offset = safePageSize === null ? 0 : (safePage - 1) * safePageSize;

  const sql = `SELECT * FROM (
      SELECT
        wl.id,
        wl.title,
        wl.description,
        wl.eligibility,
        wl.mode,
        wl.workshop_date,
        wl.start_time,
        wl.end_time,
        wl.duration,
        wl.certificate,
        wl.fee,
        wl.created_at,
        ${thumbnailS3Columns}
        ${registeredCountExpression} AS total_enrollments,
        ${registeredCountExpression} AS registered_count,
        CASE
          WHEN wl.workshop_date IS NULL THEN 'active'
          WHEN wl.workshop_date > CURDATE() THEN 'pending'
          WHEN wl.workshop_date < CURDATE() THEN 'inactive'
          ELSE 'active'
        END AS computed_status
      FROM ${WORKSHOP_LIST_TABLE} wl
    ) t
    ${whereSql}
    ORDER BY t.id DESC
    ${safePageSize === null ? '' : 'LIMIT ? OFFSET ?'}`;

  const countSql = `SELECT COUNT(*) AS total FROM (
      SELECT wl.id, wl.mode, wl.title,
        CASE
          WHEN wl.workshop_date IS NULL THEN 'active'
          WHEN wl.workshop_date > CURDATE() THEN 'pending'
          WHEN wl.workshop_date < CURDATE() THEN 'inactive'
          ELSE 'active'
        END AS computed_status
      FROM ${WORKSHOP_LIST_TABLE} wl
    ) t
    ${whereSql}`;

  return {
    sql,
    countSql,
    params: safePageSize === null ? [...whereParams] : [...whereParams, safePageSize, offset],
    countParams: whereParams,
    safePage,
    safePageSize,
  };
}

function buildWorkshopByIdQuery(registeredCountExpression, includeThumbnailS3Columns = true) {
  const thumbnailS3Columns = includeThumbnailS3Columns
    ? 'wl.thumbnail_path,\n      wl.thumbnail_file_name,\n      wl.thumbnail_storage,'
    : '';

  return `SELECT
      wl.id,
      wl.title,
      wl.description,
      wl.eligibility,
      wl.mode,
      wl.workshop_date,
      wl.start_time,
      wl.end_time,
      wl.duration,
      wl.certificate,
      wl.fee,
      wl.created_at,
      ${thumbnailS3Columns}
      ${registeredCountExpression} AS total_enrollments,
      ${registeredCountExpression} AS registered_count
    FROM ${WORKSHOP_LIST_TABLE} wl
    WHERE wl.id = ?
    LIMIT 1`;
}

function buildAllParticipantsQuery(includeCreatedAt = true) {
  const createdAtUnixExpression = includeCreatedAt
    ? 'UNIX_TIMESTAMP(wr.created_at) AS created_at_unix'
    : 'NULL AS created_at_unix';
  const orderByExpression = includeCreatedAt ? 'wr.created_at DESC, wr.id DESC' : 'wr.id DESC';

  return `SELECT
      wr.*,
      wl.title AS workshop_title,
      ${createdAtUnixExpression}
    FROM ${REGISTRATION_TABLE} wr
    LEFT JOIN ${WORKSHOP_LIST_TABLE} wl ON wl.id = wr.workshop_id
    ORDER BY ${orderByExpression}`;
}

async function getWorkshopRowById(id, connection = db) {
  try {
    const [rows] = await connection.query(
      buildWorkshopByIdQuery(`COALESCE(wl.${TOTAL_ENROLLMENTS_COLUMN}, 0)`, true),
      [id]
    );

    return rows[0] || null;
  } catch (err) {
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      const [rows] = await connection.query(
        buildWorkshopByIdQuery('0', false),
        [id]
      );
      return rows[0] ? { ...rows[0], thumbnail_path: null } : null;
    }

    throw err;
  }
}

async function getWorkshopList(options = {}) {
  const hasPagination = options.page !== undefined || options.pageSize !== undefined;
  const isExportAll = options.exportAll === true || options.exportAll === 'true';
  const hasFilters = Boolean(
    cleanText(options.mode) || cleanText(options.status) || cleanText(options.search)
  );

  // Preserve the plain, unfiltered array response for legacy callers
  // (public workshop pickers/dashboards) that never send pagination or filter params.
  if (!hasPagination && !isExportAll && !hasFilters) {
    try {
      const [rows] = await db.query(
        buildWorkshopListQuery(`COALESCE(wl.${TOTAL_ENROLLMENTS_COLUMN}, 0)`, true)
      );

      return rows.map(mapWorkshopRow);
    } catch (err) {
      if (err && err.code === 'ER_BAD_FIELD_ERROR') {
        const [rows] = await db.query(buildWorkshopListQuery('0', false));
        return rows.map((row) => mapWorkshopRow({ ...row, thumbnail_path: null }));
      }

      throw err;
    }
  }

  const registeredCountExpression = `COALESCE(wl.${TOTAL_ENROLLMENTS_COLUMN}, 0)`;

  let query;
  try {
    query = buildWorkshopListFilteredQuery(registeredCountExpression, true, options);
    const [rows] = await db.query(query.sql, query.params);
    const [countRows] = await db.query(query.countSql, query.countParams);

    const total = Number(countRows?.[0]?.total || 0);
    const effectivePageSize = query.safePageSize ?? (total || 1);
    const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

    return {
      data: rows.map(mapWorkshopRow),
      page: query.safePage,
      pageSize: query.safePageSize,
      total,
      totalPages,
    };
  } catch (err) {
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      query = buildWorkshopListFilteredQuery('0', false, options);
      const [rows] = await db.query(query.sql, query.params);
      const [countRows] = await db.query(query.countSql, query.countParams);

      const total = Number(countRows?.[0]?.total || 0);
      const effectivePageSize = query.safePageSize ?? (total || 1);
      const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

      return {
        data: rows.map((row) => mapWorkshopRow({ ...row, thumbnail_path: null })),
        page: query.safePage,
        pageSize: query.safePageSize,
        total,
        totalPages,
      };
    }

    throw err;
  }
}

async function getAllParticipants() {
  let rows = [];

  try {
    [rows] = await db.query(buildAllParticipantsQuery(true));
  } catch (err) {
    // Keep participant listing functional if created_at is unavailable in some environments.
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      [rows] = await db.query(buildAllParticipantsQuery(false));
    } else {
      throw err;
    }
  }

  const participants = rows.map((row) => {
    const workshopId = Number(row.workshop_id);
    const createdAtUnix = Number(row.created_at_unix);
    const paymentAmount = Number(row.payment_amount);

    return {
      ...row,
      id: Number(row.id),
      workshop_id: Number.isFinite(workshopId) ? workshopId : null,
      workshop_title: cleanText(row.workshop_title) || (Number.isFinite(workshopId) ? `Workshop ${workshopId}` : 'Workshop'),
      full_name: cleanText(row.full_name),
      email: cleanText(row.email),
      contact_number: cleanText(row.contact_number),
      alternative_email: cleanText(row.alternative_email) || null,
      institution: cleanText(row.institution),
      designation: cleanText(row.designation),
      nationality: cleanText(row.nationality) || null,
      agree_recording: Number(row.agree_recording || 0) === 1,
      agree_terms: Number(row.agree_terms || 0) === 1,
      payment_amount: Number.isFinite(paymentAmount) ? paymentAmount : null,
      payment_currency: cleanText(row.payment_currency) || null,
      razorpay_order_id: cleanText(row.razorpay_order_id) || null,
      razorpay_payment_id: cleanText(row.razorpay_payment_id) || null,
      payment_status: cleanText(row.payment_status) || null,
      payment_mode: cleanText(row.payment_mode) || null,
      created_at: formatDateTime(row.created_at),
      created_at_unix: Number.isFinite(createdAtUnix) && createdAtUnix > 0
        ? createdAtUnix
        : null,
    };
  });

  return {
    status: 200,
    body: {
      success: true,
      participants,
    },
  };
}

async function createWorkshop(payload) {
  const title = cleanText(payload.title);
  const description = toNullableText(payload.description);
  const eligibility = toNullableText(payload.eligibility);
  const mode = toNullableText(payload.mode);
  const workshopDate = toNullableText(payload.workshop_date);
  const startTime = toNullableText(payload.start_time);
  const endTime = toNullableText(payload.end_time);
  const duration = toNullableText(payload.duration);
  const certificate = toBoolean(payload.certificate, true) ? 1 : 0;
  const fee = toNullableFee(payload.fee);
  const thumbnailBuffer = Buffer.isBuffer(payload.thumbnail) ? payload.thumbnail : null;

  if (!title) {
    return failedResponse(400);
  }

  if (payload.fee !== null && payload.fee !== undefined && payload.fee !== '' && fee === null) {
    return failedResponse(400);
  }

  if (!isValidDate(workshopDate)) {
    return failedResponse(400);
  }

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return failedResponse(400);
  }

  let thumbnailPath = null;
  let thumbnailFileName = null;
  let thumbnailStorage = 's3';

  if (thumbnailBuffer) {
    const thumbnailOriginalName = toNullableText(payload.thumbnail_original_name) || 'thumbnail.webp';
    const uploadResult = await uploadWorkshopThumbnail({
      buffer: thumbnailBuffer,
      mimeType: 'image/webp',
      originalName: thumbnailOriginalName,
      workshopId: 'new',
      workshopTitle: title,
    });

    thumbnailPath = uploadResult.s3Path;
    thumbnailFileName = thumbnailOriginalName;
    thumbnailStorage = 's3';
  }

  if (!thumbnailBuffer) {
    return failedResponse(400);
  }

  await db.query(
    `INSERT INTO ${WORKSHOP_LIST_TABLE} (
      title,
      description,
      eligibility,
      mode,
      workshop_date,
      start_time,
      end_time,
      duration,
      certificate,
      fee,
      thumbnail_path,
      thumbnail_file_name,
      thumbnail_storage
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      title,
      description,
      eligibility,
      mode,
      workshopDate,
      startTime,
      endTime,
      duration,
      certificate,
      fee,
      thumbnailPath,
      thumbnailFileName,
      thumbnailStorage,
    ]
  );

  return {
    status: 201,
    body: {
      success: true,
      message: 'Workshop created successfully',
    },
  };
}

async function getWorkshopById(workshopId) {
  const id = toPositiveInt(workshopId);
  if (!id) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Invalid workshop id',
      },
    };
  }

  const row = await getWorkshopRowById(id);
  if (!row) {
    return {
      status: 404,
      body: {
        success: false,
        message: 'Workshop not found',
      },
    };
  }

  return {
    status: 200,
    body: mapWorkshopRow(row),
  };
}

async function updateWorkshop(workshopId, payload) {
  const id = toPositiveInt(workshopId);
  if (!id) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Invalid workshop id',
      },
    };
  }

  const existingRow = await getWorkshopRowById(id);
  if (!existingRow) {
    return {
      status: 404,
      body: {
        success: false,
        message: 'Workshop not found',
      },
    };
  }

  const updates = [];
  const values = [];

  if (payload.title !== undefined) {
    const title = cleanText(payload.title);
    if (!title) {
      return failedResponse(400);
    }

    updates.push('title = ?');
    values.push(title);
  }

  if (payload.description !== undefined) {
    updates.push('description = ?');
    values.push(toNullableText(payload.description));
  }

  if (payload.eligibility !== undefined) {
    updates.push('eligibility = ?');
    values.push(toNullableText(payload.eligibility));
  }

  if (payload.mode !== undefined) {
    updates.push('mode = ?');
    values.push(toNullableText(payload.mode));
  }

  if (payload.workshop_date !== undefined) {
    const workshopDate = toNullableText(payload.workshop_date);
    if (!isValidDate(workshopDate)) {
      return failedResponse(400);
    }

    updates.push('workshop_date = ?');
    values.push(workshopDate);
  }

  if (payload.start_time !== undefined) {
    const startTime = toNullableText(payload.start_time);
    if (!isValidTime(startTime)) {
      return failedResponse(400);
    }

    updates.push('start_time = ?');
    values.push(startTime);
  }

  if (payload.end_time !== undefined) {
    const endTime = toNullableText(payload.end_time);
    if (!isValidTime(endTime)) {
      return failedResponse(400);
    }

    updates.push('end_time = ?');
    values.push(endTime);
  }

  if (payload.duration !== undefined) {
    updates.push('duration = ?');
    values.push(toNullableText(payload.duration));
  }

  if (payload.certificate !== undefined) {
    updates.push('certificate = ?');
    values.push(toBoolean(payload.certificate, true) ? 1 : 0);
  }

  if (payload.fee !== undefined) {
    const fee = toNullableFee(payload.fee);
    if (payload.fee !== null && payload.fee !== '' && fee === null) {
      return failedResponse(400);
    }

    updates.push('fee = ?');
    values.push(fee);
  }

  if (Buffer.isBuffer(payload.thumbnail)) {
    const thumbnailOriginalName = toNullableText(payload.thumbnail_original_name) || 'thumbnail.webp';
    const uploadResult = await uploadWorkshopThumbnail({
      buffer: payload.thumbnail,
      mimeType: 'image/webp',
      originalName: thumbnailOriginalName,
      workshopId: String(id),
      workshopTitle: existingRow.title || payload.title || 'workshop',
    });

    const previousS3Path = toNullableText(existingRow.thumbnail_path);

    updates.push('thumbnail_path = ?');
    values.push(uploadResult.s3Path);
    updates.push('thumbnail_file_name = ?');
    values.push(thumbnailOriginalName);
    updates.push('thumbnail_storage = ?');
    values.push('s3');

    if (previousS3Path) {
      deleteWorkshopThumbnail({ s3Path: previousS3Path }).catch(() => {});
    }
  }

  if (!updates.length) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'No update fields provided',
      },
    };
  }

  values.push(id);

  await db.query(
    `UPDATE ${WORKSHOP_LIST_TABLE}
     SET ${updates.join(', ')}
     WHERE id = ?`,
    values
  );

  return {
    status: 200,
    body: {
      success: true,
      message: 'Workshop updated successfully',
    },
  };
}

async function deleteWorkshop(workshopId) {
  const id = toPositiveInt(workshopId);
  if (!id) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Invalid workshop id',
      },
    };
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const workshopRow = await getWorkshopRowById(id, connection);
    if (!workshopRow) {
      await connection.rollback();
      return {
        status: 404,
        body: {
          success: false,
          message: 'Workshop not found',
        },
      };
    }

    const [registrationDeleteResult] = await connection.query(
      `DELETE FROM ${REGISTRATION_TABLE} WHERE workshop_id = ?`,
      [id]
    );

    const [workshopDeleteResult] = await connection.query(
      `DELETE FROM ${WORKSHOP_LIST_TABLE} WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!workshopDeleteResult.affectedRows) {
      await connection.rollback();
      return {
        status: 404,
        body: {
          success: false,
          message: 'Workshop not found',
        },
      };
    }

    await connection.commit();

    if (workshopRow.thumbnail_path) {
      deleteWorkshopThumbnail({ s3Path: workshopRow.thumbnail_path }).catch(() => {});
    }

    return {
      status: 200,
      body: {
        success: true,
        message: 'Workshop deleted successfully',
        deleted_registrations: Number(registrationDeleteResult.affectedRows || 0),
      },
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function deleteWorkshopParticipant(participantId) {
  const id = toPositiveInt(participantId);
  if (!id) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Invalid participant id',
      },
    };
  }

  const [existingRows] = await db.query(
    `SELECT id FROM ${REGISTRATION_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );

  if (!existingRows[0]) {
    return {
      status: 404,
      body: {
        success: false,
        message: 'Participant not found',
      },
    };
  }

  const [deleteResult] = await db.query(
    `DELETE FROM ${REGISTRATION_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );

  if (!deleteResult.affectedRows) {
    return {
      status: 404,
      body: {
        success: false,
        message: 'Participant not found',
      },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      message: 'Participant deleted successfully',
      deleted_participant_id: id,
    },
  };
}

async function getWorkshopParticipants(workshopId) {
  const id = toPositiveInt(workshopId);
  if (!id) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Invalid workshop id',
      },
    };
  }

  const workshopRow = await getWorkshopRowById(id);
  if (!workshopRow) {
    return {
      status: 404,
      body: {
        success: false,
        message: 'Workshop not found',
      },
    };
  }

  const [rows] = await db.query(
    `SELECT
      id,
      full_name,
      email,
      contact_number,
      alternative_email,
      institution,
      designation,
      payment_amount,
      razorpay_payment_id,
      payment_status,
      created_at,
      agree_recording,
      agree_terms
     FROM ${REGISTRATION_TABLE}
     WHERE workshop_id = ?
     ORDER BY id DESC`,
    [id]
  );

  const participants = rows.map((row) => {
    const paymentAmount = Number(row.payment_amount);

    return {
      id: Number(row.id),
      full_name: cleanText(row.full_name),
      email: cleanText(row.email),
      contact_number: cleanText(row.contact_number),
      alternative_email: cleanText(row.alternative_email) || null,
      institution: cleanText(row.institution),
      designation: cleanText(row.designation),
      payment_amount: Number.isFinite(paymentAmount) ? paymentAmount : null,
      razorpay_payment_id: cleanText(row.razorpay_payment_id) || null,
      payment_status: cleanText(row.payment_status) || null,
      created_at: formatDateTime(row.created_at),
      agree_recording: Number(row.agree_recording || 0) === 1,
      agree_terms: Number(row.agree_terms || 0) === 1,
    };
  });

  return {
    status: 200,
    body: {
      success: true,
      workshop: {
        id: Number(workshopRow.id),
        title: cleanText(workshopRow.title),
      },
      participants,
    },
  };
}

async function getWorkshopImageById(workshopId, column) {
  if (!IMAGE_COLUMNS.has(column)) {
    throw new Error(`Unsupported workshop image column: ${column}`);
  }

  const id = toPositiveInt(workshopId);
  if (!id) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Invalid workshop id',
      },
    };
  }

  if (column === 'thumbnail') {
    const [rows] = await db.query(
      `SELECT
         thumbnail_path
       FROM ${WORKSHOP_LIST_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    const row = rows[0];
    if (!row) {
      return {
        status: 404,
        body: {
          success: false,
          message: 'Workshop image not found',
        },
      };
    }

    if (row.thumbnail_path) {
      const streamResult = await streamWorkshopThumbnail({ s3Path: row.thumbnail_path });
      return {
        status: 200,
        image: streamResult.buffer,
        contentType: streamResult.contentType,
      };
    }

    return {
      status: 404,
      body: {
        success: false,
        message: 'Workshop image not found',
      },
    };
  }

  return {
    status: 404,
    body: {
      success: false,
      message: 'Workshop image not found',
    },
  };
}

module.exports = {
  getWorkshopList,
  getAllParticipants,
  getWorkshopById,
  createWorkshop,
  updateWorkshop,
  deleteWorkshop,
  deleteWorkshopParticipant,
  getWorkshopParticipants,
  getWorkshopImageById,
};
