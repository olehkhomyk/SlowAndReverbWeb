/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** Base URL of the youtube-downloader-api backend. Empty = same origin (Vite proxy). */
	readonly VITE_API_BASE?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
