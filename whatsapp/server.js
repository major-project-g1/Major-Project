const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
const port = Number(process.env.WHATSAPP_PORT || 10001);
const classifierUrl = process.env.CLASSIFIER_URL || 'http://127.0.0.1:10000/api/cyberbully';
const events = [];
let qrDataUrl = null;
let status = 'starting';
let account = null;
let clientError = null;
let clientReady = false;
let sequence = 0;

app.use(cors());
app.use(express.json({ limit: '64kb' }));

function pushEvent(event) {
  events.push({ ...event, sequence: ++sequence });
  while (events.length > 100) events.shift();
}

async function classify(text) {
  const response = await fetch(classifierUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!response.ok) throw new Error(`Classifier returned HTTP ${response.status}`);
  return response.json();
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.USERPROFILE || ''}\\.cache\\puppeteer\\chrome\\win64-146.0.7680.31\\chrome-win64\\chrome.exe`
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || undefined;
}

const executablePath = findChrome();
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'cyberbullying-monitor' }),
  puppeteer: {
    headless: true,
    executablePath,
    timeout: 120000,
    protocolTimeout: 120000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  }
});

client.on('qr', async qr => {
  try {
    qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 280 });
    status = 'qr';
    clientError = null;
  } catch (error) {
    status = 'error';
    clientError = error.message;
  }
});

client.on('authenticated', () => {
  status = 'authenticating';
  qrDataUrl = null;
});

client.on('ready', () => {
  clientReady = true;
  status = 'connected';
  qrDataUrl = null;
  account = client.info?.wid?.user || null;
  pushEvent({
    id: `system-${Date.now()}`,
    type: 'system',
    text: 'WhatsApp connected. Incoming messages are being analysed in memory.',
    timestamp: new Date().toISOString()
  });
});

client.on('auth_failure', message => {
  clientReady = false;
  status = 'error';
  clientError = `WhatsApp authentication failed: ${message}`;
});

client.on('disconnected', reason => {
  clientReady = false;
  status = 'disconnected';
  account = null;
  pushEvent({
    id: `system-${Date.now()}`,
    type: 'system',
    text: `WhatsApp disconnected: ${reason}`,
    timestamp: new Date().toISOString()
  });
});

client.on('message', async message => {
  if (!clientReady || !message.body) return;
  try {
    const result = await classify(message.body);
    pushEvent({
      id: message.id?._serialized || `message-${Date.now()}`,
      type: 'message',
      from: message.from,
      sender: message._data?.notifyName || message.from,
      text: message.body,
      timestamp: new Date().toISOString(),
      result: {
        verdict: result.verdict,
        score: result.score,
        labels: result.labels,
        analysis: result.analysis,
        highlights: result.highlights,
        model: result.model
      }
    });
  } catch (error) {
    pushEvent({
      id: `error-${Date.now()}`,
      type: 'error',
      text: `Message analysis failed: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/status', (_req, res) => res.json({
  status,
  account,
  qr: qrDataUrl,
  error: clientError
}));

app.get('/api/events', (req, res) => {
  const after = Number(req.query.after || 0);
  res.json({ events: events.filter(event => event.sequence > after) });
});

app.post('/api/logout', async (_req, res) => {
  try {
    await client.logout();
    clientReady = false;
    status = 'logged_out';
    account = null;
    qrDataUrl = null;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`WhatsApp bridge listening at http://localhost:${port}`);
  console.log(`Chromium executable: ${executablePath || 'Puppeteer default'}`);
  client.initialize().catch(error => {
    status = 'error';
    clientError = error.message;
    console.error('WhatsApp initialization failed:', error);
  });
});
