const { hashPassword, comparePassword } = require('../utils/hashPassword');
const { signToken } = require('../utils/jwt');
const roles = require('../constants/roles');
const userModel = require('../models/userModel');

const normalizeEmail = (email) => (email || '').trim().toLowerCase();
const cleanText = (value) => (value || '').trim();

async function register({ full_name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const cleanPassword = cleanText(password);

  if (!normalizedEmail || !cleanPassword) {
    return { status: 400, body: { message: 'Email and password are required' } };
  }

  const existing = await userModel.findByEmail(normalizedEmail);
  if (existing) {
    return { status: 400, body: { message: 'User already exists' } };
  }

  const hashedPassword = await hashPassword(cleanPassword);
  await userModel.createUser({
    full_name: cleanText(full_name) || null,
    email: normalizedEmail,
    password: hashedPassword,
    role: roles.USER,
  });

  return { status: 201, body: { message: 'User registered successfully' } };
}

async function login({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const cleanPassword = cleanText(password);

  if (!normalizedEmail || !cleanPassword) {
    return { status: 400, body: { message: 'Email and password are required' } };
  }

  const user = await userModel.findByEmail(normalizedEmail);
  if (!user) {
    return { status: 404, body: { message: 'User not found' } };
  }

  if (user.is_active === 0 || user.is_active === false) {
    return { status: 403, body: { message: 'Account disabled' } };
  }

  const matches = await comparePassword(cleanPassword, user.password);
  if (!matches) {
    return { status: 401, body: { message: 'Invalid password' } };
  }

  await userModel.updateLastLogin(user.id);

  const mentorId = user.mentor_id ? Number(user.mentor_id) : null;
  const tokenPayload = { userId: user.id, email: user.email, role: user.role };
  if (mentorId) {
    tokenPayload.mentorId = mentorId;
  }

  const token = signToken(tokenPayload);

  const responseUser = {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
  };
  if (mentorId) {
    responseUser.mentor_id = mentorId;
  }

  return {
    status: 200,
    body: {
      message: 'Login successful',
      token,
      user: responseUser,
    },
  };
}

async function changePassword(userId, oldPassword, newPassword) {
  const cleanOld = cleanText(oldPassword);
  const cleanNew = cleanText(newPassword);

  if (!cleanOld || !cleanNew) {
    return { status: 400, body: { message: 'Old and new passwords are required' } };
  }

  const user = await userModel.findById(userId);
  if (!user) {
    return { status: 404, body: { message: 'User not found' } };
  }

  const matches = await comparePassword(cleanOld, user.password);
  if (!matches) {
    return { status: 401, body: { message: 'Old password is incorrect' } };
  }

  const newHashedPassword = await hashPassword(cleanNew);
  await userModel.updatePassword(userId, newHashedPassword);

  return { status: 200, body: { message: 'Password updated successfully' } };
}

async function getProfile(userId) {
  const user = await userModel.findById(userId);
  if (!user) {
    return { status: 404, body: { message: 'User not found' } };
  }

  return {
    status: 200,
    body: {
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login: user.last_login,
      },
    },
  };
}

module.exports = {
  register,
  login,
  changePassword,
  getProfile,
};
