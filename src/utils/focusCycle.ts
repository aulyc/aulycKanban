export type KanbanFocusZone = 'view' | 'tasks' | 'columns';
export type TaskTypeNavigationTarget =
	| { kind: 'view'; id: string }
	| { kind: 'add' }
	| { kind: 'archive' };

const FOCUS_ORDER: readonly KanbanFocusZone[] = ['view', 'tasks', 'columns'];
const TASK_ZONE_TASK_SELECTOR = '.aulyckanban-task-list .aulyckanban-task';
const TASK_ZONE_INPUT_SELECTOR = '.aulyckanban-task-list .aulyckanban-inline-input';

export interface TabFocusFallbackContext {
	key: string;
	defaultPrevented: boolean;
	viewIsActive: boolean;
	eventPathIncludesView: boolean;
	activeElementIsInsideView: boolean;
	documentLevelTarget: boolean;
}

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

/**
 * 仅在活动看板的 Tab 事件脱离看板 DOM 路径时启用窗口级兜底。
 * 看板内部事件仍交给原监听器；弹窗、编辑器和侧栏控件不会被接管。
 */
export function shouldUseTabFocusFallback(context: TabFocusFallbackContext): boolean {
	return context.key === 'Tab'
		&& !context.defaultPrevented
		&& context.viewIsActive
		&& !context.eventPathIncludesView
		&& (context.activeElementIsInsideView || context.documentLevelTarget);
}

/** 获取普通任务区的首个焦点目标，避免命中隐藏归档区复用的任务样式。 */
export function getTaskZoneFocusTarget(root: ParentNode): HTMLElement | null {
	return root.querySelector<HTMLElement>(TASK_ZONE_TASK_SELECTOR)
		?? root.querySelector<HTMLElement>(TASK_ZONE_INPUT_SELECTOR);
}

/** 获取普通任务区的方向键目标，排除隐藏归档卡片。 */
export function getTaskZoneNavigationItems(root: ParentNode): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(
		`${TASK_ZONE_INPUT_SELECTOR}, ${TASK_ZONE_TASK_SELECTOR}`,
	));
}

/** 计算方向键循环选择时的目标下标。 */
export function getWrappedItemIndex(currentIndex: number, length: number, offset: number): number {
	if (length <= 0) return -1;
	const safeCurrent = currentIndex >= 0 ? currentIndex : 0;
	return (safeCurrent + offset + length) % length;
}

/** 计算把横向列表项完整移入可视区所需的 scrollLeft。 */
export function getHorizontalRevealScrollLeft(
	currentScrollLeft: number,
	viewportLeft: number,
	viewportRight: number,
	itemLeft: number,
	itemRight: number,
): number {
	if (itemLeft < viewportLeft) {
		return Math.max(0, currentScrollLeft - (viewportLeft - itemLeft));
	}
	if (itemRight > viewportRight) {
		return currentScrollLeft + (itemRight - viewportRight);
	}
	return currentScrollLeft;
}

/** 在不显示滚动条的任务类型栏中，把键盘目标完整滚动到可视区域。 */
export function revealTaskTypeItem(item: HTMLElement): void {
	const strip = item.closest<HTMLElement>('.aulyckanban-view-strip');
	if (!strip) return;
	const viewport = strip.getBoundingClientRect();
	const itemRect = item.getBoundingClientRect();
	strip.scrollLeft = getHorizontalRevealScrollLeft(
		strip.scrollLeft,
		viewport.left,
		viewport.right,
		itemRect.left,
		itemRect.right,
	);
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
