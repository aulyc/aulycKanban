import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');

const manifestPath = path.join(rootDir, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const pluginId = manifest.id ?? 'plugin';

const filesToCopy = ['main.js', 'manifest.json', 'styles.css'];

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const fileName of filesToCopy) {
	const sourcePath = path.join(rootDir, fileName);
	const targetPath = path.join(distDir, fileName);
	await cp(sourcePath, targetPath);
}

console.log(
	`[dist] Generated ${path.relative(rootDir, distDir)} for ${manifest.name ?? pluginId} (plugin id: ${pluginId})`,
);
