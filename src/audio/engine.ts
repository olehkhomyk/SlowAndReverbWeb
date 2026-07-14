import createSignalsmithStretchNode from 'signalsmith-stretch-js';
import type { SignalsmithStretchNode } from 'signalsmith-stretch-js';
import { Mp3Encoder } from '@breezystack/lamejs';

// Live playback graph:
//
//   source ──► input ──► pitch ──► bass ──┬──► dry ─────────────► destination
//                                         └──► convolver ► wet ─► destination
//
// Speed is source.playbackRate (tape-style: pitch follows speed).
// Pitch is Signalsmith Stretch (WASM AudioWorklet) running in live-input
// mode: a spectral shifter, so it stays clean where naive granular
// approaches warble. If the worklet fails to load, input stays wired
// straight to dry/convolver and only pitch is lost.
// Bass boost is a low-shelf biquad ahead of the reverb send, so the
// boosted low end blooms through the reverb tail too.
// Reverb is a generated noise impulse response through the convolver,
// mixed in with the wet gain.

function createImpulseResponse(
	ctx: BaseAudioContext,
	seconds = 3,
	decay = 2.4,
): AudioBuffer {
	const rate = ctx.sampleRate;
	const length = Math.max(1, Math.floor(seconds * rate));
	const impulse = ctx.createBuffer(2, length, rate);
	for (let channel = 0; channel < 2; channel++) {
		const data = impulse.getChannelData(channel);
		for (let i = 0; i < length; i++) {
			data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
		}
	}
	return impulse;
}

function encodeWav(
	buffer: AudioBuffer,
	skipSeconds: number,
	keepSeconds: number,
): Blob {
	const sampleRate = buffer.sampleRate;
	const channels = buffer.numberOfChannels;
	const start = Math.min(Math.floor(skipSeconds * sampleRate), buffer.length);
	const end = Math.min(start + Math.ceil(keepSeconds * sampleRate), buffer.length);
	const frames = Math.max(0, end - start);
	const dataSize = frames * channels * 2;
	const view = new DataView(new ArrayBuffer(44 + dataSize));
	const writeString = (offset: number, s: string) => {
		for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
	};
	writeString(0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true);
	writeString(8, 'WAVE');
	writeString(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * channels * 2, true);
	view.setUint16(32, channels * 2, true);
	view.setUint16(34, 16, true);
	writeString(36, 'data');
	view.setUint32(40, dataSize, true);
	const channelData = [];
	for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));
	let offset = 44;
	for (let i = start; i < end; i++) {
		for (let c = 0; c < channels; c++) {
			const v = Math.max(-1, Math.min(1, channelData[c][i]));
			view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
			offset += 2;
		}
	}
	return new Blob([view.buffer], { type: 'audio/wav' });
}

function toInt16(samples: Float32Array, start: number, end: number): Int16Array {
	const out = new Int16Array(Math.max(0, end - start));
	for (let i = start; i < end; i++) {
		const v = Math.max(-1, Math.min(1, samples[i]));
		out[i - start] = v < 0 ? v * 0x8000 : v * 0x7fff;
	}
	return out;
}

function encodeMp3(
	buffer: AudioBuffer,
	skipSeconds: number,
	keepSeconds: number,
	kbps = 192,
): Blob {
	const sampleRate = buffer.sampleRate;
	const channels = Math.min(2, buffer.numberOfChannels);
	const start = Math.min(Math.floor(skipSeconds * sampleRate), buffer.length);
	const end = Math.min(start + Math.ceil(keepSeconds * sampleRate), buffer.length);
	const left = toInt16(buffer.getChannelData(0), start, end);
	const right = channels > 1 ? toInt16(buffer.getChannelData(1), start, end) : undefined;

	const encoder = new Mp3Encoder(channels, sampleRate, kbps);
	const chunks: BlobPart[] = [];
	const blockSize = 1152; // LAME's fixed frame size
	for (let i = 0; i < left.length; i += blockSize) {
		const chunk = right
			? encoder.encodeBuffer(left.subarray(i, i + blockSize), right.subarray(i, i + blockSize))
			: encoder.encodeBuffer(left.subarray(i, i + blockSize));
		if (chunk.length > 0) chunks.push(chunk.slice().buffer);
	}
	const tail = encoder.flush();
	if (tail.length > 0) chunks.push(tail.slice().buffer);
	return new Blob(chunks, { type: 'audio/mpeg' });
}

export class AudioEngine {
	private ctx = new AudioContext();
	private input = this.ctx.createGain();
	private bass = this.ctx.createBiquadFilter();
	private dry = this.ctx.createGain();
	private wet = this.ctx.createGain();
	private convolver = this.ctx.createConvolver();

	private buffer: AudioBuffer | null = null;
	private source: AudioBufferSourceNode | null = null;
	private pitch: SignalsmithStretchNode | null = null;
	private semitones = 0;
	private mix = 0;
	private boost = 0;
	private readonly ready: Promise<void>;

	private rate = 1;
	// Playhead bookkeeping: position = basePos + elapsed context time × rate.
	// basePos/baseTime are re-anchored on every play, seek and rate change,
	// so the math stays exact while the rate slider moves during playback.
	private basePos = 0;
	private baseTime = 0;
	private playing = false;

	onTrackEnd: (() => void) | null = null;

	constructor() {
		this.convolver.buffer = createImpulseResponse(this.ctx);
		this.bass.type = 'lowshelf';
		this.bass.frequency.value = 150;
		this.bass.gain.value = 0;
		this.input.connect(this.bass);
		this.bass.connect(this.dry);
		this.bass.connect(this.convolver);
		this.convolver.connect(this.wet);
		this.dry.connect(this.ctx.destination);
		this.wet.connect(this.ctx.destination);
		this.wet.gain.value = 0;
		this.ready = this.initPitch().catch(() => {
		});
	}

	private async initPitch(): Promise<void> {
		const node = await createSignalsmithStretchNode(this.ctx);
		// Live-input mode needs an active schedule segment before it
		// passes audio through.
		await node.schedule({ active: true, semitones: this.semitones });
		this.input.disconnect();
		this.input.connect(node);
		node.connect(this.bass);
		this.pitch = node;
	}

	async load(file: File): Promise<AudioBuffer> {
		await this.ready;
		const bytes = await file.arrayBuffer();
		const buffer = await this.ctx.decodeAudioData(bytes);
		this.stopSource();
		this.playing = false;
		this.buffer = buffer;
		this.basePos = 0;
		return buffer;
	}

	get duration(): number {
		return this.buffer?.duration ?? 0;
	}

	get isPlaying(): boolean {
		return this.playing;
	}

	position(): number {
		if (!this.playing) return this.basePos;
		const pos = this.basePos + (this.ctx.currentTime - this.baseTime) * this.rate;
		return Math.min(pos, this.duration);
	}

	async play(): Promise<void> {
		if (!this.buffer || this.playing) return;
		await this.ctx.resume();
		if (this.basePos >= this.duration - 0.01) this.basePos = 0;
		this.startSource(this.basePos);
		this.baseTime = this.ctx.currentTime;
		this.playing = true;
	}

	pause(): void {
		if (!this.playing) return;
		this.basePos = this.position();
		this.playing = false;
		this.stopSource();
	}

	/** Stops playback and drops the loaded track. Effect settings survive. */
	unload(): void {
		this.stopSource();
		this.playing = false;
		this.buffer = null;
		this.basePos = 0;
	}

	seek(pos: number): void {
		if (!this.buffer) return;
		this.basePos = Math.min(Math.max(pos, 0), this.duration);
		if (this.playing) {
			this.stopSource();
			this.startSource(this.basePos);
			this.baseTime = this.ctx.currentTime;
		}
	}

	setRate(rate: number): void {
		if (this.playing) {
			this.basePos = this.position();
			this.baseTime = this.ctx.currentTime;
		}
		this.rate = rate;
		if (this.source) this.source.playbackRate.value = rate;
	}

	/** Pitch shift in semitones, independent of speed. */
	setPitch(semitones: number): void {
		this.semitones = semitones;
		void this.pitch?.schedule({ semitones });
	}

	/** Low-shelf boost in dB, applied below ~150 Hz. */
	setBassBoost(db: number): void {
		this.boost = db;
		this.bass.gain.setTargetAtTime(db, this.ctx.currentTime, 0.02);
	}

	/** mix: 0 = dry only, 1 = full reverb. Smoothed to avoid zipper noise. */
	setReverb(mix: number): void {
		this.mix = mix;
		const t = this.ctx.currentTime;
		this.wet.gain.setTargetAtTime(mix, t, 0.02);
		this.dry.gain.setTargetAtTime(1 - 0.3 * mix, t, 0.02);
	}

	/**
	 * Renders the loaded track offline with the current speed, pitch, bass
	 * and reverb settings. Returns the rendered buffer plus how many leading
	 * seconds are pitch-shifter lead-in (to be trimmed by the encoder) and
	 * how many seconds of real audio follow.
	 */
	private async renderOffline(): Promise<{
		buffer: AudioBuffer
		skipSeconds: number
		keepSeconds: number
	}> {
		if (!this.buffer) throw new Error('No track loaded');
		const sampleRate = this.ctx.sampleRate;
		const tailSeconds = 3;
		const keepSeconds = this.buffer.duration / this.rate + tailSeconds;
		const offline = new OfflineAudioContext(
			2,
			Math.ceil((keepSeconds + 1) * sampleRate),
			sampleRate,
		);

		const source = offline.createBufferSource();
		source.buffer = this.buffer;
		source.playbackRate.value = this.rate;

		const bass = offline.createBiquadFilter();
		bass.type = 'lowshelf';
		bass.frequency.value = 150;
		bass.gain.value = this.boost;

		const dry = offline.createGain();
		const wet = offline.createGain();
		const convolver = offline.createConvolver();
		convolver.buffer = createImpulseResponse(offline);
		dry.gain.value = 1 - 0.3 * this.mix;
		wet.gain.value = this.mix;
		bass.connect(dry);
		bass.connect(convolver);
		convolver.connect(wet);
		dry.connect(offline.destination);
		wet.connect(offline.destination);

		// The stretch node delays everything by its latency; rendering keeps
		// that lead-in and the encoder trims it so the file starts on time.
		let skipSeconds = 0;
		if (this.semitones !== 0) {
			const stretch = await createSignalsmithStretchNode(offline);
			await stretch.schedule({ active: true, semitones: this.semitones });
			skipSeconds = await stretch.latency();
			source.connect(stretch);
			stretch.connect(bass);
		} else {
			source.connect(bass);
		}

		source.start(0);
		const buffer = await offline.startRendering();
		return { buffer, skipSeconds, keepSeconds };
	}

	/** Renders the current mix and returns it as a 16-bit WAV blob. */
	async exportWav(): Promise<Blob> {
		const { buffer, skipSeconds, keepSeconds } = await this.renderOffline();
		return encodeWav(buffer, skipSeconds, keepSeconds);
	}

	/** Renders the current mix and returns it as an MP3 blob. */
	async exportMp3(kbps = 192): Promise<Blob> {
		const { buffer, skipSeconds, keepSeconds } = await this.renderOffline();
		return encodeMp3(buffer, skipSeconds, keepSeconds, kbps);
	}

	private startSource(offset: number): void {
		const source = this.ctx.createBufferSource();
		source.buffer = this.buffer;
		source.playbackRate.value = this.rate;
		source.connect(this.input);
		source.onended = () => {
			// Manual stops null out this.source first; only a natural end passes.
			if (this.source !== source) return;
			this.source = null;
			this.playing = false;
			this.basePos = this.duration;
			this.onTrackEnd?.();
		};
		source.start(0, offset);
		this.source = source;
	}

	private stopSource(): void {
		const source = this.source;
		if (!source) return;
		this.source = null;
		try {
			source.stop();
		} catch {
			// already stopped
		}
		source.disconnect();
	}
}