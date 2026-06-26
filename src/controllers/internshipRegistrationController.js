const internshipRegistrationService = require('../services/internshipRegistrationService');
const {
  uploadInternshipPassportPhoto,
  getPresignedObjectUrl,
} = require('../services/s3StorageService');

async function createPaymentOrder(req, res, next) {
  try {
    const result = await internshipRegistrationService.createPaymentOrder(req.body || {});
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function verifyPaymentAndRegister(req, res, next) {
  try {
    const payload = { ...(req.body || {}) };
    const uploadedPhoto = req.internshipPhoto || req.file;

    if (uploadedPhoto?.buffer) {
      const uploadResult = await uploadInternshipPassportPhoto({
        buffer: uploadedPhoto.buffer,
        mimeType: uploadedPhoto.mimetype,
        originalName: uploadedPhoto.originalname,
        email: payload.email,
        internshipName: payload.internship_name || payload.internshipName,
      });

      payload.passport_photo_path = uploadResult.s3Path;
      payload.passport_photo_mime_type = uploadedPhoto.mimetype;
      payload.passport_photo_file_name = uploadedPhoto.originalname;
    }

    const result = await internshipRegistrationService.verifyPaymentAndRegister(payload);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function registerWithoutPayment(req, res, next) {
  try {
    const payload = { ...(req.body || {}) };
    const uploadedPhoto = req.internshipPhoto || req.file;

    if (uploadedPhoto?.buffer) {
      const uploadResult = await uploadInternshipPassportPhoto({
        buffer: uploadedPhoto.buffer,
        mimeType: uploadedPhoto.mimetype,
        originalName: uploadedPhoto.originalname,
        email: payload.email,
        internshipName: payload.internship_name || payload.internshipName,
      });

      payload.passport_photo_path = uploadResult.s3Path;
      payload.passport_photo_mime_type = uploadedPhoto.mimetype;
      payload.passport_photo_file_name = uploadedPhoto.originalname;
    }

    const result = await internshipRegistrationService.registerWithoutPayment(payload);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getInternshipRegistrations(req, res, next) {
  try {
    const result = await internshipRegistrationService.getInternshipRegistrations({
      page: req.query.page,
      pageSize: req.query.pageSize,
      exportAll: req.query.exportAll,
      registrationType: req.query.registrationType,
      paymentStatus: req.query.paymentStatus,
      emailSearch: req.query.emailSearch,
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getInternshipFeeSettings(req, res, next) {
  try {
    const result = await internshipRegistrationService.getInternshipFeeSettings();
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function updateInternshipFeeSettings(req, res, next) {
  try {
    const result = await internshipRegistrationService.updateInternshipFeeSettings(req.body || {});
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function deleteInternshipRegistration(req, res, next) {
  try {
    const result = await internshipRegistrationService.deleteInternshipRegistration(req.params.id);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function transferInternshipRegistrationPaymentStatus(req, res, next) {
  try {
    const result = await internshipRegistrationService.transferInternshipRegistrationPaymentStatus(
      req.params.id,
      req.body || {}
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function updateInternshipRegistration(req, res, next) {
  try {
    const result = await internshipRegistrationService.updateInternshipRegistration(
      req.params.id,
      req.body || {}
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getInternshipPassportPhotoUrl(req, res, next) {
  try {
    const registrationId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(registrationId) || registrationId <= 0) {
      return res.status(400).json({ message: 'Invalid registration id.' });
    }

    const passportPhotoPath = await internshipRegistrationService.getInternshipPassportPhotoPath(
      registrationId
    );

    if (!passportPhotoPath) {
      return res.status(404).json({ message: 'Passport photo not found.' });
    }

    const url = await getPresignedObjectUrl({ s3Path: passportPhotoPath });

    return res.status(200).json({ url });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createPaymentOrder,
  verifyPaymentAndRegister,
  registerWithoutPayment,
  getInternshipRegistrations,
  getInternshipFeeSettings,
  updateInternshipFeeSettings,
  deleteInternshipRegistration,
  transferInternshipRegistrationPaymentStatus,
  updateInternshipRegistration,
  getInternshipPassportPhotoUrl,
};
