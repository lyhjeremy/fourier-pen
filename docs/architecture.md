# Fourier Pen: architecture

Last updated 2026-10-14, after the build. Where this file and the code disagree, the code shipped and this file is wrong; fix it.

## 1. Shape of the thing

A static site with one serverless function.

```
browser                                     Vercel
┌──────────────────────────────┐            ┌─────────────────────┐
│ index.html + styles.css      │  POST      │ api/generate.js     │   HTTPS   ┌──────────────┐
│ js/main.js                   │ ─────────▶ │ validate, rate-limit│ ────────▶ │ Gemini image │
│   edges → path → fourier     │ ◀───────── │ wrap prompt, call   │ ◀──────── │ API          │
│   render, exports, ui        │  PNG b64   │ Gemini, return PNG  │           └──────────────┘
└──────────────────────────────┘            └─────────────────────┘
```

Everything else, including every export, runs in the browser. The function exists only so the API key is never in the page.

## 2. Files

```
index.html
styles.css
js/
  main.js      app state, event wiring, pipeline orchestration
  edges.js     toGray, blur, canny, trace, smoothSeg
  path.js      orderSegs, bridgeStrokes, continuousTour, buildPath
  fourier.js   dft, rebuildCurve, energy
  render.js    the animation: draw(), frame loop, camera, readout
  exports.js   fitCurve, renderPNG, renderSVG, renderCSV, recordVideo, download
  prompt.js    generateFromPrompt(text) -> HTMLImageElement
  samples.js   sampleCanvas(kind)
  ui.js        element lookup, slider labels, mode sync, status messages
api/
  generate.js
tests/
  edges.test.js
  path.test.js
  fourier.test.js
  exports.test.js   (SVG string shape and CSV row count only)
docs/
prototype/
test-images/        gitignored
.env.example
.gitignore
LICENSE
vercel.json         only if needed for function limits; start without it
```

`package.json` exists only to hold `"type": "module"` and the `test` script. It has no dependencies. `samples/einstein.jpg` is the one shipped picture (public domain). `fonts/` holds the five self-hosted faces. `prototype/` and `test-images/` are gitignored.

## 3. Module contracts

The three pure modules have no DOM access and no module-level state. They take and return typed arrays or plain objects so they run under Node for tests.

### edges.js
```
toGray(source: CanvasImageSource) -> { g: Float32Array, W, H, canvas }   // browser only, uses a canvas
grayFromRGBA(data: Uint8ClampedArray, W, H) -> Float32Array                 // pure, used by toGray and tests
blur(g, W, H, sigma) -> Float32Array
canny(g, W, H, sigma, keep) -> Uint8Array
trace(edges, W, H, minLen) -> { segs: number[][][], edgeCount }
smoothSeg(points) -> points
```
`toGray` is the one function here that touches a canvas. It is split so the rest can be tested with a synthetic grayscale array.

### path.js
```
orderSegs(segs) -> segs
bridgeStrokes(segs) -> Bridge[]              // { d, a, ia, b, ib }
continuousTour(segs, bridges) -> { px: number[], py: number[] }
buildPath(segs, N, mode) -> { re: Float64Array, im: Float64Array, jump: Uint8Array, strokes, links, linkLen } | null
```

### fourier.js
```
dft(re, im) -> Coef[]                        // { f, A, B, amp }, sorted by amp desc
rebuildCurve(coeffs, K, N) -> { X: Float32Array, Y: Float32Array }
cumulativeEnergy(coeffs) -> Float64Array
chainAt(coeffs, K, t, outX, outY)            // arrow chain positions at time t, writes into preallocated arrays
```
`rebuildCurve` and `chainAt` move out of the prototype's closure so render and video export share them.

### render.js
Owns the stage canvas, the camera, and the frame loop. Exposes:
```
createRenderer(canvas, opts) -> { setModel(model, curve), setK, setT, play, pause, restart, setFollow, drawFrame(t, target?) }
```
`drawFrame` can draw into any 2d context at any size. The video exporter calls it on an offscreen canvas with the export colours.

### exports.js
```
fitCurve(curve, width, height, marginFrac) -> { S, ox, oy }
renderPNG(curve, jump, opts) -> HTMLCanvasElement
renderSVG(curve, jump, opts) -> string
renderCSV(coeffs, K) -> string
recordVideo(model, curve, opts, onProgress, signal) -> Promise<Blob>
download(filename, blobOrString, mime)
```
`opts` is `{ width, height, lineWidth, lineColor, bgColor | 'transparent', margin, showJumps }`.

`download` creates an object URL, clicks a temporary anchor, and revokes the URL. This replaces the prototype's claude.ai-only `downloads.save`.

### prompt.js
```
generateFromPrompt(text, signal) -> Promise<HTMLImageElement>
```
POSTs `{ prompt }` as JSON to `/api/generate`, expects `{ image: "data:image/png;base64,..." }` or `{ error: code }`, and maps codes to the messages in the spec.

### main.js
Holds the app state:
```
{
  source,        // CanvasImageSource currently loaded
  model,         // { N, coeffs, cumE, jump, strokes, links, linkLen }
  curve,         // { X, Y } for the current K
  K,
  settings,      // read from ui on each run
  exportOpts,    // read from the export group
}
```
`run()` does: toGray → canny → trace → buildPath → dft → applyArrows. `applyArrows()` does: compute K → rebuildCurve → update numbers → update export preview → hand the curve to the renderer.

## 4. Data flow for a text prompt

1. User submits. `prompt.js` sends `POST /api/generate` with `{ prompt }`.
2. `api/generate.js`:
   - Rejects non-POST, bodies over 2 KB, prompts outside 3 to 200 chars (400).
   - Rate limits (see 5).
   - Builds the model prompt: "A clean single-line drawing of {prompt}. Black ink on a plain white background. Continuous outlines only, no shading, no hatching, no text, no frame, centred, filling most of the image."
   - Calls `POST https://generativelanguage.googleapis.com/v1beta/interactions` with header `x-goog-api-key`, body `{ model, input: [{type:'text', text}], response_format: {type:'image', mime_type:'image/jpeg', aspect_ratio:'1:1'} }` (the endpoint rejects `image/png`, checked 2026-10-14). Default model `gemini-nano-banana-2.1` (the one the official docs use on 2026-10-14); `GEMINI_IMAGE_MODEL` overrides it. `gemini-3.1-flash-image` and `gemini-3-pro-image` are the other current IDs.
   - Finds the first `{type:'image', data}` block anywhere in the response (`findImage`), returns `{ image: dataUrl }` with `Cache-Control: no-store`.
   - Maps failures to `{ error: 'rate_limited' | 'blocked' | 'unavailable' }` with matching status codes 429, 422, 502.
3. The client decodes the data URL into an `Image`, sets it as `source`, and calls `run()`.

The function logs nothing about prompt content beyond length and outcome.

## 5. Abuse and cost control

The endpoint is public and each call costs money. Three layers, cheapest first:

1. **Input limits** in the function: method, body size, prompt length, same-origin `Origin` header check.
2. **Rate limit**: a Vercel WAF rate-limit rule on `/api/generate` (Hobby plans allow it), added in the dashboard. The function also keeps a per-instance map of 10 prompts per 10 minutes per IP, which catches bursts on a warm instance but is not a real limit on its own.
3. **Budget cap**: a Google Cloud budget alert on the project holding the key, and `PROMPTS_ENABLED=false` as an env-var kill switch the function checks first.

## 6. Environment variables

| Name | Where | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Vercel project settings, `.env.local` | Gemini API key |
| `GEMINI_IMAGE_MODEL` | optional | overrides the default model ID |
| `PROMPTS_ENABLED` | optional, default `true` | kill switch |

`.env.example` lists them with empty values.

## 7. Video export mechanics

- Create an `OffscreenCanvas` (fallback: hidden `canvas`) at the capped export size.
- `canvas.captureStream(fps)` → `MediaRecorder` with `video/webm;codecs=vp9` (or `video/mp4` when supported).
- A `requestAnimationFrame` loop advances t from 0 to 1 over `lapSec` seconds and calls `renderer.drawFrame(t, offscreenCtx)` with export colours and no faint finished layer.
- On the last frame, hold for 500 ms so the finished drawing is visible, then stop. Collect chunks into a Blob and download.
- `AbortSignal` from the Cancel button stops the recorder and discards chunks.

## 8. Testing

`node --test tests/` with no dependencies.

- `edges.test.js`: a synthetic image with one black square on white produces exactly one closed stroke of roughly 4 × side length.
- `path.test.js`: three separate circles plus a line come out as one closed path in continuous mode; bridge count equals strokes − 1; `buildPath` output spans −1 to 1.
- `fourier.test.js`: the DFT of a pure circle has one dominant coefficient at f = 1; `rebuildCurve` with K = N reproduces the input within 1e-9.
- `exports.test.js`: SVG string contains exactly one `<path>` when jumps are hidden; CSV has N + 1 lines.

Manual checks live in `docs/build-plan.md` under each phase.

## 9. Deployment

- Vercel project linked to the GitHub repo. Production branch `main`. Preview deploys on pull requests.
- No build command, output directory is the repo root. Vercel picks up `api/` automatically.
- Node runtime for the function, `maxDuration: 60` in `vercel.json`. No edge runtime: the Gemini call can take 15 s.
- The site also exists as a row in the portfolio (`lyhjeremy.com`, `projects.json`) and the profile README; both link to the Vercel URL rather than GitHub Pages.
