# 🎓 React E-Tuition Platform - Backend API

The **React E-Tuition Backend** is a secure RESTful API built with **Node.js**, **Express.js**, and **MongoDB**. It powers the React E-Tuition Platform by managing authentication, tuition posts, tutor applications, payments, and user roles. The backend also integrates **Firebase Admin**, **JWT**, and **Stripe** to provide secure authentication and payment processing.

🌐 **Live API:** [(https://react-e-tution-session-sever.vercel.app/)]

---

# 📸 Preview
![E-Tuition Server Preview](https://raw.githubusercontent.com/rimi-1234/react-e-tuition-server/main/623681359-6f64352b-de43-45ed-8680-7f3ed4698787.png)

---

# ✨ Features

- 🔐 Firebase Admin Authentication
- 🛡️ JWT-Based Route Protection
- 👥 Role-Based Access Control (Student, Tutor & Admin)
- 📚 Tuition Post CRUD Operations
- 📝 Tutor Application Management
- 💳 Stripe Payment Integration
- 👤 User Management APIs
- 🔍 Search & Filter Support
- 🗄️ MongoDB Database Integration
- ⚡ RESTful API with Express.js
- 🌍 CORS Enabled
- 🔒 Secure Environment Variables

---

# 🛠️ Tech Stack

## Backend

- Node.js
- Express.js

## Database

- MongoDB (Native Driver)

## Authentication

- Firebase Admin SDK
- JSON Web Token (JWT)

## Payment

- Stripe

## Deployment

- Vercel

---

# 📦 Backend Dependencies

```json
{
  "express": "^4.x",
  "mongodb": "^6.x",
  "firebase-admin": "^12.x",
  "jsonwebtoken": "^9.x",
  "stripe": "^17.x",
  "cors": "^2.x",
  "dotenv": "^16.x",
  "nodemon": "^3.x"
}
```

---

# 📂 Project Structure

```text
react-e-tuition-server/
│
├── routes/
├── middleware/
├── utils/
├── .env
├── index.js
├── package.json
└── README.md
```

---

# ⚙️ Local Installation & Setup

## Prerequisites

- Node.js (v18 or later)
- npm
- Git
- MongoDB Atlas Account
- Firebase Project
- Stripe Account

---

## 1️⃣ Clone the Repository

```bash
git clone https://github.com/rimi-1234/react-e-tuition-server.git
```

Move into the project directory:

```bash
cd react-e-tuition-server
```

---

## 2️⃣ Install Dependencies

```bash
npm install
```

---

## 3️⃣ Configure Environment Variables

Create a file named:

```text
.env
```

Add the following:

```env
PORT=5000

DB_USER=your_mongodb_username

DB_PASS=your_mongodb_password

ACCESS_TOKEN_SECRET=your_jwt_secret

STRIPE_SECRET_KEY=your_stripe_secret_key

CLIENT_URL=http://localhost:5173

FIREBASE_PROJECT_ID=your_project_id

FIREBASE_CLIENT_EMAIL=your_client_email

FIREBASE_PRIVATE_KEY=your_private_key
```

---

## 4️⃣ Start the Development Server

```bash
npm run dev
```

or

```bash
npm start
```

The backend will run at:

```text
http://localhost:5000
```

---

# 📜 Available Scripts

```bash
npm install
```

Install project dependencies.

```bash
npm run dev
```

Run the backend with Nodemon.

```bash
npm start
```

Start the production server.

---

# 🌐 API Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | `/tuition` | Get all tuition posts |
| GET | `/tuition/:id` | Get a single tuition post |
| POST | `/tuition` | Create a tuition post |
| PATCH | `/tuition/:id` | Update a tuition post |
| DELETE | `/tuition/:id` | Delete a tuition post |
| GET | `/applications` | Get tutor applications |
| POST | `/applications` | Apply for a tuition |
| GET | `/users` | Get all users |
| PATCH | `/users/:id` | Update user role |
| POST | `/jwt` | Generate JWT Token |
| POST | `/create-payment-intent` | Create Stripe Payment Intent |

---

# 🔐 Authentication

Authentication is implemented using:

- Firebase Admin SDK
- JWT (JSON Web Token)
- Protected API Routes
- Role-Based Authorization

---

# 💳 Payment Integration

Stripe is used for secure online payments.

Features include:

- Secure Payment Intent
- Booking Confirmation
- BDT Currency Support
- Payment Verification

---

# 🗄️ Database

MongoDB stores:

- Users
- Tutors
- Students
- Tuition Posts
- Applications
- Payments

---

# 🚀 Deployment

The backend is deployed on **Vercel**.

### Install Dependencies

```bash
npm install
```

### Start Server

```bash
npm start
```

Configure all required environment variables in your Vercel project before deployment.

---

# 🤝 Contributing

1. Fork the repository.

2. Create a feature branch.

```bash
git checkout -b feature-name
```

3. Commit your changes.

```bash
git commit -m "Added new feature"
```

4. Push the branch.

```bash
git push origin feature-name
```

5. Open a Pull Request.

---

# 📄 License

This project is licensed under the MIT License.

---

# 👨‍💻 Author

**Rimi**

GitHub: https://github.com/rimi-1234

---

# 🌐 Live API

https://react-e-tution-session-sever.vercel.app/
