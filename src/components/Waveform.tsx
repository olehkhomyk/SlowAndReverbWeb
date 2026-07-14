import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';

interface WaveformProps {
	buffer: AudioBuffer;
	position: number;
	onSeek: (time: number) => void;
}

const BAR_WIDTH = 2;
const BAR_GAP = 2;
const COLUMN = BAR_WIDTH + BAR_GAP;

interface PeaksCache {
	buffer: AudioBuffer;
	columns: number;
	data: Float32Array;
}

function computePeaks(buffer: AudioBuffer, columns: number): Float32Array {
	const left = buffer.getChannelData(0);
	const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
	const peaks = new Float32Array(columns);
	const perColumn = left.length / columns;
	// Sample a bounded number of points per column so long tracks stay cheap.
	const stride = Math.max(1, Math.floor(perColumn / 60));
	let max = 0;
	for (let col = 0; col < columns; col++) {
		const start = Math.floor(col * perColumn);
		const end = Math.min(left.length, Math.floor((col + 1) * perColumn));
		let peak = 0;
		for (let i = start; i < end; i += stride) {
			const v = Math.max(Math.abs(left[i]), Math.abs(right[i]));
			if (v > peak) peak = v;
		}
		peaks[col] = peak;
		if (peak > max) max = peak;
	}
	if (max > 0) {
		for (let col = 0; col < columns; col++) peaks[col] /= max;
	}
	return peaks;
}

export default function Waveform({ buffer, position, onSeek }: WaveformProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const peaksRef = useRef<PeaksCache | null>(null);
	const scrubbing = useRef(false);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const draw = () => {
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			const width = canvas.clientWidth;
			const height = canvas.clientHeight;
			if (width === 0 || height === 0) return;
			const dpr = window.devicePixelRatio || 1;
			if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
				canvas.width = width * dpr;
				canvas.height = height * dpr;
			}
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, width, height);

			const columns = Math.max(1, Math.floor(width / COLUMN));
			let cache = peaksRef.current;
			if (!cache || cache.buffer !== buffer || cache.columns !== columns) {
				cache = { buffer, columns, data: computePeaks(buffer, columns) };
				peaksRef.current = cache;
			}

			const styles = getComputedStyle(canvas);
			const restColor = styles.getPropertyValue('--wave-rest').trim() || '#454052';
			const playedColor = styles.getPropertyValue('--amber').trim() || '#f0a43e';

			const playedX = (position / buffer.duration) * width;
			const mid = height / 2;
			for (let col = 0; col < columns; col++) {
				const x = col * COLUMN;
				const barHeight = Math.max(2, cache.data[col] * (height - 8));
				ctx.fillStyle = x + BAR_WIDTH / 2 <= playedX ? playedColor : restColor;
				ctx.fillRect(x, mid - barHeight / 2, BAR_WIDTH, barHeight);
			}

			ctx.fillStyle = playedColor;
			ctx.fillRect(Math.min(playedX, width - 1.5), 0, 1.5, height);
		};

		draw();
		const observer = new ResizeObserver(draw);
		observer.observe(canvas);
		return () => observer.disconnect();
	}, [buffer, position]);

	const seekFromPointer = (e: PointerEvent<HTMLCanvasElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		onSeek(ratio * buffer.duration);
	};

	return (
		<canvas
			ref={canvasRef}
			className="waveform"
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId);
				scrubbing.current = true;
				seekFromPointer(e);
			}}
			onPointerMove={(e) => {
				if (!scrubbing.current) return;
				if (e.buttons === 0) {
					scrubbing.current = false;
					return;
				}
				seekFromPointer(e);
			}}
			onPointerUp={() => {
				scrubbing.current = false;
			}}
			onPointerCancel={() => {
				scrubbing.current = false;
			}}
			onLostPointerCapture={() => {
				scrubbing.current = false;
			}}
		/>
	);
}