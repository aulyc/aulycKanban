import { setIcon } from 'obsidian';
import { t } from '../i18n';
import { appendAccessibleLabel } from '../utils/dom';

export interface TaskSelectionButtonsOptions {
	active: boolean;
	hasItems: boolean;
	allSelected: boolean;
	cancelClass?: string;
	selectionClass?: string;
	onCancel: () => void;
	onSelect: () => void;
}

/** 普通任务与归档任务共享的取消、选择和全选按钮。 */
export function createTaskSelectionButtons(
	parentEl: HTMLElement,
	options: TaskSelectionButtonsOptions,
): { cancelButton: HTMLButtonElement; selectionButton: HTMLButtonElement } {
	const cancelButton = parentEl.createEl('button', {
		cls: ['aulyckanban-task-selection-btn', options.cancelClass].filter(Boolean).join(' '),
		attr: { type: 'button', tabindex: '-1' },
	});
	setIcon(cancelButton, 'x');
	appendAccessibleLabel(cancelButton, t('task.select.cancel'));
	cancelButton.disabled = !options.active;
	cancelButton.addEventListener('click', options.onCancel);

	const selectionButton = parentEl.createEl('button', {
		cls: ['aulyckanban-task-selection-btn', options.selectionClass].filter(Boolean).join(' '),
		attr: { type: 'button', tabindex: '-1' },
	});
	setIcon(selectionButton, options.active && options.allSelected ? 'list-x' : 'list-checks');
	appendAccessibleLabel(
		selectionButton,
		options.active
			? options.allSelected
				? t('task.select.clearAll')
				: t('task.select.all')
			: t('task.select.mode'),
	);
	selectionButton.disabled = !options.hasItems;
	selectionButton.addEventListener('click', options.onSelect);

	return { cancelButton, selectionButton };
}
