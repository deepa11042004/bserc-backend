const db = require('../config/db');
const {
  ensureProjectListingsTable,
  normalizeProjectListingPayload,
  createProjectListing,
  getProjectListingsPaginated,
  getProjectListingById,
  deleteProjectListing: deleteProjectListingRecord,
  getProjectListingSupportingDocPath,
} = require('../models/ProjectListing');
const {
  uploadProjectListingSupportingDoc,
  getPresignedObjectUrl,
} = require('./s3StorageService');

let tableInitialized = false;

async function ensureTable() {
  if (tableInitialized) return;
  try {
    await ensureProjectListingsTable(db);
    tableInitialized = true;
  } catch (err) {
    console.error('Failed to initialize project_listings table:', err);
    throw err;
  }
}

// ─── Submit project listing ──────────────────────────────────────────────────

async function submitProjectListing(input = {}, uploadedFile = null) {
  await ensureTable();

  // Handle S3 upload for supporting document
  if (uploadedFile && uploadedFile.buffer) {
    try {
      const uploadResult = await uploadProjectListingSupportingDoc({
        buffer: uploadedFile.buffer,
        mimeType: uploadedFile.mimetype,
        originalName: uploadedFile.originalname,
        email: input.primaryEmail || input.primary_email || 'unknown',
      });

      input.supporting_doc_path = uploadResult.s3Path;
      input.supporting_doc_mime_type = uploadedFile.mimetype;
      input.supporting_doc_file_name = uploadedFile.originalname;
    } catch (uploadErr) {
      console.error('S3 upload error for project listing document:', uploadErr);
      return {
        status: 500,
        body: { message: 'Failed to upload supporting document. Please try again.' },
      };
    }
  }

  const { payload, errors } = normalizeProjectListingPayload(input);

  if (errors.length > 0) {
    return {
      status: 400,
      body: { message: errors.join('. ') },
    };
  }

  try {
    const created = await createProjectListing(payload, db);

    if (!created) {
      return {
        status: 500,
        body: { message: 'Failed to save project listing. Please try again.' },
      };
    }

    return {
      status: 201,
      body: {
        message: 'Project submitted successfully! Review within 5-7 business days.',
        data: { id: created.id },
      },
    };
  } catch (err) {
    console.error('Error creating project listing:', err);
    throw err;
  }
}

// ─── Get project listings (admin) ────────────────────────────────────────────

async function getProjectListings({ page, pageSize, emailSearch, projectTheme, projectLevel, exportAll } = {}) {
  await ensureTable();

  try {
    const result = await getProjectListingsPaginated(
      { page, pageSize, emailSearch, projectTheme, projectLevel, exportAll },
      db
    );

    return {
      status: 200,
      body: result,
    };
  } catch (err) {
    console.error('Error fetching project listings:', err);
    throw err;
  }
}

// ─── Get single project listing (admin) ──────────────────────────────────────

async function getProjectListing(id) {
  await ensureTable();

  const listing = await getProjectListingById(id, db);

  if (!listing) {
    return {
      status: 404,
      body: { message: 'Project listing not found.' },
    };
  }

  return {
    status: 200,
    body: { data: listing },
  };
}

// ─── Delete project listing (admin) ──────────────────────────────────────────

async function deleteProjectListing(id) {
  await ensureTable();

  const deleted = await deleteProjectListingRecord(id, db);

  if (!deleted) {
    return {
      status: 404,
      body: { message: 'Project listing not found or already deleted.' },
    };
  }

  return {
    status: 200,
    body: { message: 'Project listing deleted successfully.' },
  };
}

// ─── Get supporting document presigned URL (admin) ───────────────────────────

async function getProjectListingSupportingDocUrl(id) {
  await ensureTable();

  const docPath = await getProjectListingSupportingDocPath(id, db);

  if (!docPath) {
    return null;
  }

  return getPresignedObjectUrl({ s3Path: docPath });
}

module.exports = {
  submitProjectListing,
  getProjectListings,
  getProjectListing,
  deleteProjectListing,
  getProjectListingSupportingDocUrl,
};
