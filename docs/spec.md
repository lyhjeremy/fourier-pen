# Fourier Pen: product spec

Version 1. Last updated 2026-10-14.

This is the source of truth for behaviour. If the code and this document disagree, fix one of them and say which in `docs/decisions.md`.

## 1. One-sentence description

A single-page website that takes a picture or a short text prompt, turns it into one continuous line, and animates a chain of rotating arrows drawing that line, with exports to image, vector, data and video.

## 2. Audience

People who saw the 3Blue1Brown video and want to try it on their own photo, and anyone who wants a Fourier drawing as a wallpaper. No maths knowledge required to use it. The maths panel is there for the curious.

## 3. Inputs

### 3.1 Picture upload
- File picker, drag and drop onto the drop zone, or paste from the clipboard anywhere on the page.
- Accepts any `image/*` the browser can decode (JPG, PNG, WebP, GIF, AVIF, HEIC where supported).
- Non-image files show the message "That file is not an image. Choose a JPG, PNG, WebP or GIF." in the stage.
- Images that fail to decode show "This image could not be opened. Try another file."

### 3.2 Built-in examples
Four procedurally drawn samples, selectable as chips: the word "Fourier" (default on load), π, a heart, and a music note. No image files are shipped for these.

### 3.3 Text prompt
- A text field in the Source group with a "Draw it" button. Placeholder: "Albert Einstein sticking out his tongue".
- Prompt length: 3 to 200 characters. Outside that range the button is disabled and a hint says why.
- On submit the client POSTs to `/api/generate`. The server wraps the prompt in a fixed line-art instruction and asks the Gemini image model for a PNG. The returned image enters the normal pipeline exactly as an upload would.
- While waiting, the stage shows "Drawing your prompt…" with the previous drawing still animating underneath. Typical wait is 5 to 15 seconds.
- Errors shown to the user, in the stage status area:
  - Rate limited: "Too many prompts right now. Try again in a minute."
  - Blocked by the model's safety filter: "The image model would not draw that. Try a different prompt."
  - Anything else: "The drawing service is unavailable. You can still upload a picture."
- The privacy line under the drop zone reads: "Uploaded pictures never leave your browser. Text prompts are sent to Google's image model."

## 4. Outline controls

| Control | What it does | Range | Default |
|---|---|---|---|
| Pen path | "One continuous line" (bridges and retracing) or "Hop between strokes" (straight jumps) | two options | One continuous line |
| Detail | Fraction of edge candidates kept. `keep = 0.02 + 0.55 × (detail/100)^1.3` | 1 to 100 | 35 |
| Smoothing | Gaussian blur sigma before edge detection, in px of the 360 px working image | 0.0 to 4.0 px | 1.4 px |
| Skip strokes shorter than | Drops strokes with fewer pixels than this | 2 to 80 px | 10 px |
| Points along the line | N samples fed to the DFT | 512, 1,024, 2,048, 4,096 | 2,048 |

Changing any of these reruns the pipeline after a 140 ms debounce. Changing N or pen path reruns immediately.

4,096 is new relative to the prototype. The direct DFT at 4,096 is 16.7 million complex multiply-adds, under half a second on a laptop. If it measures over 1 s on a mid-range phone during build, drop it or add an FFT. Decide at build time and record it.

## 5. Drawing controls

| Control | What it does | Range | Default |
|---|---|---|---|
| Arrows | Number of coefficients K used, on a log scale from 1 to N | 1 to N | round(N^0.82), about 520 at N = 2,048 |
| Time per drawing | Seconds per full loop | 4 to 60 s | 18 s |
| Show circles | Draw the circle each arrow sweeps (largest 220 only) | on/off | on |
| Show pen jumps | Dashed lines for jumps, hop mode only | on/off | on |

Stage buttons: Pause/Play, Restart, Follow pen (6× zoom tracking the pen tip).

After the first complete loop, the finished drawing stays visible faintly under the live trace.

If the user prefers reduced motion, the page loads paused with the finished drawing shown.

## 6. The maths panel

Unchanged from the prototype:
- The general formula c_n = (1/N) Σ_k z_k e^(−2πink/N).
- A live equation showing the three largest terms with real numbers, plus a count of the rest.
- A table of the ten largest arrows: rank, turns n, length |c_n| with a bar, start angle in radians.
- Stats: edge pixels, strokes threaded, bridges added (or pen jumps) with total length, points, arrows in use, shape energy captured.

Units: the drawing is centred and scaled so its longer side spans −1 to 1. t runs 0 to 1 over one drawing.

## 7. Exports

All exports draw the curve for the current K, not the full-N curve, so what you save is what you see. All exports are generated in the browser with a normal file download.

### 7.1 Picture (PNG and SVG)
Options, shown in an "Export" group:

| Option | Range | Default |
|---|---|---|
| Size preset | see table below, plus Custom | Square 2048 |
| Width, height | 256 to 8192 px, shown only for Custom | 2048 × 2048 |
| Line width | 0.5 to 6, in thousandths of the shorter side | 1.5 (about 3 px at 2048) |
| Line colour | colour picker | #f2b84b amber |
| Background colour | colour picker, plus "Transparent" for PNG | #0b0e14 |
| Margin | 0 to 25% of the shorter side | 8% |
| Include pen jumps | on/off, hop mode only | on |

Size presets:

| Preset | Pixels |
|---|---|
| Square | 2048 × 2048 |
| iPhone | 1179 × 2556 |
| iPhone Pro Max | 1290 × 2796 |
| MacBook Air 13 | 2560 × 1664 |
| MacBook Pro 14 | 3024 × 1964 |
| MacBook Pro 16 | 3456 × 2234 |
| Full HD | 1920 × 1080 |
| 4K | 3840 × 2160 |
| 5K | 5120 × 2880 |
| Custom | user enters both |

The curve's bounding box is fitted inside the target rectangle minus the margin, centred, aspect preserved.

A small live preview (about 240 px wide) of the export shows the chosen size, colours and line width before saving.

The SVG uses the same options. Its viewBox is the chosen width and height; the line width is in user units. A transparent background omits the background rect.

File names: `fourier-pen-<K>-arrows-<w>x<h>.png` and `.svg`.

### 7.2 Data (CSV)
Every coefficient, all N rows: `rank, turns_n, re, im, length, start_angle_rad, used`. `used` is 1 for the first K. File name `fourier-pen-arrows.csv`.

### 7.3 Video (WebM, MP4 where supported)
- Renders one full drawing loop, from a blank screen to the finished line, at the chosen export size and colours, with circles and arrows drawn as on screen.
- Duration equals the current "Time per drawing" value. Frame rate 30 fps by default, 60 available.
- Format: WebM (VP9) everywhere; MP4 (H.264) offered as a second button only when `MediaRecorder.isTypeSupported('video/mp4')` is true, which today means Safari.
- Rendering runs on an offscreen canvas at real time (MediaRecorder cannot run faster than real time), so an 18 s drawing takes 18 s to export. A progress bar and a Cancel button show during export. The live stage keeps animating.
- Size is capped at 1920 × 1920 for video regardless of preset, to keep encoding real-time on laptops. The preset's aspect ratio is kept.
- File name `fourier-pen-<K>-arrows.webm` or `.mp4`.

## 8. Performance targets

- Pipeline (upload to first frame) under 1 s for a 12 MP photo on a 2020 laptop at N = 2,048.
- Animation holds 60 fps at K = 2,048 on the same laptop, 30 fps on a mid-range phone.
- Page weight under 150 KB excluding fonts. No third-party scripts.

## 9. Browser support

Latest two versions of Chrome, Safari, Firefox and Edge, desktop and mobile. Video export and MP4 availability vary by browser and the UI says so. The page must still load and draw with JavaScript features from 2022 or earlier (no decorators, no top-level await in the browser code).

## 10. Accessibility

- Every control has a visible label and a keyboard focus ring.
- Stage buttons expose `aria-pressed`.
- The maths formula has an `aria-label` reading it in words.
- Colour is never the only signal. The export preview shows a text summary too.
- Reduced motion is respected on load.
- Contrast of text on both page themes meets WCAG AA.

## 11. Out of scope for version 1

- Accounts, saving to the cloud, galleries, sharing links.
- Freehand drawing input and SVG path input.
- ML line-art models for cleaner portraits.
- A Web Worker for the pipeline (reconsider if the 1 s target fails).
- Analytics of any kind.
