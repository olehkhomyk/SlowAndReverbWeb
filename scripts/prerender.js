import { readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';

// Post-build step: render <App/> to HTML and bake it into dist/index.html.
//
// The client build has already run at this point, so dist/index.html exists
// with the hashed <script>/<link> tags. We build a second, SSR-only bundle,
// import its render(), and substitute the result into the empty root div.
// The client then hydrates that markup on load — no visual flash, and the
// served HTML carries the real text for crawlers.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ssrOutDir = resolve(root, '.ssr-tmp');
const indexPath = resolve(root, 'dist/index.html');

// A minimal DOM shim: Vite's client bundle imports CSS and the WASM glue,
// which sniff for `document` at module scope even though they don't use it
// during render. Providing the barest stand-ins keeps the import graph happy
// without pulling in a full jsdom.
globalThis.window ??= undefined;

async function main() {
	await build({
		root,
		logLevel: 'warn',
		build: {
			ssr: resolve(root, 'src/entry-server.tsx'),
			outDir: ssrOutDir,
			emptyOutDir: true,
			// Keep the CSS import from erroring in Node; we already have the
			// real stylesheet linked from the client build.
			cssCodeSplit: false,
		},
	});

	const { render } = await import(resolve(ssrOutDir, 'entry-server.js'));
	const appHtml = render();

	const template = await readFile(indexPath, 'utf8');
	if (!template.includes('<div id="root"></div>')) {
		throw new Error('prerender: could not find the empty root div in dist/index.html');
	}
	const html = template.replace(
		'<div id="root"></div>',
		`<div id="root">${appHtml}</div>`,
	);
	await writeFile(indexPath, html);
	await rm(ssrOutDir, { recursive: true, force: true });

	console.log(`prerender: injected ${appHtml.length} chars of HTML into dist/index.html`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
