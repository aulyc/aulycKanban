/**
 * 去抖函数
 * @param fn 需要去抖的函数
 * @param delay 延迟时间（毫秒）
 * @returns 去抖后的函数（带 cancel 方法）
 */
export function debounce<T extends (...args: unknown[]) => void>(
	fn: T,
	delay: number,
): T & { cancel: () => void } {
	let timer: ReturnType<typeof setTimeout> | null = null;

	const debounced = ((...args: unknown[]) => {
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			fn(...args);
			timer = null;
		}, delay);
	}) as T & { cancel: () => void };

	debounced.cancel = () => {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	};

	return debounced;
}
