const SpeakerApplication = require('../models/SpeakerApplication');
const {
  uploadSpeakerApplicationFile,
  streamSpeakerApplicationFile,
} = require('./s3StorageService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FILE_FIELDS = ['ppt_outline', 'speaker_photo', 'brochure'];

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

function toBoolean(value) {
  return cleanText(value).toLowerCase() === 'true';
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

function parseSpeakerRequestId(rawId) {
  const parsed = Number.parseInt(String(rawId || ''), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function buildSpeakerPayload(body, files) {
  const errors = [];

  const fullName = cleanText(body.full_name);
  const email = cleanText(body.email).toLowerCase();
  const mobileNumber = cleanText(body.mobile_number);
  const designation = cleanText(body.designation);
  const organization = cleanText(body.organization);
  const country = cleanText(body.country);
  const city = cleanText(body.city);
  const bio = cleanText(body.bio);
  const yearsExperience = cleanText(body.years_experience);
  const sessionTitle = cleanText(body.session_title);
  const sessionType = cleanText(body.session_type);
  const track = cleanText(body.track);
  const audienceLevel = cleanText(body.audience_level);
  const abstractText = cleanText(body.abstract);
  const learningOutcomes = cleanText(body.learning_outcomes);
  const duration = cleanText(body.duration);
  const sessionFormat = cleanText(body.session_format);
  const preferredMode = cleanText(body.preferred_mode);
  const availabilityWindow = cleanText(body.availability_window);
  const timezone = cleanText(body.timezone);
  const needsBsercSupport = cleanText(body.needs_bserc_support).toLowerCase();

  if (!fullName) errors.push('full_name is required.');
  if (!email) {
    errors.push('email is required.');
  } else if (!EMAIL_REGEX.test(email)) {
    errors.push('email format is invalid.');
  }
  if (!mobileNumber) errors.push('mobile_number is required.');
  if (!designation) errors.push('designation is required.');
  if (!organization) errors.push('organization is required.');
  if (!country) errors.push('country is required.');
  if (!city) errors.push('city is required.');
  if (!bio) errors.push('bio is required.');
  if (!yearsExperience) errors.push('years_experience is required.');
  if (!sessionTitle) errors.push('session_title is required.');
  if (!sessionType) errors.push('session_type is required.');
  if (!track) errors.push('track is required.');
  if (!audienceLevel) errors.push('audience_level is required.');
  if (!abstractText) errors.push('abstract is required.');
  if (!learningOutcomes) errors.push('learning_outcomes is required.');
  if (!duration) errors.push('duration is required.');
  if (!sessionFormat) errors.push('session_format is required.');
  if (!preferredMode) errors.push('preferred_mode is required.');
  if (!availabilityWindow) errors.push('availability_window is required.');
  if (!timezone) errors.push('timezone is required.');

  if (!needsBsercSupport || !['yes', 'no'].includes(needsBsercSupport)) {
    errors.push('needs_bserc_support must be "yes" or "no".');
  }

  const areasOfExpertise = parseJsonArrayField(body.areas_of_expertise_json, 'areas_of_expertise_json', errors)
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  if (areasOfExpertise.length === 0) {
    errors.push('At least one area of expertise must be selected.');
  }

  const targetAudience = parseJsonArrayField(body.target_audience_json, 'target_audience_json', errors)
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  if (targetAudience.length === 0) {
    errors.push('At least one target audience must be selected.');
  }

  const technicalRequirements = parseJsonArrayField(body.technical_requirements_json, 'technical_requirements_json', errors)
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  if (technicalRequirements.length === 0) {
    errors.push('At least one technical requirement must be selected.');
  }

  const willingness = parseJsonArrayField(body.willingness_json, 'willingness_json', errors)
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

  const permissionPromo = toBoolean(body.permission_promo);
  const permissionRecording = toBoolean(body.permission_recording);
  const declarationConfirm = toBoolean(body.declaration_confirm);
  const dataConsent = toBoolean(body.data_consent);

  if (!permissionPromo) errors.push('permission_promo consent is required.');
  if (!permissionRecording) errors.push('permission_recording consent is required.');
  if (!declarationConfirm) errors.push('declaration_confirm is required.');
  if (!dataConsent) errors.push('data_consent is required.');

  const payload = {
    full_name: fullName,
    preferred_name: toNullableText(body.preferred_name),
    email,
    mobile_number: mobileNumber,
    whatsapp_number: toNullableText(body.whatsapp_number),
    designation,
    organization,
    country,
    city,
    linkedin_profile: toNullableText(body.linkedin_profile),
    website_url: toNullableText(body.website_url),
    bio,
    areas_of_expertise: areasOfExpertise,
    other_expertise_specify: toNullableText(body.other_expertise_specify),
    years_experience: yearsExperience,
    prior_speaking_links: toNullableText(body.prior_speaking_links),
    prior_speaking_events: toNullableText(body.prior_speaking_events),
    session_title: sessionTitle,
    session_type: sessionType,
    track,
    target_audience: targetAudience,
    audience_level: audienceLevel,
    abstract: abstractText,
    learning_outcomes: learningOutcomes,
    duration,
    session_format: sessionFormat,
    preferred_mode: preferredMode,
    availability_window: availabilityWindow,
    timezone,
    technical_requirements: technicalRequirements,
    other_technical_requirement: toNullableText(body.other_technical_requirement),
    needs_bserc_support: needsBsercSupport,
    bserc_support_details: toNullableText(body.bserc_support_details),
    permission_promo: permissionPromo,
    permission_recording: permissionRecording,
    honorarium_expectation: toNullableText(body.honorarium_expectation),
    willingness,
    declaration_confirm: declarationConfirm,
    data_consent: dataConsent,
  };

  return { payload, errors };
}

async function submitSpeakerApplication(body, files) {
  await SpeakerApplication.ensureSpeakerApplicationsTable();

  const { payload, errors } = buildSpeakerPayload(body || {}, files || {});

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

      const uploadResult = await uploadSpeakerApplicationFile({
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

  const applicationId = await SpeakerApplication.createSpeakerApplication({
    ...payload,
    ppt_outline_path: uploadedPaths.ppt_outline || null,
    speaker_photo_path: uploadedPaths.speaker_photo || null,
    brochure_path: uploadedPaths.brochure || null,
  });

  return {
    status: 201,
    body: {
      message: 'Speaker proposal submitted successfully. It is now pending for admin review.',
      id: applicationId,
      status: 'pending',
    },
  };
}

async function listSpeakerApplicationsByStatus(status) {
  await SpeakerApplication.ensureSpeakerApplicationsTable();

  const applications = await SpeakerApplication.getSpeakerApplicationsByStatus(status);

  return {
    status: 200,
    body: { applications },
  };
}

async function approveSpeakerApplication(rawId) {
  const id = parseSpeakerRequestId(rawId);

  if (!id) {
    return { status: 400, body: { error: 'Invalid speaker application id.' } };
  }

  const result = await SpeakerApplication.approveSpeakerApplicationById(id);

  if (result.outcome === 'not_found') {
    return { status: 404, body: { error: 'Speaker application not found.' } };
  }

  if (result.outcome === 'already_active') {
    return {
      status: 409,
      body: {
        error: 'Speaker application is already active.',
        application: result.application || null,
      },
    };
  }

  return {
    status: 200,
    body: {
      message: 'Speaker application approved successfully',
      application: result.application || null,
    },
  };
}

async function rejectSpeakerApplication(rawId) {
  const id = parseSpeakerRequestId(rawId);

  if (!id) {
    return { status: 400, body: { error: 'Invalid speaker application id.' } };
  }

  const result = await SpeakerApplication.rejectSpeakerApplicationById(id);

  if (result.outcome === 'not_found') {
    return { status: 404, body: { error: 'Speaker application not found.' } };
  }

  if (result.outcome === 'already_rejected') {
    return {
      status: 200,
      body: {
        message: 'Speaker application is already rejected.',
        application: result.application || null,
      },
    };
  }

  return {
    status: 200,
    body: {
      message: 'Speaker application marked as rejected.',
      application: result.application || null,
    },
  };
}

async function fetchSpeakerDocument(rawId, field) {
  await SpeakerApplication.ensureSpeakerApplicationsTable();

  const id = parseSpeakerRequestId(rawId);

  if (!id) {
    return { status: 400, body: { error: 'Invalid speaker application id.' }, document: null };
  }

  if (!FILE_FIELDS.includes(field)) {
    return { status: 400, body: { error: 'Invalid document field.' }, document: null };
  }

  const filePath = await SpeakerApplication.getSpeakerApplicationFilePath(id, field);

  if (!filePath) {
    return {
      status: 404,
      body: { error: 'No document uploaded for this field.' },
      document: null,
    };
  }

  try {
    const streamed = await streamSpeakerApplicationFile({ s3Path: filePath });

    return {
      status: 200,
      body: { message: 'Speaker document fetched successfully' },
      document: {
        buffer: streamed.buffer,
        contentType: streamed.contentType,
        fileName: `speaker-${id}-${field}`,
      },
    };
  } catch (err) {
    console.warn(`Speaker document S3 fetch failed for id=${id}, field=${field}: ${err.message || err}`);
    return {
      status: 502,
      body: { error: 'Failed to fetch document from storage' },
      document: null,
    };
  }
}

module.exports = {
  submitSpeakerApplication,
  listSpeakerApplicationsByStatus,
  approveSpeakerApplication,
  rejectSpeakerApplication,
  fetchSpeakerDocument,
};
