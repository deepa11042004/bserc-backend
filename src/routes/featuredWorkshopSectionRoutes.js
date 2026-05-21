const express = require('express');

const featuredWorkshopSectionController = require('../controllers/featuredWorkshopSectionController');
const authAdmin = require('../middleware/authAdmin');
const {
  uploadFeaturedWorkshopBackground,
  uploadFeaturedWorkshopCardImage,
} = require('../middleware/featuredWorkshopUpload');

const router = express.Router();

/**
 * @openapi
 * /api/admin/featured-workshop-section:
 *   get:
 *     tags: [Featured Workshop Section]
 *     summary: Fetch featured workshop section (admin)
 *   put:
 *     tags: [Featured Workshop Section]
 *     summary: Update featured workshop section (admin)
 * /api/featured-workshop-section:
 *   get:
 *     tags: [Featured Workshop Section]
 *     summary: Fetch featured workshop section (public)
 */
router.get(
  '/admin/featured-workshop-section',
  authAdmin,
  featuredWorkshopSectionController.getAdminFeaturedWorkshopSection,
);
router.put(
  '/admin/featured-workshop-section',
  authAdmin,
  uploadFeaturedWorkshopBackground,
  featuredWorkshopSectionController.updateAdminFeaturedWorkshopSection,
);

router.get(
  '/featured-workshop-section',
  featuredWorkshopSectionController.getPublicFeaturedWorkshopSection,
);
router.get(
  '/featured-workshop-section/background',
  featuredWorkshopSectionController.getFeaturedWorkshopBackground,
);

/**
 * @openapi
 * /api/admin/featured-workshop-cards:
 *   post:
 *     tags: [Featured Workshop Cards]
 *     summary: Create featured workshop card (admin)
 */
router.post(
  '/admin/featured-workshop-cards',
  authAdmin,
  uploadFeaturedWorkshopCardImage,
  featuredWorkshopSectionController.createAdminFeaturedWorkshopCard,
);

router.put(
  '/admin/featured-workshop-cards/:id',
  authAdmin,
  uploadFeaturedWorkshopCardImage,
  featuredWorkshopSectionController.updateAdminFeaturedWorkshopCard,
);

router.delete(
  '/admin/featured-workshop-cards/:id',
  authAdmin,
  featuredWorkshopSectionController.deleteAdminFeaturedWorkshopCard,
);

router.get(
  '/featured-workshop-cards/:id/image',
  featuredWorkshopSectionController.getFeaturedWorkshopCardImage,
);

module.exports = router;
