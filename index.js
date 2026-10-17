// server.js (eTuitionBD)
// Node.js on Windows sometimes fails to resolve MongoDB Atlas SRV records via
// the system DNS resolver. Force c-ares to use Google DNS so SRV lookups work.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const crypto = require('crypto');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 3000;

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

function initFirebaseAdmin() {
  if (admin.apps.length) return;
  const raw = process.env.FB_SERVICE_KEY;
  if (!raw) {
    console.warn('FB_SERVICE_KEY is not set. Protected routes will reject requests until it is configured.');
    return;
  }
  try {
    const json = raw.trim().startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(json);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error.message);
  }
}

initFirebaseAdmin();

app.use(express.json());

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://react-e-tution-session-client.vercel.app',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  })
);

app.get('/health', (_req, res) => {
  res.send({ ok: true, service: 'eTuitionBD API' });
});

const uri = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.dw7x2dn.mongodb.net/?appName=Cluster0`;
// MongoDB connection

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// // Utility: generate a short booking id
// function generateBookingId() {
//   const prefix = "ETU"; // eTuition prefix
//   const date = new Date().toISOString().slice(0,10).replace(/-/g, "");
//   const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
//   return `${prefix}-${date}-${rand}`;
// }

// Firebase token verification middleware
const verifyFBToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;


  if (!authHeader) return res.status(401).send({ message: 'unauthorized access' });
  if (!admin.apps.length) return res.status(503).send({ message: 'Auth service is not configured' });
  try {
    const idToken = authHeader.split(' ')[1];


    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    req.decoded_uid = decoded.uid;
    next();
  } catch (err) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
};

async function run() {
  try {
    // await client.connect();
    const db = client.db('etuition_db');
    const usersCollection = db.collection('users');           // students/tutors/admin
    const tuitionsCollection = db.collection('tuitions');   // tuition posts
    const applicationsCollection = db.collection('applications');
    const tutorsCollection = db.collection('tutors');
    const paymentsCollection = db.collection('payments');
    const notificationsCollection = db.collection('notifications');
    const bookmarksCollection = db.collection('bookmarks');
    const reviewsCollection = db.collection('reviews');
    const withdrawalsCollection = db.collection('withdrawals');

    // ─── Platform business model ───────────────────────────────────────────
    // The platform keeps PLATFORM_FEE_PERCENT % of every payment as its
    // commission.  The tutor receives the remaining netAmount.
    // Both figures are stored on every payment document so any query can
    // compute revenue without re-deriving it.
    const PLATFORM_FEE_PERCENT = 10;

    // Role check middleware (requires verifyFBToken first)
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const user = await usersCollection.findOne({ email });
      if (!user || user.role !== 'Admin') return res.status(403).send({ message: 'forbidden access' });
      next();
    };

    const verifyStudent = async (req, res, next) => {
      const email = req.decoded_email;
      const user  = await usersCollection.findOne({ email });
      // Use the same default as the role API: treat a missing/null role as 'Student'
      const role = user?.role || 'Student';
      if (!user || role !== 'Student') {
        return res.status(403).send({ message: 'Forbidden: Students only' });
      }
      req.user = user;
      next();
    };

    const verifyTutor = async (req, res, next) => {
      const email = req.decoded_email;
      const user = await usersCollection.findOne({ email });
      if (!user || user.role !== 'Tutor') return res.status(403).send({ message: 'forbidden access' });
      req.user = user;
      next();
    };

    // Helper: create a notification for a user
    const createNotification = async (recipientEmail, type, message, link = null) => {
      try {
        await notificationsCollection.insertOne({
          recipientEmail,
          type,        // e.g. 'new_application', 'payment_confirmed', 'tuition_approved'
          message,
          link,
          read: false,
          createdAt: new Date()
        });
      } catch (err) {
        console.error('Failed to create notification:', err.message);
      }
    };

    // Logging helper
    // const log = async (type, payload) => {
    //   await logsCollection.insertOne({ type, payload, createdAt: new Date() });
    // };

    /* -------------------------
       User routes
    -------------------------*/
    // get users (admin)
    app.get('/users', verifyFBToken, verifyAdmin, async (req, res) => {
      const searchText = req.query.searchText;
      const query = {};
      if (searchText) {
        query.$or = [
          { name: { $regex: searchText, $options: 'i' } },
          { email: { $regex: searchText, $options: 'i' } }
        ];
      }
      const users = await usersCollection.find(query).sort({ createdAt: -1 }).toArray();
      res.send(users);
    });

    // GET /users/:email/role — returns the role for the authenticated user.
    // Protected: the caller must send their Firebase ID token; the email in
    // the URL must match the email inside the verified token (prevents IDOR).
    app.get('/users/:email/role', verifyFBToken, async (req, res) => {
      try {
        const emailParam = req.params.email;

        // Security: token email must match the requested email
        if (emailParam !== req.decoded_email) {
          return res.status(403).send({ message: 'Forbidden' });
        }

        const user = await usersCollection.findOne({ email: emailParam });
        if (!user) return res.status(404).send({ message: 'User not found' });

        res.send({ role: user.role || 'Student' });
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    // create or upsert user (called from frontend after firebase login)

    app.post("/users", async (req, res) => {
      try {
        const { email, displayName, photoURL, role, phone } = req.body;

        if (!email) return res.status(400).json({ message: 'Email is required' });

        // Upsert: if the user already exists, update display fields but
        // NEVER overwrite their existing role (protects against role downgrade).
        // If they are new, set role to the provided value or default 'Student'.
        const existing = await usersCollection.findOne({ email });

        if (existing) {
          // Update profile info; also set role if it's missing (migration fix)
          const updateFields = { displayName, photoURL, updatedAt: new Date() };
          if (!existing.role) updateFields.role = role || 'Student';
          await usersCollection.updateOne({ email }, { $set: updateFields });
          return res.status(200).json({ message: 'User updated', userId: existing._id });
        }

        // New user — create with default role
        const newUser = {
          email,
          displayName,
          photoURL:  photoURL  || '',
          role:      role      || 'Student',
          phone:     phone     || '',
          createdAt: new Date()
        };

        const result = await usersCollection.insertOne(newUser);
        return res.status(201).json({ message: 'User created', userId: result.insertedId });

      } catch (error) {
        console.error('POST /users error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
      }
    });

    app.delete('/users/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;

      // 1. Check if ID is valid
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid ID format' });
      }

      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);

      res.send(result);
    });

    // // create tuition - student only
    app.post('/tuitions', verifyFBToken, verifyStudent, async (req, res) => {
      try {
        const tuition = req.body;

        // Always set server-side fields — never trust the client for these
        tuition.studentEmail = req.decoded_email;
        tuition.status      = 'Pending'; // capital P — consistent with admin stats queries
        tuition.createdAt   = new Date();
        // NOTE: log() was called here but the function was never defined (commented out
        // on line ~169), causing "ReferenceError: log is not defined" on every submit.
        // The call has been removed.

        const result = await tuitionsCollection.insertOne(tuition);
        res.send(result);
      } catch (error) {
        console.error('POST /tuitions error:', error);
        res.status(500).send({ message: error.message });
      }
    });
    // Get tuitions. If query `?studentEmail=` is present, filter by it.
    app.get('/tuitions', verifyFBToken, async (req, res) => {
      const email = req.query.studentEmail;
      let query = {};

      // If email is provided, filter. Otherwise, return all (or handle logic for public feed)
      if (email) {
        query = { studentEmail: email };
      }

      const result = await tuitionsCollection.find(query).toArray();
      res.send(result);
    });
    // GET: All Tutors (with search & filters)

    // GET All Tuitions (Supports Search, Filter, Sort)


    // ✅ HELPER FUNCTION: Place this outside your route or in a utils file
    // This prevents the server from crashing if a user searches for symbols like "(", "+", or "*eturn text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");


    // ✅ HELPER FUNCTION: Place this outside your route or in a utils file
    // This prevents the server from crashing if a user searches for symbols like "(", "+", or "*"
    function escapeRegex(text) {
      if (!text) return "";
      return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    }

    // ✅ THE ROUTE
    app.get('/tuitions/status', async (req, res) => {
      try {
        const {
          search,
          status,
          filterClass,
          filterSubject,
          filterLocation,
          sort,
          page,
          limit
        } = req.query;
        // 1. Safe Pagination Setup
        // Default to page 1 and limit 10 if not provided
        const pageNumber = Math.max(1, parseInt(page) || 1);
        const limitNumber = Math.max(1, parseInt(limit) || 10);
        const skip = (pageNumber - 1) * limitNumber;

        // 2. Build the Query Object
        let query = {};

        // -- Exact Match for Status --
        if (status) {
          query.status = status;
        }

        // -- Specific Filters (Case-insensitive Regex) --
        if (filterClass) {
          query.class = { $regex: escapeRegex(filterClass), $options: 'i' };
        }
        if (filterSubject) {
          query.subject = { $regex: escapeRegex(filterSubject), $options: 'i' };
        }
        if (filterLocation) {
          query.location = { $regex: escapeRegex(filterLocation), $options: 'i' };
        }

        // -- Global Search Bar (Checks multiple fields) --
        if (search) {
          const searchRegex = { $regex: escapeRegex(search), $options: 'i' };
          query.$or = [
            { subject: searchRegex },
            { location: searchRegex },
            { class: searchRegex },
            // Add 'title' here if your tuition object has a title
            // { title: searchRegex } 
          ];
        }

        // 3. Sorting Logic
        let sortOptions = { _id: -1 }; // Default: Newest first

        switch (sort) {
          case 'salary_asc':
            sortOptions = { budget: 1 }; // Low to High
            break;
          case 'salary_desc':
            sortOptions = { budget: -1 }; // High to Low
            break;
          case 'oldest':
            sortOptions = { _id: 1 }; // Oldest first
            break;
          case 'newest':
          default:
            sortOptions = { _id: -1 }; // Newest first
            break;
        }

        // 4. Execute Queries in Parallel (Faster performance)
        const [tuitions, total] = await Promise.all([
          tuitionsCollection
            .find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNumber)
            .toArray(),

          // Get the count of documents that match the current filters
          tuitionsCollection.countDocuments(query)
        ]);

        // 5. Send Response
        res.send({
          tuitions,
          total
        });

      } catch (error) {
        console.error("Tuition API Error:", error);
        res.status(500).send({
          message: "Error fetching tuitions",
          error: error.message
        });
      }
    });
    app.get('/tuitions/:id', async (req, res) => {
      try {
        const id = req.params.id;

        // Validate ID format to prevent server crash
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await tuitionsCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Tuition not found" });
        }

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Error fetching tuition details" });
      }
    });
    // --- Applications Collection ---


    // POST: Create a new application
    // NOTE: recruiterEmail, tuitionSubject and tuitionLocation are fetched from
    // the tuitions collection server-side.  The client only needs to send
    // tuitionId, tutorEmail, qualifications, experience, expectedSalary.
    app.post('/applications', verifyFBToken, async (req, res) => {
      try {
        const applicationData = req.body;
        const tutorEmail = req.decoded_email; // always use the verified token

        // 1. Check for duplicate application
        const existingApplication = await applicationsCollection.findOne({
          tuitionId: applicationData.tuitionId,
          tutorEmail: tutorEmail
        });

        if (existingApplication) {
          return res.status(400).send({ message: "You have already applied to this tuition!" });
        }

        // 2. Fetch tuition so we can get recruiterEmail, subject, location
        //    server-side — never trust the client for these fields.
        if (!ObjectId.isValid(applicationData.tuitionId)) {
          return res.status(400).send({ message: 'Invalid tuition ID' });
        }
        const tuition = await tuitionsCollection.findOne({ _id: new ObjectId(applicationData.tuitionId) });
        if (!tuition) {
          return res.status(404).send({ message: 'Tuition not found' });
        }

        // Prevent tutors from applying to their own tuitions (edge case)
        if (tuition.studentEmail === tutorEmail) {
          return res.status(400).send({ message: "You cannot apply to your own tuition post." });
        }

        // 3. Fetch tutor profile for display fields
        const tutorProfile = await usersCollection.findOne({ email: tutorEmail });
        if (!tutorProfile) {
          return res.status(404).send({ message: "Your user profile was not found." });
        }

        // 4. Construct the application — all sensitive fields come from the DB
        const newApplication = {
          tuitionId:       applicationData.tuitionId,
          tuitionTitle:    tuition.title    || tuition.subject,
          tuitionSubject:  tuition.subject,
          tuitionLocation: tuition.location,
          recruiterEmail:  tuition.studentEmail,   // ← from DB, not client
          tutorEmail:      tutorProfile.email,
          tutorId:         tutorProfile._id.toString(),
          tutorName:       tutorProfile.displayName || tutorProfile.name,
          tutorImage:      tutorProfile.photoURL    || null,
          qualifications:  applicationData.qualifications  || tutorProfile.qualifications  || 'N/A',
          experience:      applicationData.experience      || tutorProfile.experience      || 'N/A',
          expectedSalary:  applicationData.expectedSalary  || tutorProfile.expectedSalary  || 0,
          status:          'Pending',
          appliedDate:     new Date()
        };

        // --- 4. INSERT INTO BOTH COLLECTIONS ---

        // A. Insert into Applications Collection (Primary)
        // We name this variable 'appResult'
        const appResult = await applicationsCollection.insertOne(newApplication);

        // B. Insert into Tutors Collection (Secondary)
        // We name this variable 'tutorResult'
        const tutorResult = await tutorsCollection.insertOne(newApplication);

        // 5. Send Response
        // We send both results back so the frontend checks if 'acknowledged' is true
        // Notify the student (recruiter) that a tutor has applied
        if (applicationData.recruiterEmail) {
          await createNotification(
            applicationData.recruiterEmail,
            'new_application',
            `${newApplication.tutorName} applied for your ${newApplication.tuitionSubject} tuition.`,
            '/dashboard/applied-tutors'
          );
        }

        res.send({
          insertedId: appResult.insertedId,
          appResult,
          tutorResult
        });

      } catch (error) {
        console.error("Error submitting application:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });


    app.get('/users/tutors', async (req, res) => {
      try {
        const { search, subject, location, page = 1, limit = 8 } = req.query;


        // 1. Build Query
        const query = {};

        // Search by Name
        if (search) {
          query.tutorName = { $regex: search, $options: 'i' };
        }

        // Filter by Subject
        if (subject) {
          query.tuitionSubject = { $regex: subject, $options: 'i' };
        }

        // Filter by Location
        if (location) {
          query.tuitionLocation = { $regex: location, $options: 'i' };
        }



        // 2. Pagination
        const pageNumber = parseInt(page);
        const limitNumber = parseInt(limit);
        const skip = (pageNumber - 1) * limitNumber;

        // 3. Fetch Data
        const rawTutors = await tutorsCollection.find(query)
          .skip(skip)
          .limit(limitNumber)
          .toArray();

        if (rawTutors.length === 0) {

        }

        const total = await tutorsCollection.countDocuments(query);

        // 4. Transformation
        const tutors = rawTutors.map(tutor => ({
          _id: tutor._id,
          name: tutor.tutorName,
          image: tutor.tutorImage,
          subject: tutor.tuitionSubject,
          location: tutor.tuitionLocation,
          experience: tutor.experience,
          salary: tutor.expectedSalary, // Included based on your previous data

          // 1. Status Added
          status: tutor.status,

          // 2. Date Added (Mapping 'appliedDate' to a 'date' key)
          date: tutor.appliedDate,

          tuitionId: tutor.tuitionId
        }));

        res.send({
          tutors,
          total
        });

      } catch (error) {
        console.error("Error fetching tutors:", error);
        res.status(500).send({ message: "Error fetching tutors" });
      }
    });
    // GET /tutors?limit=4&sort=rating
    app.get('/tutors-post', async (req, res) => {
      try {
        const { limit, sort, subject } = req.query; // 👈 Get 'subject'
        const limitNum = parseInt(limit) || 0;

        // 1. Build Query
        const query = {};
        if (subject) {
          query.tuitionSubject = subject; // 👈 Filter by DB field name
        }

        // 2. Sorting Logic (Same as before)
        let sortStage = { appliedDate: -1 };
        if (sort === 'experience') sortStage = { experienceAsNumber: -1 };

        const result = await tutorsCollection.aggregate([
          { $match: query }, // 👈 Apply filter
          {
            $addFields: {
              experienceAsNumber: { $toInt: "$experience" }
            }
          },
          { $sort: sortStage },
          { $limit: limitNum }
        ]).toArray();

        res.send(result);
      } catch (error) {
        // ... error handling
      }
    });
    app.get('/tutor-categories', async (req, res) => {
      try {
        // ❌ OLD: distinct() is not allowed in strict mode
        // const categories = await tutorsCollection.distinct('tuitionSubject');

        // ✅ NEW: Use aggregate() instead
        const result = await tutorsCollection.aggregate([
          {
            $group: { _id: "$tuitionSubject" } // Group by subject to get unique values
          },
          {
            $project: { _id: 0, subject: "$_id" } // Format the output
          }
        ]).toArray();

        // Convert [{ subject: "Math" }, { subject: "English" }] -> ["Math", "English"]
        const categories = result.map(item => item.subject).filter(Boolean);

        res.send(categories);
      } catch (error) {
        console.error("Failed to fetch categories:", error);
        res.status(500).send({ message: "Server Error", error: error.message });
      }
    });
    // GET: Fetch Latest 3 Tuition Posts
    app.get('/tuition-posts', async (req, res) => {
      try {
        const { limit, sort } = req.query;

        // 1. Initialize Query Options
        let query = {}; // Add filters here if needed (e.g., class, subject)

        // 2. Handle Sorting
        let sortOptions = { postedDate: -1 }; // Default: Newest first

        if (sort === 'newest') {
          sortOptions = { postedDate: -1 }; // Descending order
        } else if (sort === 'oldest') {
          sortOptions = { postedDate: 1 };  // Ascending order
        } else if (sort === 'budget_high') {
          sortOptions = { budget: -1 };
        } else if (sort === 'budget_low') {
          sortOptions = { budget: 1 };
        }

        // 3. Handle Limit
        // Convert string to number, default to 0 (which means 'all' in MongoDB) if undefined
        const limitNum = parseInt(limit) || 0;

        // 4. Execute Database Call
        const result = await tuitionsCollection
          .find(query)
          .sort(sortOptions)
          .limit(limitNum)
          .toArray();

        res.send(result);

      } catch (error) {
        console.error("Error fetching tuition posts:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });
    app.get('/admin-stats', verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        // 1. Calculate Total Revenue & Total Transactions
        const revenueStats = await paymentsCollection.aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$amount" },
              totalTransactions: { $sum: 1 }
            }
          }
        ]).toArray();

        const totalRevenue = revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0;
        const totalTransactions = revenueStats.length > 0 ? revenueStats[0].totalTransactions : 0;

        // 2. Prepare Chart Data (Revenue & Volume per Day)
        const chartData = await paymentsCollection.aggregate([
          {
            $addFields: {
              dateObj: { $toDate: "$date" } // Convert string date to Date object
            }
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$dateObj" } },
              dailyRevenue: { $sum: "$amount" },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } } // Sort by date ascending
        ]).toArray();

        // 3. User Demographics (MISSING IN YOUR CODE - ADDED HERE)
        // This calculates how many Students, Tutors, and Admins you have
        const userStats = await usersCollection.aggregate([
          {
            $group: {
              _id: "$role", // Group by role field
              count: { $sum: 1 }
            }
          }
        ]).toArray();

        // Transform the data to match Recharts format: [{ name: 'Student', value: 10 }, ...]
        const userDemographics = userStats.map(stat => ({
          name: stat._id ? (stat._id.charAt(0).toUpperCase() + stat._id.slice(1)) : 'Unknown',
          value: stat.count
        }));

        // 4. Fetch Recent Transaction History
        const recentTransactions = await paymentsCollection
          .find()
          .sort({ date: -1 })
          .limit(100)
          .toArray();

        // Send EVERYTHING to the frontend
        res.send({
          totalRevenue,
          totalTransactions,
          chartData,
          userDemographics, // <--- Now included
          recentTransactions
        });

      } catch (error) {
        console.error("Error fetching admin stats:", error);
        res.status(500).send({ message: "Server Error" });
      }
    });
    // GET: Fetch Latest 4 Tutors (assuming 'users' collection has role: 'tutor')
    app.get('/tutors/latest', async (req, res) => {
      const result = await usersCollection
        .find({ role: 'tutor' })
        .sort({ _id: -1 })
        .limit(4)
        .toArray();
      res.send(result);
    });
    // GET: Fetch Applications Received by a Student (Recruiter)
    app.get('/applications/received', verifyFBToken, verifyStudent, async (req, res) => {
      try {
        // The token was already verified by verifyFBToken; the decoded email is on
        // req.decoded_email.  We ignore the ?email= query param entirely and use
        // the trusted value from the token — this also plugs the IDOR vulnerability
        // that existed when the old code compared req.user.email (undefined) with
        // the query param (attacker-controlled).
        const email = req.decoded_email;

        const result = await applicationsCollection
          .find({ recruiterEmail: email })
          .sort({ appliedDate: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // PATCH: Update Application Status (Approve/Reject)
    app.patch('/applications/status/:id', verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; // Expecting { status: 'approved' } or { status: 'rejected' }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { status: status }
        };

        const result = await applicationsCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.delete('/tuitions/:id', verifyFBToken, verifyStudent, async (req, res) => {
      const id = req.params.id;
      const tuition = await tuitionsCollection.findOne({ _id: new ObjectId(id) });
      if (!tuition) return res.status(404).send({ message: 'tuition not found' });
      if (tuition.studentEmail !== req.decoded_email) return res.status(403).send({ message: 'forbidden' });
      const result = await tuitionsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    // Update Tuition Endpoint
    app.patch('/tuitions/:id', verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const item = req.body;
      const filter = { _id: new ObjectId(id) };

      const updatedDoc = {
        $set: {
          subject: item.subject,
          class: item.class,
          location: item.location,
          budget: item.salary,
          description: item.description
          // We usually DO NOT update 'status' here (admins do that)
          // We usually DO NOT update 'studentEmail' (ownership shouldn't change)
        }
      };

      const result = await tuitionsCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });// 1. Change User Role
    app.patch('/users/role/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: role } }
      );
      res.send(result);
    });

    // 2. Update User Info (Name/Image)
    app.patch('/users/update/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const item = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { name: item.name, image: item.image } }
      );
      res.send(result);
    });

    // 3. Approve/Reject Tuition
    // 1. GET All Tuitions (for Admin Dashboard)
    // This fetches every single post regardless of status (Pending/Approved/Rejected)
    app.get('/tuitions', verifyFBToken, verifyAdmin, async (req, res) => {
      // Optional: If you want to filter by studentEmail query (for student dashboard)
      const studentEmail = req.query.studentEmail;
      let query = {};
      if (studentEmail) {
        query = { studentEmail: studentEmail };
      }

      const result = await tuitionsCollection.find(query).toArray();
      res.send(result);
    });

    // 2. PATCH Tuition Status (Approve/Reject)
    app.patch('/tuitions/status/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      // Expecting { status: 'Approved' } or { status: 'Rejected' }

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: status
        }
      };

      const result = await tuitionsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Get user role by email
    app.get('/users/:email/role', async (req, res) => {
      const email = req.params.email.toLowerCase();



      const user = await usersCollection.findOne({ email });


      res.send({ role: user?.role || 'Student' });
    });


    app.get('/applications/my-applications', verifyFBToken, verifyTutor, async (req, res) => {
      try {
        // Always use the email from the verified token — ignore the ?email= query param
        const email = req.decoded_email;
        const query = { tutorEmail: email };
        const result = await applicationsCollection.find(query).toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // 2. DELETE: Withdraw Application
    app.delete('/applications/:id', verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const result = await applicationsCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // 3. PATCH: Update Application (Salary)
    app.patch('/applications/:id', verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { expectedSalary } = req.body;

        // Create filter: Find by ID
        // Optional: You can add { status: 'pending' } to ensure they can't edit approved jobs
        const filter = { _id: new ObjectId(id) };

        const updateDoc = {
          $set: {
            expectedSalary: expectedSalary
          }
        };

        const result = await applicationsCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.post('/create-checkout-session', verifyFBToken, verifyStudent, async (req, res) => {
      try {
        const { applicationId, tuitionId } = req.body;

        // 1. Validate IDs
        if (!ObjectId.isValid(applicationId) || !ObjectId.isValid(tuitionId)) {
          return res.status(400).send({ message: 'Invalid IDs provided' });
        }

        // 2. Fetch Application & Tuition
        const application = await applicationsCollection.findOne({ _id: new ObjectId(applicationId) });
        const tuition = await tuitionsCollection.findOne({ _id: new ObjectId(tuitionId) });

        if (!application || !tuition) {
          return res.status(404).send({ message: 'Application or Tuition not found' });
        }

        // 3. Security Check (Ensure logged-in student owns this tuition post)
        if (tuition.studentEmail !== req.decoded_email) {
          return res.status(403).send({ message: 'Forbidden: You do not own this tuition post' });
        }

        if (application.status === 'Approved') {
          return res.status(400).send({ message: 'This application is already booked/approved' });
        }

        // 4. Validate Amount (Stripe requires minimum ~60 BDT)
        const amount = Number(application.expectedSalary);
        if (!amount || amount < 60) {
          return res.status(400).send({ message: 'Salary must be at least 60 BDT to process payment.' });
        }
        const amountInCents = Math.round(amount * 100);

        // ---------------------------------------------------------
        // 5. Get Student ID and Tutor ID for Metadata (Safely)
        // ---------------------------------------------------------

        // A. Get Student (Payer) ID
        const studentUser = await usersCollection.findOne({ email: req.decoded_email });
        // FIXED: Use "N/A" if null, because Stripe crashes on null metadata
        const studentId = studentUser ? studentUser._id.toString() : "N/A";

        // B. Get Tutor ID
        let tutorId = application.tutorId;
        if (!tutorId) {
          const tutorUser = await usersCollection.findOne({ email: application.tutorEmail });
          tutorId = tutorUser ? tutorUser._id.toString() : "N/A";
        }
        // ---------------------------------------------------------

        if (!stripe) {
          return res.status(503).send({ message: 'Payments are not configured' });
        }

        // 6. Create Stripe Session
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          customer_email: req.decoded_email, // FIXED: Pre-fills user email in checkout
          line_items: [
            {
              price_data: {
                currency: 'bdt',
                product_data: {
                  name: `Tuition: ${tuition.subject}`,
                  description: `Tutor: ${application.tutorName}`,
                },
                unit_amount: amountInCents,
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          // FIXED: All metadata values must be Strings. No nulls allowed.
          metadata: {
            applicationId: applicationId,
            tuitionId: tuitionId,
            studentEmail: req.decoded_email,
            tutorEmail: application.tutorEmail || "N/A",
            studentId: studentId,
            tutorId: tutorId
          },
          // FIXED: Correct Stripe syntax (removed ${} and extra brackets)
          success_url: `${process.env.CLIENT_URL}/dashboard/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_URL}/dashboard/applied-tutors`,
        });

        res.send({ url: session.url });

      } catch (error) {
        console.error("Stripe Error:", error);
        res.status(500).send({ message: 'Internal Server Error', error: error.message });
      }
    });
    // Add this inside your run() function or route definitions


    app.post('/payment-success', verifyFBToken, async (req, res) => {
      try {
        const { sessionId } = req.body;

        if (!sessionId) return res.status(400).send({ message: 'Session ID required' });
        if (!stripe) return res.status(503).send({ message: 'Payments are not configured' });

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === 'paid') {
          // Extract IDs from metadata
          const { applicationId, tuitionId, tutorEmail, tutorId, studentEmail } = session.metadata;
          const transactionId = session.payment_intent;

          // 1. Idempotency Check (Prevent duplicate processing)
          const query = { transactionId: transactionId };
          const alreadyExists = await paymentsCollection.findOne(query);
          if (alreadyExists) {
            return res.send({ success: true, message: 'Already processed' });
          }

          // 2. Save Payment Record (with platform fee breakdown)
          const grossAmount   = session.amount_total / 100;             // what student paid
          const platformFee   = Math.round(grossAmount * PLATFORM_FEE_PERCENT) / 100; // 10%
          const netAmount     = parseFloat((grossAmount - platformFee).toFixed(2));   // tutor earns

          const paymentRecord = {
            transactionId,
            studentEmail,
            tutorEmail,
            applicationId,
            tuitionId,
            studentId: session.metadata.studentId,
            tutorId,
            // gross = student paid, platformFee = our commission, netAmount = tutor earns
            amount:          grossAmount,
            platformFee:     platformFee,
            platformFeePercent: PLATFORM_FEE_PERCENT,
            netAmount:       netAmount,
            currency: session.currency,
            status: 'paid',
            date: new Date()
          };
          await paymentsCollection.insertOne(paymentRecord);

          // Store the saved record so we can return it to the frontend for display
          const savedPayment = paymentRecord;

          // 3. Update Application Status -> Approved
          await applicationsCollection.updateOne(
            { _id: new ObjectId(applicationId) },
            { $set: { status: 'Approved', transactionId: transactionId } }
          );

          // 4. Update Tuition Job Status -> Booked
          await tuitionsCollection.updateOne(
            { _id: new ObjectId(tuitionId) },
            { $set: { status: 'Booked' } }
          );

          // -------------------------------------------------
          // 🆕 FIXED: Update Tutors Collection
          // -------------------------------------------------
          // We search by tuitionId AND tutorEmail because we don't have the 
          // specific _id of the document in the tutorsCollection.
          await tutorsCollection.updateOne(
            { tuitionId: tuitionId, tutorEmail: tutorEmail },
            { $set: { status: 'Approved', transactionId: transactionId } }
          );
          // -------------------------------------------------

          // 5. Reject other applications for this job
          await applicationsCollection.updateMany(
            { tuitionId: tuitionId, _id: { $ne: new ObjectId(applicationId) } },
            { $set: { status: 'Rejected' } }
          );

          // 6. Notify the tutor that the payment went through
          if (tutorEmail && tutorEmail !== 'N/A') {
            const tuitionDoc = await tuitionsCollection.findOne({ _id: new ObjectId(tuitionId) });
            await createNotification(
              tutorEmail,
              'payment_confirmed',
              `Payment confirmed for ${tuitionDoc?.subject || 'your tuition'}. You can start the lessons.`,
              '/dashboard/ongoing-tuitions'
            );
          }

          // 7. Notify the student that their hire and payment succeeded
          if (studentEmail && studentEmail !== 'N/A') {
            const application = await applicationsCollection.findOne({ _id: new ObjectId(applicationId) });
            await createNotification(
              studentEmail,
              'hire_confirmed',
              `You have successfully hired ${application?.tutorName || 'the tutor'}. Check your dashboard.`,
              '/dashboard/applied-tutors'
            );
          }

          return res.send({
            success: true,
            message: 'Payment Successful & Database Updated',
            payment: {
              transactionId: savedPayment.transactionId,
              amount:        savedPayment.amount,
              currency:      savedPayment.currency,
              tutorEmail:    savedPayment.tutorEmail,
              date:          savedPayment.date,
            }
          });
        }
      } catch (error) {
        console.error("Payment Success Error:", error);
        res.status(500).send({ message: 'Server Error' });
      }
    });
    app.get('/payments', verifyFBToken, async (req, res) => {
      try {
        const email = req.decoded_email; // Get email from the verified token

        // Find payments where the user is EITHER the payer OR the receiver
        const query = {
          $or: [
            { studentEmail: email }, // User is the Student
            { tutorEmail: email }    // User is the Tutor
          ]
        };

        // Fetch data and sort by newest date first
        const result = await paymentsCollection
          .find(query)
          .sort({ date: -1 }) // -1 means descending order (newest first)
          .toArray();

        res.send(result);

      } catch (error) {
        console.error("Error fetching payment history:", error);
        res.status(500).send({ message: "Error fetching payment history" });
      }
    });
    // GET: Fetch Ongoing Tuitions for a Tutor (Approved Applications)
    // GET: Specific route for "Ongoing" (Approved) Tuitions for a Tutor
    app.get('/applications/ongoing', verifyFBToken, verifyTutor, async (req, res) => {
      try {
        const email = req.query.tutorEmail;

        // 1. Security Check: Ensure the token owner matches the email being requested
        if (req.decoded_email !== email) {
          return res.status(403).send({ message: 'Forbidden access' });
        }

        // 2. Query: Find applications for this tutor that are explicitly 'Approved'
        const query = {
          tutorEmail: email,
          status: 'Approved'
        };

        const result = await applicationsCollection.find(query).toArray();
        res.send(result);

      } catch (error) {
        console.error("Error fetching ongoing applications:", error);
        res.status(500).send({ message: "Server Error" });
      }
    });
    // GET: Admin Analytics & Reports
    app.get('/admin-stats', verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        // 1. Calculate Total Revenue & Total Transactions
        // We use MongoDB aggregation to sum up all 'amount' fields
        const revenueStats = await paymentsCollection.aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$amount" },
              totalTransactions: { $sum: 1 }
            }
          }
        ]).toArray();

        const totalRevenue = revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0;
        const totalTransactions = revenueStats.length > 0 ? revenueStats[0].totalTransactions : 0;

        // 2. Prepare Chart Data (Revenue per Day)
        // Groups payments by date (YYYY-MM-DD) to show trends
        const chartData = await paymentsCollection.aggregate([
          {
            $addFields: {
              dateObj: { $toDate: "$date" } // Ensure date is a Date object
            }
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$dateObj" } },
              dailyRevenue: { $sum: "$amount" },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } } // Sort by date ascending
        ]).toArray();

        // 3. Fetch Recent Transaction History (All successful payments)
        const recentTransactions = await paymentsCollection
          .find()
          .sort({ date: -1 }) // Newest first
          .limit(100) // Limit to last 100 for performance (or add pagination)
          .toArray();

        res.send({
          totalRevenue,
          totalTransactions,
          chartData,
          recentTransactions
        });

      } catch (error) {
        console.error("Error fetching admin stats:", error);
        res.status(500).send({ message: "Server Error" });
      }
    });
    // 3. Manual Reject (No Payment)
    app.patch('/applications/reject/:id', verifyFBToken, verifyStudent, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: 'Rejected' } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error rejecting application' });
      }
    });

    /* ===============================================================
       DASHBOARD STATS ENDPOINTS
       =============================================================== */

    // GET: summary numbers for the student dashboard
    app.get('/dashboard/student-stats', verifyFBToken, verifyStudent, async (req, res) => {
      try {
        const email = req.decoded_email;

        const [tuitions, applications, payments, bookmarks] = await Promise.all([
          tuitionsCollection.countDocuments({ studentEmail: email }),
          applicationsCollection.countDocuments({ recruiterEmail: email }),
          paymentsCollection.find({ studentEmail: email }).toArray(),
          bookmarksCollection.countDocuments({ userEmail: email }),
        ]);

        const totalSpent = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const approvedApplications = await applicationsCollection.countDocuments({
          recruiterEmail: email,
          status: 'Approved'
        });
        const pendingApplications = await applicationsCollection.countDocuments({
          recruiterEmail: email,
          status: 'Pending'
        });

        res.send({
          tuitionsPosted: tuitions,
          applicationsReceived: applications,
          approvedHires: approvedApplications,
          pendingApplications: pendingApplications,
          totalSpent: Math.round(totalSpent),
          savedTuitions: bookmarks,
          recentPayments: payments.slice(0, 5)
        });
      } catch (err) {
        console.error('Student stats error:', err);
        res.status(500).send({ message: 'Could not fetch student stats' });
      }
    });

    // GET: summary numbers for the tutor dashboard
    app.get('/dashboard/tutor-stats', verifyFBToken, verifyTutor, async (req, res) => {
      try {
        const email = req.decoded_email;

        const [totalApps, approvedApps, payments, reviews] = await Promise.all([
          applicationsCollection.countDocuments({ tutorEmail: email }),
          applicationsCollection.countDocuments({ tutorEmail: email, status: 'Approved' }),
          paymentsCollection.find({ tutorEmail: email }).sort({ date: -1 }).toArray(),
          reviewsCollection.find({ tutorEmail: email }).toArray(),
        ]);

        const totalEarned = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const avgRating = reviews.length
          ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
          : null;

        // Monthly earnings breakdown for the chart (last 6 months)
        const monthlyMap = {};
        payments.forEach(p => {
          const key = new Date(p.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
          monthlyMap[key] = (monthlyMap[key] || 0) + (p.amount || 0);
        });
        const earningsChart = Object.entries(monthlyMap)
          .slice(-6)
          .map(([month, amount]) => ({ month, amount }));

        res.send({
          totalApplications: totalApps,
          approvedBookings: approvedApps,
          pendingApplications: totalApps - approvedApps,
          totalEarned: Math.round(totalEarned),
          avgRating,
          reviewCount: reviews.length,
          earningsChart,
          recentPayments: payments.slice(0, 5)
        });
      } catch (err) {
        console.error('Tutor stats error:', err);
        res.status(500).send({ message: 'Could not fetch tutor stats' });
      }
    });

    /* ===============================================================
       FEATURE 1 – NOTIFICATIONS
       =============================================================== */
    // GET: fetch the 20 most recent notifications for the logged-in user
    app.get('/notifications', verifyFBToken, async (req, res) => {
      try {
        const email = req.decoded_email;
        const items = await notificationsCollection
          .find({ recipientEmail: email })
          .sort({ createdAt: -1 })
          .limit(20)
          .toArray();
        res.send(items);
      } catch (err) {
        res.status(500).send({ message: 'Could not fetch notifications' });
      }
    });

    // PATCH: mark every unread notification as read for the logged-in user
    app.patch('/notifications/read-all', verifyFBToken, async (req, res) => {
      try {
        const email = req.decoded_email;
        const result = await notificationsCollection.updateMany(
          { recipientEmail: email, read: false },
          { $set: { read: true } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Could not mark notifications as read' });
      }
    });

    /* ===============================================================
       FEATURE 2 – BOOKMARKS (Save tuition posts)
       =============================================================== */
    // GET: all bookmarks for the logged-in user
    app.get('/bookmarks', verifyFBToken, async (req, res) => {
      try {
        const email = req.decoded_email;
        const bookmarks = await bookmarksCollection
          .find({ userEmail: email })
          .sort({ savedAt: -1 })
          .toArray();

        // Enrich each bookmark with the live tuition document
        const enriched = await Promise.all(
          bookmarks.map(async (b) => {
            if (!ObjectId.isValid(b.tuitionId)) return null;
            const tuition = await tuitionsCollection.findOne({ _id: new ObjectId(b.tuitionId) });
            return tuition ? { ...b, tuition } : null;
          })
        );

        res.send(enriched.filter(Boolean));
      } catch (err) {
        res.status(500).send({ message: 'Could not fetch bookmarks' });
      }
    });

    // POST: save a tuition
    app.post('/bookmarks', verifyFBToken, async (req, res) => {
      try {
        const { tuitionId } = req.body;
        const email = req.decoded_email;

        if (!ObjectId.isValid(tuitionId)) {
          return res.status(400).send({ message: 'Invalid tuition ID' });
        }

        const existing = await bookmarksCollection.findOne({ userEmail: email, tuitionId });
        if (existing) {
          return res.status(400).send({ message: 'Already saved' });
        }

        const result = await bookmarksCollection.insertOne({
          userEmail: email,
          tuitionId,
          savedAt: new Date()
        });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Could not save tuition' });
      }
    });

    // DELETE: remove a bookmark
    app.delete('/bookmarks/:tuitionId', verifyFBToken, async (req, res) => {
      try {
        const { tuitionId } = req.params;
        const email = req.decoded_email;
        const result = await bookmarksCollection.deleteOne({ userEmail: email, tuitionId });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Could not remove bookmark' });
      }
    });

    /* ===============================================================
       FEATURE 3 – REVIEWS (Star ratings by students)
       =============================================================== */
    // GET: fetch all reviews for a tutor, identified by their email
    app.get('/reviews', async (req, res) => {
      try {
        const { tutorEmail } = req.query;
        const query = tutorEmail ? { tutorEmail } : {};
        const reviews = await reviewsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.send(reviews);
      } catch (err) {
        res.status(500).send({ message: 'Could not fetch reviews' });
      }
    });

    // POST: a student leaves a review after a completed booking
    app.post('/reviews', verifyFBToken, verifyStudent, async (req, res) => {
      try {
        const { tutorEmail, applicationId, rating, comment } = req.body;
        const studentEmail = req.decoded_email;

        if (!tutorEmail || !rating) {
          return res.status(400).send({ message: 'tutorEmail and rating are required' });
        }
        if (rating < 1 || rating > 5) {
          return res.status(400).send({ message: 'Rating must be between 1 and 5' });
        }

        // Prevent duplicate reviews for the same booking
        if (applicationId) {
          const existing = await reviewsCollection.findOne({ applicationId, studentEmail });
          if (existing) {
            return res.status(400).send({ message: 'You have already reviewed this booking' });
          }
        }

        // Verify the student actually had an approved booking with this tutor
        if (applicationId && ObjectId.isValid(applicationId)) {
          const application = await applicationsCollection.findOne({
            _id: new ObjectId(applicationId),
            status: 'Approved'
          });
          if (!application) {
            return res.status(403).send({ message: 'You can only review completed bookings' });
          }
        }

        const student = await usersCollection.findOne({ email: studentEmail });
        const review = {
          tutorEmail,
          studentEmail,
          studentName: student?.displayName || 'Student',
          studentPhoto: student?.photoURL || null,
          applicationId: applicationId || null,
          rating: Number(rating),
          comment: (comment || '').trim(),
          createdAt: new Date()
        };

        const result = await reviewsCollection.insertOne(review);

        // Notify the tutor that they received a review
        await createNotification(
          tutorEmail,
          'new_review',
          `${review.studentName} left you a ${rating}-star review.`,
          '/dashboard/my-applications'
        );

        res.send(result);
      } catch (err) {
        console.error('Review error:', err);
        res.status(500).send({ message: 'Could not save review' });
      }
    });

    /* ===============================================================
       FEATURE 4 – VERIFIED TUTOR BADGE
       =============================================================== */
    // PATCH: admin marks a user as a verified tutor
    app.patch('/users/verify-tutor/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const { verified } = req.body;   // true or false

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: 'Invalid user ID' });
        }

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { verified: !!verified, verifiedAt: verified ? new Date() : null } }
        );

        // Also mark all tutor-card documents in the tutors collection
        const user = await usersCollection.findOne({ _id: new ObjectId(id) });
        if (user) {
          await tutorsCollection.updateMany(
            { tutorEmail: user.email },
            { $set: { verified: !!verified } }
          );

          // Notify the tutor
          if (verified && user.email) {
            await createNotification(
              user.email,
              'verified',
              'Congratulations! Your profile has been verified by an admin. Your tutor badge is now active.',
              '/dashboard/my-applications'
            );
          }
        }

        res.send(result);
      } catch (err) {
        console.error('Verify tutor error:', err);
        res.status(500).send({ message: 'Could not update verification status' });
      }
    });

    /* ===============================================================
       PROFILE ENDPOINTS
       =============================================================== */

    // GET /profile — full profile merged with role-specific stats
    app.get('/profile', verifyFBToken, async (req, res) => {
      try {
        const email = req.decoded_email;
        const user  = await usersCollection.findOne({ email });
        if (!user) return res.status(404).send({ message: 'User not found' });

        const role = user.role || 'Student';
        let stats  = {};

        if (role === 'Student') {
          const [tuitions, applications, payments, bookmarks, approved] = await Promise.all([
            tuitionsCollection.countDocuments({ studentEmail: email }),
            applicationsCollection.countDocuments({ recruiterEmail: email }),
            paymentsCollection.find({ studentEmail: email }).toArray(),
            bookmarksCollection.countDocuments({ userEmail: email }),
            applicationsCollection.countDocuments({ recruiterEmail: email, status: 'Approved' }),
          ]);
          stats = {
            tuitionsPosted:        tuitions,
            applicationsReceived:  applications,
            tutorsHired:           approved,
            savedTuitions:         bookmarks,
            totalSpent:            Math.round(payments.reduce((s, p) => s + (p.amount || 0), 0)),
          };
        } else if (role === 'Tutor') {
          const [totalApps, approved, payments, reviews] = await Promise.all([
            applicationsCollection.countDocuments({ tutorEmail: email }),
            applicationsCollection.countDocuments({ tutorEmail: email, status: 'Approved' }),
            paymentsCollection.find({ tutorEmail: email }).toArray(),
            reviewsCollection.find({ tutorEmail: email }).toArray(),
          ]);
          const avgRating = reviews.length
            ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
            : null;
          stats = {
            totalApplications: totalApps,
            approvedBookings:  approved,
            totalEarned:       Math.round(payments.reduce((s, p) => s + (p.netAmount || p.amount || 0), 0)),
            avgRating,
            reviewCount:       reviews.length,
          };
        } else if (role === 'Admin') {
          const [students, tutors, allTuitions, allPayments] = await Promise.all([
            usersCollection.countDocuments({ role: 'Student' }),
            usersCollection.countDocuments({ role: 'Tutor' }),
            tuitionsCollection.countDocuments({}),
            paymentsCollection.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]).toArray(),
          ]);
          stats = {
            totalStudents:  students,
            totalTutors:    tutors,
            totalTuitions:  allTuitions,
            platformRevenue: Math.round(allPayments[0]?.total || 0),
          };
        }

        // Remove sensitive fields before sending
        const { _id, ...safeUser } = user;
        res.send({ ...safeUser, id: _id, stats });
      } catch (err) {
        console.error('GET /profile error:', err);
        res.status(500).send({ message: err.message });
      }
    });

    // PATCH /profile — update editable profile fields
    app.patch('/profile', verifyFBToken, async (req, res) => {
      try {
        const email = req.decoded_email;
        const allowed = ['displayName', 'photoURL', 'phone', 'location', 'bio', 'subjects', 'experience', 'qualification'];
        const updateFields = { updatedAt: new Date() };

        allowed.forEach(field => {
          if (req.body[field] !== undefined) updateFields[field] = req.body[field];
        });

        const result = await usersCollection.updateOne({ email }, { $set: updateFields });
        res.send(result);
      } catch (err) {
        console.error('PATCH /profile error:', err);
        res.status(500).send({ message: err.message });
      }
    });

    /* ===============================================================
       DEMO LOGIN  –  returns a short-lived Firebase custom token so
       the frontend can sign in as a demo account without ever seeing
       a password.  Token expires in 1 hour (Firebase default).
       =============================================================== */
    app.post('/demo-login', async (req, res) => {
      try {
        const { role } = req.body;

        const emailByRole = {
          Student: 'demo.student@etuition.com',
          Tutor:   'demo.tutor@etuition.com',
          Admin:   'demo.admin@etuition.com',
        };

        const email = emailByRole[role];
        if (!email) {
          return res.status(400).send({ message: 'Invalid role. Use Student, Tutor, or Admin.' });
        }

        if (!admin.apps.length) {
          return res.status(503).send({ message: 'Auth service not configured' });
        }

        // Look up the demo Firebase user by email
        const fbUser = await admin.auth().getUserByEmail(email);

        // Create a custom token — frontend exchanges it for a real session
        const customToken = await admin.auth().createCustomToken(fbUser.uid);

        res.send({ token: customToken, email, role });
      } catch (err) {
        console.error('Demo login error:', err.message);

        // Common case: seed hasn't been run yet
        if (err.code === 'auth/user-not-found') {
          return res.status(404).send({
            message: 'Demo account not found. Run `npm run seed` on the backend first.',
          });
        }

        res.status(500).send({ message: 'Demo login failed', error: err.message });
      }
    });

    app.get('/', (req, res) => {
      res.send('eTuitionBD API is running');
    });

    console.log('eTuitionBD backend initialized');
  } finally {
    // do not close the client here for long-running server
  }
}

run().catch(err => {
  console.error('Failed to register API routes:', err);
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`eTuitionBD server listening on port ${port}`);
  });
}

module.exports = app;
