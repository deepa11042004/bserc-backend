const express = require('express');

const apprenticeshipController = require('../controllers/apprenticeshipController');
const authAdmin = require('../middleware/authAdmin');
const { uploadApprenticeshipFiles } = require('../middleware/apprenticeshipUpload');

const router = express.Router();

/**
 * @openapi
 * /api/apprenticeship/apply:
 *   post:
 *     tags: [Apprenticeship]
 *     summary: Submit a new apprenticeship application
 */
router.post('/apprenticeship/apply', uploadApprenticeshipFiles, apprenticeshipController.createApprenticeshipApplication);

/**
 * @openapi
 * /api/apprenticeship/requests:
 *   get:
 *     tags: [Apprenticeship]
 *     summary: Get all pending apprenticeship applications
 */
router.get('/apprenticeship/requests', authAdmin, apprenticeshipController.getPendingApprenticeships);

/**
 * @openapi
 * /api/apprenticeship/list:
 *   get:
 *     tags: [Apprenticeship]
 *     summary: Get all active apprenticeship applications
 */
router.get('/apprenticeship/list', authAdmin, apprenticeshipController.getActiveApprenticeships);

/**
 * @openapi
 * /api/apprenticeship/rejected:
 *   get:
 *     tags: [Apprenticeship]
 *     summary: Get all rejected apprenticeship applications
 */
router.get('/apprenticeship/rejected', authAdmin, apprenticeshipController.getRejectedApprenticeships);

/**
 * @openapi
 * /api/apprenticeship/{id}/approve:
 *   patch:
 *     tags: [Apprenticeship]
 *     summary: Approve a pending apprenticeship application
 */
router.patch('/apprenticeship/:id/approve', authAdmin, apprenticeshipController.approveApprenticeship);

/**
 * @openapi
 * /api/apprenticeship/{id}/reject:
 *   patch:
 *     tags: [Apprenticeship]
 *     summary: Reject an apprenticeship application
 */
router.patch('/apprenticeship/:id/reject', authAdmin, apprenticeshipController.rejectApprenticeship);

/**
 * @openapi
 * /api/apprenticeship/{id}/document/{field}:
 *   get:
 *     tags: [Apprenticeship]
 *     summary: Download an apprenticeship application's uploaded document
 */
router.get('/apprenticeship/:id/document/:field', authAdmin, apprenticeshipController.downloadApprenticeshipDocument);

module.exports = router;
