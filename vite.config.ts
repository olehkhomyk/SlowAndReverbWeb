import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Generates robots.txt and sitemap.xml from VITE_SITE_URL at build time so
// the canonical domain only ever has to be correct in one place (.env).
function siteFilesPlugin(siteUrl: string): Plugin {
	let outDir = 'dist'
	return {
		name: 'site-files',
		apply: 'build',
		configResolved(config) {
			outDir = config.build.outDir
		},
		closeBundle() {
			const dir = path.resolve(process.cwd(), outDir)
			fs.writeFileSync(
				path.join(dir, 'robots.txt'),
				`User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`,
			)
			fs.writeFileSync(
				path.join(dir, 'sitemap.xml'),
				`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${siteUrl}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`,
			)
		},
	}
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), 'VITE_')
	const siteUrl = env.VITE_SITE_URL ?? 'http://localhost:5173/'
	return {
		plugins: [react(), siteFilesPlugin(siteUrl)],
	}
})
