const express = require('express');
const authAdmin = require('../middleware/authAdmin');
const pool = require('../config/db');
const { hashPassword } = require('../utils/hashPassword');
const userModel = require('../models/userModel');

const router = express.Router();

function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super admin access required.' });
  }
  return next();
}

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

// PATCH /api/admin/users/:id/profile
router.patch('/admin/users/:id/profile', authAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { full_name, email } = req.body || {};

  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }

  if (full_name === undefined && email === undefined) {
    return res.status(400).json({ message: 'Provide at least one field to update.' });
  }

  const updates = {};

  if (full_name !== undefined) {
    updates.full_name = String(full_name || '').trim() || null;
  }

  if (email !== undefined) {
    const trimmedEmail = String(email || '').trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }
    updates.email = trimmedEmail;
  }

  try {
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (updates.email) {
      const existing = await userModel.findByEmail(updates.email);
      if (existing && existing.id !== userId) {
        return res.status(400).json({ message: 'This email is already in use by another account.' });
      }
    }

    const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), userId];
    await pool.query(`UPDATE users SET ${setClauses} WHERE id = ? LIMIT 1`, values);

    return res.json({ message: 'Profile updated successfully.', full_name: updates.full_name ?? user.full_name, email: updates.email ?? user.email });
  } catch {
    return res.status(500).json({ message: 'Failed to update user profile.' });
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

// GET /api/admin/me/permissions — current admin's assigned sections
router.get('/admin/me/permissions', authAdmin, async (req, res) => {
  const userId = req.user?.userId;
  const role = req.user?.role;

  if (role === 'super_admin') {
    return res.json({ isSuperAdmin: true, permissions: null });
  }

  try {
    const [rows] = await pool.query(
      'SELECT section FROM admin_permissions WHERE user_id = ?',
      [userId],
    );
    return res.json({ isSuperAdmin: false, permissions: rows.map((r) => r.section) });
  } catch {
    return res.status(500).json({ message: 'Failed to fetch permissions.' });
  }
});

// GET /api/admin/admins — list all admin/super_admin users (super_admin only)
router.get('/admin/admins', authAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.created_at, u.last_login,
              GROUP_CONCAT(ap.section ORDER BY ap.section SEPARATOR ',') AS sections
       FROM users u
       LEFT JOIN admin_permissions ap ON ap.user_id = u.id
       WHERE u.role IN ('admin', 'super_admin')
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
    );
    const admins = rows.map((r) => ({
      ...r,
      sections: r.sections ? r.sections.split(',') : [],
    }));
    return res.json({ admins });
  } catch {
    return res.status(500).json({ message: 'Failed to fetch admin users.' });
  }
});

// POST /api/admin/admins — create new admin (super_admin only)
router.post('/admin/admins', authAdmin, requireSuperAdmin, async (req, res) => {
  const { full_name, email, password, sections } = req.body || {};

  if (!email || !password || String(password).trim().length < 8) {
    return res.status(400).json({ message: 'Email and password (min 8 chars) are required.' });
  }

  try {
    const existing = await userModel.findByEmail(email.trim().toLowerCase());
    if (existing) {
      return res.status(400).json({ message: 'A user with this email already exists.' });
    }

    const hashed = await hashPassword(String(password).trim());
    await userModel.createUser({
      full_name: (full_name || '').trim() || null,
      email: email.trim().toLowerCase(),
      password: hashed,
      role: 'admin',
    });

    const newUser = await userModel.findByEmail(email.trim().toLowerCase());

    const validSections = Array.isArray(sections) ? sections.filter(Boolean) : [];
    if (validSections.length > 0) {
      const values = validSections.map((s) => [newUser.id, s]);
      await pool.query('INSERT INTO admin_permissions (user_id, section) VALUES ?', [values]);
    }

    return res.status(201).json({ message: 'Admin created successfully.', id: newUser.id });
  } catch {
    return res.status(500).json({ message: 'Failed to create admin.' });
  }
});

// GET /api/admin/admins/:id/permissions (super_admin only)
router.get('/admin/admins/:id/permissions', authAdmin, requireSuperAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT section FROM admin_permissions WHERE user_id = ?',
      [userId],
    );
    return res.json({ permissions: rows.map((r) => r.section) });
  } catch {
    return res.status(500).json({ message: 'Failed to fetch permissions.' });
  }
});

// PATCH /api/admin/admins/:id/permissions — replace all sections (super_admin only)
router.patch('/admin/admins/:id/permissions', authAdmin, requireSuperAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { sections } = req.body || {};

  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }

  try {
    const user = await userModel.findById(userId);
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return res.status(404).json({ message: 'Admin user not found.' });
    }

    await pool.query('DELETE FROM admin_permissions WHERE user_id = ?', [userId]);

    const validSections = Array.isArray(sections) ? sections.filter(Boolean) : [];
    if (validSections.length > 0) {
      const values = validSections.map((s) => [userId, s]);
      await pool.query('INSERT INTO admin_permissions (user_id, section) VALUES ?', [values]);
    }

    return res.json({ message: 'Permissions updated successfully.' });
  } catch {
    return res.status(500).json({ message: 'Failed to update permissions.' });
  }
});

module.exports = router;
