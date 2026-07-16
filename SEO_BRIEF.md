# SEO Optimization Brief — SlowAndReverbWeb

## Context

This repo is a single-page, client-side audio editor (React 19 + TypeScript + Vite 8). A user drops in an mp3/wav/m4a/flac, adjusts speed, pitch, reverb and bass live via the Web Audio API, then exports WAV or MP3. There is no backend and no upload — all processing happens in the user's browser.

Pitch shifting is an independent WASM AudioWorklet (`signalsmith-stretch-js`), separate from speed (`playbackRate`). MP3 encoding uses `@breezystack/lamejs`. This is the product's genuine differentiator versus competitors.

**Goal:** get this app indexed by Google and ranking for long-tail "slowed and reverb" queries.

**Before you start:** ask me for `SITE_URL` — the canonical, live production URL. Do not guess it and do not reuse any URL already present in the repo. Every task below depends on it.

---

## P0 — Wrong canonical domain (blocks all indexing)

The repo currently declares `https://slowedreverb.app/` as canonical in three places. That domain is **not owned by us and is not where the app is deployed.**

Consequence: Googlebot fetches the real site, reads the canonical, concludes the real page lives elsewhere, and drops our URL from the index. Nothing else in this brief matters until this is fixed.

Fix all three to use `SITE_URL`:

1. `index.html` — `<link rel="canonical">`, `og:url`
2. `public/robots.txt` — `Sitemap:` line
3. `public/sitemap.xml` — `<loc>`

Then make this impossible to get wrong again: read the value from a Vite env var (`VITE_SITE_URL`) and inject it at build time via `vite-plugin-html` or a small custom plugin, rather than hardcoding the string in three files. Generate `sitemap.xml` and `robots.txt` at build time from the same variable.

**Verify:** after `npm run build`, grep `dist/` for `slowedreverb.app` — there must be zero matches.

---

## P1 — Prerender the page (server-rendered HTML)

`index.html` ships `<div id="root"></div>` and nothing else. All body content — the `<h1>`, the tagline, the `<h2>` and the "about" paragraph in `App.tsx` — exists only after React hydrates.

Googlebot does execute JavaScript, but rendering is queued separately from crawling and is neither fast nor guaranteed. Right now Google sees a page with a title and description but an empty body: a thin page.

Add `vite-react-ssg` (or `react-snap` / `vite-plugin-prerender` — your call, pick whichever integrates most cleanly with Vite 8 and React 19). There is exactly one route, so this should be a small change.

Hard constraint: **the app must still work identically after prerendering.** `AudioEngine`, `AudioContext`, `AudioWorklet` and all Web Audio APIs are browser-only and will throw during the Node prerender pass. Guard every browser-API touchpoint so it only runs client-side (`useEffect`, `typeof window !== 'undefined'`). `AudioEngine` is already instantiated lazily via `getEngine()` inside a `useRef` — confirm nothing constructs it at module scope.

**Verify:** `curl SITE_URL` (or inspect `dist/index.html`) must show the real `<h1>` and body copy in the raw HTML, not an empty root div.

---

## P2 — Structured data

No JSON-LD exists. Add a `WebApplication` schema to `index.html`:

- `name`, `url` (= `SITE_URL`), `description`
- `applicationCategory: "MultimediaApplication"`
- `operatingSystem: "Any (browser-based)"`
- `offers` with `price: "0"`, `priceCurrency: "USD"`
- `featureList` — speed, independent pitch shift, reverb, bass boost, WAV/MP3 export, no upload

Do **not** add `aggregateRating` or fabricate review counts. There are no real reviews; inventing them is a manual-action risk.

Add a `FAQPage` schema too, but only after task P3 — the schema must mirror FAQ content that is actually visible on the page.

---

## P3 — Content depth and honest positioning

Current on-page copy is one `<h2>` plus one paragraph. Competitors (slowedandreverb.io, ssslowedandreverb.com, soundplate.com, slowedgenerator.com) all have substantially more indexable content. This page is thin.

Add a visible FAQ section below the editor. Real questions people search for:

- What is slowed + reverb?
- Does this upload my audio anywhere? (**No — everything runs locally in your browser.**)
- Can I slow a song down without making it sound lower / chipmunked?
- What's the difference between slowed + reverb, daycore and nightcore?
- What audio formats are supported?
- Can I use this on my phone?
- Is the export lossless?

**Positioning — be precise, and do not overclaim:**

- ✅ Say: pitch is adjustable **independently of speed**, live, via a WASM spectral shifter — so you can slow a track and correct the tone back, or push them apart deliberately.
- ✅ Say: nothing is uploaded; no queue, no server, no account, no file leaves the device.
- ✅ Say: faders update the sound instantly during playback (most competitors require re-processing).
- ❌ Do **not** claim we avoid `playbackRate` or use "studio time-stretching" for the speed control. Speed *is* `playbackRate` (tape-style). That claim is false.
- ❌ Do not claim we're higher quality than named competitors without a measurable basis.

Target long-tail keywords in headings and copy (not "slow and reverb" alone — that head term is saturated by exact-match domains):

- `slowed and reverb without uploading`
- `slowed reverb keep pitch`
- `browser slowed reverb no signup`
- `change pitch and speed separately online`

---

## P4 — Core Web Vitals

`index.html` loads JetBrains Mono from Google Fonts via a render-blocking `<link>`. This costs LCP, which is a ranking signal.

Self-host the font: install `@fontsource/jetbrains-mono`, drop the `<link>` and both `preconnect`s, subset to the weights actually used, and `<link rel="preload">` the woff2. Ensure `font-display: swap`.

Then run Lighthouse and report before/after numbers for LCP, CLS and TBT. Note that the WASM worklet may affect TBT — if so, confirm it loads lazily and does not block first paint.

---

## P5 — Social preview and cleanup

- `og:image` is missing entirely. `src/assets/hero.png` exists — check its dimensions; if it's not close to 1200×630, generate a proper OG image. Add `og:image`, `og:image:width`, `og:image:height`, and switch `twitter:card` from `summary` to `summary_large_image`.
- `<meta name="keywords">` — Google has ignored this since 2009. Remove it.
- `package.json` `"name"` is still `"my-react-app"`. Rename.
- `README.md` is the untouched Vite template. Replace with a real description of the project.
- Add `public/_redirects` containing `/*  /index.html  200`. Not strictly needed today (single route), but it prevents 404s if routing is ever added.

**Do NOT add** `_headers` with `Cross-Origin-Embedder-Policy` / `Cross-Origin-Opener-Policy`. This app uses AudioWorklet and lamejs, not ffmpeg.wasm; it does not need `SharedArrayBuffer`, and COEP would only risk breaking cross-origin asset loading for no benefit.

---

## Constraints

- **Do not break the audio engine.** It is the entire product. `src/audio/engine.ts` holds the whole Web Audio graph and the analytic playhead math; treat it as off-limits unless a task explicitly requires touching it.
- **Do not add a backend, analytics, tracking, or any network request.** "Nothing leaves your browser" is the core marketing claim — it must remain literally true. Any third-party script would falsify it.
- **Do not add dependencies** beyond what P1 and P4 require. Bundle size affects LCP.
- Keep TypeScript strict; `npm run build` runs `tsc -b` and must stay green.
- Run `npm run lint` before finishing.

## Order of work

Do P0 first and stop for my confirmation of `SITE_URL` before proceeding. P0 is the only thing that currently blocks indexing outright; the rest is improvement on top of it.

## Out of scope

Google Search Console setup, sitemap submission, and the domain purchase are manual steps I'll handle. Don't attempt them.
