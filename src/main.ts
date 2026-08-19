import { Notice, Plugin, WorkspaceLeaf, type Command } from 'obsidian';
import { VIEW_TYPE_KANBAN } from './constants';
import { initI18n, resolveUiLocale, t, type UiLanguage } from './i18n';
import { KanbanView } from './ui/KanbanView';
import { KanbanSettingTab } from './ui/KanbanSettingTab';
import { KanbanStore } from './store';
import { VaultSyncService } from './services/syncService';
import { DataSchemaVersionError, PluginDataRepository } from './services/repository';
import { getMutationSyncTarget } from './utils/syncTarget';
import type { ViewKind } from './types';

export default class KanbanPlugin extends Plugin {
	store!: KanbanStore;
	syncService!: VaultSyncService;
	private repository!: PluginDataRepository;
	private unsubscribeSync: (() => void) | null = null;
	private readonly viewCommands = new Map<ViewKind, Command>();

	async onload(): Promise<void> {
		// 初始化国际化
		initI18n(this.getLocale());

		// 初始化仓储并加载持久化数据
		this.repository = new PluginDataRepository(this.loadData.bind(this), this.saveData.bind(this));
		let loaded: Awaited<ReturnType<PluginDataRepository['load']>>;
		try {
			loaded = await this.repository.load();
		} catch (error) {
			if (!(error instanceof DataSchemaVersionError)) throw error;
			console.error('[aulycKanban] Persisted data schema is incompatible:', error);
			new Notice(
				t(error.reason === 'unsupported' ? 'data.schema.unsupported' : 'data.schema.invalid'),
			);
			return;
		}
		const { settings, board } = loaded;
		if (settings.uiLanguage !== 'system') {
			initI18n(settings.uiLanguage);
		}

		// 初始化 Store
		this.store = new KanbanStore(settings, board, this);

		// 初始化同步服务
		this.syncService = new VaultSyncService(this.app.vault, this.store);
		try {
			await this.syncService.initialize(true);
		} catch (error) {
			console.error('[aulycKanban] Failed to initialize managed notes:', error);
		}

		// 只在数据真正变更时才同步 md（切换视图等 UI 操作不触发）
		this.unsubscribeSync = this.store.subscribe(() => {
			this.syncViewCommands();
			if (!this.store.lastActionMutatedData) return;

			const actionType = this.store.lastActionType;
			if (!actionType) return;
			const target = getMutationSyncTarget(
				actionType,
				this.store.getCurrentView(),
				this.store.lastMutatedViewId,
				this.store.lastMutatedViewIds,
			);
			if (target.kind === 'all') {
				this.syncService.scheduleSyncAllViews();
			} else if (target.kind === 'views') {
				for (const viewId of target.viewIds) this.syncService.scheduleSyncView(viewId);
			} else {
				this.syncService.scheduleSyncView(target.viewId);
			}
		});

		// 注册自定义视图
		this.registerView(VIEW_TYPE_KANBAN, (leaf: WorkspaceLeaf) => new KanbanView(leaf, this));

		// 添加 Ribbon 图标（左侧栏）
		this.addRibbonIcon('list-todo', t('plugin.ribbonTip'), () => {
			void this.activateView();
		});

		// 注册命令（不设默认快捷键，遵守 Obsidian 规范）
		this.addCommand({
			id: 'open-board',
			name: t('command.openBoard'),
			callback: () => {
				void this.activateView();
			},
		});

		this.syncViewCommands();

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
		const htmlLocale = this.app.workspace.containerEl.ownerDocument.documentElement.lang;
		if (htmlLocale) {
			return htmlLocale;
		}

		return 'en';
	}

	/** 应用插件界面语言；已有任务、象限和同步目录保持不变。 */
	applyUiLanguage(language: UiLanguage): void {
		initI18n(resolveUiLocale(language, this.getLocale()));
		this.syncViewCommands();
	}

	/** 让命令面板与动态任务类型的新增、重命名和删除保持一致。 */
	private syncViewCommands(): void {
		for (const view of this.store.getTaskViews()) {
			const name = t('command.focusView').replace('{title}', () => view.title);
			const registered = this.viewCommands.get(view.id);
			if (registered) {
				registered.name = name;
				continue;
			}

			const viewId = view.id;
			const command = this.addCommand({
				id: this.getViewCommandId(viewId),
				name,
				checkCallback: (checking) => {
					if (!this.store.getView(viewId)) return false;
					if (!checking) void this.focusView(viewId);
					return true;
				},
			});
			this.viewCommands.set(viewId, command);
		}
	}

	private async focusView(viewId: ViewKind): Promise<void> {
		if (!this.store.getView(viewId)) return;
		await this.activateView();
		if (!this.store.getView(viewId)) return;
		this.store.dispatch({ type: 'SWITCH_VIEW', payload: { view: viewId } });
	}

	/** 保留两个历史命令 ID，使既有 Obsidian 快捷键设置继续生效。 */
	private getViewCommandId(viewId: ViewKind): string {
		if (viewId === 'work') return 'focus-work';
		if (viewId === 'personal') return 'focus-personal';
		return `focus-view-${encodeURIComponent(viewId)}`;
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
				workspace.setActiveLeaf(leaf, { focus: true });
				if (leaf.view instanceof KanbanView) {
					leaf.view.focusBoard();
				}
			}
		} catch (error) {
			console.error('[aulycKanban] Failed to activate view:', error);
		}
	}

	/**
	 * 持久化数据到磁盘；失败时提示用户并向上抛出，由调用方决定是否重试
	 */
	async persistData(notifyFailure = true): Promise<void> {
		try {
			await this.repository.save(this.store.getSettings(), this.store.getBoardData());
		} catch (error) {
			console.error('[aulycKanban] Failed to save data:', error);
			// 同一轮自动重试只在首次失败时提示，避免重复 Notice 干扰用户。
			if (notifyFailure) new Notice(t('save.fail'));
			throw error;
		}
	}
}
