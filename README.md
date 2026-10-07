# EchoSphere

Full-stack project setup with **Next.js (Tailwind CSS)** frontend and **FastAPI** backend.

---

## Project Structure

```
echosphere/
├── frontend/             # Next.js (TypeScript, Tailwind CSS, App Router)
└── backend/              # FastAPI Backend (Python, Uvicorn, CORS configured)
```

---

## Getting Started

### 1. Backend (FastAPI)

Navigate to `backend` directory:
```bash
cd backend
```

Create a virtual environment & install dependencies:
```bash
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
```

Run FastAPI development server:
```bash
uvicorn main:app --reload --port 8000
```
- API is live at: `http://localhost:8000`
- Interactive API Docs (Swagger): `http://localhost:8000/docs`

---

### 2. Frontend (Next.js + Tailwind CSS)

Navigate to `frontend` directory:
```bash
cd frontend
```

Install dependencies (if not already installed) & start dev server:
```bash
npm run dev
```
- App is live at: `http://localhost:3000`
