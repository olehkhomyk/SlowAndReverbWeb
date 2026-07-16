# Slowed + Reverb

A single-page, client-side audio editor. Drop in an mp3, wav, m4a or flac,
adjust speed, pitch, reverb and bass live via the Web Audio API, then export
the result as WAV or MP3 — no upload, no backend, no account. Everything
runs in your browser.

Speed is tape-style `playbackRate`; pitch is shifted independently via a
WASM `AudioWorklet` (`signalsmith-stretch-js`), so you can slow a track down
and dial the tone back, or push pitch and speed apart deliberately.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check, build, and prerender the landing page
- `npm run build:client` — build without the prerender step
- `npm run lint` — run ESLint over the project
- `npm run preview` — preview the production build locally

## Stack

React 19, TypeScript, Vite. No test suite — see `CLAUDE.md` for the
architecture notes and manual verification steps.
