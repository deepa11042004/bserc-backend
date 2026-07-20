const express = require('express');

const speakerController = require('../controllers/speakerController');
const authAdmin = require('../middleware/authAdmin');
const { uploadSpeakerFiles } = require('../middleware/speakerUpload');

const router = express.Router();

/**
 * @openapi
 * /api/speaker/apply:
 *   post:
 *     tags: [Speaker]
 *     summary: Submit a new speaker application / proposal
 */
router.post('/speaker/apply', uploadSpeakerFiles, speakerController.createSpeakerApplication);

/**
 * @openapi
 * /api/speaker/requests:
 *   get:
 *     tags: [Speaker]
 *     summary: Get all pending speaker applications
 */
router.get('/speaker/requests', authAdmin, speakerController.getPendingSpeakers);

/**
 * @openapi
 * /api/speaker/list:
 *   get:
 *     tags: [Speaker]
 *     summary: Get all active speaker applications
 */
router.get('/speaker/list', authAdmin, speakerController.getActiveSpeakers);

/**
 * @openapi
 * /api/speaker/rejected:
 *   get:
 *     tags: [Speaker]
 *     summary: Get all rejected speaker applications
 */
router.get('/speaker/rejected', authAdmin, speakerController.getRejectedSpeakers);

/**
 * @openapi
 * /api/speaker/{id}/approve:
 *   patch:
 *     tags: [Speaker]
 *     summary: Approve a pending speaker application
 */
router.patch('/speaker/:id/approve', authAdmin, speakerController.approveSpeaker);

/**
 * @openapi
 * /api/speaker/{id}/reject:
 *   patch:
 *     tags: [Speaker]
 *     summary: Reject a speaker application
 */
router.patch('/speaker/:id/reject', authAdmin, speakerController.rejectSpeaker);

/**
 * @openapi
 * /api/speaker/{id}/document/{field}:
 *   get:
 *     tags: [Speaker]
 *     summary: Download a speaker application's uploaded document
 */
router.get('/speaker/:id/document/:field', authAdmin, speakerController.downloadSpeakerDocument);

module.exports = router;
