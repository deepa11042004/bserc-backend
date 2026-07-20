const speakerService = require('../services/speakerService');

async function createSpeakerApplication(req, res, next) {
  try {
    const result = await speakerService.submitSpeakerApplication(req.body || {}, req.files || {});
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getPendingSpeakers(req, res, next) {
  try {
    const result = await speakerService.listSpeakerApplicationsByStatus('pending');
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getActiveSpeakers(req, res, next) {
  try {
    const result = await speakerService.listSpeakerApplicationsByStatus('active');
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getRejectedSpeakers(req, res, next) {
  try {
    const result = await speakerService.listSpeakerApplicationsByStatus('rejected');
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function approveSpeaker(req, res, next) {
  try {
    const result = await speakerService.approveSpeakerApplication(req.params.id);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function rejectSpeaker(req, res, next) {
  try {
    const result = await speakerService.rejectSpeakerApplication(req.params.id);
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

async function downloadSpeakerDocument(req, res, next) {
  try {
    const result = await speakerService.fetchSpeakerDocument(req.params.id, req.params.field);

    if (!result.document) {
      return res.status(result.status).json(result.body);
    }

    const fileName = toSafeFileName(
      result.document.fileName,
      `speaker-${req.params.id}-${req.params.field}.bin`,
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
  createSpeakerApplication,
  getPendingSpeakers,
  getActiveSpeakers,
  getRejectedSpeakers,
  approveSpeaker,
  rejectSpeaker,
  downloadSpeakerDocument,
};
