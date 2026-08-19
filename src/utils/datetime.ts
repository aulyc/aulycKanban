import { getCurrentLocale } from '../i18n';

/**
 * 格式化完整日期时间（YYYY/MM/DD HH:mm:ss 或对应 locale 样式）
 */
export function formatDateTime(isoStr: string | Date): string {
	try {
		const date = isoStr instanceof Date ? isoStr : new Date(isoStr);
		if (Number.isNaN(date.getTime())) return '';
		const locale = getCurrentLocale();
		return date.toLocaleString(locale, {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
		});
	} catch {
		return '';
	}
}

/**
 * 分别格式化分钟级日期与时间，供完整分钟级时间字符串组合使用。
 */
export function formatDateTimeMinuteParts(isoStr: string): { date: string; time: string } {
	try {
		const date = new Date(isoStr);
		if (Number.isNaN(date.getTime())) return { date: '', time: '' };
		const locale = getCurrentLocale();
		return {
			date: date.toLocaleDateString(locale, {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
			}),
			time: date.toLocaleTimeString(locale, {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
			}),
		};
	} catch {
		return { date: '', time: '' };
	}
}

/**
 * 格式化到分钟级（YYYY/MM/DD HH:mm）
 */
export function formatDateTimeMinute(isoStr: string): string {
	const parts = formatDateTimeMinuteParts(isoStr);
	return parts.date && parts.time ? `${parts.date} ${parts.time}` : '';
}

/** 生成文件名安全、固定宽度的本地时间戳。 */
export function formatFileTimestamp(date: Date): string {
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0'),
		'-',
		String(date.getHours()).padStart(2, '0'),
		String(date.getMinutes()).padStart(2, '0'),
		String(date.getSeconds()).padStart(2, '0'),
	].join('');
}
