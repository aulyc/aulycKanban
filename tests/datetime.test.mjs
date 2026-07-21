import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

const { formatDateTimeMinute, formatDateTimeMinuteParts } = await loadSourceModule(
	new URL('../src/utils/datetime.ts', import.meta.url),
	{
		label: 'datetime',
		mocks: {
			'../i18n': { getCurrentLocale: () => 'zh-CN' },
		},
	},
);

test('minute formatting composes locale-safe date and time parts on one line', () => {
	const value = '2026-07-13T12:00:00';
	const parts = formatDateTimeMinuteParts(value);

	assert.ok(parts.date);
	assert.ok(parts.time);
	assert.equal(formatDateTimeMinute(value), `${parts.date} ${parts.time}`);
});

test('invalid minute formatting returns empty date and time parts', () => {
	assert.deepEqual(formatDateTimeMinuteParts('not-a-date'), { date: '', time: '' });
	assert.equal(formatDateTimeMinute('not-a-date'), '');
});
