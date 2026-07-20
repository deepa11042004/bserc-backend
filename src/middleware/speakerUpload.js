const multer = require('multer');
const path = require('path');

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_PPT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
const ALLOWED_PPT_EXTENSIONS = new Set(['.pdf', '.ppt', '.pptx']);

const ALLOWED_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const ALLOWED_PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

const ALLOWED_BROCHURE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_BROCHURE_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);

const GENERIC_BINARY_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'application/force-download',
]);

function hasAllowedExtension(fileName, allowedExtensions) {
  const extension = path.extname(String(fileName || '')).toLowerCase();
  return allowedExtensions.has(extension);
}

function isGenericBinaryMimeType(mimeType) {
  return GENERIC_BINARY_MIME_TYPES.has(String(mimeType || '').toLowerCase());
}

function isAllowedFile(file, allowedMimeTypes, allowedExtensions) {
  const mimeType = String(file.mimetype || '').toLowerCase();
  if (allowedMimeTypes.has(mimeType)) {
    return true;
  }

  return isGenericBinaryMimeType(mimeType) && hasAllowedExtension(file.originalname, allowedExtensions);
}

const FIELD_VALIDATORS = {
  ppt_outline: {
    validate: (file) => isAllowedFile(file, ALLOWED_PPT_MIME_TYPES, ALLOWED_PPT_EXTENSIONS),
    message: 'Invalid PPT outline file type. Use PDF, PPT, or PPTX.',
    code: 'UNSUPPORTED_PPT_OUTLINE_TYPE',
  },
  speaker_photo: {
    validate: (file) => isAllowedFile(file, ALLOWED_PHOTO_MIME_TYPES, ALLOWED_PHOTO_EXTENSIONS),
    message: 'Invalid speaker photo file type. Use JPG or PNG image.',
    code: 'UNSUPPORTED_SPEAKER_PHOTO_TYPE',
  },
  brochure: {
    validate: (file) => isAllowedFile(file, ALLOWED_BROCHURE_MIME_TYPES, ALLOWED_BROCHURE_EXTENSIONS),
    message: 'Invalid brochure file type. Use PDF, DOC, or DOCX.',
    code: 'UNSUPPORTED_BROCHURE_TYPE',
  },
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: 3,
  },
  fileFilter: (req, file, cb) => {
    const validator = FIELD_VALIDATORS[file.fieldname];

    if (!validator) {
      const error = new Error('Unexpected file field. Allowed fields are ppt_outline, speaker_photo, and brochure.');
      error.code = 'UNEXPECTED_SPEAKER_FILE_FIELD';
      return cb(error);
    }

    if (!validator.validate(file)) {
      const error = new Error(validator.message);
      error.code = validator.code;
      return cb(error);
    }

    return cb(null, true);
  },
});

function uploadSpeakerFiles(req, res, next) {
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.startsWith('multipart/form-data')) {
    return next();
  }

  const handler = upload.fields([
    { name: 'ppt_outline', maxCount: 1 },
    { name: 'speaker_photo', maxCount: 1 },
    { name: 'brochure', maxCount: 1 },
  ]);

  handler(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'File too large. Max size is 10MB per file.',
        });
      }

      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          error: 'Too many files uploaded.',
        });
      }

      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          error: 'Unexpected file field. Allowed fields are ppt_outline, speaker_photo, and brochure.',
        });
      }

      return res.status(400).json({
        error: `Invalid upload: ${err.message}`,
      });
    }

    if (Object.values(FIELD_VALIDATORS).some((v) => v.code === err.code) || err.code === 'UNEXPECTED_SPEAKER_FILE_FIELD') {
      return res.status(400).json({
        error: err.message,
      });
    }

    console.error('Speaker upload error:', err);
    return res.status(400).json({
      error: 'Failed to process uploaded files.',
    });
  });
}

module.exports = {
  uploadSpeakerFiles,
};
