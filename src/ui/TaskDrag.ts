import type { TaskCoordinate } from '../types';
import type { TaskMoveTarget } from './TaskMoveModal';

type DropHandler = (tasks: readonly TaskCoordinate[], target: TaskMoveTarget) => void;

/** 一个看板实例内共享的拖拽会话；悬停只预览，drop 才提交移动。 */
export class TaskDrag {
	private tasks: TaskCoordinate[] = [];
	private lockedView: string | null = null;
	private dropHandler: DropHandler;
	private readonly listeners = new Set<() => void>();

	constructor(dropHandler: DropHandler = () => {}) {
		this.dropHandler = dropHandler;
	}

	get isDragging(): boolean {
		return this.tasks.length > 0;
	}

	get taskCount(): number {
		return this.tasks.length;
	}

	get lockedViewId(): string | null {
		return this.lockedView;
	}

	setDropHandler(handler: DropHandler): void {
		this.dropHandler = handler;
	}

	start(tasks: readonly TaskCoordinate[]): void {
		this.tasks = tasks.map((task) => ({ ...task }));
		this.lockedView = null;
		this.notify();
	}

	lockView(viewId: string): void {
		if (!this.isDragging || this.lockedView === viewId) return;
		this.lockedView = viewId;
		this.notify();
	}

	drop(target: TaskMoveTarget): void {
		if (!this.isDragging) return;
		const tasks = this.tasks.map((task) => ({ ...task }));
		const resolvedTarget: TaskMoveTarget = {
			targetViewId: target.targetViewId ?? this.lockedView ?? undefined,
			targetColumnId: target.targetColumnId,
		};
		if (!resolvedTarget.targetViewId) delete resolvedTarget.targetViewId;
		if (!resolvedTarget.targetColumnId) delete resolvedTarget.targetColumnId;
		this.cancel();
		this.dropHandler(tasks, resolvedTarget);
	}

	cancel(): void {
		if (!this.isDragging && this.lockedView === null) return;
		this.tasks = [];
		this.lockedView = null;
		this.notify();
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}
