import type { BoardData, PluginSettings, PluginData } from '../types';
import { DEFAULT_SETTINGS, getDefaultBoardData, CURRENT_SCHEMA_VERSION } from '../constants';

/**
 * 数据仓储层
 * 负责数据读取、写入、格式迁移
 */

/** 数据仓储接口 */
export interface IBoardRepository {
	load(): Promise<{ settings: PluginSettings; board: BoardData }>;
	save(settings: PluginSettings, board: BoardData): Promise<void>;
}

/**
 * 基于 Obsidian Plugin.loadData/saveData 的仓储实现
 */
export class PluginDataRepository implements IBoardRepository {
	private loadDataFn: () => Promise<unknown>;
	private saveDataFn: (data: PluginData) => Promise<void>;

	constructor(
		loadDataFn: () => Promise<unknown>,
		saveDataFn: (data: PluginData) => Promise<void>,
	) {
		this.loadDataFn = loadDataFn;
		this.saveDataFn = saveDataFn;
	}

	async load(): Promise<{ settings: PluginSettings; board: BoardData }> {
		const raw = await this.loadDataFn();

		if (!raw || typeof raw !== 'object') {
			return {
				settings: { ...DEFAULT_SETTINGS },
				board: getDefaultBoardData(),
			};
		}

		const data = raw as Record<string, unknown>;

		// 解析设置
		const settings: PluginSettings = data['settings']
			? { ...DEFAULT_SETTINGS, ...(data['settings'] as Partial<PluginSettings>) }
			: { ...DEFAULT_SETTINGS };

		// 解析看板数据（含旧格式迁移）
		const board = this.migrateBoardData(data['board']);

		// 更新 schema 版本
		settings.schemaVersion = CURRENT_SCHEMA_VERSION;

		return { settings, board };
	}

	async save(settings: PluginSettings, board: BoardData): Promise<void> {
		await this.saveDataFn({ settings, board });
	}

	/**
	 * 迁移旧版看板数据格式
	 *
	 * 支持的格式：
	 * 1. 新格式 { work: ViewData, personal: ViewData }
	 * 2. 旧格式 { columns: Column[] }（思源插件单视图，迁移到 work）
	 * 3. 空/无效 -> 返回默认
	 */
	private migrateBoardData(raw: unknown): BoardData {
		if (!raw || typeof raw !== 'object') {
			return getDefaultBoardData();
		}

		const obj = raw as Record<string, unknown>;

		// 新格式：双视图
		if (obj['work'] && obj['personal']) {
			return raw as BoardData;
		}

		// 旧格式：单视图 columns 数组（迁移到 work）
		if (Array.isArray(obj['columns'])) {
			return {
				work: { columns: obj['columns'] as BoardData['work']['columns'] },
				personal: getDefaultBoardData().personal,
			};
		}

		return getDefaultBoardData();
	}
}
