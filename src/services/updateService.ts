import {
	compareSemVer,
	parseUpdateManifest,
	type UpdateDownload,
	type UpdateManifest,
	type UpdateSource,
} from './updateManifest';

export const LATEST_MANIFEST_URLS = [
	{
		source: 'github',
		url: 'https://raw.githubusercontent.com/aulyc/aulycKanban-releases/main/latest.json',
	},
	{
		source: 'gitee',
		url: 'https://gitee.com/aulyc/aulycKanban-releases/raw/main/latest.json',
	},
] as const satisfies readonly UpdateDownload[];

export type UpdateFetcher = (url: string) => Promise<ArrayBuffer>;

export type UpdateCheckResult =
	| { status: 'up-to-date'; source: UpdateSource; manifest: UpdateManifest }
	| { status: 'update-available'; source: UpdateSource; manifest: UpdateManifest };

const MAX_MANIFEST_BYTES = 128 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;

function bytes(value: ArrayBuffer | Uint8Array, label: string, maximum: number): Uint8Array {
	if (!(value instanceof ArrayBuffer) && !(value instanceof Uint8Array)) {
		throw new Error(`${label} response is not binary data`);
	}
	if (value.byteLength === 0 || value.byteLength > maximum) {
		throw new Error(`${label} response size is invalid`);
	}
	return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function parseJson(value: ArrayBuffer | Uint8Array, label: string, maximum: number): unknown {
	const data = bytes(value, label, maximum);
	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(data);
	} catch {
		throw new Error(`${label} is not valid UTF-8`);
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new Error(`${label} is not valid JSON`);
	}
}

export class UpdateService {
	constructor(
		private readonly fetch: UpdateFetcher,
		private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
	) {
		if (
			!Number.isSafeInteger(requestTimeoutMs) ||
			requestTimeoutMs < 1 ||
			requestTimeoutMs > 60_000
		) {
			throw new Error('Update request timeout is invalid');
		}
	}

	async check(installedVersion: string): Promise<UpdateCheckResult> {
		let lastError: unknown;
		for (const endpoint of LATEST_MANIFEST_URLS) {
			try {
				const response = await this.fetchWithTimeout(endpoint.url);
				const manifest = parseUpdateManifest(
					parseJson(response, 'Update manifest', MAX_MANIFEST_BYTES),
				);
				return {
					status:
						compareSemVer(manifest.version, installedVersion) > 0
							? 'update-available'
							: 'up-to-date',
					source: endpoint.source,
					manifest,
				};
			} catch (error) {
				lastError = error;
			}
		}
		const failure = new Error('No trusted update manifest is available from GitHub or Gitee');
		(failure as Error & { cause?: unknown }).cause = lastError;
		throw failure;
	}

	private async fetchWithTimeout(url: string): Promise<ArrayBuffer> {
		let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
		const timeout = new Promise<ArrayBuffer>((_resolve, reject) => {
			timeoutId = globalThis.setTimeout(() => {
				reject(new Error(`Update request timed out after ${this.requestTimeoutMs}ms`));
			}, this.requestTimeoutMs);
		});
		try {
			return await Promise.race([this.fetch(url), timeout]);
		} finally {
			if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
		}
	}
}
