const multer = require('multer');

const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_DOC_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_DOC_BYTES,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_DOC_MIME_TYPES.has(file.mimetype)) {
      const error = new Error('Invalid file type. Use PDF, DOC, DOCX, or ZIP.');
      error.code = 'UNSUPPORTED_DOC_TYPE';
      return cb(error);
    }

    return cb(null, true);
  },
});

function uploadProjectListingDocument(req, res, next) {
  const contentType = req.headers['content-type'] || '';

  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return next();
  }

  const handler = upload.fields([
    { name: 'supportingDocument', maxCount: 1 },
    { name: 'supporting_document', maxCount: 1 },
  ]);

  handler(req, res, (err) => {
    if (!err) {
      const filesByField = req.files || {};
      const normalizedDoc =
        (filesByField.supportingDocument && filesByField.supportingDocument[0])
        || (filesByField.supporting_document && filesByField.supporting_document[0])
        || null;

      if (normalizedDoc) {
        req.projectListingDocument = normalizedDoc;
      }

      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          message: 'Supporting document is too large. Max size is 10MB.',
        });
      }

      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          message: 'Unexpected file field. Use supportingDocument.',
        });
      }

      return res.status(400).json({
        message: `Invalid upload: ${err.message}`,
      });
    }

    if (err.code === 'UNSUPPORTED_DOC_TYPE') {
      return res.status(400).json({
        message: err.message,
      });
    }

    console.error('Project listing document upload error:', err);
    return res.status(400).json({
      message: 'Failed to process supporting document upload.',
    });
  });
}

module.exports = {
  uploadProjectListingDocument,
  MAX_DOC_BYTES,
  ALLOWED_DOC_MIME_TYPES,
};
