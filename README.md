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
- `GET /api/tickets/stats`: Live tickets sold, capacity, and next ticket ID (`001`)
- `GET /api/tickets/tiers`: Available passes (`General Admission`, `VIP Fan Pit`, `Backstage All-Access`)
- `POST /api/tickets/book`: Reserves next sequential pass, saves to DB, dispatches confirmation email
- `GET /api/tickets/verify/{ticket_number}`: Gate security check verifying validity of ticket ID
- `POST /api/tickets/test-email`: Verifies SMTP connectivity by sending a test ticket
