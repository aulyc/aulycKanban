export type ReorderSide = 'before' | 'after';

/** 根据指针在目标项前半区或后半区的位置确定插入方向。 */
export function getReorderSide(pointer: number, start: number, size: number): ReorderSide {
	return pointer < start + size / 2 ? 'before' : 'after';
}

/** 将一个现有 ID 移到目标 ID 的前面或后面；无效输入保持原顺序。 */
export function reorderIds(
	ids: readonly string[],
	draggedId: string,
	targetId: string,
	side: ReorderSide,
): string[] {
	if (draggedId === targetId || !ids.includes(draggedId) || !ids.includes(targetId)) {
		return [...ids];
	}
	const reordered = ids.filter((id) => id !== draggedId);
	const targetIndex = reordered.indexOf(targetId);
	const insertionIndex = targetIndex + (side === 'after' ? 1 : 0);
	reordered.splice(insertionIndex, 0, draggedId);
	return reordered;
}
