import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
	{
		ignores: [
			'node_modules/',
			'main.js',
			'dist/',
			'audit-output/',
			'release-artifacts/',
			'coverage/',
			'test-bundles/',
			'.cache/',
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.ts'],
		extends: obsidianmd.configs.recommended,
		languageOptions: {
			globals: globals.browser,
			parserOptions: {
				project: './tsconfig.json',
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ['*.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
		languageOptions: {
			globals: globals.node,
		},
	},
	{
		files: ['tests/**/*.mjs'],
		rules: {
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/no-this-alias': 'off',
		},
	},
	eslintConfigPrettier,
]);
