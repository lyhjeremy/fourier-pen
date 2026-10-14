// Vercel function: a short text prompt in, a line-art PNG out, through Google's Gemini
// image model. The API key never reaches the browser. Nothing about the prompt is stored.

const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-nano-banana-2.1';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 10;
const hits = new Map(); // per warm instance; the Vercel firewall rule is the real limit

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(extra || {}) },
  });
}

function findImage(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (node.type === 'image' && typeof node.data === 'string') {
    return { mime: node.mime_type || node.mimeType || 'image/png', data: node.data };
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
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: 'unavailable', reason: 'not_configured' }, 503);

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
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        input: [{ type: 'text', text: instruction }],
        response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '1:1' },
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    console.error('gemini fetch failed', e && e.name);
    return json({ error: 'unavailable' }, 502);
  }
  clearTimeout(timer);

  if (res.status === 429) return json({ error: 'rate_limited' }, 429, { 'retry-after': '60' });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('gemini status', res.status, txt.slice(0, 300));
    const blocked = /safety|blocked|prohibited|harm/i.test(txt);
    return json({ error: blocked ? 'blocked' : 'unavailable' }, blocked ? 422 : 502);
  }
  const data = await res.json().catch(() => null);
  const img = findImage(data);
  if (!img) {
    console.error('gemini returned no image', JSON.stringify(data || {}).slice(0, 300));
    return json({ error: 'blocked' }, 422);
  }
  return json({ image: `data:${img.mime};base64,${img.data}` }, 200);
}
