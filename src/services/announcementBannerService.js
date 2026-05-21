const AnnouncementBanner = require('../models/AnnouncementBanner');

function parseAnnouncementBannerId(rawId) {
  const parsed = Number.parseInt(String(rawId || ''), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseAnnouncementBannerSection(rawSection) {
  if (rawSection === undefined || rawSection === null || rawSection === '') {
    return { section: null, error: null };
  }

  const section = AnnouncementBanner.normalizeAnnouncementBannerSection(rawSection);

  if (!section) {
    return { section: null, error: 'Invalid announcement banner section.' };
  }

  return { section, error: null };
}

async function createAdminAnnouncementBanner(payload) {
  await AnnouncementBanner.ensureAnnouncementBannersTable();

  const {
    payload: normalizedPayload,
    errors,
  } = AnnouncementBanner.normalizeAnnouncementBannerPayload(payload || {});

  if (errors.length > 0) {
    return {
      status: 400,
      body: {
        success: false,
        message: errors.join('. '),
        errors,
      },
    };
  }

  const createdBanner = await AnnouncementBanner.createAnnouncementBanner(normalizedPayload);

  return {
    status: 201,
    body: {
      success: true,
      message: 'Announcement banner created successfully',
      data: createdBanner,
    },
  };
}

async function updateAdminAnnouncementBanner(rawId, payload) {
  await AnnouncementBanner.ensureAnnouncementBannersTable();

  const id = parseAnnouncementBannerId(rawId);

  if (!id) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Invalid announcement banner id',
      },
    };
  }

  const existingItem = await AnnouncementBanner.getAnnouncementBannerById(id);

  if (!existingItem) {
    return {
      status: 404,
      body: {
        success: false,
        message: 'Announcement banner not found',
      },
    };
  }

  const { updates, errors } = AnnouncementBanner.normalizeAnnouncementBannerUpdatePayload(
    payload || {},
    { existingItem },
  );

  if (errors.length > 0) {
    return {
      status: 400,
      body: {
        success: false,
        message: errors.join('. '),
        errors,
      },
    };
  }

  if (Object.keys(updates).length === 0) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'No changes were provided for announcement banner update.',
      },
    };
  }

  const updatedItem = await AnnouncementBanner.updateAnnouncementBannerById(id, updates);

  if (!updatedItem) {
    return {
      status: 404,
      body: {
        success: false,
        message: 'Announcement banner not found',
      },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      message: 'Announcement banner updated successfully',
      data: updatedItem,
    },
  };
}

async function listPublicAnnouncementBanners(options = {}) {
  await AnnouncementBanner.ensureAnnouncementBannersTable();

  const { section, error } = parseAnnouncementBannerSection(options.section);

  if (error) {
    return {
      status: 400,
      body: {
        success: false,
        message: error,
      },
    };
  }

  const items = await AnnouncementBanner.getAnnouncementBannersList({
    activeOnly: true,
    section,
  });

  return {
    status: 200,
    body: {
      success: true,
      data: items,
    },
  };
}

async function listAdminAnnouncementBanners(options = {}) {
  await AnnouncementBanner.ensureAnnouncementBannersTable();

  const { section, error } = parseAnnouncementBannerSection(options.section);

  if (error) {
    return {
      status: 400,
      body: {
        success: false,
        message: error,
      },
    };
  }

  const items = await AnnouncementBanner.getAnnouncementBannersList({
    activeOnly: false,
    section,
  });

  return {
    status: 200,
    body: {
      success: true,
      data: items,
    },
  };
}

async function deleteAdminAnnouncementBanner(rawId) {
  await AnnouncementBanner.ensureAnnouncementBannersTable();

  const id = parseAnnouncementBannerId(rawId);

  if (!id) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Invalid announcement banner id',
      },
    };
  }

  const wasDeleted = await AnnouncementBanner.deleteAnnouncementBannerById(id);

  if (!wasDeleted) {
    return {
      status: 404,
      body: {
        success: false,
        message: 'Announcement banner not found',
      },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      message: 'Announcement banner deleted successfully',
    },
  };
}

module.exports = {
  createAdminAnnouncementBanner,
  updateAdminAnnouncementBanner,
  listPublicAnnouncementBanners,
  listAdminAnnouncementBanners,
  deleteAdminAnnouncementBanner,
};
