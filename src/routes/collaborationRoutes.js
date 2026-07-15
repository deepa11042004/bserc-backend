const express = require('express');

const collaborationController = require('../controllers/collaborationController');
const authAdmin = require('../middleware/authAdmin');
const { uploadCollaborationSupportingDocument } = require('../middleware/collaborationDocumentUpload');

const router = express.Router();

/**
 * @openapi
 * /api/collaboration:
 *   post:
 *     tags: [Collaboration Requests]
 *     summary: Submit a joint collaboration proposal form
 */
router.post('/collaboration', uploadCollaborationSupportingDocument, collaborationController.createCollaborationRequest);

router.get('/collaboration/requests', authAdmin, collaborationController.getPendingCollaborationRequests);
router.get('/collaboration/list', authAdmin, collaborationController.getActiveCollaborationRequests);
router.get('/collaboration/rejected', authAdmin, collaborationController.getRejectedCollaborationRequests);
router.patch('/collaboration/:id/approve', authAdmin, collaborationController.approveCollaborationRequest);
router.patch('/collaboration/:id/reject', authAdmin, collaborationController.rejectCollaborationRequest);
router.get('/collaboration/:id/document', authAdmin, collaborationController.downloadCollaborationRequestDocument);

module.exports = router;
