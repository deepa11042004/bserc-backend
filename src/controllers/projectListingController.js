const projectListingService = require('../services/projectListingService');

async function submitProjectListing(req, res, next) {
  try {
    const payload = { ...(req.body || {}) };
    const uploadedDoc = req.projectListingDocument || null;

    const result = await projectListingService.submitProjectListing(payload, uploadedDoc);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getProjectListings(req, res, next) {
  try {
    const result = await projectListingService.getProjectListings({
      page: req.query.page,
      pageSize: req.query.pageSize,
      emailSearch: req.query.emailSearch,
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getProjectListing(req, res, next) {
  try {
    const result = await projectListingService.getProjectListing(req.params.id);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function deleteProjectListing(req, res, next) {
  try {
    const result = await projectListingService.deleteProjectListing(req.params.id);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getProjectListingSupportingDocUrl(req, res, next) {
  try {
    const id = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid project listing id.' });
    }

    const url = await projectListingService.getProjectListingSupportingDocUrl(id);

    if (!url) {
      return res.status(404).json({ message: 'Supporting document not found.' });
    }

    return res.status(200).json({ url });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  submitProjectListing,
  getProjectListings,
  getProjectListing,
  deleteProjectListing,
  getProjectListingSupportingDocUrl,
};
