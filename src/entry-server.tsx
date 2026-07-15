import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';

/**
 * Build-time prerender entry. Rendered by scripts/prerender.js into a plain
 * HTML string that gets baked into dist/index.html, so crawlers (and users
 * with JS disabled) see the real page instead of an empty <div id="root">.
 *
 * Nothing here may touch browser-only APIs. The app is already safe for this:
 * AudioContext is constructed lazily inside AudioEngine, which is only
 * instantiated on a user gesture (file drop / picker), and every window,
 * canvas and matchMedia access lives inside useEffect, which React does not
 * run during renderToString. The initial state has no track loaded, so what
 * gets prerendered is the landing view — headline, drop zone, faders, and the
 * about copy — which is exactly the content worth indexing.
 */
export function render(): string {
	return renderToString(
		<StrictMode>
			<App/>
		</StrictMode>,
	);
}
