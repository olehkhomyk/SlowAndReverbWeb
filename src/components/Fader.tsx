import { useRef } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';

interface FaderProps {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	/** Value the fader snaps to when dragged nearby (e.g. ×1.00 on speed). */
	detent?: number;
	ticks?: number[];
	accent: string;
	format: (value: number) => string;
	onChange: (value: number) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function Fader({
	                              label,
	                              value,
	                              min,
	                              max,
	                              step,
	                              detent,
	                              ticks = [],
	                              accent,
	                              format,
	                              onChange,
                              }: FaderProps) {
	const trackRef = useRef<HTMLDivElement>(null);
	const dragging = useRef(false);

	const ratio = (v: number) => (v - min) / (max - min);

	const valueFromPointer = (clientY: number): number => {
		const rect = trackRef.current!.getBoundingClientRect();
		const r = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
		let v = min + r * (max - min);
		if (detent !== undefined && Math.abs(v - detent) < (max - min) * 0.03) {
			v = detent;
		}
		return clamp(Math.round(v / step) * step, min, max);
	};

	const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		e.currentTarget.focus();
		dragging.current = true;
		onChange(valueFromPointer(e.clientY));
	};

	const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
		if (!dragging.current) return;
		// If the button was released where we couldn't see it (capture lost,
		// pointer left the window), stop following the cursor.
		if (e.buttons === 0) {
			dragging.current = false;
			return;
		}
		onChange(valueFromPointer(e.clientY));
	};

	const endDrag = () => {
		dragging.current = false;
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		let next: number | null = null;
		if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = value + step;
		else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = value - step;
		else if (e.key === 'PageUp') next = value + step * 10;
		else if (e.key === 'PageDown') next = value - step * 10;
		else if (e.key === 'Home') next = min;
		else if (e.key === 'End') next = max;
		if (next === null) return;
		e.preventDefault();
		onChange(clamp(Math.round(next / step) * step, min, max));
	};

	// The fill shows deviation from the detent (like a pitch fader),
	// or level from the bottom when there is no detent.
	const fillFrom = ratio(detent ?? min);
	const fillTo = ratio(value);
	const fillBottom = Math.min(fillFrom, fillTo) * 100;
	const fillHeight = Math.abs(fillTo - fillFrom) * 100;

	return (
		<div className="fader" style={{ '--fader-accent': accent } as CSSProperties}>
			<span className="fader-label">{label}</span>
			<div
				ref={trackRef}
				className="fader-track"
				role="slider"
				tabIndex={0}
				aria-label={label}
				aria-orientation="vertical"
				aria-valuemin={min}
				aria-valuemax={max}
				aria-valuenow={value}
				aria-valuetext={format(value)}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
				onLostPointerCapture={endDrag}
				onKeyDown={handleKeyDown}
			>
				<div className="fader-rail"/>
				<div
					className="fader-fill"
					style={{ bottom: `${fillBottom}%`, height: `${fillHeight}%` }}
				/>
				{ticks.map((t) => (
					<span
						key={t}
						className="fader-tick"
						data-detent={t === detent || undefined}
						style={{ bottom: `${ratio(t) * 100}%` }}
					/>
				))}
				<div
					className="fader-cap"
					style={{ bottom: `calc(${ratio(value) * 100}% - 10px)` }}
				/>
			</div>
			<output className="fader-value">{format(value)}</output>
		</div>
	);
}