// Vercel function: a short text prompt in, a line-art picture out. Two providers:
//   cloudflare (default when CF_ACCOUNT_ID and CF_API_TOKEN are set): Workers AI, FLUX.1 schnell,
//     free allowance of 10,000 neurons a day on the free plan, fails rather than bills past it.
//   gemini (GEMINI_API_KEY): Google's Interactions endpoint, paid tier only.
// Keys never reach the browser. Nothing about the prompt is stored.

const CF_MODEL = process.env.CF_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-nano-banana-2.1';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 10;
const hits = new Map(); // per warm instance; the Vercel firewall rule is the real limit

function provider() {
  const p = (process.env.IMAGE_PROVIDER || '').toLowerCase();
  if (p === 'cloudflare' || p === 'gemini') return p;
  if (process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN) return 'cloudflare';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return null;
}

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(extra || {}) },
  });
}

function findImage(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (node.type === 'image' && typeof node.data === 'string') {
    return { mime: node.mime_type || node.mimeType || 'image/jpeg', data: node.data };
  }
  if (node.inlineData && typeof node.inlineData.data === 'string') {
    return { mime: node.inlineData.mimeType || 'image/png', data: node.inlineData.data };
  }
  if (node.output_image && typeof node.output_image.data === 'string') {
    return { mime: node.output_image.mime_type || 'image/png', data: node.output_image.data };
  }
  for (const k of Object.keys(node)) {
    const r = findImage(node[k], depth + 1);
    if (r) return r;
  }
  return null;
}

export async function GET() {
  return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
}

export async function POST(request) {
  if (process.env.PROMPTS_ENABLED === 'false') return json({ error: 'unavailable', reason: 'disabled' }, 503);
  const which = provider();
  if (!which) return json({ error: 'unavailable', reason: 'not_configured' }, 503);

  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === host; } catch (e) { ok = false; }
    if (!ok) return json({ error: 'forbidden' }, 403);
  }
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 2048) return json({ error: 'bad_request' }, 413);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad_request' }, 400); }
  const prompt = body && typeof body.prompt === 'string' ? body.prompt.trim().replace(/\s+/g, ' ') : '';
  if (prompt.length < 3 || prompt.length > 200) return json({ error: 'bad_request' }, 400);

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((ts) => now - ts < WINDOW_MS);
  if (recent.length >= LIMIT) return json({ error: 'rate_limited' }, 429, { 'retry-after': '60' });
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();

  const instruction =
    `A clean single-line drawing of ${prompt}. Black ink on a plain white background. ` +
    'Continuous outlines only, no shading, no hatching, no text, no frame, centred and filling most of the image.';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 50000);
  let out;
  try {
    out = which === 'cloudflare' ? await viaCloudflare(instruction, ctrl.signal) : await viaGemini(instruction, ctrl.signal);
  } catch (e) {
    clearTimeout(timer);
    console.error(which, 'fetch failed', e && e.name);
    return json({ error: 'unavailable' }, 502);
  }
  clearTimeout(timer);
  if (out.error) return json({ error: out.error, ...(out.reason ? { reason: out.reason } : {}) }, out.status, out.headers);
  const img = out.image;
  return json({ image: `data:${img.mime};base64,${img.data}` }, 200);
}

// Cloudflare Workers AI. The REST API wraps the model output as { result: { image }, success }.
async function viaCloudflare(instruction, signal) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CF_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: instruction, steps: 4 }),
    signal,
  });
  if (res.status === 429) return { error: 'rate_limited', status: 429, headers: { 'retry-after': '60' } };
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('cloudflare status', res.status, txt.slice(0, 300));
    if (/quota|neuron|limit/i.test(txt)) return { error: 'unavailable', reason: 'quota', status: 503 };
    if (/nsfw|safety|prohibited|flagged/i.test(txt)) return { error: 'blocked', status: 422 };
    return { error: 'unavailable', status: 502 };
  }
  if (ct.startsWith('image/')) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { image: { mime: ct.split(';')[0], data: buf.toString('base64') } };
  }
  const data = await res.json().catch(() => null);
  const b64 = data && ((data.result && data.result.image) || data.image);
  if (typeof b64 !== 'string' || !b64) {
    console.error('cloudflare returned no image', JSON.stringify(data || {}).slice(0, 300));
    return { error: 'blocked', status: 422 };
  }
  return { image: { mime: 'image/jpeg', data: b64 } };
}

// Google Gemini, Interactions endpoint. Only image/jpeg is accepted for the response (checked 2026-10-14).
async function viaGemini(instruction, signal) {
  const res = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input: [{ type: 'text', text: instruction }],
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '1:1' },
    }),
    signal,
  });
  if (res.status === 429) {
    // Google's own 429 covers two cases: a burst (retry later) and a tier with no image quota at all.
    const txt = await res.text().catch(() => '');
    if (/limit:\s*0\b|free tier|upgrade your tier/i.test(txt)) {
      console.error('gemini quota: the key has no image-generation quota', txt.slice(0, 200));
      return { error: 'unavailable', reason: 'quota', status: 503 };
    }
    return { error: 'rate_limited', status: 429, headers: { 'retry-after': '60' } };
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('gemini status', res.status, txt.slice(0, 300));
    const blocked = /safety|blocked|prohibited|harm/i.test(txt);
    return { error: blocked ? 'blocked' : 'unavailable', status: blocked ? 422 : 502 };
  }
  const data = await res.json().catch(() => null);
  const img = findImage(data);
  if (!img) {
    console.error('gemini returned no image', JSON.stringify(data || {}).slice(0, 300));
    return { error: 'blocked', status: 422 };
  }
  return { image: img };
}
