import mongoose from 'mongoose';
import { ROLES } from '../config/constants.js';
import { PUBLIC_TUTOR_FIELDS, Review, User } from '../models/index.js';
import { serialize } from '../models/plugins.js';
import { TUTOR_SORTS } from '../validators/misc.validator.js';
import { ApiError } from '../utils/ApiError.js';
import { compact, contains, pageMeta } from '../utils/query.js';

const baseFilter = { role: ROLES.TUTOR, isActive: true };

export async function list({ search, subject, location, teachingMode, verified, sort, page, limit }) {
  const filter = {
    ...baseFilter,
    ...compact({
      subjects: subject ? contains(subject) : undefined,
      location: contains(location),
      teachingMode: teachingMode && teachingMode !== 'Both' ? { $in: [teachingMode, 'Both'] } : teachingMode,
      verified: verified === undefined ? undefined : verified,
    }),
  };
  if (search) {
    const rx = contains(search);
    filter.$or = [{ displayName: rx }, { subjects: rx }, { qualification: rx }, { institution: rx }, { location: rx }];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .select(PUBLIC_TUTOR_FIELDS)
      .sort({ ...(TUTOR_SORTS[sort] || TUTOR_SORTS.rating), _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  return { items: serialize(items), meta: pageMeta({ page, limit, total }) };
}

export async function featured(limit) {
  const items = await User.find(baseFilter)
    .select(PUBLIC_TUTOR_FIELDS)
    .sort({ verified: -1, ratingAvg: -1, hiredCount: -1, createdAt: -1 })
    .limit(limit)
    .lean();
  return serialize(items);
}

export async function getById(id) {
  const tutor = await User.findOne({ _id: id, ...baseFilter }).select(PUBLIC_TUTOR_FIELDS).lean();
  if (!tutor) throw ApiError.notFound('Tutor');

  const [reviews, breakdown] = await Promise.all([
    Review.find({ tutor: id }).sort({ createdAt: -1 }).limit(10).lean(),
    Review.aggregate([
      { $match: { tutor: new mongoose.Types.ObjectId(String(id)) } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
  ]);

  const ratingBreakdown = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: breakdown.find((b) => b._id === stars)?.count || 0,
  }));

  return { ...serialize(tutor), reviews: serialize(reviews), ratingBreakdown };
}
