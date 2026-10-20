/**
 * End-to-end API tests against an in-memory MongoDB replica set
 * (so transactions are exercised too). Firebase is replaced by a fake
 * token verifier: the bearer token is "uid|email".
 *
 *   npm test
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';

let replSet;
let dbPath;
let app;
let models;

const tokens = {
  student: 'uid-student|student@test.dev',
  tutor: 'uid-tutor|tutor@test.dev',
  tutor2: 'uid-tutor2|tutor2@test.dev',
  admin: 'uid-admin|admin@test.dev',
  stranger: 'uid-stranger|stranger@test.dev',
};
const auth = (who) => ({ Authorization: `Bearer ${tokens[who]}` });

before(async () => {
  // Explicit data dir inside the project (some sandboxes block the OS temp dir).
  const root = path.resolve('.test-db');
  mkdirSync(root, { recursive: true });
  dbPath = mkdtempSync(path.join(root, 'run-'));
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: { version: process.env.MONGOMS_VERSION || '8.2.6' },
    instanceOpts: [{ dbPath, launchTimeout: 60_000 }],
  });
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = replSet.getUri();
  process.env.DB_NAME = 'edurock_test';

  const { setTokenVerifier } = await import('../src/middlewares/auth.js');
  setTokenVerifier(async (token) => {
    const [uid, email] = token.split('|');
    if (!uid || !email) throw new Error('bad token');
    return { uid, email };
  });

  ({ createApp: app } = await import('../src/app.js'));
  app = app();
  models = await import('../src/models/index.js');
  const { connectDB } = await import('../src/config/db.js');
  await connectDB();
  const all = Object.values(models).filter((m) => m?.syncIndexes);
  await Promise.all(all.map((m) => m.init())); // let auto-indexing finish first
  for (const m of all) await m.syncIndexes();
});

after(async () => {
  const { disconnectDB } = await import('../src/config/db.js');
  await disconnectDB();
  await replSet?.stop();
  try {
    if (dbPath) rmSync(dbPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* mongod may still hold a file handle on Windows; the folder is gitignored */
  }
});

describe('auth & accounts', () => {
  test('sync creates accounts and never grants Admin from the body', async () => {
    const bad = await request(app).post('/api/v1/auth/sync').set(auth('student')).send({ role: 'Admin' });
    assert.equal(bad.status, 422);

    const res = await request(app).post('/api/v1/auth/sync').set(auth('student')).send({ displayName: 'Sara Student', role: 'Student' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.role, 'Student');
    assert.equal(res.body.data.uid, undefined, 'uid must not leak');

    await request(app).post('/api/v1/auth/sync').set(auth('tutor')).send({ displayName: 'Tanvir Tutor', role: 'Tutor' }).expect(201);
    await request(app).post('/api/v1/auth/sync').set(auth('tutor2')).send({ displayName: 'Nadia Tutor', role: 'Tutor' }).expect(201);
    await request(app).post('/api/v1/auth/sync').set(auth('admin')).send({ displayName: 'Ayesha Admin' }).expect(201);
    await models.User.updateOne({ email: 'admin@test.dev' }, { role: 'Admin' });
  });

  test('re-sync keeps the existing role', async () => {
    const res = await request(app).post('/api/v1/auth/sync').set(auth('student')).send({ role: 'Tutor' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.role, 'Student');
  });

  test('protected routes require a token and a profile', async () => {
    await request(app).get('/api/v1/profile').expect(401);
    await request(app).get('/api/v1/profile').set(auth('stranger')).expect(403);
    await request(app).get('/api/v1/users').set(auth('student')).expect(403);
  });

  test('operator injection in the body is stripped', async () => {
    const res = await request(app).patch('/api/v1/profile').set(auth('student')).send({ displayName: { $ne: null } });
    assert.equal(res.status, 422);
  });
});

describe('tuition → application → payment lifecycle', () => {
  let tuitionId;
  let applicationId;
  let application2Id;

  const tuition = {
    title: 'HSC Physics tutor needed in Dhanmondi',
    subject: 'Physics',
    classLevel: 'HSC',
    location: 'Dhanmondi, Dhaka',
    budget: 6000,
    schedule: '3 days/week',
    description: 'Looking for an experienced tutor for mechanics and thermodynamics.',
    teachingMode: 'Home Visit',
  };

  test('validation rejects bad tuition payloads', async () => {
    const res = await request(app).post('/api/v1/tuitions').set(auth('student')).send({ ...tuition, budget: 10 });
    assert.equal(res.status, 422);
    assert.ok(res.body.details.some((d) => d.field === 'budget'));
  });

  test('only students can post; new posts are Pending and hidden', async () => {
    await request(app).post('/api/v1/tuitions').set(auth('tutor')).send(tuition).expect(403);
    const res = await request(app).post('/api/v1/tuitions').set(auth('student')).send(tuition).expect(201);
    tuitionId = res.body.data.id;
    assert.equal(res.body.data.status, 'Pending');

    await request(app).get(`/api/v1/tuitions/${tuitionId}`).expect(404);
    await request(app).get(`/api/v1/tuitions/${tuitionId}`).set(auth('student')).expect(200);
  });

  test('a stranger cannot edit someone else’s tuition (IDOR guard)', async () => {
    await request(app).patch(`/api/v1/tuitions/${tuitionId}`).set(auth('tutor')).send({ budget: 1 }).expect(403);
  });

  test('admin approves; the post shows up in the public feed', async () => {
    await request(app).patch(`/api/v1/tuitions/${tuitionId}/status`).set(auth('admin')).send({ status: 'Rejected' }).expect(422);
    await request(app).patch(`/api/v1/tuitions/${tuitionId}/status`).set(auth('admin')).send({ status: 'Approved' }).expect(200);

    const feed = await request(app).get('/api/v1/tuitions?search=physics').expect(200);
    assert.equal(feed.body.meta.total, 1);
    assert.equal(feed.body.data[0].id, tuitionId);
  });

  test('tutors apply once; the student gets notified', async () => {
    const body = { tuitionId, qualifications: 'BSc Physics, DU', experience: 3, expectedSalary: 6000 };
    const res = await request(app).post('/api/v1/applications').set(auth('tutor')).send(body).expect(201);
    applicationId = res.body.data.id;
    await request(app).post('/api/v1/applications').set(auth('tutor')).send(body).expect(409);
    const res2 = await request(app).post('/api/v1/applications').set(auth('tutor2')).send({ ...body, expectedSalary: 5500 }).expect(201);
    application2Id = res2.body.data.id;

    const notes = await request(app).get('/api/v1/notifications').set(auth('student')).expect(200);
    const applied = notes.body.data.filter((n) => n.type === 'new_application');
    assert.equal(applied.length, 2);
    assert.ok(notes.body.data.some((n) => n.type === 'tuition_approved'));
  });

  test('public tuition data never exposes who posted it', async () => {
    const detail = await request(app).get(`/api/v1/tuitions/${tuitionId}`).expect(200);
    for (const field of ['studentEmail', 'studentName', 'studentPhoto']) assert.equal(detail.body.data[field], undefined, field);
    const feed = await request(app).get('/api/v1/tuitions').expect(200);
    assert.equal(feed.body.data[0].studentEmail, undefined);
    // The owner still sees their own post in full.
    const own = await request(app).get(`/api/v1/tuitions/${tuitionId}`).set(auth('student')).expect(200);
    assert.equal(own.body.data.studentEmail, 'student@test.dev');
  });

  test('only admins can see who applied, with contacts', async () => {
    await request(app).get(`/api/v1/tuitions/${tuitionId}/applications`).set(auth('student')).expect(403);
    const res = await request(app).get(`/api/v1/tuitions/${tuitionId}/applications`).set(auth('admin')).expect(200);
    assert.equal(res.body.data.length, 2);
    assert.equal(res.body.meta.tuition.student.email, 'student@test.dev');
    assert.ok(res.body.data.every((a) => a.tutor.email));
  });

  test('a tutor cannot withdraw another tutor’s application', async () => {
    await request(app).delete(`/api/v1/applications/${applicationId}`).set(auth('tutor2')).expect(403);
  });

  test('received applications are scoped to the owner', async () => {
    const res = await request(app).get('/api/v1/applications/received').set(auth('student')).expect(200);
    assert.equal(res.body.data.length, 2);
    assert.ok(res.body.data[0].tutor.displayName);
  });

  test('payment fulfilment is transactional and idempotent', async () => {
    const { fulfill } = await import('../src/services/payment.service.js');
    const [student, tutor] = await Promise.all([
      models.User.findOne({ email: 'student@test.dev' }).lean(),
      models.User.findOne({ email: 'tutor@test.dev' }).lean(),
    ]);
    const session = {
      id: 'cs_test_123',
      payment_intent: 'pi_test_123',
      amount_total: 600000,
      currency: 'bdt',
      metadata: { applicationId, tuitionId, studentId: String(student._id), tutorId: String(tutor._id) },
    };

    const [a, b] = await Promise.all([fulfill(session), fulfill(session)]);
    assert.ok(a.alreadyProcessed !== b.alreadyProcessed || (a.alreadyProcessed && b.alreadyProcessed));
    assert.equal(await models.Payment.countDocuments(), 1);

    const payment = await models.Payment.findOne().lean();
    assert.equal(payment.amount, 6000);
    assert.equal(payment.platformFee, 600);
    assert.equal(payment.netAmount, 5400);

    const t = await models.Tuition.findById(tuitionId).lean();
    assert.equal(t.status, 'Booked');
    const other = await models.Application.findById(application2Id).lean();
    assert.equal(other.status, 'Rejected');
  });

  test('booked tuitions cannot be edited or deleted by the student', async () => {
    await request(app).patch(`/api/v1/tuitions/${tuitionId}`).set(auth('student')).send({ budget: 7000 }).expect(409);
    await request(app).delete(`/api/v1/tuitions/${tuitionId}`).set(auth('student')).expect(409);
  });

  test('student reviews the hired tutor once; rating is denormalised', async () => {
    await request(app).post('/api/v1/reviews').set(auth('student')).send({ applicationId: application2Id, rating: 5 }).expect(409);
    await request(app).post('/api/v1/reviews').set(auth('student')).send({ applicationId, rating: 4, comment: 'Great!' }).expect(201);
    await request(app).post('/api/v1/reviews').set(auth('student')).send({ applicationId, rating: 5 }).expect(409);

    const tutor = await models.User.findOne({ email: 'tutor@test.dev' }).lean();
    assert.equal(tutor.ratingAvg, 4);
    assert.equal(tutor.hiredCount, 1);

    const profile = await request(app).get(`/api/v1/tutors/${tutor._id}`).expect(200);
    assert.equal(profile.body.data.reviews.length, 1);
    assert.equal(profile.body.data.email, undefined, 'tutor email must stay private');
  });

  test('dashboards return role-specific numbers', async () => {
    const s = await request(app).get('/api/v1/dashboard/student').set(auth('student')).expect(200);
    assert.equal(s.body.data.totals.totalSpent, 6000);
    const t = await request(app).get('/api/v1/dashboard/tutor').set(auth('tutor')).expect(200);
    assert.equal(t.body.data.totals.totalEarned, 5400);
    const a = await request(app).get('/api/v1/dashboard/admin').set(auth('admin')).expect(200);
    assert.equal(a.body.data.totals.platformEarnings, 600);
    await request(app).get('/api/v1/dashboard/admin').set(auth('tutor')).expect(403);
  });
});

describe('live chat', () => {
  let token;
  let sessionId;

  test('a visitor starts a chat with name + phone and gets a resume token', async () => {
    await request(app).post('/api/v1/chat/sessions').send({ name: 'Rina', phone: 'abc' }).expect(422);
    const res = await request(app).post('/api/v1/chat/sessions').send({ name: 'Rina Akter', phone: '01711-223344', message: 'Do you have Physics tutors in Mirpur?' }).expect(201);
    token = res.body.data.token;
    sessionId = res.body.data.session.id;
    assert.equal(token.length, 64);
    assert.equal(res.body.data.session.tokenHash, undefined, 'hash must not leak');
    assert.equal(res.body.data.messages.length, 2); // greeting + first message
  });

  test('the token resumes the conversation; a wrong token is rejected', async () => {
    await request(app).get('/api/v1/chat/me').set('X-Chat-Token', 'x'.repeat(64)).expect(401);
    await request(app).post('/api/v1/chat/me/messages').set('X-Chat-Token', token).send({ body: 'Class 9 please.' }).expect(201);
    const res = await request(app).get('/api/v1/chat/me').set('X-Chat-Token', token).expect(200);
    assert.equal(res.body.data.messages.length, 3);
  });

  test('admins see unread chats and reply; visitors receive the reply', async () => {
    await request(app).get('/api/v1/chat/admin/sessions').set(auth('student')).expect(403);
    const list = await request(app).get('/api/v1/chat/admin/sessions').set(auth('admin')).expect(200);
    assert.equal(list.body.meta.unread, 2);
    await request(app).get(`/api/v1/chat/admin/sessions/${sessionId}`).set(auth('admin')).expect(200);
    await request(app).post(`/api/v1/chat/admin/sessions/${sessionId}/messages`).set(auth('admin')).send({ body: 'Yes! Three verified tutors.' }).expect(201);

    const since = new Date(Date.now() - 5_000).toISOString();
    const res = await request(app).get(`/api/v1/chat/me?after=${encodeURIComponent(since)}`).set('X-Chat-Token', token).expect(200);
    assert.ok(res.body.data.messages.some((m) => m.sender === 'admin' && m.body.startsWith('Yes!')));
    const after = await request(app).get('/api/v1/chat/admin/sessions').set(auth('admin')).expect(200);
    assert.equal(after.body.meta.unread, 0);
  });
});

describe('admin & misc', () => {
  test('admin cannot demote themselves', async () => {
    const me = await models.User.findOne({ email: 'admin@test.dev' }).lean();
    await request(app).patch(`/api/v1/users/${me._id}/role`).set(auth('admin')).send({ role: 'Student' }).expect(400);
  });

  test('suspended users are locked out immediately', async () => {
    const tutor2 = await models.User.findOne({ email: 'tutor2@test.dev' }).lean();
    await request(app).patch(`/api/v1/users/${tutor2._id}/status`).set(auth('admin')).send({ isActive: false }).expect(200);
    await request(app).get('/api/v1/profile').set(auth('tutor2')).expect(403);
  });

  test('public lists are cached and invalid queries rejected', async () => {
    const first = await request(app).get('/api/v1/tutors?limit=5').expect(200);
    assert.equal(first.headers['x-cache'], 'MISS');
    const second = await request(app).get('/api/v1/tutors?limit=5').expect(200);
    assert.equal(second.headers['x-cache'], 'HIT');
    await request(app).get('/api/v1/tutors?sort=hacker').expect(422);
    await request(app).get('/api/v1/tuitions/not-an-id').expect(422);
  });

  test('contact form honeypot blocks bots', async () => {
    const msg = { name: 'Rahim', email: 'rahim@test.dev', message: 'Hello, I would like to know more.' };
    await request(app).post('/api/v1/contact').send({ ...msg, website: 'spam.example' }).expect(422);
    await request(app).post('/api/v1/contact').send(msg).expect(201);
  });

  test('unknown routes return a structured 404', async () => {
    const res = await request(app).get('/api/v1/nope').expect(404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'ROUTE_NOT_FOUND');
  });
});
