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
│   ├── model.pkl           ← Trained Random Forest model
│   └── requirements.txt    ← Python dependencies
│
└── README.md
```

---

## Setup & Run

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
| Algorithm      | Random Forest (200 trees)     |
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
| Dark Web Monitor | Simulated crawl + viz  | ✅ Working |
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
