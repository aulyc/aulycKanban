import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const RELEASE_PROFILE = 'obsidian-plugin';
export const DISTRIBUTION = 'local-vault';
export const PLUGIN_ID = 'aulyckanban';
export const PRODUCT_NAME = 'aulycKanban';
export const RELEASE_ARTIFACT_BASENAME = 'aulycKanban';
export const LEGACY_ARTIFACT_BASENAME = 'aulyckanban';
export const LEGACY_ARTIFACT_MAX_VERSION = '2.3.5';
export const RELEASE_FILES = Object.freeze(['main.js', 'manifest.json', 'styles.css']);

export async function readJson(filePath) {
	return JSON.parse(await readFile(filePath, 'utf8'));
}

export function sha256Buffer(value) {
	return createHash('sha256').update(value).digest('hex');
}

export async function sha256File(filePath) {
	return sha256Buffer(await readFile(filePath));
}

export function assertExactKeys(value, expectedKeys, label) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	const actual = Object.keys(value).sort();
	const expected = [...expectedKeys].sort();
	if (actual.join('\0') !== expected.join('\0')) {
		throw new Error(`${label} contains unexpected or missing fields`);
	}
}
