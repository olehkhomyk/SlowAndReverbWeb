import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

const container = document.getElementById('root')!;

const tree = (
	<StrictMode>
		<App/>
	</StrictMode>
);

// The production build ships prerendered markup inside #root (see
// scripts/prerender.js), so attach to it instead of throwing it away.
// `npm run dev` serves an empty root, hence the fallback.
if (container.hasChildNodes()) {
	hydrateRoot(container, tree);
} else {
	createRoot(container).render(tree);
}
