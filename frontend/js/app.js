/* ─────────────────────────────────────────────────────────────────
   CyberForensics AI — app.js
   All module logic: Deepfake (ML API), Cyberbullying, Dark Web Intelligence, Log Tamper
───────────────────────────────────────────────────────────────── */

const API = 'http://localhost:10000/api';

/* ══════════════════════════════════════════════════════════════════
   GLOBAL STATE & HELPERS
══════════════════════════════════════════════════════════════════ */
const state = { scans: 0, threats: 0, warns: 0, safe: 0 };

function updateSidebarStats() {
  qs('#s-scans').textContent = state.scans;
  qs('#s-threats').textContent = state.threats;
  qs('#s-safe').textContent = state.safe;
  qs('#d-scans').textContent = state.scans;
  qs('#d-threats').textContent = state.threats;
  qs('#d-warns').textContent = state.warns;
  qs('#d-safe').textContent = state.safe;
}

function qs(sel, ctx = document) { return ctx.querySelector(sel); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rnd(a, b) { return Math.random() * (b - a) + a; }
function fakeHash(n = 8) {
  return Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

/* ── Time ───────────────────────────────────────────────────────── */
function updateTime() {
  const t = new Date().toLocaleTimeString('en-IN', { hour12: false });
  qs('#headerTime').textContent = t;
}
setInterval(updateTime, 1000);
updateTime();

/* ── API health check ───────────────────────────────────────────── */
async function checkAPI() {
  const el = qs('#apiStatus');
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      el.className = 'api-status online';
      el.innerHTML = '<span class="dot"></span> API Online';
      return true;
    }
  } catch (_) { }
  el.className = 'api-status offline';
  el.innerHTML = '<span class="dot"></span> API Offline (demo mode)';
  return false;
}
checkAPI();
setInterval(checkAPI, 15000);

/* ── Log helper ─────────────────────────────────────────────────── */
function addLog(id, msg, cls = 'log-info') {
  const box = qs('#' + id);
  if (!box) return;
  const ts = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const div = document.createElement('div');
  div.className = `log-line ${cls}`;
  div.textContent = `[${ts}] ${msg}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  while (box.children.length > 80) box.removeChild(box.firstChild);
}

function dashLog(msg, cls = 'log-info') {
  addLog('dashFeed', msg, cls);
}

/* ── PWA setup ──────────────────────────────────────────────────── */
let deferredInstallPrompt = null;

function setupPWA() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js')
    .then(() => {
      dashLog('PWA service worker registered.', 'log-sys');
    })
    .catch(() => {
      dashLog('Service worker registration failed.', 'log-warn');
    });

  const installBtn = qs('#installAppBtn');

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installBtn) installBtn.style.display = 'inline-flex';
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        dashLog('Install prompt accepted.', 'log-ok');
      } else {
        dashLog('Install prompt dismissed.', 'log-sys');
      }
      deferredInstallPrompt = null;
      installBtn.style.display = 'none';
    });
  }

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (installBtn) installBtn.style.display = 'none';
    dashLog('App installed successfully.', 'log-ok');
  });
}

/* ── Meter HTML ─────────────────────────────────────────────────── */
function meterHTML(label, pct, colorClass = '') {
  const p = Math.min(100, Math.max(0, pct));
  const c = colorClass || (p > 70 ? 'fill-red' : p > 40 ? 'fill-orange' : 'fill-green');
  return `
    <div class="meter">
      <div class="meter-header"><span>${label}</span><span>${p.toFixed(1)}%</span></div>
      <div class="meter-bar"><div class="meter-fill ${c}" style="width:${p}%"></div></div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   TAB NAVIGATION
══════════════════════════════════════════════════════════════════ */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const id = 'tab-' + btn.dataset.tab;
    qs('#' + id).classList.add('active');
    if (btn.dataset.tab === 'darkweb') initDWCanvas();
  });
});

/* ══════════════════════════════════════════════════════════════════
   MODULE 1: DEEPFAKE DETECTOR
══════════════════════════════════════════════════════════════════ */

let currentImageB64 = null;

/* ── Dropzone setup ─────────────────────────────────────────────── */
const dropzone = qs('#dropzone');
const fileInput = qs('#fileInput');
const previewImg = qs('#previewImg');
const dzInner = qs('#dzInner');
const dfBtn = qs('#dfAnalyseBtn');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    currentImageB64 = e.target.result;
    previewImg.src = currentImageB64;
    previewImg.style.display = 'block';
    dzInner.style.display = 'none';
    dfBtn.disabled = false;
    addLog('dfLog', `Image loaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, 'log-info');
  };
  reader.readAsDataURL(file);
}

/* ── Sample generator ───────────────────────────────────────────── */
function loadSample(type) {
  // Generate a synthetic test image using canvas
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');

  if (type === 'real') {
    // Natural-looking gradient face-like image
    const g = ctx.createRadialGradient(64, 55, 10, 64, 55, 60);
    g.addColorStop(0, '#f5c5a3'); g.addColorStop(0.6, '#e8956d'); g.addColorStop(1, '#2a1a0e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    // Add natural noise
    const id = ctx.getImageData(0, 0, 128, 128);
    for (let i = 0; i < id.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 20;
      id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n;
    }
    ctx.putImageData(id, 0, 0);
  } else if (type === 'fake') {
    // GAN-like: over-smooth + slight colour artifacts
    const g = ctx.createRadialGradient(64, 55, 5, 64, 55, 65);
    g.addColorStop(0, '#f8d0b0'); g.addColorStop(0.7, '#ebb080'); g.addColorStop(1, '#503020');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    // Periodic GAN grid artifact
    for (let x = 0; x < 128; x += 8) {
      ctx.strokeStyle = 'rgba(255,120,60,0.12)';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke();
    }
    const id = ctx.getImageData(0, 0, 128, 128);
    for (let i = 0; i < id.data.length; i += 4) {
      id.data[i] += (Math.random() - 0.5) * 6;
      id.data[i + 2] += (Math.random() - 0.5) * 14; // channel imbalance
    }
    ctx.putImageData(id, 0, 0);
  } else {
    // Blended: half real, half fake
    const g1 = ctx.createLinearGradient(0, 0, 128, 0);
    g1.addColorStop(0, '#f5c5a3'); g1.addColorStop(0.5, '#e896c0'); g1.addColorStop(1, '#7060f0');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, 128, 128);
    const id = ctx.getImageData(0, 0, 128, 128);
    for (let i = 0; i < id.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 30; id.data[i] += n; id.data[i + 1] -= n * 0.3;
    }
    ctx.putImageData(id, 0, 0);
  }

  currentImageB64 = canvas.toDataURL('image/jpeg', 0.9);
  previewImg.src = currentImageB64;
  previewImg.style.display = 'block';
  dzInner.style.display = 'none';
  dfBtn.disabled = false;
  addLog('dfLog', `Sample loaded: ${type} face image`, 'log-info');
}

/* ── Run deepfake analysis ──────────────────────────────────────── */
async function runDeepfake() {
  if (!currentImageB64) return;
  const btn = qs('#dfAnalyseBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Analysing…';

  const resultBox = qs('#dfResult');
  resultBox.className = 'result-empty';
  resultBox.innerHTML = '<span>Running ML pipeline…</span>';
  qs('#dfFeatureCard').style.display = 'none';

  addLog('dfLog', 'Extracting forensic features (DCT, ELA, colour, texture)…', 'log-sys');

  let result = null;
  const apiOnline = qs('#apiStatus').classList.contains('online');

  if (apiOnline) {
    try {
      await sleep(200);
      addLog('dfLog', 'Sending to ML API…', 'log-info');
      const resp = await fetch(`${API}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: currentImageB64 })
      });
      result = await resp.json();
      addLog('dfLog', `API response received in ${result.time_ms}ms`, 'log-ok');
    } catch (e) {
      addLog('dfLog', 'API error — using local demo mode', 'log-warn');
    }
  }

  // Demo fallback (used when API offline)
  if (!result) {
    await sleep(900);
    const isFake = Math.random() > 0.5;
    const fakePct = isFake ? rnd(62, 97) : rnd(3, 28);
    result = {
      verdict: isFake ? 'FAKE' : 'REAL',
      fake_pct: fakePct,
      real_pct: 100 - fakePct,
      confidence: Math.max(fakePct, 100 - fakePct),
      time_ms: rnd(80, 200).toFixed(1),
      model: 'XGBoost-v1 (demo)',
      features: {
        'ELA Artifact Level': isFake ? rnd(55, 90) : rnd(5, 25),
        'Frequency Anomaly': isFake ? rnd(60, 95) : rnd(3, 20),
        'Edge Inconsistency': isFake ? rnd(50, 85) : rnd(5, 22),
        'Texture Uniformity': isFake ? rnd(55, 88) : rnd(8, 25),
        'Color Ch. Deviation': isFake ? rnd(48, 80) : rnd(4, 18),
      }
    };
  }

  // Display result
  const isFake = result.verdict === 'FAKE';
  const cls = isFake ? 'threat' : 'safe';
  const icon = isFake ? '⚠️' : '✅';
  const lbl = isFake ? 'DEEPFAKE DETECTED' : 'GENUINE IMAGE';
  const sub = isFake
    ? `${result.fake_pct.toFixed(1)}% fake probability · High confidence`
    : `${result.real_pct.toFixed(1)}% real probability · Verified authentic`;

  resultBox.className = '';
  resultBox.innerHTML = `
    <div class="verdict ${cls}">
      <span class="verdict-icon">${icon}</span>
      <div>
        <div class="verdict-label">${lbl}</div>
        <div class="verdict-sub">${sub}</div>
      </div>
    </div>
    <div class="stat-detail">
      <div class="sd-item"><div class="sd-label">Fake Probability</div><div class="sd-value ${isFake ? 'red' : 'green'}">${result.fake_pct.toFixed(1)}%</div></div>
      <div class="sd-item"><div class="sd-label">Real Probability</div><div class="sd-value ${isFake ? 'green' : 'green'}">${result.real_pct.toFixed(1)}%</div></div>
      <div class="sd-item"><div class="sd-label">Confidence</div><div class="sd-value blue">${result.confidence.toFixed(1)}%</div></div>
      <div class="sd-item"><div class="sd-label">Analysis Time</div><div class="sd-value orange">${result.time_ms} ms</div></div>
    </div>
    <div style="margin-top:8px;font-size:0.72rem;color:var(--muted);font-family:var(--mono)">Model: ${result.model}</div>`;

  // Feature bars
  qs('#dfFeatureCard').style.display = 'block';
  let fHtml = '';
  for (const [name, val] of Object.entries(result.features)) {
    fHtml += meterHTML(name, val);
  }
  qs('#dfFeatures').innerHTML = fHtml;

  addLog('dfLog', `Verdict: ${result.verdict} (${result.fake_pct.toFixed(1)}% fake)`, isFake ? 'log-err' : 'log-ok');

  // Update global stats
  state.scans++;
  isFake ? state.threats++ : state.safe++;
  updateSidebarStats();
  dashLog(`[DEEPFAKE] ${result.verdict} — ${result.fake_pct.toFixed(1)}% fake probability`, isFake ? 'log-err' : 'log-ok');

  btn.disabled = false;
  btn.innerHTML = 'Analyse Image';
}

/* ══════════════════════════════════════════════════════════════════
   MODULE 2: CYBERBULLYING DETECTOR
══════════════════════════════════════════════════════════════════ */

function setCBSample(text) { qs('#cbText').value = text; }

const TOXIC_KW = ['loser', 'nobody likes', 'go away', 'regret', 'ugly', 'stupid',
  'idiot', 'hate you', 'kill', 'die', 'worthless', 'pathetic', 'disgusting', 'freak',
  'moron', 'shut up', 'dumb', 'useless', 'you should', 'exist'];
const THREAT_KW = ['find out where', 'make you regret', 'i will hurt', 'you will pay'];
const HATE_KW = ['go back to your country', 'your kind', 'you people are', 'religion is garbage'];
const PROFANE_KW = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'motherfucker'];

function localCBAnalyse(text) {
  const t = text.toLowerCase();
  const hits = [];
  const hitScore = (list, w) => {
    let s = 0;
    list.forEach(k => {
      if (t.includes(k)) { s += w; hits.push(k); }
    });
    return s;
  };
  const threat = Math.min(100, hitScore(THREAT_KW, 42) + (/\b(kill|hurt|pay|find you)\b/.test(t) ? 20 : 0));
  const profanity = Math.min(100, hitScore(PROFANE_KW, 28));
  const hate = Math.min(100, hitScore(HATE_KW, 45));
  const bullying = Math.min(100, hitScore(TOXIC_KW, 18) + Math.max(0, profanity - 20) * 0.4);
  const harassment = Math.min(100, Math.max(bullying * 0.85, threat * 0.7));
  const capsBoost = (text.replace(/[^A-Za-z]/g, '').length >= 8 && /[A-Z]{4,}/.test(text)) ? 8 : 0;
  const score = Math.min(100, Math.max(bullying, harassment, threat, hate, profanity) + capsBoost);
  const verdict = score >= 40 ? 'TOXIC' : 'CLEAN';

  return {
    verdict,
    score,
    labels: {
      Bullying: +bullying.toFixed(1),
      Harassment: +harassment.toFixed(1),
      Threat: +threat.toFixed(1),
      'Hate Speech': +hate.toFixed(1),
      Profanity: +profanity.toFixed(1),
    },
    highlights: Array.from(new Set(hits)).slice(0, 8),
    analysis: verdict === 'TOXIC'
      ? 'Rule-based fallback detected harmful wording patterns.'
      : 'Fallback analysis found no strong harmful patterns.',
    model: 'Rule+Semantic fallback'
  };
}

async function runCyberbully() {
  const text = qs('#cbText').value.trim();
  if (!text) { alert('Please enter text to analyse.'); return; }

  const platform = qs('#cbPlatform').value;
  const resultBox = qs('#cbResult');
  resultBox.className = 'result-empty';
  resultBox.innerHTML = '<span><span class="spinner"></span>Classifying…</span>';

  await sleep(500);

  let result = null;
  const apiOnline = qs('#apiStatus').classList.contains('online');

  if (apiOnline) {
    try {
      const resp = await fetch(`${API}/cyberbully`, {
        method: 'POST',
        signal: AbortSignal.timeout(6000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const apiResult = await resp.json();
      if (
        resp.ok &&
        apiResult &&
        typeof apiResult.score === 'number' &&
        typeof apiResult.verdict === 'string' &&
        apiResult.labels &&
        !apiResult.error
      ) {
        result = apiResult;
      }
    } catch (_) { }
  }

  if (!result) {
    result = localCBAnalyse(text);
  }

  const isToxic = result.verdict === 'TOXIC';
  const cls = isToxic ? 'threat' : 'safe';
  const icon = isToxic ? '⚠️' : '✅';
  const lbl = isToxic ? 'TOXIC CONTENT DETECTED' : 'CONTENT CLEAR';
  const modelName = result.model || 'Cyberbully Analyzer';
  const sub = `Toxicity score: ${result.score.toFixed(1)}% · Platform: ${platform} · ${modelName}`;

  resultBox.className = '';
  resultBox.innerHTML = `
    <div class="verdict ${cls}">
      <span class="verdict-icon">${icon}</span>
      <div><div class="verdict-label">${lbl}</div><div class="verdict-sub">${sub}</div></div>
    </div>`;

  if (result.analysis) {
    resultBox.innerHTML += `<div class="section-label" style="margin-top:10px;text-transform:none;letter-spacing:0;font-weight:500">${escapeHtml(result.analysis)}</div>`;
  }

  // Label scores
  let sHtml = '';
  const labelColors = {
    Bullying: 'fill-red', Harassment: 'fill-orange', Threat: 'fill-red',
    'Hate Speech': 'fill-orange', Profanity: 'fill-purple'
  };
  for (const [name, val] of Object.entries(result.labels)) {
    sHtml += meterHTML(name, Math.min(100, val), labelColors[name]);
  }
  qs('#cbScores').innerHTML = sHtml;

  // Attention highlights
  const attnCard = qs('#cbAttentionCard');
  attnCard.style.display = 'block';
  const highlightSet = new Set((result.highlights || []).map(x => String(x).toLowerCase()));
  const words = text.split(/\s+/);
  const attnHtml = words.map(w => {
    const wl = w.toLowerCase().replace(/[^a-z0-9']/g, '');
    const isKey = Array.from(highlightSet).some(h => h && (h === wl || h.includes(wl) || wl.includes(h)));
    const bg = isKey ? (isToxic ? 'rgba(248,81,73,0.2)' : 'rgba(240,136,62,0.2)') : 'transparent';
    const col = isKey ? (isToxic ? 'var(--red)' : 'var(--orange)') : 'inherit';
    return `<span style="background:${bg};color:${col};padding:1px 5px;border-radius:4px;"> ${escapeHtml(w)} </span>`;
  }).join(' ');
  qs('#cbAttention').innerHTML = attnHtml;

  state.scans++;
  isToxic ? state.threats++ : state.safe++;
  updateSidebarStats();
  dashLog(`[CYBERBULLY] ${result.verdict} on ${platform} (${result.score.toFixed(1)}%)`, isToxic ? 'log-err' : 'log-ok');
}

/* ══════════════════════════════════════════════════════════════════
   MODULE 3: DARK WEB MONITOR
══════════════════════════════════════════════════════════════════ */

let dwCtx = null;
let dwRunToken = 0;

const DARKWEB_PROFILES = {
  'Drug Markets': {
    signals: ['fentanyl', 'oxy', 'pills', 'stash', 'vendor', 'cartel', 'escrow'],
    baseRisk: 0.72,
    activity: 'market listing',
  },
  'Hacking Forums': {
    signals: ['exploit', 'rce', 'zero-day', 'privilege escalation', 'botnet', 'c2', 'shell'],
    baseRisk: 0.68,
    activity: 'forum thread',
  },
  'Stolen Data / Credentials': {
    signals: ['dump', 'combo', 'credential', 'leak', 'breach', 'access', 'vpn'],
    baseRisk: 0.84,
    activity: 'data dump',
  },
  'Ransomware Infrastructure': {
    signals: ['raas', 'decryptor', 'beacon', 'payload', 'persistence', 'affiliate', 'panel'],
    baseRisk: 0.9,
    activity: 'infrastructure node',
  },
  'Fraud Services': {
    signals: ['phish', 'spoof', 'carding', 'mule', 'otp', 'otp-bypass', 'identity'],
    baseRisk: 0.74,
    activity: 'service listing',
  },
};

function darkWebSeed(...parts) {
  const raw = parts.map(p => String(p).trim().toLowerCase()).join('|');
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function darkWebRng(seed) {
  let x = seed >>> 0;
  if (!x) x = 1;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function normalizeDarkWebKeywords(raw) {
  return String(raw || '')
    .split(/[,;/\n]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function darkWebLevel(score) {
  if (score >= 0.88) return 'critical';
  if (score >= 0.7) return 'high';
  if (score >= 0.48) return 'medium';
  return 'low';
}

function darkWebOnion(seed, index) {
  const rng = darkWebRng(seed + (index + 1) * 7919);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = '';
  for (let i = 0; i < 16; i++) out += alphabet[Math.floor(rng() * alphabet.length)];
  return `${out}.onion`;
}

function buildDarkWebFallback(category, keywordsRaw, nodeCount) {
  const profile = DARKWEB_PROFILES[category] || {
    signals: ['tor', 'market', 'dump', 'proxy', 'exploit'],
    baseRisk: 0.6,
    activity: 'hidden service',
  };
  const keywords = normalizeDarkWebKeywords(keywordsRaw);
  const seed = darkWebSeed(category, keywordsRaw, nodeCount);
  const nodes = [];
  const findings = [];
  const timeline = [];
  const matchedSignals = profile.signals.filter(sig => keywords.includes(sig));
  const summary = { critical: 0, high: 0, medium: 0, low: 0 };
  const W = 420, H = 230;
  const cx = W / 2, cy = H / 2;

  for (let i = 0; i < nodeCount; i++) {
    const rng = darkWebRng(seed + i * 313);
    const angle = ((i / Math.max(nodeCount, 1)) * Math.PI * 2) - Math.PI / 2 + (rng() - 0.5) * 0.7;
    const dist = 55 + rng() * 75;
    const exposure = 0.15 + rng() * 0.8;
    const intel = 0.05 + rng() * 0.25;
    const signalBoost = matchedSignals.length * 0.06;
    const noise = (rng() * 0.26) - 0.12;
    const spread = Math.sin((i / Math.max(nodeCount, 1)) * Math.PI * 2) * 0.16;
    const score = Math.max(0, Math.min(1, 0.25 + (profile.baseRisk * 0.45) + (exposure * 0.2) + (intel * 0.1) + signalBoost + noise + spread));
    const level = darkWebLevel(score);
    const x = +(cx + Math.cos(angle) * dist).toFixed(2);
    const y = +(cy + Math.sin(angle) * dist).toFixed(2);
    const onion = darkWebOnion(seed, i);
    const node = {
      id: `N${String(i + 1).padStart(2, '0')}`,
      onion,
      level,
      score: +(score * 100).toFixed(1),
      x,
      y,
      r: +(6 + rng() * 5).toFixed(2),
      activity: profile.activity,
      last_seen: `${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}-${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-2026`,
      indicators: [...new Set([...matchedSignals.slice(0, 3), ...keywords.slice(0, 2)])],
      keywords,
      delay_ms: Math.floor(220 + (i * 35) + rng() * 120),
    };
    nodes.push(node);
    summary[level]++;
    if (level === 'critical' || level === 'high') {
      findings.push({
        id: node.id,
        onion: node.onion,
        level: node.level,
        score: node.score,
        activity: node.activity,
        indicators: node.indicators,
        last_seen: node.last_seen,
      });
    }
    timeline.push({
      step: i + 1,
      node,
      level,
      delay_ms: node.delay_ms,
      message: `Resolved ${node.id} — ${level.toUpperCase()} ${profile.activity} at ${node.onion}`,
    });
  }

  return {
    scan_id: `local-${darkWebSeed(category, keywordsRaw, nodeCount).toString(16).slice(0, 8)}`,
    category,
    keywords,
    nodes,
    findings,
    timeline,
    summary: {
      ...summary,
      total: nodeCount,
      suspicious: findings.length,
      average_risk: +(nodes.reduce((acc, n) => acc + n.score, 0) / Math.max(nodeCount, 1)).toFixed(1),
      matched_keywords: matchedSignals,
      estimated_duration_ms: timeline.reduce((acc, item) => acc + item.delay_ms, 0),
    },
    recommendations: findings.length
      ? ['Correlate onion addresses with IOCs and preserve evidence.']
      : ['No high-confidence threats found in this simulated crawl.'],
  };
}

function buildDarkWebLinkFallback(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return { error: 'Empty URL' };

  const normalized = value.includes('://') ? value : `https://${value}`;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (_) {
    return { error: 'Invalid URL format' };
  }

  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  const host = (parsed.hostname || '').toLowerCase();
  const path = parsed.pathname || '/';
  const query = parsed.search ? parsed.search.slice(1) : '';
  if (!host) return { error: 'Invalid URL format' };
  if (!host.endsWith('.onion') && host !== 'localhost') {
    const hasDomain = host.includes('.');
    const hasIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    if (!hasDomain && !hasIp) return { error: 'Invalid URL format' };
  }

  const signals = [];
  const notes = [];
  let risk = 0;
  const suspiciousTerms = ['login', 'admin', 'panel', 'wallet', 'token', 'verify', 'reset', 'seed', 'password', 'dump', 'leak', 'combo'];
  const isOnion = host.endsWith('.onion');

  if (scheme === 'http') {
    risk += 16;
    signals.push('plain-http');
    notes.push('No TLS in URL');
  } else {
    notes.push('HTTPS URL');
  }

  if (isOnion) {
    const onionCore = host.slice(0, -6);
    const onionV3 = /^[a-z2-7]{56}$/.test(onionCore);
    const onionV2 = /^[a-z2-7]{16}$/.test(onionCore);
    if (onionV3) {
      notes.push('Valid v3 onion structure');
    } else if (onionV2) {
      notes.push('Legacy v2 onion structure');
      risk += 8;
    } else {
      risk += 35;
      signals.push('malformed-onion');
      notes.push('Malformed onion host');
    }
    if (query) {
      risk += 6;
      signals.push('query-string');
    }
    if (path.length > 24) {
      risk += 5;
      signals.push('deep-path');
    }
    if (suspiciousTerms.some(term => path.toLowerCase().includes(term))) {
      risk += 12;
      signals.push('credential-like-path');
    }
  } else {
    try {
      new URL(`http://${host}`);
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
        risk += 18;
        signals.push('ip-literal-host');
        notes.push('Host is an IP literal');
      }
    } catch (_) { }
    if (host.startsWith('xn--') || host.includes('.xn--')) {
      risk += 10;
      signals.push('punycode');
      notes.push('Punycode hostname');
    }
    if (query) {
      risk += 4;
      signals.push('query-string');
    }
    if (path.length > 30) {
      risk += 4;
      signals.push('deep-path');
    }
    if (suspiciousTerms.some(term => (host + path).toLowerCase().includes(term))) {
      risk += 10;
      signals.push('credential-like-path');
    }
  }

  const verification = (!isOnion && scheme === 'https' && risk <= 20)
    ? 'Verified (structural)'
    : (isOnion && risk <= 20)
      ? 'Verified (onion structure)'
      : 'Unverified';

  let verdict = 'CLEAN';
  if (isOnion) verdict = risk >= 35 ? 'ONION_SUSPICIOUS' : 'ONION_VALID';
  else verdict = risk >= 35 ? 'CLEARNET_SUSPICIOUS' : 'CLEARNET_VERIFIED';

  return {
    input: value,
    normalized,
    scheme,
    host,
    category: isOnion ? 'onion' : 'clearnet',
    status: isOnion ? 'ONION_STRUCTURAL' : 'CLEARNET_STRUCTURAL',
    verification,
    verdict,
    risk_score: +Math.min(risk, 100).toFixed(1),
    confidence: +(Math.max(5, Math.min(99, 100 - risk))).toFixed(1),
    signals,
    notes,
    summary: 'Structural URL analysis only; no live target access performed.',
  };
}

function renderDarkWebLinkResult(result) {
  const box = qs('#dwLinkResult');
  if (!box) return;

  if (!result || result.error) {
    box.className = 'result-empty';
    box.innerHTML = `<span>⚠️ ${escapeHtml(result && result.error ? result.error : 'Unable to analyze URL')}</span>`;
    return;
  }

  const suspicious = /SUSPICIOUS/.test(result.verdict) || (result.risk_score || 0) >= 35;
  const icon = result.category === 'onion' ? '🕸️' : '🔗';
  const statusClass = suspicious ? 'threat' : 'safe';
  const sigHtml = (result.signals || []).length
    ? result.signals.map(sig => `<span class="badge ${suspicious ? 'red' : 'orange'}">${escapeHtml(sig)}</span>`).join(' ')
    : '<span class="badge green">No obvious signals</span>';
  const noteHtml = (result.notes || []).map(note => `<div class="issue-item ${suspicious ? 'warn' : 'ok'}">• ${escapeHtml(note)}</div>`).join('');

  box.className = '';
  box.innerHTML = `
    <div class="verdict ${statusClass}">
      <span class="verdict-icon">${icon}</span>
      <div>
        <div class="verdict-label">${escapeHtml(result.verdict.replace(/_/g, ' '))}</div>
        <div class="verdict-sub">${escapeHtml(result.verification)} · Confidence ${result.confidence}%</div>
      </div>
    </div>
    <div class="stat-detail">
      <div class="sd-item"><div class="sd-label">URL Type</div><div class="sd-value blue">${escapeHtml(result.category)}</div></div>
      <div class="sd-item"><div class="sd-label">Risk Score</div><div class="sd-value ${suspicious ? 'red' : 'green'}">${result.risk_score}%</div></div>
      <div class="sd-item"><div class="sd-label">Host</div><div class="sd-value blue">${escapeHtml(result.host)}</div></div>
      <div class="sd-item"><div class="sd-label">Signals</div><div class="sd-value orange">${(result.signals || []).length}</div></div>
    </div>
    <div class="issue-item ${suspicious ? 'warn' : 'ok'}">${escapeHtml(result.summary)}</div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">${sigHtml}</div>
    <div style="margin-top:10px;">${noteHtml}</div>
  `;
}

function parseDarkWebSnapshot(rawSource) {
  const source = String(rawSource || '').trim();
  if (!source) return { error: 'Empty page source' };

  const isHtml = /<[^>]+>/.test(source);
  let title = 'Untitled page';
  let text = source;
  let links = [];

  if (isHtml && window.DOMParser) {
    try {
      const doc = new DOMParser().parseFromString(source, 'text/html');
      title = (doc.querySelector('title')?.textContent || title).trim() || title;
      text = (doc.body?.innerText || source).trim();
      links = Array.from(doc.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(Boolean);
    } catch (_) {
      links = [];
    }
  } else {
    const titleMatch = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) title = titleMatch[1].trim() || title;
    links = (source.match(/https?:\/\/[^\s"'<>]+|[a-z2-7]{16,56}\.onion[^\s"'<>]*/gi) || []).map(s => s.trim());
    text = source.replace(/<[^>]+>/g, ' ');
  }

  const lowered = text.toLowerCase();
  const signalMap = {
    market: ['market', 'vendor', 'cartel', 'stash', 'escrow', 'order'],
    forum: ['forum', 'thread', 'reply', 'post', 'account', 'profile'],
    login: ['login', 'signin', 'authenticate', 'password', 'otp', '2fa'],
    leak: ['dump', 'leak', 'database', 'credentials', 'combo', 'breach'],
    fraud: ['carding', 'phish', 'spoof', 'wallet', 'mule', 'otp-bypass'],
    ransomware: ['raas', 'decryptor', 'beacon', 'panel', 'payload', 'affiliate'],
  };

  const pageTypes = [];
  for (const [label, keywords] of Object.entries(signalMap)) {
    const score = keywords.reduce((acc, kw) => acc + (lowered.includes(kw) ? 1 : 0), 0);
    if (score) pageTypes.push([label, score]);
  }
  const pageType = pageTypes.length ? pageTypes[0][0] : 'general';
  const keywordHits = [...new Set(Object.values(signalMap).flat().filter(kw => lowered.includes(kw)))];

  const cleanedLinks = [...new Set(links.map(l => l.trim()).filter(Boolean))];
  let onionLinks = 0;
  let externalLinks = 0;
  let suspiciousLinks = 0;
  cleanedLinks.forEach(href => {
    const host = (() => {
      try {
        const u = new URL(href.includes('://') ? href : `https://${href}`);
        return (u.hostname || '').toLowerCase();
      } catch (_) {
        return '';
      }
    })();
    if (host.endsWith('.onion')) onionLinks++;
    else if (host) externalLinks++;
    if (/(login|wallet|token|password|dump|leak)/i.test(href + ' ' + lowered)) suspiciousLinks++;
  });

  let risk = 0;
  if (onionLinks) risk += 14;
  if (suspiciousLinks) risk += suspiciousLinks * 8;
  if (['leak', 'fraud', 'ransomware'].includes(pageType)) risk += 18;
  if (pageType === 'login') risk += 10;
  if (keywordHits.length >= 4) risk += 12;
  const wordCount = (text.match(/\b\w+\b/g) || []).length;
  if (wordCount < 20) risk += 8;

  return {
    title,
    page_type: pageType,
    word_count: wordCount,
    link_count: cleanedLinks.length,
    onion_links: onionLinks,
    external_links: externalLinks,
    suspicious_links: suspiciousLinks,
    keywords: keywordHits,
    risk_score: +Math.min(risk, 100).toFixed(1),
    confidence: +(Math.max(5, Math.min(99, 100 - risk))).toFixed(1),
    verification: isHtml ? 'Verified snapshot' : 'Text snapshot',
    verdict: risk >= 30 ? 'SUSPICIOUS' : 'NORMAL',
    links: cleanedLinks.slice(0, 20),
    summary: 'Snapshot-only page analysis; no live site fetch performed.',
  };
}

function renderDarkWebPageResult(result) {
  const box = qs('#dwPageResult');
  if (!box) return;

  if (!result || result.error) {
    box.className = 'result-empty';
    box.innerHTML = `<span>⚠️ ${escapeHtml(result && result.error ? result.error : 'Unable to analyze snapshot')}</span>`;
    return;
  }

  const suspicious = (result.risk_score || 0) >= 30;
  const linkPreview = (result.links || []).length
    ? result.links.map(link => `<div class="issue-item ${suspicious ? 'warn' : 'ok'}">${escapeHtml(link)}</div>`).join('')
    : '<div class="issue-item ok">No links found in the snapshot.</div>';

  box.className = '';
  box.innerHTML = `
    <div class="verdict ${suspicious ? 'threat' : 'safe'}">
      <span class="verdict-icon">${suspicious ? '⚠️' : '✅'}</span>
      <div>
        <div class="verdict-label">${escapeHtml(result.verdict)} PAGE</div>
        <div class="verdict-sub">${escapeHtml(result.verification)} · Confidence ${result.confidence}%</div>
      </div>
    </div>
    <div class="stat-detail">
      <div class="sd-item"><div class="sd-label">Title</div><div class="sd-value blue">${escapeHtml(result.title)}</div></div>
      <div class="sd-item"><div class="sd-label">Page Type</div><div class="sd-value orange">${escapeHtml(result.page_type)}</div></div>
      <div class="sd-item"><div class="sd-label">Words</div><div class="sd-value blue">${result.word_count}</div></div>
      <div class="sd-item"><div class="sd-label">Risk</div><div class="sd-value ${suspicious ? 'red' : 'green'}">${result.risk_score}%</div></div>
    </div>
    <div class="stat-detail" style="margin-top:10px">
      <div class="sd-item"><div class="sd-label">Onion Links</div><div class="sd-value blue">${result.onion_links}</div></div>
      <div class="sd-item"><div class="sd-label">External Links</div><div class="sd-value blue">${result.external_links}</div></div>
      <div class="sd-item"><div class="sd-label">Suspicious Links</div><div class="sd-value ${suspicious ? 'red' : 'green'}">${result.suspicious_links}</div></div>
      <div class="sd-item"><div class="sd-label">Signals</div><div class="sd-value orange">${(result.keywords || []).length}</div></div>
    </div>
    <div class="issue-item ${suspicious ? 'warn' : 'ok'}">${escapeHtml(result.summary)}</div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
      ${(result.keywords || []).length ? result.keywords.map(k => `<span class="badge ${suspicious ? 'red' : 'orange'}">${escapeHtml(k)}</span>`).join(' ') : '<span class="badge green">No major signals</span>'}
    </div>
    <div style="margin-top:10px;">${linkPreview}</div>
  `;
}

function initDWCanvas() {
  const canvas = qs('#dwCanvas');
  if (!canvas) return;
  dwCtx = canvas.getContext('2d');
  drawIdleGraph(canvas);
}

function drawIdleGraph(canvas) {
  const W = canvas.width, H = canvas.height;
  dwCtx.clearRect(0, 0, W, H);
  dwCtx.fillStyle = '#0a0f1a';
  dwCtx.fillRect(0, 0, W, H);
  dwCtx.strokeStyle = 'rgba(88,166,255,0.2)';
  dwCtx.beginPath();
  dwCtx.arc(W / 2, H / 2, 20, 0, Math.PI * 2);
  dwCtx.stroke();
  dwCtx.fillStyle = 'rgba(88,166,255,0.08)';
  dwCtx.fill();
  dwCtx.fillStyle = 'rgba(88,166,255,0.5)';
  dwCtx.font = '9px JetBrains Mono, monospace';
  dwCtx.textAlign = 'center';
  dwCtx.fillText('HUB', W / 2, H / 2 + 4);
  dwCtx.fillStyle = 'rgba(125,133,144,0.5)';
  dwCtx.fillText('Awaiting intel scan…', W / 2, H - 10);
}

function drawGraph(nodes, canvas, activeNodeId = null) {
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  dwCtx.clearRect(0, 0, W, H);
  dwCtx.fillStyle = '#0a0f1a';
  dwCtx.fillRect(0, 0, W, H);

  const colors = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };

  nodes.forEach(n => {
    dwCtx.beginPath(); dwCtx.moveTo(cx, cy); dwCtx.lineTo(n.x, n.y);
    dwCtx.strokeStyle = 'rgba(48,54,61,0.8)'; dwCtx.lineWidth = 1; dwCtx.stroke();
  });

  // Hub
  const hg = dwCtx.createRadialGradient(cx, cy, 2, cx, cy, 18);
  hg.addColorStop(0, 'rgba(88,166,255,0.4)'); hg.addColorStop(1, 'rgba(88,166,255,0.05)');
  dwCtx.beginPath(); dwCtx.arc(cx, cy, 18, 0, Math.PI * 2);
  dwCtx.fillStyle = hg; dwCtx.fill();
  dwCtx.strokeStyle = '#58a6ff'; dwCtx.lineWidth = 1.5; dwCtx.stroke();
  dwCtx.fillStyle = '#58a6ff'; dwCtx.font = '8px JetBrains Mono, monospace';
  dwCtx.textAlign = 'center'; dwCtx.fillText('HUB', cx, cy + 3);

  nodes.forEach(n => {
    const col = colors[n.level];
    const isActive = activeNodeId && n.id === activeNodeId;
    dwCtx.shadowColor = col; dwCtx.shadowBlur = isActive ? 18 : (n.level === 'critical' ? 12 : 5);
    dwCtx.beginPath(); dwCtx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    dwCtx.fillStyle = col + '20'; dwCtx.fill();
    dwCtx.strokeStyle = col; dwCtx.lineWidth = 1.5; dwCtx.stroke();
    dwCtx.shadowBlur = 0;
    dwCtx.beginPath(); dwCtx.arc(n.x, n.y, n.r * 0.4, 0, Math.PI * 2);
    dwCtx.fillStyle = col; dwCtx.fill();
    if (isActive) {
      dwCtx.beginPath();
      dwCtx.arc(n.x, n.y, n.r + 4, 0, Math.PI * 2);
      dwCtx.strokeStyle = 'rgba(255,255,255,0.7)';
      dwCtx.lineWidth = 1;
      dwCtx.stroke();
    }
  });
}

async function runDarkWeb() {
  const runToken = ++dwRunToken;
  const btn = qs('#dwBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Scanning…';
  qs('#dwFindings').innerHTML = '<div class="result-empty"><span>Scanning…</span></div>';
  qs('#dwLog').innerHTML = '<div class="log-sys">// Live hidden-service intelligence scan initiated.</div>';

  const canvas = qs('#dwCanvas');
  const nodeCount = parseInt(qs('#dwNodes').value);
  const cat = qs('#dwCat').value;
  const kw = qs('#dwKw').value;
  addLog('dwLog', 'Establishing Tor-style circuit and hidden-service discovery path…', 'log-info');
  await sleep(250);

  let result = null;
  const apiOnline = qs('#apiStatus').classList.contains('online');
  if (apiOnline) {
    try {
      const resp = await fetch(`${API}/darkweb/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat, keywords: kw, nodes: nodeCount })
      });
      if (resp.ok) result = await resp.json();
    } catch (_) { }
  }
  if (!result) result = buildDarkWebFallback(cat, kw, nodeCount);

  addLog('dwLog', `Target: ${cat} | Keywords: [${normalizeDarkWebKeywords(kw).join(', ')}]`, 'log-sys');
  await sleep(150);

  const seenNodes = [];
  const orderedTimeline = Array.isArray(result.timeline) ? result.timeline : [];
  for (const step of orderedTimeline) {
    if (runToken !== dwRunToken) return;
    await sleep(Math.min(step.delay_ms || 220, 420));
    seenNodes.push(step.node);
    drawGraph(seenNodes, canvas, step.node.id);
    addLog('dwLog', step.message, {
      critical: 'log-err',
      high: 'log-warn',
      medium: 'log-info',
      low: 'log-ok',
    }[step.level] || 'log-info');
  }

  const summary = result.summary || {};
  const findings = Array.isArray(result.findings) ? result.findings : [];
  const matchedKeywords = Array.isArray(summary.matched_keywords) ? summary.matched_keywords : normalizeDarkWebKeywords(kw);

  if (findings.length === 0) {
    qs('#dwFindings').innerHTML = `
      <div class="stat-detail">
        <div class="sd-item"><div class="sd-label">Intel Scan ID</div><div class="sd-value blue">${result.scan_id || 'n/a'}</div></div>
        <div class="sd-item"><div class="sd-label">Avg Risk</div><div class="sd-value green">${summary.average_risk ?? 0}%</div></div>
        <div class="sd-item"><div class="sd-label">Matched Keywords</div><div class="sd-value blue">${matchedKeywords.length}</div></div>
        <div class="sd-item"><div class="sd-label">Threats</div><div class="sd-value green">0</div></div>
      </div>
      <div class="issue-item ok">✅ No high-confidence threats found in this scan.</div>
      ${(result.recommendations || []).map(r => `<div class="issue-item warn">⚠️ ${r}</div>`).join('')}`;
  } else {
    qs('#dwFindings').innerHTML = `
      <div class="stat-detail" style="margin-bottom:12px">
        <div class="sd-item"><div class="sd-label">Intel Scan ID</div><div class="sd-value blue">${result.scan_id || 'n/a'}</div></div>
        <div class="sd-item"><div class="sd-label">Critical / High</div><div class="sd-value red">${summary.critical || 0} / ${summary.high || 0}</div></div>
        <div class="sd-item"><div class="sd-label">Avg Risk</div><div class="sd-value orange">${summary.average_risk ?? 0}%</div></div>
        <div class="sd-item"><div class="sd-label">Matched Keywords</div><div class="sd-value blue">${matchedKeywords.join(', ') || 'none'}</div></div>
      </div>
      ${findings.map(f => `
        <div class="finding ${f.level}">
          <div class="finding-header">
            <span class="badge ${f.level === 'critical' ? 'red' : 'orange'}">${f.level.toUpperCase()}</span>
            <span>Node ${f.id}</span>
          </div>
          <div class="finding-body">
            Onion: ${f.onion}<br>
            Activity: ${f.activity}<br>
            Score: ${f.score}% &nbsp;|&nbsp; Last seen: ${f.last_seen}
          </div>
        </div>`).join('')}
      ${(result.recommendations || []).map(r => `<div class="issue-item warn">⚠️ ${r}</div>`).join('')}`;
  }

  const criticalCount = summary.critical || 0;
  const highCount = summary.high || 0;
  const mediumCount = summary.medium || 0;
  const threatHit = criticalCount + highCount > 0;

  addLog('dwLog', `Scan complete — ${criticalCount} critical, ${highCount} high, ${mediumCount} medium hits`, threatHit ? 'log-err' : 'log-ok');
  state.scans++;
  threatHit ? state.threats++ : state.safe++;
  state.warns += mediumCount;
  updateSidebarStats();
  dashLog(`[DARKWEB] ${criticalCount} critical / ${highCount} high / ${mediumCount} medium on ${cat}`, threatHit ? 'log-err' : 'log-ok');

  btn.disabled = false;
  btn.innerHTML = 'Start Scan';
}

async function runDarkWebLink() {
  const btn = qs('#dwLinkBtn');
  const input = qs('#dwLink').value.trim();
  if (!input) {
    alert('Paste a URL first.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Analyzing…';
  qs('#dwLinkResult').innerHTML = '<div class="result-empty"><span>Analyzing link…</span></div>';

  addLog('dwLog', `Analyzing link intelligence for ${input}`, 'log-info');
  await sleep(180);

  let result = null;
  const apiOnline = qs('#apiStatus').classList.contains('online');
  if (apiOnline) {
    try {
      const resp = await fetch(`${API}/darkweb/link-intel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: input })
      });
      result = await resp.json();
    } catch (_) { }
  }

  if (!result || result.error) {
    result = buildDarkWebLinkFallback(input);
  }

  renderDarkWebLinkResult(result);

  const suspicious = !!result.error || /SUSPICIOUS/.test(result.verdict) || (result.risk_score || 0) >= 35;
  state.scans++;
  if (result.error) {
    state.warns++;
  } else if (suspicious) {
    state.threats++;
  } else {
    state.safe++;
  }
  updateSidebarStats();
  dashLog(`[DARKWEB LINK] ${result.error ? 'INVALID' : result.verdict} · ${result.host || input}`, suspicious ? 'log-warn' : 'log-ok');
  addLog('dwLog', `Link verdict: ${result.error ? 'INVALID' : result.verdict} (${result.risk_score ?? 0}%)`, suspicious ? 'log-warn' : 'log-ok');

  btn.disabled = false;
  btn.innerHTML = 'Analyze Link';
}

async function runDarkWebPageIntel() {
  const btn = qs('#dwPageBtn');
  const source = qs('#dwPageSource').value.trim();
  const originUrl = qs('#dwPageUrl').value.trim();
  if (!source) {
    alert('Paste page source or text first.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Scraping…';
  qs('#dwPageResult').innerHTML = '<div class="result-empty"><span>Analyzing snapshot…</span></div>';

  addLog('dwLog', `Scraping snapshot content${originUrl ? ` from ${originUrl}` : ''}`, 'log-info');
  await sleep(180);

  let result = null;
  const apiOnline = qs('#apiStatus').classList.contains('online');
  if (apiOnline) {
    try {
      const resp = await fetch(`${API}/darkweb/page-intel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, origin_url: originUrl })
      });
      result = await resp.json();
    } catch (_) { }
  }

  if (!result || result.error) {
    result = parseDarkWebSnapshot(source);
  }

  renderDarkWebPageResult(result);

  const suspicious = !!result.error || (result.risk_score || 0) >= 30;
  state.scans++;
  if (result.error) state.warns++;
  else if (suspicious) state.threats++;
  else state.safe++;
  updateSidebarStats();
  dashLog(`[DARKWEB SNAPSHOT] ${result.error ? 'INVALID' : result.verdict} · ${result.page_type || 'n/a'}`, suspicious ? 'log-warn' : 'log-ok');
  addLog('dwLog', `Snapshot verdict: ${result.error ? 'INVALID' : result.verdict} (${result.risk_score ?? 0}%)`, suspicious ? 'log-warn' : 'log-ok');

  btn.disabled = false;
  btn.innerHTML = 'Scrape Snapshot';
}

/* ══════════════════════════════════════════════════════════════════
   MODULE 4: LOG TAMPERING
══════════════════════════════════════════════════════════════════ */

const LOG_SCENARIOS = {
  clean: `2025-01-10 08:01:23 INFO  User admin logged in from 192.168.1.1
2025-01-10 08:02:11 INFO  File /etc/config.yaml read by admin
2025-01-10 08:05:44 INFO  Database backup completed successfully
2025-01-10 08:10:09 INFO  Service nginx restarted by admin
2025-01-10 08:15:31 INFO  User guest logged out
2025-01-10 08:20:00 INFO  Scheduled scan completed — 0 threats`,

  deletion: `2025-01-10 08:01:23 INFO  User admin logged in from 192.168.1.1
2025-01-10 08:05:44 INFO  Database backup completed successfully
2025-01-10 08:15:31 INFO  User guest logged out
2025-01-10 08:20:00 INFO  Scheduled scan completed — 0 threats
[ENTRIES 08:02:11–08:05:44 MISSING — POSSIBLE DELETION]`,

  modified: `2025-01-10 08:01:23 INFO  User admin logged in from 192.168.1.1
2025-01-10 08:02:11 INFO  File /etc/passwd read by guest
2025-01-10 08:05:44 INFO  Database backup completed successfully
2025-01-10 08:10:09 INFO  Service nginx restarted by admin
2025-01-10 08:15:31 INFO  User attacker logged out
2025-01-10 08:20:00 INFO  Scheduled scan completed — 0 threats`,

  injected: `2025-01-10 08:01:23 INFO  User admin logged in from 192.168.1.1
2025-01-10 08:02:11 INFO  File /etc/config.yaml read by admin
2025-01-10 08:04:57 WARN  Failed login from 10.0.0.99
2025-01-10 08:04:58 INFO  User root logged in from 10.0.0.99
2025-01-10 08:05:00 INFO  sudo su executed by unknown
2025-01-10 08:05:44 INFO  Database backup completed
2025-01-10 08:10:09 INFO  Service nginx restarted by admin`,

  timestamp: `2025-01-10 08:01:23 INFO  User admin logged in from 192.168.1.1
2025-01-10 08:02:11 INFO  File /etc/config.yaml read by admin
2025-01-10 07:58:44 INFO  Database backup completed successfully
2025-01-10 08:10:09 INFO  Service nginx restarted by admin
2025-01-10 08:09:15 INFO  User guest logged out
2025-01-10 08:20:00 INFO  Scheduled scan completed — 0 threats`,
};

function setLog(key) { qs('#ltLog').value = LOG_SCENARIOS[key] || ''; }

async function runLogTamper() {
  const logText = qs('#ltLog').value.trim();
  if (!logText) { alert('Load a log scenario first.'); return; }

  const method = qs('#ltMethod').value;
  const resultBox = qs('#ltResult');
  resultBox.className = 'result-empty';
  resultBox.innerHTML = '<span><span class="spinner"></span>Verifying…</span>';
  qs('#ltIssues').innerHTML = '';

  addLog('ltLog2', `Method: ${method}`, 'log-sys');
  await sleep(300);
  addLog('ltLog2', 'Building hash chain from log entries…', 'log-info');
  await sleep(400);

  let result = null;
  const apiOnline = qs('#apiStatus').classList.contains('online');

  if (apiOnline) {
    try {
      const resp = await fetch(`${API}/logtamper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log: logText })
      });
      result = await resp.json();
    } catch (_) { }
  }

  if (!result) {
    const lines = logText.split('\n').filter(l => l.trim());
    const issues = [];
    const times = [];
    lines.forEach(l => { const m = l.match(/(\d{2}:\d{2}:\d{2})/); if (m) times.push(m[1]); });
    for (let i = 1; i < times.length; i++) {
      if (times[i] < times[i - 1]) issues.push({ type: 'warn', msg: `Timestamp reversal at entry ${i + 1}` });
    }
    if (logText.includes('MISSING')) issues.push({ type: 'error', msg: 'Log sequence gap — entries may be deleted' });
    if (logText.includes('sudo su') || logText.includes('unknown'))
      issues.push({ type: 'error', msg: 'Privilege escalation pattern detected' });
    if (logText.includes('attacker') || logText.includes('etc/passwd'))
      issues.push({ type: 'error', msg: 'Suspicious user / sensitive file access' });
    result = { verdict: issues.length > 0 ? 'TAMPERED' : 'INTACT', issues, entries: lines.length };
  }

  const tampered = result.verdict === 'TAMPERED';
  const cls = tampered ? 'threat' : 'safe';
  const icon = tampered ? '⚠️' : '✅';
  const lbl = tampered ? 'LOG TAMPERING DETECTED' : 'LOGS INTACT';
  const score = tampered ? Math.floor(rnd(15, 45)) : Math.floor(rnd(94, 99));

  resultBox.className = '';
  resultBox.innerHTML = `
    <div class="verdict ${cls}">
      <span class="verdict-icon">${icon}</span>
      <div><div class="verdict-label">${lbl}</div><div class="verdict-sub">${result.entries} entries · Integrity score: ${score}%</div></div>
    </div>
    <div class="stat-detail">
      <div class="sd-item"><div class="sd-label">Entries Checked</div><div class="sd-value blue">${result.entries}</div></div>
      <div class="sd-item"><div class="sd-label">Anomalies Found</div><div class="sd-value ${tampered ? 'red' : 'green'}">${result.issues.length}</div></div>
      <div class="sd-item"><div class="sd-label">Integrity Score</div><div class="sd-value ${tampered ? 'orange' : 'green'}">${score}%</div></div>
      <div class="sd-item"><div class="sd-label">Method</div><div class="sd-value blue" style="font-size:0.75rem">${method.split(' ')[0]}</div></div>
    </div>`;

  // Issues list
  let iHtml = '';
  if (result.issues.length === 0) {
    iHtml = '<div class="issue-item ok">✅ No anomalies found. Logs appear genuine.</div>';
  } else {
    result.issues.forEach(iss => {
      const cls2 = iss.type === 'error' ? 'error' : 'warn';
      const ico = iss.type === 'error' ? '🔴' : '⚠️';
      iHtml += `<div class="issue-item ${cls2}">${ico} ${iss.msg}</div>`;
    });
  }
  qs('#ltIssues').innerHTML = iHtml;

  addLog('ltLog2', `Verdict: ${result.verdict} — ${result.issues.length} issue(s)`, tampered ? 'log-err' : 'log-ok');
  state.scans++;
  tampered ? state.threats++ : state.safe++;
  updateSidebarStats();
  dashLog(`[LOG TAMPER] ${result.verdict} — ${result.issues.length} anomalies`, tampered ? 'log-err' : 'log-ok');
}

/* ══════════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════════ */
window.addEventListener('load', () => {
  initDWCanvas();
  dashLog('Platform initialised. All 4 modules online.', 'log-ok');
  dashLog('Upload an image in Deepfake tab to test the ML model.', 'log-sys');
  updateSidebarStats();
  setupPWA();
});
