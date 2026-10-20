import { APPLICATION_STATUS, NOTIFICATION_TYPES } from '../config/constants.js';
import { Application, Review, User } from '../models/index.js';
import { serialize } from '../models/plugins.js';
import { ApiError } from '../utils/ApiError.js';
import { compact, pageMeta } from '../utils/query.js';
import { NS, cache } from './cache.service.js';
import { notify } from './notification.service.js';

/** Recomputes the denormalised rating on the tutor document. */
async function refreshTutorRating(tutorId) {
  const [agg] = await Review.aggregate([
    { $match: { tutor: tutorId } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await User.updateOne(
    { _id: tutorId },
    { $set: { ratingAvg: agg ? Math.round(agg.avg * 10) / 10 : 0, ratingCount: agg?.count || 0 } },
  );
}

export async function create(student, { applicationId, rating, comment }) {
  const application = await Application.findById(applicationId);
  if (!application) throw ApiError.notFound('Booking');
  if (String(application.student) !== String(student._id)) throw ApiError.forbidden('You can only review tutors you hired');
  if (application.status !== APPLICATION_STATUS.APPROVED) throw ApiError.conflict('You can review a tutor after hiring them');
  if (application.reviewed) throw ApiError.conflict('You have already reviewed this booking');

  const review = await Review.create({
    tutor: application.tutor,
    student: student._id,
    application: application._id,
    rating,
    comment,
    studentName: student.displayName || 'Student',
    studentPhoto: student.photoURL || '',
    tuitionSubject: application.tuitionSubject,
  });

  application.reviewed = true;
  await application.save();
  await refreshTutorRating(application.tutor);
  cache.invalidate(NS.TUTORS, NS.REVIEWS, NS.STATS);

  notify(application.tutor, NOTIFICATION_TYPES.NEW_REVIEW, `${review.studentName} left you a ${rating}-star review.`, '/profile');
  return review.toJSON();
}

/** With a tutorId: that tutor's reviews. Without: recent highly rated reviews (testimonials). */
export async function list({ tutorId, page, limit }) {
  const filter = tutorId ? { tutor: tutorId } : { rating: { $gte: 4 }, comment: { $ne: '' } };
  const [items, total] = await Promise.all([
    Review.find(compact(filter))
      .populate({ path: 'tutor', select: 'displayName photoURL subjects' })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Review.countDocuments(compact(filter)),
  ]);
  return { items: serialize(items), meta: pageMeta({ page, limit, total }) };
}
