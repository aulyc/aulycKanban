import { PERFORMANCE } from '../constants';

/** 单列的虚拟滚动状态 */
interface ScrollState {
	scrollTop: number;
	startIndex: number;
	endIndex: number;
}

/**
 * 虚拟滚动管理器
 * 每列仅渲染可视区域内的任务，提升大列表性能
 */
export class VirtualScrollManager {
	private states: Map<string, ScrollState> = new Map();
	private scrollListeners: Map<string, () => void> = new Map();
	private onUpdate: ((columnId: string, startIndex: number, endIndex: number) => void) | null = null;

	/**
	 * 设置当列虚拟滚动状态变化时的回调
	 */
	setOnUpdate(fn: (columnId: string, startIndex: number, endIndex: number) => void): void {
		this.onUpdate = fn;
	}

	/**
	 * 为一个任务列表容器设置虚拟滚动
	 */
	setupColumn(columnId: string, tasksEl: HTMLElement): void {
		// 初始化状态
		if (!this.states.has(columnId)) {
			this.states.set(columnId, {
				scrollTop: 0,
				startIndex: 0,
				endIndex: PERFORMANCE.VISIBLE_TASK_COUNT,
			});
		}

		// 移除旧的滚动监听
		const oldListener = this.scrollListeners.get(columnId);
		if (oldListener) {
			tasksEl.removeEventListener('scroll', oldListener);
		}

		// 添加新的滚动监听（去抖）
		let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

		const handleScroll = (): void => {
			if (scrollTimeout) {
				clearTimeout(scrollTimeout);
			}
			scrollTimeout = setTimeout(() => {
				this.updateScrollState(columnId, tasksEl);
				scrollTimeout = null;
			}, PERFORMANCE.SCROLL_DEBOUNCE);
		};

		tasksEl.addEventListener('scroll', handleScroll);
		this.scrollListeners.set(columnId, handleScroll);
	}

	/**
	 * 获取列的当前虚拟滚动范围
	 */
	getVisibleRange(columnId: string): { startIndex: number; endIndex: number } {
		const state = this.states.get(columnId);
		if (!state) {
			return { startIndex: 0, endIndex: PERFORMANCE.VISIBLE_TASK_COUNT };
		}
		return { startIndex: state.startIndex, endIndex: state.endIndex };
	}

	/**
	 * 更新滚动状态
	 */
	private updateScrollState(columnId: string, tasksEl: HTMLElement): void {
		const scrollTop = tasksEl.scrollTop;
		const startIndex = Math.floor(scrollTop / PERFORMANCE.TASK_HEIGHT);
		const endIndex = startIndex + PERFORMANCE.VISIBLE_TASK_COUNT + 5; // 缓冲区

		const state = this.states.get(columnId);
		if (state && (state.startIndex !== startIndex || state.endIndex !== endIndex)) {
			state.scrollTop = scrollTop;
			state.startIndex = startIndex;
			state.endIndex = endIndex;

			if (this.onUpdate) {
				this.onUpdate(columnId, startIndex, endIndex);
			}
		}
	}

	/**
	 * 清理所有状态
	 */
	clear(): void {
		this.states.clear();
		this.scrollListeners.clear();
		this.onUpdate = null;
	}

	/**
	 * 清除特定列的状态
	 */
	clearColumn(columnId: string): void {
		this.states.delete(columnId);
		this.scrollListeners.delete(columnId);
	}
}
