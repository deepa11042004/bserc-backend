const advisoryRegistrationService = require('../services/advisoryRegistrationService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function toStringArray(value) {
  const raw = Array.isArray(value) ? value : [value];

  return raw
    .map((item) => cleanText(item))
    .filter((item) => Boolean(item));
}

function toBoolean(value, defaultValue = false) {
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
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parseNullableInt(value, fieldName, errors) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  const parsed = Number.parseInt(cleaned, 10);
  if (!Number.isInteger(parsed)) {
    errors.push(`${fieldName} must be an integer.`);
    return null;
  }

  return parsed;
}

function parseRequestId(rawId) {
  const parsed = Number.parseInt(rawId, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function buildAdvisoryPayload(body) {
  const errors = [];

  const fullName = cleanText(body.full_name);
  const designation = cleanText(body.designation);
  const organizationInstitution = cleanText(body.organization_institution);
  const officialEmail = cleanText(body.official_email).toLowerCase();
  const mobileNumber = cleanText(body.mobile_number);
  const declarationAccepted = toBoolean(body.declaration_accepted, false);

  if (!fullName) {
    errors.push('full_name is required.');
  }

  if (!designation) {
    errors.push('designation is required.');
  }

  if (!organizationInstitution) {
    errors.push('organization_institution is required.');
  }

  if (!officialEmail) {
    errors.push('official_email is required.');
  } else if (!EMAIL_REGEX.test(officialEmail)) {
    errors.push('official_email format is invalid.');
  }

  const alternativeEmail = cleanText(body.alternative_email).toLowerCase();
  if (alternativeEmail && !EMAIL_REGEX.test(alternativeEmail)) {
    errors.push('alternative_email format is invalid.');
  }

  if (!mobileNumber) {
    errors.push('mobile_number is required.');
  }

  if (!declarationAccepted) {
    errors.push('declaration_accepted must be true.');
  }

  const payload = {
    full_name: fullName,
    designation,
    organization_institution: organizationInstitution,
    department_specialisation: toNullableText(body.department_specialisation),
    official_email: officialEmail,
    alternative_email: alternativeEmail || null,
    mobile_number: mobileNumber,
    location_text: toNullableText(body.location_text),
    highest_qualification: toNullableText(body.highest_qualification),
    qualification_year: toNullableText(body.qualification_year),
    experience_years: parseNullableInt(body.experience_years, 'experience_years', errors),
    key_research_areas: toNullableText(body.key_research_areas),
    professional_expertise: toNullableText(body.professional_expertise),
    preferred_contributions: toStringArray(body.preferred_contributions),
    preferred_contribution_other: toNullableText(body.preferred_contribution_other),
    contribution_modes: toStringArray(body.contribution_modes),
    contribution_mode_other: toNullableText(body.contribution_mode_other),
    monthly_hours: parseNullableInt(body.monthly_hours, 'monthly_hours', errors),
    interaction_modes: toStringArray(body.interaction_modes),
    availability_period: toNullableText(body.availability_period),
    suggestions: toStringArray(body.suggestions),
    viksit_bharat_contribution: toNullableText(body.viksit_bharat_contribution),
    media_support: body.media_support === null || body.media_support === undefined || body.media_support === ''
      ? null
      : toBoolean(body.media_support),
    media_tools: toNullableText(body.media_tools),
    declaration_accepted: declarationAccepted,
  };

  return { payload, errors };
}

async function registerAdvisory(req, res) {
  try {
    const { payload, errors } = buildAdvisoryPayload(req.body || {});

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const registrationId = await advisoryRegistrationService.createAdvisoryRegistration(payload);

    return res.status(201).json({
      message: 'Advisory application submitted successfully. It is now pending for admin review.',
      id: registrationId,
      status: 'pending',
    });
  } catch (err) {
    console.error('Advisory registration error:', err);
    return res.status(500).json({ error: 'Failed to submit advisory application' });
  }
}

async function getPendingAdvisory(req, res) {
  try {
    const advisories = await advisoryRegistrationService.getPendingAdvisoryMembers();
    return res.status(200).json({ advisories });
  } catch (err) {
    console.error('Pending advisory fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch advisory requests' });
  }
}

async function getActiveAdvisory(req, res) {
  try {
    const advisories = await advisoryRegistrationService.getActiveAdvisoryMembers();
    return res.status(200).json({ advisories });
  } catch (err) {
    console.error('Active advisory fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch advisory list' });
  }
}

async function getActiveAdvisoryAdminList(req, res) {
  try {
    const result = await advisoryRegistrationService.getActiveAdvisoriesForAdmin({
      page: req.query.page,
      pageSize: req.query.pageSize,
      exportAll: req.query.exportAll,
      contributionArea: req.query.contributionArea,
      contributionMode: req.query.contributionMode,
      search: req.query.search,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error('Admin advisory list fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch advisory list' });
  }
}

async function getPendingAdvisoryAdminList(req, res) {
  try {
    const result = await advisoryRegistrationService.getPendingAdvisoriesForAdmin({
      page: req.query.page,
      pageSize: req.query.pageSize,
      exportAll: req.query.exportAll,
      contributionArea: req.query.contributionArea,
      contributionMode: req.query.contributionMode,
      search: req.query.search,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error('Admin advisory requests fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch advisory requests' });
  }
}

async function approveAdvisory(req, res) {
  try {
    const advisoryId = parseRequestId(req.params.id);
    if (!advisoryId) {
      return res.status(400).json({ error: 'Invalid advisory id.' });
    }

    const result = await advisoryRegistrationService.approveAdvisoryById(advisoryId);

    if (result.outcome === 'not_found') {
      return res.status(404).json({ error: 'Advisory application not found.' });
    }

    if (result.outcome === 'already_active') {
      return res.status(409).json({
        error: 'Advisory member is already active.',
        advisory: result.advisory || null,
      });
    }

    if (result.outcome === 'invalid_status') {
      return res.status(409).json({
        error: `Advisory member cannot be approved from status: ${result.status}`,
      });
    }

    return res.status(200).json({
      message: 'Advisory member approved successfully',
      advisory: result.advisory || null,
    });
  } catch (err) {
    console.error('Advisory approval error:', err);
    return res.status(500).json({ error: 'Failed to approve advisory member' });
  }
}

async function moveAdvisoryToPending(req, res) {
  try {
    const advisoryId = parseRequestId(req.params.id);
    if (!advisoryId) {
      return res.status(400).json({ error: 'Invalid advisory id.' });
    }

    const result = await advisoryRegistrationService.moveAdvisoryToPendingById(advisoryId);

    if (result.outcome === 'not_found') {
      return res.status(404).json({ error: 'Advisory application not found.' });
    }

    if (result.outcome === 'already_pending') {
      return res.status(200).json({
        message: 'Advisory member is already pending.',
        advisory: result.advisory || null,
      });
    }

    if (result.outcome === 'invalid_status') {
      return res.status(409).json({
        error: `Advisory member cannot be moved to pending from status: ${result.status}`,
      });
    }

    return res.status(200).json({
      message: 'Advisory member moved to pending successfully',
      advisory: result.advisory || null,
    });
  } catch (err) {
    console.error('Move advisory to pending error:', err);
    return res.status(500).json({ error: 'Failed to move advisory member to pending' });
  }
}

async function rejectAdvisory(req, res) {
  try {
    const advisoryId = parseRequestId(req.params.id);
    if (!advisoryId) {
      return res.status(400).json({ error: 'Invalid advisory id.' });
    }

    const result = await advisoryRegistrationService.rejectAdvisoryById(advisoryId);

    if (result.outcome === 'not_found') {
      return res.status(404).json({ error: 'Advisory application not found.' });
    }

    return res.status(200).json({
      message: 'Advisory application rejected and deleted successfully',
    });
  } catch (err) {
    console.error('Advisory rejection error:', err);
    return res.status(500).json({ error: 'Failed to reject advisory application' });
  }
}

module.exports = {
  registerAdvisory,
  getPendingAdvisory,
  getActiveAdvisory,
  getActiveAdvisoryAdminList,
  getPendingAdvisoryAdminList,
  approveAdvisory,
  moveAdvisoryToPending,
  rejectAdvisory,
};
