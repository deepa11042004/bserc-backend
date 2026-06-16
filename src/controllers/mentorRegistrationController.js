const mentorRegistrationService = require('../services/mentorRegistrationService');
const { streamMentorRegistrationFile } = require('../services/s3StorageService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_MENTOR_CURRENCIES = new Set(['INR', 'USD']);

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

function normalizeMentorCurrency(value) {
  const cleaned = cleanText(value).toUpperCase();
  if (!cleaned) {
    return null;
  }

  if (cleaned === '$' || cleaned === 'US$' || cleaned === 'US DOLLAR') {
    return 'USD';
  }

  if (cleaned === '₹' || cleaned === 'RS' || cleaned === 'INDIAN RUPEE') {
    return 'INR';
  }

  return cleaned;
}

function normalizeMentorNationality(value) {
  const cleaned = cleanText(value).toLowerCase();
  if (!cleaned) {
    return null;
  }

  if (cleaned === 'indian') {
    return 'Indian';
  }

  if (cleaned === 'other' || cleaned === 'others') {
    return 'Others';
  }

  return null;
}

function firstDefined(...values) {
  for (const value of values) {
    const candidate = firstValue(value);
    if (candidate === undefined || candidate === null) {
      continue;
    }

    if (typeof candidate === 'string' && candidate.trim() === '') {
      continue;
    }

    return candidate;
  }

  return undefined;
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

function parseNullableDecimal(value, fieldName, errors) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    errors.push(`${fieldName} must be a valid number.`);
    return null;
  }

  return parsed;
}

function isValidDateString(value) {
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

function parseMentorId(rawId) {
  const parsed = Number.parseInt(rawId, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function startsWithBytes(buffer, bytes) {
  if (!Buffer.isBuffer(buffer) || buffer.length < bytes.length) {
    return false;
  }

  for (let index = 0; index < bytes.length; index += 1) {
    if (buffer[index] !== bytes[index]) {
      return false;
    }
  }

  return true;
}

function detectResumeMimeType(buffer) {
  if (startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46])) {
    return 'application/pdf';
  }

  if (startsWithBytes(buffer, [0xD0, 0xCF, 0x11, 0xE0])) {
    return 'application/msword';
  }

  if (startsWithBytes(buffer, [0x50, 0x4B, 0x03, 0x04])) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  return 'application/octet-stream';
}

function detectImageMimeType(buffer) {
  if (startsWithBytes(buffer, [0xFF, 0xD8, 0xFF])) {
    return 'image/jpeg';
  }

  if (startsWithBytes(buffer, [0x89, 0x50, 0x4E, 0x47])) {
    return 'image/png';
  }

  if (
    startsWithBytes(buffer, [0x52, 0x49, 0x46, 0x46])
    && buffer.length > 11
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38])) {
    return 'image/gif';
  }

  return 'application/octet-stream';
}

function extensionForMimeType(mimeType) {
  const map = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };

  return map[mimeType] || 'bin';
}

function buildMentorPayload(req) {
  const errors = [];
  const resumeFile = req.files?.resume?.[0] || null;
  const profilePhotoFile = req.files?.profile_photo?.[0] || null;

  const fullName = cleanText(req.body.full_name);
  const email = cleanText(req.body.email).toLowerCase();
  const phone = cleanText(req.body.phone);
  const dob = cleanText(req.body.dob);
  const consultationFeeRaw = firstDefined(
    req.body.consultation_fee,
    req.body.honorarium_hourly,
    req.body.honorariumHourly
  );
  const price5Raw = firstDefined(
    req.body.price_5_sessions,
    req.body.honorarium_daily,
    req.body.honorariumDaily
  );
  const price10Raw = firstDefined(
    req.body.price_10_sessions,
    req.body.honorarium_weekly,
    req.body.honorariumWeekly
  );
  const priceExtendedRaw = firstDefined(
    req.body.price_extended,
    req.body.honorarium_project,
    req.body.honorariumProject
  );

  const consultationFee = parseNullableDecimal(
    consultationFeeRaw,
    'consultation_fee',
    errors
  );
  const price5Sessions = parseNullableDecimal(price5Raw, 'price_5_sessions', errors);
  const price10Sessions = parseNullableDecimal(price10Raw, 'price_10_sessions', errors);
  const priceExtended = parseNullableDecimal(priceExtendedRaw, 'price_extended', errors);

  const honorariumHourlyRaw = firstDefined(
    req.body.honorarium_hourly,
    req.body.honorariumHourly
  );
  const honorariumDailyRaw = firstDefined(
    req.body.honorarium_daily,
    req.body.honorariumDaily
  );
  const honorariumWeeklyRaw = firstDefined(
    req.body.honorarium_weekly,
    req.body.honorariumWeekly
  );
  const honorariumProjectRaw = firstDefined(
    req.body.honorarium_project,
    req.body.honorariumProject
  );

  const normalizedCurrency = normalizeMentorCurrency(req.body.currency);
  const nationality = normalizeMentorNationality(req.body.nationality);

  if (!fullName) {
    errors.push('full_name is required.');
  }

  if (!email) {
    errors.push('email is required.');
  } else if (!EMAIL_REGEX.test(email)) {
    errors.push('email format is invalid.');
  }

  if (!phone) {
    errors.push('phone is required.');
  }

  if (!dob) {
    errors.push('dob is required.');
  } else if (!isValidDateString(dob)) {
    errors.push('dob must be a valid date in YYYY-MM-DD format.');
  }

  if (
    normalizedCurrency
    && !ALLOWED_MENTOR_CURRENCIES.has(normalizedCurrency)
  ) {
    errors.push('currency must be INR or USD.');
  }

  if (!nationality) {
    errors.push('nationality is required and must be Indian or Others.');
  }

  const payload = {
    full_name: fullName,
    email,
    phone,
    dob,
    nationality,
    current_position: toNullableText(req.body.current_position),
    organization: toNullableText(req.body.organization),
    years_experience: parseNullableInt(req.body.years_experience, 'years_experience', errors),
    professional_bio: toNullableText(req.body.professional_bio),
    primary_track: toNullableText(req.body.primary_track),
    secondary_skills: toNullableText(req.body.secondary_skills),
    key_competencies: toNullableText(req.body.key_competencies),
    video_call: toBoolean(req.body.video_call, false),
    phone_call: toBoolean(req.body.phone_call, false),
    live_chat: toBoolean(req.body.live_chat, false),
    email_support: toBoolean(req.body.email_support, false),
    availability: toNullableText(req.body.availability),
    max_students: parseNullableInt(req.body.max_students, 'max_students', errors),
    session_duration: toNullableText(req.body.session_duration),
    consultation_fee: consultationFee,
    price_5_sessions: price5Sessions,
    price_10_sessions: price10Sessions,
    price_extended: priceExtended,
    currency: normalizedCurrency,
    honorarium_hourly: honorariumHourlyRaw === undefined
      ? consultationFee
      : parseNullableDecimal(honorariumHourlyRaw, 'honorarium_hourly', errors),
    honorarium_daily: honorariumDailyRaw === undefined
      ? price5Sessions
      : parseNullableDecimal(honorariumDailyRaw, 'honorarium_daily', errors),
    honorarium_weekly: honorariumWeeklyRaw === undefined
      ? price10Sessions
      : parseNullableDecimal(honorariumWeeklyRaw, 'honorarium_weekly', errors),
    honorarium_project: honorariumProjectRaw === undefined
      ? priceExtended
      : parseNullableDecimal(honorariumProjectRaw, 'honorarium_project', errors),
    complimentary_session: toBoolean(req.body.complimentary_session, false),
    resume: resumeFile?.buffer || null,
    resume_mime_type: resumeFile?.mimetype || null,
    resume_file_name: resumeFile?.originalname || null,
    profile_photo: profilePhotoFile?.buffer || null,
    profile_photo_mime_type: profilePhotoFile?.mimetype || null,
    profile_photo_file_name: profilePhotoFile?.originalname || null,
    linkedin_url: toNullableText(req.body.linkedin_url),
    portfolio_url: toNullableText(req.body.portfolio_url),
    has_mentored_before: req.body.has_mentored_before === undefined
      ? null
      : toBoolean(req.body.has_mentored_before, false),
    mentoring_experience: toNullableText(req.body.mentoring_experience),
    accepted_guidelines: req.body.accepted_guidelines === undefined
      ? null
      : toBoolean(req.body.accepted_guidelines, false),
    accepted_code_of_conduct: req.body.accepted_code_of_conduct === undefined
      ? null
      : toBoolean(req.body.accepted_code_of_conduct, false),
  };

  return { payload, errors };
}

async function createPaymentOrder(req, res) {
  try {
    const result = await mentorRegistrationService.createPaymentOrder(req.body || {});
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('Mentor payment order error:', err);
    return res.status(500).json({ error: 'Failed to create mentor payment order' });
  }
}

async function registerMentor(req, res) {
  try {
    const { payload, errors } = buildMentorPayload(req);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const paymentVerification = await mentorRegistrationService.verifyPaymentForRegistration({
      nationality: payload.nationality,
      razorpay_order_id: req.body.razorpay_order_id,
      razorpay_payment_id: req.body.razorpay_payment_id,
      razorpay_signature: req.body.razorpay_signature,
    });

    if (paymentVerification.status !== 200) {
      return res.status(paymentVerification.status).json({
        error: paymentVerification.body?.message || 'Payment verification failed',
      });
    }

    const upsertResult = await mentorRegistrationService.upsertMentorRegistration({
      ...payload,
      ...(paymentVerification.paymentDetails || {}),
    });

    if (upsertResult.outcome === 'already_completed') {
      return res.status(200).json({
        message: 'Payment verified. Email already registered.',
        payment: paymentVerification.paymentDetails,
      });
    }

    return res.status(201).json({
      message: 'Payment verified and mentor registered successfully',
      payment: paymentVerification.paymentDetails,
    });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    console.error('Mentor registration error:', err);
    return res.status(500).json({ error: 'Failed to register mentor' });
  }
}

async function logPaymentAttempt(req, res) {
  try {
    const { payload, errors } = buildMentorPayload(req);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const result = await mentorRegistrationService.logPaymentAttempt({
      ...payload,
      payment_status: req.body.payment_status,
      payment_mode: req.body.payment_mode,
      razorpay_order_id: req.body.razorpay_order_id,
      razorpay_payment_id: req.body.razorpay_payment_id || req.body.transaction_id,
      transaction_id: req.body.transaction_id,
      failure_reason: req.body.failure_reason,
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    console.error('Mentor payment attempt logging error:', err);
    return res.status(500).json({ error: 'Failed to log mentor payment attempt' });
  }
}

async function getMentorById(req, res) {
  try {
    const mentorId = parseMentorId(req.params.id);
    if (!mentorId) {
      return res.status(400).json({ error: 'Invalid mentor id.' });
    }

    const mentor = await mentorRegistrationService.getMentorById(mentorId);
    if (!mentor) {
      return res.status(404).json({ error: 'Mentor not found.' });
    }

    return res.status(200).json(mentor);
  } catch (err) {
    console.error('Mentor fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch mentor details' });
  }
}

async function sendMentorFile(req, res, options) {
  try {
    const mentorId = parseMentorId(req.params.id);
    if (!mentorId) {
      return res.status(400).json({ error: 'Invalid mentor id.' });
    }

    const result = await mentorRegistrationService.getMentorFileById(mentorId, options.column);
    if (!result.found) {
      return res.status(404).json({ error: 'Mentor not found.' });
    }

    if (!result.file) {
      res.set('Cache-Control', 'public, max-age=300');
      return res.status(404).json({ error: options.missingMessage });
    }

    const fileRecord = result.file;

    const s3File = await streamMentorRegistrationFile({ s3Path: fileRecord.s3Path });
    const mimeType = s3File.contentType || 'application/octet-stream';
    const extension = extensionForMimeType(mimeType);

    res.set('Content-Type', mimeType);
    res.set('Content-Length', String(s3File.buffer.length));
    res.set('Content-Disposition', `inline; filename="mentor-${mentorId}-${options.filenamePrefix}.${extension}"`);
    res.set('X-Media-Source', 's3');

    return res.status(200).send(s3File.buffer);
  } catch (err) {
    console.error('Mentor file fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch mentor file' });
  }
}

async function getMentorResume(req, res) {
  return sendMentorFile(req, res, {
    column: 'resume',
    filenamePrefix: 'resume',
    missingMessage: 'Resume not found for this mentor.',
  });
}

async function getMentorProfilePhoto(req, res) {
  return sendMentorFile(req, res, {
    column: 'profile_photo',
    filenamePrefix: 'profile-photo',
    missingMessage: 'Profile photo not found for this mentor.',
  });
}

async function getPendingMentors(req, res) {
  try {
    const mentors = await mentorRegistrationService.getPendingMentors();
    return res.status(200).json({ mentors });
  } catch (err) {
    console.error('Pending mentors fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch mentor requests' });
  }
}

async function getActiveMentors(req, res) {
  try {
    const mentors = await mentorRegistrationService.getActiveMentors();
    return res.status(200).json({ mentors });
  } catch (err) {
    console.error('Active mentors fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch mentor list' });
  }
}

async function approveMentor(req, res) {
  try {
    const mentorId = parseMentorId(req.params.id);
    if (!mentorId) {
      return res.status(400).json({ error: 'Invalid mentor id.' });
    }

    const result = await mentorRegistrationService.approveMentorById(mentorId);

    if (result.outcome === 'status_column_missing') {
      return res.status(500).json({
        error:
          "Mentor status is not configured. Apply migration: ALTER TABLE mentor_registrations ADD COLUMN status ENUM('pending', 'active') DEFAULT 'pending';",
      });
    }

    if (result.outcome === 'not_found') {
      return res.status(404).json({ error: 'Mentor not found.' });
    }

    if (result.outcome === 'already_active') {
      return res.status(409).json({
        error: 'Mentor is already active.',
        mentor: result.mentor || null,
      });
    }

    if (result.outcome === 'invalid_status') {
      return res.status(409).json({
        error: `Mentor cannot be approved from status: ${result.status}`,
      });
    }

    return res.status(200).json({
      message: 'Mentor approved successfully',
      mentor: result.mentor || null,
    });
  } catch (err) {
    console.error('Mentor approval error:', err);
    return res.status(500).json({ error: 'Failed to approve mentor' });
  }
}

async function moveMentorToPending(req, res) {
  try {
    const mentorId = parseMentorId(req.params.id);
    if (!mentorId) {
      return res.status(400).json({ error: 'Invalid mentor id.' });
    }

    const result = await mentorRegistrationService.moveMentorToPendingById(mentorId);

    if (result.outcome === 'status_column_missing') {
      return res.status(500).json({
        error:
          "Mentor status is not configured. Apply migration: ALTER TABLE mentor_registrations ADD COLUMN status ENUM('pending', 'active') DEFAULT 'pending';",
      });
    }

    if (result.outcome === 'not_found') {
      return res.status(404).json({ error: 'Mentor not found.' });
    }

    if (result.outcome === 'already_pending') {
      return res.status(200).json({
        message: 'Mentor is already pending.',
        mentor: result.mentor || null,
      });
    }

    if (result.outcome === 'invalid_status') {
      return res.status(409).json({
        error: `Mentor cannot be moved to pending from status: ${result.status}`,
      });
    }

    return res.status(200).json({
      message: 'Mentor moved to pending successfully',
      mentor: result.mentor || null,
    });
  } catch (err) {
    console.error('Move mentor to pending error:', err);
    return res.status(500).json({ error: 'Failed to move mentor to pending' });
  }
}

async function updateMentor(req, res) {
  try {
    const mentorId = parseMentorId(req.params.id);
    if (!mentorId) {
      return res.status(400).json({ error: 'Invalid mentor id.' });
    }

    const body = req.body || {};
    const errors = [];
    const fields = {};

    // Required text fields
    if ('full_name' in body) {
      const val = cleanText(body.full_name);
      if (!val) { errors.push('full_name cannot be empty.'); }
      else { fields.full_name = val; }
    }
    if ('email' in body) {
      const val = cleanText(body.email).toLowerCase();
      if (!val || !EMAIL_REGEX.test(val)) { errors.push('email format is invalid.'); }
      else { fields.email = val; }
    }
    if ('phone' in body) {
      const val = cleanText(body.phone);
      if (!val) { errors.push('phone cannot be empty.'); }
      else { fields.phone = val; }
    }
    if ('dob' in body) {
      const val = cleanText(body.dob);
      if (val && !isValidDateString(val)) { errors.push('dob must be a valid date in YYYY-MM-DD format.'); }
      else { fields.dob = val || null; }
    }

    // Nationality
    if ('nationality' in body) {
      fields.nationality = normalizeMentorNationality(body.nationality) || null;
    }

    // Nullable text fields
    if ('current_position' in body) { fields.current_position = toNullableText(body.current_position); }
    if ('organization' in body) { fields.organization = toNullableText(body.organization); }
    if ('professional_bio' in body) { fields.professional_bio = toNullableText(body.professional_bio); }
    if ('primary_track' in body) { fields.primary_track = toNullableText(body.primary_track); }
    if ('secondary_skills' in body) { fields.secondary_skills = toNullableText(body.secondary_skills); }
    if ('key_competencies' in body) { fields.key_competencies = toNullableText(body.key_competencies); }
    if ('availability' in body) { fields.availability = toNullableText(body.availability); }
    if ('session_duration' in body) { fields.session_duration = toNullableText(body.session_duration); }
    if ('mentoring_experience' in body) { fields.mentoring_experience = toNullableText(body.mentoring_experience); }
    if ('linkedin_url' in body) { fields.linkedin_url = toNullableText(body.linkedin_url); }
    if ('portfolio_url' in body) { fields.portfolio_url = toNullableText(body.portfolio_url); }
    if ('currency' in body) { fields.currency = normalizeMentorCurrency(body.currency) || null; }

    // Numeric fields
    if ('years_experience' in body) { fields.years_experience = parseNullableInt(body.years_experience, 'years_experience', errors); }
    if ('max_students' in body) { fields.max_students = parseNullableInt(body.max_students, 'max_students', errors); }
    if ('consultation_fee' in body) { fields.consultation_fee = parseNullableDecimal(body.consultation_fee, 'consultation_fee', errors); }
    if ('price_5_sessions' in body) { fields.price_5_sessions = parseNullableDecimal(body.price_5_sessions, 'price_5_sessions', errors); }
    if ('price_10_sessions' in body) { fields.price_10_sessions = parseNullableDecimal(body.price_10_sessions, 'price_10_sessions', errors); }
    if ('price_extended' in body) { fields.price_extended = parseNullableDecimal(body.price_extended, 'price_extended', errors); }
    if ('honorarium_hourly' in body) { fields.honorarium_hourly = parseNullableDecimal(body.honorarium_hourly, 'honorarium_hourly', errors); }
    if ('honorarium_daily' in body) { fields.honorarium_daily = parseNullableDecimal(body.honorarium_daily, 'honorarium_daily', errors); }
    if ('honorarium_weekly' in body) { fields.honorarium_weekly = parseNullableDecimal(body.honorarium_weekly, 'honorarium_weekly', errors); }
    if ('honorarium_project' in body) { fields.honorarium_project = parseNullableDecimal(body.honorarium_project, 'honorarium_project', errors); }

    // Boolean fields
    if ('video_call' in body) { fields.video_call = toBoolean(body.video_call, false); }
    if ('phone_call' in body) { fields.phone_call = toBoolean(body.phone_call, false); }
    if ('live_chat' in body) { fields.live_chat = toBoolean(body.live_chat, false); }
    if ('email_support' in body) { fields.email_support = toBoolean(body.email_support, false); }
    if ('complimentary_session' in body) { fields.complimentary_session = toBoolean(body.complimentary_session, false); }
    if ('has_mentored_before' in body) {
      fields.has_mentored_before = body.has_mentored_before === null || body.has_mentored_before === '' || body.has_mentored_before === undefined
        ? null
        : toBoolean(body.has_mentored_before, false);
    }
    if ('accepted_guidelines' in body) { fields.accepted_guidelines = toBoolean(body.accepted_guidelines, false); }
    if ('accepted_code_of_conduct' in body) { fields.accepted_code_of_conduct = toBoolean(body.accepted_code_of_conduct, false); }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const result = await mentorRegistrationService.updateMentorProfileById(mentorId, fields);

    if (result.outcome === 'not_found') {
      return res.status(404).json({ error: 'Mentor not found.' });
    }

    return res.status(200).json({ message: 'Mentor updated successfully.' });
  } catch (err) {
    console.error('Mentor update error:', err);
    return res.status(500).json({ error: 'Failed to update mentor' });
  }
}

async function rejectMentor(req, res) {
  try {
    const mentorId = parseMentorId(req.params.id);
    if (!mentorId) {
      return res.status(400).json({ error: 'Invalid mentor id.' });
    }

    const result = await mentorRegistrationService.rejectMentorById(mentorId);

    if (result.outcome === 'not_found') {
      return res.status(404).json({ error: 'Mentor not found.' });
    }

    return res.status(200).json({
      message: 'Mentor rejected and deleted successfully',
    });
  } catch (err) {
    console.error('Mentor rejection error:', err);
    return res.status(500).json({ error: 'Failed to reject mentor' });
  }
}

module.exports = {
  createPaymentOrder,
  registerMentor,
  logPaymentAttempt,
  getMentorById,
  getMentorResume,
  getMentorProfilePhoto,
  getPendingMentors,
  getActiveMentors,
  approveMentor,
  moveMentorToPending,
  rejectMentor,
  updateMentor,
};
