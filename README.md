# CyberForensics AI

**Intelligent Multi-Threat Cyber Forensics Platform**
Group G1 · CSEP23605 · Department of Computer Science and Engineering · GAT · 2025-26

CyberForensics AI is a browser-based forensic workspace for examining several common digital-threat signals from one authenticated dashboard. It combines a static single-page frontend, a Python/Flask analysis API, optional Supabase persistence, and an optional Node.js WhatsApp Web bridge.

The platform is intended for **education, research, triage, and demonstrations**. Its results are indicators for analyst review, not legal proof, a substitute for a certified forensic process, or an automatic basis for taking action against a person or system.

## Team

| Role | Name |
| --- | --- |
| Project team | Dhyan Kumar M, Vathsalya V, Meghana H J, Sammita Abhay |
| Guide | Mr. B S Umashankar |
| Course/project | CSEP23605, Major Project Phase II |

## What the platform does

The application provides:

- **Deepfake image analysis** using a trained XGBoost model and handcrafted forensic image features.
- **AI-provenance metadata inspection** for common generator, XMP, C2PA, and embedded metadata signatures.
- **Real-time screen/window frame analysis** through browser screen sharing and the existing image detector API.
- **Cyberbullying and toxic-text classification** with rule-based phrase detection, semantic similarity, intensity signals, category scores, and highlighted evidence.
- **Consent-based WhatsApp live monitoring** through WhatsApp Web, forwarding incoming message text to the cyberbullying classifier.
- **Dark-web and URL intelligence** that performs structural URL checks for clearnet and `.onion` addresses.
- **Read-only public-page intelligence** with bounded redirects, HTML/text extraction, metadata/link/keyword analysis, and SSRF protections.
- **Dark-web snapshot analysis** for supplied HTML/text snapshots without opening a target.
- **Log-integrity triage** for timestamp reversals, deletion markers, privilege-escalation indicators, and suspicious access patterns.
- **Live Suricata monitoring** for `eve.json` and `fast.log`, including truncation/rewrites, malformed JSON, timestamp reversals, tampering markers, packet summaries, and a website/redirect timeline.
- **Per-user dashboard counters** for scans, threats, warnings, and safe results.
- **Installable PWA behavior** with a manifest, service worker, offline shell caching, and an install button where the browser supports installation.
- **Demo fallbacks** for several frontend modules when the Flask API is unavailable.

## Important implementation status

The current UI contains some historical labels such as “LSTM Anomaly Detection”, “Hash Chain Verification”, “CNN+XGBoost”, and “BERT-sim”. Those labels are presentation text and do not describe separate active backend models in the current source.

The current implementation is:

| Area | Current implementation |
| --- | --- |
| Image detection | XGBoost model loaded from `backend/model.pkl`, scaled with `backend/scaler.pkl`; 34 extracted features |
| Image provenance | Pillow metadata/EXIF inspection plus byte-level searches for XMP, C2PA, and known generator signatures |
| Cyberbullying | `Rule+Semantic-BERT-lite-v2`: weighted rules, context regexes, TF-IDF word/character similarity, and text-intensity signals |
| Manual log triage | Timestamp ordering and explicit suspicious-marker/pattern checks in Flask |
| Live Suricata monitor | A background Python thread tails the selected file and keeps bounded in-memory summaries |
| Dark-web graph scan | Deterministic simulated intelligence data from category/keyword inputs; it does not crawl the dark web |
| URL/page intelligence | Structural analysis and optional bounded, read-only HTTP(S)/Tor retrieval |

No result should be described as a guarantee that an image is authentic, a message is illegal, a URL is safe, or a log was definitely altered.

## Architecture

```text
Browser
  frontend/index.html
      ├── frontend/css/style.css
      ├── frontend/js/app.js
      ├── frontend/manifest.json
      └── frontend/sw.js
          │
          ├── HTTP JSON requests
          ▼
      Flask API :10000
          ├── model.pkl + scaler.pkl
          ├── cyberbully_model.pkl (repository artifact)
          ├── image, text, URL, page, log analysis
          └── optional local Tor SOCKS5 proxy

Optional browser-to-local bridge:
  frontend/app.js ──HTTP──> WhatsApp bridge :10001
                              └── whatsapp-web.js + Puppeteer
                                  └── Flask /api/cyberbully

Optional hosted persistence:
  Supabase Auth
      ├── auth.users
      ├── public.profiles
      └── public.user_stats
```

The frontend is deliberately a static application. It does not require a frontend build step. The Flask service is the source of truth for online analysis; the browser chooses demo/local fallbacks for supported workflows when the API is offline.

## Repository layout

```text
.
├── README.md
├── SUPABASE_SETUP.sql
├── sample_metadata.txt
├── backend/
│   ├── app.py
│   ├── model.pkl
│   ├── scaler.pkl
│   ├── cyberbully_model.pkl
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
└── whatsapp/
    ├── server.js
    ├── package.json
    ├── package-lock.json
    └── .gitignore
```

Generated/runtime directories should not be treated as source:

- `backend/__pycache__/`
- `whatsapp/node_modules/`
- `whatsapp/.wwebjs_auth/`

The WhatsApp authentication directory contains a live browser session and must remain private.

## Requirements

### Required

- Python 3.10+ recommended
- A modern browser with JavaScript enabled
- A local HTTP server for the frontend; do not use `file://` for the authenticated application
- Python packages listed in `backend/requirements.txt`

### Optional

- A Supabase project for authentication and cross-device dashboard counters
- Node.js 18+ with npm for the WhatsApp bridge
- Google Chrome or a Puppeteer-managed Chromium for WhatsApp Web
- Suricata and access to its local `eve.json` or `fast.log`
- Tor/Tor Browser SOCKS5 service for `.onion` page retrieval

## Quick start

Open three terminals from the repository root.

### 1. Install and start the Flask API

Windows PowerShell:

```powershell
cd .\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

Other shells:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

The API listens on `http://localhost:10000` by default. The `PORT` environment variable can change the port:

```powershell
$env:PORT = "10000"
python .\app.py
```

The model and scaler are loaded during startup. If either artifact is missing or incompatible with the installed Python packages, the API will fail during startup.

### 2. Configure authentication, then serve the frontend

The current frontend is configured to use Supabase. Complete the Supabase setup below, then serve the `frontend` directory:

```powershell
cd .\frontend
python -m http.server 5500
```

Open <http://localhost:5500> in a browser.

The frontend calls the API at `http://localhost:10000/api`. If the API is unavailable, the header reports **API Offline (demo mode)**. Authentication is still required before the forensic workspace is shown.

### 3. Optional: start the WhatsApp bridge

```powershell
cd .\whatsapp
npm install
npx puppeteer browsers install chrome
npm start
```

The bridge listens on `http://localhost:10001`. The Flask API must be running first because each incoming message is posted to `/api/cyberbully`.

If Chrome is installed in a non-standard location, set `CHROME_PATH` before starting the bridge:

```powershell
$env:CHROME_PATH = "C:\Path\To\chrome.exe"
npm start
```

## Supabase authentication and persistence

The browser uses the Supabase publishable/anon key, not a service-role key. The key is intentionally used in browser code; protection comes from Supabase Auth and row-level security (RLS).

### Configure the project

1. Create a Supabase project.
2. Open **SQL Editor** in the Supabase dashboard.
3. Run the complete `SUPABASE_SETUP.sql` script.
4. In **Authentication > URL Configuration**, add the URL used to serve the frontend, for example `http://localhost:5500`.
5. In `frontend/js/app.js`, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the values from **Project Settings > API**.
6. Never put a Supabase service-role key in `app.js`, HTML, a public repository, or browser storage.
7. Configure email confirmation according to the environment. A user may need to confirm the email before login.

The SQL script creates:

- `public.profiles`, linked to `auth.users`, for full name, phone, organisation, and role.
- `public.user_stats`, linked to `auth.users`, for `scans`, `threats`, `warns`, and `safe`.
- RLS policies allowing a signed-in user to read/update only their own profile and statistics.
- A trigger that creates the profile and initial statistics row after a new Auth user is created.

Passwords are managed and hashed by Supabase Auth. The application must not create a password column or hash passwords in the frontend.

### Authentication behavior

- Sign-up requires full name, email, role, and a password of at least eight characters.
- Phone and organisation are optional.
- Login and sign-up errors are converted into user-readable messages.
- A persisted Supabase session is restored on page load.
- Signing out hides the application shell and returns to the auth screen.
- Dashboard counters are loaded and written per authenticated user.

## Frontend and user workflows

### Authentication screen

The initial screen contains login and account-creation modes. The main application is not shown until a valid Supabase session exists.

### Deepfake image detector

1. Upload or drag a JPG, PNG, or WEBP image.
2. Optionally use the built-in sample image controls.
3. Click **Analyse Image**.
4. Review the verdict, fake/real probabilities, confidence, processing time, model name, metadata reason, and forensic feature bars.

The online request sends a base64 image to `POST /api/detect` with `check_metadata: true`. Recognized embedded AI provenance causes an immediate 100% AI-generated result. If no recognized provenance is present, the model result is retained; missing metadata is not evidence that an image is real.

The detector uses a 128 x 128 RGB representation and extracts:

- frequency-domain energy and variation using a 2D FFT,
- JPEG recompression error level analysis (ELA),
- RGB channel correlations and standard-deviation ratios,
- edge response and sharpened grayscale variance,
- 4 x 4 local texture variance statistics,
- per-channel 16-bin histogram statistics.

The returned feature display currently exposes ELA artifact level, frequency anomaly, edge inconsistency, texture uniformity, and colour-channel deviation.

#### Screen sharing

**Share screen** uses `getDisplayMedia` and sends one resized JPEG frame approximately every 2.5 seconds. If the browser provides `FaceDetector`, the first detected face is cropped with padding; otherwise the complete frame is sent. Screen frames deliberately skip file metadata checks because they are browser-generated canvas images, not original image files.

Stop sharing from the UI or from the browser's native sharing control. A frame result increments the same dashboard counters as an uploaded image.

### Cyberbullying detector

Paste text, choose a source label such as Twitter/X, Instagram, YouTube, Discord, or Reddit, and click **Classify**.

The Flask classifier:

- normalizes common contractions, mentions, URLs, and chat abbreviations;
- applies weighted phrase rules for toxic, severe-toxic, obscene, threat, insult, and identity-hate categories;
- applies context regexes for direct, future, and time-bound threats;
- computes word and character n-gram TF-IDF similarity against category prototypes;
- adds intensity signals for capitalization, repeated punctuation, repeated characters, and intensifiers;
- maps the results to Bullying, Harassment, Threat, Hate Speech, and Profanity scores;
- returns highlights and a short explanation.

The online verdict is `TOXIC` when the combined score reaches 40 or above; otherwise it is `CLEAN`. The browser has a smaller local rule-based fallback when the API cannot be reached.

### WhatsApp live monitor

This feature is optional and requires authorization from the account holder.

1. Start the Flask API and Node bridge.
2. Open the Cyberbullying tab.
3. Check the consent statement.
4. Click **Show QR code**.
5. In WhatsApp, open **Linked devices > Link a device** and scan the code.
6. Review incoming-message classifications in the event panel.
7. Click **Disconnect** when finished.

Technical behavior:

- `whatsapp-web.js` controls a headless Chromium WhatsApp Web session.
- `LocalAuth` stores the local browser session under `whatsapp/.wwebjs_auth/`.
- Each incoming message is sent to `CLASSIFIER_URL`, defaulting to `http://127.0.0.1:10000/api/cyberbully`.
- Only the latest 100 bridge events are retained in memory.
- The frontend displays at most 50 rendered events.
- Message text is not written to an application database by this bridge.
- The bridge exposes status, incremental events, and logout endpoints without application-level user authentication; use it only on a trusted local machine and do not expose port 10001 publicly.

### Dark-web and URL intelligence

The Dark Web tab has two different types of behavior:

#### Structural link analysis

`Analyze Link` performs local/backend URL inspection without opening the target. It identifies:

- HTTP versus HTTPS,
- IP-literal hosts,
- punycode,
- query strings and deep paths,
- credential-like path terms,
- valid v2/v3 onion hostname structure,
- malformed onion hosts.

The result includes category, status, verification label, risk score, confidence, signals, notes, and a structural-analysis disclaimer.

#### Read-only page intelligence

`Read-only page intel` sends a request to the backend. For clearnet URLs, the backend:

- permits only HTTP and HTTPS,
- rejects embedded username/password credentials,
- resolves the hostname and blocks private, loopback, link-local, reserved, multicast, and unspecified addresses,
- follows at most three validated redirects,
- revalidates redirect destinations,
- reads at most 262,144 bytes,
- parses only HTML, XHTML, or plain text,
- never executes JavaScript,
- extracts title, visible text, links, page type, keyword hits, and suspicious-link counts.

For `.onion` URLs, the backend never connects directly. It requires a local SOCKS5/SOCKS5H gateway configured with `TOR_SOCKS_PROXY`, for example:

```powershell
$env:TOR_SOCKS_PROXY = "socks5h://127.0.0.1:9050"
python .\backend\app.py
```

Tor Browser commonly exposes SOCKS5 on port `9150`:

```powershell
$env:TOR_SOCKS_PROXY = "socks5h://127.0.0.1:9150"
```

Onion redirects are limited to the onion namespace. If Tor is unavailable, the service reports that content was not collected rather than presenting the site as safe.

#### Snapshot analysis and simulated graph scan

`POST /api/darkweb/page-intel` analyzes supplied HTML/text only. It does not fetch a URL.

`POST /api/darkweb/scan` generates a deterministic simulated graph from a category, keywords, and node count between 5 and 40. It is useful for UI demonstrations and repeatable presentations; it is not live dark-web intelligence and does not discover real onion services.

### Log tampering and integrity triage

The manual workflow accepts pasted multiline logs and reports:

- timestamps that move backwards,
- `MISSING` markers indicating possible deletion,
- `sudo su` or `unknown` privilege-escalation indicators,
- `attacker` or `/etc/passwd` suspicious-access indicators.

The endpoint returns `INTACT` when no supported indicators are found and `TAMPERED` when one or more indicators are found. This is rule-based triage; it does not currently calculate a cryptographic hash chain or execute an LSTM model despite the historical method labels in the UI.

### Live Suricata monitor

The live monitor is separate from the pasted-log endpoint:

1. Start Suricata and produce `eve.json` or `fast.log`.
2. Copy the complete local Windows path into **Live Suricata Packet Monitor**.
3. Select `Auto detect`, `eve.json`, or `fast.log`.
4. Click **Start monitor**.
5. Review the compact traffic summary and website timeline.
6. Click **Stop** when finished.

The Python worker polls the file about twice per second and starts at the current end of the file, so old records are not replayed on startup. It detects:

- invalid JSON records in `eve.json`,
- explicit `cyberforensics_test_tampered: true` markers,
- suspicious markers in `fast.log`,
- timestamp reversals beyond a one-second tolerance,
- file truncation or size decreases,
- file identity changes such as log rotation.

It summarizes event types, protocols, DNS names, HTTP hostnames, TLS SNI values, source/destination addresses, HTTP status, referers, recent packets, and a deduplicated website visit/redirect timeline. The monitor keeps bounded in-memory collections and does not persist raw packet logs.

For encrypted HTTPS traffic, the visible website is normally the TLS SNI hostname, not the full page URL. A missing hostname does not mean that no traffic occurred.

### Dashboard and PWA

The dashboard shows:

- total scans,
- threats,
- warnings,
- safe results,
- a live event feed,
- module status,
- project information.

Counters update after image, text, URL, snapshot, WhatsApp, and log workflows. When Supabase is available, counters are persisted in `user_stats`; otherwise they exist only in the current browser session.

The service worker caches the static shell and runtime pages. `app.js` and `style.css` are network-first so deployed application/auth changes are less likely to be hidden by stale cached code. API requests are not treated as offline data and still require the backend for online analysis.

## API reference

Base URL: `http://localhost:10000/api`

All JSON request bodies should use `Content-Type: application/json`. Responses are JSON. Validation errors generally return HTTP 400; unexpected analysis errors return HTTP 500.

| Method | Endpoint | Request | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | Reports API status, model name, feature count, and metadata detector version |
| POST | `/detect` | `{ "image": "<base64 or data URL>", "filename": "...", "check_metadata": true }` | Image model and optional provenance analysis |
| POST | `/cyberbully` | `{ "text": "..." }` | Toxicity, bullying, threat, hate, profanity, highlights, and explanation |
| POST | `/logtamper` | `{ "log": "multiline log text" }` | Manual log-integrity triage |
| POST | `/darkweb/scan` | `{ "category": "...", "keywords": "...", "nodes": 12 }` | Deterministic simulated dark-web graph |
| POST | `/darkweb/link-intel` | `{ "url": "https://..." }` | Structural URL intelligence without target access |
| POST | `/darkweb/fetch-intel` | `{ "url": "https://..." }` | Bounded read-only page collection and analysis |
| POST | `/darkweb/page-intel` | `{ "source": "<html/text>", "origin_url": "..." }` | Analyze a supplied page snapshot |
| POST | `/logtamper/monitor/start` | `{ "path": "...", "format": "auto\|eve.json\|fast.log" }` | Start tailing a local Suricata log |
| GET | `/logtamper/monitor/status?after=0` | query string | Return monitor state, issues, summaries, visits, and incremental events |
| POST | `/logtamper/monitor/stop` | none | Stop the current Suricata monitor |

### Image response shape

Normal model analysis includes `verdict`, `fake_pct`, `real_pct`, `confidence`, `high_anomalies`, `strongest_anomaly`, `features`, `time_ms`, `model`, and `metadata`.

Recognized provenance metadata returns an immediate `FAKE` result with 100% fake probability and a metadata-specific model/reason. A clean metadata scan means only that no supported signature was found.

### Cyberbullying response shape

The endpoint returns `verdict`, `score`, `labels`, `highlights`, `analysis`, `components`, `time_ms`, and `model`. `labels` contains Bullying, Harassment, Threat, Hate Speech, and Profanity percentages.

### Suricata status response shape

The status endpoint returns monitor state, path, format, entry counts, `CLEAN`/`TAMPERED` verdict, recent issues, error text, packet summaries, website visits, and incremental events after the requested sequence number.

## Configuration reference

| Variable | Default | Used by |
| --- | --- | --- |
| `PORT` | `10000` | Flask API listen port |
| `TOR_SOCKS_PROXY` | `socks5h://127.0.0.1:9050` | Local Tor gateway for onion retrieval |
| `WHATSAPP_PORT` | `10001` | Node WhatsApp bridge |
| `CLASSIFIER_URL` | `http://127.0.0.1:10000/api/cyberbully` | Bridge-to-Flask classifier URL |
| `CHROME_PATH` | auto-detected | Custom Chrome/Chromium executable for Puppeteer |

The frontend API constants are currently in `frontend/js/app.js`:

- `API = 'http://localhost:10000/api'`
- `WHATSAPP_API = 'http://localhost:10001/api'`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

For a different deployment, update these values or introduce an environment-aware frontend configuration before publishing the static files.

## Deployment notes

### Flask production process

`app.py` includes a development-server entry point. For a production-like deployment, run the Flask application with a WSGI server such as Gunicorn on Linux:

```bash
cd backend
gunicorn --bind 0.0.0.0:10000 app:app
```

On Windows, use a supported WSGI server/process strategy appropriate for the deployment environment. Put HTTPS, authentication boundaries, rate limiting, request-size limits, and a restrictive reverse proxy in front of public services.

### Static frontend

The frontend can be hosted by any static HTTP server. Configure the deployed origin in Supabase redirect settings and ensure the browser can reach the configured API URL. Do not expose a local Flask development server or the WhatsApp bridge directly to the public internet.

### CORS and trust boundaries

The Flask app currently sends permissive `Access-Control-Allow-Origin: *` headers so the local static frontend can call it. This is convenient for development but should be restricted to the deployed frontend origin before production use. The bridge also enables broad CORS and should remain local or be protected by a trusted reverse proxy.

## Privacy and security guidance

- Obtain consent before monitoring a WhatsApp account or analyzing private communications.
- Do not paste secrets, passwords, access tokens, private keys, or unnecessary personal data into the application.
- Treat uploaded images, log text, message text, and fetched page content as sensitive.
- Do not expose ports 10000 or 10001 directly to the internet without authentication, TLS, rate limits, and network controls.
- Keep `whatsapp/.wwebjs_auth/` private; delete/disconnect the session through WhatsApp when no longer needed.
- Use a dedicated Tor gateway and understand that fetching an onion page still reveals traffic to the local Tor operator/service path.
- Preserve original evidence separately. The application normalizes, truncates, summarizes, and stores only bounded in-memory state for several workflows.
- Validate model results with independent tools and human review.
- The page-intelligence SSRF checks reduce risk but are not a complete security boundary for an untrusted public deployment.

## Limitations and known caveats

- The image model is a binary classifier and can produce false positives and false negatives, especially for compressed, edited, cropped, non-face, or out-of-domain images.
- AI provenance detection is signature-based. Removed or rewritten metadata cannot be recovered, and no metadata is not proof of authenticity.
- Screen-frame analysis is not equivalent to examining the original file and can classify browser/UI artifacts.
- Cyberbullying scoring is not a complete language-understanding or moderation system. Context, sarcasm, quotation, dialect, and multilingual text can be misclassified.
- WhatsApp monitoring depends on WhatsApp Web, Chromium, a live account session, and the local bridge. It is not a WhatsApp server integration.
- URL “clean” or “verified” labels are structural/collection results, not reputation guarantees or safety certifications.
- Public-page collection is bounded to HTML/text and does not execute scripts, render a browser, inspect authenticated pages, or prove that a site is benign.
- Onion collection requires Tor and can fail because of gateway, service, timeout, redirect, or content-type conditions.
- Manual log checks detect supported indicators only. They do not reconstruct deleted bytes, prove authorship, or replace signed logs and forensic imaging.
- Live Suricata monitoring is process-local and in-memory. Restarting Flask clears monitor state.
- The current Flask monitor is designed for one active monitor state per process, not multi-tenant concurrent monitoring.
- Demo mode intentionally generates simulated/local results and must not be used as evidence.

## Troubleshooting

### The page shows an authentication/configuration error

Check that:

1. `frontend/js/app.js` contains the correct Supabase project URL and publishable/anon key.
2. `SUPABASE_SETUP.sql` has been executed successfully.
3. The frontend origin is present in Supabase Site URL and Redirect URLs.
4. Email confirmation requirements are satisfied.
5. The page is served over HTTP rather than opened with `file://`.

### The header says API Offline

Confirm that `python app.py` is running on port 10000 and test:

```powershell
Invoke-RestMethod http://localhost:10000/api/health
```

If the API uses another port, update `API` in `frontend/js/app.js`.

### The model does not load

Run the backend from the `backend` directory, install `requirements.txt`, and confirm that `model.pkl` and `scaler.pkl` exist beside `app.py`. If a serialized-model compatibility error appears, use the package versions expected by the artifacts.

### WhatsApp stays offline or Chrome fails

Start Flask first, then the bridge. Confirm port 10001 is available, install Puppeteer Chrome, and set `CHROME_PATH` if the bridge cannot find a browser. A QR code may expire; request a new one.

### Suricata monitor cannot open the file

Use the complete path to an existing file, select the correct format, and run Flask with permission to read the Suricata log. The monitor begins at the current end of the file; append a new record after starting it to see live processing.

### Onion page content is not collected

Start Tor or Tor Browser, verify the local SOCKS5 port, set `TOR_SOCKS_PROXY`, and restart Flask. A valid onion hostname alone does not mean the service is reachable.

### Changes do not appear in the browser

The service worker caches the static shell. Hard-refresh the page, unregister the service worker in browser developer tools, or bump the `app.js` query-string version in `frontend/index.html` after a deployment.

## Development checklist

Before sharing a build:

- verify the API health response;
- test login, signup, logout, and per-user counter isolation;
- test one real image and one known sample;
- test benign, bullying, threat, profanity, and identity-targeting text;
- test a public URL, malformed URL, private-address URL, and `.onion` URL without Tor;
- test a supplied page snapshot;
- test clean and tampered manual log scenarios;
- test Suricata rotation/truncation behavior with a disposable log;
- test WhatsApp only with explicit account-holder consent;
- confirm no credentials, `whatsapp/.wwebjs_auth/`, `node_modules/`, or generated caches are being published;
- restrict CORS and add authentication/rate limits before any network exposure.

## License and third-party services

This repository does not currently declare a top-level license file. Add the project’s intended license before redistributing it. Runtime dependencies retain their own licenses; review the licenses and terms for Flask, Pillow, NumPy, scikit-learn, XGBoost, joblib, requests, Supabase, Express, QRCode, `whatsapp-web.js`, Puppeteer/Chromium, Tor, and any external CDN resource used by the frontend.
