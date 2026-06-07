const db = require('../config/db');

const MENTOR_RATINGS_TABLE = 'mentor_ratings';
const MENTOR_REGISTRATIONS_TABLE = 'mentor_registrations';

async function ensureRatingsTable() {
  const connection = await db.getConnection();
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ${MENTOR_RATINGS_TABLE} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mentor_id INT NOT NULL,
        user_id INT,
        user_name VARCHAR(255),
        user_email VARCHAR(255),
        rating INT NOT NULL CHECK (rating >= 2 AND rating <= 5),
        review TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (mentor_id) REFERENCES ${MENTOR_REGISTRATIONS_TABLE}(id) ON DELETE CASCADE,
        INDEX idx_mentor_id (mentor_id),
        UNIQUE KEY unique_mentor_user (mentor_id, user_email)
      )
    `);
  } catch (error) {
    if (!error.message.includes('already exists')) {
      throw error;
    }
  } finally {
    connection.release();
  }
}

async function addRating(mentorId, { rating, review, userId = null, userName = null, userEmail = null }) {
  if (!rating || rating < 2 || rating > 5) {
    throw new Error('Rating must be between 2 and 5');
  }

  if (!mentorId) {
    throw new Error('Mentor ID is required');
  }

  const connection = await db.getConnection();
  try {
    await connection.execute(
      `INSERT INTO ${MENTOR_RATINGS_TABLE} (mentor_id, user_id, user_name, user_email, rating, review)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = ?, review = ?, updated_at = CURRENT_TIMESTAMP`,
      [mentorId, userId, userName, userEmail, rating, review, rating, review]
    );
    return { success: true, message: 'Rating saved successfully' };
  } catch (error) {
    throw new Error(`Failed to save rating: ${error.message}`);
  } finally {
    connection.release();
  }
}

async function getRatingsByMentorId(mentorId) {
  const connection = await db.getConnection();
  try {
    const [ratings] = await connection.execute(
      `SELECT id, user_name, rating, review, created_at FROM ${MENTOR_RATINGS_TABLE}
       WHERE mentor_id = ? AND (user_name IS NOT NULL OR user_email IS NOT NULL)
       ORDER BY created_at DESC`,
      [mentorId]
    );
    return ratings;
  } catch (error) {
    throw new Error(`Failed to fetch ratings: ${error.message}`);
  } finally {
    connection.release();
  }
}

async function getAverageRatingByMentorId(mentorId) {
  const connection = await db.getConnection();
  try {
    const [result] = await connection.execute(
      `SELECT
        AVG(rating) as average_rating,
        COUNT(*) as total_ratings
       FROM ${MENTOR_RATINGS_TABLE}
       WHERE mentor_id = ? AND (user_name IS NOT NULL OR user_email IS NOT NULL)`,
      [mentorId]
    );

    const data = result[0] || { average_rating: null, total_ratings: 0 };
    const avgRating = data.average_rating ? parseFloat(data.average_rating) : null;
    return {
      average_rating: avgRating ? parseFloat(avgRating.toFixed(2)) : null,
      total_ratings: parseInt(data.total_ratings, 10),
    };
  } catch (error) {
    throw new Error(`Failed to fetch average rating: ${error.message}`);
  } finally {
    connection.release();
  }
}

async function getUserRating(mentorId, userEmail) {
  const connection = await db.getConnection();
  try {
    const [ratings] = await connection.execute(
      `SELECT id, rating, review FROM ${MENTOR_RATINGS_TABLE}
       WHERE mentor_id = ? AND user_email = ?`,
      [mentorId, userEmail]
    );
    return ratings[0] || null;
  } catch (error) {
    throw new Error(`Failed to fetch user rating: ${error.message}`);
  } finally {
    connection.release();
  }
}

module.exports = {
  ensureRatingsTable,
  addRating,
  getRatingsByMentorId,
  getAverageRatingByMentorId,
  getUserRating,
};
