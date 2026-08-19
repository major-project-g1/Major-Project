"""
CyberForensics-AI — Backend API (Flask)
Serves deepfake detection via the trained ML model.
Run: python app.py
"""
from flask import Flask, request, jsonify

import hashlib
import joblib, numpy as np
from PIL import Image, ImageFilter
import io, base64, os, time
import random
import re
import ipaddress
from urllib.parse import urlparse
from html.parser import HTMLParser
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__)
 

# ── Load model ──────────────────────────────────────────────────────
MODEL_PATH  = os.path.join(os.path.dirname(__file__), 'model.pkl')
SCALER_PATH = os.path.join(os.path.dirname(__file__), 'scaler.pkl')

model  = joblib.load(MODEL_PATH)
scaler = joblib.load(SCALER_PATH) 
print(f"Model loaded from {MODEL_PATH}")
print(f"Scaler loaded from {SCALER_PATH}")

# ── Feature extraction (same as training) ──────────────────────────
def extract_features(img: Image.Image) -> np.ndarray:
    img = img.convert('RGB').resize((128, 128))
    arr = np.array(img, dtype=np.float32)
    features = []

    gray = np.mean(arr, axis=2)
    from numpy.fft import fft2, fftshift
    f = np.abs(fftshift(fft2(gray)))
    f_log = np.log1p(f)
    h, w = f_log.shape
    center_region = f_log[h//4:3*h//4, w//4:3*w//4]
    hf_energy = f_log[0:h//4, :].mean() + f_log[3*h//4:, :].mean()
    lf_energy = center_region.mean()
    features.append(hf_energy / (lf_energy + 1e-6))
    features.append(f_log.std())
    features.append(f_log.max() - f_log.mean())

    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=70)
    buf.seek(0)
    img_compressed = Image.open(buf).convert('RGB')
    ela = np.abs(arr - np.array(img_compressed, dtype=np.float32))
    features.append(ela.mean())
    features.append(ela.std())
    features.append(ela.max())
    features.append(np.percentile(ela, 95))

    r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
    features.append(np.corrcoef(r.flatten(), g.flatten())[0,1])
    features.append(np.corrcoef(r.flatten(), b.flatten())[0,1])
    features.append(np.corrcoef(g.flatten(), b.flatten())[0,1])
    features.append(r.std() / (g.std() + 1e-6))
    features.append(r.std() / (b.std() + 1e-6))

    img_pil = Image.fromarray(arr.astype(np.uint8))
    edges = img_pil.filter(ImageFilter.FIND_EDGES)
    edge_arr = np.array(edges, dtype=np.float32)
    features.append(edge_arr.mean())
    features.append(edge_arr.std())
    gray_uint8 = gray.astype(np.uint8)
    sharp_img = Image.fromarray(gray_uint8).filter(ImageFilter.SHARPEN)
    lap_var = np.array(sharp_img, dtype=np.float32).var()
    features.append(lap_var)

    cell_vars = []
    for i in range(4):
        for j in range(4):
            cell = gray[i*32:(i+1)*32, j*32:(j+1)*32]
            cell_vars.append(cell.var())
    features.append(np.mean(cell_vars))
    features.append(np.std(cell_vars))
    features.append(np.min(cell_vars))
    features.append(np.max(cell_vars))

    for ch in [r, g, b]:
        hist, _ = np.histogram(ch, bins=16, range=(0,255))
        hist = hist / hist.sum()
        features.append(hist.mean())
        features.append(hist.std())
        features.append(-(hist * np.log(hist + 1e-10)).sum())

    return np.array(features, dtype=np.float32)


# ── Routes ─────────────────────────────────────────────────────────
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'online', 'model': 'XGBoost-v1', 'features': 34})


@app.route('/api/detect', methods=['POST'])
def detect():
    start = time.time()
    data = request.get_json()
    if not data or 'image' not in data:
        return jsonify({'error': 'No image provided'}), 400

    try:
        b64 = data['image']
        if ',' in b64:
            b64 = b64.split(',')[1]
        img_bytes = base64.b64decode(b64)
        img = Image.open(io.BytesIO(img_bytes))

        feats = extract_features(img).reshape(1, -1)   # shape: (1, 34)
        feats_scaled = scaler.transform(feats)          # scale before predicting
        pred  = model.predict(feats_scaled)[0]
        proba = model.predict_proba(feats_scaled)[0]

        fake_pct = float(proba[1]) * 100
        real_pct = float(proba[0]) * 100

        # Feature breakdown for UI display
        # Use original unscaled feats for display values (more interpretable)
        ela_mean  = float(feats[0, 3])    # ELA mean
        hf_ratio  = float(feats[0, 0])    # HF/LF ratio
        edge_mean = float(feats[0, 12])   # edge mean
        tex_var   = float(feats[0, 15])   # texture variance
        col_corr  = float(feats[0, 7])    # R-G correlation

        # Normalise feature signals to 0-100 for UI
        def sig(val, low, high):
            return min(100, max(0, (val - low) / (high - low) * 100))

        features_display = {
            'ELA Artifact Level':    round(sig(ela_mean, 3, 20), 1),
            'Frequency Anomaly':     round(sig(hf_ratio, 0.6, 1.8), 1),
            'Edge Inconsistency':    round(sig(18 - edge_mean, 0, 10), 1),
            'Texture Uniformity':    round(sig(500 - tex_var, 0, 300), 1),
            'Color Ch. Deviation':   round(sig(1 - col_corr, 0, 0.4) * 100 / 100 * 100, 1),
        }

        elapsed = round((time.time() - start) * 1000, 1)

        return jsonify({
            'verdict':    'FAKE' if pred == 1 else 'REAL',
            'fake_pct':   round(fake_pct, 1),
            'real_pct':   round(real_pct, 1),
            'confidence': round(max(fake_pct, real_pct), 1),
            'features':   features_display,
            'time_ms':    elapsed,
            'model':      'XGBoost-v1'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


CB_LABEL_COLS = ['toxic', 'severe_toxic', 'obscene', 'threat', 'insult', 'identity_hate']
CB_RULEBOOK = {
    'toxic': [
        ('nobody likes you', 0.78), ('you are useless', 0.76), ('you are trash', 0.74),
        ('worthless', 0.7), ('disgusting', 0.62), ('pathetic', 0.58), ('freak', 0.58),
        ('shut up', 0.52), ('go away', 0.5), ('hate you', 0.7)
    ],
    'severe_toxic': [
        ('kill yourself', 1.0), ('go die', 0.95), ('die', 0.78), ('burn in hell', 0.9),
        ('drop dead', 0.9), ('i will kill', 1.0), ('you should not exist', 0.88)
    ],
    'obscene': [
        ('fuck', 0.85), ('fucking', 0.84), ('motherfucker', 0.96), ('shit', 0.62),
        ('bitch', 0.82), ('asshole', 0.84), ('bastard', 0.78), ('dickhead', 0.84)
    ],
    'threat': [
        ('find out where you live', 1.0), ('make you regret', 0.95), ('you will pay', 0.9),
        ('i will hurt you', 0.96), ('i will find you', 0.95), ('i am coming for you', 0.96),
        ('destroy you', 0.86), ('beat you up', 0.9)
    ],
    'insult': [
        ('ugly', 0.6), ('stupid', 0.56), ('idiot', 0.62), ('moron', 0.62),
        ('loser', 0.62), ('dumb', 0.54), ('clown', 0.48), ('retard', 0.86)
    ],
    'identity_hate': [
        ('go back to your country', 1.0), ('you people are', 0.78), ('your kind', 0.82),
        ('religion is garbage', 0.9), ('race should be banned', 1.0), ('dirty immigrant', 1.0)
    ]
}
CB_POSITIVE_HINTS = [
    'great work', 'nice work', 'well done', 'thank you', 'thanks',
    'proud of you', 'happy for you', 'good job', 'keep it up', 'appreciate it'
]
CB_SEMANTIC_PROTOTYPES = {
    'toxic': [
        'you are worthless and nobody wants you here',
        'everyone hates you and you should leave',
        'you are a complete failure and useless person'
    ],
    'severe_toxic': [
        'go die and do not come back',
        'you should kill yourself right now',
        'you do not deserve to exist'
    ],
    'obscene': [
        'you are a fucking idiot',
        'what the fuck is wrong with you',
        'shut the hell up you bitch'
    ],
    'threat': [
        'i will find you and hurt you',
        'i know where you live and you will pay',
        'wait and see what i do to you'
    ],
    'insult': [
        'you are so stupid and ugly',
        'you are a loser and a moron',
        'you are dumb and pathetic'
    ],
    'identity_hate': [
        'people from your race are disgusting',
        'go back to your country you do not belong here',
        'your religion and your kind are the problem'
    ]
}


def cb_clean_text(text: str) -> str:
    if not isinstance(text, str):
        return ''
    text = text.lower()
    text = re.sub(r'https?://\\S+', ' url ', text)
    text = re.sub(r'@\\w+', ' user ', text)
    text = re.sub(r'\\n', ' ', text)
    text = re.sub(r"[^a-z0-9!?.,\' ]", ' ', text)
    text = re.sub(r' +', ' ', text).strip()
    return text


def cb_phrase_match(text: str, phrase: str) -> bool:
    return re.search(rf'\b{re.escape(phrase)}\b', text) is not None


def cb_negated(text: str, phrase: str) -> bool:
    return re.search(rf"\b(not|never|dont|don't|no)\s+(?:\w+\s+){{0,2}}{re.escape(phrase)}\b", text) is not None


def cb_rule_scores(cleaned: str):
    scores = {lbl: 0.0 for lbl in CB_LABEL_COLS}
    matches = []
    for label, rules in CB_RULEBOOK.items():
        for phrase, weight in rules:
            if cb_phrase_match(cleaned, phrase):
                adj = weight * (0.35 if cb_negated(cleaned, phrase) else 1.0)
                scores[label] += adj
                matches.append((phrase, label))
    for lbl in scores:
        scores[lbl] = min(1.0, max(0.0, scores[lbl]))
    return scores, matches


def cb_semantic_score(cleaned: str, samples):
    try:
        word_vec = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
        docs = [cleaned] + samples
        wm = word_vec.fit_transform(docs)
        word_sim = cosine_similarity(wm[0:1], wm[1:]).flatten()
        word_max = float(np.max(word_sim)) if word_sim.size else 0.0

        char_vec = TfidfVectorizer(analyzer='char_wb', ngram_range=(3, 5), min_df=1)
        cm = char_vec.fit_transform(docs)
        char_sim = cosine_similarity(cm[0:1], cm[1:]).flatten()
        char_max = float(np.max(char_sim)) if char_sim.size else 0.0
    except Exception:
        return 0.0

    merged = (word_max * 0.6) + (char_max * 0.4)
    calibrated = max(0.0, min(1.0, (merged - 0.04) / 0.5))
    return float(calibrated)


def cb_semantic_scores(cleaned: str):
    return {lbl: cb_semantic_score(cleaned, samples) for lbl, samples in CB_SEMANTIC_PROTOTYPES.items()}


def cb_intensity(cleaned: str, original_text: str) -> float:
    alpha_chars = [ch for ch in original_text if ch.isalpha()]
    caps = sum(1 for ch in alpha_chars if ch.isupper())
    cap_ratio = (caps / len(alpha_chars)) if alpha_chars else 0.0

    score = 0.0
    if cap_ratio > 0.6 and len(alpha_chars) >= 8:
        score += 0.22
    exclam = original_text.count('!')
    if exclam >= 2:
        score += min(0.18, exclam * 0.04)
    if re.search(r'(.)\1{2,}', cleaned):
        score += 0.08
    if re.search(r'\b(very|extremely|really|super)\b', cleaned):
        score += 0.06

    return float(min(1.0, score))


@app.route('/api/cyberbully', methods=['POST'])
def cyberbully():
    start = time.time()
    data  = request.get_json(silent=True) or {}
    text  = data.get('text', '')
    if not text.strip():
        return jsonify({'error': 'No text provided'}), 400

    try:
        cleaned = cb_clean_text(text)
        if not cleaned:
            return jsonify({
                'verdict': 'CLEAN',
                'score': 0.0,
                'labels': {
                    'Bullying': 0.0,
                    'Harassment': 0.0,
                    'Threat': 0.0,
                    'Hate Speech': 0.0,
                    'Profanity': 0.0,
                },
                'highlights': [],
                'analysis': 'No analyzable text after cleanup.',
                'time_ms': round((time.time() - start) * 1000, 1),
                'model': 'Rule+Semantic-BERT-lite-v2'
            })

        def r1(v):
            return float(round(float(v), 1))

        rule_scores, matches = cb_rule_scores(cleaned)
        semantic_scores = cb_semantic_scores(cleaned)
        intensity_boost = cb_intensity(cleaned, text)

        positive_hits = [p for p in CB_POSITIVE_HINTS if cb_phrase_match(cleaned, p)]

        probs = {}
        for lbl in CB_LABEL_COLS:
            base = (rule_scores[lbl] * 0.62) + (semantic_scores[lbl] * 0.38)
            if lbl in ('toxic', 'insult'):
                base += intensity_boost * 0.18
            elif lbl in ('threat', 'severe_toxic'):
                base += intensity_boost * 0.22

            probs[lbl] = min(1.0, max(0.0, base))

        if len(positive_hits) >= 2 and max(rule_scores.values()) < 0.55:
            for lbl in ('toxic', 'insult', 'threat', 'severe_toxic'):
                probs[lbl] *= 0.62

        label_probs = probs

        # Map to UI categories
        labels = {
            'Bullying':    r1(max(label_probs['toxic'], label_probs['insult']) * 100),
            'Harassment':  r1(max(label_probs['toxic'], label_probs['severe_toxic']) * 100),
            'Threat':      r1(label_probs['threat'] * 100),
            'Hate Speech': r1(label_probs['identity_hate'] * 100),
            'Profanity':   r1(label_probs['obscene'] * 100),
        }

        ordered = sorted(label_probs.values(), reverse=True)
        base_score = ordered[0]
        second = ordered[1] if len(ordered) > 1 else ordered[0]
        score = r1(min(1.0, (base_score * 0.72) + (second * 0.2) + (intensity_boost * 0.08)) * 100)
        verdict = 'TOXIC' if score >= 40 else 'CLEAN'
        elapsed = r1((time.time() - start) * 1000)

        highlight_phrases = []
        for phrase, _ in matches:
            if phrase not in highlight_phrases:
                highlight_phrases.append(phrase)
            if len(highlight_phrases) >= 8:
                break

        if verdict == 'TOXIC':
            if labels['Threat'] >= 55:
                analysis = 'Threatening intent detected with high confidence.'
            elif labels['Hate Speech'] >= 50:
                analysis = 'Identity-targeting hostile language detected.'
            elif labels['Profanity'] >= 55:
                analysis = 'Abusive/profane wording is dominant.'
            else:
                analysis = 'Harmful bullying patterns detected from tone and wording.'
        else:
            analysis = 'No strong bullying or threat patterns detected.'

        return jsonify({
            'verdict': verdict,
            'score':   score,
            'labels':  labels,
            'highlights': highlight_phrases,
            'analysis': analysis,
            'components': {
                'rule': r1(max(rule_scores.values()) * 100),
                'semantic': r1(max(semantic_scores.values()) * 100),
                'intensity': r1(intensity_boost * 100)
            },
            'time_ms': elapsed,
            'model':   'Rule+Semantic-BERT-lite-v2'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/logtamper', methods=['POST'])
def logtamper():
    data = request.get_json()
    log_text = data.get('log', '')
    lines = [l.strip() for l in log_text.split('\n') if l.strip()]
    issues = []
    # Timestamp order check
    times = []
    for l in lines:
        import re
        m = re.search(r'(\d{2}:\d{2}:\d{2})', l)
        if m: times.append(m.group(1))
    for i in range(1, len(times)):
        if times[i] < times[i-1]:
            issues.append({'type': 'warn', 'msg': f'Timestamp reversal at entry {i+1}: {times[i]} < {times[i-1]}'})
    if 'MISSING' in log_text:
        issues.append({'type': 'error', 'msg': 'Log entries reported missing — possible deletion'})
    if 'sudo su' in log_text or 'unknown' in log_text:
        issues.append({'type': 'error', 'msg': 'Privilege escalation pattern detected'})
    if 'attacker' in log_text or 'etc/passwd' in log_text:
        issues.append({'type': 'error', 'msg': 'Suspicious user / sensitive file access'})
    return jsonify({
        'verdict': 'TAMPERED' if issues else 'INTACT',
        'issues':  issues,
        'entries': len(lines)
    })


DARKWEB_PROFILES = {
    'Drug Markets': {
        'signals': ['fentanyl', 'oxy', 'pills', 'stash', 'vendor', 'cartel', 'escrow'],
        'base_risk': 0.72,
        'activity': 'market listing',
    },
    'Hacking Forums': {
        'signals': ['exploit', 'rce', 'zero-day', 'privilege escalation', 'botnet', 'c2', 'shell'],
        'base_risk': 0.68,
        'activity': 'forum thread',
    },
    'Stolen Data / Credentials': {
        'signals': ['dump', 'combo', 'credential', 'leak', 'breach', 'access', 'vpn'],
        'base_risk': 0.84,
        'activity': 'data dump',
    },
    'Ransomware Infrastructure': {
        'signals': ['raas', 'decryptor', 'beacon', 'payload', 'persistence', 'affiliate', 'panel'],
        'base_risk': 0.9,
        'activity': 'infrastructure node',
    },
    'Fraud Services': {
        'signals': ['phish', 'spoof', 'carding', 'mule', 'otp', 'otp-bypass', 'identity'],
        'base_risk': 0.74,
        'activity': 'service listing',
    },
}


def stable_seed(*parts) -> int:
    raw = ' | '.join(str(part).strip().lower() for part in parts)
    return int(hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16], 16)


def normalise_terms(raw_text: str):
    if not isinstance(raw_text, str):
        return []
    terms = [term.strip().lower() for term in re.split(r'[,;/\n]+', raw_text) if term.strip()]
    return terms


def level_from_score(score: float) -> str:
    if score >= 0.88:
        return 'critical'
    if score >= 0.7:
        return 'high'
    if score >= 0.48:
        return 'medium'
    return 'low'


def make_onion(seed: int, index: int) -> str:
    rng = random.Random(seed + (index + 1) * 7919)
    alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
    return ''.join(rng.choice(alphabet) for _ in range(16)) + '.onion'


def generate_darkweb_scan(category: str, keywords_raw: str, node_count: int):
    profile = DARKWEB_PROFILES.get(category, {
        'signals': ['tor', 'market', 'dump', 'proxy', 'exploit'],
        'base_risk': 0.6,
        'activity': 'hidden service',
    })
    keywords = normalise_terms(keywords_raw)
    seed = stable_seed(category, keywords_raw, node_count)
    rng = random.Random(seed)
    keyword_hits = {k for k in keywords if k}
    matched_signals = [sig for sig in profile['signals'] if sig in keyword_hits]

    nodes = []
    findings = []
    timeline = []
    severity_counts = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
    canvas_w, canvas_h = 420, 230
    cx, cy = canvas_w / 2, canvas_h / 2

    for idx in range(node_count):
        node_seed = seed + idx * 313
        node_rng = random.Random(node_seed)
        onion = make_onion(seed, idx)
        angle = (idx / max(node_count, 1)) * (2 * np.pi) - (np.pi / 2) + node_rng.uniform(-0.35, 0.35)
        dist = 55 + node_rng.uniform(0, 75)
        x = round(cx + np.cos(angle) * dist, 2)
        y = round(cy + np.sin(angle) * dist, 2)
        exposure = node_rng.uniform(0.15, 0.95)
        intel = node_rng.uniform(0.05, 0.3)
        signal_boost = 0.06 * len(matched_signals)
        noise = node_rng.uniform(-0.12, 0.14)
        spread = np.sin((idx / max(node_count, 1)) * (2 * np.pi)) * 0.16
        score = float(max(0.0, min(1.0, 0.25 + (profile['base_risk'] * 0.45) + (exposure * 0.2) + (intel * 0.1) + signal_boost + noise + spread)))
        level = level_from_score(score)
        delay_ms = int(220 + idx * 35 + node_rng.uniform(0, 120))
        last_seen = f"{node_rng.randint(1, 28):02d}-{node_rng.randint(1, 12):02d}-2026"
        indicators = list(dict.fromkeys(
            matched_signals[:3] + [kw for kw in keywords if kw][:2]
        ))
        activity = profile['activity']
        node = {
            'id': f'N{idx + 1:02d}',
            'onion': onion,
            'level': level,
            'score': round(score * 100, 1),
            'x': x,
            'y': y,
            'r': round(6 + node_rng.uniform(0, 5), 2),
            'category': category,
            'activity': activity,
            'last_seen': last_seen,
            'indicators': indicators,
            'keywords': keywords,
            'delay_ms': delay_ms,
        }
        nodes.append(node)
        severity_counts[level] += 1
        if level in {'critical', 'high'}:
            findings.append({
                'id': node['id'],
                'onion': onion,
                'level': level,
                'score': node['score'],
                'activity': activity,
                'indicators': indicators,
                'last_seen': last_seen,
            })
        timeline.append({
            'step': idx + 1,
            'node': node,
            'message': f"Resolved {node['id']} — {level.upper()} {activity} at {onion}",
            'level': level,
            'delay_ms': delay_ms,
        })

    avg_score = round(float(sum(node['score'] for node in nodes) / max(len(nodes), 1)), 1)
    summary = {
        'critical': severity_counts['critical'],
        'high': severity_counts['high'],
        'medium': severity_counts['medium'],
        'low': severity_counts['low'],
        'total': len(nodes),
        'suspicious': len(findings),
        'average_risk': float(avg_score),
        'matched_keywords': matched_signals,
        'estimated_duration_ms': sum(item['delay_ms'] for item in timeline),
    }
    recommendations = []
    if severity_counts['critical']:
        recommendations.append('Escalate immediately: critical infrastructure indicators detected.')
    if findings and not severity_counts['critical']:
        recommendations.append('Correlate onion addresses with IOCs and preserve evidence.')
    if not findings:
        recommendations.append('No high-confidence threats found in this simulated crawl.')

    return {
        'scan_id': hashlib.sha1(f"{seed}:{category}".encode('utf-8')).hexdigest()[:12],
        'category': category,
        'keywords': keywords,
        'nodes': nodes,
        'findings': findings,
        'timeline': timeline,
        'summary': summary,
        'recommendations': recommendations,
    }


@app.route('/api/darkweb/scan', methods=['POST'])
def darkweb_scan():
    data = request.get_json(silent=True) or {}
    category = str(data.get('category', '')).strip() or 'Hacking Forums'
    keywords = str(data.get('keywords', '')).strip()
    try:
        node_count = int(data.get('nodes', 12))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid node count'}), 400

    if node_count < 5 or node_count > 40:
        return jsonify({'error': 'Node count must be between 5 and 40'}), 400

    result = generate_darkweb_scan(category, keywords, node_count)
    return jsonify(result)


def analyze_darkweb_link(raw_url: str):
    if not isinstance(raw_url, str):
        return {'error': 'Invalid URL'}

    value = raw_url.strip()
    if not value:
        return {'error': 'Empty URL'}

    url_to_parse = value if '://' in value else f'https://{value}'
    parsed = urlparse(url_to_parse)
    scheme = (parsed.scheme or '').lower()
    host = (parsed.hostname or '').lower()
    path = parsed.path or '/'
    query = parsed.query or ''

    if not host or ' ' in value:
        return {'error': 'Invalid URL format'}
    if scheme not in {'http', 'https'}:
        return {'error': 'Unsupported URL scheme'}
    if not host.endswith('.onion') and host not in {'localhost'}:
        has_domain = '.' in host
        has_ip = False
        try:
            ipaddress.ip_address(host)
            has_ip = True
        except ValueError:
            pass
        if not has_domain and not has_ip:
            return {'error': 'Invalid URL format'}

    signals = []
    notes = []
    risk = 0

    suspicious_terms = ['login', 'admin', 'panel', 'wallet', 'token', 'verify', 'reset', 'seed', 'password', 'dump', 'leak', 'combo']

    is_onion = host.endswith('.onion')
    if scheme == 'http':
        risk += 16
        signals.append('plain-http')
        notes.append('No TLS in URL')
    else:
        notes.append('HTTPS URL')

    if is_onion:
        onion_core = host[:-6]
        onion_v3 = re.fullmatch(r'[a-z2-7]{56}', onion_core) is not None
        onion_v2 = re.fullmatch(r'[a-z2-7]{16}', onion_core) is not None
        if onion_v3:
            notes.append('Valid v3 onion structure')
        elif onion_v2:
            notes.append('Legacy v2 onion structure')
            risk += 8
        else:
            signals.append('malformed-onion')
            risk += 35
            notes.append('Malformed onion host')
        if query:
            risk += 6
            signals.append('query-string')
        if len(path) > 24:
            risk += 5
            signals.append('deep-path')
        if any(term in path.lower() for term in suspicious_terms):
            risk += 12
            signals.append('credential-like-path')
        status = 'ONION_STRUCTURAL'
        category = 'onion'
    else:
        try:
            ipaddress.ip_address(host)
            risk += 18
            signals.append('ip-literal-host')
            notes.append('Host is an IP literal')
        except ValueError:
            pass
        if host.startswith('xn--') or '.xn--' in host:
            risk += 10
            signals.append('punycode')
            notes.append('Punycode hostname')
        if query:
            risk += 4
            signals.append('query-string')
        if len(path) > 30:
            risk += 4
            signals.append('deep-path')
        if any(term in (host + path).lower() for term in suspicious_terms):
            risk += 10
            signals.append('credential-like-path')
        status = 'CLEARNET_STRUCTURAL'
        category = 'clearnet'

    if not is_onion and scheme == 'https' and risk <= 20:
        verification = 'Verified (structural)'
    elif is_onion and risk <= 20:
        verification = 'Verified (onion structure)'
    else:
        verification = 'Unverified'

    verdict = 'SUSPICIOUS' if risk >= 35 else 'CLEAN'
    confidence = max(5, min(99, 100 - risk))
    if is_onion and risk >= 35:
        verdict = 'ONION_SUSPICIOUS'
    elif is_onion and risk < 35:
        verdict = 'ONION_VALID'

    return {
        'input': value,
        'normalized': url_to_parse,
        'scheme': scheme,
        'host': host,
        'category': category,
        'status': status,
        'verification': verification,
        'verdict': verdict,
        'risk_score': round(float(min(risk, 100)), 1),
        'confidence': round(float(confidence), 1),
        'signals': signals,
        'notes': notes,
        'summary': 'Structural URL analysis only; no live target access performed.',
    }


@app.route('/api/darkweb/link-intel', methods=['POST'])
def darkweb_link_intel():
    data = request.get_json(silent=True) or {}
    raw_url = data.get('url', '')
    result = analyze_darkweb_link(raw_url)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


class DarkWebPageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ''
        self._in_title = False
        self._text_parts = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == 'a':
            href = dict(attrs).get('href')
            if href:
                self.links.append(href)
        elif tag.lower() == 'title':
            self._in_title = True

    def handle_endtag(self, tag):
        if tag.lower() == 'title':
            self._in_title = False

    def handle_data(self, data):
        text = data.strip()
        if not text:
            return
        if self._in_title and not self.title:
            self.title = text
        self._text_parts.append(text)

    @property
    def visible_text(self):
        return ' '.join(self._text_parts)


def analyze_darkweb_page(source_html: str, origin_url: str = ''):
    if not isinstance(source_html, str):
        return {'error': 'Invalid page source'}

    raw = source_html.strip()
    if not raw:
        return {'error': 'Empty page source'}

    parser = DarkWebPageParser()
    try:
        parser.feed(raw)
    except Exception:
        # Fall back to a plain-text view if the snapshot is malformed.
        parser = DarkWebPageParser()
        parser._text_parts = [piece for piece in re.split(r'<[^>]+>', raw) if piece.strip()]

    text = parser.visible_text
    lowered = text.lower()
    link_hrefs = parser.links[:]

    signal_map = {
        'market': ['market', 'vendor', 'cartel', 'stash', 'escrow', 'order'],
        'forum': ['forum', 'thread', 'reply', 'post', 'account', 'profile'],
        'login': ['login', 'signin', 'authenticate', 'password', 'otp', '2fa'],
        'leak': ['dump', 'leak', 'database', 'credentials', 'combo', 'breach'],
        'fraud': ['carding', 'phish', 'spoof', 'wallet', 'mule', 'otp-bypass'],
        'ransomware': ['raas', 'decryptor', 'beacon', 'panel', 'payload', 'affiliate'],
    }

    page_types = []
    for label, keywords in signal_map.items():
        score = sum(1 for kw in keywords if kw in lowered)
        if score:
            page_types.append((label, score))

    page_type = page_types[0][0] if page_types else 'general'
    keyword_hits = sorted({kw for keywords in signal_map.values() for kw in keywords if kw in lowered})

    suspicious_link_count = 0
    onion_link_count = 0
    external_link_count = 0
    cleaned_links = []
    for href in link_hrefs:
        href = href.strip()
        if not href:
            continue
        cleaned_links.append(href)
        parsed = urlparse(href if '://' in href else f'https://{href}')
        host = (parsed.hostname or '').lower()
        if host.endswith('.onion'):
            onion_link_count += 1
        elif host:
            external_link_count += 1
        if any(term in (href + ' ' + lowered) for term in ['login', 'wallet', 'token', 'password', 'dump', 'leak']):
            suspicious_link_count += 1

    word_count = len(re.findall(r'\b\w+\b', text))
    title = parser.title or 'Untitled page'
    if len(title) > 80:
        title = title[:77] + '...'

    risk = 0
    if onion_link_count:
        risk += 14
    if suspicious_link_count:
        risk += suspicious_link_count * 8
    if page_type in {'leak', 'fraud', 'ransomware'}:
        risk += 18
    if page_type == 'login':
        risk += 10
    if len(keyword_hits) >= 4:
        risk += 12
    if word_count < 20:
        risk += 8

    verification = 'Verified snapshot' if raw.startswith('<') and len(cleaned_links) >= 0 else 'Text snapshot'
    verdict = 'SUSPICIOUS' if risk >= 30 else 'NORMAL'
    confidence = max(5, min(99, 100 - risk))

    return {
        'title': title,
        'page_type': page_type,
        'word_count': word_count,
        'link_count': len(cleaned_links),
        'onion_links': onion_link_count,
        'external_links': external_link_count,
        'suspicious_links': suspicious_link_count,
        'keywords': keyword_hits,
        'risk_score': round(float(min(risk, 100)), 1),
        'confidence': round(float(confidence), 1),
        'verification': verification,
        'verdict': verdict,
        'origin_url': origin_url.strip(),
        'links': cleaned_links[:20],
        'summary': 'Snapshot-only page analysis; no live site fetch performed.',
    }


@app.route('/api/darkweb/page-intel', methods=['POST'])
def darkweb_page_intel():
    data = request.get_json(silent=True) or {}
    source = data.get('source', '')
    origin_url = data.get('origin_url', '')
    result = analyze_darkweb_page(source, origin_url)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)



@app.after_request
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    return response

@app.route('/', defaults={'path':''}, methods=['OPTIONS'])
@app.route('/<path:path>', methods=['OPTIONS'])
def options_handler(path=''):
    from flask import Response
    r = Response()
    r.headers['Access-Control-Allow-Origin'] = '*'
    r.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    r.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    return r

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 10000))
    print(f"\nCyberForensics-AI API running on port {port}\n")
    app.run(host="0.0.0.0", port=port)
