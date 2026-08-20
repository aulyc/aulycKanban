/** 普通任务与归档任务共享的临时多选状态；不写入看板数据。 */
export class TaskSelection {
	private readonly selectedKeys = new Set<string>();
	private anchorKey: string | null = null;
	private scopeKey = '';
	private active = false;

	get isActive(): boolean {
		return this.active;
	}

	get size(): number {
		return this.selectedKeys.size;
	}

	get keys(): string[] {
		return [...this.selectedKeys];
	}

	activate(): void {
		this.active = true;
	}

	deactivate(): void {
		this.active = false;
		this.selectedKeys.clear();
		this.anchorKey = null;
	}

	isSelected(key: string): boolean {
		return this.selectedKeys.has(key);
	}

	toggle(key: string): void {
		this.active = true;
		if (this.selectedKeys.has(key)) this.selectedKeys.delete(key);
		else this.selectedKeys.add(key);
		this.anchorKey = key;
	}

	selectOnly(key: string): void {
		this.active = true;
		this.selectedKeys.clear();
		this.selectedKeys.add(key);
		this.anchorKey = key;
	}

	selectRange(targetKey: string, visibleKeys: readonly string[]): void {
		this.active = true;
		const anchorIndex = this.anchorKey ? visibleKeys.indexOf(this.anchorKey) : -1;
		const targetIndex = visibleKeys.indexOf(targetKey);
		if (anchorIndex < 0 || targetIndex < 0) {
			this.selectOnly(targetKey);
			return;
		}
		this.selectedKeys.clear();
		const start = Math.min(anchorIndex, targetIndex);
		const end = Math.max(anchorIndex, targetIndex);
		for (const key of visibleKeys.slice(start, end + 1)) this.selectedKeys.add(key);
	}

	selectAll(visibleKeys: readonly string[]): void {
		this.active = true;
		const allVisibleSelected =
			visibleKeys.length > 0 && visibleKeys.every((key) => this.selectedKeys.has(key));
		if (allVisibleSelected) {
			for (const key of visibleKeys) this.selectedKeys.delete(key);
			return;
		}
		for (const key of visibleKeys) this.selectedKeys.add(key);
		this.anchorKey = visibleKeys[0] ?? this.anchorKey;
	}

	prune(validKeys: ReadonlySet<string>): void {
		for (const key of this.selectedKeys) {
			if (!validKeys.has(key)) this.selectedKeys.delete(key);
		}
		if (this.anchorKey && !validKeys.has(this.anchorKey)) this.anchorKey = null;
	}

	resetForScope(nextScopeKey: string): void {
		if (!this.scopeKey) {
			this.scopeKey = nextScopeKey;
			return;
		}
		if (this.scopeKey === nextScopeKey) return;
		this.scopeKey = nextScopeKey;
		this.deactivate();
	}
}
