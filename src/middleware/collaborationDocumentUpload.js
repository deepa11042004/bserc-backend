const multer = require('multer');

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('Unsupported document type. Allowed: PDF, DOC, DOCX.'));
      return;
    }

    cb(null, true);
  },
});

function uploadCollaborationSupportingDocument(req, res, next) {
  const contentType = req.headers['content-type'];

  if (!contentType || !contentType.startsWith('multipart/form-data')) {
    return next();
  }

  upload.single('supportingDocument')(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          error: 'Supporting document must be 10MB or smaller.',
        });
        return;
      }

      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({
          error: 'Unexpected file field. Use supportingDocument.',
        });
        return;
      }

      res.status(400).json({
        error: err.message,
      });
      return;
    }

    res.status(400).json({
      error: err.message || 'Supporting document upload failed.',
    });
  });
}

module.exports = {
  uploadCollaborationSupportingDocument,
};
