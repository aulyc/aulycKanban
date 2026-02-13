import { ItemView, Plugin, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_KANBAN, DEFAULT_SETTINGS, getDefaultBoardData } from './constants';
import { initI18n, t } from './i18n';
import type { PluginData, PluginSettings, BoardData } from './types';
import { KanbanView } from './ui/KanbanView';
import { KanbanSettingTab } from './ui/KanbanSettingTab';
import { KanbanStore } from './store';
import { VaultSyncService } from './services/syncService';

export default class KanbanPlugin extends Plugin {
	store: KanbanStore;
	syncService: VaultSyncService;

	async onload(): Promise<void> {
		// 初始化国际化
		initI18n(this.getLocale());

		// 加载持久化数据
		const savedData = await this.loadData() as PluginData | null;
		const settings: PluginSettings = savedData?.settings
			? { ...DEFAULT_SETTINGS, ...savedData.settings }
			: { ...DEFAULT_SETTINGS };
		const board: BoardData = savedData?.board
			? this.migrateBoardData(savedData.board as unknown as Record<string, unknown>)
			: getDefaultBoardData();

		// 初始化 Store
		this.store = new KanbanStore(settings, board, this);

		// 初始化同步服务
		this.syncService = new VaultSyncService(this.app.vault, this.store);

		// 只在数据真正变更时才同步 md（切换视图等 UI 操作不触发）
		this.store.subscribe(() => {
			if (!this.store.lastActionMutatedData) return;

			const syncSettings = this.store.getSettings();
			const currentView = syncSettings.currentView;
			if (syncSettings[currentView].filePath) {
				this.syncService.scheduleSyncCurrentView();
			}
		});

		// 注册自定义视图
		this.registerView(
			VIEW_TYPE_KANBAN,
			(leaf: WorkspaceLeaf) => new KanbanView(leaf, this),
		);

		// 添加 Ribbon 图标（左侧栏）
		this.addRibbonIcon('kanban', t('plugin.ribbonTip'), () => {
			this.activateView();
		});

		// 注册命令（不设默认快捷键，遵守 Obsidian 规范）
		this.addCommand({
			id: 'open-board',
			name: t('command.openBoard'),
			callback: () => {
				this.activateView();
			},
		});

		this.addCommand({
			id: 'focus-work',
			name: t('command.focusWork'),
			callback: async () => {
				await this.activateView();
				this.store.dispatch({ type: 'SWITCH_VIEW', payload: { view: 'work' } });
			},
		});

		this.addCommand({
			id: 'focus-personal',
			name: t('command.focusPersonal'),
			callback: async () => {
				await this.activateView();
				this.store.dispatch({ type: 'SWITCH_VIEW', payload: { view: 'personal' } });
			},
		});

		// 注册设置页
		this.addSettingTab(new KanbanSettingTab(this.app, this));
	}

	onunload(): void {
		// 先销毁 store（清除所有订阅者，防止视图关闭时触发回调连锁反应）
		if (this.store) {
			this.store.destroy();
		}
		// 再清理同步定时器
		if (this.syncService) {
			this.syncService.flush();
		}
	}

	/**
	 * 获取当前 Obsidian 语言环境
	 */
	private getLocale(): string {
		const locale = window.localStorage.getItem('language');
		return locale ?? 'en';
	}

	/**
	 * 激活看板视图
	 * 遵守规范：不缓存 view 引用，通过 getLeavesOfType 获取
	 */
	async activateView(): Promise<void> {
		try {
			const { workspace } = this.app;

			let leaf: WorkspaceLeaf | null = null;
			const leaves = workspace.getLeavesOfType(VIEW_TYPE_KANBAN);

			if (leaves.length > 0) {
				leaf = leaves[0] ?? null;
			} else {
				// 尝试在右侧栏创建
				leaf = workspace.getRightLeaf(false);
				if (!leaf) {
					// 备用：在新标签页创建
					leaf = workspace.getLeaf('tab');
				}
				if (leaf) {
					await leaf.setViewState({
						type: VIEW_TYPE_KANBAN,
						active: true,
					});
				}
			}

			if (leaf) {
				workspace.revealLeaf(leaf);
			}
		} catch (error) {
			console.error('[X-aulyc Kanban] Failed to activate view:', error);
		}
	}

	/**
	 * 持久化数据到磁盘
	 */
	async persistData(): Promise<void> {
		const data: PluginData = {
			settings: this.store.getSettings(),
			board: this.store.getBoardData(),
		};
		await this.saveData(data);
	}

	/**
	 * 迁移旧版看板数据格式
	 */
	private migrateBoardData(raw: Record<string, unknown>): BoardData {
		if (raw['work'] && raw['personal']) {
			return raw as unknown as BoardData;
		}

		if (Array.isArray(raw['columns'])) {
			return {
				work: { columns: raw['columns'] as BoardData['work']['columns'] },
				personal: getDefaultBoardData().personal,
			};
		}

		return getDefaultBoardData();
	}
}
