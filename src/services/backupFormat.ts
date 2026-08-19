import { BACKUP_VERSION } from '../constants';
import type { BoardData } from '../types';
import {
	findImportedBoardDuplicateId,
	migrateImportedBoardData,
	type ImportedBoardDuplicateId,
} from './boardMigration';

type BackupSourceVersion = 'legacy' | '2.0' | typeof BACKUP_VERSION;
type BackupFailureReason =
	| 'newer-version'
	| 'unsupported-version'
	| 'invalid-version'
	| 'version-mismatch'
	| 'duplicate-id'
	| 'invalid-format';

export type BackupParseResult =
	| { ok: true; board: BoardData; sourceVersion: BackupSourceVersion }
	| {
			ok: false;
			reason: BackupFailureReason;
			declaredVersion?: unknown;
			duplicate?: ImportedBoardDuplicateId;
	  };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compareBackupVersions(left: string, right: string): number | null {
	const leftMatch = /^(\d+)\.(\d+)$/.exec(left);
	const rightMatch = /^(\d+)\.(\d+)$/.exec(right);
	if (!leftMatch || !rightMatch) return null;
	const leftParts = [Number(leftMatch[1]), Number(leftMatch[2])];
	const rightParts = [Number(rightMatch[1]), Number(rightMatch[2])];
	for (let index = 0; index < leftParts.length; index += 1) {
		const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}

function matchesDeclaredShape(
	data: UnknownRecord,
	version: '2.0' | typeof BACKUP_VERSION,
): boolean {
	if (version === '2.0') {
		return (
			isRecord(data['work']) &&
			isRecord(data['personal']) &&
			!Array.isArray(data['views']) &&
			!Array.isArray(data['columns'])
		);
	}
	return (
		Array.isArray(data['views']) &&
		isRecord(data['archives']) &&
		data['work'] === undefined &&
		data['personal'] === undefined &&
		!Array.isArray(data['columns'])
	);
}

/** 校验备份声明版本、真实结构和实体身份后，再迁移为当前看板结构。 */
export function parseBackupData(raw: unknown): BackupParseResult {
	if (!isRecord(raw)) return { ok: false, reason: 'invalid-format' };

	let sourceVersion: BackupSourceVersion = 'legacy';
	const declaredVersion = raw['version'];
	if (declaredVersion !== undefined) {
		if (typeof declaredVersion !== 'string') {
			return { ok: false, reason: 'invalid-version', declaredVersion };
		}
		const comparison = compareBackupVersions(declaredVersion, BACKUP_VERSION);
		if (comparison === null) {
			return { ok: false, reason: 'invalid-version', declaredVersion };
		}
		if (comparison > 0) {
			return { ok: false, reason: 'newer-version', declaredVersion };
		}
		if (declaredVersion !== '2.0' && declaredVersion !== BACKUP_VERSION) {
			return { ok: false, reason: 'unsupported-version', declaredVersion };
		}
		if (!matchesDeclaredShape(raw, declaredVersion)) {
			return { ok: false, reason: 'version-mismatch', declaredVersion };
		}
		sourceVersion = declaredVersion;
	}

	const duplicate = findImportedBoardDuplicateId(raw);
	if (duplicate) return { ok: false, reason: 'duplicate-id', duplicate };
	const board = migrateImportedBoardData(raw);
	if (!board) return { ok: false, reason: 'invalid-format' };
	return { ok: true, board, sourceVersion };
}
