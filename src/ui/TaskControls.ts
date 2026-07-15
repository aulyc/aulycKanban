import { Notice, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { t } from '../i18n';
import type { KanbanStore } from '../store';
import { appendAccessibleLabel } from '../utils/dom';
import { normalizeTaskSearchText } from '../utils/taskQuery';
import { createInlineInput } from './InlineInput';

/** 任务区固定控件：统一搜索标签与折叠式新增任务入口。 */
export class TaskControls {
	private readonly el: HTMLElement;
	private readonly store: KanbanStore;
	private isAdding = false;
	private targetViewId = '';
	private targetColumnId = '';

	constructor(parentEl: HTMLElement, _app: App, store: KanbanStore) {
		this.store = store;
		this.el = parentEl.createDiv({ cls: 'aulyckanban-task-controls' });
		this.render();
	}

	render(): void {
		this.el.empty();
		const shellEl = this.el.createDiv({ cls: 'aulyckanban-task-search-shell' });
		const keyword = this.store.getSearchKeyword();
		if (keyword) this.renderSearchTag(shellEl, keyword);
		else this.renderSearchInput(shellEl);
		if (this.store.getTaskScope() === 'archive') {
			this.isAdding = false;
			return;
		}
		if (this.isAdding) this.renderCreateEditor();
		else this.renderAddButton();
	}

	private renderSearchInput(parentEl: HTMLElement): void {
		createInlineInput(parentEl, {
			cls: 'aulyckanban-task-search-input',
			placeholder: t('task.search.placeholder'),
			persistent: true,
			onCommit: (value) => {
				const keyword = value.trim();
				if (!keyword) return false;
				this.store.dispatch({ type: 'SET_SEARCH_QUERY', payload: { keyword } });
				return true;
			},
		});
	}

	private renderSearchTag(parentEl: HTMLElement, keyword: string): void {
		const tagEl = parentEl.createDiv({
			cls: 'aulyckanban-task-search-tag',
			attr: { tabindex: '-1', role: 'group' },
		});
		tagEl.createSpan({ cls: 'aulyckanban-task-search-tag-text', text: keyword });
		const clearBtn = tagEl.createEl('button', {
			cls: 'aulyckanban-task-search-clear',
			attr: { type: 'button', tabindex: '-1' },
		});
		setIcon(clearBtn, 'x');
		appendAccessibleLabel(clearBtn, t('task.search.clear'));
		const clear = (event: MouseEvent | KeyboardEvent): void => {
			event.preventDefault();
			event.stopPropagation();
			this.store.dispatch({ type: 'SET_SEARCH_QUERY', payload: { keyword: '' } });
		};
		clearBtn.addEventListener('click', clear);
		tagEl.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'Delete')
				clear(event);
		});
	}

	private renderAddButton(): void {
		const addBtn = this.el.createEl('button', {
			cls: 'aulyckanban-task-add-btn',
			attr: { type: 'button', tabindex: '-1' },
		});
		addBtn.createSpan({
			cls: 'aulyckanban-task-add-icon',
			text: '+',
			attr: { 'aria-hidden': 'true' },
		});
		appendAccessibleLabel(addBtn, t('task.add'));
		const start = (event: MouseEvent | KeyboardEvent): void => {
			event.preventDefault();
			event.stopPropagation();
			this.isAdding = true;
			this.targetViewId = this.store.getCurrentView();
			this.targetColumnId = this.store.getActiveColumnId();
			this.render();
		};
		addBtn.addEventListener('click', start);
		addBtn.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter' || event.key === ' ') start(event);
		});
	}

	private renderCreateEditor(): void {
		const editorEl = this.el.createDiv({ cls: 'aulyckanban-task-create-editor' });
		editorEl.addEventListener('focusout', () => {
			requestAnimationFrame(() => {
				if (!this.isAdding) return;
				const active = editorEl.ownerDocument.activeElement;
				if (active && editorEl.contains(active)) return;
				this.isAdding = false;
				this.render();
			});
		});
		if (this.store.getTaskScope() === 'all') {
			this.renderTargetSelect(
				editorEl,
				'aulyckanban-task-create-view-select',
				t('task.target.view'),
				this.store.getTaskViews().map((view) => ({ id: view.id, title: view.title })),
				this.targetViewId,
				(value) => {
					this.targetViewId = value;
				},
			);
		}
		if (this.store.getColumnScope() === 'all') {
			this.renderTargetSelect(
				editorEl,
				'aulyckanban-task-create-column-select',
				t('task.target.column'),
				this.store.getCurrentColumns().map((column) => ({ id: column.id, title: column.title })),
				this.targetColumnId,
				(value) => {
					this.targetColumnId = value;
				},
			);
		}
		createInlineInput(editorEl, {
			multiline: true,
			cls: 'aulyckanban-task-create-input',
			placeholder: t('task.inputPlaceholder'),
			focusOnMount: true,
			blurBehavior: 'none',
			onCommit: (value) => {
				const content = value.trim();
				if (!content || !this.targetViewId || !this.targetColumnId) return false;
				this.isAdding = false;
				this.store.dispatch({
					type: 'ADD_TASK',
					payload: {
						viewId: this.targetViewId,
						columnId: this.targetColumnId,
						content,
					},
				});
				const keyword = normalizeTaskSearchText(this.store.getSearchKeyword());
				if (keyword && !normalizeTaskSearchText(content).includes(keyword)) {
					new Notice(t('task.addedOutsideSearch'));
				}
				return true;
			},
			onCancel: () => {
				this.isAdding = false;
				this.render();
			},
		});
	}

	private renderTargetSelect(
		parentEl: HTMLElement,
		className: string,
		accessibleName: string,
		options: Array<{ id: string; title: string }>,
		value: string,
		onChange: (value: string) => void,
	): void {
		const labelEl = parentEl.createEl('label', {
			cls: 'aulyckanban-task-create-target-label',
		});
		appendAccessibleLabel(labelEl, accessibleName);
		const selectEl = labelEl.createEl('select', {
			cls: `aulyckanban-task-create-target ${className}`,
			attr: { tabindex: '-1' },
		});
		for (const option of options) {
			selectEl.createEl('option', { text: option.title, attr: { value: option.id } });
		}
		selectEl.value = value;
		selectEl.addEventListener('change', () => onChange(selectEl.value));
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
