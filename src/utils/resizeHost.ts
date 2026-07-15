const RESIZE_HOST_CLASS = 'aulyckanban-resize-host';

/**
 * 找到真正承受 Obsidian 分栏宽度的宿主。
 * 右侧栏的宽度落在 sidedock 上；主工作区分栏的宽度落在 workspace-tabs 上。
 */
export function findResizeHost(containerEl: HTMLElement): HTMLElement | null {
	return (
		containerEl.closest<HTMLElement>('.workspace-split.mod-sidedock') ??
		containerEl.closest<HTMLElement>('.workspace-tabs')
	);
}

/** 将最小宽度标记迁移到当前宿主，兼容标签页在不同分栏间移动。 */
export function updateResizeHost(
	currentHost: HTMLElement | null,
	containerEl: HTMLElement,
): HTMLElement | null {
	const nextHost = findResizeHost(containerEl);
	if (currentHost === nextHost) return currentHost;
	currentHost?.classList.remove(RESIZE_HOST_CLASS);
	nextHost?.classList.add(RESIZE_HOST_CLASS);
	return nextHost;
}

export function clearResizeHost(host: HTMLElement | null): void {
	host?.classList.remove(RESIZE_HOST_CLASS);
}
