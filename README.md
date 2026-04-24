# ☕ Sip & Savour

A private, invite-only app for rating and discovering coffee shops, restaurants, pubs, bakeries, and more. Built for Railway deployment with PostgreSQL and Cloudinary image hosting.

---

## Features

- **Invite-only access** — admin creates usernames and passwords directly
- **Add any establishment** — coffee shops, restaurants, pubs, bakeries, bars, cafés, and more
- **Star ratings (1–5)** with optional comments and visit date
- **Multiple reviews per place** — Bob rates it in March, Carol adds hers in June; both are shown with dates
- **Photo uploads** — up to 5 photos per review, stored on Cloudinary
- **Search** by name, city, or address
- **Near Me** — uses browser geolocation to find places within a configurable radius
- **Admin panel** — create/remove users, reset passwords

---

## Tech Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express |
| Database | PostgreSQL (Railway managed) |
| Sessions | connect-pg-simple (stored in Postgres) |
| Auth | bcryptjs (bcrypt hashing) |
| Images | Cloudinary + multer-storage-cloudinary |
| Templates | EJS |
| Deployment | Railway |

---

## Local Development

### 1. Clone and install

```bash
git clone <your-repo>
cd sip-and-savour
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/sipandsavour
SESSION_SECRET=some-long-random-string
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
ADMIN_USERNAME=dave
ADMIN_PASSWORD=your-initial-password
NODE_ENV=development
```

### 3. Create a local Postgres database

```bash
createdb sipandsavour
```

### 4. Run

```bash
npm run dev
```

The app auto-creates all tables on first run and seeds the admin user from `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

---

## Railway Deployment

### Step 1 — Create a Railway project

1. Go to [railway.app](https://railway.app) and create a new project
2. Add a **PostgreSQL** database service
3. Add a **new service** from your GitHub repo (or deploy from CLI with `railway up`)

### Step 2 — Set environment variables

In your Railway service → **Variables**, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | *(auto-set by Railway when you link the Postgres service)* |
| `SESSION_SECRET` | A long random string (use `openssl rand -hex 32`) |
| `CLOUDINARY_CLOUD_NAME` | From cloudinary.com |
| `CLOUDINARY_API_KEY` | From cloudinary.com |
| `CLOUDINARY_API_SECRET` | From cloudinary.com |
| `ADMIN_USERNAME` | Your username (e.g. `dave`) |
| `ADMIN_PASSWORD` | Your initial password |
| `NODE_ENV` | `production` |

> **Important:** Link your Postgres service to your app service in Railway so `DATABASE_URL` is injected automatically.

### Step 3 — Deploy

Railway will build and deploy automatically on push to your connected branch. The app will:
1. Connect to Postgres
2. Run the schema SQL (idempotent — safe to re-run)
3. Create the admin user if not already present
4. Start listening on the Railway-assigned `PORT`

### Step 4 — First login

Visit your Railway URL, log in with your `ADMIN_USERNAME` / `ADMIN_PASSWORD`, then go to `/admin` to invite others.

---

## Cloudinary Setup

1. Sign up at [cloudinary.com](https://cloudinary.com) — the free tier is plenty
2. From your dashboard, copy **Cloud name**, **API Key**, and **API Secret**
3. Add them to your Railway environment variables

Photos are stored under the `sip-and-savour` folder in your Cloudinary account, auto-resized to max 1200×900px.

---

## Adding the Near Me Feature

When adding or editing a place, click **"Use my current location"** to capture lat/lng from the browser. This enables the Near Me search on the Search page to calculate distances using the Haversine formula directly in Postgres — no external geo service needed.

---

## Admin Guide

Go to `/admin` (only visible if you're an admin).

**Creating a user:**
1. Enter a username and temporary password
2. Optionally tick "Give admin access"
3. Share the app URL + credentials with your invitee directly

**Resetting a password:**
- Click "Reset pw" next to any user and enter the new password

**Removing a user:**
- Click "Remove" — their reviews remain (linked by user ID)

---

## Project Structure

```
sip-and-savour/
├── server.js              # Entry point
├── db/
│   ├── index.js           # Pool + initDb
│   └── schema.sql         # All CREATE TABLE statements
├── middleware/
│   ├── auth.js            # requireAuth / requireAdmin
│   └── upload.js          # Cloudinary + multer config
├── routes/
│   ├── auth.js            # GET/POST /login, POST /logout
│   ├── places.js          # Home, search, add, place detail, reviews, nearby API
│   └── admin.js           # /admin user management
├── views/
│   ├── partials/
│   │   ├── header.ejs
│   │   └── footer.ejs
│   ├── login.ejs
│   ├── home.ejs
│   ├── search.ejs
│   ├── add-establishment.ejs
│   ├── place.ejs
│   ├── admin.ejs
│   └── error.ejs
└── public/
    └── css/
        └── style.css
```

---

## Notes

- Sessions are stored in Postgres (the `session` table is created automatically by connect-pg-simple)
- The `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars are only used on first run to seed the admin — you can remove them afterwards if you like
- Deleting a review also deletes its photos from Cloudinary
- The schema uses `IF NOT EXISTS` throughout so deployments are safe to restart without duplicating tables
