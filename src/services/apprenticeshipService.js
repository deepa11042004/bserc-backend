const ApprenticeshipApplication = require('../models/ApprenticeshipApplication');
const {
  uploadApprenticeshipFile,
  streamApprenticeshipFile,
} = require('./s3StorageService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FILE_FIELDS = ['resume', 'certificates', 'aadhaar_copy', 'photo'];
const REQUIRED_FILE_FIELDS = new Set(['resume', 'certificates', 'photo']);

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanText(value) {
  const candidate = firstValue(value);
  return typeof candidate === 'string' ? candidate.trim() : '';
}

function toNullableText(value) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function parseJsonArrayField(value, fieldName, errors) {
  const raw = cleanText(value);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      errors.push(`${fieldName} must be an array.`);
      return [];
    }
    return parsed;
  } catch {
    errors.push(`${fieldName} is not valid JSON.`);
    return [];
  }
}

function parseApprenticeshipRequestId(rawId) {
  const parsed = Number.parseInt(String(rawId || ''), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function buildApprenticeshipPayload(body, files) {
  const errors = [];

  const fullName = cleanText(body.full_name);
  const fatherName = cleanText(body.father_name);
  const dob = cleanText(body.dob);
  const gender = cleanText(body.gender);
  const address = cleanText(body.address);
  const city = cleanText(body.city);
  const state = cleanText(body.state);
  const pinCode = cleanText(body.pin_code);
  const mobileNumber = cleanText(body.mobile_number);
  const email = cleanText(body.email).toLowerCase();
  const duration = cleanText(body.duration);
  const startDate = cleanText(body.start_date);
  const occupation = cleanText(body.occupation);
  const motivation = cleanText(body.motivation);

  if (!fullName) errors.push('full_name is required.');
  if (!fatherName) errors.push('father_name is required.');
  if (!dob) errors.push('dob is required.');
  if (!gender) errors.push('gender is required.');
  if (!address) errors.push('address is required.');
  if (!city) errors.push('city is required.');
  if (!state) errors.push('state is required.');
  if (!pinCode) errors.push('pin_code is required.');
  if (!mobileNumber) errors.push('mobile_number is required.');

  if (!email) {
    errors.push('email is required.');
  } else if (!EMAIL_REGEX.test(email)) {
    errors.push('email format is invalid.');
  }

  if (!duration) errors.push('duration is required.');
  if (!startDate) errors.push('start_date is required.');
  if (!occupation) errors.push('occupation is required.');
  if (!motivation) errors.push('motivation is required.');

  const preferredRoles = parseJsonArrayField(body.preferred_roles_json, 'preferred_roles_json', errors)
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

  if (preferredRoles.length === 0) {
    errors.push('At least one preferred role must be selected.');
  }

  const education = parseJsonArrayField(body.education_json, 'education_json', errors);

  REQUIRED_FILE_FIELDS.forEach((field) => {
    const file = files && files[field] && files[field][0];
    if (!file) {
      errors.push(`${field} file is required.`);
    }
  });

  const payload = {
    full_name: fullName,
    father_name: fatherName,
    mother_name: toNullableText(body.mother_name),
    dob,
    gender,
    address,
    city,
    state,
    pin_code: pinCode,
    permanent_address: toNullableText(body.permanent_address),
    mobile_number: mobileNumber,
    alt_mobile_number: toNullableText(body.alt_mobile_number),
    email,
    aadhaar_number: toNullableText(body.aadhaar_number),
    pan_number: toNullableText(body.pan_number),
    linkedin_profile: toNullableText(body.linkedin_profile),
    education,
    preferred_roles: preferredRoles,
    other_role_specify: toNullableText(body.other_role_specify),
    duration,
    start_date: startDate,
    occupation,
    motivation,
    declaration_place: toNullableText(body.declaration_place),
    declaration_date: toNullableText(body.declaration_date),
    signature: toNullableText(body.signature),
  };

  return { payload, errors };
}

async function submitApprenticeshipApplication(body, files) {
  await ApprenticeshipApplication.ensureApprenticeshipApplicationsTable();

  const { payload, errors } = buildApprenticeshipPayload(body || {}, files || {});

  if (errors.length > 0) {
    return {
      status: 400,
      body: { error: errors.join(' ') },
    };
  }

  const uploadedPaths = {};

  try {
    for (const field of FILE_FIELDS) {
      const file = files && files[field] && files[field][0];
      if (!file) {
        continue;
      }

      const uploadResult = await uploadApprenticeshipFile({
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname,
        email: payload.email,
        field,
      });

      uploadedPaths[field] = uploadResult.s3Path;
    }
  } catch (err) {
    return {
      status: 502,
      body: { error: 'Failed to upload one or more files to storage' },
    };
  }

  const applicationId = await ApprenticeshipApplication.createApprenticeshipApplication({
    ...payload,
    resume_path: uploadedPaths.resume || null,
    certificates_path: uploadedPaths.certificates || null,
    aadhaar_copy_path: uploadedPaths.aadhaar_copy || null,
    photo_path: uploadedPaths.photo || null,
  });

  return {
    status: 201,
    body: {
      message: 'Apprenticeship application submitted successfully. It is now pending for admin review.',
      id: applicationId,
      status: 'pending',
    },
  };
}

async function listApprenticeshipsByStatus(status) {
  await ApprenticeshipApplication.ensureApprenticeshipApplicationsTable();

  const applications = await ApprenticeshipApplication.getApprenticeshipsByStatus(status);

  return {
    status: 200,
    body: { applications },
  };
}

async function approveApprenticeshipApplication(rawId) {
  const id = parseApprenticeshipRequestId(rawId);

  if (!id) {
    return { status: 400, body: { error: 'Invalid apprenticeship application id.' } };
  }

  const result = await ApprenticeshipApplication.approveApprenticeshipById(id);

  if (result.outcome === 'not_found') {
    return { status: 404, body: { error: 'Apprenticeship application not found.' } };
  }

  if (result.outcome === 'already_active') {
    return {
      status: 409,
      body: {
        error: 'Apprenticeship application is already active.',
        application: result.application || null,
      },
    };
  }

  return {
    status: 200,
    body: {
      message: 'Apprenticeship application approved successfully',
      application: result.application || null,
    },
  };
}

async function rejectApprenticeshipApplication(rawId) {
  const id = parseApprenticeshipRequestId(rawId);

  if (!id) {
    return { status: 400, body: { error: 'Invalid apprenticeship application id.' } };
  }

  const result = await ApprenticeshipApplication.rejectApprenticeshipById(id);

  if (result.outcome === 'not_found') {
    return { status: 404, body: { error: 'Apprenticeship application not found.' } };
  }

  if (result.outcome === 'already_rejected') {
    return {
      status: 200,
      body: {
        message: 'Apprenticeship application is already rejected.',
        application: result.application || null,
      },
    };
  }

  return {
    status: 200,
    body: {
      message: 'Apprenticeship application marked as rejected.',
      application: result.application || null,
    },
  };
}

async function fetchApprenticeshipDocument(rawId, field) {
  await ApprenticeshipApplication.ensureApprenticeshipApplicationsTable();

  const id = parseApprenticeshipRequestId(rawId);

  if (!id) {
    return { status: 400, body: { error: 'Invalid apprenticeship application id.' }, document: null };
  }

  if (!FILE_FIELDS.includes(field)) {
    return { status: 400, body: { error: 'Invalid document field.' }, document: null };
  }

  const filePath = await ApprenticeshipApplication.getApprenticeshipFilePath(id, field);

  if (!filePath) {
    return {
      status: 404,
      body: { error: 'No document uploaded for this field.' },
      document: null,
    };
  }

  try {
    const streamed = await streamApprenticeshipFile({ s3Path: filePath });

    return {
      status: 200,
      body: { message: 'Apprenticeship document fetched successfully' },
      document: {
        buffer: streamed.buffer,
        contentType: streamed.contentType,
        fileName: `apprenticeship-${id}-${field}`,
      },
    };
  } catch (err) {
    console.warn(`Apprenticeship document S3 fetch failed for id=${id}, field=${field}: ${err.message || err}`);
    return {
      status: 502,
      body: { error: 'Failed to fetch document from storage' },
      document: null,
    };
  }
}

module.exports = {
  submitApprenticeshipApplication,
  listApprenticeshipsByStatus,
  approveApprenticeshipApplication,
  rejectApprenticeshipApplication,
  fetchApprenticeshipDocument,
};
