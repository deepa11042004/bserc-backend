const featuredWorkshopSectionService = require('../services/featuredWorkshopSectionService');
const {
  streamFeaturedWorkshopBackground,
  streamFeaturedWorkshopCardImage,
} = require('../services/s3StorageService');

async function getPublicFeaturedWorkshopSection(req, res, next) {
  try {
    const result = await featuredWorkshopSectionService.listPublicFeaturedWorkshopSection();
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getAdminFeaturedWorkshopSection(req, res, next) {
  try {
    const result = await featuredWorkshopSectionService.listAdminFeaturedWorkshopSection();
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function updateAdminFeaturedWorkshopSection(req, res, next) {
  try {
    const result = await featuredWorkshopSectionService.upsertAdminFeaturedWorkshopSection(
      req.body || {},
      req.file || null,
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function createAdminFeaturedWorkshopCard(req, res, next) {
  try {
    const result = await featuredWorkshopSectionService.createAdminFeaturedWorkshopCard(
      req.body || {},
      req.file || null,
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function updateAdminFeaturedWorkshopCard(req, res, next) {
  try {
    const result = await featuredWorkshopSectionService.updateAdminFeaturedWorkshopCard(
      req.params.id,
      req.body || {},
      req.file || null,
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function deleteAdminFeaturedWorkshopCard(req, res, next) {
  try {
    const result = await featuredWorkshopSectionService.deleteAdminFeaturedWorkshopCard(
      req.params.id,
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function getFeaturedWorkshopBackground(req, res, next) {
  try {
    const result = await featuredWorkshopSectionService.fetchFeaturedWorkshopBackground({
      activeOnly: true,
    });

    if (!result.media) {
      return res.status(result.status).json(result.body);
    }

    const { background_path: backgroundPath } = result.media;
    const { buffer, contentType } = await streamFeaturedWorkshopBackground({
      s3Path: backgroundPath,
    });

    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.setHeader('X-Media-Source', 's3');

    return res.status(200).send(buffer);
  } catch (err) {
    return next(err);
  }
}

async function getFeaturedWorkshopCardImage(req, res, next) {
  try {
    const result = await featuredWorkshopSectionService.fetchFeaturedWorkshopCardImage(
      req.params.id,
      { activeOnly: true },
    );

    if (!result.card) {
      return res.status(result.status).json(result.body);
    }

    const { image_path: imagePath } = result.card;
    const { buffer, contentType } = await streamFeaturedWorkshopCardImage({
      s3Path: imagePath,
    });

    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.setHeader('X-Media-Source', 's3');

    return res.status(200).send(buffer);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getPublicFeaturedWorkshopSection,
  getAdminFeaturedWorkshopSection,
  updateAdminFeaturedWorkshopSection,
  createAdminFeaturedWorkshopCard,
  updateAdminFeaturedWorkshopCard,
  deleteAdminFeaturedWorkshopCard,
  getFeaturedWorkshopBackground,
  getFeaturedWorkshopCardImage,
};
