/**
 * 内联编辑完成控制器。
 * Enter、按钮点击和 blur 可能连续触发，只允许第一个动作生效。
 */
export function createInlineCommitController(
	onCommit: () => void,
	onCancel: () => void,
): { commit: () => void; cancel: () => void } {
	let finished = false;

	return {
		commit: () => {
			if (finished) return;
			finished = true;
			onCommit();
		},
		cancel: () => {
			if (finished) return;
			finished = true;
			onCancel();
		},
	};
}
