# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page browser audio editor ("Slowed + Reverb") built with React 19 + TypeScript + Vite. Everything runs client-side via the Web Audio API — no backend, no upload. A user drops in an mp3/wav/m4a/flac, tweaks speed, pitch, reverb and bass live during playback, then exports the mix as WAV or MP3.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check (`tsc -b`) then production build via Vite
- `npm run lint` — run ESLint over the project
- `npm run preview` — preview the production build locally

There is no test suite / test runner configured in this repo.

## Architecture

The whole app is 4 source files plus one CSS file — read all of them before making non-trivial changes; there's no deeper structure to discover.

- `src/audio/engine.ts` — `AudioEngine` class: the entire Web Audio graph and all playback/export logic, kept independent of React state.
- `src/App.tsx` — owns all UI state (position, speed, pitch, reverb, bass, etc.) in `useState`, holds one `AudioEngine` instance in a `useRef`, and wires state changes to engine method calls.
- `src/components/Fader.tsx`, `Waveform.tsx`, `DownloadMenu.tsx` — presentational/interactive components driven entirely by props from `App.tsx`.

### Audio graph (`AudioEngine`)

Live playback signal path:
```
source ──► input ──► pitch ──► bass ──┬──► dry ─────────────► destination
                                       └──► convolver ► wet ─► destination
```
- **Speed** = `source.playbackRate` (tape-style: pitch follows speed naturally).
- **Pitch** is an independent shift via `signalsmith-stretch-js` (a WASM AudioWorklet spectral shifter), applied in live-input mode. If the worklet fails to load, `input` stays wired straight through to `dry`/`convolver` and only pitch-shifting is lost — playback still works.
- **Bass boost** is a low-shelf biquad filter ahead of the reverb send, so boosted low end blooms through the reverb tail too.
- **Reverb** is a generated noise impulse response through a `ConvolverNode`, mixed in via the `wet` gain alongside `dry`.

Playhead position is tracked analytically rather than polled from the audio clock: `position = basePos + (elapsed context time) × rate`, re-anchored (`basePos`/`baseTime`) on every play, seek, and rate change. This keeps the math exact even as the rate slider moves mid-playback.

Export (`exportWav` / `exportMp3`) re-renders the track in an `OfflineAudioContext` with the current speed/pitch/bass/reverb baked in, rather than capturing live playback. Because the pitch-shifter worklet has processing latency, offline rendering keeps a `skipSeconds` lead-in that the encoder trims so the exported file starts on time. WAV encoding is hand-rolled (`encodeWav`); MP3 uses `@breezystack/lamejs`.

### State/engine wiring pattern (`App.tsx`)

Each effect has a React state value (e.g. `speed`, `pitch`) and a corresponding `AudioEngine` setter (`setRate`, `setPitch`, ...). Handlers update both together (state for UI re-render, engine call for live audio). The engine instance itself is created lazily on first use via `getEngine()` and stored in a ref so it survives re-renders and isn't recreated.

## Conventions

- Tabs for indentation in `.tsx`/`.ts` files (see existing components).
- Comments are used sparingly, only to explain non-obvious signal-flow or math (see `engine.ts` header comment and playhead math) — follow that bar rather than narrating what code does.
- Colors are CSS custom properties defined once in `src/index.css` (`--room`, `--panel`, `--panel-edge`, `--ink`/`--ink-dim`, `--amber`, `--ice`, `--violet`, `--coral`, each with a `-soft` rgba variant) and consumed in `App.css` and inline styles (`Fader`'s `--fader-accent`). Dark theme only (`color-scheme: dark`); there is no light theme to keep in sync.
- Font is JetBrains Mono for everything (loaded from Google Fonts in `index.html`), used as both `--mono` and `--sans` — this is a deliberate all-monospace UI, not an oversight.

## How this was built (design rationale)

The engine went through the obvious naive approaches first; the current shape is what survived:

- **Pitch shifting** uses `signalsmith-stretch-js` (a WASM `AudioWorkletNode`) in live-input streaming mode rather than a granular/overlap-add shifter written by hand, because naive time-domain approaches warble noticeably on sustained tones. The trade-off is added latency (`node.latency()`), which is why offline export has to skip a lead-in (see `renderOffline`) — this is the one non-obvious wrinkle most future changes to pitch or export will run into.
- **Speed** is deliberately just `playbackRate` (tape-style, pitch follows speed) rather than an independent time-stretch, matching the "slowed reverb" genre convention this app is named after — pitch is only decoupled from speed via the separate pitch fader.
- **Playhead position** is computed analytically (`basePos + elapsed × rate`) instead of polled from `ctx.currentTime` directly or from a `requestAnimationFrame`-driven counter, so scrubbing/rate changes/pauses don't drift or need special-casing — every mutation just re-anchors `basePos`/`baseTime`.
- **Export re-renders offline** (`OfflineAudioContext`) rather than capturing the live graph with `MediaRecorder`, so the exported file is deterministic regardless of what was happening on screen during playback (paused, fader mid-drag, etc.) and isn't limited to realtime capture speed.
- **Reverb** is a synthesized noise impulse response (`createImpulseResponse`), not a loaded IR sample file — keeps the app dependency-free and asset-free for that effect.

## Things an agent should know before changing this

- **No test suite exists.** Verify behavior by running `npm run dev` and exercising the app in a real browser: load a file, play/pause, drag each fader during playback, scrub the waveform, then export both WAV and MP3 and confirm they play back and start on time (this is where pitch-shift latency bugs surface).
- **`AudioContext` needs a user gesture.** `AudioEngine.play()` calls `ctx.resume()` for this reason; don't move audio-graph setup into a place that runs before any click/keypress or it'll silently stay suspended.
- **The pitch worklet can fail to load** (unsupported browser, blocked module fetch, etc.); `initPitch()` swallows that failure on purpose so the rest of the app (speed/reverb/bass, playback, export) keeps working with pitch shifting simply absent. Don't let a pitch-path change turn this into a hard failure.
- **`src/assets/hero.png` and `public/icons.svg`** are not currently referenced anywhere in the source — leftover/placeholder assets, not a broken import to chase.
- **`index.html`, `public/robots.txt`, and `public/sitemap.xml` hardcode `https://slowedreverb.app/`** as the canonical/OG/sitemap domain. If the deploy target ever changes, update all three together.
- **`dist/` at the repo root is a build artifact** (gitignored) from a previous `npm run build`, not source to edit.