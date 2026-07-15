// Client for the youtube-downloader-api backend.
//
// In dev, requests go to a relative path that Vite proxies to the backend
// (see vite.config.ts), so no CORS is involved. In production, point
// VITE_API_BASE at the deployed backend origin.

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

interface JobView {
	id: string;
	status: JobStatus;
	progress: number;
	kind: 'audio' | 'video';
	downloadUrl?: string;
	fileName?: string;
	error?: string;
}

const POLL_INTERVAL_MS = 800;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Downloads a YouTube URL as audio via the backend job API and returns it as a
 * File, ready to hand to AudioEngine.load(). Reports 0–100 progress while it runs.
 */
export async function fetchYouTubeAudio(
	url: string,
	onProgress?: (percent: number) => void,
	signal?: AbortSignal,
): Promise<File> {
	const created = await fetch(`${API_BASE}/api/jobs`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ url, format: 'audio' }),
		signal: signal ?? null,
	});
	const job = (await created.json()) as JobView;
	if (!created.ok) throw new Error(job.error ?? 'Could not start download');

	const finished = await pollUntilDone(job.id, onProgress, signal);

	if (!finished.downloadUrl) throw new Error('Download finished without a file');
	const fileRes = await fetch(`${API_BASE}${finished.downloadUrl}`, {
		signal: signal ?? null,
	});
	if (!fileRes.ok) throw new Error('Could not fetch the audio file');

	const blob = await fileRes.blob();
	const name = finished.fileName ?? 'youtube-audio.mp3';
	return new File([blob], name, { type: blob.type || 'audio/mpeg' });
}

async function pollUntilDone(
	id: string,
	onProgress?: (percent: number) => void,
	signal?: AbortSignal,
): Promise<JobView> {
	for (;;) {
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

		const res = await fetch(`${API_BASE}/api/jobs/${id}`, { signal: signal ?? null });
		const job = (await res.json()) as JobView;
		if (!res.ok) throw new Error(job.error ?? 'Lost track of the download');

		onProgress?.(job.progress);

		if (job.status === 'completed') return job;
		if (job.status === 'failed') throw new Error(job.error ?? 'Could not process this video');

		await sleep(POLL_INTERVAL_MS);
	}
}
