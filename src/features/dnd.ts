import type { KanbanStore } from '../store';

/**
 * 拖拽管理器
 * 支持 HTML5 Drag API（桌面端）
 * 处理同列排序 + 跨列移动
 */
export class DragDropManager {
	private store: KanbanStore;
	private columnsEl: HTMLElement;
	private draggedTaskId: string | null = null;
	private sourceColumnId: string | null = null;
	private draggedElement: HTMLElement | null = null;
	private cleanupFns: Array<() => void> = [];

	constructor(store: KanbanStore, columnsEl: HTMLElement) {
		this.store = store;
		this.columnsEl = columnsEl;
	}

	/**
	 * 初始化拖拽事件
	 * 使用事件委托，只在容器级别绑定
	 */
	setup(): void {
		this.cleanup();

		// 拖拽开始
		const onDragStart = (e: DragEvent): void => {
			const taskEl = (e.target as HTMLElement).closest('.xaulyc-task') as HTMLElement | null;
			if (!taskEl) return;

			this.draggedElement = taskEl;
			this.draggedTaskId = taskEl.dataset['taskId'] ?? null;

			const tasksContainer = taskEl.closest('.xaulyc-tasks') as HTMLElement | null;
			this.sourceColumnId = tasksContainer?.dataset['columnId'] ?? null;

			taskEl.classList.add('dragging');

			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', this.draggedTaskId ?? '');
			}
		};

		// 拖拽结束
		const onDragEnd = (e: DragEvent): void => {
			const taskEl = (e.target as HTMLElement).closest('.xaulyc-task') as HTMLElement | null;
			if (taskEl) {
				taskEl.classList.remove('dragging');
			}

			// 清除所有 drag-over 样式
			this.columnsEl.querySelectorAll('.xaulyc-drag-over').forEach((el) => {
				el.classList.remove('xaulyc-drag-over');
			});

			this.draggedElement = null;
		};

		// 拖拽悬停（处理同列内排序的视觉反馈）
		const onDragOver = (e: DragEvent): void => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}

			if (!this.draggedElement) return;

			const tasksContainer = (e.target as HTMLElement).closest('.xaulyc-tasks') as HTMLElement | null;
			if (!tasksContainer) return;

			const afterElement = this.getDragAfterElement(tasksContainer, e.clientY);

			if (afterElement == null) {
				tasksContainer.appendChild(this.draggedElement);
			} else {
				tasksContainer.insertBefore(this.draggedElement, afterElement);
			}
		};

		// 绑定到列容器（事件委托）
		this.columnsEl.addEventListener('dragstart', onDragStart);
		this.columnsEl.addEventListener('dragend', onDragEnd);
		this.columnsEl.addEventListener('dragover', onDragOver);

		this.cleanupFns.push(() => {
			this.columnsEl.removeEventListener('dragstart', onDragStart);
			this.columnsEl.removeEventListener('dragend', onDragEnd);
			this.columnsEl.removeEventListener('dragover', onDragOver);
		});

		// 为每个任务列表容器设置 drop 区域
		this.setupDropZones();
	}

	/**
	 * 为每个列的任务容器设置 drop 事件
	 */
	private setupDropZones(): void {
		const taskContainers = this.columnsEl.querySelectorAll('.xaulyc-tasks');

		taskContainers.forEach((container) => {
			const el = container as HTMLElement;

			const onDragOver = (e: DragEvent): void => {
				e.preventDefault();
				if (e.dataTransfer) {
					e.dataTransfer.dropEffect = 'move';
				}
				el.classList.add('xaulyc-drag-over');
			};

			const onDragLeave = (e: DragEvent): void => {
				if (e.target === el) {
					el.classList.remove('xaulyc-drag-over');
				}
			};

			const onDrop = (e: DragEvent): void => {
				e.preventDefault();
				el.classList.remove('xaulyc-drag-over');

				if (this.draggedTaskId && this.sourceColumnId) {
					const targetColumnId = el.dataset['columnId'];
					if (!targetColumnId) return;

					const targetIndex = this.getDropTargetIndex(el, this.draggedElement);

					this.store.dispatch({
						type: 'MOVE_TASK',
						payload: {
							taskId: this.draggedTaskId,
							fromColumnId: this.sourceColumnId,
							toColumnId: targetColumnId,
							targetIndex,
						},
					});

					this.draggedTaskId = null;
					this.sourceColumnId = null;
				}
			};

			el.addEventListener('dragover', onDragOver);
			el.addEventListener('dragleave', onDragLeave);
			el.addEventListener('drop', onDrop);

			this.cleanupFns.push(() => {
				el.removeEventListener('dragover', onDragOver);
				el.removeEventListener('dragleave', onDragLeave);
				el.removeEventListener('drop', onDrop);
			});
		});
	}

	/**
	 * 获取拖拽后的元素位置（插入在哪个元素之前）
	 */
	private getDragAfterElement(container: HTMLElement, y: number): HTMLElement | null {
		const draggableElements = Array.from(
			container.querySelectorAll('.xaulyc-task:not(.dragging)'),
		) as HTMLElement[];

		let closest: { offset: number; element: HTMLElement | null } = {
			offset: Number.NEGATIVE_INFINITY,
			element: null,
		};

		for (const child of draggableElements) {
			const box = child.getBoundingClientRect();
			const offset = y - box.top - box.height / 2;

			if (offset < 0 && offset > closest.offset) {
				closest = { offset, element: child };
			}
		}

		return closest.element;
	}

	/**
	 * 获取拖拽元素在目标容器中的新索引
	 */
	private getDropTargetIndex(container: HTMLElement, draggedElement: HTMLElement | null): number {
		if (!draggedElement) return 0;
		const tasks = Array.from(container.querySelectorAll('.xaulyc-task'));
		return tasks.indexOf(draggedElement);
	}

	/**
	 * 清理所有事件监听器
	 */
	cleanup(): void {
		for (const fn of this.cleanupFns) {
			fn();
		}
		this.cleanupFns = [];
		this.draggedTaskId = null;
		this.sourceColumnId = null;
		this.draggedElement = null;
	}
}
