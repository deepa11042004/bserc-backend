const industryCollaborationService = require('../services/industryCollaborationService');

async function createIndustryCollaboration(req, res, next) {
  try {
    const result = await industryCollaborationService.submitIndustryCollaboration(req.body || {});
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getPendingIndustryCollaborations(req, res, next) {
  try {
    const result = await industryCollaborationService.listIndustryCollaborationsByStatus('pending');
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getActiveIndustryCollaborations(req, res, next) {
  try {
    const result = await industryCollaborationService.listIndustryCollaborationsByStatus('active');
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getRejectedIndustryCollaborations(req, res, next) {
  try {
    const result = await industryCollaborationService.listIndustryCollaborationsByStatus('rejected');
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function approveIndustryCollaboration(req, res, next) {
  try {
    const result = await industryCollaborationService.approveIndustryCollaboration(req.params.id);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function rejectIndustryCollaboration(req, res, next) {
  try {
    const result = await industryCollaborationService.rejectIndustryCollaboration(req.params.id);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createIndustryCollaboration,
  getPendingIndustryCollaborations,
  getActiveIndustryCollaborations,
  getRejectedIndustryCollaborations,
  approveIndustryCollaboration,
  rejectIndustryCollaboration,
};
