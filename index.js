// server.js (eTuitionBD)
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// const stripe = require('stripe')(process.env.STRIPE_SECRET);
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
app.use(cors({
  origin: "http://localhost:5173",   // React origin
  credentials: true                  // Allow cookies/token
}));

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
    await client.connect();
    const db = client.db('etuition_db');
    const usersCollection = db.collection('users');           // students/tutors/admin
    const tuitionsCollection = db.collection('tuitions');   // tuition posts
    const applicationsCollection = db.collection('applications');
    const tutorsCollection = db.collection('tutors');
    // const paymentsCollection = db.collection('payments');   // payments (Stripe)
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
      if (!user || user.role !== 'tutor') return res.status(403).send({ message: 'forbidden access' });
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

    // admin change role
    // app.patch('/users/:id/role', verifyFBToken, verifyAdmin, async (req, res) => {
    //   const id = req.params.id;
    //   const roleInfo = req.body;
    //   const query = { _id: new ObjectId(id) };
    //   const result = await usersCollection.updateOne(query, { $set: { role: roleInfo.role }});
    //   res.send(result);
    // });

    // /* -------------------------
    //    Tuitions routes
    // -------------------------*/
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
    app.get('/tuitions/status', async (req, res) => {
      try {
        const { search, status, filterClass, sort, page = 1, limit = 8 } = req.query;

        // 1. Convert page/limit to numbers
        const pageNumber = parseInt(page);
        const limitNumber = parseInt(limit);
        const skip = (pageNumber - 1) * limitNumber;

        let query = {};

        // 2. Filters
        if (status) query.status = status;
        if (filterClass) query.class = { $regex: filterClass, $options: 'i' };
        if (search) {
          query.$or = [
            { subject: { $regex: search, $options: 'i' } },
            { location: { $regex: search, $options: 'i' } }
          ];
        }

        // 3. Sorting
        let sortOptions = { _id: -1 };
        if (sort === 'salary_asc') sortOptions = { budget: 1 };
        else if (sort === 'salary_desc') sortOptions = { budget: -1 };
        else if (sort === 'oldest') sortOptions = { _id: 1 };

        // 4. Fetch Data with Pagination
        const tuitions = await tuitionsCollection
          .find(query)
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNumber)
          .toArray();

        // 5. Get Total Count (for calculating total pages on frontend)
        const total = await tuitionsCollection.countDocuments(query);

        res.send({ tuitions, total });

      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Error fetching tuitions" });
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
    // GET /users/tutors - Fetch Tutors from tutorsCollection
    // Make sure this is defined at the top of your file!
    // Check your MongoDB Atlas: Is the collection named "tutor", "tutors", or "applications"?
    // const tutorsCollection = client.db("yourDBName").collection("tutors"); 

    // Make sure this is defined at the top of your file!
    // Check your MongoDB Atlas: Is the collection named "tutor", "tutors", or "applications"?
    // const tutorsCollection = client.db("yourDBName").collection("tutors"); 

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
    // // get tuitions - public with filters, search, pagination
    // app.get('/tuitions', async (req, res) => {
    //   const { subject, className, location, page = 1, limit = 10, q, sort } = req.query;
    //   const query = {};

    //   if (subject) query.subject = { $regex: subject, $options: 'i' };
    //   if (className) query.className = className;
    //   if (location) query.location = { $regex: location, $options: 'i' };
    //   if (q) {
    //     query.$or = [
    //       { title: { $regex: q, $options: 'i' } },
    //       { description: { $regex: q, $options: 'i' } },
    //       { subject: { $regex: q, $options: 'i' } },
    //     ];
    //   }

    //   const skip = (parseInt(page) - 1) * parseInt(limit);
    //   const cursor = tuitionsCollection.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    //   const data = await cursor.toArray();
    //   const total = await tuitionsCollection.countDocuments(query);
    //   res.send({ data, total, page: parseInt(page) });
    // });

    // // get one tuition
    // app.get('/tuitions/:id', async (req, res) => {
    //   const id = req.params.id;
    //   const tuition = await tuitionsCollection.findOne({ _id: new ObjectId(id) });
    //   res.send(tuition);
    // });

    // // update tuition (student who created it)
    // app.put('/tuitions/:id', verifyFBToken, verifyStudent, async (req, res) => {
    //   const id = req.params.id;
    //   const updates = req.body;
    //   const tuition = await tuitionsCollection.findOne({ _id: new ObjectId(id) });
    //   if (!tuition) return res.status(404).send({ message: 'tuition not found' });
    //   if (tuition.studentEmail !== req.decoded_email) return res.status(403).send({ message: 'forbidden' });
    //   // only allow editing when still pending or rejected
    //   if (tuition.status === 'approved') return res.status(400).send({ message: 'cannot edit approved tuition' });

    //   const result = await tuitionsCollection.updateOne({ _id: new ObjectId(id) }, { $set: updates });
    //   await log('tuition_updated', { tuitionId: id, by: req.decoded_email });
    //   res.send(result);
    // });

    // delete tuition (student)
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

      const updatedDoc = {
        $set: {
          subject: item.subject,
          class: item.class,
          location: item.location,
          salary: item.salary,
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
      console.log(status);
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
      console.log(email);


      const user = await usersCollection.findOne({ email });


      res.send({ role: user?.role || 'Student' });
    });




    // /* -------------------------
    //    Applications routes (tutors apply)
    // -------------------------*/
    // // tutor applies to a tuition
    // app.post('/applications', verifyFBToken, verifyTutor, async (req, res) => {
    //   const application = req.body; // { tuitionId, qualifications, experience, expectedSalary }
    //   application.tutorEmail = req.decoded_email;
    //   application.tutorId = req.user?._id || null;
    //   application.status = 'pending'; // pending student approval + payment
    //   application.createdAt = new Date();
    //   const result = await applicationsCollection.insertOne(application);
    //   await log('application_created', { applicationId: result.insertedId, tuitionId: application.tuitionId, by: application.tutorEmail });
    //   res.send(result);
    // });

    // // student view applications for a tuition (only the owning student)
    // app.get('/tuitions/:id/applications', verifyFBToken, verifyStudent, async (req, res) => {
    //   const tuitionId = req.params.id;
    //   const tuition = await tuitionsCollection.findOne({ _id: new ObjectId(tuitionId) });
    //   if (!tuition) return res.status(404).send({ message: 'tuition not found' });
    //   if (tuition.studentEmail !== req.decoded_email) return res.status(403).send({ message: 'forbidden' });

    //   const apps = await applicationsCollection.find({ tuitionId }).sort({ createdAt: -1 }).toArray();
    //   res.send(apps);
    // });

    // // student approve application -> triggers payment (student must be logged)
    // // we'll create a checkout session endpoint (student calls to get session url)
    // app.post('/payment-checkout-session', verifyFBToken, verifyStudent, async (req, res) => {
    //   const { applicationId, tuitionId, amount } = req.body;
    //   // validate application and tuition
    //   const application = await applicationsCollection.findOne({ _id: new ObjectId(applicationId) });
    //   const tuition = await tuitionsCollection.findOne({ _id: new ObjectId(tuitionId) });
    //   if (!application || !tuition) return res.status(404).send({ message: 'not found' });
    //   if (tuition.studentEmail !== req.decoded_email) return res.status(403).send({ message: 'forbidden' });

    //   // create minimal metadata
    //   const bookingId = generateBookingId();

    //   const session = await stripe.checkout.sessions.create({
    //     line_items: [
    //       {
    //         price_data: {
    //           currency: 'usd',
    //           unit_amount: Math.round(parseFloat(amount) * 100), // amount in cents
    //           product_data: {
    //             name: `Tuition Payment for ${tuition.subject} (${tuition.className || ''})`
    //           }
    //         },
    //         quantity: 1
    //       }
    //     ],
    //     mode: 'payment',
    //     metadata: {
    //       applicationId: applicationId.toString(),
    //       tuitionId: tuitionId.toString(),
    //       bookingId,
    //     },
    //     customer_email: req.decoded_email,
    //     success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    //     cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`
    //   });

    //   // Optionally save a pending payment record
    //   await paymentsCollection.insertOne({
    //     tuitionId,
    //     applicationId,
    //     bookingId,
    //     studentEmail: req.decoded_email,
    //     amount: parseFloat(amount),
    //     status: 'pending',
    //     createdAt: new Date(),
    //     stripeSessionId: session.id
    //   });

    //   res.send({ url: session.url });
    // });

    // // route to confirm payment after redirect (you used similar logic before)
    // // this endpoint fetches the session and updates DB (student can be redirected here)
    // app.patch('/payment-success', async (req, res) => {
    //   const sessionId = req.query.session_id;
    //   if (!sessionId) return res.status(400).send({ message: 'missing session id' });

    //   const session = await stripe.checkout.sessions.retrieve(sessionId);
    //   const paymentIntentId = session.payment_intent;
    //   const metadata = session.metadata || {};
    //   const applicationId = metadata.applicationId;
    //   const tuitionId = metadata.tuitionId;
    //   const bookingId = metadata.bookingId;

    //   // avoid duplicate
    //   const already = await paymentsCollection.findOne({ transactionId: paymentIntentId });
    //   if (already) {
    //     return res.send({ message: 'already exists', transactionId: paymentIntentId });
    //   }

    //   if (session.payment_status === 'paid') {
    //     // update application status -> approved
    //     if (applicationId) {
    //       await applicationsCollection.updateOne({ _id: new ObjectId(applicationId) }, { $set: { status: 'approved', approvedAt: new Date(), bookingId }});
    //     }
    //     // update tuition status -> booked (optional)
    //     if (tuitionId) {
    //       await tuitionsCollection.updateOne({ _id: new ObjectId(tuitionId) }, { $set: { status: 'booked', bookedAt: new Date(), bookingId }});
    //     }

    //     // insert payment record
    //     const payment = {
    //       amount: session.amount_total / 100,
    //       currency: session.currency,
    //       studentEmail: session.customer_email,
    //       tuitionId: tuitionId,
    //       applicationId: applicationId,
    //       transactionId: paymentIntentId,
    //       paymentStatus: session.payment_status,
    //       paidAt: new Date(),
    //       bookingId
    //     };
    //     const resultPayment = await paymentsCollection.insertOne(payment);
    //     await log('payment_success', { payment, sessionId });

    //     return res.send({
    //       success: true,
    //       transactionId: paymentIntentId,
    //       bookingId,
    //       paymentInfo: resultPayment
    //     });
    //   }

    //   return res.send({ success: false });
    // });

    // // student can view their payments
    // app.get('/payments', verifyFBToken, async (req, res) => {
    //   const email = req.query.email;
    //   if (!email) return res.status(400).send({ message: 'email required' });
    //   if (email !== req.decoded_email) return res.status(403).send({ message: 'forbidden access' });
    //   const payments = await paymentsCollection.find({ studentEmail: email }).sort({ paidAt: -1 }).toArray();
    //   res.send(payments);
    // });

    // /* -------------------------
    //    Applications status change (student approve/reject without payment, or admin override)
    // -------------------------*/
    // // Student can reject an application (set to rejected)
    // app.patch('/applications/:id/reject', verifyFBToken, verifyStudent, async (req, res) => {
    //   const id = req.params.id;
    //   const application = await applicationsCollection.findOne({ _id: new ObjectId(id) });
    //   if (!application) return res.status(404).send({ message: 'application not found' });

    //   // ensure the student owns the tuition
    //   const tuition = await tuitionsCollection.findOne({ _id: new ObjectId(application.tuitionId) });
    //   if (!tuition) return res.status(404).send({ message: 'tuition not found' });
    //   if (tuition.studentEmail !== req.decoded_email) return res.status(403).send({ message: 'forbidden' });

    //   const result = await applicationsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: 'rejected', rejectedAt: new Date() }});
    //   await log('application_rejected', { applicationId: id, by: req.decoded_email });
    //   res.send(result);
    // });

    // // Admin can override application status
    // app.patch('/admin/applications/:id/status', verifyFBToken, verifyAdmin, async (req, res) => {
    //   const id = req.params.id;
    //   const { status } = req.body; // approved / rejected / pending
    //   const result = await applicationsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status }});
    //   await log('admin_application_status', { applicationId: id, status, by: req.decoded_email });
    //   res.send(result);
    // });

    // /* -------------------------
    //    Tutor public/profile endpoints
    // -------------------------*/
    // // get tutors (basic)
    // app.get('/tutors', async (req, res) => {
    //   const { q, subject, page = 1, limit = 10 } = req.query;
    //   const query = { role: 'tutor' }; // users collection stores tutor profiles
    //   if (q) {
    //     query.$or = [
    //       { name: { $regex: q, $options: 'i' } },
    //       { qualifications: { $regex: q, $options: 'i' } },
    //     ];
    //   }
    //   if (subject) query.subjects = { $in: [subject] };
    //   const skip = (parseInt(page) - 1) * parseInt(limit);
    //   const tutors = await usersCollection.find(query).skip(skip).limit(parseInt(limit)).toArray();
    //   res.send(tutors);
    // });

    // // tutor profile
    // app.get('/tutors/:id', async (req, res) => {
    //   const id = req.params.id;
    //   const tutor = await usersCollection.findOne({ _id: new ObjectId(id), role: 'tutor' });
    //   res.send(tutor);
    // });

    // /* -------------------------
    //    Admin reports
    // -------------------------*/
    // app.get('/admin/reports', verifyFBToken, verifyAdmin, async (req, res) => {
    //   // simple summary: total users, total tuitions, total payments sum
    //   const totalUsers = await usersCollection.countDocuments();
    //   const totalTuitions = await tuitionsCollection.countDocuments();
    //   const paymentsAgg = await paymentsCollection.aggregate([
    //     { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
    //   ]).toArray();
    //   const totalPayments = paymentsAgg[0] || { total: 0, count: 0 };
    //   res.send({ totalUsers, totalTuitions, totalPayments });
    // });

    // /* -------------------------
    //    Utility / logs / health
    // -------------------------*/
    // app.get('/logs', verifyFBToken, verifyAdmin, async (req, res) => {
    //   const logs = await logsCollection.find({}).sort({ createdAt: -1 }).limit(200).toArray();
    //   res.send(logs);
    // });

    // server root
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
