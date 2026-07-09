const institutionalRegistrationService = require('../services/institutionalRegistrationService');

async function createInstitutionalPaymentOrder(req, res, next) {
  try {
    const result = await institutionalRegistrationService.createPaymentOrder(req.body || {});
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function verifyInstitutionalPaymentAndRegister(req, res, next) {
  try {
    const result = await institutionalRegistrationService.verifyPaymentAndRegister(req.body || {});
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function logInstitutionalPaymentAttempt(req, res, next) {
  try {
    const result = await institutionalRegistrationService.logPaymentAttempt(req.body || {});
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function deleteInstitutionalRegistration(req, res, next) {
  try {
    const result = await institutionalRegistrationService.deleteInstitutionalRegistration(
      req.params.id,
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function createInstitutionalRegistration(req, res, next) {
  try {
    const result = await institutionalRegistrationService.registerInstitution(req.body || {});
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getInstitutionalRegistrations(req, res, next) {
  try {
    const result = await institutionalRegistrationService.listInstitutionalRegistrations({
      page: req.query.page,
      pageSize: req.query.pageSize,
      exportAll: req.query.exportAll,
      paymentStatus: req.query.paymentStatus,
      search: req.query.search,
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createInstitutionalPaymentOrder,
  verifyInstitutionalPaymentAndRegister,
  logInstitutionalPaymentAttempt,
  deleteInstitutionalRegistration,
  createInstitutionalRegistration,
  getInstitutionalRegistrations,
};
