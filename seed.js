/**
 * seed.js – eTuitionBD demo-data seeder
 *
 * Run once after changing databases:
 *   node seed.js
 *
 * What it does:
 *   1. Creates (or re-uses) 3 Firebase Auth users for the demo accounts.
 *   2. Upserts those users into MongoDB with correct roles.
 *   3. Inserts sample tuitions posted by the demo student.
 *   4. Inserts a sample application from the demo tutor.
 *
 * All seeded documents carry { isDemo: true } so they can be identified
 * or cleaned up later without affecting real data.
 */

require('dotenv').config();
// Node.js on Windows sometimes fails to resolve MongoDB SRV records via the
// system DNS resolver. Force c-ares (Node's DNS engine) to use Google DNS
// which reliably handles SRV queries.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const admin  = require('firebase-admin');
const { MongoClient, ServerApiVersion } = require('mongodb');

// ── Firebase Admin init ───────────────────────────────────────────────
function initFirebase() {
  if (admin.apps.length) return;
  const raw  = process.env.FB_SERVICE_KEY;
  if (!raw) throw new Error('FB_SERVICE_KEY is not set in .env');
  const json = raw.trim().startsWith('{')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}

// ── MongoDB ───────────────────────────────────────────────────────────
const uri = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.dw7x2dn.mongodb.net/?appName=Cluster0`;

// ── Demo account definitions ──────────────────────────────────────────
const DEMO_ACCOUNTS = [
  {
    email:       'demo.student@etuition.com',
    displayName: 'Demo Student',
    role:        'Student',
    photoURL:    'https://ui-avatars.com/api/?name=Demo+Student&background=4f46e5&color=fff&size=128',
  },
  {
    email:       'demo.tutor@etuition.com',
    displayName: 'Demo Tutor',
    role:        'Tutor',
    photoURL:    'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=256&h=256&q=80',
  },
  {
    email:       'demo.admin@etuition.com',
    displayName: 'Demo Admin',
    role:        'Admin',
    photoURL:    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────
async function getOrCreateFbUser(account) {
  try {
    const existing = await admin.auth().getUserByEmail(account.email);
    // Sync display name / photo in case they drifted
    await admin.auth().updateUser(existing.uid, {
      displayName: account.displayName,
      photoURL:    account.photoURL,
      emailVerified: true,
    });
    console.log(`  ✓ Firebase user exists   : ${account.email}  (uid: ${existing.uid})`);
    return existing;
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    const created = await admin.auth().createUser({
      email:         account.email,
      displayName:   account.displayName,
      photoURL:      account.photoURL,
      emailVerified: true,
      // No password — login is done via custom token only
    });
    console.log(`  ✓ Firebase user created  : ${account.email}  (uid: ${created.uid})`);
    return created;
  }
}

// ── Main seed ─────────────────────────────────────────────────────────
async function seed() {
  initFirebase();

  const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  });
  await client.connect();
  console.log('\n✓ Connected to MongoDB\n');

  const db                   = client.db('etuition_db');
  const usersCol             = db.collection('users');
  const tuitionsCol          = db.collection('tuitions');
  const applicationsCol      = db.collection('applications');
  const tutorsCol            = db.collection('tutors');

  // ── 1. Firebase + MongoDB users ───────────────────────────────────
  console.log('── Step 1: Demo users ──────────────────────────────────────');
  const uids = {};   // { Student: uid, Tutor: uid, Admin: uid }

  for (const account of DEMO_ACCOUNTS) {
    const fbUser = await getOrCreateFbUser(account);
    uids[account.role] = fbUser.uid;

    await usersCol.updateOne(
      { email: account.email },
      {
        $set: {
          email:       account.email,
          displayName: account.displayName,
          photoURL:    account.photoURL,
          role:        account.role,
          uid:         fbUser.uid,
          isDemo:      true,
          updatedAt:   new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    console.log(`  ✓ MongoDB user upserted  : ${account.email}  (${account.role})`);
  }

  const studentEmail = 'demo.student@etuition.com';
  const tutorEmail   = 'demo.tutor@etuition.com';

  // ── 2. Demo tuitions (posted by student) ──────────────────────────
  console.log('\n── Step 2: Demo tuitions ───────────────────────────────────');

  // Remove old demo tuitions for this student so re-running is idempotent
  const deleteResult = await tuitionsCol.deleteMany({ studentEmail, isDemo: true });
  if (deleteResult.deletedCount) {
    console.log(`  ✓ Removed ${deleteResult.deletedCount} stale demo tuition(s)`);
  }

  const now = Date.now();
  const demoTuitions = [
    {
      subject:      'Mathematics',
      class:        'Class 9',
      location:     'Dhaka',
      budget:       3000,
      description:  'Need an experienced math tutor for Class 9. Focus on algebra and geometry.',
      studentEmail,
      status:       'Approved',
      isDemo:       true,
      createdAt:    new Date(now - 7 * 86_400_000),
    },
    {
      subject:      'English',
      class:        'Class 10',
      location:     'Chittagong',
      budget:       2500,
      description:  'Looking for an English tutor for SSC prep. Grammar and writing skills needed.',
      studentEmail,
      status:       'Pending',
      isDemo:       true,
      createdAt:    new Date(now - 3 * 86_400_000),
    },
    {
      subject:      'Physics',
      class:        'Class 11',
      location:     'Dhaka',
      budget:       3500,
      description:  'HSC Physics tutor needed. Must be expert in mechanics and thermodynamics.',
      studentEmail,
      status:       'Approved',
      isDemo:       true,
      createdAt:    new Date(now - 1 * 86_400_000),
    },
  ];

  const tuitionResult = await tuitionsCol.insertMany(demoTuitions);
  console.log(`  ✓ Inserted ${tuitionResult.insertedCount} demo tuitions`);

  const mathTuitionId = tuitionResult.insertedIds[0].toString();

  // ── 3. Demo application (tutor → math tuition) ────────────────────
  console.log('\n── Step 3: Demo application ────────────────────────────────');

  await applicationsCol.deleteMany({ tutorEmail, isDemo: true });
  await tutorsCol.deleteMany(      { tutorEmail, isDemo: true });

  const tutorUser = await usersCol.findOne({ email: tutorEmail });

  const demoApplication = {
    tuitionId:       mathTuitionId,
    tuitionTitle:    'Mathematics',
    tuitionSubject:  'Mathematics',
    tuitionLocation: 'Dhaka',
    recruiterEmail:  studentEmail,
    tutorEmail,
    tutorId:         tutorUser?._id?.toString() ?? '',
    tutorName:       'Demo Tutor',
    tutorImage:      'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=256&h=256&q=80',
    qualifications:  'B.Sc in Mathematics, University of Dhaka',
    experience:      '3',
    expectedSalary:  3000,
    status:          'Pending',
    appliedDate:     new Date(now - 2 * 86_400_000),
    isDemo:          true,
  };

  await applicationsCol.insertOne({ ...demoApplication });
  await tutorsCol.insertOne(      { ...demoApplication });
  console.log(`  ✓ Inserted demo application (Tutor → Math tuition)`);

  // ── Done ──────────────────────────────────────────────────────────
  console.log('\n✅ Seed complete!\n');
  console.log('Demo accounts (login via the "Demo Login" buttons on the site):');
  DEMO_ACCOUNTS.forEach(a =>
    console.log(`  ${a.role.padEnd(8)} → ${a.email}`)
  );
  console.log('');

  await client.close();
  process.exit(0);
}

seed().catch(err => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
