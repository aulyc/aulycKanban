import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SELECTOR = '.aulyckanban-kanban-container';

function normalizeOutput(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function getInfoField(output, field) {
	const line = output
		.split(/\r?\n/u)
		.find((candidate) => candidate.split(/\s+/u, 1)[0] === field);
	return line ? line.slice(field.length).trim() : '';
}

function formatFailure(label, result) {
	const detail = normalizeOutput(result.stderr) || normalizeOutput(result.stdout);
	const exitCode = result.status ?? 'unknown';
	return `[smoke] ${label} failed (exit ${exitCode})${detail ? `: ${detail}` : ''}`;
}

export function runObsidianSmoke({
	manifest,
	runner = spawnSync,
	cli = process.env.OBSIDIAN_CLI?.trim() || 'obsidian',
	vaultName = process.env.OBSIDIAN_VAULT_NAME?.trim() || '',
	selector = DEFAULT_SELECTOR,
	log = console.log,
} = {}) {
	if (!manifest || typeof manifest.id !== 'string' || typeof manifest.version !== 'string') {
		throw new Error('[smoke] manifest.json must contain string id and version fields');
	}

	const pluginId = manifest.id;
	const expectedVersion = manifest.version;
	const commandId = `${pluginId}:open-board`;
	const vaultArgs = vaultName ? [`vault=${vaultName}`] : [];

	const run = (label, args) => {
		const fullArgs = [...vaultArgs, ...args];
		const result = runner(cli, fullArgs, { encoding: 'utf8' });

		if (result.error?.code === 'ENOENT') {
			throw new Error(`[smoke] Obsidian CLI not found: ${cli}`);
		}
		if (result.error) {
			throw new Error(`[smoke] ${label} failed: ${result.error.message}`);
		}
		if (result.status !== 0) {
			throw new Error(formatFailure(label, result));
		}

		const output = normalizeOutput(result.stdout);
		log(`[smoke] ${label}: ${output || 'ok'}`);
		return output;
	};

	run('clear error buffer', ['dev:errors', 'clear']);
	run('reload plugin', ['plugin:reload', `id=${pluginId}`]);

	const pluginInfo = run('read plugin info', ['plugin', `id=${pluginId}`]);
	const actualVersion = getInfoField(pluginInfo, 'version');
	const enabled = getInfoField(pluginInfo, 'enabled');
	if (actualVersion !== expectedVersion) {
		throw new Error(
			`[smoke] Installed plugin version mismatch: expected ${expectedVersion}, got ${actualVersion || 'unknown'}`,
		);
	}
	if (enabled !== 'true') {
		throw new Error(`[smoke] Plugin is not enabled: ${pluginId}`);
	}

	const commands = run('list plugin commands', ['commands', `filter=${pluginId}`]);
	if (!commands.split(/\r?\n/u).includes(commandId)) {
		throw new Error(`[smoke] Plugin command is not registered: ${commandId}`);
	}

	run('open board', ['command', `id=${commandId}`]);
	const renderedCountOutput = run('query board DOM', [
		'dev:dom',
		`selector=${selector}`,
		'total',
	]);
	const renderedCount = Number.parseInt(renderedCountOutput, 10);
	if (!Number.isInteger(renderedCount) || renderedCount < 1) {
		throw new Error(`[smoke] Board DOM did not render: ${selector}`);
	}

	const errors = run('check runtime errors', ['dev:errors']);
	if (errors !== 'No errors captured.') {
		throw new Error(`[smoke] Obsidian captured runtime errors:\n${errors || '(empty output)'}`);
	}

	log(`[smoke] Passed ${pluginId} ${expectedVersion} with ${renderedCount} rendered board root(s)`);
	return { pluginId, version: expectedVersion, renderedCount };
}

function main() {
	const manifest = JSON.parse(readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
	runObsidianSmoke({ manifest });
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
