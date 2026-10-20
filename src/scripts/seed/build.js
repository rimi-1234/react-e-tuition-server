import { createHash } from 'node:crypto';
import {
  CHATS,
  CONTACT_MESSAGES,
  DEMO_ACCOUNTS,
  DESCRIPTIONS,
  PHOTOS_FEMALE,
  PHOTOS_MALE,
  REVIEW_COMMENTS,
  STUDENTS,
  TUITION_TEMPLATES,
  TUTORS,
  avatar,
} from './data.js';
import { createClock, createRandom, oid } from './random.js';

/** Bumped whenever the generated dataset changes shape or content. */
export const SEED_VERSION = 4;

const FEE_PERCENT = 10;
const split = (gross) => {
  const platformFee = Math.round(gross * FEE_PERCENT) / 100;
  return { platformFee, netAmount: Math.round((gross - platformFee) * 100) / 100 };
};

// Fixed status plan by tuition index (0 = newest), so every run matches.
const PENDING = new Set([3, 9, 17, 26, 40]);
const REJECTED = new Set([13, 31, 44]);
const BOOKED = new Set([6, 12, 19, 22, 27, 30, 33, 36, 37, 39, 41, 43, 45, 46, 47]);
const TUITION_COUNT = 48;

/**
 * Builds the complete demo marketplace as plain documents with stable _ids.
 * Pure function of (SEED_VERSION, anchor date): no I/O.
 */
export function buildDataset({ anchor } = {}) {
  const rng = createRandom(20261017 + SEED_VERSION);
  const { daysAgo, anchor: now } = createClock(anchor);
  const clamp = (date) => (date > now ? now : date);
  const addDays = (date, days) => clamp(new Date(date.getTime() + days * 86_400_000));

  /* ── Users ───────────────────────────────────────────────────────── */
  const users = [];
  const makeUser = (key, fields, createdDaysAgo) => {
    const doc = {
      _id: oid(`user:${fields.email}`),
      isActive: true,
      isDemo: true,
      bio: '',
      location: '',
      phone: '',
      gender: '',
      subjects: [],
      experienceYears: 0,
      qualification: '',
      institution: '',
      expectedSalary: 0,
      teachingMode: '',
      verified: false,
      verifiedAt: null,
      ratingAvg: 0,
      ratingCount: 0,
      hiredCount: 0,
      ...fields,
      createdAt: daysAgo(createdDaysAgo),
      updatedAt: daysAgo(Math.max(0, createdDaysAgo - 30)),
      lastLoginAt: daysAgo(rng.int(0, 6)),
    };
    doc.key = key;
    users.push(doc);
    return doc;
  };

  const demo = Object.fromEntries(
    DEMO_ACCOUNTS.map(({ key, ...a }) => [
      a.role,
      makeUser(key, { ...a, verifiedAt: a.verified ? daysAgo(300) : null }, 365),
    ]),
  );

  // Photo pools minus the ones used by demo accounts.
  const femalePhotos = PHOTOS_FEMALE.filter((p) => !Object.values(demo).some((d) => d.photoURL === p));
  const malePhotos = PHOTOS_MALE.filter((p) => !Object.values(demo).some((d) => d.photoURL === p));

  const tutors = [
    demo.Tutor,
    ...TUTORS.map(([name, gender, subjects, years, qualification, institution, location, rate, mode, verified], i) => {
      const pool = gender === 'Female' ? femalePhotos : malePhotos;
      const photoURL = pool[Math.floor(i / 2) % pool.length];
      return makeUser(
        `tutor-${i}`,
        {
          email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@edurock.demo`,
          displayName: name,
          role: 'Tutor',
          gender,
          photoURL,
          location,
          phone: `01${7 + (i % 3)}${String(10_000_000 + i * 7_919).slice(0, 8)}`,
          subjects,
          experienceYears: years,
          qualification,
          institution,
          expectedSalary: rate,
          teachingMode: mode,
          verified,
          verifiedAt: verified ? daysAgo(200 - i * 4) : null,
          bio:
            `${qualification} from ${institution}. ${years}+ years teaching ${subjects.join(', ')}. ` +
            rng.pick([
              'I focus on fundamentals first, then exam technique, with a short progress note for parents every week.',
              'Lessons mix concept explanations, worked examples and timed practice so students stay confident under exam pressure.',
              'I keep classes interactive and tailor the pace to each student, with homework support between sessions.',
              'Past-paper practice, clear notes and honest feedback: that is how my students consistently improve their grades.',
            ]),
        },
        330 - i * 11,
      );
    }),
  ];

  const students = [
    demo.Student,
    ...STUDENTS.map(([name, gender, location], i) =>
      makeUser(
        `student-${i}`,
        {
          email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@edurock.demo`,
          displayName: name,
          role: 'Student',
          gender,
          photoURL: avatar(name),
          location,
          phone: `01${5 + (i % 4)}${String(20_000_000 + i * 6_131).slice(0, 8)}`,
        },
        340 - i * 17,
      ),
    ),
  ];

  /* ── Tuitions ────────────────────────────────────────────────────── */
  let approvedSeen = 0;
  let bookedSeen = 0;
  const tuitions = Array.from({ length: TUITION_COUNT }, (_, i) => {
    const [title, subject, classLevel, minB, maxB, schedule, teachingMode, experienceNeeded] = TUITION_TEMPLATES[i % TUITION_TEMPLATES.length];
    const owner = students[i % students.length];
    const status = PENDING.has(i) ? 'Pending' : REJECTED.has(i) ? 'Rejected' : BOOKED.has(i) ? 'Booked' : 'Approved';
    const age =
      status === 'Pending'
        ? rng.int(0, 2)
        : status === 'Approved'
          ? Math.round(approvedSeen++ * 1.5 + rng.int(0, 2))
          : status === 'Booked'
            ? bookedSeen++ * 22 + rng.int(6, 14)
            : rng.int(5, 30);
    const createdAt = daysAgo(age, rng.int(0, 8));
    return {
      _id: oid(`tuition:${i}`),
      title: i >= TUITION_TEMPLATES.length ? `${title} (${owner.location.split(',')[0]})` : title,
      subject,
      classLevel,
      location: owner.location,
      budget: rng.price(minB, maxB),
      schedule,
      description: DESCRIPTIONS[i % DESCRIPTIONS.length],
      studentGender: rng.pick(['Male', 'Female', '']),
      preferredTutor: rng.pick(['Any', 'Any', 'Any', 'Female', 'Male']),
      teachingMode,
      experienceNeeded,
      media: [],
      status,
      rejectionReason: status === 'Rejected' ? 'Please add more detail about the syllabus, the student’s current level and preferred days.' : '',
      student: owner._id,
      studentEmail: owner.email,
      studentName: owner.displayName,
      studentPhoto: owner.photoURL,
      applicationsCount: 0,
      views: rng.int(18, 260),
      hiredTutor: null,
      approvedAt: ['Approved', 'Booked'].includes(status) ? addDays(createdAt, 0.3) : null,
      bookedAt: null,
      isDemo: true,
      createdAt,
      updatedAt: createdAt,
      _index: i,
    };
  });

  /* ── Applications, payments, reviews ─────────────────────────────── */
  const applications = [];
  const payments = [];
  const reviews = [];
  let demoTutorHires = 0;
  let demoStudentHires = 0;
  let paymentNo = 0;

  const candidatesFor = (t) => {
    const direct = tutors.filter((u) => u.subjects.includes(t.subject));
    const others = rng.sample(tutors.filter((u) => !direct.includes(u)), 2);
    const ordered = [...rng.sample(direct, direct.length), ...others];
    // The demo tutor applies to everything in their subjects, so the demo account has activity.
    const demoIdx = ordered.indexOf(demo.Tutor);
    if (demoIdx > 0) ordered.unshift(...ordered.splice(demoIdx, 1));
    return ordered;
  };

  const makeApplication = (t, tutor, status, extra = {}) => {
    const createdAt = addDays(t.createdAt, 0.2 + rng.next() * 2);
    const app = {
      _id: oid(`application:${t._index}:${tutor.email}`),
      tuition: t._id,
      tutor: tutor._id,
      student: t.student,
      tuitionTitle: t.title,
      tuitionSubject: t.subject,
      tuitionLocation: t.location,
      tutorName: tutor.displayName,
      tutorPhoto: tutor.photoURL,
      tutorEmail: tutor.email,
      studentEmail: t.studentEmail,
      qualifications: `${tutor.qualification}, ${tutor.institution}`,
      experience: tutor.experienceYears,
      expectedSalary: Math.max(1000, rng.price(t.budget * 0.9, t.budget * 1.1)),
      message: rng.pick([
        'I have taught this syllabus many times and would love to help. I can start this week.',
        'I focus on concepts first and then lots of exam practice. Happy to do a free trial class.',
        'My recent students improved by at least one grade within a term. Flexible with timing.',
        '',
      ]),
      status,
      decidedAt: status === 'Pending' ? null : addDays(createdAt, 2 + rng.int(0, 4)),
      transactionId: null,
      reviewed: false,
      isDemo: true,
      createdAt,
      updatedAt: createdAt,
      ...extra,
    };
    applications.push(app);
    t.applicationsCount += 1;
    return app;
  };

  for (const t of tuitions) {
    if (t.status === 'Pending' || t.status === 'Rejected') continue;
    const candidates = candidatesFor(t);

    if (t.status === 'Approved') {
      const n = Math.min(candidates.length, rng.int(1, 4));
      candidates.slice(0, n).forEach((tutor, k) => makeApplication(t, tutor, k > 0 && rng.chance(0.2) ? 'Rejected' : 'Pending'));
      continue;
    }

    // Booked: one hire (the demo tutor gets the first three in their subjects) plus a few declined.
    const isDemoSubject = demo.Tutor.subjects.includes(t.subject);
    const hiredTutor = isDemoSubject && demoTutorHires < 3 ? (demoTutorHires++, demo.Tutor) : candidates.find((c) => c !== demo.Tutor) || candidates[0];
    const n = 1 + rng.int(0, 2);
    const hire = makeApplication(t, hiredTutor, 'Approved');
    candidates
      .filter((c) => c !== hiredTutor)
      .slice(0, n - 1)
      .forEach((tutor) => makeApplication(t, tutor, 'Rejected', { decidedAt: hire.decidedAt }));

    paymentNo += 1;
    const transactionId = `pi_seed_${String(paymentNo).padStart(4, '0')}`;
    hire.transactionId = transactionId;
    hire.expectedSalary = t.budget;
    t.hiredTutor = hiredTutor._id;
    t.bookedAt = hire.decidedAt;
    t.updatedAt = hire.decidedAt;
    const owner = students.find((s) => s._id.equals(t.student));
    const { platformFee, netAmount } = split(hire.expectedSalary);
    payments.push({
      _id: oid(`payment:${t._index}`),
      transactionId,
      stripeSessionId: `cs_seed_${String(paymentNo).padStart(4, '0')}`,
      student: t.student,
      tutor: hiredTutor._id,
      application: hire._id,
      tuition: t._id,
      studentEmail: t.studentEmail,
      tutorEmail: hiredTutor.email,
      studentName: owner.displayName,
      tutorName: hiredTutor.displayName,
      tuitionSubject: t.subject,
      tuitionTitle: t.title,
      amount: hire.expectedSalary,
      platformFeePercent: FEE_PERCENT,
      platformFee,
      netAmount,
      currency: 'bdt',
      status: 'paid',
      paidAt: hire.decidedAt,
      isDemo: true,
      createdAt: hire.decidedAt,
      updatedAt: hire.decidedAt,
    });

    // Most hires are reviewed; the demo student keeps one open so the review flow can be tried.
    const isDemoStudent = t.student.equals(demo.Student._id);
    if (isDemoStudent) demoStudentHires += 1;
    const shouldReview = isDemoStudent ? demoStudentHires === 1 : rng.chance(0.85);
    if (shouldReview) {
      const [rating, comment] = rng.pick(REVIEW_COMMENTS);
      hire.reviewed = true;
      reviews.push({
        _id: oid(`review:${hire._id}`),
        tutor: hiredTutor._id,
        student: t.student,
        application: hire._id,
        rating,
        comment,
        studentName: owner.displayName,
        studentPhoto: owner.photoURL,
        tuitionSubject: t.subject,
        isDemo: true,
        createdAt: addDays(hire.decidedAt, 14 + rng.int(0, 16)),
        updatedAt: addDays(hire.decidedAt, 14 + rng.int(0, 16)),
      });
    }
  }

  /* ── Denormalised tutor aggregates ───────────────────────────────── */
  for (const tutor of tutors) {
    const mine = reviews.filter((r) => r.tutor.equals(tutor._id));
    tutor.ratingCount = mine.length;
    tutor.ratingAvg = mine.length ? Math.round((mine.reduce((s, r) => s + r.rating, 0) / mine.length) * 10) / 10 : 0;
    tutor.hiredCount = payments.filter((p) => p.tutor.equals(tutor._id)).length;
  }

  /* ── Bookmarks ───────────────────────────────────────────────────── */
  const open = tuitions.filter((t) => t.status === 'Approved');
  const bookmarks = [
    ...open.filter((t) => !demo.Tutor.subjects.includes(t.subject)).slice(0, 2),
    ...open.filter((t) => demo.Tutor.subjects.includes(t.subject)).slice(0, 2),
  ].map((t, i) => ({ _id: oid(`bookmark:tutor:${t._index}`), user: demo.Tutor._id, tuition: t._id, createdAt: daysAgo(i) }));
  open
    .filter((t) => !t.student.equals(demo.Student._id))
    .slice(3, 5)
    .forEach((t, i) => bookmarks.push({ _id: oid(`bookmark:student:${t._index}`), user: demo.Student._id, tuition: t._id, createdAt: daysAgo(i + 1) }));

  /* ── Notifications for the demo accounts ─────────────────────────── */
  const notifications = [];
  const note = (key, recipient, type, message, link, createdAt, read) =>
    notifications.push({ _id: oid(`notification:${key}`), recipient, type, message, link, read, createdAt });

  applications
    .filter((a) => a.student.equals(demo.Student._id))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5)
    .forEach((a, i) =>
      a.status === 'Approved'
        ? note(`s-hire-${i}`, demo.Student._id, 'hire_confirmed', `Payment received. ${a.tutorName} is now your ${a.tuitionSubject} tutor.`, '/dashboard/applied-tutors', a.decidedAt, true)
        : note(`s-app-${i}`, demo.Student._id, 'new_application', `${a.tutorName} applied to your ${a.tuitionSubject} tuition.`, '/dashboard/applied-tutors', a.createdAt, i > 1),
    );
  tuitions
    .filter((t) => t.student.equals(demo.Student._id) && t.approvedAt)
    .forEach((t) =>
      note(`s-live-${t._index}`, demo.Student._id, 'tuition_approved', `Your tuition “${t.title}” is now live and visible to tutors.`, '/dashboard/my-posts', t.approvedAt, true),
    );

  applications
    .filter((a) => a.tutor.equals(demo.Tutor._id) && a.status === 'Approved')
    .forEach((a, i) =>
      note(`t-paid-${i}`, demo.Tutor._id, 'payment_confirmed', `You were hired for “${a.tuitionTitle}”. The student’s contact details are now available.`, '/dashboard/ongoing-tuitions', a.decidedAt, i > 0),
    );
  reviews
    .filter((r) => r.tutor.equals(demo.Tutor._id))
    .forEach((r, i) => note(`t-review-${i}`, demo.Tutor._id, 'new_review', `${r.studentName} left you a ${r.rating}-star review.`, '/dashboard/profile', r.createdAt, i > 0));
  note('t-verified', demo.Tutor._id, 'verified', 'Your tutor profile is verified. The badge now shows on your profile.', '/dashboard/profile', demo.Tutor.verifiedAt, true);

  tuitions
    .filter((t) => t.status === 'Pending')
    .forEach((t) => note(`a-pending-${t._index}`, demo.Admin._id, 'tuition_submitted', `New tuition “${t.title}” is waiting for review.`, '/dashboard/admin/tuitions', t.createdAt, false));

  /* ── Contact messages ────────────────────────────────────────────── */
  const contacts = CONTACT_MESSAGES.map(([name, email, subject, message, status], i) => ({
    _id: oid(`contact:${i}`),
    name,
    email,
    subject,
    message,
    status,
    createdAt: daysAgo(i * 3 + 1, 4),
    updatedAt: daysAgo(i * 3 + 1, 4),
  }));

  /* ── Live chats ─────────────────────────────────────────────────── */
  const chatSessions = [];
  const chatMessages = [];
  CHATS.forEach(([name, phone, status, thread], i) => {
    const startedAt = daysAgo(i * 2, 3 + i);
    const sessionId = oid(`chat:${i}`);
    const at = (minutes) => new Date(startedAt.getTime() + minutes * 60_000);
    const messages = [['admin', 'Hi! Thanks for reaching out to Edurock. A member of our team will reply here shortly.', 0], ...thread].map(([sender, body, minutes], k) => ({
      _id: oid(`chat:${i}:${k}`),
      session: sessionId,
      sender,
      senderName: sender === 'admin' ? 'Ayesha' : name,
      body,
      isDemo: true,
      createdAt: at(minutes),
    }));
    const last = messages[messages.length - 1];
    chatMessages.push(...messages);
    chatSessions.push({
      _id: sessionId,
      name,
      phone,
      // Demo visitors never receive a token; the hash only satisfies the unique index.
      tokenHash: createHash('sha256').update(`seed-chat-${i}`).digest('hex'),
      status,
      lastMessage: last.body,
      lastMessageAt: last.createdAt,
      lastSender: last.sender,
      unreadForAdmin: status === 'open' && last.sender === 'visitor' ? 1 : 0,
      unreadForVisitor: 0,
      page: '/tuitions',
      user: null,
      isDemo: true,
      createdAt: startedAt,
      updatedAt: last.createdAt,
    });
  });

  // Strip build-only helpers.
  users.forEach((u) => delete u.key);
  tuitions.forEach((t) => delete t._index);

  return { users, tuitions, applications, payments, reviews, bookmarks, notifications, contacts, chatSessions, chatMessages, demo };
}
