const FeaturedWorkshopSection = require('../models/FeaturedWorkshopSection');
const FeaturedWorkshopCard = require('../models/FeaturedWorkshopCard');
const {
  uploadFeaturedWorkshopBackground,
  deleteFeaturedWorkshopBackground,
  uploadFeaturedWorkshopCardImage,
  deleteFeaturedWorkshopCardImage,
} = require('./s3StorageService');

const MAX_CARDS = 6;

function parseId(rawId) {
  const parsed = Number.parseInt(String(rawId || ''), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

async function ensureTables() {
  await FeaturedWorkshopSection.ensureFeaturedWorkshopSectionTable();
  await FeaturedWorkshopCard.ensureFeaturedWorkshopCardsTable();
}

function attachSectionUrls(section) {
  return {
    ...section,
    background_url: section.background_path ? '/api/featured-workshop-section/background' : null,
  };
}

function attachCardUrl(card) {
  return {
    ...card,
    image_url: card.image_path ? `/api/featured-workshop-cards/${card.id}/image` : null,
  };
}

async function listPublicFeaturedWorkshopSection() {
  await ensureTables();

  const section = await FeaturedWorkshopSection.getLatestFeaturedWorkshopSection({ activeOnly: true });

  if (!section) {
    return {
      status: 200,
      body: { success: true, data: null },
    };
  }

  const cards = await FeaturedWorkshopCard.getFeaturedWorkshopCardsBySection(section.id, {
    activeOnly: true,
  });

  return {
    status: 200,
    body: {
      success: true,
      data: {
        ...attachSectionUrls(section),
        cards: cards.map(attachCardUrl),
      },
    },
  };
}

async function listAdminFeaturedWorkshopSection() {
  await ensureTables();

  const section = await FeaturedWorkshopSection.getLatestFeaturedWorkshopSection({ activeOnly: false });

  if (!section) {
    return {
      status: 200,
      body: { success: true, data: null },
    };
  }

  const cards = await FeaturedWorkshopCard.getFeaturedWorkshopCardsBySection(section.id, {
    activeOnly: false,
  });

  return {
    status: 200,
    body: {
      success: true,
      data: {
        ...attachSectionUrls(section),
        cards: cards.map(attachCardUrl),
      },
    },
  };
}

async function upsertAdminFeaturedWorkshopSection(payload, file) {
  await ensureTables();

  const existingSection = await FeaturedWorkshopSection.getLatestFeaturedWorkshopSection({
    activeOnly: false,
  });

  if (!existingSection) {
    const { payload: normalizedPayload, errors } =
      FeaturedWorkshopSection.normalizeFeaturedWorkshopSectionPayload(payload || {});

    if (errors.length > 0) {
      return {
        status: 400,
        body: { success: false, message: errors.join('. '), errors },
      };
    }

    if (!file || !Buffer.isBuffer(file.buffer)) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Background image is required to create the featured workshop section.',
        },
      };
    }

    const uploadResult = await uploadFeaturedWorkshopBackground({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
      sectionId: 'new',
    });

    normalizedPayload.background_path = uploadResult.s3Path;
    normalizedPayload.background_file_name = file.originalname || null;
    normalizedPayload.background_storage = 's3';

    const createdSection = await FeaturedWorkshopSection.createFeaturedWorkshopSection(
      normalizedPayload,
    );

    return {
      status: 201,
      body: {
        success: true,
        message: 'Featured workshop section created successfully',
        data: createdSection ? attachSectionUrls(createdSection) : null,
      },
    };
  }

  const { updates, errors } =
    FeaturedWorkshopSection.normalizeFeaturedWorkshopSectionUpdatePayload(payload || {}, {
      existingSection,
    });

  if (errors.length > 0) {
    return {
      status: 400,
      body: { success: false, message: errors.join('. '), errors },
    };
  }

  if (file && Buffer.isBuffer(file.buffer)) {
    const uploadResult = await uploadFeaturedWorkshopBackground({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
      sectionId: existingSection.id,
    });

    const previousPath = existingSection.background_path || null;

    updates.background_path = uploadResult.s3Path;
    updates.background_file_name = file.originalname || null;
    updates.background_storage = 's3';

    const updatedSection = await FeaturedWorkshopSection.updateFeaturedWorkshopSectionById(
      existingSection.id,
      updates,
    );

    if (previousPath) {
      deleteFeaturedWorkshopBackground({ s3Path: previousPath }).catch(() => {});
    }

    return {
      status: 200,
      body: {
        success: true,
        message: 'Featured workshop section updated successfully',
        data: updatedSection ? attachSectionUrls(updatedSection) : null,
      },
    };
  }

  if (Object.keys(updates).length === 0) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'No changes were provided for the featured workshop section.',
      },
    };
  }

  const updatedSection = await FeaturedWorkshopSection.updateFeaturedWorkshopSectionById(
    existingSection.id,
    updates,
  );

  return {
    status: 200,
    body: {
      success: true,
      message: 'Featured workshop section updated successfully',
      data: updatedSection ? attachSectionUrls(updatedSection) : null,
    },
  };
}

async function createAdminFeaturedWorkshopCard(payload, file) {
  await ensureTables();

  const section = await FeaturedWorkshopSection.getLatestFeaturedWorkshopSection({
    activeOnly: false,
  });

  if (!section) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Create the featured workshop section before adding cards.',
      },
    };
  }

  const cardCount = await FeaturedWorkshopCard.countFeaturedWorkshopCardsBySection(section.id);

  if (cardCount >= MAX_CARDS) {
    return {
      status: 400,
      body: {
        success: false,
        message: `A maximum of ${MAX_CARDS} cards is allowed.`,
      },
    };
  }

  const { payload: normalizedPayload, errors } =
    FeaturedWorkshopCard.normalizeFeaturedWorkshopCardPayload(payload || {});

  if (errors.length > 0) {
    return {
      status: 400,
      body: { success: false, message: errors.join('. '), errors },
    };
  }

  if (!file || !Buffer.isBuffer(file.buffer)) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Card image is required to create a featured workshop card.',
      },
    };
  }

  const uploadResult = await uploadFeaturedWorkshopCardImage({
    buffer: file.buffer,
    mimeType: file.mimetype,
    originalName: file.originalname,
    sectionId: section.id,
    position: normalizedPayload.position,
    cardId: 'new',
  });

  normalizedPayload.section_id = section.id;
  normalizedPayload.image_path = uploadResult.s3Path;
  normalizedPayload.image_file_name = file.originalname || null;
  normalizedPayload.image_storage = 's3';

  const createdCard = await FeaturedWorkshopCard.createFeaturedWorkshopCard(normalizedPayload);

  return {
    status: 201,
    body: {
      success: true,
      message: 'Featured workshop card created successfully',
      data: createdCard ? attachCardUrl(createdCard) : null,
    },
  };
}

async function updateAdminFeaturedWorkshopCard(rawId, payload, file) {
  await ensureTables();

  const id = parseId(rawId);

  if (!id) {
    return {
      status: 400,
      body: { success: false, message: 'Invalid featured workshop card id' },
    };
  }

  const existingCard = await FeaturedWorkshopCard.getFeaturedWorkshopCardById(id);

  if (!existingCard) {
    return {
      status: 404,
      body: { success: false, message: 'Featured workshop card not found' },
    };
  }

  const { updates, errors } =
    FeaturedWorkshopCard.normalizeFeaturedWorkshopCardUpdatePayload(payload || {}, {
      existingCard,
    });

  if (errors.length > 0) {
    return {
      status: 400,
      body: { success: false, message: errors.join('. '), errors },
    };
  }

  if (file && Buffer.isBuffer(file.buffer)) {
    const uploadResult = await uploadFeaturedWorkshopCardImage({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
      sectionId: existingCard.section_id,
      position: updates.position || existingCard.position,
      cardId: id,
    });

    const previousPath = existingCard.image_path || null;

    updates.image_path = uploadResult.s3Path;
    updates.image_file_name = file.originalname || null;
    updates.image_storage = 's3';

    const updatedCard = await FeaturedWorkshopCard.updateFeaturedWorkshopCardById(id, updates);

    if (previousPath) {
      deleteFeaturedWorkshopCardImage({ s3Path: previousPath }).catch(() => {});
    }

    return {
      status: 200,
      body: {
        success: true,
        message: 'Featured workshop card updated successfully',
        data: updatedCard ? attachCardUrl(updatedCard) : null,
      },
    };
  }

  if (Object.keys(updates).length === 0) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'No changes were provided for the featured workshop card.',
      },
    };
  }

  const updatedCard = await FeaturedWorkshopCard.updateFeaturedWorkshopCardById(id, updates);

  return {
    status: 200,
    body: {
      success: true,
      message: 'Featured workshop card updated successfully',
      data: updatedCard ? attachCardUrl(updatedCard) : null,
    },
  };
}

async function deleteAdminFeaturedWorkshopCard(rawId) {
  await ensureTables();

  const id = parseId(rawId);

  if (!id) {
    return {
      status: 400,
      body: { success: false, message: 'Invalid featured workshop card id' },
    };
  }

  const existingCard = await FeaturedWorkshopCard.getFeaturedWorkshopCardById(id);

  if (!existingCard) {
    return {
      status: 404,
      body: { success: false, message: 'Featured workshop card not found' },
    };
  }

  const deleted = await FeaturedWorkshopCard.deleteFeaturedWorkshopCardById(id);

  if (!deleted) {
    return {
      status: 404,
      body: { success: false, message: 'Featured workshop card not found' },
    };
  }

  if (existingCard.image_path) {
    deleteFeaturedWorkshopCardImage({ s3Path: existingCard.image_path }).catch(() => {});
  }

  return {
    status: 200,
    body: {
      success: true,
      message: 'Featured workshop card deleted successfully',
    },
  };
}

async function fetchFeaturedWorkshopBackground(options = {}) {
  await ensureTables();

  const activeOnly = Boolean(options.activeOnly);
  const section = await FeaturedWorkshopSection.getLatestFeaturedWorkshopSection({ activeOnly });

  if (!section || !section.background_path) {
    return {
      status: 404,
      body: { success: false, message: 'Featured workshop background not found' },
      media: null,
    };
  }

  return {
    status: 200,
    body: { success: true },
    media: section,
  };
}

async function fetchFeaturedWorkshopCardImage(rawId, options = {}) {
  await ensureTables();

  const activeOnly = Boolean(options.activeOnly);
  const id = parseId(rawId);

  if (!id) {
    return {
      status: 400,
      body: { success: false, message: 'Invalid featured workshop card id' },
      card: null,
    };
  }

  const card = await FeaturedWorkshopCard.getFeaturedWorkshopCardById(id);

  if (!card || (activeOnly && !card.is_active) || !card.image_path) {
    return {
      status: 404,
      body: { success: false, message: 'Featured workshop card image not found' },
      card: null,
    };
  }

  return {
    status: 200,
    body: { success: true },
    card,
  };
}

module.exports = {
  listPublicFeaturedWorkshopSection,
  listAdminFeaturedWorkshopSection,
  upsertAdminFeaturedWorkshopSection,
  createAdminFeaturedWorkshopCard,
  updateAdminFeaturedWorkshopCard,
  deleteAdminFeaturedWorkshopCard,
  fetchFeaturedWorkshopBackground,
  fetchFeaturedWorkshopCardImage,
};
