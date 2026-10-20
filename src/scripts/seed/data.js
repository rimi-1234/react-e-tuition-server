/**
 * Hand-written source data for the Edurock demo marketplace.
 * Every photo URL below was checked to exist and to match the person's gender.
 */
const photo = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=320&h=320&q=80`;

export const PHOTOS_FEMALE = [
  '1573496359142-b8d87734a5a2', '1580489944761-15a19d654956', '1594744803329-e58b31de8bf5', '1438761681033-6461ffad8d80',
  '1534528741775-53994a69daeb', '1494790108377-be9c29b29330', '1517841905240-472988babdf9', '1531123897727-8f129e1688ce',
  '1529626455594-4ff0802cfb7e', '1554151228-14d9def656e4', '1508214751196-bcfd4ca60f91', '1544005313-94ddf0286df2',
  '1488426862026-3ee34a7d66df', '1567532939604-b6b5b0db2604', '1607746882042-944635dfe10e',
].map(photo);

export const PHOTOS_MALE = [
  '1560250097-0b93528c311a', '1472099645785-5658abf4ff4e', '1507003211169-0a1dd7228f2d', '1539571696357-5a69c17a67c6',
  '1463453091185-61582044d556', '1547425260-76bcadfb4f2c', '1552058544-f2b08422138a', '1618077360395-f3068be8e001',
  '1504257432389-52343af06ae3', '1506794778202-cad84cf45f1d', '1519085360753-af0119f7cbe7', '1599566150163-29194dcaad36',
].map(photo);

export const avatar = (name) => `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=5B5BF0&color=fff&size=256&bold=true`;

/* ── Demo accounts (signed in through the "Try a demo" buttons) ─────── */
export const DEMO_ACCOUNTS = [
  { key: 'demo-student', email: 'demo.student@etuition.com', displayName: 'Rafi Ahmed', role: 'Student', gender: 'Male', photoURL: PHOTOS_MALE[2], location: 'Dhanmondi, Dhaka', phone: '01711-000001' },
  {
    key: 'demo-tutor',
    email: 'demo.tutor@etuition.com',
    displayName: 'Farhana Islam',
    role: 'Tutor',
    gender: 'Female',
    photoURL: PHOTOS_FEMALE[0],
    location: 'Mirpur, Dhaka',
    phone: '01711-000002',
    subjects: ['Mathematics', 'Physics', 'Higher Math'],
    experienceYears: 5,
    qualification: 'M.Sc in Applied Mathematics',
    institution: 'University of Dhaka',
    expectedSalary: 7000,
    teachingMode: 'Both',
    verified: true,
    bio: 'I make maths feel obvious. Five years helping SSC and HSC students go from “I hate algebra” to A+, with short weekly progress notes for parents and plenty of past-paper practice before boards.',
  },
  { key: 'demo-admin', email: 'demo.admin@etuition.com', displayName: 'Ayesha Rahman', role: 'Admin', gender: 'Female', photoURL: PHOTOS_FEMALE[1], location: 'Gulshan, Dhaka', phone: '01711-000003' },
];

/* ── Tutors ────────────────────────────────────────────────────────── */
// [name, gender, subjects, years, qualification, institution, area, rate, mode, verified]
export const TUTORS = [
  ['Tanvir Hasan', 'Male', ['Physics', 'Chemistry', 'Engineering Admission'], 6, 'B.Sc in Electrical & Electronic Engineering', 'BUET', 'Uttara, Dhaka', 8000, 'Home Visit', true],
  ['Nusrat Jahan', 'Female', ['English', 'IELTS'], 4, 'BA (Hons) in English Literature', 'Jahangirnagar University', 'Savar, Dhaka', 6500, 'Online', true],
  ['Mahmudul Karim', 'Male', ['Mathematics', 'ICT', 'Programming'], 8, 'M.Sc in Computer Science', 'University of Dhaka', 'Mohammadpur, Dhaka', 9000, 'Both', true],
  ['Sadia Afrin', 'Female', ['Biology', 'Chemistry', 'Medical Admission'], 3, 'MBBS (Final year)', 'Dhaka Medical College', 'Shahbag, Dhaka', 8500, 'Home Visit', true],
  ['Arif Chowdhury', 'Male', ['Accounting', 'Economics', 'Finance'], 7, 'BBA in Accounting & Information Systems', 'IBA, University of Dhaka', 'Agrabad, Chattogram', 7000, 'Both', true],
  ['Tasnim Ferdous', 'Female', ['Bangla', 'English', 'General Science'], 2, 'BA in Bangla Language & Literature', 'University of Rajshahi', 'Shaheb Bazar, Rajshahi', 4500, 'Online', false],
  ['Imran Hossain', 'Male', ['Higher Math', 'Physics', 'Mathematics'], 10, 'M.Sc in Physics', 'Shahjalal University of Science & Technology', 'Zindabazar, Sylhet', 12000, 'Home Visit', true],
  ['Maliha Sultana', 'Female', ['O Level Maths', 'A Level Physics', 'Mathematics'], 5, 'B.Sc in Physics', 'North South University', 'Banani, Dhaka', 15000, 'Both', true],
  ['Rashed Kabir', 'Male', ['ICT', 'Programming', 'Mathematics'], 4, 'B.Sc in Computer Science & Engineering', 'BRAC University', 'Badda, Dhaka', 8000, 'Online', false],
  ['Lamia Haque', 'Female', ['Chemistry', 'Biology'], 5, 'M.Sc in Biochemistry', 'University of Dhaka', 'Lalmatia, Dhaka', 7500, 'Home Visit', true],
  ['Sabbir Rahman', 'Male', ['Mathematics', 'Higher Math', 'Physics'], 3, 'B.Sc in Mechanical Engineering', 'KUET', 'Sonadanga, Khulna', 6000, 'Both', false],
  ['Anika Tabassum', 'Female', ['English', 'O Level English', 'A Level English'], 6, 'MA in English (Applied Linguistics)', 'East West University', 'Bashundhara, Dhaka', 11000, 'Both', true],
  ['Kamrul Islam', 'Male', ['Bangla', 'Bangladesh & Global Studies', 'English'], 12, 'MA in Bangla', 'University of Chittagong', 'Khulshi, Chattogram', 6000, 'Home Visit', true],
  ['Nabila Chowdhury', 'Female', ['A Level Chemistry', 'A Level Biology', 'Chemistry'], 4, 'B.Pharm', 'University of Dhaka', 'Gulshan, Dhaka', 14000, 'Home Visit', true],
  ['Fahim Ahmed', 'Male', ['Statistics', 'Mathematics', 'Calculus'], 5, 'M.S. in Applied Statistics', 'University of Dhaka', 'Azimpur, Dhaka', 8000, 'Online', true],
  ['Sharmin Akter', 'Female', ['General Science', 'Mathematics', 'English'], 9, 'B.Ed & M.Sc in Mathematics', 'Govt. Teachers’ Training College', 'Mirpur, Dhaka', 5000, 'Home Visit', true],
  ['Zubair Hossain', 'Male', ['Physics', 'Engineering Admission', 'Higher Math'], 6, 'B.Sc in Civil Engineering', 'BUET', 'Dhanmondi, Dhaka', 10000, 'Both', true],
  ['Mehjabin Rahman', 'Female', ['IELTS', 'English'], 7, 'MA in TESOL', 'BRAC University', 'Online', 9500, 'Online', true],
  ['Rakibul Hasan', 'Male', ['Accounting', 'Business Studies', 'Economics'], 3, 'BBA in Finance', 'University of Chittagong', 'GEC, Chattogram', 5000, 'Home Visit', false],
  ['Farzana Yasmin', 'Female', ['Biology', 'Medical Admission', 'Chemistry'], 6, 'MBBS', 'Sir Salimullah Medical College', 'Wari, Dhaka', 10000, 'Both', true],
  ['Tahmid Anwar', 'Male', ['O Level Maths', 'A Level Maths', 'Calculus'], 5, 'B.Sc in Mathematics', 'Independent University, Bangladesh', 'Baridhara, Dhaka', 13000, 'Home Visit', true],
  ['Rumana Parvin', 'Female', ['Bangla', 'General Science'], 4, 'BA in Education', 'National University', 'Uttara, Dhaka', 4500, 'Home Visit', false],
  ['Nayeem Khan', 'Male', ['Programming', 'ICT'], 4, 'B.Sc in Software Engineering', 'IUT', 'Gazipur', 7000, 'Online', true],
  ['Sumaiya Hoque', 'Female', ['Mathematics', 'Physics', 'Chemistry'], 2, 'B.Sc in Applied Physics (3rd year)', 'University of Dhaka', 'Mohammadpur, Dhaka', 5000, 'Both', false],
];

/* ── Students / parents ────────────────────────────────────────────── */
export const STUDENTS = [
  ['Nabila Akter', 'Female', 'Bashundhara, Dhaka'],
  ['Shafin Rahman', 'Male', 'Khulshi, Chattogram'],
  ['Mithila Das', 'Female', 'Mirpur, Dhaka'],
  ['Rezaul Karim', 'Male', 'Uttara, Dhaka'],
  ['Tahsin Ara', 'Female', 'Gulshan, Dhaka'],
  ['Abir Hasan', 'Male', 'Zindabazar, Sylhet'],
  ['Farhan Kabir', 'Male', 'Banani, Dhaka'],
  ['Sanjida Islam', 'Female', 'Mohammadpur, Dhaka'],
  ['Mahin Chowdhury', 'Male', 'Agrabad, Chattogram'],
  ['Priya Saha', 'Female', 'Shaheb Bazar, Rajshahi'],
  ['Ishraq Ahmed', 'Male', 'Dhanmondi, Dhaka'],
];

/* ── Tuition request templates ─────────────────────────────────────── */
// [title, subject, classLevel, minBudget, maxBudget, schedule, mode, experienceNeeded]
export const TUITION_TEMPLATES = [
  ['SSC Mathematics tutor for board preparation', 'Mathematics', 'SSC', 5000, 8000, '4 days/week, evenings', 'Home Visit', 'Graduate'],
  ['HSC Physics: mechanics and thermodynamics', 'Physics', 'HSC', 7000, 10000, '3 days/week', 'Both', 'Graduate'],
  ['IELTS speaking and writing coach (target band 7.5)', 'IELTS', 'University', 8000, 12000, 'Weekends, 2 hours', 'Online', 'Professional'],
  ['Class 8 English grammar and composition', 'English', 'Class 8', 3500, 5500, '3 days/week', 'Home Visit', 'Any'],
  ['O Level Additional Maths (Cambridge)', 'O Level Maths', 'O Level', 12000, 16000, '2 days/week', 'Home Visit', 'Professional'],
  ['HSC Accounting: full syllabus with past papers', 'Accounting', 'HSC', 5000, 7500, '3 days/week', 'Both', 'Graduate'],
  ['Class 6 all subjects (Bangla medium)', 'General Science', 'Class 6', 4000, 6000, '5 days/week', 'Home Visit', 'Any'],
  ['Medical admission Biology crash course', 'Medical Admission', 'Admission', 9000, 14000, 'Daily, 1.5 hours', 'Online', 'Professional'],
  ['Python basics for a curious Class 9 student', 'Programming', 'Class 9', 5000, 7000, '2 days/week', 'Online', 'Any'],
  ['A Level Physics paper 4 practice', 'A Level Physics', 'A Level', 14000, 18000, '2 days/week', 'Both', 'Professional'],
  ['HSC Chemistry with focus on organic chemistry', 'Chemistry', 'HSC', 6000, 9000, '3 days/week', 'Home Visit', 'Graduate'],
  ['SSC Higher Math: vectors and trigonometry', 'Higher Math', 'SSC', 5500, 8000, '4 days/week', 'Home Visit', 'Graduate'],
  ['Class 9 ICT and basic computing', 'ICT', 'Class 9', 3500, 5000, '2 days/week', 'Both', 'Undergraduate'],
  ['University Economics 101 support', 'Economics', 'University', 4500, 6500, 'Flexible', 'Online', 'Graduate'],
  ['Bangla literature and grammar for SSC', 'Bangla', 'SSC', 3500, 5000, '3 days/week', 'Home Visit', 'Any'],
  ['Engineering admission Physics & Math (BUET prep)', 'Engineering Admission', 'Admission', 10000, 15000, '5 days/week', 'Both', 'Professional'],
  ['Class 7 Mathematics and Science', 'Mathematics', 'Class 7', 3500, 5000, '4 days/week', 'Home Visit', 'Undergraduate'],
  ['A Level Chemistry (Edexcel) revision', 'A Level Chemistry', 'A Level', 13000, 17000, '2 days/week', 'Home Visit', 'Professional'],
  ['HSC Biology: botany and zoology', 'Biology', 'HSC', 6000, 9000, '3 days/week', 'Both', 'Graduate'],
  ['Spoken English for a Class 5 student', 'English', 'Class 1-5', 3000, 4500, '3 days/week', 'Home Visit', 'Any'],
  ['University Statistics & probability help', 'Statistics', 'University', 6000, 9000, 'Weekends', 'Online', 'Graduate'],
  ['O Level English Language essay writing', 'O Level English', 'O Level', 10000, 14000, '2 days/week', 'Online', 'Professional'],
  ['Class 10 Physics and Chemistry (SSC)', 'Physics', 'SSC', 5000, 7500, '4 days/week', 'Home Visit', 'Graduate'],
  ['HSC Higher Math: calculus foundations', 'Higher Math', 'HSC', 7000, 10000, '3 days/week', 'Both', 'Graduate'],
];

export const DESCRIPTIONS = [
  'The student understands the basics but struggles with problem solving under time pressure. We would like regular practice with past board questions and a short weekly update on progress.',
  'Looking for a patient, well-organised tutor who can rebuild fundamentals first and then move on to exam-style questions. Punctuality and clear communication with parents are important to us.',
  'Exams are about four months away. We need a structured plan covering the full syllabus, with mock tests every two weeks and feedback on weak chapters.',
  'Our child learns best with real-life examples and plenty of encouragement. Please mention your teaching approach and the days you are available when you apply.',
  'We prefer a tutor who has taught this syllabus before and can share notes and practice sheets. Homework support between classes would be a big plus.',
];

export const REVIEW_COMMENTS = [
  [5, 'Explains concepts with real-life examples. My son’s marks went from B to A+ in one term.'],
  [5, 'Very punctual and well prepared. Sends a short progress note after every class.'],
  [5, 'Patient and encouraging. My daughter actually looks forward to physics now.'],
  [5, 'Clear structure and lots of past-paper practice. Highly recommended for board exams.'],
  [4, 'Friendly but strict about homework, which is exactly what we needed.'],
  [5, 'Made organic chemistry finally make sense. Worth every taka.'],
  [4, 'Good teacher. Occasionally rescheduled, but always made up the missed class.'],
  [5, 'Helped me get a 7.5 in IELTS in eight weeks. Mock speaking tests were gold.'],
  [5, 'Knows the admission question patterns inside out. My confidence is so much better.'],
  [4, 'Strong on theory, very responsive on WhatsApp for doubts.'],
  [5, 'Our son was afraid of maths. Three months later he asks for extra problems!'],
  [3, 'Knowledgeable, though the pace was a bit fast for us at first. Improved after we discussed it.'],
];

export const CONTACT_MESSAGES = [
  ['Rumana Hossain', 'rumana.h@example.com', 'Can I hire two tutors for one child?', 'My daughter needs help with both Physics and Chemistry. Can I post two separate tuitions or should I combine them?', 'new'],
  ['Asif Iqbal', 'asif.iqbal@example.com', 'Verification documents', 'I have uploaded my certificates. How long does verification usually take?', 'new'],
  ['Shirin Akhter', 'shirin.a@example.com', 'Refund question', 'If the tutor stops coming after the first week, what happens to my payment?', 'read'],
  ['Mostafa Kamal', 'm.kamal@example.com', 'Tutoring in Khulna', 'Do you have tutors available in Khulna for O Levels?', 'new'],
  ['Ritu Barua', 'ritu.b@example.com', 'Thank you!', 'Just wanted to say thanks, we found a wonderful Biology tutor within a day.', 'archived'],
  ['Hasib Rahman', 'hasib.r@example.com', 'Changing my role', 'I signed up as a student but I would also like to teach. How can I switch?', 'read'],
];

/* ── Live chat conversations (admin inbox demo) ────────────────────── */
// [name, phone, status, [[sender, body, minutesAfterStart], ...]]
export const CHATS = [
  ['Rina Akter', '01711-223344', 'open', [
    ['visitor', 'Hi! Do you have Physics tutors for Class 9 in Mirpur?', 1],
    ['admin', 'Hello Rina! Yes, we have several verified Physics tutors in Mirpur. Would you prefer home visits or online?', 6],
    ['visitor', 'Home visits, 3 days a week if possible.', 9],
  ]],
  ['Kamal Uddin', '01819-554433', 'open', [
    ['visitor', 'How does payment work? Do I pay the tutor directly?', 2],
  ]],
  ['Tania Sultana', '01912-778899', 'closed', [
    ['visitor', 'Can I change the tutor after the first month?', 1],
    ['admin', 'Of course. Just post a new tuition or message us and we will help you find another tutor.', 12],
    ['visitor', 'Great, thank you!', 15],
  ]],
];
