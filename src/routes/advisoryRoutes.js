const express = require('express');

const advisoryRegistrationController = require('../controllers/advisoryRegistrationController');

const router = express.Router();

/**
 * @openapi
 * /api/advisory/register:
 *   post:
 *     tags: [Advisory]
 *     summary: Submit a new advisory board application
 */
router.post('/advisory/register', advisoryRegistrationController.registerAdvisory);
/**
 * @openapi
 * /api/advisory/requests:
 *   get:
 *     tags: [Advisory]
 *     summary: Get all pending advisory applications
 */
router.get('/advisory/requests', advisoryRegistrationController.getPendingAdvisory);
router.get('/advisory/requests-admin-list', advisoryRegistrationController.getPendingAdvisoryAdminList);
/**
 * @openapi
 * /api/advisory/list:
 *   get:
 *     tags: [Advisory]
 *     summary: Get all active advisory members
 */
router.get('/advisory/list', advisoryRegistrationController.getActiveAdvisory);
router.get('/advisory/admin-list', advisoryRegistrationController.getActiveAdvisoryAdminList);
/**
 * @openapi
 * /api/advisory/{id}/approve:
 *   patch:
 *     tags: [Advisory]
 *     summary: Approve a pending advisory application
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Advisory application ID
 */
router.patch('/advisory/:id/approve', advisoryRegistrationController.approveAdvisory);
/**
 * @openapi
 * /api/advisory/{id}/pending:
 *   patch:
 *     tags: [Advisory]
 *     summary: Move an active advisory member back to pending
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Advisory application ID
 */
router.patch('/advisory/:id/pending', advisoryRegistrationController.moveAdvisoryToPending);
/**
 * @openapi
 * /api/advisory/{id}/reject:
 *   delete:
 *     tags: [Advisory]
 *     summary: Reject (delete) an advisory application
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Advisory application ID
 */
router.delete('/advisory/:id/reject', advisoryRegistrationController.rejectAdvisory);
module.exports = router;
