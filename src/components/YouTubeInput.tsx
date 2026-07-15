import { useState } from 'react';
import type { FormEvent } from 'react';
import { fetchYouTubeAudio } from '../api/youtube';

interface YouTubeInputProps {
	/** Called with the downloaded audio, ready for AudioEngine.load(). */
	onLoad: (file: File) => void | Promise<void>;
	disabled?: boolean;
}

export default function YouTubeInput({ onLoad, disabled }: YouTubeInputProps) {
	const [url, setUrl] = useState('');
	const [busy, setBusy] = useState(false);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState('');

	const submit = async (e: FormEvent) => {
		e.preventDefault();
		const trimmed = url.trim();
		if (!trimmed || busy) return;

		setBusy(true);
		setProgress(0);
		setError('');
		try {
			const file = await fetchYouTubeAudio(trimmed, setProgress);
			await onLoad(file);
			setUrl('');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not load that link');
		} finally {
			setBusy(false);
		}
	};

	return (
		<form className="yt-input" onSubmit={(e) => void submit(e)}>
			<input
				type="url"
				inputMode="url"
				placeholder="Paste a YouTube link…"
				value={url}
				disabled={disabled || busy}
				onChange={(e) => setUrl(e.target.value)}
			/>
			<button type="submit" className="load-button" disabled={disabled || busy || !url.trim()}>
				{busy ? `Fetching… ${progress}%` : 'Load'}
			</button>
			{busy && <progress className="yt-progress" value={progress} max={100} />}
			{error && <p className="load-error">{error}</p>}
		</form>
	);
}
