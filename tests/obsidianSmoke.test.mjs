import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runInstalledObsidianSmoke, runObsidianSmoke } from '../scripts/obsidian-smoke.mjs';

const manifest = { id: 'aulyckanban', version: '2.1.10' };

function createRunner(overrides = {}) {
	const calls = [];
	const outputs = {
		'dev:errors clear': 'Cleared 0 errors.\n',
		'plugin:reload id=aulyckanban': 'Reloaded: aulyckanban\n',
		'plugin id=aulyckanban': [
			'type\tcommunity',
			'name\taulycKanban',
			'version\t2.1.10',
			'enabled\ttrue',
		].join('\n'),
		'commands filter=aulyckanban': 'aulyckanban:open-board\n',
		'command id=aulyckanban:open-board': 'Executed: aulyckanban:open-board\n',
		'dev:dom selector=.aulyckanban-kanban-container total': '1\n',
		'dev:errors': 'No errors captured.\n',
		...overrides,
	};

	return {
		calls,
		runner(command, args) {
			calls.push([command, ...args]);
			const key = args.filter((arg) => !arg.startsWith('vault=')).join(' ');
			return { status: 0, stdout: outputs[key] ?? '', stderr: '' };
		},
	};
}

test('runs the Obsidian smoke flow against an explicitly selected vault', () => {
	const { calls, runner } = createRunner();
	const result = runObsidianSmoke({
		manifest,
		runner,
		vaultName: 'Test Vault',
		log: () => {},
	});

	assert.deepEqual(result, {
		pluginId: 'aulyckanban',
		version: '2.1.10',
		renderedCount: 1,
	});
	assert.equal(calls.length, 7);
	for (const call of calls) {
		assert.equal(call[0], 'obsidian');
		assert.equal(call.at(-1), 'vault=Test Vault');
	}
});

test('reports a missing Obsidian CLI with an actionable error', () => {
	const runner = () => ({
		status: null,
		stdout: '',
		stderr: '',
		error: Object.assign(new Error('spawn obsidian ENOENT'), { code: 'ENOENT' }),
	});

	assert.throws(
		() => runObsidianSmoke({ manifest, runner, log: () => {} }),
		/Obsidian CLI not found: obsidian/,
	);
});

test('rejects an installed plugin version that differs from the repository manifest', () => {
	const { runner } = createRunner({
		'plugin id=aulyckanban': 'version\t2.1.9\nenabled\ttrue\n',
	});

	assert.throws(
		() => runObsidianSmoke({ manifest, runner, log: () => {} }),
		/Installed plugin version mismatch: expected 2\.1\.10, got 2\.1\.9/,
	);
});

test('fails when Obsidian captures a runtime error', () => {
	const { runner } = createRunner({
		'dev:errors': 'TypeError: failed to render board\n',
	});

	assert.throws(
		() => runObsidianSmoke({ manifest, runner, log: () => {} }),
		/Obsidian captured runtime errors:[\s\S]*failed to render board/,
	);
});

test('post-install smoke derives expected identity from the actual installed manifest', () => {
	const vaultPath = mkdtempSync(path.join(os.tmpdir(), 'aulycKanban-smoke-vault-'));
	const manifestPath = path.join(vaultPath, '.obsidian', 'plugins', 'aulyckanban', 'manifest.json');
	try {
		mkdirSync(path.dirname(manifestPath), { recursive: true });
		writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
		const { calls, runner } = createRunner();
		const result = runInstalledObsidianSmoke({
			manifestPath,
			runner,
			vaultName: 'Fixture Vault',
			log: () => {},
		});
		assert.equal(result.version, '2.1.10');
		assert.equal(calls.length, 7);
		assert.ok(calls.every((call) => call.at(-1) === 'vault=Fixture Vault'));
	} finally {
		rmSync(vaultPath, { recursive: true, force: true });
	}
});
