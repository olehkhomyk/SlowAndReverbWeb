import { useEffect, useRef, useState } from 'react';
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
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	// Typed values can land outside [min, max]; the track only ever draws
	// a clamped position so the cap/fill just pin to the edge instead of
	// breaking the geometry. Dragging or the keyboard resumes from here,
	// so the fader snaps back into range the moment it's touched.
	const clamped = clamp(value, min, max);
	const ratio = (v: number) => (v - min) / (max - min);

	const valueFromPointer = (clientX: number): number => {
		const rect = trackRef.current!.getBoundingClientRect();
		const r = clamp((clientX - rect.left) / rect.width, 0, 1);
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
		onChange(valueFromPointer(e.clientX));
	};

	const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
		if (!dragging.current) return;
		// If the button was released where we couldn't see it (capture lost,
		// pointer left the window), stop following the cursor.
		if (e.buttons === 0) {
			dragging.current = false;
			return;
		}
		onChange(valueFromPointer(e.clientX));
	};

	const endDrag = () => {
		dragging.current = false;
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		let next: number | null = null;
		if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = clamped + step;
		else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = clamped - step;
		else if (e.key === 'PageUp') next = clamped + step * 10;
		else if (e.key === 'PageDown') next = clamped - step * 10;
		else if (e.key === 'Home') next = min;
		else if (e.key === 'End') next = max;
		if (next === null) return;
		e.preventDefault();
		onChange(clamp(Math.round(next / step) * step, min, max));
	};

	const startEditing = () => {
		setDraft(String(clamped));
		setEditing(true);
	};

	const commitDraft = () => {
		const parsed = Number(draft);
		if (Number.isFinite(parsed)) onChange(clamp(parsed, min, max));
		setEditing(false);
	};

	useEffect(() => {
		if (editing) inputRef.current?.select();
	}, [editing]);

	// The fill spans from the detent to the current value (like a pitch
	// fader), or from the start when there is no detent.
	const fillFrom = ratio(detent ?? min);
	const fillTo = ratio(clamped);
	const fillLeft = Math.min(fillFrom, fillTo) * 100;
	const fillWidth = Math.abs(fillTo - fillFrom) * 100;

	return (
		<div className="fader" style={{ '--fader-accent': accent } as CSSProperties}>
			<span className="fader-label">{label}</span>
			<div
				ref={trackRef}
				className="fader-track"
				role="slider"
				tabIndex={0}
				aria-label={label}
				aria-orientation="horizontal"
				aria-valuemin={min}
				aria-valuemax={max}
				aria-valuenow={clamped}
				aria-valuetext={format(clamped)}
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
					style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
				/>
				{ticks.map((t) => (
					<span
						key={t}
						className="fader-tick"
						data-detent={t === detent || undefined}
						style={{ left: `${ratio(t) * 100}%` }}
					/>
				))}
				<div
					className="fader-cap"
					style={{ left: `calc(${ratio(clamped) * 100}% - 10px)` }}
				/>
			</div>
			{editing ? (
				<input
					ref={inputRef}
					className="fader-input"
					type="text"
					inputMode="decimal"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={commitDraft}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							commitDraft();
						} else if (e.key === 'Escape') {
							e.preventDefault();
							setEditing(false);
						}
					}}
				/>
			) : (
				<output
					className="fader-value"
					tabIndex={0}
					title="Click to type a value"
					onClick={startEditing}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							startEditing();
						}
					}}
				>
					{format(clamped)}
				</output>
			)}
		</div>
	);
}
