# Fourier Pen: decisions

A log of judgment calls, newest last. Each entry says what was decided, why, and what it rules out. Add an entry when a decision changes rather than editing the old one.

## 2026-10-14: name

**Decided:** The project and site are called "Fourier Pen". The folder is `Project 36 Fourier Pen`, the repo `fourier-pen`.
**Why:** The owner wanted "Fourier" in the name. "Pen" is the thing the arrow chain carries and reads as a product, not a lesson.
**Rules out:** Fourier Sketcher (the prototype name), Epicycle, Spinline, Clockwork Pen, Sum of Circles.

## 2026-10-14: version 1 scope

**Decided:** Version 1 ships everything the prototype does, plus export options with wallpaper presets, text prompt input, and video export. Freehand drawing input is not in version 1.
**Why:** Export options were already the next item. Text prompt was the second half of the original idea. Video is cheap once the renderer can draw into any canvas.
**Rules out:** Freehand input, SVG path input, ML line-art, Web Worker, accounts, sharing.

## 2026-10-14: hosting on Vercel

**Decided:** Vercel, with the one serverless function in `api/`. Public GitHub repo, push to `main` deploys.
**Why:** The text prompt needs a server to hold the API key. Vercel's `api/` folder needs no config. GitHub Pages cannot run a function.
**Rules out:** Netlify, GitHub Pages, local-only.

## 2026-10-14: plain ES modules, no build step

**Decided:** `index.html`, `styles.css`, `js/*.js` as native ES modules. No bundler, no TypeScript, no front-end dependencies. A minimal `package.json` exists only so `node --test` runs.
**Why:** The prototype is 1,000 lines of dependency-free code and the whole point is that the maths is readable. A build step adds nothing the browser does not already do.
**Rules out:** Vite, TypeScript, React. Revisit if the code passes about 5,000 lines or needs a dependency.

## 2026-10-14: Gemini for text prompts

**Decided:** Google's Gemini API image models. Default `gemini-3.1-flash-image`, overridable by env var.
**Why:** Owner's choice. The Imagen 4 IDs were retired in August 2026 so the Gemini-native image models are the current path.
**Rules out:** OpenAI images, Replicate, a stubbed adapter.
**Risk:** Model IDs and request shape must be re-checked against ai.google.dev at build time; the search that informed this was mostly third-party blogs.

## 2026-10-14: keep the prototype's design

**Decided:** Keep the dark plotter screen, amber ink, Spectral and Public Sans, and the right-hand instrument panel. Refine spacing and add the Export group and prompt field in the same language.
**Why:** It already looks like a tool and not a template. A redesign would cost a week for no user benefit.
**Rules out:** New palette, new typography, left panel.

## 2026-10-14: public repo, MIT licence

**Decided:** Public repository under MIT.
**Why:** Portfolio piece; the maths is more useful when people can read it. MIT is the least surprising choice for a small web tool. The owner did not pick a licence explicitly; MIT is an assumption and easy to change before the first push.
**Rules out:** Nothing hard. Change `LICENSE` before publishing if a different licence is wanted.

## 2026-10-14: test photo is not shipped

**Decided:** The Einstein photo stays in `test-images/`, which is gitignored. It is not a built-in example.
**Why:** It is a Getty news photo. We can use it locally to test portraits but cannot redistribute it in a public repo or site.
**Rules out:** Shipping any third-party photo. Built-in examples stay procedural.

## 2026-10-14: prototype folder is read-only

**Decided:** `prototype/fourier-sketcher.html` and `prototype/prototype-notes.md` are kept as the parity reference and are never edited.
**Why:** The port into modules must behave identically on the same inputs. A frozen reference makes "identical" checkable.
**Rules out:** Patching the prototype in place. Delete the folder after version 1 ships if it is no longer useful.

## 2026-10-14: exports render the current K, not full N

**Decided:** PNG, SVG and video all draw the curve for the number of arrows on screen.
**Why:** "What you save is what you see." The arrow slider is the creative control; a blurry 40-arrow face is a valid wallpaper.
**Rules out:** A separate "full detail" export. Users set arrows to the maximum if they want that.

## 2026-10-14: video is real time, capped at 1920 px

**Decided:** Video export records an offscreen canvas in real time with MediaRecorder, duration equals the on-screen lap time, long side capped at 1920 px.
**Why:** MediaRecorder cannot encode faster than real time and there is no ffmpeg in the browser without a 30 MB WASM dependency. 1080p keeps encoding smooth on laptops.
**Rules out:** 4K video, faster-than-real-time export, ffmpeg.wasm. Revisit with WebCodecs if 4K video is ever asked for.

## 2026-10-14: rate limiting needs an external store

**Decided:** Per-IP limits via Upstash Redis free tier, unless the Vercel plan's firewall rate-limit rule is available, in which case use that and skip the dependency. Plus a kill switch env var and a Google Cloud budget alert.
**Why:** The endpoint is public and each call costs money. Serverless instances do not share memory, so in-memory counters do not work.
**Rules out:** Shipping the prompt feature with no limit at all.
**Open:** Confirm which option during phase 5 of the build plan.

## 2026-10-14: no Web Worker in version 1

**Decided:** The pipeline runs on the main thread.
**Why:** It is under a second on a laptop at N = 2,048 and the UI has nothing else to do during that second. A worker adds message passing and copies for a pause most users will not notice.
**Rules out:** Nothing. Add one if the 1 s target in the spec is missed on phones.

## 2026-10-14: the house design standard overrides "keep the prototype's look"

**Decided:** The site follows DESIGN_STANDARDS.md ("Ledger") like every other project under github.com/lyhjeremy: self-hosted Source Serif 4, IBM Plex Sans and Plex Mono; square corners; no shadows, gradients or hover transitions; oxide and pine accents; privacy and terms pages; an `/overview/` writeup built with the shared builder.
**Why:** The owner asked for the build to follow past repos. The standards file states it wins over any older document and applies to every project site. The prototype's Google Fonts, 10 px radii and transitions all fail its checker.
**Rules out:** The amber-on-dark stage and Spectral type from the prototype. The drawing surface is now `--panel` with `--ink` lines, so it reads as ink on paper in light mode and inverts in dark mode. Export colours default to the same paper and ink.

## 2026-10-14: Gemini Interactions endpoint, model gemini-nano-banana-2.1

**Decided:** The function calls `POST /v1beta/interactions` with `response_format: {type: 'image', mime_type: 'image/jpeg', aspect_ratio: '1:1'}` (PNG is rejected with "Supported values: 'image/jpeg'") and the model `gemini-nano-banana-2.1`, overridable by `GEMINI_IMAGE_MODEL`.
**Why:** On 2026-10-14 the official image-generation docs show only this endpoint and use that model in every example. The older `generateContent` shape no longer appears there, and `gemini-2.5-flash-image` is listed as shut down on 2026-10-02.
**Rules out:** The `generateContent` request shape named in the first draft of the architecture doc.
**Risk:** No key was available at build time, so the call is untested. The response parser searches for any `{type:'image', data}` block rather than assuming a path.

## 2026-10-14: rate limiting through the Vercel firewall, no Upstash

**Decided:** The per-IP limit is a WAF rate-limit rule added in the Vercel dashboard (available on Hobby, up to 3 custom rules). The function keeps a per-instance 10-per-10-minutes limiter and the `PROMPTS_ENABLED` kill switch as a second layer.
**Why:** No dependency, no second service. The in-function limiter alone is not enough because instances do not share memory.
**Rules out:** `@upstash/ratelimit`.

## 2026-10-14: one public-domain photo ships as a built-in example

**Decided:** `samples/einstein.jpg`, the 1947 Orren Jack Turner photograph from the Library of Congress (public domain, copyright not renewed), is the fifth example chip and the writeup's hero image. The Getty news photo in `test-images/` stays local and gitignored.
**Why:** A portrait is the drawing people want to see, and the procedural examples cannot show it. The spec's "no image files ship" line was about not bundling third-party photos; a public-domain one is fine and is credited in the README.
**Rules out:** Any screenshot derived from the Getty photo appearing in the repo, the writeup or the portfolio.

## 2026-10-14: prototype folder is gitignored, not committed

**Decided:** `prototype/` stays in the local folder and is excluded from the repo.
**Why:** It fails the design checker on every rule (Google Fonts, radii, transitions, pure white) and would need `_reference` renaming or allow-comments to pass. Parity with it is now enforced by the tour test in `tests/path.test.js`, which embeds the prototype's recursive algorithm as the oracle.
**Rules out:** Nothing. The file is still in the folder for anyone with the Drive.

## 2026-10-14: commits carry no AI trailer

**Decided:** Commits are authored by Jeremy Lee with no co-author or "generated with" line.
**Why:** The portfolio's publishing checklist and the overview builder's README both say so, and the global git identity on this machine is already set that way. The user's own conventions take precedence over the default attribution.

## 2026-10-14: Cloudflare Workers AI is the prompt provider; Gemini stays as an option

**Decided:** `api/generate.js` has two providers. Cloudflare Workers AI (FLUX.1 schnell, `@cf/black-forest-labs/flux-1-schnell`) is the default whenever `CF_ACCOUNT_ID` and `CF_API_TOKEN` are set; Gemini is used when only `GEMINI_API_KEY` is set; `IMAGE_PROVIDER` forces one.
**Why:** The owner's Gemini key is on Google's Free Tier, which has zero image quota on every image model (verified by direct calls on 2026-10-14), and the owner asked for a route that costs nothing. Cloudflare's free plan gives 10,000 neurons a day, FLUX.1 schnell costs about 4.8 neurons per 512 px tile, and past the allowance requests fail instead of billing.
**Rules out:** Hugging Face Inference Providers (under $0.10 a month of free credit) and community services with changing terms.

## 2026-10-14: the panel is tabbed

**Decided:** The right-hand panel shows one group at a time behind five tabs (Picture, Outline, Drawing, Maths, Export), is sticky on desktop, and the export group's colour, line-width and margin controls sit behind a disclosure. The chosen tab is remembered per browser.
**Why:** With five groups stacked, the panel ran to about four screens and the drawing scrolled out of view while adjusting anything. Tabs keep every control one click away with the stage always visible. The groups keep their ids, so nothing in the pipeline code changed.
**Rules out:** An accordion (two groups open at once looked like the old scroll), and moving the picture controls above the stage.

## 2026-10-14: N = 4,096 stays

**Decided:** The points dropdown offers 512 to 4,096.
**Why:** Measured in headless Chromium: 8 ms DFT at 2,048, 21 ms at 4,096. Well under the 1 s target.
