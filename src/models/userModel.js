const pool = require('../config/db');

async function findByEmail(email) {
  const [rows] = await pool.query(
    'SELECT id, full_name, email, password, role, is_active, mentor_id, created_at, updated_at, last_login FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  return rows[0];
}

async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id, full_name, email, password, role, is_active, mentor_id, created_at, updated_at, last_login FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0];
}

async function createUser({ full_name, email, password, role }) {
  await pool.query(
    'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
    [full_name || null, email, password, role]
  );
}

async function createMentorUser({ full_name, email, password, mentor_id }) {
  const roles = require('../constants/roles');
  await pool.query(
    'INSERT INTO users (full_name, email, password, role, mentor_id) VALUES (?, ?, ?, ?, ?)',
    [full_name || null, email, password, roles.MENTOR, mentor_id]
  );
}

async function updatePassword(id, hashedPassword) {
  await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
}

async function updateLastLogin(id) {
  await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [id]);
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  createMentorUser,
  updatePassword,
  updateLastLogin,
};
