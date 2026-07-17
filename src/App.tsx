import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, DragEvent } from 'react';
import DownloadMenu from './components/DownloadMenu';
import type { ExportFormat } from './components/DownloadMenu';
import { AudioEngine } from './audio/engine';
import Fader from './components/Fader';
import Waveform from './components/Waveform';
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
	const [speedOn, setSpeedOn] = useState(true);
	const [pitchOn, setPitchOn] = useState(true);
	const [reverbOn, setReverbOn] = useState(true);
	const [bassOn, setBassOn] = useState(true);
	const [error, setError] = useState('');
	const [dragOver, setDragOver] = useState(false);
	const [exporting, setExporting] = useState(false);

	const getEngine = (): AudioEngine => {
		if (!engineRef.current) {
			const engine = new AudioEngine();
			engine.onTrackEnd = () => {
				setPlaying(false);
				setPosition(engine.duration);
			};
			engineRef.current = engine;
		}
		return engineRef.current;
	};

	const loadFile = async (file: File) => {
		const engine = getEngine();
		try {
			const decoded = await engine.load(file);
			engine.setRate(speedOn ? speed : 1);
			engine.setPitch(pitchOn ? pitch : 0);
			engine.setReverb(reverbOn ? reverb : 0);
			engine.setBassBoost(bassOn ? bass : 0);
			setBuffer(decoded);
			setTrackName(file.name.replace(/\.[^.]+$/, ''));
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

	const handleSpeedToggle = () => {
		const next = !speedOn;
		setSpeedOn(next);
		engineRef.current?.setRate(next ? speed : 1);
	};

	const handlePitchToggle = () => {
		const next = !pitchOn;
		setPitchOn(next);
		engineRef.current?.setPitch(next ? pitch : 0);
	};

	const handleReverbToggle = () => {
		const next = !reverbOn;
		setReverbOn(next);
		engineRef.current?.setReverb(next ? reverb : 0);
	};

	const handleBassToggle = () => {
		const next = !bassOn;
		setBassOn(next);
		engineRef.current?.setBassBoost(next ? bass : 0);
	};

	const isDefault = speed === 1 && pitch === 0 && reverb === 0 && bass === 0
		&& speedOn && pitchOn && reverbOn && bassOn;

	const handleReset = () => {
		const engine = engineRef.current;
		setSpeed(1);
		setPitch(0);
		setReverb(0);
		setBass(0);
		setSpeedOn(true);
		setPitchOn(true);
		setReverbOn(true);
		setBassOn(true);
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
					<h1 className="wordmark">
						slowed <span aria-hidden="true">&amp;</span> reverb
					</h1>
					<p className="tagline">Speed and reverb, live, right in your browser</p>
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
					<label className="drop-zone">
						<input type="file" accept="audio/*" onChange={handleFileInput}/>
						<span className="drop-title">Drop a track here</span>
						<span className="drop-sub">
							or click to choose a file — mp3, wav, m4a, flac
						</span>
					</label>
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
				<div className="fader-row">
					<label className="effect-toggle" title={speedOn ? 'Disable speed' : 'Enable speed'}>
						<input type="checkbox" checked={speedOn} onChange={handleSpeedToggle} />
						<span className="toggle-dot" style={{ '--toggle-accent': 'var(--amber)' } as CSSProperties} />
					</label>
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
						disabled={!speedOn}
					/>
				</div>
				<div className="fader-row">
					<label className="effect-toggle" title={pitchOn ? 'Disable pitch' : 'Enable pitch'}>
						<input type="checkbox" checked={pitchOn} onChange={handlePitchToggle} />
						<span className="toggle-dot" style={{ '--toggle-accent': 'var(--violet)' } as CSSProperties} />
					</label>
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
						disabled={!pitchOn}
					/>
				</div>
				<div className="fader-row">
					<label className="effect-toggle" title={reverbOn ? 'Disable reverb' : 'Enable reverb'}>
						<input type="checkbox" checked={reverbOn} onChange={handleReverbToggle} />
						<span className="toggle-dot" style={{ '--toggle-accent': 'var(--ice)' } as CSSProperties} />
					</label>
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
						disabled={!reverbOn}
					/>
				</div>
				<div className="fader-row">
					<label className="effect-toggle" title={bassOn ? 'Disable bass' : 'Enable bass'}>
						<input type="checkbox" checked={bassOn} onChange={handleBassToggle} />
						<span className="toggle-dot" style={{ '--toggle-accent': 'var(--coral)' } as CSSProperties} />
					</label>
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
						disabled={!bassOn}
					/>
				</div>
			</section>

			<footer className="hints">
				Space — play/pause&ensp;·&ensp;click the waveform to seek&ensp;·&ensp;
				faders work live during playback
			</footer>

			<section className="about">
				<h2>Slowed and reverb, without uploading anything</h2>
				<p>
					Drop in any mp3, wav, m4a or flac and shape it live: slow the
					tempo down for that classic slowed sound, layer in reverb for
					space and depth, or push the bass for more weight. This is
					browser-based slowed + reverb with no signup — speed and pitch
					sit on separate faders, so you can change pitch and speed
					separately, entirely online, in this tab. Slow a track down and
					dial the tone back to keep the pitch you started with, or lean
					into the pitch drop for a different mood. Every fader updates
					the sound instantly while it plays: nothing is uploaded to a
					server, and nothing is processed until you hit play. When
					you're happy with the mix, download it as a lossless WAV or a
					compressed MP3.
				</p>
			</section>

			<section className="faq">
				<h2>Frequently asked questions</h2>
				<dl>
					<div className="faq-item">
						<dt>What is slowed + reverb?</dt>
						<dd>
							A remix style where a track is slowed down and washed in
							reverb, giving it a hazy, underwater, nostalgic feel. This
							editor lets you dial in the speed, pitch, reverb and bass
							yourself and hear the result change live, instead of
							downloading someone else's fixed version.
						</dd>
					</div>
					<div className="faq-item">
						<dt>Does this upload my audio anywhere?</dt>
						<dd>
							No — everything runs locally in your browser. There's no
							server, no upload queue and no account; the file you drop
							in never leaves your device.
						</dd>
					</div>
					<div className="faq-item">
						<dt>
							Can I slow a song down without making it sound lower /
							chipmunked?
						</dt>
						<dd>
							Yes. Slowing playback down naturally drops the pitch too —
							that's the classic tape-style slowed sound — but the pitch
							fader runs independently of speed, so you can nudge it
							back up to keep the pitch you started with, or push it
							further for a more dramatic effect.
						</dd>
					</div>
					<div className="faq-item">
						<dt>
							What's the difference between slowed + reverb, daycore and
							nightcore?
						</dt>
						<dd>
							Nightcore speeds a track up and raises the pitch for a
							brighter, more energetic feel. Daycore and slowed + reverb
							both slow it down and drop the pitch; slowed + reverb adds
							a heavy reverb wash on top for that hazy, spaced-out
							texture, while daycore usually stays drier.
						</dd>
					</div>
					<div className="faq-item">
						<dt>What audio formats are supported?</dt>
						<dd>
							Drop in mp3, wav, m4a or flac. Export the result as a
							lossless WAV or a 192&nbsp;kbps MP3.
						</dd>
					</div>
					<div className="faq-item">
						<dt>Can I use this on my phone?</dt>
						<dd>
							Yes — it's a normal web page built on the Web Audio API,
							so it runs in modern mobile browsers the same way it does
							on desktop, no app install required.
						</dd>
					</div>
					<div className="faq-item">
						<dt>Is the export lossless?</dt>
						<dd>
							WAV export is lossless 16-bit PCM. MP3 export is
							compressed at 192&nbsp;kbps if you'd rather have a smaller
							file.
						</dd>
					</div>
				</dl>
			</section>
		</main>
	);
}

export default App;
