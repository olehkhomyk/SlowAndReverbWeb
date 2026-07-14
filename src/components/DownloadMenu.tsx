import { useEffect, useRef, useState } from 'react';

export type ExportFormat = 'wav' | 'mp3'

interface DownloadMenuProps {
	disabled: boolean;
	busy: boolean;
	onExport: (format: ExportFormat) => void;
}

const FORMATS: { format: ExportFormat; label: string; hint: string }[] = [
	{ format: 'wav', label: 'WAV', hint: 'lossless, larger file' },
	{ format: 'mp3', label: 'MP3', hint: '192 kbps, smaller file' },
];

export default function DownloadMenu({ disabled, busy, onExport }: DownloadMenuProps) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (e: PointerEvent) => {
			if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		window.addEventListener('pointerdown', onPointerDown);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('pointerdown', onPointerDown);
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [open]);

	return (
		<div className="download-menu" ref={rootRef}>
			<button
				className="load-button"
				disabled={disabled || busy}
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				{busy ? 'Rendering…' : 'Download'}
				<svg className="caret" viewBox="0 0 12 8" aria-hidden="true">
					<path d="M1 1.5 6 6l5-4.5"/>
				</svg>
			</button>
			{open && (
				<ul className="download-options" role="menu">
					{FORMATS.map(({ format, label, hint }) => (
						<li key={format} role="none">
							<button
								role="menuitem"
								onClick={() => {
									setOpen(false);
									onExport(format);
								}}
							>
								<span className="format-label">{label}</span>
								<span className="format-hint">{hint}</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
