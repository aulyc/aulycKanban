/**
 * 内联编辑完成控制器。
 * Enter、按钮点击和 blur 可能连续触发，只允许第一个动作生效；
 * onCommit 返回 false 表示本次提交被拒绝（如内容为空），编辑态保持存活。
 */
export function createInlineCommitController(
	onCommit: () => boolean | void,
	onCancel: () => void,
): { commit: () => void; cancel: () => void } {
	let finished = false;

	return {
		commit: () => {
			if (finished) return;
			if (onCommit() === false) return;
			finished = true;
		},
		cancel: () => {
			if (finished) return;
			finished = true;
			onCancel();
		},
	};
}
