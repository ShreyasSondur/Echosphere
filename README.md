# Najran Kabeer & Benji Beats Live — Concert Ticketing Platform

A full-stack, high-security concert ticketing website built with **Next.js 16 (Turbopack, Three.js, Tailwind CSS v4)** and **FastAPI** running on **Port 8002**.

---

## Highlights

- **Single Hero Experience**: A dedicated full-screen concert stage hero with a high-impact **"Book Now"** action.
- **Three.js 3D Interactive Stage**: Vintage 3D studio microphone, rotating vinyl orbit rings, pulsating audio wave visualizer, volumetric spotlight cones, and mouse-parallax reactivity.
- **Cinematic Loading Screen**: Atmospheric frequency tuning and audio calibration animations connecting directly into the 3D stage.
- **Sequential Ticket Numbering starting at `001`**: Atomic SQLite transaction guarantees strict sequence (`001`, `002`, `003`...) with zero race conditions.
- **Automated SMTP 2FA Confirmation Email**: Dispatches a digital concert pass with ticket ID, attendee info, venue guidelines, and entry barcode to the attendee's email via Gmail SSL on port 465.
- **Hardened Security**:
  - Runs on isolated **Port 8002**.
  - Rate limiting (sliding window per client IP) to block ticket scalping / bot flood.
  - Strict HTTP security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `CSP`, `HSTS`).
  - SHA-256 ticket verification tokens.
- **Payment Gateway Ready**: Plug-and-play architecture for Razorpay, Stripe, or any gateway API key.

---

## System Architecture

```
eco/
├── frontend/                     # Next.js 16 + Three.js + Tailwind CSS v4
│   ├── src/
│   │   ├── app/
│   │   │   ├── globals.css       # Theme styling
│   │   │   ├── layout.tsx        # SEO & metadata
│   │   │   └── page.tsx          # Single Hero Section
│   │   └── components/
│   │       ├── ConcertCanvas3D.tsx # Three.js 3D microphone & visualizer stage
│   │       ├── LoadingScreen.tsx   # Cinematic stage calibration loader
│   │       └── BookingModal.tsx    # Glassmorphic pass selection & checkout
│   ├── .env.local                # Points to http://localhost:8002
│   └── package.json
│
└── backend/                      # High-security FastAPI service on Port 8002
    ├── .venv/                    # Python virtual environment
    ├── .env                      # SMTP 2FA config & port 8002
    ├── main.py                   # API endpoints, security middleware, rate limiter
    ├── database.py               # Atomic sequential ticket numbering (001...)
    ├── email_service.py          # SMTP SSL HTML ticket generator & sender
    └── requirements.txt
```

---

## Active Ports & URLs

| Service | Port / URL | Status | Description |
|---|---|---|---|
| **Concert Website** | [http://localhost:3000](http://localhost:3000) | **Active** | 3D Hero + Booking Gateway |
| **FastAPI Backend** | [http://localhost:8002](http://localhost:8002) | **Active** | High-security REST API |
| **Swagger UI Docs** | [http://localhost:8002/docs](http://localhost:8002/docs) | **Active** | Interactive API Playground |

---

## API Endpoints

- `GET /api/health`: Health probe & SMTP status
- `GET /api/tickets/stats`: Live tickets sold, capacity, and next ticket ID
- `GET /api/tickets/tier-settings`: Live pricing, strikethrough price, and scarcity metrics
- `PUT /api/admin/tier-settings`: Admin endpoint to update live ticket price, strikethrough price, and scarcity
- `POST /api/tickets/book`: Reserves next sequential pass, saves to DB, dispatches confirmation email
- `GET /api/tickets/verify/{ticket_number}`: Gate security check verifying validity of ticket ID
- `POST /api/admin/tickets/{ticket_number}/resend-email`: One-click resend confirmation email

---

## Deployment Setup

### 1. Backend Deployment (Contabo VPS `13.140.172.117:8002`)
To update the backend on the VPS:
```bash
# SSH into the VPS or open terminal via VNC
ssh root@13.140.172.117

# Navigate to project directory
cd /root/Echosphere || cd /var/www/Echosphere || cd ~/eco

# Pull the latest commits from GitHub
git pull origin main

# Execute automated deployment script
bash deploy.sh
```
`deploy.sh` automatically:
1. Restores `.env` from `env.b64` (with `ADMIN_EMAIL=shreyas.u.sondur@gmail.com`).
2. Installs backend dependencies in `.venv`.
3. Restarts the `echosphere-backend.service` systemd service.
4. Verifies health status via `http://127.0.0.1:8002/api/health`.

### 2. Frontend Deployment (`echosphere.suiet.website`)
* **Vercel (Automatic):** Pushing to `origin/main` automatically triggers a build and deploy on Vercel.
* **Manual / VPS Node.js Server:**
```bash
cd frontend
git pull origin main
npm install
npm run build
pm2 restart frontend || npm run start
```

