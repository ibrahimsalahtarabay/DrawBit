# DrawBit — Autodesk Reseller Website

A full-stack website for an Autodesk solutions partner, featuring a public homepage,
client portal with invoice downloads, and a full admin panel.

---

## Project Structure

```
DrawBit/
├── backend/
│   ├── server.js               ← Express entry point
│   ├── db/
│   │   ├── schema.sql          ← PostgreSQL tables + seed admin
│   │   └── pool.js             ← pg connection pool
│   ├── middleware/
│   │   └── auth.js             ← JWT authenticate + requireAdmin
│   ├── routes/
│   │   ├── auth.js             ← POST /api/auth/login, GET /api/auth/me
│   │   ├── clients.js          ← CRUD /api/clients (admin only)
│   │   └── invoices.js         ← CRUD /api/invoices + PDF
│   └── templates/
│       └── invoice.html        ← Puppeteer PDF template
├── frontend/
│   ├── style.css               ← Shared design system
│   ├── index.html              ← Home (about, projects, clients)
│   ├── portal.html             ← Client login + invoice dashboard
│   ├── contact.html            ← Contact page
│   └── admin/
│       └── index.html          ← Admin panel (clients + invoices)
├── .env.example
├── .gitignore
└── package.json
```

---

## Local Setup (Step by Step)

### Prerequisites
- Node.js 18+  →  https://nodejs.org
- PostgreSQL 14+  →  https://www.postgresql.org/download/

### 1. Clone / download the project

```bash
# If using git:
git clone <your-repo-url> DrawBit
cd DrawBit

# Or just place the folder wherever you want and cd into it
cd DrawBit
```

### 2. Install dependencies

```bash
npm install
```

> Note: Puppeteer (~300MB) downloads Chromium automatically. This takes a minute.

### 3. Create PostgreSQL database

Open psql or pgAdmin and run:
```sql
CREATE DATABASE drawbit;
```

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/drawbit
JWT_SECRET=any_long_random_string_here
PORT=3000
NODE_ENV=development
```

### 5. Run the database schema

```bash
npm run db:setup
```

This creates all tables and seeds the default admin account:
- **Username:** `admin`
- **Password:** `admin123`

### 6. Start the server

```bash
npm run dev        # hot-reload with nodemon
# or
npm start          # production mode
```

### 7. Open in browser

| URL | What |
|-----|------|
| http://localhost:3000 | Public homepage |
| http://localhost:3000/portal.html | Client login |
| http://localhost:3000/contact.html | Contact page |
| http://localhost:3000/admin/ | Admin panel |
| http://localhost:3000/api/health | API health check |

---

## Default Credentials

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `admin123` |

> ⚠️ Change the admin password in production by updating the hash in the DB.

---

## API Reference

### Auth
```
POST   /api/auth/login     { username, password } → { token, user }
GET    /api/auth/me        (Bearer token) → { user }
```

### Clients (Admin only)
```
GET    /api/clients
GET    /api/clients/:id
POST   /api/clients        { username, password, full_name, email }
PUT    /api/clients/:id    { full_name, email, password? }
DELETE /api/clients/:id
```

### Invoices
```
GET    /api/invoices                   Admin: all | Client: own only
GET    /api/invoices/:id               Full invoice + line items
GET    /api/invoices/:id/pdf           Download PDF (also accepts ?token=)
POST   /api/invoices                   Admin only
PUT    /api/invoices/:id               Admin only
DELETE /api/invoices/:id               Admin only
```

---

## Deployment (Render.com — Free Tier)

1. Push to GitHub
2. Go to https://render.com → New → Web Service → connect repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add a **PostgreSQL** database (free tier) from Render dashboard
6. In your Web Service, add environment variables:
   - `DATABASE_URL` → copy from Render PostgreSQL "External Database URL"
   - `JWT_SECRET` → any long random string
   - `NODE_ENV` → `production`
7. Once deployed, open the **Shell** tab and run:
   ```bash
   npm run db:setup
   ```
8. Your site is live! 🎉

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js 18 + Express 4 |
| Database | PostgreSQL + pg |
| Auth | JWT (jsonwebtoken) + bcrypt |
| PDF | Puppeteer (headless Chrome) |
| Frontend | Vanilla HTML/CSS/JS |
| Hosting | Render.com (free tier) |
