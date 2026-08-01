import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

const renderedButtons = [];

class MockElement {
	constructor(tagName = 'div', options = {}) {
		this.tagName = tagName;
		this.children = [];
		this.classes = new Set(
			String(options.cls ?? '')
				.split(/\s+/)
				.filter(Boolean),
		);
		this.textContent = options.text ?? '';
		this.attributes = new Map();
	}
	append(child) {
		child.parentElement = this;
		this.children.push(child);
		return child;
	}
	createDiv(options = {}) {
		return this.append(new MockElement('div', options));
	}
	createEl(tagName, options = {}) {
		return this.append(new MockElement(tagName, options));
	}
	createSpan(options = {}) {
		return this.append(new MockElement('span', options));
	}
	addClass(value) {
		this.classes.add(value);
	}
	setAttribute(name, value) {
		this.attributes.set(name, value);
	}
	setText(value) {
		this.textContent = value;
	}
	click() {
		this.clicked = true;
	}
	remove() {
		this.removed = true;
	}
	empty() {
		this.children = [];
		this.textContent = '';
	}
}

class MockModal {
	constructor(app) {
		this.app = app;
		this.contentEl = new MockElement();
		this.modalEl = new MockElement();
		this.titleEl = new MockElement();
	}
	setTitle(value) {
		this.titleEl.empty();
		this.titleEl.textContent = value;
	}
	open() {
		this.onOpen();
	}
	close() {
		this.onClose();
	}
}

class MockSetting {
	constructor(element) {
		this.element = element;
	}
	addButton(callback) {
		const button = {
			setButtonText: (value) => {
				button.text = value;
				return button;
			},
			setCta: () => button,
			setDisabled: (value) => {
				button.disabled = value;
				return button;
			},
			onClick: (handler) => {
				button.onClick = handler;
				return button;
			},
		};
		callback(button);
		renderedButtons.push(button);
		return this;
	}
}

const translations = {
	'update.title': 'aulycKanban 更新',
	'update.currentVersion': '当前版本',
	'update.availableVersion': '可用版本',
	'update.source': '检查来源',
	'update.source.github': 'GitHub',
	'update.source.gitee': 'Gitee（备用镜像）',
	'update.downloadHint': '发现新版本，可前往正式下载页面手动下载安装。',
	'update.openDownloadPage': '打开下载页面',
};

const { UpdateModal } = await loadSourceModule('src/ui/UpdateModal.ts', {
	label: 'update-modal',
	mocks: {
		obsidian: {
			App: class {},
			Modal: MockModal,
			Setting: MockSetting,
			setIcon: (element, icon) => element.setAttribute('data-icon', icon),
		},
		'../i18n': { t: (key) => translations[key] ?? key },
	},
});

function descendants(element) {
	return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function options() {
	return {
		currentVersion: '2.8.2',
		manifest: {
			version: '2.9.0',
			releasePageURL: 'https://github.com/aulyc/aulycKanban-releases/releases/tag/2.9.0',
		},
		source: 'gitee',
	};
}

test('update modal only opens the formal download page after explicit user action', () => {
	const start = renderedButtons.length;
	const modal = new UpdateModal({}, options());
	modal.open();

	assert.equal(modal.modalEl.classes.has('aulyckanban-update-modal'), true);
	const texts = descendants(modal.contentEl).map(({ textContent }) => textContent);
	assert.ok(texts.includes('2.8.2'));
	assert.ok(texts.includes('2.9.0'));
	assert.ok(texts.includes('Gitee（备用镜像）'));
	assert.ok(texts.includes('发现新版本，可前往正式下载页面手动下载安装。'));
	assert.equal(
		texts.some((text) => /签名|验证|下载并验证/u.test(text)),
		false,
	);

	const buttons = renderedButtons.slice(start);
	assert.equal(buttons.length, 1);
	assert.equal(buttons[0].text, '打开下载页面');
	buttons[0].onClick();
	const link = descendants(modal.contentEl).find((element) => element.tagName === 'a');
	assert.equal(link.attributes.get('href'), options().manifest.releasePageURL);
	assert.equal(link.attributes.get('rel'), 'noopener noreferrer');
	assert.equal(link.clicked, true);
	assert.equal(link.removed, true);

	modal.close();
	assert.equal(modal.contentEl.children.length, 0);
});

test('update modal uses a responsive bounded layout', () => {
	const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
	const rule = css.match(/\.modal\.aulyckanban-update-modal\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(rule, /width:\s*min\(520px,\s*calc\(100vw\s*-\s*32px\)\)/);
	assert.match(css, /\.aulyckanban-update-metadata-row/);
});
