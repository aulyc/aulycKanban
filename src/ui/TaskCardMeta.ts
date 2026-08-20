export interface TaskCardMetaOptions {
	sourceLabel?: string;
	timeLabel: string;
	actionsClass?: string;
}

/** 普通任务与归档任务共享的底部信息行。 */
export function createTaskCardMeta(
	parentEl: HTMLElement,
	options: TaskCardMetaOptions,
): { rowEl: HTMLElement; actionsEl: HTMLElement } {
	const rowEl = parentEl.createDiv({ cls: 'aulyckanban-task-meta-row' });
	const detailsEl = rowEl.createDiv({ cls: 'aulyckanban-task-meta-details' });
	if (options.sourceLabel) {
		detailsEl.createDiv({ cls: 'aulyckanban-task-source', text: options.sourceLabel });
	}
	detailsEl.createDiv({ cls: 'aulyckanban-task-time', text: options.timeLabel });

	const actionsEl = rowEl.createDiv({
		cls: ['aulyckanban-task-actions', options.actionsClass].filter(Boolean).join(' '),
	});
	return { rowEl, actionsEl };
}
