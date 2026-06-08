const express = require('express');

const projectListingController = require('../controllers/projectListingController');
const authAdmin = require('../middleware/authAdmin');
const { uploadProjectListingDocument } = require('../middleware/projectListingUpload');

const router = express.Router();

/**
 * @openapi
 * /api/project-listing/submit:
 *   post:
 *     tags: [Project Listings]
 *     summary: Submit a new project listing form
 */
router.post(
  '/project-listing/submit',
  uploadProjectListingDocument,
  projectListingController.submitProjectListing
);

/**
 * @openapi
 * /api/project-listing/list:
 *   get:
 *     tags: [Project Listings]
 *     summary: Get paginated project listings (admin)
 */
router.get(
  '/project-listing/list',
  authAdmin,
  projectListingController.getProjectListings
);

/**
 * @openapi
 * /api/project-listing/{id}:
 *   get:
 *     tags: [Project Listings]
 *     summary: Get a single project listing by ID (admin)
 */
router.get(
  '/project-listing/:id',
  authAdmin,
  projectListingController.getProjectListing
);

/**
 * @openapi
 * /api/project-listing/{id}/document-url:
 *   get:
 *     tags: [Project Listings]
 *     summary: Get presigned URL for supporting document (admin)
 */
router.get(
  '/project-listing/:id/document-url',
  authAdmin,
  projectListingController.getProjectListingSupportingDocUrl
);

/**
 * @openapi
 * /api/project-listing/{id}:
 *   delete:
 *     tags: [Project Listings]
 *     summary: Delete a project listing (admin)
 */
router.delete(
  '/project-listing/:id',
  authAdmin,
  projectListingController.deleteProjectListing
);

module.exports = router;
