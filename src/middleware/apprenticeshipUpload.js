const multer = require('multer');
const path = require('path');

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_RESUME_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_RESUME_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);

const ALLOWED_CERTIFICATES_MIME_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);
const ALLOWED_CERTIFICATES_EXTENSIONS = new Set(['.pdf', '.zip', '.jpg', '.jpeg', '.png']);

const ALLOWED_AADHAAR_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);
const ALLOWED_AADHAAR_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

const ALLOWED_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const ALLOWED_PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

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
  resume: {
    validate: (file) => isAllowedFile(file, ALLOWED_RESUME_MIME_TYPES, ALLOWED_RESUME_EXTENSIONS),
    message: 'Invalid resume file type. Use PDF, DOC, or DOCX.',
    code: 'UNSUPPORTED_RESUME_TYPE',
  },
  certificates: {
    validate: (file) => isAllowedFile(file, ALLOWED_CERTIFICATES_MIME_TYPES, ALLOWED_CERTIFICATES_EXTENSIONS),
    message: 'Invalid certificates file type. Use PDF, ZIP, JPG, or PNG.',
    code: 'UNSUPPORTED_CERTIFICATES_TYPE',
  },
  aadhaar_copy: {
    validate: (file) => isAllowedFile(file, ALLOWED_AADHAAR_MIME_TYPES, ALLOWED_AADHAAR_EXTENSIONS),
    message: 'Invalid Aadhaar copy file type. Use PDF, JPG, or PNG.',
    code: 'UNSUPPORTED_AADHAAR_TYPE',
  },
  photo: {
    validate: (file) => isAllowedFile(file, ALLOWED_PHOTO_MIME_TYPES, ALLOWED_PHOTO_EXTENSIONS),
    message: 'Invalid photo file type. Use JPG or PNG image.',
    code: 'UNSUPPORTED_PHOTO_TYPE',
  },
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: 4,
  },
  fileFilter: (req, file, cb) => {
    const validator = FIELD_VALIDATORS[file.fieldname];

    if (!validator) {
      const error = new Error('Unexpected file field. Allowed fields are resume, certificates, aadhaar_copy, and photo.');
      error.code = 'UNEXPECTED_APPRENTICESHIP_FILE_FIELD';
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

function uploadApprenticeshipFiles(req, res, next) {
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.startsWith('multipart/form-data')) {
    return next();
  }

  const handler = upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'certificates', maxCount: 1 },
    { name: 'aadhaar_copy', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
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
          error: 'Unexpected file field. Allowed fields are resume, certificates, aadhaar_copy, and photo.',
        });
      }

      return res.status(400).json({
        error: `Invalid upload: ${err.message}`,
      });
    }

    if (Object.values(FIELD_VALIDATORS).some((v) => v.code === err.code) || err.code === 'UNEXPECTED_APPRENTICESHIP_FILE_FIELD') {
      return res.status(400).json({
        error: err.message,
      });
    }

    console.error('Apprenticeship upload error:', err);
    return res.status(400).json({
      error: 'Failed to process uploaded files.',
    });
  });
}

module.exports = {
  uploadApprenticeshipFiles,
};
