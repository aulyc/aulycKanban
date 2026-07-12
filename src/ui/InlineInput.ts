import { autoResizeTextarea } from '../utils/dom';
import { createInlineCommitController } from '../utils/inlineCommit';
import { shouldCommitInlineInput } from '../utils/keyboard';

export type InlineInputEl = HTMLInputElement | HTMLTextAreaElement;

export interface InlineInputOptions {
	/** true 时创建自动伸缩的 textarea（Shift+Enter 换行），否则创建单行 input */
	multiline?: boolean;
	cls: string;
	placeholder?: string;
	initialValue?: string;
	/**
	 * Enter 或 blur（blurBehavior 为 commit 时）触发，value 未 trim。
	 * 一次性模式下返回 false 表示本次提交被拒绝（如内容为空），编辑态保持存活。
	 */
	onCommit: (value: string, trigger: 'enter' | 'blur') => boolean | void;
	/** Escape 或 blur（blurBehavior 为 cancel 时）触发；persistent 模式不适用 */
	onCancel?: () => void;
	/** blur 时的行为，默认 'none'；persistent 模式忽略此项 */
	blurBehavior?: 'commit' | 'cancel' | 'none';
	/**
	 * true 时输入框长期存在：提交可重复触发，Escape/blur 不结束编辑。
	 * 适用于任务快速添加框和搜索框。
	 */
	persistent?: boolean;
	/** 每次输入（含 IME 组合中）回调，用于草稿暂存 */
	onInput?: (value: string) => void;
	/** 输入停顿 debounceMs 毫秒后回调（IME 组合中不触发，提交时取消） */
	debounceMs?: number;
	onDebounced?: (value: string) => void;
	/** 挂载后（下一帧）自动聚焦 */
	focusOnMount?: boolean;
	/** 聚焦时恢复的选区，缺省把光标移到末尾 */
	selection?: { start: number; end: number };
	/** 阻止点击冒泡（父元素有点击行为时使用） */
	stopClickPropagation?: boolean;
}

/**
 * 通用内联输入框。
 * 统一处理 IME 组合态、Enter 提交 / Escape 取消 / blur 策略、
 * 防抖回调与挂载后聚焦，替代各组件各自手写的输入框逻辑。
 */
export function createInlineInput(parentEl: HTMLElement, options: InlineInputOptions): InlineInputEl {
	const attr: Record<string, string> = {};
	if (options.placeholder !== undefined) attr['placeholder'] = options.placeholder;
	const el: InlineInputEl = options.multiline
		? parentEl.createEl('textarea', { cls: options.cls, attr: { ...attr, rows: '1' } })
		: parentEl.createEl('input', { cls: options.cls, attr: { ...attr, type: 'text' } });
	el.value = options.initialValue ?? '';
	if (el instanceof HTMLTextAreaElement) autoResizeTextarea(el);

	let composing = false;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	const clearDebounce = (): void => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
	};
	const scheduleDebounce = (): void => {
		if (!options.onDebounced || options.debounceMs === undefined) return;
		clearDebounce();
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			// 输入框可能在等待期间随重渲染被移除，此时不再回调
			if (!el.isConnected) return;
			options.onDebounced?.(el.value);
		}, options.debounceMs);
	};

	let trigger: 'enter' | 'blur' = 'enter';
	const controller = options.persistent ? null : createInlineCommitController(
		() => options.onCommit(el.value, trigger),
		() => { options.onCancel?.(); },
	);
	const commit = (via: 'enter' | 'blur'): void => {
		clearDebounce();
		if (!controller) {
			options.onCommit(el.value, via);
			return;
		}
		trigger = via;
		controller.commit();
	};
	const cancel = (): void => {
		if (!controller) return;
		clearDebounce();
		controller.cancel();
	};

	el.addEventListener('input', () => {
		options.onInput?.(el.value);
		if (!composing) scheduleDebounce();
	});
	el.addEventListener('compositionstart', () => { composing = true; });
	el.addEventListener('compositionend', () => {
		composing = false;
		options.onInput?.(el.value);
		scheduleDebounce();
	});
	el.addEventListener('keydown', (event: KeyboardEvent) => {
		if (options.multiline && event.key === 'Enter' && event.shiftKey) return;
		if (shouldCommitInlineInput(event, composing)) {
			event.preventDefault();
			event.stopPropagation();
			commit('enter');
			return;
		}
		if (event.key === 'Escape' && controller) {
			event.preventDefault();
			cancel();
		}
	});
	el.addEventListener('blur', () => {
		if (options.persistent) return;
		if (options.blurBehavior === 'commit') commit('blur');
		else if (options.blurBehavior === 'cancel') cancel();
	});
	if (options.stopClickPropagation) {
		el.addEventListener('click', (event: MouseEvent) => event.stopPropagation());
	}

	if (options.focusOnMount) {
		requestAnimationFrame(() => {
			el.focus({ preventScroll: true });
			const selection = options.selection;
			if (selection) el.setSelectionRange(selection.start, selection.end);
			else el.setSelectionRange(el.value.length, el.value.length);
		});
	}
	return el;
}
