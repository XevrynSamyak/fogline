# Fogline Coffee House

A coffee house in the deodars, 18 km above Dehradun. Open every day from 7 am to 7 pm.

This is a concept site — an interactive story that drives you up the Kimadi road, into the fog, and through the room before taking your coffee order. Fogline is a fictional coffee house; the road is real.

## The site

A single-page, scroll-driven experience built to feel like the drive itself:

- **The drive** — a WebGL fog scene. Wipe the fog with your cursor (or just scroll) as the road climbs from 640 m in Dehradun to 1,480 m at the door.
- **The room** — an annotated floor plan: the window bench, four tables, the stove, and the brew counter, each with a note on hover.
- **The roast** — Monday's roast curve, drawn for the most recent batch.
- **The board** — this month's coffees, each with a generated contour map of its hill and notes on process and cup character.
- **The visit** — a live status readout, driving directions, and a rendered road to the door.

## Running it

Serve the folder statically, or use the included preview server:

```sh
node serve.mjs
```

Then open (http://fogline-beta.vercel.app/).

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The page |
| `style.css` | Layout, typography, and tone |
| `main.js` | Scroll choreography, fog WebGL, contour maps, road rendering |
| `serve.mjs` | Minimal local static server (no dependencies) |

## Stack

Vanilla HTML, CSS, and JavaScript — no build step, no framework, no runtime dependencies. The only external assets are Google Fonts (Anek Latin + Eczar) and Lenis for smooth scrolling, both loaded by CDN with SRI.
