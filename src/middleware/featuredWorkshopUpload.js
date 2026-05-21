const multer = require('multer');

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function isSupportedImageMimeType(mimeType) {
  const value = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';
  return value.startsWith('image/');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!isSupportedImageMimeType(file.mimetype)) {
      cb(new Error('Unsupported image type. Allowed: image/*'));
      return;
    }

    cb(null, true);
  },
});

function uploadFeaturedWorkshopBackground(req, res, next) {
  const contentType = req.headers['content-type'];

  if (!contentType || !contentType.startsWith('multipart/form-data')) {
    return next();
  }

  upload.single('background')(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          success: false,
          message: 'Background image must be 5MB or smaller.',
        });
        return;
      }

      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({
          success: false,
          message: 'Unexpected file field. Use background.',
        });
        return;
      }

      res.status(400).json({
        success: false,
        message: err.message,
      });
      return;
    }

    res.status(400).json({
      success: false,
      message: err.message || 'Featured workshop background upload failed.',
    });
  });
}

function uploadFeaturedWorkshopCardImage(req, res, next) {
  const contentType = req.headers['content-type'];

  if (!contentType || !contentType.startsWith('multipart/form-data')) {
    return next();
  }

  upload.single('image')(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          success: false,
          message: 'Card image must be 5MB or smaller.',
        });
        return;
      }

      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({
          success: false,
          message: 'Unexpected file field. Use image.',
        });
        return;
      }

      res.status(400).json({
        success: false,
        message: err.message,
      });
      return;
    }

    res.status(400).json({
      success: false,
      message: err.message || 'Featured workshop image upload failed.',
    });
  });
}

module.exports = {
  uploadFeaturedWorkshopBackground,
  uploadFeaturedWorkshopCardImage,
};
