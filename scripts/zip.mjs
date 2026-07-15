import { inflateRawSync } from 'node:zlib';

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;
const UNIX_FILE_MODE = 0o100644;

const crcTable = Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit += 1) {
		value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
	}
	return value >>> 0;
});

export function crc32(buffer) {
	let crc = 0xffffffff;
	for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

export function createZipBuffer(entries) {
	const localParts = [];
	const centralParts = [];
	let offset = 0;

	for (const entry of entries) {
		const name = Buffer.from(entry.name, 'utf8');
		const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
		const crc = crc32(data);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(LOCAL_SIGNATURE, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(UTF8_FLAG, 6);
		local.writeUInt16LE(0, 8);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(name.length, 26);
		localParts.push(local, name, data);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
		central.writeUInt16LE((3 << 8) | 20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(UTF8_FLAG, 8);
		central.writeUInt16LE(0, 10);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt32LE(((entry.mode ?? UNIX_FILE_MODE) << 16) >>> 0, 38);
		central.writeUInt32LE(offset, 42);
		centralParts.push(central, name);
		offset += local.length + name.length + data.length;
	}

	const centralDirectory = Buffer.concat(centralParts);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
	eocd.writeUInt16LE(entries.length, 8);
	eocd.writeUInt16LE(entries.length, 10);
	eocd.writeUInt32LE(centralDirectory.length, 12);
	eocd.writeUInt32LE(offset, 16);
	return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function findEocd(buffer) {
	const minimum = Math.max(0, buffer.length - 65_557);
	for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
		if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
	}
	throw new Error('ZIP end-of-central-directory record is missing');
}

function validateEntryPath(name) {
	if (!name || name.includes('\0') || name.includes('\\') || name.includes('/')) {
		throw new Error(`ZIP entry must be a root-level file: ${JSON.stringify(name)}`);
	}
	if (name === '.' || name === '..' || /^[A-Za-z]:/u.test(name)) {
		throw new Error(`Unsafe ZIP entry path: ${JSON.stringify(name)}`);
	}
}

export function readZipEntries(buffer) {
	if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('Invalid ZIP file');
	const eocdOffset = findEocd(buffer);
	const disk = buffer.readUInt16LE(eocdOffset + 4);
	const centralDisk = buffer.readUInt16LE(eocdOffset + 6);
	const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
	const entryCount = buffer.readUInt16LE(eocdOffset + 10);
	const centralSize = buffer.readUInt32LE(eocdOffset + 12);
	const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
	const commentLength = buffer.readUInt16LE(eocdOffset + 20);
	if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
		throw new Error('Multi-disk ZIP files are not supported');
	}
	if (eocdOffset + 22 + commentLength !== buffer.length) throw new Error('Malformed ZIP trailer');
	if (centralOffset + centralSize !== eocdOffset) throw new Error('Malformed ZIP central directory');

	const entries = [];
	const seen = new Set();
	let centralCursor = centralOffset;
	for (let index = 0; index < entryCount; index += 1) {
		if (centralCursor + 46 > eocdOffset
			|| buffer.readUInt32LE(centralCursor) !== CENTRAL_SIGNATURE) {
			throw new Error('Malformed ZIP central entry');
		}
		const flags = buffer.readUInt16LE(centralCursor + 8);
		const method = buffer.readUInt16LE(centralCursor + 10);
		const crc = buffer.readUInt32LE(centralCursor + 16);
		const compressedSize = buffer.readUInt32LE(centralCursor + 20);
		const uncompressedSize = buffer.readUInt32LE(centralCursor + 24);
		const nameLength = buffer.readUInt16LE(centralCursor + 28);
		const extraLength = buffer.readUInt16LE(centralCursor + 30);
		const entryCommentLength = buffer.readUInt16LE(centralCursor + 32);
		const externalAttributes = buffer.readUInt32LE(centralCursor + 38);
		const localOffset = buffer.readUInt32LE(centralCursor + 42);
		const centralEnd = centralCursor + 46 + nameLength + extraLength + entryCommentLength;
		if (centralEnd > eocdOffset) throw new Error('Malformed ZIP central entry length');
		if ((flags & 0x0001) !== 0 || (flags & 0x0008) !== 0) {
			throw new Error('Encrypted or data-descriptor ZIP entries are not allowed');
		}
		if (![0, 8].includes(method)) throw new Error(`Unsupported ZIP compression method: ${method}`);
		const name = buffer.subarray(centralCursor + 46, centralCursor + 46 + nameLength).toString('utf8');
		validateEntryPath(name);
		if (seen.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`);
		seen.add(name);
		const mode = (externalAttributes >>> 16) & 0xffff;
		if ((mode & 0o170000) === 0o120000) throw new Error(`Symbolic links are not allowed: ${name}`);

		if (localOffset + 30 > centralOffset
			|| buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
			throw new Error(`Malformed local ZIP entry: ${name}`);
		}
		const localFlags = buffer.readUInt16LE(localOffset + 6);
		const localMethod = buffer.readUInt16LE(localOffset + 8);
		const localNameLength = buffer.readUInt16LE(localOffset + 26);
		const localExtraLength = buffer.readUInt16LE(localOffset + 28);
		const localNameStart = localOffset + 30;
		const localName = buffer.subarray(localNameStart, localNameStart + localNameLength).toString('utf8');
		if (localName !== name || localFlags !== flags || localMethod !== method) {
			throw new Error(`ZIP local and central metadata differ: ${name}`);
		}
		const dataStart = localNameStart + localNameLength + localExtraLength;
		const dataEnd = dataStart + compressedSize;
		if (dataEnd > centralOffset) throw new Error(`ZIP entry exceeds archive bounds: ${name}`);
		const compressed = buffer.subarray(dataStart, dataEnd);
		const data = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
		if (data.length !== uncompressedSize || crc32(data) !== crc) {
			throw new Error(`ZIP entry size or CRC mismatch: ${name}`);
		}
		entries.push({ name, data, mode });
		centralCursor = centralEnd;
	}
	if (centralCursor !== eocdOffset) throw new Error('ZIP central directory contains trailing data');
	return entries;
}
