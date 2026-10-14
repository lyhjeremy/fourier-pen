# Fourier Pen

Design and copy follow [these standards](https://github.com/lyhjeremy/lyhjeremy/blob/main/DESIGN_STANDARDS.md).

Any picture, one line, a chain of spinning arrows. Fourier Pen finds the outlines in a
picture, threads them into a single continuous line, and redraws that line with rotating
arrows stacked tip to tail. Each arrow is one term of a complex Fourier series. You can
watch it draw, read the actual coefficients, and save the result as a wallpaper, a vector,
a spreadsheet of arrows, or a video.

> **Try it:** https://fourier-pen.vercel.app/
> **Writeup:** https://fourier-pen.vercel.app/overview/

Inspired by the epicycle drawings in 3Blue1Brown's "But what is a Fourier series?".

## What it does
- **Input**: upload, drop or paste a picture; pick one of five built-in examples; or type a
  short prompt and let Google's image model draw a line-art version first.
- **One continuous line**: strokes are joined by the shortest possible bridges (a minimum
  spanning tree) and the pen retraces its own ink instead of lifting, so the whole drawing
  is a single closed curve. A "hop" mode with straight pen jumps is there for comparison.
- **The maths, live**: the general formula, the three largest terms with real numbers, the
  ten largest arrows in a table, and how much of the shape's energy the current arrow
  count captures.
- **Export**: PNG at wallpaper sizes (iPhone, MacBook, Full HD, 4K, 5K or custom) with
  your own line and background colours, SVG, a CSV of every coefficient, and a WebM or
  MP4 video of one full drawing.

Uploaded pictures never leave your browser. A text prompt is the one thing sent to a
server (this site's own function, which forwards it to Google). See the
[privacy page](https://fourier-pen.vercel.app/privacy/).

## How it works
1. The picture is scaled to 360 px, converted to grayscale with a contrast stretch, and run
   through a Canny edge detector written by hand (Gaussian blur, Sobel gradients,
   non-maximum suppression, hysteresis).
2. Edge pixels are traced into strokes. Kruskal's algorithm over a spatial grid finds the
   shortest bridges between strokes, and an Euler tour of the doubled tree walks every
   stroke out and back, so the pen never lifts.
3. The closed path is resampled to N points (default 2,048) and treated as N complex
   numbers z_k.
4. A direct discrete Fourier transform gives c_n = (1/N) sum z_k e^(-2 pi i n k / N) for n
   from -N/2 to N/2 - 1. Each c_n is an arrow: |c_n| is its length, arg c_n its starting
   angle, n how many turns it makes per drawing.
5. Arrows are sorted largest first. The first K of them draw a smoothed version of the
   picture; all N draw it exactly. The slider is log-scaled, so 1, 30, 500 and 2,048 arrows
   are all a short drag apart.

The direct O(N squared) transform takes about 8 ms at N = 2,048 and 21 ms at 4,096 on a
laptop (the page reports its own timing), which is why there is no FFT.

## Run it locally
No build step. Serve the folder with any static server:

```
npx serve .
```

The text prompt feature needs the serverless function and a Gemini API key:

```
cp .env.example .env.local     # put your key in GEMINI_API_KEY
vercel dev
```

Tests for the maths and path modules run under Node with no dependencies:

```
node --test tests/
```

## Deploy
The site is a Vercel project. Pushing to `main` deploys. Set `GEMINI_API_KEY` in the
project's environment variables; without it the prompt button says prompts are not set
up and everything else keeps working. Add a WAF rate-limit rule on `/api/generate` in the
Vercel dashboard (the function also keeps a per-instance limit of 10 prompts per 10
minutes per IP, and `PROMPTS_ENABLED=false` switches the feature off without a deploy).

## Project docs
- `docs/spec.md`: every control, default, export and error state
- `docs/architecture.md`: modules, data flow, the function, tests
- `docs/design.md`: how the Ledger house style is applied to a drawing tool
- `docs/decisions.md`: why things are the way they are
- `docs/build-plan.md`: the phases the build went through
- `handoff.md`: state file for picking the project up cold

## Credits
The Einstein example is the 1947 photograph by Orren Jack Turner, from the Library of
Congress, public domain. Fonts are Source Serif 4, IBM Plex Sans and IBM Plex Mono,
self-hosted.

## License
[MIT](LICENSE) (c) 2026 Jeremy Lee
