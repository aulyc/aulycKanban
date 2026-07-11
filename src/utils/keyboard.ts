/**
 * 文本输入框中的 Enter 是否应当提交。
 * 中文等输入法处于组合态时，Enter 只用于确认候选词，不能触发提交。
 */
export function shouldCommitInlineInput(
	event: Pick<KeyboardEvent, 'key' | 'isComposing'>,
	composing: boolean,
): boolean {
	return event.key === 'Enter' && !composing && !event.isComposing;
}
