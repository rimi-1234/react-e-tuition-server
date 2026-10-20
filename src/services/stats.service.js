import { APPLICATION_STATUS, ROLES, TUITION_STATUS } from '../config/constants.js';
import { Application, Bookmark, Payment, Review, Tuition, User } from '../models/index.js';
import { serialize } from '../models/plugins.js';
import { NS, cache } from './cache.service.js';

const DAY = 86_400_000;

/** Turns [{ _id: 'Approved', count: 3 }] into { Approved: 3, ... } with zeros for missing keys. */
const countsBy = (rows, keys) => Object.fromEntries(keys.map((k) => [k, rows.find((r) => r._id === k)?.count || 0]));

/** Monthly totals for the last `months` months, gaps filled with 0. */
async function monthlySeries(match, field, months = 6) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMonth(start.getUTCMonth() - (months - 1));

  const rows = await Payment.aggregate([
    { $match: { ...match, paidAt: { $gte: start } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paidAt' } }, total: { $sum: `$${field}` }, count: { $sum: 1 } } },
  ]);

  return Array.from({ length: months }, (_, i) => {
    const d = new Date(start);
    d.setUTCMonth(start.getUTCMonth() + i);
    const key = d.toISOString().slice(0, 7);
    const row = rows.find((r) => r._id === key);
    return {
      key,
      label: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
      amount: Math.round(row?.total || 0),
      count: row?.count || 0,
    };
  });
}

export async function studentDashboard(user) {
  const id = user._id;
  const [tuitionStatus, appStatus, spend, savedTuitions, recentPayments, recentApplications, spendingChart] = await Promise.all([
    Tuition.aggregate([{ $match: { student: id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Application.aggregate([{ $match: { student: id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { student: id } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Bookmark.countDocuments({ user: id }),
    Payment.find({ student: id }).sort({ paidAt: -1 }).limit(5).lean(),
    Application.find({ student: id }).sort({ createdAt: -1 }).limit(5).lean(),
    monthlySeries({ student: id }, 'amount'),
  ]);

  const tuitions = countsBy(tuitionStatus, Object.values(TUITION_STATUS));
  const applications = countsBy(appStatus, Object.values(APPLICATION_STATUS));

  return {
    totals: {
      tuitionsPosted: Object.values(tuitions).reduce((a, b) => a + b, 0),
      applicationsReceived: Object.values(applications).reduce((a, b) => a + b, 0),
      pendingApplications: applications.Pending,
      tutorsHired: applications.Approved,
      totalSpent: Math.round(spend[0]?.total || 0),
      savedTuitions,
    },
    tuitionsByStatus: tuitions,
    spendingChart,
    recentPayments: serialize(recentPayments),
    recentApplications: serialize(recentApplications),
  };
}

export async function tutorDashboard(user) {
  const id = user._id;
  const [appStatus, earnings, recentPayments, recentApplications, earningsChart] = await Promise.all([
    Application.aggregate([{ $match: { tutor: id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { tutor: id } }, { $group: { _id: null, net: { $sum: '$netAmount' }, gross: { $sum: '$amount' } } }]),
    Payment.find({ tutor: id }).sort({ paidAt: -1 }).limit(5).lean(),
    Application.find({ tutor: id }).sort({ createdAt: -1 }).limit(5).lean(),
    monthlySeries({ tutor: id }, 'netAmount'),
  ]);

  const applications = countsBy(appStatus, Object.values(APPLICATION_STATUS));
  const decided = applications.Approved + applications.Rejected;

  return {
    totals: {
      totalApplications: applications.Pending + decided,
      pendingApplications: applications.Pending,
      approvedBookings: applications.Approved,
      rejectedApplications: applications.Rejected,
      successRate: decided ? Math.round((applications.Approved / decided) * 100) : 0,
      totalEarned: Math.round(earnings[0]?.net || 0),
      grossEarned: Math.round(earnings[0]?.gross || 0),
      avgRating: user.ratingAvg || 0,
      reviewCount: user.ratingCount || 0,
    },
    applicationsByStatus: applications,
    earningsChart,
    recentPayments: serialize(recentPayments),
    recentApplications: serialize(recentApplications),
  };
}

export async function adminDashboard({ days }) {
  const since = new Date(Date.now() - (days - 1) * DAY);
  since.setUTCHours(0, 0, 0, 0);

  const [roles, tuitionStatus, applicationsTotal, revenue, revenueDaily, signupsDaily, topSubjects, recentTransactions, recentUsers] =
    await Promise.all([
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      Tuition.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Application.estimatedDocumentCount(),
      Payment.aggregate([
        { $group: { _id: null, gross: { $sum: '$amount' }, fees: { $sum: '$platformFee' }, count: { $sum: 1 } } },
      ]),
      Payment.aggregate([
        { $match: { paidAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } },
            revenue: { $sum: '$amount' },
            fees: { $sum: '$platformFee' },
            count: { $sum: 1 },
          },
        },
      ]),
      User.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      ]),
      Tuition.aggregate([
        { $group: { _id: '$subject', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),
      Payment.find().sort({ paidAt: -1 }).limit(8).lean(),
      User.find().sort({ createdAt: -1 }).limit(6).select('displayName email photoURL role createdAt').lean(),
    ]);

  const series = Array.from({ length: days }, (_, i) => {
    const key = new Date(since.getTime() + i * DAY).toISOString().slice(0, 10);
    const r = revenueDaily.find((row) => row._id === key);
    return {
      date: key,
      revenue: Math.round(r?.revenue || 0),
      fees: Math.round(r?.fees || 0),
      transactions: r?.count || 0,
      signups: signupsDaily.find((row) => row._id === key)?.count || 0,
    };
  });

  const usersByRole = countsBy(roles, Object.values(ROLES));
  const tuitionsByStatus = countsBy(tuitionStatus, Object.values(TUITION_STATUS));

  return {
    totals: {
      users: Object.values(usersByRole).reduce((a, b) => a + b, 0),
      students: usersByRole.Student,
      tutors: usersByRole.Tutor,
      tuitions: Object.values(tuitionsByStatus).reduce((a, b) => a + b, 0),
      pendingTuitions: tuitionsByStatus.Pending,
      applications: applicationsTotal,
      grossRevenue: Math.round(revenue[0]?.gross || 0),
      platformEarnings: Math.round(revenue[0]?.fees || 0),
      transactions: revenue[0]?.count || 0,
    },
    usersByRole,
    tuitionsByStatus,
    series,
    topSubjects: topSubjects.map((s) => ({ subject: s._id, count: s.count })),
    recentTransactions: serialize(recentTransactions),
    recentUsers: serialize(recentUsers),
  };
}

/** Headline numbers for the marketing pages. Cached for 5 minutes. */
export const publicStats = () =>
  cache.wrap(
    NS.STATS,
    'public',
    async () => {
      const [tutors, students, openTuitions, booked, rating, subjects] = await Promise.all([
        User.countDocuments({ role: ROLES.TUTOR, isActive: true }),
        User.countDocuments({ role: ROLES.STUDENT }),
        Tuition.countDocuments({ status: TUITION_STATUS.APPROVED }),
        Tuition.countDocuments({ status: TUITION_STATUS.BOOKED }),
        Review.aggregate([{ $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]),
        Tuition.distinct('subject'),
      ]);
      return {
        tutors,
        students,
        openTuitions,
        successfulMatches: booked,
        averageRating: rating[0] ? Math.round(rating[0].avg * 10) / 10 : 0,
        reviews: rating[0]?.count || 0,
        subjects: subjects.length,
      };
    },
    300,
  );

/** Subjects with live tuition + tutor counts, for filters and the subject explorer. */
export const subjects = () =>
  cache.wrap(
    NS.META,
    'subjects',
    async () => {
      const [fromTuitions, fromTutors] = await Promise.all([
        Tuition.aggregate([
          { $match: { status: { $in: [TUITION_STATUS.APPROVED, TUITION_STATUS.BOOKED] } } },
          { $group: { _id: '$subject', count: { $sum: 1 }, avgBudget: { $avg: '$budget' } } },
        ]),
        User.aggregate([
          { $match: { role: ROLES.TUTOR, isActive: true } },
          { $unwind: '$subjects' },
          { $group: { _id: '$subjects', count: { $sum: 1 } } },
        ]),
      ]);
      const map = new Map();
      for (const t of fromTuitions) map.set(t._id, { subject: t._id, tuitions: t.count, tutors: 0, avgBudget: Math.round(t.avgBudget) });
      for (const t of fromTutors) {
        const row = map.get(t._id) || { subject: t._id, tuitions: 0, tutors: 0, avgBudget: 0 };
        row.tutors = t.count;
        map.set(t._id, row);
      }
      return [...map.values()].filter((r) => r.subject).sort((a, b) => b.tuitions + b.tutors - (a.tuitions + a.tutors));
    },
    300,
  );

export const locations = () =>
  cache.wrap(
    NS.META,
    'locations',
    async () => {
      const rows = await Tuition.aggregate([
        { $match: { status: TUITION_STATUS.APPROVED } },
        { $group: { _id: '$location', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 30 },
      ]);
      return rows.map((r) => ({ location: r._id, count: r.count }));
    },
    300,
  );

/** Lightweight role-specific numbers shown on the profile page. */
export async function profileStats(user) {
  if (user.role === ROLES.TUTOR) return (await tutorDashboard(user)).totals;
  if (user.role === ROLES.ADMIN) return (await adminDashboard({ days: 7 })).totals;
  return (await studentDashboard(user)).totals;
}
