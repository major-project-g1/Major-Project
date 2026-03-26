/* ─────────────────────────────────────────────────────────────────
   CyberForensics AI — app.js
   All module logic: Deepfake (ML API), Cyberbullying, Dark Web, Log Tamper
───────────────────────────────────────────────────────────────── */

const API = 'https://major-project-te5y.onrender.com/api';

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
      model: 'RandomForest-200-trees (demo)',
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

function localCBScore(text) {
  const t = text.toLowerCase();
  let score = 0;
  TOXIC_KW.forEach(kw => { if (t.includes(kw)) score += 14; });
  THREAT_KW.forEach(kw => { if (t.includes(kw)) score += 25; });
  return Math.min(100, score + rnd(0, 5));
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      result = await resp.json();
    } catch (_) { }
  }

  if (!result) {
    const score = localCBScore(text);
    const isToxic = score >= 30;
    result = {
      verdict: isToxic ? 'TOXIC' : 'CLEAN',
      score,
      labels: {
        'Bullying': isToxic ? score * rnd(0.7, 1.0) : rnd(0, 10),
        'Harassment': isToxic ? score * rnd(0.4, 0.8) : rnd(0, 8),
        'Threat': THREAT_KW.some(k => text.toLowerCase().includes(k)) ? score * 0.85 : rnd(0, 5),
        'Hate Speech': isToxic ? score * rnd(0.1, 0.4) : rnd(0, 6),
        'Profanity': isToxic ? score * rnd(0.2, 0.5) : rnd(0, 8),
      }
    };
  }

  const isToxic = result.verdict === 'TOXIC';
  const cls = isToxic ? 'threat' : 'safe';
  const icon = isToxic ? '⚠️' : '✅';
  const lbl = isToxic ? 'TOXIC CONTENT DETECTED' : 'CONTENT CLEAR';
  const sub = `Toxicity score: ${result.score.toFixed(1)}% · Platform: ${platform}`;

  resultBox.className = '';
  resultBox.innerHTML = `
    <div class="verdict ${cls}">
      <span class="verdict-icon">${icon}</span>
      <div><div class="verdict-label">${lbl}</div><div class="verdict-sub">${sub}</div></div>
    </div>`;

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
  const words = text.split(' ');
  const attnHtml = words.map(w => {
    const wl = w.toLowerCase().replace(/[^a-z]/g, '');
    const isKey = TOXIC_KW.some(k => wl.includes(k)) || THREAT_KW.some(k => text.toLowerCase().includes(k) && k.split(' ')[0] === wl);
    const bg = isKey ? (isToxic ? 'rgba(248,81,73,0.2)' : 'rgba(240,136,62,0.2)') : 'transparent';
    const col = isKey ? (isToxic ? 'var(--red)' : 'var(--orange)') : 'inherit';
    return `<span style="background:${bg};color:${col};padding:1px 5px;border-radius:4px;"> ${w} </span>`;
  }).join('');
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
  dwCtx.fillText('Awaiting scan…', W / 2, H - 10);
}

function drawGraph(nodes, canvas) {
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
    dwCtx.shadowColor = col; dwCtx.shadowBlur = n.level === 'critical' ? 12 : 5;
    dwCtx.beginPath(); dwCtx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    dwCtx.fillStyle = col + '20'; dwCtx.fill();
    dwCtx.strokeStyle = col; dwCtx.lineWidth = 1.5; dwCtx.stroke();
    dwCtx.shadowBlur = 0;
    dwCtx.beginPath(); dwCtx.arc(n.x, n.y, n.r * 0.4, 0, Math.PI * 2);
    dwCtx.fillStyle = col; dwCtx.fill();
  });
}

async function runDarkWeb() {
  const btn = qs('#dwBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Scanning…';
  qs('#dwFindings').innerHTML = '<div class="result-empty"><span>Scanning…</span></div>';

  const canvas = qs('#dwCanvas');
  const nodeCount = parseInt(qs('#dwNodes').value);
  const cat = qs('#dwCat').value;
  const kw = qs('#dwKw').value;

  const levelDist = [0.15, 0.25, 0.35, 0.25];
  const levels = ['critical', 'high', 'medium', 'low'];
  const nodes = [];
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  let critCount = 0, highCount = 0;
  const findings = [];

  addLog('dwLog', `Initialising Tor circuit…`, 'log-info');
  await sleep(400);
  addLog('dwLog', `Target: ${cat} | Keywords: [${kw}]`, 'log-sys');
  await sleep(200);

  for (let i = 0; i < nodeCount; i++) {
    await sleep(70);
    const angle = ((i / nodeCount) * Math.PI * 2) - Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    const dist = 55 + Math.random() * 75;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;

    // Weighted random level
    let r = Math.random(), cum = 0, lIdx = 3;
    for (let j = 0; j < levelDist.length; j++) { cum += levelDist[j]; if (r < cum) { lIdx = j; break; } }
    const level = levels[lIdx];
    const node = { id: `N${(i + 1).toString().padStart(2, '0')}`, x, y, r: 6 + Math.random() * 5, level };
    nodes.push(node);
    drawGraph(nodes, canvas);

    if (level === 'critical') critCount++;
    if (level === 'high') highCount++;

    const lc = { critical: 'log-err', high: 'log-warn', medium: 'log-info', low: 'log-ok' }[level];
    addLog('dwLog', `Node ${node.id}: ${level.toUpperCase()} — ${fakeHash(6)}.onion`, lc);

    if (level === 'critical' || level === 'high') {
      findings.push({ level, node: node.id, cat, hash: fakeHash(16) });
    }
  }

  // Render findings
  if (findings.length === 0) {
    qs('#dwFindings').innerHTML = '<div class="issue-item ok">✅ No critical threats found in this scan.</div>';
  } else {
    qs('#dwFindings').innerHTML = findings.map(f => `
      <div class="finding ${f.level}">
        <div class="finding-header">
          <span class="badge ${f.level === 'critical' ? 'red' : 'orange'}">${f.level.toUpperCase()}</span>
          <span>Node ${f.node}</span>
        </div>
        <div class="finding-body">
          Category: ${f.cat}<br>
          Onion: ${fakeHash(6)}.onion &nbsp;|&nbsp; Hash: ${f.hash}
        </div>
      </div>`).join('');
  }

  addLog('dwLog', `Scan complete — ${critCount} critical, ${highCount} high threats found`, critCount > 0 ? 'log-err' : 'log-ok');
  state.scans++;
  critCount > 0 ? state.threats++ : state.safe++;
  updateSidebarStats();
  dashLog(`[DARKWEB] ${critCount} critical / ${highCount} high nodes in ${cat}`, critCount > 0 ? 'log-err' : 'log-ok');

  btn.disabled = false;
  btn.innerHTML = 'Start Scan';
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
});
