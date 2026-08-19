# Dark Web Intelligence Monitor Guide

This project now includes a **deterministic live-scan simulation** for the Dark Web tab.  
It is designed to look and behave like a real monitoring workflow without trying to access live Tor services.

## What was added

- A new backend endpoint: `POST /api/darkweb/scan`
- A deterministic scan generator based on:
  - category
  - keywords
  - node count
- Progressive frontend animation for each scanned node
- Live findings rendering with severity, onion address, and score
- A URL intelligence field that classifies onion vs clearnet links
- A page snapshot scraper that extracts title, links, and keywords from pasted HTML/text
- A safe offline fallback if the API is unavailable

## How it works

### 1) User starts a scan
In the Dark Web tab, the user selects:

- a category
- keywords
- number of nodes to scan

### 2) Frontend sends the scan request
The browser sends:

```json
{
  "category": "Hacking Forums",
  "keywords": "exploit, c2, botnet",
  "nodes": 12
}
```

### 3) Backend generates the scan result
The backend does not crawl the real dark web. Instead, it:

- creates a stable seed from the inputs
- generates fake onion domains
- assigns severity levels
- calculates risk scores
- builds a scan timeline
- returns findings and recommendations

This makes the scan **repeatable**: the same inputs produce the same output.

### 4) Frontend animates the scan
The frontend:

- draws each node on the canvas
- updates the network graph step by step
- logs progress in the crawl log
- shows the final findings card

### 5) URL intelligence field
The tab also accepts a single URL for structural analysis.

It checks:

- whether the URL is an onion link or clearnet link
- whether the format is valid
- whether the link has suspicious patterns like login, wallet, token, or dump
- whether it should be treated as structurally verified or suspicious

Example outputs:

- `https://example.com` → clearnet, structurally verified
- `abcdefghijklmnop.onion` → onion, structurally valid
- `not-a-url` → invalid

### 6) Page snapshot scraper
The tab also accepts pasted HTML or page text.

It extracts:

- title
- visible text
- links
- page type
- suspicious keywords

This gives a realistic “scraper” style demo without fetching real onion sites.

## Why this approach works well

- It feels like a real-time monitoring system
- It is stable and predictable for demos
- It does not depend on unstable external services
- It is easy to explain in a presentation

## Files involved

- `backend/app.py`
  - new dark web scan endpoint
  - deterministic scan generator
  - severity scoring and recommendations
- `frontend/js/app.js`
  - fetches live scan results
  - animates the scan
  - renders findings and summary
  - analyzes a single dark web / clearnet URL
  - scrapes pasted page snapshots
  - falls back to local simulation if offline
- `frontend/index.html`
  - updated dark web description text

## How to use it

1. Start the backend:

```bash
cd backend
python app.py
```

2. Open `frontend/index.html` in the browser.

3. Go to **Dark Web Threat Monitor**.

4. Choose a category, keywords, and node count.

5. Click **Start Scan**.

## How to explain it in an interview/demo

You can say:

> The dark web monitor is a deterministic simulation of a threat-intelligence crawl.  
> The frontend sends scan parameters to the backend, the backend generates structured threat data, and the UI animates the results in real time.  
> This gives a realistic monitoring workflow without depending on live Tor access.

## How to modify it

### Change threat behavior
Edit `DARKWEB_PROFILES` in `backend/app.py` or `frontend/js/app.js`.

### Change severity thresholds
Update the risk bands in:

- `level_from_score()` in `backend/app.py`
- `darkWebLevel()` in `frontend/js/app.js`

### Change the animation speed
Adjust the delay logic in `runDarkWeb()` inside `frontend/js/app.js`.

### Add more categories
Add a new entry in `DARKWEB_PROFILES` in both backend and frontend so the UI and API stay in sync.

## Important note

This is a **simulation**, not a real Tor crawler.  
It is intended for demo, presentation, and forensic workflow visualization.
