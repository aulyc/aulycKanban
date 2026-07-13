import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_KANBAN } from './constants';
import { initI18n, t } from './i18n';
import { KanbanView } from './ui/KanbanView';
import { KanbanSettingTab } from './ui/KanbanSettingTab';
import { KanbanStore } from './store';
import { VaultSyncService } from './services/syncService';
import { PluginDataRepository } from './services/repository';
import type { ActionType } from './types';

/** 会同时影响全部任务类型的操作 */
const MULTI_VIEW_MUTATION_ACTIONS: ReadonlySet<ActionType> = new Set([
	'ADD_VIEW',
	'RENAME_VIEW',
	'DELETE_VIEW',
	'ADD_COLUMN',
	'RENAME_COLUMN',
	'DELETE_COLUMN',
	'REORDER_COLUMNS',
	'SET_BOARD_DATA',
	'CLEAR_ALL_DATA',
]);

export default class KanbanPlugin extends Plugin {
	store: KanbanStore;
	syncService: VaultSyncService;
	private repository: PluginDataRepository;
	private unsubscribeSync: (() => void) | null = null;

	async onload(): Promise<void> {
		// 初始化国际化
		initI18n(this.getLocale());

		// 初始化仓储并加载持久化数据
		this.repository = new PluginDataRepository(
			this.loadData.bind(this),
			this.saveData.bind(this),
		);
		const { settings, board } = await this.repository.load();

		// 初始化 Store
		this.store = new KanbanStore(settings, board, this);

		// 初始化同步服务
		this.syncService = new VaultSyncService(this.app.vault, this.store);

		// 只在数据真正变更时才同步 md（切换视图等 UI 操作不触发）
		this.unsubscribeSync = this.store.subscribe(() => {
			if (!this.store.lastActionMutatedData) return;

			const actionType = this.store.lastActionType;
			if (actionType && MULTI_VIEW_MUTATION_ACTIONS.has(actionType)) {
				this.syncService.scheduleSyncAllViews();
			} else {
				this.syncService.scheduleSyncCurrentView();
			}
		});

		// 注册自定义视图
		this.registerView(
			VIEW_TYPE_KANBAN,
			(leaf: WorkspaceLeaf) => new KanbanView(leaf, this),
		);

		// 添加 Ribbon 图标（左侧栏）
		this.addRibbonIcon('list-todo', t('plugin.ribbonTip'), () => {
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
		if (this.unsubscribeSync) {
			this.unsubscribeSync();
			this.unsubscribeSync = null;
		}
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
		const appWithConfig = this.app as unknown as {
			vault?: { getConfig?: (key: string) => unknown };
		};
		const configLocale = appWithConfig.vault?.getConfig?.('language')
			?? appWithConfig.vault?.getConfig?.('locale');
		if (typeof configLocale === 'string' && configLocale) {
			return configLocale;
		}

		const htmlLocale = globalThis.document?.documentElement?.lang;
		if (htmlLocale) {
			return htmlLocale;
		}

		const localStorageLocale = globalThis.localStorage.getItem('language');
		return localStorageLocale ?? 'en';
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
				// 备用：在新标签页创建
				leaf ??= workspace.getLeaf('tab');
				if (leaf) {
					await leaf.setViewState({
						type: VIEW_TYPE_KANBAN,
						active: true,
					});
				}
			}

			if (leaf) {
				await workspace.revealLeaf(leaf);
				if (leaf.view instanceof KanbanView) {
					leaf.view.focusBoard();
				}
			}
		} catch (error) {
			console.error('[aulyckanban] Failed to activate view:', error);
		}
	}

	/**
	 * 持久化数据到磁盘；失败时提示用户并向上抛出，由调用方决定是否重试
	 */
	async persistData(notifyFailure = true): Promise<void> {
		try {
			await this.repository.save(
				this.store.getSettings(),
				this.store.getBoardData(),
			);
		} catch (error) {
			console.error('[aulyckanban] Failed to save data:', error);
			// 同一轮自动重试只在首次失败时提示，避免重复 Notice 干扰用户。
			if (notifyFailure) new Notice(t('save.fail'));
			throw error;
		}
	}
}
