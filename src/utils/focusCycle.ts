export type KanbanFocusZone = 'view' | 'tasks' | 'columns';
export type TaskTypeNavigationTarget =
	| { kind: 'view'; id: string }
	| { kind: 'add' }
	| { kind: 'archive' };

const FOCUS_ORDER: readonly KanbanFocusZone[] = ['view', 'tasks', 'columns'];

/** 获取看板主要区域中的下一个焦点区域。 */
export function getNextFocusZone(
	current: KanbanFocusZone | null,
	reverse = false,
): KanbanFocusZone {
	if (current === null) return reverse ? FOCUS_ORDER[FOCUS_ORDER.length - 1] ?? 'view' : 'view';
	const index = FOCUS_ORDER.indexOf(current);
	const offset = reverse ? -1 : 1;
	return FOCUS_ORDER[(index + offset + FOCUS_ORDER.length) % FOCUS_ORDER.length] ?? 'view';
}

/** 计算方向键循环选择时的目标下标。 */
export function getWrappedItemIndex(currentIndex: number, length: number, offset: number): number {
	if (length <= 0) return -1;
	const safeCurrent = currentIndex >= 0 ? currentIndex : 0;
	return (safeCurrent + offset + length) % length;
}

/** 普通任务类型按显示顺序排列，新增按钮和归档依次作为最后两个可选择项。 */
export function getTaskTypeNavigationTarget(
	viewIds: readonly string[],
	currentViewId: string,
	showingArchive: boolean,
	offset: number,
	focusedTarget: TaskTypeNavigationTarget | null = null,
): TaskTypeNavigationTarget | null {
	const navigationItems: TaskTypeNavigationTarget[] = [
		...viewIds.map((id) => ({ kind: 'view' as const, id })),
		{ kind: 'add' },
		{ kind: 'archive' },
	];
	const currentIndex = focusedTarget
		? navigationItems.findIndex((item) => (
			item.kind === focusedTarget.kind
			&& (item.kind !== 'view' || focusedTarget.kind !== 'view' || item.id === focusedTarget.id)
		))
		: showingArchive
			? navigationItems.length - 1
			: navigationItems.findIndex((item) => item.kind === 'view' && item.id === currentViewId);
	const targetIndex = getWrappedItemIndex(currentIndex, navigationItems.length, offset);
	return targetIndex >= 0 ? navigationItems[targetIndex] ?? null : null;
}
