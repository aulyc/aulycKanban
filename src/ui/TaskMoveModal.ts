import { App, Modal } from 'obsidian';
import { t } from '../i18n';

export interface TaskMoveTarget {
	targetViewId?: string;
	targetColumnId?: string;
}

interface MoveDestination {
	id: string;
	title: string;
}

interface TaskMoveModalOptions {
	taskCount: number;
	views: MoveDestination[];
	columns: MoveDestination[];
	initialViewId: string | null;
	initialColumnId: string | null;
	onMove: (target: TaskMoveTarget) => void;
}

/** 精确选择批量任务的目标任务类型和象限。 */
export class TaskMoveModal extends Modal {
	constructor(
		app: App,
		private readonly options: TaskMoveModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass('aulyckanban-modal-clean');
		modalEl.addClass('aulyckanban-task-move-modal');
		this.setTitle(t('task.move.title'));

		contentEl.createDiv({
			cls: 'aulyckanban-task-move-count',
			text: t('task.move.count').replace('{count}', String(this.options.taskCount)),
		});

		const viewSelect = this.createSelect(
			contentEl,
			t('task.target.view'),
			this.options.views,
			this.options.initialViewId,
			t('task.move.keepView'),
		);
		const columnSelect = this.createSelect(
			contentEl,
			t('task.target.column'),
			this.options.columns,
			this.options.initialColumnId,
			t('task.move.keepColumn'),
		);

		const buttonsEl = contentEl.createDiv({ cls: 'aulyckanban-modal-buttons' });
		const cancelButton = buttonsEl.createEl('button', {
			cls: 'aulyckanban-modal-btn',
			text: t('cancel'),
		});
		cancelButton.addEventListener('click', () => this.close());
		const moveButton = buttonsEl.createEl('button', {
			cls: 'aulyckanban-modal-btn mod-cta',
			text: t('task.move.confirm'),
		});

		const updateAvailability = (): void => {
			const viewUnchanged =
				this.options.initialViewId === null
					? viewSelect.value === ''
					: viewSelect.value === this.options.initialViewId;
			const columnUnchanged =
				this.options.initialColumnId === null
					? columnSelect.value === ''
					: columnSelect.value === this.options.initialColumnId;
			moveButton.disabled = viewUnchanged && columnUnchanged;
		};
		viewSelect.addEventListener('change', updateAvailability);
		columnSelect.addEventListener('change', updateAvailability);
		updateAvailability();

		moveButton.addEventListener('click', () => {
			if (moveButton.disabled) return;
			this.options.onMove({
				targetViewId: viewSelect.value || undefined,
				targetColumnId: columnSelect.value || undefined,
			});
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private createSelect(
		parentEl: HTMLElement,
		label: string,
		options: readonly MoveDestination[],
		initialValue: string | null,
		keepLabel: string,
	): HTMLSelectElement {
		const fieldEl = parentEl.createEl('label', { cls: 'aulyckanban-task-move-field' });
		fieldEl.createSpan({ cls: 'aulyckanban-task-move-label', text: label });
		const selectEl = fieldEl.createEl('select', { cls: 'aulyckanban-task-move-select' });
		if (initialValue === null) {
			selectEl.createEl('option', { text: keepLabel, attr: { value: '' } });
		}
		for (const option of options) {
			selectEl.createEl('option', { text: option.title, attr: { value: option.id } });
		}
		selectEl.value = initialValue ?? '';
		return selectEl;
	}
}
