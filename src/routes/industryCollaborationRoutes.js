const express = require('express');

const industryCollaborationController = require('../controllers/industryCollaborationController');
const authAdmin = require('../middleware/authAdmin');

const router = express.Router();

/**
 * @openapi
 * /api/industry-collaboration/apply:
 *   post:
 *     tags: [IndustryCollaboration]
 *     summary: Submit a new industry/organisation collaboration, certification & sponsorship expression of interest
 */
router.post('/industry-collaboration/apply', industryCollaborationController.createIndustryCollaboration);

/**
 * @openapi
 * /api/industry-collaboration/requests:
 *   get:
 *     tags: [IndustryCollaboration]
 *     summary: Get all pending industry collaboration submissions
 */
router.get('/industry-collaboration/requests', authAdmin, industryCollaborationController.getPendingIndustryCollaborations);

/**
 * @openapi
 * /api/industry-collaboration/list:
 *   get:
 *     tags: [IndustryCollaboration]
 *     summary: Get all active industry collaboration submissions
 */
router.get('/industry-collaboration/list', authAdmin, industryCollaborationController.getActiveIndustryCollaborations);

/**
 * @openapi
 * /api/industry-collaboration/rejected:
 *   get:
 *     tags: [IndustryCollaboration]
 *     summary: Get all rejected industry collaboration submissions
 */
router.get('/industry-collaboration/rejected', authAdmin, industryCollaborationController.getRejectedIndustryCollaborations);

/**
 * @openapi
 * /api/industry-collaboration/{id}/approve:
 *   patch:
 *     tags: [IndustryCollaboration]
 *     summary: Approve a pending industry collaboration submission
 */
router.patch('/industry-collaboration/:id/approve', authAdmin, industryCollaborationController.approveIndustryCollaboration);

/**
 * @openapi
 * /api/industry-collaboration/{id}/reject:
 *   patch:
 *     tags: [IndustryCollaboration]
 *     summary: Reject an industry collaboration submission
 */
router.patch('/industry-collaboration/:id/reject', authAdmin, industryCollaborationController.rejectIndustryCollaboration);

module.exports = router;
