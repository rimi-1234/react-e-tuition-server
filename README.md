# Edurock API

Node and Express API for the Edurock tuition platform.

## Render

1. Create a Render Web Service from this repository.
2. Set the root directory to `backend`.
3. Build command: `npm install`
4. Start command: `npm start`
5. Health check path: `/health`
6. Add the environment variables from `.env.example`.

`render.yaml` at the repository root describes the same service for a Render Blueprint.

## Vercel

The API can also run as a Vercel Node function. `vercel.json` sends every route to `index.js`, and the file exports the Express app. Set the same environment variables in the Vercel project, with the project root set to `backend`.

Use Render when you want a long-running server. Vercel is suitable for the HTTP API, with MongoDB Atlas network access open to Vercel (`0.0.0.0/0`).

## Environment

Copy `.env.example` to `.env`. `FB_SERVICE_KEY` is the Firebase service account JSON, either raw JSON or base64. The process stays up if that key or Stripe is missing; protected and payment routes then return a clear error instead of crashing the deploy.
