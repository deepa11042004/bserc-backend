const announcementBannerService = require('../services/announcementBannerService');

async function createAdminAnnouncementBanner(req, res, next) {
  try {
    const result = await announcementBannerService.createAdminAnnouncementBanner(req.body || {});
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function updateAdminAnnouncementBanner(req, res, next) {
  try {
    const result = await announcementBannerService.updateAdminAnnouncementBanner(
      req.params.id,
      req.body || {},
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getPublicAnnouncementBanners(req, res, next) {
  try {
    const result = await announcementBannerService.listPublicAnnouncementBanners({
      section: req.query.section,
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getAdminAnnouncementBanners(req, res, next) {
  try {
    const result = await announcementBannerService.listAdminAnnouncementBanners({
      section: req.query.section,
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function deleteAdminAnnouncementBanner(req, res, next) {
  try {
    const result = await announcementBannerService.deleteAdminAnnouncementBanner(req.params.id);
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createAdminAnnouncementBanner,
  updateAdminAnnouncementBanner,
  getPublicAnnouncementBanners,
  getAdminAnnouncementBanners,
  deleteAdminAnnouncementBanner,
};
