/**
 * Edurock demo-data migration seed.
 *
 *   npm run seed            upsert the dataset (idempotent; safe to re-run)
 *   npm run seed:fresh      wipe Edurock collections first (refused in production)
 *   npm run seed:check      build + validate only, print counts and checksum, write nothing
 *
 * Every document has a stable _id derived from a key, and all "random" values
 * come from a seeded generator, so running this against any database produces
 * the same data (the checksum printed at the end proves it). Dates are
 * relative to today unless SEED_ANCHOR=YYYY-MM-DD is set.
 *
 * Flags: --fresh, --dry-run, --skip-firebase
 */
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { firebaseAuth, isFirebaseReady } from '../config/firebase.js';
import { Application, Bookmark, ChatMessage, ChatSession, ContactMessage, Notification, Payment, Review, Tuition, User } from '../models/index.js';
import { SEED_VERSION, buildDataset } from './seed/build.js';

const args = new Set(process.argv.slice(2));
const FRESH = args.has('--fresh');
const DRY_RUN = args.has('--dry-run');
const SKIP_FIREBASE = args.has('--skip-firebase');

const log = (...m) => console.log(...m);
const ids = (docs) => docs.map((d) => d._id);

/** Content fingerprint without timestamps: identical on every database for a given version. */
function checksum(dataset) {
  const strip = (doc) =>
    Object.fromEntries(
      Object.entries(doc)
        .filter(([k, v]) => !(v instanceof Date) && !['lastLoginAt', 'uid'].includes(k))
        .map(([k, v]) => [k, v instanceof mongoose.Types.ObjectId ? String(v) : v]),
    );
  const payload = JSON.stringify(
    ['users', 'tuitions', 'applications', 'payments', 'reviews', 'bookmarks', 'notifications', 'contacts', 'chatSessions', 'chatMessages'].map((k) => dataset[k].map(strip)),
  );
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

async function validateAll(plan) {
  const problems = [];
  for (const { model, docs } of plan) {
    for (const doc of docs) {
      try {
        await new model(doc).validate();
      } catch (err) {
        const details = Object.values(err.errors || {}).map((e) => e.message).join('; ');
        problems.push(`${model.modelName} ${doc._id}: ${details || err.message}`);
      }
    }
  }
  return problems;
}

/** Creates (or reuses) Firebase accounts for the demo logins; never fails the seed. */
async function linkFirebase(demoUsers) {
  if (SKIP_FIREBASE) return log('  · Firebase linking skipped (--skip-firebase)');
  if (!isFirebaseReady()) return log('  · Firebase not configured (FB_SERVICE_KEY): demo sign-in buttons will be unavailable');
  for (const u of demoUsers) {
    try {
      let fb;
      try {
        fb = await firebaseAuth().getUserByEmail(u.email);
        await firebaseAuth().updateUser(fb.uid, { displayName: u.displayName, photoURL: u.photoURL, emailVerified: true });
      } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
        fb = await firebaseAuth().createUser({ email: u.email, displayName: u.displayName, photoURL: u.photoURL, emailVerified: true });
      }
      // Detach the uid from any other record first (unique index), then attach it here.
      await User.updateMany({ uid: fb.uid, _id: { $ne: u._id } }, { $unset: { uid: 1 } });
      await User.updateOne({ _id: u._id }, { $set: { uid: fb.uid } });
      log(`  ✓ Firebase login linked   ${u.email}`);
    } catch (error) {
      log(`  ! Firebase link failed for ${u.email}: ${error.message}`);
    }
  }
}

async function main() {
  const dataset = buildDataset();
  const sum = checksum(dataset);
  const plan = [
    { name: 'users', model: User, docs: dataset.users, owner: null },
    { name: 'tuitions', model: Tuition, docs: dataset.tuitions },
    { name: 'applications', model: Application, docs: dataset.applications },
    { name: 'payments', model: Payment, docs: dataset.payments },
    { name: 'reviews', model: Review, docs: dataset.reviews },
    { name: 'bookmarks', model: Bookmark, docs: dataset.bookmarks },
    { name: 'notifications', model: Notification, docs: dataset.notifications },
    { name: 'contact messages', model: ContactMessage, docs: dataset.contacts },
    { name: 'chat sessions', model: ChatSession, docs: dataset.chatSessions },
    { name: 'chat messages', model: ChatMessage, docs: dataset.chatMessages },
  ];

  log(`\nEdurock seed v${SEED_VERSION}  ·  checksum ${sum}${DRY_RUN ? '  ·  DRY RUN' : ''}`);
  const problems = await validateAll(plan);
  if (problems.length) {
    problems.slice(0, 20).forEach((p) => log(`  ✗ ${p}`));
    throw new Error(`${problems.length} document(s) failed schema validation`);
  }
  log('  ✓ All documents pass schema validation');

  if (DRY_RUN) {
    plan.forEach((p) => log(`    ${p.name.padEnd(17)} ${p.docs.length}`));
    return;
  }

  await connectDB();
  const models = plan.map((p) => p.model);
  // Let Mongoose's automatic index build finish before writing (racing it can stall on a fresh DB).
  await Promise.all(models.map((m) => m.init()));
  log(`  ✓ Connected to "${env.DB_NAME}"`);

  const seedUserIds = ids(dataset.users);
  const seedEmails = dataset.users.map((u) => u.email);

  if (FRESH) {
    if (env.isProd) throw new Error('Refusing to wipe a production database (NODE_ENV=production)');
    for (const m of models) await m.deleteMany({});
    log('  ✓ Wiped Edurock collections (--fresh)');
  } else {
    // Seed accounts created by older seed versions with different ids: replace them.
    await User.deleteMany({ email: { $in: seedEmails }, _id: { $nin: seedUserIds } });
    // Prune previous seed rows that are no longer part of this version.
    for (const { model, docs } of plan) {
      if (model.schema.path('isDemo')) await model.deleteMany({ isDemo: true, _id: { $nin: ids(docs) } });
    }
    await Bookmark.deleteMany({ user: { $in: seedUserIds }, _id: { $nin: ids(dataset.bookmarks) } });
    await Notification.deleteMany({ recipient: { $in: seedUserIds }, _id: { $nin: ids(dataset.notifications) } });
    log('  ✓ Pruned stale seed data (real user data untouched)');
  }

  // Keep Firebase uids already linked to seed users.
  const existingUids = new Map(
    (await User.find({ _id: { $in: seedUserIds }, uid: { $exists: true } }).select('uid').lean()).map((u) => [String(u._id), u.uid]),
  );
  dataset.users.forEach((u) => existingUids.has(String(u._id)) && (u.uid = existingUids.get(String(u._id))));

  for (const { name, model, docs } of plan) {
    const res = await model.bulkWrite(
      docs.map((doc) => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } })),
      { ordered: false, timestamps: false },
    );
    log(`  ✓ ${name.padEnd(17)} ${String(docs.length).padStart(3)}   (${res.upsertedCount} new, ${res.modifiedCount} updated)`);
  }

  for (const m of models) await m.syncIndexes();
  await linkFirebase(Object.values(dataset.demo));

  await mongoose.connection.db.collection('_migrations').updateOne(
    { _id: 'demo-seed' },
    {
      $set: { version: SEED_VERSION, checksum: sum, appliedAt: new Date(), counts: Object.fromEntries(plan.map((p) => [p.name, p.docs.length])) },
    },
    { upsert: true },
  );

  log(`\n✅ Seed v${SEED_VERSION} applied (checksum ${sum}). Demo logins:`);
  Object.values(dataset.demo).forEach((u) => log(`   ${u.role.padEnd(7)} → ${u.email}`));
  log('');
}

main()
  .catch((error) => {
    console.error(`\n❌ Seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => (DRY_RUN ? process.exit() : disconnectDB().then(() => process.exit())));
