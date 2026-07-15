import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const confirmModalSource = readFileSync(
	new URL('../src/ui/ConfirmModal.ts', import.meta.url),
	'utf8',
);

test('confirmation dialogs use the dedicated compact modal layout', () => {
	assert.match(confirmModalSource, /modalEl\.addClass\('aulyckanban-confirm-modal'\)/);

	const declarations = css.match(/\.modal\.aulyckanban-confirm-modal\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(declarations, /width:\s*min\(360px,\s*calc\(100vw\s*-\s*32px\)\)/);
	assert.match(declarations, /min-width:\s*0/);
	assert.match(declarations, /min-height:\s*0/);
});

test('compact sizing is isolated from the clear-data modal', () => {
	const clearDataModalSource = readFileSync(
		new URL('../src/ui/ClearDataModal.ts', import.meta.url),
		'utf8',
	);

	assert.doesNotMatch(clearDataModalSource, /aulyckanban-confirm-modal/);
});
