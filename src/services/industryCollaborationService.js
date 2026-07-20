const IndustryCollaboration = require('../models/IndustryCollaboration');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNullableText(value) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function toStringArray(value, fieldName, errors) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    errors.push(`${fieldName} must be an array.`);
    return [];
  }

  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
}

function parseIndustryCollaborationRequestId(rawId) {
  const parsed = Number.parseInt(String(rawId || ''), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function buildIndustryCollaborationPayload(body) {
  const errors = [];

  const contactEmail = cleanText(body.contact_email).toLowerCase();
  const organizationName = cleanText(body.organization_name);
  const organizationType = cleanText(body.organization_type);
  const websiteUrl = cleanText(body.website_url);
  const registeredAddress = cleanText(body.registered_address);
  const countryStateCity = cleanText(body.country_state_city);
  const repFullName = cleanText(body.representative_full_name);
  const repDesignation = cleanText(body.representative_designation);
  const repDepartment = cleanText(body.representative_department);
  const repOfficialEmail = cleanText(body.representative_official_email).toLowerCase();
  const repContactNumber = cleanText(body.representative_contact_number);
  const supportCategory = cleanText(body.support_category);
  const signatoryName = cleanText(body.signatory_name);
  const signatoryDesignation = cleanText(body.signatory_designation);
  const contactInformation = cleanText(body.contact_information);

  if (!contactEmail) {
    errors.push('contact_email is required.');
  } else if (!EMAIL_REGEX.test(contactEmail)) {
    errors.push('contact_email format is invalid.');
  }

  if (!organizationName) errors.push('organization_name is required.');
  if (!organizationType) errors.push('organization_type is required.');
  if (!websiteUrl) errors.push('website_url is required.');
  if (!registeredAddress) errors.push('registered_address is required.');
  if (!countryStateCity) errors.push('country_state_city is required.');

  if (!repFullName) errors.push('representative_full_name is required.');
  if (!repDesignation) errors.push('representative_designation is required.');
  if (!repDepartment) errors.push('representative_department is required.');
  if (!repOfficialEmail) {
    errors.push('representative_official_email is required.');
  } else if (!EMAIL_REGEX.test(repOfficialEmail)) {
    errors.push('representative_official_email format is invalid.');
  }
  if (!repContactNumber) errors.push('representative_contact_number is required.');

  const certificationAcademicInterests = toStringArray(
    body.certification_academic_interests,
    'certification_academic_interests',
    errors,
  );
  if (certificationAcademicInterests.length === 0) {
    errors.push('At least one certification_academic_interests option must be selected.');
  }

  const sponsorshipOutreachInterests = toStringArray(
    body.sponsorship_outreach_interests,
    'sponsorship_outreach_interests',
    errors,
  );
  if (sponsorshipOutreachInterests.length === 0) {
    errors.push('At least one sponsorship_outreach_interests option must be selected.');
  }

  const technicalIndustryInterests = toStringArray(
    body.technical_industry_interests,
    'technical_industry_interests',
    errors,
  );
  if (technicalIndustryInterests.length === 0) {
    errors.push('At least one technical_industry_interests option must be selected.');
  }

  const domainAreas = toStringArray(body.domain_areas, 'domain_areas', errors);
  if (domainAreas.length === 0) {
    errors.push('At least one domain area must be selected.');
  }

  const sponsorshipCategories = toStringArray(
    body.sponsorship_categories,
    'sponsorship_categories',
    errors,
  );
  if (sponsorshipCategories.length === 0) {
    errors.push('At least one sponsorship category must be selected.');
  }

  if (!supportCategory) errors.push('support_category is required.');

  if (body.declaration_agree !== true) {
    errors.push('declaration_agree must be accepted.');
  }

  if (!signatoryName) errors.push('signatory_name is required.');
  if (!signatoryDesignation) errors.push('signatory_designation is required.');
  if (!contactInformation) errors.push('contact_information is required.');

  const payload = {
    contact_email: contactEmail,
    organization_name: organizationName,
    organization_type: organizationType,
    other_organization_type: toNullableText(body.other_organization_type),
    website_url: websiteUrl,
    registered_address: registeredAddress,
    country_state_city: countryStateCity,
    representative_full_name: repFullName,
    representative_designation: repDesignation,
    representative_department: repDepartment,
    representative_official_email: repOfficialEmail,
    representative_contact_number: repContactNumber,
    representative_linkedin: toNullableText(body.representative_linkedin),
    certification_academic_interests: certificationAcademicInterests,
    sponsorship_outreach_interests: sponsorshipOutreachInterests,
    technical_industry_interests: technicalIndustryInterests,
    domain_areas: domainAreas,
    other_domain_area: toNullableText(body.other_domain_area),
    sponsorship_categories: sponsorshipCategories,
    support_category: supportCategory,
    other_support_category: toNullableText(body.other_support_category),
    declaration_agree: body.declaration_agree === true,
    signatory_name: signatoryName,
    signatory_designation: signatoryDesignation,
    contact_information: contactInformation,
    any_query: toNullableText(body.any_query),
  };

  return { payload, errors };
}

async function submitIndustryCollaboration(body) {
  await IndustryCollaboration.ensureIndustryCollaborationsTable();

  const { payload, errors } = buildIndustryCollaborationPayload(body || {});

  if (errors.length > 0) {
    return {
      status: 400,
      body: { error: errors.join(' ') },
    };
  }

  const applicationId = await IndustryCollaboration.createIndustryCollaboration(payload);

  return {
    status: 201,
    body: {
      message: 'Expression of interest submitted successfully. It is now pending for admin review.',
      id: applicationId,
      status: 'pending',
    },
  };
}

async function listIndustryCollaborationsByStatus(status) {
  await IndustryCollaboration.ensureIndustryCollaborationsTable();

  const applications = await IndustryCollaboration.getIndustryCollaborationsByStatus(status);

  return {
    status: 200,
    body: { applications },
  };
}

async function approveIndustryCollaboration(rawId) {
  const id = parseIndustryCollaborationRequestId(rawId);

  if (!id) {
    return { status: 400, body: { error: 'Invalid industry collaboration id.' } };
  }

  const result = await IndustryCollaboration.approveIndustryCollaborationById(id);

  if (result.outcome === 'not_found') {
    return { status: 404, body: { error: 'Industry collaboration submission not found.' } };
  }

  if (result.outcome === 'already_active') {
    return {
      status: 409,
      body: {
        error: 'Industry collaboration submission is already active.',
        application: result.application || null,
      },
    };
  }

  return {
    status: 200,
    body: {
      message: 'Industry collaboration submission approved successfully',
      application: result.application || null,
    },
  };
}

async function rejectIndustryCollaboration(rawId) {
  const id = parseIndustryCollaborationRequestId(rawId);

  if (!id) {
    return { status: 400, body: { error: 'Invalid industry collaboration id.' } };
  }

  const result = await IndustryCollaboration.rejectIndustryCollaborationById(id);

  if (result.outcome === 'not_found') {
    return { status: 404, body: { error: 'Industry collaboration submission not found.' } };
  }

  if (result.outcome === 'already_rejected') {
    return {
      status: 200,
      body: {
        message: 'Industry collaboration submission is already rejected.',
        application: result.application || null,
      },
    };
  }

  return {
    status: 200,
    body: {
      message: 'Industry collaboration submission marked as rejected.',
      application: result.application || null,
    },
  };
}

module.exports = {
  submitIndustryCollaboration,
  listIndustryCollaborationsByStatus,
  approveIndustryCollaboration,
  rejectIndustryCollaboration,
};
