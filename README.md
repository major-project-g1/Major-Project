# CyberForensics AI — G1 | CSEP23605

**Intelligent Multi-Threat Cyber Forensics Platform**

Team: Dhyan Kumar M · Vathsalya V · Meghana H J · Sammita Abhay  
Guide: Mr. B S Umashankar | Dept. of CSE, GAT | 2025–26

---

## Project Structure

```
project/
├── frontend/
│   ├── index.html          ← Open this in browser
│   ├── css/
│   │   └── style.css       ← All styles
│   └── js/
│       └── app.js          ← All frontend logic
│
├── backend/
│   ├── app.py              ← Flask API with ML model
│   ├── model.pkl           ← Trained XGBoost-v1 model
│   └── requirements.txt    ← Python dependencies
│
└── README.md
```

---

## Setup & Run

### Supabase authentication setup

1. Create a Supabase project.
2. Open `SUPABASE_SETUP.sql`, run the complete script in **Supabase Dashboard → SQL Editor**.
3. In `frontend/js/app.js`, replace `SUPABASE_URL` and `SUPABASE_ANON_KEY` with the values from **Project Settings → API**. Use the browser-safe publishable/anon key, never a service-role key.
4. In **Authentication → URL Configuration**, add the URL from which you serve `frontend/index.html` to **Site URL** and **Redirect URLs**.
5. Serve the frontend over HTTP (for example with `python -m http.server 5500` inside `frontend`) instead of opening the file directly.

The app now requires a Supabase account before showing the forensic modules. Sign-up saves full name, phone, organisation, and role in `profiles`; dashboard scan totals are isolated per user in `user_stats` and persist across devices. Supabase Auth securely hashes and manages passwords; passwords must not be SHA-hashed or stored in the frontend.

### Step 1 — Install Python dependencies
```bash
cd backend
pip install -r requirements.txt
```

### Step 2 — Start the API server
```bash
python app.py
```
You should see:
```
✅ Model loaded from .../model.pkl
🚀 CyberForensics-AI API running at http://localhost:5000
```

### Step 3 — Open the frontend
Open `frontend/index.html` in any browser.

The status indicator in the top-right shows **API Online** when connected.

---

## ML Model Details

| Property       | Value                          |
|----------------|-------------------------------|
| Algorithm      | XGBoost-v1    |
| Features       | 28 forensic image features    |
| Training size  | 5000 samples (2500 per class) |
| Test accuracy  | ~97%+                         |
| Input          | Any JPG/PNG/WEBP image        |

### Features extracted per image:
- **DCT frequency analysis** — GAN upsampling artifacts
- **ELA (Error Level Analysis)** — JPEG re-compression inconsistency
- **Color channel correlation** — Deepfakes often have channel imbalance
- **Edge smoothness** — GANs over-smooth facial edges
- **Local texture variance** — Real faces have natural texture variety
- **Histogram statistics** — Per-channel entropy and distribution

---

## Modules

| Module           | Tech Used              | Status     |
|------------------|------------------------|------------|
| Deepfake Detector | Random Forest + PIL   | ✅ ML Live |
| Cyberbullying    | NLP keyword scoring    | ✅ Working |
| Dark Web Intelligence | Live deterministic hidden-service simulation + viz  | ✅ Working     |
| Log Tampering    | Rule-based + API       | ✅ Working |

---

## API Endpoints

| Method | Endpoint         | Description           |
|--------|------------------|-----------------------|
| GET    | /api/health      | Check API status      |
| POST   | /api/detect      | Deepfake detection    |
| POST   | /api/cyberbully  | Text classification   |
| POST   | /api/logtamper   | Log integrity check   |

---

## Offline / Demo Mode

If the backend is not running, the frontend automatically switches to **demo mode**  
where results are generated locally. The deepfake detector still extracts real image  
features via canvas but uses a local simulation for the verdict.
