const apprenticeshipService = require('../services/apprenticeshipService');

async function createApprenticeshipApplication(req, res, next) {
  try {
    const result = await apprenticeshipService.submitApprenticeshipApplication(req.body || {}, req.files || {});
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getPendingApprenticeships(req, res, next) {
  try {
    const result = await apprenticeshipService.listApprenticeshipsByStatus('pending');
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getActiveApprenticeships(req, res, next) {
  try {
    const result = await apprenticeshipService.listApprenticeshipsByStatus('active');
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getRejectedApprenticeships(req, res, next) {
  try {
    const result = await apprenticeshipService.listApprenticeshipsByStatus('rejected');
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function approveApprenticeship(req, res, next) {
  try {
    const result = await apprenticeshipService.approveApprenticeshipApplication(req.params.id);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function rejectApprenticeship(req, res, next) {
  try {
    const result = await apprenticeshipService.rejectApprenticeshipApplication(req.params.id);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

function toSafeFileName(value, fallback) {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input) {
    return fallback;
  }

  return input.replace(/[\r\n"]/g, '_');
}

async function downloadApprenticeshipDocument(req, res, next) {
  try {
    const result = await apprenticeshipService.fetchApprenticeshipDocument(req.params.id, req.params.field);

    if (!result.document) {
      return res.status(result.status).json(result.body);
    }

    const fileName = toSafeFileName(
      result.document.fileName,
      `apprenticeship-${req.params.id}-${req.params.field}.bin`,
    );

    res.setHeader('Content-Type', result.document.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(result.document.buffer.length));

    return res.status(200).send(result.document.buffer);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createApprenticeshipApplication,
  getPendingApprenticeships,
  getActiveApprenticeships,
  getRejectedApprenticeships,
  approveApprenticeship,
  rejectApprenticeship,
  downloadApprenticeshipDocument,
};
