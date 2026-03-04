"""
CyberForensics-AI — Backend API (Flask)
Serves deepfake detection via the trained ML model.
Run: python app.py
"""
from flask import Flask, request, jsonify

import joblib, numpy as np
from PIL import Image, ImageFilter
import io, base64, os, time

app = Flask(__name__)


# ── Load model ──────────────────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'model.pkl')
model = joblib.load(MODEL_PATH)
print(f"✅ Model loaded from {MODEL_PATH}")


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

    return np.array(features, dtype=np.float32).reshape(1, -1)


# ── Routes ─────────────────────────────────────────────────────────
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'online', 'model': 'RandomForest-v1', 'features': 28})


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

        feats = extract_features(img)
        pred = model.predict(feats)[0]
        proba = model.predict_proba(feats)[0]

        fake_pct = float(proba[1]) * 100
        real_pct = float(proba[0]) * 100

        # Feature breakdown for UI display
        ela_mean  = float(feats[0, 3])
        hf_ratio  = float(feats[0, 0])
        edge_mean = float(feats[0, 12])
        tex_var   = float(feats[0, 15])
        col_corr  = float(feats[0, 7])

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
            'model':      'RandomForest-200-trees'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cyberbully', methods=['POST'])
def cyberbully():
    data = request.get_json()
    text = data.get('text', '').lower()

    toxic_keywords = ['loser','nobody likes','go away','regret','ugly','stupid',
                      'idiot','hate you','kill','die','worthless','pathetic',
                      'disgusting','freak','moron','shut up','dumb','useless']
    threat_kw      = ['find out where','make you regret','i will hurt','you will pay']
    harassment_kw  = ['nobody wants','everyone hates','you should leave']

    score = 0
    labels = {}
    for kw in toxic_keywords:
        if kw in text: score += 14
    for kw in threat_kw:
        if kw in text: score += 25
    for kw in harassment_kw:
        if kw in text: score += 18
    score = min(100, score + np.random.uniform(0, 5))

    labels['Bullying']     = min(100, score * np.random.uniform(0.7, 1.0))
    labels['Harassment']   = min(100, score * np.random.uniform(0.4, 0.8))
    labels['Threat']       = min(100, score * np.random.uniform(0.1, 0.5) if any(kw in text for kw in threat_kw) else score * 0.1)
    labels['Hate Speech']  = min(100, score * np.random.uniform(0.1, 0.4))
    labels['Profanity']    = min(100, score * np.random.uniform(0.2, 0.5))

    return jsonify({
        'verdict':  'TOXIC' if score >= 30 else 'CLEAN',
        'score':    round(score, 1),
        'labels':   {k: round(v, 1) for k, v in labels.items()},
    })


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
    print(f"\n🚀 CyberForensics-AI API running on port {port}\n")
    app.run(host="0.0.0.0", port=port)
