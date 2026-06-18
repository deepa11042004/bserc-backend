const express = require('express');
const authAdmin = require('../middleware/authAdmin');
const pool = require('../config/db');
const { hashPassword } = require('../utils/hashPassword');
const userModel = require('../models/userModel');

const router = express.Router();

// GET /api/admin/users?search=
router.get('/admin/users', authAdmin, async (req, res) => {
  const search = (req.query.search || '').trim();

  try {
    let rows, countRows;

    if (search) {
      const like = `%${search}%`;
      [rows] = await pool.query(
        `SELECT id, full_name, email, role, is_active, created_at, last_login
         FROM users
         WHERE full_name LIKE ? OR email LIKE ?
         ORDER BY created_at DESC`,
        [like, like],
      );
      [countRows] = await pool.query(
        'SELECT COUNT(*) AS total FROM users WHERE full_name LIKE ? OR email LIKE ?',
        [like, like],
      );
    } else {
      [rows] = await pool.query(
        `SELECT id, full_name, email, role, is_active, created_at, last_login
         FROM users
         ORDER BY created_at DESC`,
      );
      [countRows] = await pool.query('SELECT COUNT(*) AS total FROM users');
    }

    res.json({ users: rows, total: countRows[0].total });
  } catch {
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
});

// PATCH /api/admin/users/:id/status
router.patch('/admin/users/:id/status', authAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { is_active } = req.body || {};

  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }

  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ message: '`is_active` must be a boolean.' });
  }

  try {
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    await userModel.updateStatus(userId, is_active);
    res.json({ message: is_active ? 'User unblocked.' : 'User blocked.', is_active });
  } catch {
    res.status(500).json({ message: 'Failed to update user status.' });
  }
});

// PATCH /api/admin/users/:id/password
router.patch('/admin/users/:id/password', authAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { newPassword } = req.body || {};

  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }

  if (!newPassword || String(newPassword).trim().length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  }

  try {
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const hashed = await hashPassword(String(newPassword).trim());
    await userModel.updatePassword(userId, hashed);

    res.json({ message: 'Password updated successfully.' });
  } catch {
    res.status(500).json({ message: 'Failed to update password.' });
  }
});

module.exports = router;
