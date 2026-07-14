/**
 * DOM 公共工具函数
 */

/**
 * 将含换行的文本插入元素，\n 转为 <br>
 */
export function setTextWithLineBreaks(el: HTMLElement, text: string): void {
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line !== undefined) {
			el.appendText(line);
		}
		if (i < lines.length - 1) {
			el.createEl('br');
		}
	}
}

/**
 * 用元素内的隐藏文字提供无障碍名称。
 * 避免使用会被 Obsidian 渲染成 tooltip 的 title / aria-label。
 */
export function appendAccessibleLabel(el: HTMLElement, text: string): void {
	el.createSpan({
		cls: 'aulyckanban-accessible-label',
		text,
	});
}

/**
 * 自动调整 textarea 高度以适配内容
 * 返回清理函数（取消 input 监听）
 */
export function getTextareaBorderBoxHeight(
	scrollHeight: number,
	borderTopWidth: string,
	borderBottomWidth: string,
): number {
	const borderTop = Number.parseFloat(borderTopWidth) || 0;
	const borderBottom = Number.parseFloat(borderBottomWidth) || 0;
	return scrollHeight + borderTop + borderBottom;
}

export function autoResizeTextarea(textarea: HTMLTextAreaElement): () => void {
	const resize = (): void => {
		textarea.style.height = 'auto';
		const style = getComputedStyle(textarea);
		textarea.style.height = getTextareaBorderBoxHeight(
			textarea.scrollHeight,
			style.borderTopWidth,
			style.borderBottomWidth,
		) + 'px';
	};
	requestAnimationFrame(resize);
	textarea.addEventListener('input', resize);
	return () => textarea.removeEventListener('input', resize);
}
