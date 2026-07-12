/**
 * 内联编辑完成控制器。
 * Enter、按钮点击和 blur 可能连续触发，只允许第一个动作生效；
 * onCommit 返回 false 表示本次提交被拒绝（如内容为空），编辑态保持存活。
 */
export function createInlineCommitController(
	onCommit: () => boolean | void,
	onCancel: () => void,
): { commit: () => void; cancel: () => void } {
	let state: 'active' | 'committing' | 'finished' = 'active';

	return {
		commit: () => {
			if (state !== 'active') return;
			// onCommit 可能同步重渲染并移除输入框，blur/cancel 会在回调返回前重入。
			// 先锁定 committing，确保已开始的提交不会被失焦取消截断。
			state = 'committing';
			try {
				state = onCommit() === false ? 'active' : 'finished';
			} catch (error) {
				state = 'active';
				throw error;
			}
		},
		cancel: () => {
			if (state !== 'active') return;
			state = 'finished';
			onCancel();
		},
	};
}
