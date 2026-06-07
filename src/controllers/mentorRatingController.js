const ratingService = require('../services/mentorRatingService');

function parseIntegerId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseRating(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 2 && parsed <= 5 ? parsed : null;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function submitRating(req, res) {
  try {
    const { mentorId } = req.params;
    const { rating, review, userId, userName, userEmail } = req.body;

    const parsedMentorId = parseIntegerId(mentorId);
    if (!parsedMentorId) {
      return res.status(400).json({ error: 'Invalid mentor ID' });
    }

    const parsedRating = parseRating(rating);
    if (parsedRating === null) {
      return res.status(400).json({ error: 'Rating must be an integer between 2 and 5' });
    }

    if (parsedRating < 2) {
      return res.status(400).json({ error: 'Rating must be at least 2 stars' });
    }

    const cleanedUserName = cleanText(userName);
    const cleanedUserEmail = cleanText(userEmail);

    if (!cleanedUserEmail) {
      return res.status(400).json({ error: 'User email is required' });
    }

    await ratingService.addRating(parsedMentorId, {
      rating: parsedRating,
      review: null,
      userId: userId ? parseIntegerId(userId) : null,
      userName: cleanedUserName || null,
      userEmail: cleanedUserEmail,
    });

    return res.json({ message: 'Rating submitted successfully', success: true });
  } catch (error) {
    console.error('Error submitting rating:', error);
    return res.status(500).json({ error: error.message || 'Failed to submit rating' });
  }
}

async function getAverageRating(req, res) {
  try {
    const { mentorId } = req.params;

    const parsedMentorId = parseIntegerId(mentorId);
    if (!parsedMentorId) {
      return res.status(400).json({ error: 'Invalid mentor ID' });
    }

    const averageData = await ratingService.getAverageRatingByMentorId(parsedMentorId);
    return res.json(averageData);
  } catch (error) {
    console.error('Error fetching average rating:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch average rating' });
  }
}

async function getRatings(req, res) {
  try {
    const { mentorId } = req.params;

    const parsedMentorId = parseIntegerId(mentorId);
    if (!parsedMentorId) {
      return res.status(400).json({ error: 'Invalid mentor ID' });
    }

    const ratings = await ratingService.getRatingsByMentorId(parsedMentorId);
    return res.json({ ratings });
  } catch (error) {
    console.error('Error fetching ratings:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch ratings' });
  }
}

async function getUserRating(req, res) {
  try {
    const { mentorId } = req.params;
    const { email } = req.query;

    const parsedMentorId = parseIntegerId(mentorId);
    if (!parsedMentorId) {
      return res.status(400).json({ error: 'Invalid mentor ID' });
    }

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const userRating = await ratingService.getUserRating(parsedMentorId, email.trim());
    return res.json({ rating: userRating });
  } catch (error) {
    console.error('Error fetching user rating:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch user rating' });
  }
}

module.exports = {
  submitRating,
  getAverageRating,
  getRatings,
  getUserRating,
};
