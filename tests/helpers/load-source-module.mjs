import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const repoDir = fileURLToPath(new URL('../../', import.meta.url));
const bundleDir = path.join(repoDir, 'test-bundles');
let bundleSequence = 0;

export async function loadSourceModule(entryPoint, { label = 'source', mocks = {} } = {}) {
	const entryPath =
		entryPoint instanceof URL ? fileURLToPath(entryPoint) : path.resolve(repoDir, entryPoint);
	const safeLabel = label.replaceAll(/[^a-z0-9_-]/giu, '-');
	const outfile = path.join(bundleDir, `${safeLabel}-${process.pid}-${bundleSequence++}.cjs`);
	const mockedIds = new Set(Object.keys(mocks));
	await mkdir(bundleDir, { recursive: true });
	await build({
		entryPoints: [entryPath],
		bundle: true,
		format: 'cjs',
		platform: 'node',
		outfile,
		logLevel: 'silent',
		sourcemap: 'inline',
		sourcesContent: true,
		plugins:
			mockedIds.size === 0
				? []
				: [
						{
							name: 'test-module-mocks',
							setup(context) {
								context.onResolve({ filter: /.*/ }, (args) =>
									mockedIds.has(args.path) ? { path: args.path, external: true } : null,
								);
							},
						},
					],
	});

	const originalLoad = Module._load;
	Module._load = function loadWithMocks(request, parent, isMain) {
		if (mockedIds.has(request)) return mocks[request];
		return originalLoad.call(this, request, parent, isMain);
	};
	try {
		delete require.cache[outfile];
		return require(outfile);
	} finally {
		Module._load = originalLoad;
	}
}
