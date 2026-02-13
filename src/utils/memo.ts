import { PERFORMANCE } from '../constants';

/**
 * 带大小限制的缓存 Map
 * 当超出最大条目数时自动修剪旧条目
 */
export class BoundedCache<K, V> {
	private cache: Map<K, V> = new Map();
	private readonly maxSize: number;
	private readonly trimSize: number;

	constructor(
		maxSize: number = PERFORMANCE.MAX_CACHE_SIZE,
		trimSize: number = PERFORMANCE.CACHE_TRIM_SIZE,
	) {
		this.maxSize = maxSize;
		this.trimSize = trimSize;
	}

	get(key: K): V | undefined {
		return this.cache.get(key);
	}

	has(key: K): boolean {
		return this.cache.has(key);
	}

	set(key: K, value: V): void {
		this.cache.set(key, value);
		this.trimIfNeeded();
	}

	/** 删除指定前缀的缓存（用于清除某列的排序缓存） */
	deleteByPrefix(prefix: string): void {
		for (const key of this.cache.keys()) {
			if (String(key).startsWith(prefix)) {
				this.cache.delete(key);
			}
		}
	}

	clear(): void {
		this.cache.clear();
	}

	get size(): number {
		return this.cache.size;
	}

	private trimIfNeeded(): void {
		if (this.cache.size > this.maxSize) {
			const entries = Array.from(this.cache.entries());
			this.cache = new Map(entries.slice(-this.trimSize));
		}
	}
}
