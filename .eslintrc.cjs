module.exports = {
	root: true,
	ignorePatterns: [
		'node_modules/',
		'main.js',
		'dist/',
		'release-artifacts/',
		'coverage/',
		'.cache/',
	],
	env: {
		browser: true,
		es2021: true,
	},
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 'latest',
		sourceType: 'module',
	},
	plugins: ['@typescript-eslint'],
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
	overrides: [
		{
			files: ['*.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
			env: {
				browser: false,
				node: true,
			},
		},
		{
			files: ['tests/**/*.mjs'],
			rules: {
				'@typescript-eslint/no-empty-function': 'off',
				'@typescript-eslint/no-this-alias': 'off',
			},
		},
	],
};
