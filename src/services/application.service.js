import { APPLICATION_STATUS, NOTIFICATION_TYPES, TUITION_STATUS } from '../config/constants.js';
import { Application, Tuition } from '../models/index.js';
import { serialize } from '../models/plugins.js';
import { ApiError } from '../utils/ApiError.js';
import { compact, pageMeta } from '../utils/query.js';
import { NS, cache } from './cache.service.js';
import { notify } from './notification.service.js';

const TUITION_SUMMARY = 'title subject classLevel location budget schedule teachingMode status';
const TUTOR_SUMMARY =
  'displayName photoURL email phone subjects experienceYears qualification institution verified ratingAvg ratingCount hiredCount location';
const STUDENT_CONTACT = 'displayName photoURL email phone location';

async function paginate(filter, { page, limit }, populate = []) {
  let q = Application.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  for (const p of populate) q = q.populate(p);
  const [items, total] = await Promise.all([q.lean(), Application.countDocuments(filter)]);
  return { items: serialize(items), meta: pageMeta({ page, limit, total }) };
}

export async function apply(tutor, { tuitionId, ...body }) {
  const tuition = await Tuition.findById(tuitionId).lean();
  if (!tuition) throw ApiError.notFound('Tuition');
  if (tuition.status !== TUITION_STATUS.APPROVED) throw ApiError.conflict('This tuition is not accepting applications');
  if (String(tuition.student) === String(tutor._id)) throw ApiError.badRequest('You cannot apply to your own tuition');

  const exists = await Application.exists({ tuition: tuitionId, tutor: tutor._id });
  if (exists) throw ApiError.conflict('You have already applied to this tuition');

  const application = await Application.create({
    ...body,
    tuition: tuition._id,
    tutor: tutor._id,
    student: tuition.student,
    tuitionTitle: tuition.title,
    tuitionSubject: tuition.subject,
    tuitionLocation: tuition.location,
    tutorName: tutor.displayName,
    tutorPhoto: tutor.photoURL,
    tutorEmail: tutor.email,
    studentEmail: tuition.studentEmail,
  });

  await Tuition.updateOne({ _id: tuition._id }, { $inc: { applicationsCount: 1 } });
  cache.invalidate(NS.TUITIONS);

  notify(
    tuition.student,
    NOTIFICATION_TYPES.NEW_APPLICATION,
    `${tutor.displayName || 'A tutor'} applied to your ${tuition.subject} tuition.`,
    '/dashboard/applied-tutors',
  );
  return application.toJSON();
}

export const listMine = (tutor, query) =>
  paginate(compact({ tutor: tutor._id, status: query.status, tuition: query.tuitionId }), query, [
    { path: 'tuition', select: TUITION_SUMMARY },
  ]);

export async function listReceived(student, query) {
  const result = await paginate(compact({ student: student._id, status: query.status, tuition: query.tuitionId }), query, [
    { path: 'tutor', select: TUTOR_SUMMARY },
    { path: 'tuition', select: TUITION_SUMMARY },
  ]);
  // Contact details are part of what the student pays for: reveal them only after hiring.
  for (const app of result.items) {
    if (app.status !== APPLICATION_STATUS.APPROVED) {
      delete app.tutorEmail;
      if (app.tutor) {
        delete app.tutor.email;
        delete app.tutor.phone;
      }
    }
  }
  return result;
}

/** Approved (paid) engagements, with the student's contact details revealed to the tutor. */
export const listOngoing = (tutor, query) =>
  paginate({ tutor: tutor._id, status: APPLICATION_STATUS.APPROVED }, query, [
    { path: 'tuition', select: TUITION_SUMMARY },
    { path: 'student', select: STUDENT_CONTACT },
  ]);

/**
 * Admin view of a single tuition: the poster's contact details and every
 * applicant with theirs. Contact information is never exposed publicly.
 */
export async function listForTuition(tuitionId) {
  const tuition = await Tuition.findById(tuitionId)
    .populate({ path: 'student', select: 'displayName email phone photoURL location createdAt' })
    .lean();
  if (!tuition) throw ApiError.notFound('Tuition');

  const items = await Application.find({ tuition: tuitionId })
    .sort({ createdAt: -1 })
    .populate({ path: 'tutor', select: `${TUTOR_SUMMARY} gender teachingMode expectedSalary createdAt` })
    .lean();

  return { tuition: serialize(tuition), items: serialize(items) };
}

export async function checkApplied(tutor, tuitionId) {
  const application = await Application.findOne({ tuition: tuitionId, tutor: tutor._id }).lean();
  return { applied: Boolean(application), application: serialize(application) };
}

async function findOwnedPending(tutor, id) {
  const application = await Application.findById(id);
  if (!application) throw ApiError.notFound('Application');
  if (String(application.tutor) !== String(tutor._id)) throw ApiError.forbidden('You can only manage your own applications');
  if (application.status !== APPLICATION_STATUS.PENDING) {
    throw ApiError.conflict(`This application is already ${application.status.toLowerCase()}`);
  }
  return application;
}

export async function update(tutor, id, body) {
  const application = await findOwnedPending(tutor, id);
  application.set(body);
  await application.save();
  return application.toJSON();
}

export async function withdraw(tutor, id) {
  const application = await findOwnedPending(tutor, id);
  await application.deleteOne();
  await Tuition.updateOne({ _id: application.tuition, applicationsCount: { $gt: 0 } }, { $inc: { applicationsCount: -1 } });
  cache.invalidate(NS.TUITIONS);
}

export async function reject(student, id) {
  const application = await Application.findById(id);
  if (!application) throw ApiError.notFound('Application');
  if (String(application.student) !== String(student._id)) {
    throw ApiError.forbidden('You can only respond to applications on your own tuitions');
  }
  if (application.status !== APPLICATION_STATUS.PENDING) {
    throw ApiError.conflict(`This application is already ${application.status.toLowerCase()}`);
  }
  application.status = APPLICATION_STATUS.REJECTED;
  application.decidedAt = new Date();
  await application.save();

  notify(
    application.tutor,
    NOTIFICATION_TYPES.APPLICATION_REJECTED,
    `Your application for "${application.tuitionTitle}" was declined.`,
    '/dashboard/my-applications',
  );
  return application.toJSON();
}
