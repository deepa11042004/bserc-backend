/**
 * fix-internship-user-passwords.js
 *
 * One-time script: re-hashes passwords for users created from summer internship
 * registrations so that the password is always the clean 10-digit phone number.
 *
 * Problem: createUserIfMissing() used to hash the raw mobile_number string
 * (e.g. "+919876543210", "919876543210", "09876543210", " 9876543210") without
 * stripping prefixes or spaces, causing inconsistent login failures.
 *
 * What it does:
 *   For every row in `users` WHERE role = 'user' that has a matching row in
 *   `summer_internship_registrations` (joined on email) with payment_status IN
 *   ('captured', 'authorized', 'not_required'):
 *     1. Read mobile_number from the internship table
 *     2. Normalize: strip all non-digits, take last 10 digits
 *     3. If not exactly 10 digits → skip and log as invalid
 *     4. Re-hash with bcrypt and UPDATE users.password
 *
 * Env vars:
 *   DRY_RUN=true  → prints what would happen, makes no DB changes (default: false)
 *
 * Usage:
 *   DRY_RUN=true node scripts/fix-internship-user-passwords.js
 *   node scripts/fix-internship-user-passwords.js
 */

require('dotenv').config();

const db = require('../src/config/db');
const { hashPassword } = require('../src/utils/hashPassword');

const USERS_TABLE = 'users';
const INTERNSHIP_TABLE = 'summer_internship_registrations';
const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === 'true';

const COMPLETED_PAYMENT_STATUSES = ['captured', 'authorized', 'not_required'];

function normalizeMobile(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

async function main() {
  console.log(`\n=== Fix Internship User Passwords${DRY_RUN ? ' [DRY RUN — no changes will be made]' : ''} ===\n`);

  const connection = await db.getConnection();

  try {
    // Fetch all users with role='user' that have a completed internship registration
    const placeholders = COMPLETED_PAYMENT_STATUSES.map(() => '?').join(', ');
    const [rows] = await connection.query(
      `SELECT
         u.id        AS user_id,
         u.email     AS user_email,
         sir.mobile_number AS raw_phone,
         sir.payment_status
       FROM ${USERS_TABLE} u
       INNER JOIN ${INTERNSHIP_TABLE} sir
         ON LOWER(sir.email) = LOWER(u.email)
       WHERE u.role = 'user'
         AND sir.payment_status IN (${placeholders})
       ORDER BY u.id ASC`,
      COMPLETED_PAYMENT_STATUSES
    );

    console.log(`Found ${rows.length} matching user(s)\n`);

    if (rows.length === 0) {
      console.log('Nothing to do.');
      return;
    }

    let updated = 0;
    let skippedInvalid = 0;
    let failed = 0;

    for (const row of rows) {
      const label = `User #${row.user_id} <${row.user_email}> (raw phone: "${row.raw_phone}")`;
      const normalized = normalizeMobile(row.raw_phone);

      if (normalized.length !== 10) {
        console.log(`  ⚠️  ${label}: normalized to "${normalized}" — not 10 digits, skipped`);
        skippedInvalid++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  🔍 Would update: ${label} → password = "${normalized}"`);
        updated++;
        continue;
      }

      try {
        const passwordHash = await hashPassword(normalized);
        await connection.query(
          `UPDATE ${USERS_TABLE} SET password = ? WHERE id = ?`,
          [passwordHash, row.user_id]
        );
        console.log(`  ✅ Updated: ${label} → password = "${normalized}"`);
        updated++;
      } catch (err) {
        console.log(`  ❌ Failed: ${label} — ${err.message}`);
        failed++;
      }
    }

    // Summary
    console.log('\n────────────────────────────────');
    console.log('Summary:');
    console.log(`  ${DRY_RUN ? 'Would update' : 'Updated'} : ${updated}`);
    console.log(`  Skipped (invalid phone) : ${skippedInvalid}`);
    if (failed > 0) {
      console.log(`  Failed                  : ${failed}  ← check errors above`);
    }
    console.log('────────────────────────────────\n');

    if (!DRY_RUN && updated > 0) {
      console.log('Affected users can now log in with:');
      console.log('  Email    → their registered email address');
      console.log('  Password → their 10-digit phone number (e.g. 9876543210)\n');
    }

  } finally {
    connection.release();
    await db.end();
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err.message || err);
  process.exit(1);
});
