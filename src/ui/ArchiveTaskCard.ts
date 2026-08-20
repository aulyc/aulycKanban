import { setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { KanbanStore } from '../store';
import { t } from '../i18n';
import { formatDateTimeMinute } from '../utils/datetime';
import { appendAccessibleLabel, setTextWithLineBreaks } from '../utils/dom';
import { getArchivedAtIso } from '../utils/task';
import type { TaskRef } from '../utils/taskQuery';
import { ConfirmModal } from './ConfirmModal';
import { createTaskCardMeta } from './TaskCardMeta';

export interface ArchiveTaskCardOptions {
	selectionMode: boolean;
	selected: boolean;
	sourceLabel?: string;
	onSelectionRequest: () => void;
}

/** 单条归档任务卡片：负责恢复、永久删除与选择态。 */
export class ArchiveTaskCard {
	private readonly el: HTMLElement;

	constructor(
		parentEl: HTMLElement,
		app: App,
		store: KanbanStore,
		ref: TaskRef,
		options: ArchiveTaskCardOptions,
	) {
		const { task } = ref;
		this.el = parentEl.createDiv({
			cls: [
				'aulyckanban-task',
				'aulyckanban-archive-task',
				options.selectionMode ? 'aulyckanban-archive-task-selecting' : '',
				options.selected ? 'aulyckanban-archive-task-selected' : '',
			]
				.filter(Boolean)
				.join(' '),
			attr: { tabindex: '-1' },
		});
		this.el.dataset['viewId'] = ref.viewId;
		this.el.dataset['columnId'] = ref.columnId;
		this.el.dataset['taskId'] = task.id;

		if (options.selectionMode) {
			this.el.setAttribute('role', 'checkbox');
			this.el.setAttribute('aria-checked', String(options.selected));
			this.el.addEventListener('click', (event: MouseEvent) => {
				const target = event.target;
				if (target instanceof Element && target.closest('input, button')) return;
				options.onSelectionRequest();
			});
		}

		const middleEl = this.el.createDiv({ cls: 'aulyckanban-task-middle' });
		const contentEl = middleEl.createDiv({
			cls: 'aulyckanban-task-content aulyckanban-archive-task-title',
		});
		setTextWithLineBreaks(contentEl, task.content);

		const { actionsEl } = createTaskCardMeta(middleEl, {
			sourceLabel: options.sourceLabel,
			timeLabel: `${t('archive.archivedAt')} ${formatDateTimeMinute(getArchivedAtIso(task))}`,
			actionsClass: 'aulyckanban-archive-task-actions',
		});
		if (options.selectionMode) {
			this.renderSelectionCheckbox(actionsEl, options);
			return;
		}

		const restoreBtn = actionsEl.createSpan({ cls: 'aulyckanban-archive-restore-btn' });
		setIcon(restoreBtn, 'rotate-ccw');
		appendAccessibleLabel(restoreBtn, t('archive.restore'));
		restoreBtn.addEventListener('click', (event: MouseEvent) => {
			event.stopPropagation();
			new ConfirmModal(app, {
				message: t('archive.confirm.restore'),
				onConfirm: () =>
					store.dispatch({
						type: 'RESTORE_TASK',
						payload: { viewId: ref.viewId, taskId: task.id },
					}),
			}).open();
		});

		const deleteBtn = actionsEl.createSpan({
			text: '✕',
			cls: 'aulyckanban-task-delete aulyckanban-archive-task-delete',
		});
		deleteBtn.addEventListener('click', (event: MouseEvent) => {
			event.stopPropagation();
			new ConfirmModal(app, {
				message: t('archive.confirm.delete'),
				isDestructive: true,
				onConfirm: () =>
					store.dispatch({
						type: 'DELETE_ARCHIVE_TASKS',
						payload: { tasks: [{ viewId: ref.viewId, taskId: task.id }] },
					}),
			}).open();
		});
	}

	getEl(): HTMLElement {
		return this.el;
	}

	private renderSelectionCheckbox(parentEl: HTMLElement, options: ArchiveTaskCardOptions): void {
		const labelEl = parentEl.createEl('label', {
			cls: 'aulyckanban-task-select-label aulyckanban-archive-select-label',
		});
		const checkboxEl = labelEl.createEl('input', {
			cls: 'aulyckanban-task-select-checkbox aulyckanban-archive-select-checkbox',
			attr: { type: 'checkbox' },
		});
		appendAccessibleLabel(labelEl, t('archive.delete.selectTask'));
		checkboxEl.checked = options.selected;
		labelEl.addEventListener('click', (event: MouseEvent) => event.stopPropagation());
		checkboxEl.addEventListener('click', (event: MouseEvent) => event.stopPropagation());
		checkboxEl.addEventListener('change', options.onSelectionRequest);
	}
}
