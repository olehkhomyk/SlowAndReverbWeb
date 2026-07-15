import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import DownloadMenu from './components/DownloadMenu';
import type { ExportFormat } from './components/DownloadMenu';
import type { AudioEngine } from './audio/engine';
import Fader from './components/Fader';
import Waveform from './components/Waveform';
import YouTubeInput from './components/YouTubeInput';
import './App.css';

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

function App() {
	const engineRef = useRef<AudioEngine | null>(null);
	const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
	const [trackName, setTrackName] = useState('');
	const [playing, setPlaying] = useState(false);
	const [position, setPosition] = useState(0);
	const [speed, setSpeed] = useState(1);
	const [pitch, setPitch] = useState(0);
	const [reverb, setReverb] = useState(0);
	const [bass, setBass] = useState(0);
	const [error, setError] = useState('');
	const [dragOver, setDragOver] = useState(false);
	const [exporting, setExporting] = useState(false);

	// The engine module pulls in the WASM pitch shifter, so it is loaded on
	// first use — i.e. when the user actually picks a track — rather than on
	// page load. AudioContext is likewise only constructed here, inside a
	// user gesture, which is what the browser autoplay policy requires.
	const getEngine = async (): Promise<AudioEngine> => {
		if (!engineRef.current) {
			const { AudioEngine } = await import('./audio/engine');
			const engine = new AudioEngine();
			engine.onTrackEnd = () => {
				setPlaying(false);
				setPosition(engine.duration);
			};
			engineRef.current = engine;
		}
		return engineRef.current;
	};

	const loadFile = async (file: File, displayName?: string) => {
		const engine = await getEngine();
		try {
			const decoded = await engine.load(file);
			engine.setRate(speed);
			engine.setPitch(pitch);
			engine.setReverb(reverb);
			engine.setBassBoost(bass);
			setBuffer(decoded);
			setTrackName(displayName ?? file.name.replace(/\.[^.]+$/, ''));
			setPlaying(false);
			setPosition(0);
			setError('');
		} catch {
			setError("Couldn't read that file — try mp3, wav or m4a.");
		}
	};

	const togglePlay = async () => {
		const engine = engineRef.current;
		if (!engine || !buffer) return;
		if (engine.isPlaying) {
			engine.pause();
			setPosition(engine.position());
			setPlaying(false);
		} else {
			await engine.play();
			setPlaying(true);
		}
	};

	const handleSeek = (time: number) => {
		engineRef.current?.seek(time);
		setPosition(engineRef.current?.position() ?? time);
	};

	const handleSpeed = (value: number) => {
		setSpeed(value);
		engineRef.current?.setRate(value);
	};

	const handlePitch = (value: number) => {
		setPitch(value);
		engineRef.current?.setPitch(value);
	};

	const handleReverb = (value: number) => {
		setReverb(value);
		engineRef.current?.setReverb(value);
	};

	const handleBass = (value: number) => {
		setBass(value);
		engineRef.current?.setBassBoost(value);
	};

	const isDefault = speed === 1 && pitch === 0 && reverb === 0 && bass === 0;

	const handleReset = () => {
		const engine = engineRef.current;
		setSpeed(1);
		setPitch(0);
		setReverb(0);
		setBass(0);
		engine?.setRate(1);
		engine?.setPitch(0);
		engine?.setReverb(0);
		engine?.setBassBoost(0);
	};

	const handleRemoveTrack = () => {
		engineRef.current?.unload();
		setBuffer(null);
		setTrackName('');
		setPlaying(false);
		setPosition(0);
		setError('');
	};

	const handleExport = async (format: ExportFormat) => {
		const engine = engineRef.current;
		if (!engine || !buffer || exporting) return;
		setExporting(true);
		try {
			const blob =
				format === 'mp3' ? await engine.exportMp3() : await engine.exportWav();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `${trackName} (slowed-reverb).${format}`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
			setError('');
		} catch {
			setError("Couldn't render the file — try again.");
		} finally {
			setExporting(false);
		}
	};

	const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) void loadFile(file);
		e.target.value = '';
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const file = e.dataTransfer.files[0];
		if (file) void loadFile(file);
	};

	// Playhead follows the engine while playing.
	useEffect(() => {
		if (!playing) return;
		let raf = 0;
		const tick = () => {
			const engine = engineRef.current;
			if (engine) setPosition(engine.position());
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing]);

	// Space toggles playback unless focus is on a control.
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.code !== 'Space') return;
			const target = e.target as HTMLElement | null;
			if (target?.closest('[role="slider"], button, input, a')) return;
			e.preventDefault();
			void togglePlay();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	});

	return (
		<main
			className="deck"
			onDragOver={(e) => {
				e.preventDefault();
				setDragOver(true);
			}}
			onDragLeave={() => setDragOver(false)}
			onDrop={handleDrop}
		>
			<header className="masthead">
				<div>
					{/* The wordmark is the visible brand; the rest of the h1 names what
					    the page actually is, for search engines and screen readers. */}
					<h1 className="wordmark">
						slowed <span aria-hidden="true">&amp;</span> reverb
						<span className="visually-hidden">
							{' '}— free online audio editor to slow down songs, shift pitch,
							add reverb and boost bass
						</span>
					</h1>
					<p className="tagline">
						Slow down a track, shift its pitch, add reverb and boost the
						bass — live in your browser
					</p>
				</div>
				<div className="masthead-actions">
					<label className="load-button">
						<input type="file" accept="audio/*" onChange={handleFileInput}/>
						Open track
					</label>
					<DownloadMenu
						disabled={!buffer}
						busy={exporting}
						onExport={(format) => void handleExport(format)}
					/>
				</div>
			</header>

			<section className={`wave-panel${dragOver ? ' drag' : ''}`}>
				{buffer ? (
					<>
						<div className="track-bar">
							<span className="track-name">{trackName}</span>
							<span className="track-time">
                <b>{formatTime(position)}</b> / {formatTime(buffer.duration)}
              </span>
							<button
								className="icon-button"
								onClick={handleRemoveTrack}
								aria-label="Remove track"
								title="Remove track"
							>
								<svg viewBox="0 0 16 16" aria-hidden="true">
									<path d="M4 4l8 8M12 4l-8 8"/>
								</svg>
							</button>
						</div>
						<div className="wave-row">
							<button
								className="transport"
								onClick={() => void togglePlay()}
								disabled={!buffer}
								aria-label={playing ? 'Pause' : 'Play'}
							>
								{playing ? (
									<svg viewBox="0 0 24 24" aria-hidden="true">
										<rect x="6" y="5" width="4" height="14"/>
										<rect x="14" y="5" width="4" height="14"/>
									</svg>
								) : (
									<svg viewBox="0 0 24 24" aria-hidden="true">
										<path d="M8 5l12 7-12 7z"/>
									</svg>
								)}
							</button>
							<Waveform buffer={buffer} position={position} onSeek={handleSeek}/>
						</div>
					</>
				) : (
					<div className="empty-state">
						<label className="drop-zone">
							<input type="file" accept="audio/*" onChange={handleFileInput}/>
							<span className="drop-title">Drop a track here</span>
							<span className="drop-sub">
                or click to choose a file — mp3, wav, m4a, flac
              </span>
						</label>
						<div className="empty-divider"><span>or paste a YouTube link</span></div>
						<YouTubeInput
							onLoad={(file) => loadFile(file, 'YouTube audio')}
						/>
					</div>
				)}
				{error && <p className="load-error">{error}</p>}
			</section>

			<div className="console-bar">
				<span className="console-title">Effects</span>
				<button
					className="text-button"
					onClick={handleReset}
					disabled={isDefault}
				>
					Reset
				</button>
			</div>

			<section className="console">
				<Fader
					label="Speed"
					value={speed}
					min={0.5}
					max={1.5}
					step={0.01}
					detent={1}
					ticks={[0.5, 0.75, 1, 1.25, 1.5]}
					accent="var(--amber)"
					format={(v) => `×${v.toFixed(2)}`}
					onChange={handleSpeed}
				/>
				<Fader
					label="Pitch"
					value={pitch}
					min={-12}
					max={12}
					step={1}
					detent={0}
					ticks={[-12, -6, 0, 6, 12]}
					accent="var(--violet)"
					format={(v) => `${v > 0 ? '+' : ''}${v} st`}
					onChange={handlePitch}
				/>
				<Fader
					label="Reverb"
					value={reverb}
					min={0}
					max={1}
					step={0.01}
					ticks={[0, 0.25, 0.5, 0.75, 1]}
					accent="var(--ice)"
					format={(v) => `${Math.round(v * 100)}%`}
					onChange={handleReverb}
				/>
				<Fader
					label="Bass"
					value={bass}
					min={0}
					max={12}
					step={0.5}
					ticks={[0, 3, 6, 9, 12]}
					accent="var(--coral)"
					format={(v) => `+${v.toFixed(1)} dB`}
					onChange={handleBass}
				/>
			</section>

			<footer className="hints">
				Space — play/pause&ensp;·&ensp;click the waveform to seek&ensp;·&ensp;
				faders work live during playback
			</footer>

			<section className="about">
				<h2>A slowed + reverb editor that runs entirely in your browser</h2>
				<p>
					Drop in any mp3, wav, m4a or flac and shape it live: slow the
					tempo down for that classic slowed sound, shift the pitch up or
					down independently of speed, layer in reverb for space and depth,
					or push the bass for more weight. Every fader updates the sound
					instantly while it plays — nothing is uploaded to a server, and
					nothing is processed until you hit play. When you're happy with
					the mix, download it as a lossless WAV or a compressed MP3.
				</p>
			</section>
		</main>
	);
}

export default App;