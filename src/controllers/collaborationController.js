const collaborationService = require('../services/collaborationService');

async function createCollaborationRequest(req, res, next) {
  try {
    const result = await collaborationService.submitCollaborationRequest(req.body || {}, req.file || null);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getPendingCollaborationRequests(req, res, next) {
  try {
    const result = await collaborationService.listCollaborationRequestsByStatus('pending');
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getActiveCollaborationRequests(req, res, next) {
  try {
    const result = await collaborationService.listCollaborationRequestsByStatus('active');
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getRejectedCollaborationRequests(req, res, next) {
  try {
    const result = await collaborationService.listCollaborationRequestsByStatus('rejected');
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function approveCollaborationRequest(req, res, next) {
  try {
    const result = await collaborationService.approveCollaborationRequest(req.params.id);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function rejectCollaborationRequest(req, res, next) {
  try {
    const result = await collaborationService.rejectCollaborationRequest(req.params.id);
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

async function downloadCollaborationRequestDocument(req, res, next) {
  try {
    const result = await collaborationService.fetchCollaborationRequestDocument(req.params.id);

    if (!result.document) {
      return res.status(result.status).json(result.body);
    }

    const fileName = toSafeFileName(
      result.document.supporting_document_name,
      `collaboration-request-${req.params.id}.bin`,
    );

    const contentType = result.document.supporting_document_mime || 'application/octet-stream';
    const contentLength = Number.isFinite(result.document.supporting_document_size)
      && result.document.supporting_document_size > 0
      ? result.document.supporting_document_size
      : result.document.document_buffer.length;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(contentLength));

    return res.status(200).send(result.document.document_buffer);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createCollaborationRequest,
  getPendingCollaborationRequests,
  getActiveCollaborationRequests,
  getRejectedCollaborationRequests,
  approveCollaborationRequest,
  rejectCollaborationRequest,
  downloadCollaborationRequestDocument,
};
