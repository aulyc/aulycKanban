import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
	{
		ignores: [
			'node_modules/',
			'main.js',
			'dist/',
			'audit-output/',
			'release-artifacts/',
			'coverage/',
			'.cache/',
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			globals: globals.browser,
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
];
