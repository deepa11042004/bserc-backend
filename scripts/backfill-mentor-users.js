/**
 * backfill-mentor-users.js
 *
 * One-time script: creates a users-table login row for every active mentor.
 *
 * What it does:
 *   1. Adds `mentor_id INT NULL` column to users table (if missing)
 *   2. Extends the role ENUM to include 'mentor' (if missing)
 *   3. For each mentor WHERE status = 'active':
 *        - Skips if a users row already exists for that email
 *        - Password = bcrypt hash of their phone number
 *        - Inserts: role='mentor', mentor_id=<mentor_registrations.id>
 *
 * Login credentials for mentors after running:
 *   Email    → their registered email
 *   Password → their registered phone number (digits only, no spaces/dashes)
 *
 * Env vars:
 *   DRY_RUN=true   → prints what would happen, makes no DB changes (default: false)
 *
 * Usage:
 *   node scripts/backfill-mentor-users.js
 *   DRY_RUN=true node scripts/backfill-mentor-users.js
 */

require('dotenv').config();

const db = require('../src/config/db');
const { hashPassword } = require('../src/utils/hashPassword');

const USERS_TABLE = 'users';
const MENTOR_TABLE = 'mentor_registrations';
const MENTOR_ROLE = 'mentor';
const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === 'true';

// Strip everything except digits from a phone string — this is the raw password
function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function ensureSchemaReady(connection) {
  // Check if mentor_id column already exists (works on all MySQL versions)
  const [colRows] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'mentor_id'`,
    [USERS_TABLE]
  );

  if (colRows.length === 0) {
    await connection.query(`ALTER TABLE ${USERS_TABLE} ADD COLUMN mentor_id INT NULL`);
    console.log('  ✅ Column mentor_id: added');
  } else {
    console.log('  ✅ Column mentor_id: already exists');
  }

  // Extend role ENUM — safe to run multiple times
  await connection.query(
    `ALTER TABLE ${USERS_TABLE}
     MODIFY COLUMN role ENUM('user','admin','instructor','super_admin','mentor') NOT NULL DEFAULT 'user'`
  );
  console.log("  ✅ Role ENUM: 'mentor' value present");
}

async function main() {
  console.log(`\n=== Mentor Users Backfill${DRY_RUN ? ' [DRY RUN — no changes will be made]' : ''} ===\n`);

  const connection = await db.getConnection();

  try {
    // ── Step 1: Schema ────────────────────────────────────────────────────────
    console.log('Step 1: Schema migrations');
    if (DRY_RUN) {
      console.log('  ⏭  Skipped (dry run)');
    } else {
      await ensureSchemaReady(connection);
    }
    console.log('');

    // ── Step 2: Fetch active mentors ──────────────────────────────────────────
    console.log('Step 2: Fetching active mentors…');
    const [mentors] = await connection.query(
      `SELECT id, full_name, email, phone
       FROM ${MENTOR_TABLE}
       WHERE status = 'active'
       ORDER BY id ASC`
    );
    console.log(`  Found ${mentors.length} active mentor(s)\n`);

    if (mentors.length === 0) {
      console.log('Nothing to do.');
      return;
    }

    // ── Step 3: Backfill ──────────────────────────────────────────────────────
    console.log('Step 3: Creating user rows…\n');

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const mentor of mentors) {
      const email = normalizeEmail(mentor.email);
      const phone = normalizePhone(mentor.phone);
      const label = `Mentor #${mentor.id} (${mentor.full_name || 'unnamed'}) <${email}>`;

      if (!email) {
        console.log(`  ⚠️  ${label}: no email — skipped`);
        skipped++;
        continue;
      }

      if (!phone) {
        console.log(`  ⚠️  ${label}: no phone number — skipped (cannot set password)`);
        skipped++;
        continue;
      }

      // Check if a users row already exists for this email
      const [existing] = await connection.query(
        `SELECT id, role FROM ${USERS_TABLE} WHERE LOWER(email) = ? LIMIT 1`,
        [email]
      );

      if (existing.length > 0) {
        const existingRole = existing[0].role;
        console.log(`  ⏭  ${label}: already in users table (role=${existingRole}) — skipped`);
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  🔍 Would create: ${label}`);
        created++;
        continue;
      }

      try {
        const passwordHash = await hashPassword(phone);
        await connection.query(
          `INSERT INTO ${USERS_TABLE} (full_name, email, password, role, mentor_id)
           VALUES (?, ?, ?, ?, ?)`,
          [mentor.full_name || null, email, passwordHash, MENTOR_ROLE, Number(mentor.id)]
        );
        console.log(`  ✅ Created: ${label}`);
        created++;
      } catch (err) {
        console.log(`  ❌ Failed: ${label} — ${err.message}`);
        failed++;
      }
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n────────────────────────────────');
    console.log('Summary:');
    console.log(`  ${DRY_RUN ? 'Would create' : 'Created'} : ${created}`);
    console.log(`  Skipped              : ${skipped}`);
    if (failed > 0) {
      console.log(`  Failed               : ${failed}  ← check errors above`);
    }
    console.log('────────────────────────────────\n');

    if (!DRY_RUN && created > 0) {
      console.log('Mentors can now log in with:');
      console.log('  Email    → their registered email address');
      console.log('  Password → their phone number (digits only, e.g. 9876543210)\n');
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
