import type { ReorderSide } from '../utils/reorder';

type ReorderAxis = 'horizontal' | 'vertical';

function containsEventTarget(parent: HTMLElement, target: EventTarget | null): boolean {
	const NodeConstructor = parent.ownerDocument.defaultView?.Node;
	return Boolean(NodeConstructor && target instanceof NodeConstructor && parent.contains(target));
}

/** 为横向或纵向排序提供一致的占位槽和紧凑拖拽影像。 */
export class ReorderVisual {
	private sourceEl: HTMLElement | null = null;
	private placeholderEl: HTMLElement | null = null;
	private targetEl: HTMLElement | null = null;
	private side: ReorderSide | null = null;
	private placeholderSize = 0;

	constructor(private readonly axis: ReorderAxis) {}

	start(sourceEl: HTMLElement, event: DragEvent, label: string): void {
		this.finish();
		this.sourceEl = sourceEl;
		const rect = sourceEl.getBoundingClientRect();
		this.placeholderSize = Math.max(this.axis === 'horizontal' ? rect.width : rect.height, 30);
		sourceEl.addClass('aulyckanban-reorder-dragging');

		if (!event.dataTransfer?.setDragImage) return;
		const previewEl = sourceEl.createDiv({
			cls: 'aulyckanban-reorder-drag-preview',
			text: label,
		});
		previewEl.setAttribute('aria-hidden', 'true');
		sourceEl.ownerDocument.body.appendChild(previewEl);
		// 光标落在影像底部，使紧凑影像显示在插入位置上方，避免遮挡占位槽。
		event.dataTransfer.setDragImage(previewEl, 18, 30);
		sourceEl.win.requestAnimationFrame(() => previewEl.remove());
	}

	show(targetEl: HTMLElement, side: ReorderSide, onDrop: () => void): void {
		if (targetEl === this.sourceEl) {
			this.clearPlaceholder();
			return;
		}
		if (this.placeholderEl && this.targetEl === targetEl && this.side === side) return;

		this.clearPlaceholder();
		const parentEl = targetEl.parentElement;
		if (!parentEl) return;
		const referenceEl = side === 'before' ? targetEl : targetEl.nextSibling;
		const placeholderEl = parentEl.createDiv({
			cls: `aulyckanban-reorder-placeholder aulyckanban-reorder-placeholder-${this.axis}`,
			attr: { 'aria-hidden': 'true' },
		});
		placeholderEl.style.setProperty(
			'--aulyckanban-reorder-placeholder-size',
			`${this.placeholderSize}px`,
		);
		placeholderEl.addEventListener('dragover', (event: DragEvent) => {
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		});
		placeholderEl.addEventListener('drop', (event: DragEvent) => {
			event.preventDefault();
			event.stopPropagation();
			onDrop();
		});
		placeholderEl.addEventListener('dragleave', (event: DragEvent) => {
			if (containsEventTarget(parentEl, event.relatedTarget)) return;
			this.clearPlaceholder();
		});

		parentEl.insertBefore(placeholderEl, referenceEl);
		this.placeholderEl = placeholderEl;
		this.targetEl = targetEl;
		this.side = side;
	}

	containsPlaceholder(target: EventTarget | null): boolean {
		return Boolean(
			this.placeholderEl &&
				(target === this.placeholderEl || containsEventTarget(this.placeholderEl, target)),
		);
	}

	clearPlaceholder(): void {
		this.placeholderEl?.remove();
		this.placeholderEl = null;
		this.targetEl = null;
		this.side = null;
	}

	finish(): void {
		this.clearPlaceholder();
		this.sourceEl?.removeClass('aulyckanban-reorder-dragging');
		this.sourceEl = null;
		this.placeholderSize = 0;
	}
}
