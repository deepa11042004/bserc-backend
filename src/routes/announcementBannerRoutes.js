const express = require('express');
const authAdmin = require('../middleware/authAdmin');
const announcementBannerController = require('../controllers/announcementBannerController');

const router = express.Router();

/**
 * @openapi
 * /api/admin/announcement-banners:
 *   post:
 *     tags: [Announcement Banners]
 *     summary: Create an announcement banner (admin)
 *   get:
 *     tags: [Announcement Banners]
 *     summary: List announcement banners for admin management
 * /api/admin/announcement-banners/{id}:
 *   put:
 *     tags: [Announcement Banners]
 *     summary: Update an announcement banner (admin)
 *   delete:
 *     tags: [Announcement Banners]
 *     summary: Delete an announcement banner (admin)
 * /api/announcement-banners:
 *   get:
 *     tags: [Announcement Banners]
 *     summary: List active announcement banners (public)
 */
router.post('/admin/announcement-banners', authAdmin, announcementBannerController.createAdminAnnouncementBanner);
router.get('/admin/announcement-banners', authAdmin, announcementBannerController.getAdminAnnouncementBanners);
router.put('/admin/announcement-banners/:id', authAdmin, announcementBannerController.updateAdminAnnouncementBanner);
router.delete('/admin/announcement-banners/:id', authAdmin, announcementBannerController.deleteAdminAnnouncementBanner);

router.get('/announcement-banners', announcementBannerController.getPublicAnnouncementBanners);

module.exports = router;
