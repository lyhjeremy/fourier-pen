# Fourier Pen: build plan

Ordered phases. Each phase ends with checks that must pass before the next starts. Tick boxes as work lands. Dates get filled in when a phase completes.

All six phases were completed on 2026-10-14. Items that could not be verified without a Gemini key are marked below.

## Phase 0: repo and skeleton

- [x] `git init`, `.gitignore` (`.env*`, `test-images/`, `.vercel/`, `node_modules/`, `.DS_Store`)
- [x] `LICENSE` (MIT), `.env.example`, minimal `package.json` with `"type": "module"` and `"test": "node --test tests/"`
- [x] Empty `index.html`, `styles.css`, `js/` module files with exports stubbed
- [x] Create public GitHub repo `fourier-pen` with `gh`, first commit, push
- [x] Link Vercel project to the repo, confirm an empty deploy succeeds

Checks: `npx serve .` shows a page titled Fourier Pen. Vercel preview URL loads.

## Phase 1: port the prototype into modules

- [x] `edges.js`: toGray split into grayFromRGBA plus the canvas wrapper, blur, canny, trace, smoothSeg
- [x] `path.js`: orderSegs, bridgeStrokes, continuousTour, buildPath
- [x] `fourier.js`: dft, rebuildCurve, cumulativeEnergy, chainAt
- [x] `samples.js`: the four examples
- [x] `render.js`: createRenderer with drawFrame(t, ctx, opts)
- [x] `ui.js`, `main.js`: controls, labels, debounce, state
- [x] `index.html` and `styles.css` from the prototype, with a proper document skeleton, charset, viewport, favicon, title
- [x] Tests for edges, path, fourier as listed in `docs/architecture.md` section 8

Checks: with the "Fourier" sample at default settings, the stats panel (edge pixels, strokes, bridges, points, energy) matches the prototype opened in the same browser to the exact number. Same for π, heart, notes, and the Einstein test photo. `node --test` passes.

## Phase 2: standard downloads

- [x] `exports.js`: download() with an object URL and anchor
- [x] PNG, SVG, CSV buttons work in a plain browser with no claude.ai API
- [x] Remove every reference to `window.claude`

Checks: each button saves a file in Chrome, Safari and Firefox. The SVG opens in a browser and matches the PNG.

## Phase 3: export options

- [x] Export group UI: preset select, custom size fields, line width, colours, transparent background, margin, include jumps
- [x] `fitCurve(width, height, margin)` replaces the square-only export path
- [x] renderPNG and renderSVG take opts
- [x] Live 240 px preview that updates on any option change (debounced 60 ms)
- [x] File names include K and size
- [x] `exports.test.js`

Checks: every preset produces a file of exactly the stated pixel size. Transparent PNG has alpha. A 5K export completes in under 3 s. Preview matches the saved file.

## Phase 4: video export

- [x] recordVideo on an offscreen canvas via drawFrame
- [x] WebM button everywhere, MP4 button when `isTypeSupported('video/mp4')`
- [x] Progress bar and Cancel in the stage
- [x] Size cap at 1920 px long side, aspect from the preset
- [x] Disabled state with reason when MediaRecorder is missing

Checks: an 18 s WebM plays in Chrome and Firefox and shows the full drawing. MP4 from Safari plays in QuickTime. Cancel leaves no file and the live stage never stutters more than one dropped frame per second during recording.

## Phase 5: text prompt

- [x] Confirm current Gemini image model ID and request shape on ai.google.dev; record in decisions if different from the architecture doc
- [x] `api/generate.js`: validation, kill switch, model call, error mapping, no-store header
- [x] Rate limiting: Vercel firewall rule chosen, recorded in decisions. Not yet added in the dashboard (manual step).
- [x] `prompt.js` client, prompt field and Draw it button, wait state, error messages
- [x] Privacy line updated
- [ ] Vercel env var `GEMINI_API_KEY` set (no key available at build time)
- [ ] Google Cloud budget alert on the key's project

Checks (pending a key): "a bicycle" produces a drawing in under 20 s on the preview deploy. An empty prompt and a 201-character prompt are rejected client-side. The 11th prompt in 10 minutes from one IP gets the rate-limited message. Setting `PROMPTS_ENABLED=false` makes the button show the unavailable message.

## Phase 6: polish and ship

- [x] Theme toggle
- [x] Accessibility pass: keyboard through every control, focus rings, aria-pressed, labels, contrast check on both themes
- [x] Phone layout check at 375 px and 430 px wide
- [x] Performance check against the spec targets on a laptop and a phone; decide on keeping N = 4,096
- [x] README final pass with the live URL
- [x] `prototype/` kept locally, gitignored, recorded in decisions
- [x] Tag `v1.0.0`

Checks: Lighthouse accessibility 100, performance over 90 on the production URL. All spec sections 3 to 10 verified by hand.

## After version 1

In rough order of value:

1. Freehand drawing input
2. SVG path input
3. ML line-art for portraits (in-browser model or a second function)
4. Web Worker if phones stall
5. WebCodecs video export for 4K and faster than real time
6. FFT if N goes past 4,096
