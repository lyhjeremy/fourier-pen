# Fourier Pen: design

Last updated 2026-10-14. Supersedes the first draft, which recorded the prototype's amber-on-dark look. The site follows the Ledger house style in [DESIGN_STANDARDS.md](https://github.com/lyhjeremy/lyhjeremy/blob/main/DESIGN_STANDARDS.md); this file only records how that style is applied to a drawing tool.

## 1. Feel

A plotter on a desk, drawn in ink on paper. The drawing surface is the page's panel colour, the line is the page's ink, and in dark mode both invert. There is no decoration that is not data: the only hues are the oxide accent (pen tip, slider thumbs, focus rings, links) and pine (the length bars in the coefficient table).

## 2. Tokens

Exactly the Ledger palette, defined on `:root` and redefined in the dark block and under `data-theme="dark"`:

| Token | Light | Dark | Use here |
|---|---|---|---|
| `--paper` | `#EDEDE7` | `#191B18` | page, inputs, previews |
| `--panel` | `#F5F5F0` | `#212420` | instrument panel, the stage |
| `--ink` | `#1C1E1B` | `#E6E6DE` | text, the drawn line |
| `--ink-2` | `#52564E` | `#A2A69B` | labels, arrows, circles |
| `--rule` | `#C6C7BF` | `#3B3F38` | separators, skeleton fill |
| `--edge` | `#767A70` | `#6A6F66` | control borders |
| `--signal` | `#8C3A1E` | `#D8825C` | pen tip, focus, links, slider accent |
| `--signal-2` | `#2C5852` | `#74AFA5` | coefficient length bars |

Stage ink is derived at draw time from the computed tokens: line in `--ink`, finished-drawing ghost at 18% alpha of ink, arrows in `--ink-2` at 75%, circles in `--ink-2` fading with rank, pen tip in `--signal`. Export defaults are `#1C1E1B` on `#EDEDE7` regardless of theme, with a "Swap colours" button.

## 3. Type

Self-hosted in `fonts/`: Source Serif 4 (400, 600) for the title and the formula, IBM Plex Sans (400, 600) for everything else, IBM Plex Mono (400) for the readout, the live equation, the coefficient table, the stats and slider outputs. No third-party font request.

## 4. Layout

One screen on desktop. From 881 px the page is two columns, stage then a 360 px panel, and both are exactly `--fit` tall: `clamp(420px, 100vh - 220px, 1400px)`, where 220 px is the writeup bar, the one-row header, the note, the footer and the gaps. The page itself does not scroll on a Full HD or MacBook display; a tab taller than the panel scrolls inside the panel. The header is one row: title, tagline at 13 px, theme button. Max width 1400 px, 16 px gutters, safe-area insets respected. Below 880 px the stage is square and the panel stacks beneath it. Stage buttons sit top right inside the stage; the mono readout bottom left; a 4 px progress bar along the bottom edge during video export.

A "Read the full writeup" bar sits above the page, as on the sibling tools.

The panel is sticky on desktop (top 16 px, scrolls inside itself if a tab is taller than the viewport) and shows one group at a time behind a five-tab strip: Picture, Outline, Drawing, Maths, Export. The strip sits on `--paper`; the selected tab is on `--panel` with a 2 px ink underline, no fill, no transition. Arrow keys move between tabs. Export shows the size preset, custom width and height (Custom only), a 200 px live preview with a one-line mono caption and five compact save buttons in a three-column grid (format in bold, purpose beneath); line width, colours, transparent background, jumps, swap and margin sit behind a bordered disclosure labelled "Colours, line width and margin".

## 5. Components

Square everything. Buttons are 1 px `--edge` on `--panel`; the primary (Draw it) fills with `--signal` and labels in `--paper`; pressed stage buttons fill with `--ink`. Chips the same, pressed fills with ink. The pen-path segment control is two radios in one bordered box, the chosen half filled with ink. Range inputs use `accent-color: var(--signal)`. Tables have a 2 px ink header rule, 1 px rule rows, mono right-aligned numbers. The status overlay is a bordered `--paper` box centred on the stage, never a modal. Hover changes border colour instantly; no transitions.

## 6. Motion

The drawing is the only motion. Skeleton blocks (flat `--rule` fill with an opacity pulse) cover the two previews while a prompt is generating. Under `prefers-reduced-motion` the page loads paused on the finished drawing and skeletons do not pulse.

## 7. Theme

A "Theme: system / light / dark" button in the header, stored in `localStorage` under `fourier-pen-theme` and applied before first paint by an inline script. Canvas colours re-resolve on change.

## 8. States

- No outlines found: "No outlines found. Raise Detail, lower the stroke cut-off, or try a picture with more contrast."
- Prompt waiting: "Drawing your prompt…" in the status box, skeletons over the previews, the previous drawing keeps animating.
- Prompt errors: rate limited, blocked, unavailable, not configured, each a plain sentence from `js/prompt.js`.
- Video unsupported: the WebM button's note reads "Not available in this browser" and stays disabled. MP4 appears only when the browser can record it.
