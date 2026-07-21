import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

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

	empty() {
		this.children = [];
		this.textContent = '';
	}
}

class MockModal {
	constructor(app) {
		this.app = app;
		this.contentEl = new MockElement('div');
		this.modalEl = new MockElement('div');
		this.titleEl = new MockElement('div');
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

const translations = {
	'about.title': '关于 aulycKanban',
	'about.version': '插件版本',
	'about.requirements': '软件要求',
	'about.introduction': '应用介绍',
	'about.website': '官方网站',
	'about.acknowledgements': '致谢',
};

const { AboutModal } = await loadSourceModule(new URL('../src/ui/AboutModal.ts', import.meta.url), {
	label: 'about-modal',
	mocks: {
		obsidian: {
			App: class {},
			Modal: MockModal,
			setIcon: (element, icon) => element.setAttribute('data-icon', icon),
		},
		'../i18n': { t: (key) => translations[key] ?? key },
	},
});

function descendants(element) {
	return element.children.flatMap((child) => [child, ...descendants(child)]);
}

test('about modal renders identity, overview, website, and acknowledgements', () => {
	const modal = new AboutModal({}, '2.8.1-beta.6', '1.5.0');
	modal.open();

	assert.equal(modal.modalEl.classes.has('aulyckanban-about-modal'), true);
	const titleElements = descendants(modal.titleEl);
	assert.equal(titleElements[0].attributes.get('data-icon'), 'info');
	assert.equal(titleElements[0].attributes.get('aria-hidden'), 'true');
	assert.equal(titleElements[1].textContent, '关于 aulycKanban');

	const contentElements = descendants(modal.contentEl);
	const contentText = contentElements.map((element) => element.textContent);
	assert.ok(contentText.includes('2.8.1-beta.6'));
	assert.ok(contentText.includes('Obsidian 1.5.0+'));
	assert.ok(contentText.includes('应用介绍'));
	assert.ok(contentText.includes('官方网站'));
	assert.ok(contentText.includes('致谢'));
	assert.ok(contentText.includes('about.introduction.line1'));
	assert.ok(contentText.includes('about.acknowledgements.line5'));

	const websiteLink = contentElements.find((element) => element.tagName === 'a');
	assert.ok(websiteLink);
	assert.equal(websiteLink.textContent, 'https://aulyc.com');
	assert.equal(websiteLink.attributes.get('href'), 'https://aulyc.com');
	assert.equal(websiteLink.attributes.get('target'), '_blank');
	assert.equal(websiteLink.attributes.get('rel'), 'noopener noreferrer');

	modal.close();
	assert.equal(modal.contentEl.children.length, 0);
});

test('about modal uses a responsive information-card layout', () => {
	const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
	const modalRule = css.match(/\.modal\.aulyckanban-about-modal\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(modalRule, /width:\s*min\(520px,\s*calc\(100vw\s*-\s*32px\)\)/);
	assert.match(modalRule, /max-height:\s*calc\(100vh\s*-\s*32px\)/);
	assert.match(css, /@media \(max-width:\s*500px\)/);
});
