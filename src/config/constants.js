/** Domain vocabulary shared by models, validators and services. */

export const ROLES = Object.freeze({
  STUDENT: 'Student',
  TUTOR: 'Tutor',
  ADMIN: 'Admin',
});
export const ROLE_LIST = Object.values(ROLES);
/** Roles a person may pick for themselves at sign-up. Admin is never self-assigned. */
export const SELF_ASSIGNABLE_ROLES = [ROLES.STUDENT, ROLES.TUTOR];

export const TUITION_STATUS = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  BOOKED: 'Booked',
});
export const TUITION_STATUS_LIST = Object.values(TUITION_STATUS);

export const APPLICATION_STATUS = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});
export const APPLICATION_STATUS_LIST = Object.values(APPLICATION_STATUS);

export const PAYMENT_STATUS = Object.freeze({
  PAID: 'paid',
  REFUNDED: 'refunded',
});

export const CLASS_LEVELS = [
  'Class 1-5',
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'SSC',
  'HSC',
  'O Level',
  'A Level',
  'University',
  'Admission',
  'Other',
];

export const TEACHING_MODES = ['Home Visit', 'Online', 'Both'];
export const GENDERS = ['Male', 'Female', 'Other'];
export const TUTOR_PREFERENCES = ['Male', 'Female', 'Any'];
export const EXPERIENCE_LEVELS = ['Undergraduate', 'Graduate', 'Professional', 'Any'];

export const NOTIFICATION_TYPES = Object.freeze({
  NEW_APPLICATION: 'new_application',
  APPLICATION_REJECTED: 'application_rejected',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  HIRE_CONFIRMED: 'hire_confirmed',
  TUITION_APPROVED: 'tuition_approved',
  TUITION_REJECTED: 'tuition_rejected',
  TUITION_SUBMITTED: 'tuition_submitted',
  POSITION_FILLED: 'position_filled',
  CHAT_STARTED: 'chat_started',
  NEW_REVIEW: 'new_review',
  VERIFIED: 'verified',
  ROLE_CHANGED: 'role_changed',
});

export const DEMO_ACCOUNTS = Object.freeze({
  Student: 'demo.student@etuition.com',
  Tutor: 'demo.tutor@etuition.com',
  Admin: 'demo.admin@etuition.com',
});

/** Stripe refuses charges below roughly 0.50 USD; 60 BDT clears that floor. */
export const MIN_CHARGE_AMOUNT = 60;
