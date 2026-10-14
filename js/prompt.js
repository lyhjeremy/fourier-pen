// Text prompt to picture, through this site's own serverless function.

export const PROMPT_MESSAGES = {
  rate_limited: 'Too many prompts right now. Try again in a minute.',
  blocked: 'The image model would not draw that. Try a different prompt.',
  unavailable: 'The drawing service is unavailable. You can still upload a picture.',
  not_configured: 'Text prompts are not set up on this deployment. You can still upload a picture.',
};

export const PROMPT_MIN = 3, PROMPT_MAX = 200;

export async function generateFromPrompt(text, signal) {
  let r;
  try {
    r = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: text }),
      signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
  }
  let data = null;
  try { data = await r.json(); } catch (e) { data = null; }
  if (!r.ok || !data || !data.image) {
    let code = (data && data.error) || 'unavailable';
    if (code === 'unavailable' && data && data.reason === 'not_configured') code = 'not_configured';
    if (!PROMPT_MESSAGES[code]) code = r.status === 429 ? 'rate_limited' : r.status === 422 ? 'blocked' : 'unavailable';
    throw Object.assign(new Error(code), { code });
  }
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(Object.assign(new Error('unavailable'), { code: 'unavailable' }));
    img.src = data.image;
  });
  return img;
}
