// server.js (eTuitionBD)
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');
const admin = require('firebase-admin');
const { log } = require('console');

const app = express();
const port = process.env.PORT || 3000;

// Decode and init Firebase Admin (FB_SERVICE_KEY must be base64 JSON)
const decoded = Buffer.from(process.env.FB_SERVICE_KEY || '', 'base64').toString('utf8');
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Middleware
app.use(express.json());
// const allowedOrigins = [
//   "http://localhost:5173",
//   "https://react-e-tution-session-client.vercel.app",
// ];

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://react-e-tution-session-client.vercel.app",
      "*"
    ],
    credentials: true,
  }

  ));

console.log();
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
    // // optional: logs collection
    // const logsCollection = db.collection('logs');

    // Role check middleware (requires verifyFBToken first)
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const user = await usersCollection.findOne({ email });
      if (!user || user.role !== 'Admin') return res.status(403).send({ message: 'forbidden access' });
      next();
    };

    const verifyStudent = async (req, res, next) => {
      const email = req.decoded_email;
      console.log();

      const user = await usersCollection.findOne({ email });
      console.log(user);

      if (!user || user.role !== 'Student') return res.status(403).send({ message: 'forbidden access' });
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

    // get role by email (public)
    // app.get('/users/:email/role', async (req, res) => {
    //   const email = req.params.email;
    //   const user = await usersCollection.findOne({ email });
    //   res.send({ role: user?.role || 'user' });
    // });

    // create or upsert user (called from frontend after firebase login)

    app.post("/users", async (req, res) => {
      try {
        const { email, displayName, photoURL, role, phone } = req.body;
        console.log(email, displayName, photoURL, role, phone);
        console.log(role);


        // Check if email already exists
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: "Email already registered" });
        }

        // Set default role to "Student" if not provided
        const userRole = role || "Student";

        // Create new user object with creation date
        const newUser = {
          email,
          displayName,
          photoURL,
          role: userRole,
          phone,
          createdAt: new Date()
        };

        const result = await usersCollection.insertOne(newUser);

        // Respond with success
        return res.status(201).json({ message: 'User created', userId: result.insertedId });

      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error: error.message });
      }
    });


    // // create tuition - student only
    app.post('/tuitions', verifyFBToken, verifyStudent, async (req, res) => {
      const tuition = req.body;
      tuition.studentEmail = req.decoded_email;
      tuition.studentId = req.user?._id || null;
      tuition.status = 'pending'; // pending admin approval
      tuition.createdAt = new Date();
      const result = await tuitionsCollection.insertOne(tuition);
      await log('tuition_created', { tuitionId: result.insertedId, by: tuition.studentEmail });
      res.send(result);
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
        console.log(search,
          status,
          filterClass,
          filterSubject,
          filterLocation,
          sort,
          page);

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
    app.post('/applications', async (req, res) => {
      try {
        const applicationData = req.body;

        // 1. Check for duplicate application
        const query = {
          tuitionId: applicationData.tuitionId,
          tutorEmail: applicationData.tutorEmail
        };
        const existingApplication = await applicationsCollection.findOne(query);

        if (existingApplication) {
          return res.status(400).send({ message: "You have already applied to this tuition!" });
        }

        // 2. Verify Tutor exists in DB
        const tutorProfile = await usersCollection.findOne({ email: applicationData.tutorEmail });

        if (!tutorProfile) {
          return res.status(404).send({ message: "User profile not found." });
        }

        // 3. Construct Final Application
        const newApplication = {
          tuitionId: applicationData.tuitionId,
          tuitionSubject: applicationData.tuitionSubject,
          tuitionLocation: applicationData.tuitionLocation,
          recruiterEmail: applicationData.recruiterEmail,
          tutorEmail: tutorProfile.email,
          tutorName: tutorProfile.displayName,
          tutorImage: tutorProfile.photoURL,
          qualifications: applicationData.qualifications || tutorProfile.qualifications || "N/A",
          experience: applicationData.experience || tutorProfile.experience || "N/A",
          expectedSalary: applicationData.expectedSalary || tutorProfile.expectedSalary || "Negotiable",
          status: 'Pending',
          appliedDate: new Date()
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
        res.send({
          insertedId: appResult.insertedId, // Frontend usually looks for this
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

        console.log("--- New Request to /users/tutors ---");
        console.log("Filters received:", { search, subject, location });

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

        // DEBUG: See if data was found
        console.log(`Found ${rawTutors.length} tutors in DB`);
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
        const email = req.query.email;
        console.log(email, req.user.email);


        // Security Check
        if (req.user.email !== email) {
          return res.status(403).send({ message: 'Forbidden access' });
        }

        // Find applications where the logged-in user is the recruiter
        const query = { recruiterEmail: email };
        console.log(query);


        const result = await applicationsCollection.find(query).toArray();
        console.log(result);


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
      await log('tuition_deleted', { tuitionId: id, by: req.decoded_email });
      res.send(result);
    });
    // Update Tuition Endpoint
    app.patch('/tuitions/:id', verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const item = req.body;
      const filter = { _id: new ObjectId(id) };
      console.log(item);

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
        const email = req.query.email;
        console.log(email);

        console.log(req.user.email, email);

        // Security: Ensure token matches email
        if (req.user.email !== email) {
          return res.status(403).send({ message: 'Forbidden access' });
        }

        const query = { tutorEmail: email };
        const result = await applicationsCollection.find(query).toArray();
        console.log(result);

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
    console.log(process.env.CLIENT_URL);

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

    app.post('/payment-success', verifyFBToken, async (req, res) => {
      try {
        const { sessionId } = req.body;
        console.log(sessionId);
        
        if (!sessionId) return res.status(400).send({ message: 'Session ID required' });

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

          // 2. Save Payment Record
          const paymentRecord = {
            transactionId,
            studentEmail,
            tutorEmail,
            applicationId,
            tuitionId,
            studentId: session.metadata.studentId,
            tutorId,
            amount: session.amount_total / 100,
            currency: session.currency,
            status: 'paid',
            date: new Date()
          };
          await paymentsCollection.insertOne(paymentRecord);

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

          return res.send({ success: true, message: 'Payment Successful & Database Updated' });
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

    app.get('/', (req, res) => {
      res.send('eTuitionBD API is running');
    });

    console.log('eTuitionBD backend initialized');
  } finally {
    // do not close the client here for long-running server
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

// start express server
app.listen(port, () => {
  console.log(`eTuitionBD server listening on port ${port}`);
});
