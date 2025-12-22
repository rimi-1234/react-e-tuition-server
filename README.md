# 🎓 React E-Tuition Platform

A full-stack MERN application designed to streamline the connection between students and tutors. This platform allows students to post tuition needs, tutors to apply for jobs, and facilitates secure payment processing for tuition bookings via Stripe.

### 🔗 Live Links

| Component | Status | URL |
| :--- | :--- | :--- |
| **Frontend (Client)** | 🟢 Live | **[https://react-e-tution-session-client.vercel.app](https://react-e-tution-session-client.vercel.app/)** |
| **Backend (Server)** | 🟢 Live | **[https://react-e-tution-session-sever.vercel.app](https://react-e-tution-session-sever.vercel.app/)** |

---

## 🎯 Purpose

The **React E-Tuition Platform** was built to solve the inefficiency of finding reliable academic tutors. In many areas, the process is manual and disorganized. This platform solves that by providing:

1.  **Trust & Verification:** A centralized marketplace where verified tutors can find work.
2.  **Secure Transactions:** Eliminates payment risks by integrating **Stripe** for secure booking fees.
3.  **Role-Based Access:** Distinct, optimized workflows for Students (hiring), Tutors (applying), and Admins (managing).

---

## ✨ Key Features

* **🔐 Authentication:** Secure login & registration using **Firebase** (Google & Email/Password).
* **🛡️ Role-Based Access Control (RBAC):**
    * **Students:** Post tuition jobs, manage applications, book tutors.
    * **Tutors:** Browse jobs, filter by subject/class, apply for positions.
    * **Admins:** Manage users, verify tutors, oversee platform activity.
* **💳 Secure Payments:** Integrated **Stripe Payment Gateway** (supports BDT currency) for booking confirmations.
* **📄 Tuition Management:** Full CRUD (Create, Read, Update, Delete) capabilities for tuition posts.
* **⚡ Real-time Data:** Powered by **TanStack Query** for efficient data fetching and caching.

---

## 📦 Packages Used

### **💻 Client-Side (Frontend)**
* **Framework:** `react`, `react-router-dom` (Vite)
* **Styling:** `tailwindcss`, `daisyui`
* **State & API:** `@tanstack/react-query`, `axios`
* **Authentication:** `firebase`
* **Payment:** `@stripe/react-stripe-js`, `@stripe/stripe-js`
* **UI Components:** `sweetalert2`, `react-hot-toast`, `react-icons`

### **⚙️ Server-Side (Backend)**
* **Runtime:** `node`, `express`
* **Database:** `mongodb` (Native Driver)
* **Authentication:** `firebase-admin`
* **Security:** `cors`, `dotenv`, `jsonwebtoken` (JWT)
* **Payment:** `stripe` (Backend SDK)
* **Development:** `nodemon`

---

## 🚀 Run Locally

Follow these steps to run the project on your local machine.

### 1. Clone the Repository
```bash
git clone [https://github.com/rimi-1234/react-e-tuition-client.git](https://github.com/rimi-1234/react-e-tuition-client.git)
2. Backend Setup
Navigate to the server folder and install dependencies:

Bash

cd backend
npm install
Create a .env file in the backend folder with your credentials:

Code snippet

PORT=5000
DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password
ACCESS_TOKEN_SECRET=your_jwt_secret
STRIPE_SECRET_KEY=your_stripe_secret_key
CLIENT_URL=http://localhost:5173
Start the server:

Bash

npm start
3. Frontend Setup
Navigate to the client folder and install dependencies:

Bash

cd client
npm install
Create a .env.local file in the client folder:

Code snippet

VITE_apiKey=your_firebase_api_key
VITE_authDomain=your_firebase_auth_domain
VITE_projectId=your_firebase_project_id
