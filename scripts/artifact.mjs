import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { compareSemVer, getReleaseChannel, readReleaseVersion } from '../version-bump.mjs';
import { assertCleanGit, runGit, verifyAnnotatedTag } from './git-release.mjs';
import {
	assertExactKeys,
	DISTRIBUTION,
	LEGACY_ARTIFACT_BASENAME,
	LEGACY_ARTIFACT_MAX_VERSION,
	PLUGIN_ID,
	PRODUCT_NAME,
	readJson,
	RELEASE_ARTIFACT_BASENAME,
	RELEASE_FILES,
	RELEASE_PROFILE,
	sha256Buffer,
} from './release-constants.mjs';
import { createZipBuffer, readZipEntries } from './zip.mjs';

const PROVENANCE_KEYS = [
	'releaseProfile',
	'releaseChannel',
	'version',
	'buildNumber',
	'tag',
	'commit',
	'dirty',
	'pluginId',
	'minAppVersion',
	'isDesktopOnly',
	'distribution',
	'artifact',
	'files',
];

function sameNames(actual, expected) {
	return [...actual].sort().join('\0') === [...expected].sort().join('\0');
}

function artifactNames(version, basename) {
	return {
		zip: `${basename}-${version}.zip`,
		provenance: `${basename}-${version}.release-provenance.json`,
	};
}

function acceptedArtifactNames(version) {
	const accepted = [artifactNames(version, RELEASE_ARTIFACT_BASENAME)];
	if (compareSemVer(version, LEGACY_ARTIFACT_MAX_VERSION) <= 0) {
		accepted.push(artifactNames(version, LEGACY_ARTIFACT_BASENAME));
	}
	return accepted;
}

export async function verifyDistArtifacts({ rootDir, distDir = path.join(rootDir, 'dist') } = {}) {
	const names = await readdir(distDir);
	if (!sameNames(names, RELEASE_FILES)) {
		throw new Error(`Release directory must contain only: ${RELEASE_FILES.join(', ')}`);
	}
	const files = [];
	for (const fileName of RELEASE_FILES) {
		const filePath = path.join(distDir, fileName);
		const info = await lstat(filePath);
		if (!info.isFile()) throw new Error(`Release entry must be a regular file: ${fileName}`);
		const data = await readFile(filePath);
		const source = await readFile(path.join(rootDir, fileName));
		if (!data.equals(source)) throw new Error(`Stale dist artifact: dist/${fileName}`);
		files.push({ file: fileName, sha256: sha256Buffer(data), data });
	}
	const manifest = JSON.parse(files.find((entry) => entry.file === 'manifest.json').data);
	if (manifest.id !== PLUGIN_ID) throw new Error(`Unexpected plugin id: ${String(manifest.id)}`);
	if (manifest.name !== PRODUCT_NAME) {
		throw new Error(`Unexpected plugin display name: ${String(manifest.name)}`);
	}
	return { manifest, files };
}

export async function verifyReleaseArtifact({
	repoDir,
	zipPath,
	provenancePath,
	expectedChannel,
	sourceDir,
} = {}) {
	if (!zipPath || !provenancePath) throw new Error('Both ZIP and release provenance are required');
	if (path.extname(zipPath).toLowerCase() !== '.zip')
		throw new Error('Release artifact must be a ZIP file');
	if (!provenancePath.endsWith('.release-provenance.json')) {
		throw new Error('Release provenance must use the *.release-provenance.json suffix');
	}
	const provenance = await readJson(provenancePath);
	assertExactKeys(provenance, PROVENANCE_KEYS, 'release provenance');
	assertExactKeys(provenance.artifact, ['file', 'sha256'], 'release provenance artifact');
	if (!Array.isArray(provenance.files))
		throw new Error('release provenance files must be an array');
	const tagInfo = verifyAnnotatedTag({
		repoDir,
		tag: provenance.tag,
		expectedVersion: provenance.version,
		expectedCommit: provenance.commit,
	});
	const releaseVersion = tagInfo.releaseVersion;
	const channel = getReleaseChannel(releaseVersion.version)?.channel;
	if (!channel || (expectedChannel && channel !== expectedChannel)) {
		throw new Error(`Release channel mismatch: ${String(channel)} != ${String(expectedChannel)}`);
	}
	const zip = await readFile(zipPath);
	const entries = readZipEntries(zip);
	const names = entries.map((entry) => entry.name);
	if (!sameNames(names, RELEASE_FILES)) {
		throw new Error(`ZIP must contain only: ${RELEASE_FILES.join(', ')}`);
	}
	const manifestEntry = entries.find((entry) => entry.name === 'manifest.json');
	const manifest = JSON.parse(manifestEntry.data);
	const zipName = path.basename(zipPath);
	const provenanceName = path.basename(provenancePath);
	const acceptedNames = acceptedArtifactNames(manifest.version);
	const matchingNames = acceptedNames.find((candidate) => candidate.zip === zipName);
	if (!matchingNames || provenance.artifact.file !== zipName) {
		throw new Error(
			`Versioned ZIP name mismatch: expected ${acceptedNames.map((candidate) => candidate.zip).join(' or ')}`,
		);
	}
	if (provenanceName !== matchingNames.provenance) {
		throw new Error(`Release provenance name mismatch: expected ${matchingNames.provenance}`);
	}
	if (
		matchingNames.zip.startsWith(`${RELEASE_ARTIFACT_BASENAME}-`) &&
		manifest.name !== PRODUCT_NAME
	) {
		throw new Error(`Unexpected plugin display name: ${String(manifest.name)}`);
	}
	const expectedFields = {
		releaseProfile: RELEASE_PROFILE,
		releaseChannel: channel,
		version: releaseVersion.version,
		buildNumber: releaseVersion.buildNumber,
		tag: tagInfo.tag,
		commit: tagInfo.commit,
		dirty: false,
		pluginId: manifest.id,
		minAppVersion: manifest.minAppVersion,
		isDesktopOnly: manifest.isDesktopOnly,
		distribution: DISTRIBUTION,
	};
	for (const [field, expected] of Object.entries(expectedFields)) {
		if (provenance[field] !== expected) {
			throw new Error(`Release provenance mismatch: ${field}`);
		}
	}
	if (manifest.id !== PLUGIN_ID || manifest.version !== releaseVersion.version) {
		throw new Error('Plugin manifest identity does not match the tagged release');
	}
	if (provenance.artifact.sha256 !== sha256Buffer(zip)) {
		throw new Error('Release ZIP SHA-256 mismatch');
	}
	const actualFiles = entries.map(({ name, data }) => ({ file: name, sha256: sha256Buffer(data) }));
	for (const file of provenance.files) assertExactKeys(file, ['file', 'sha256'], 'provenance file');
	if (JSON.stringify(provenance.files) !== JSON.stringify(actualFiles)) {
		throw new Error('Release file list or SHA-256 mismatch');
	}
	if (sourceDir) {
		assertCleanGit(sourceDir, 'isolated tagged source');
		const head = runGit(sourceDir, ['rev-parse', 'HEAD']).stdout.trim();
		if (head !== tagInfo.commit)
			throw new Error('Isolated source commit does not match release tag');
		const source = await verifyDistArtifacts({ rootDir: sourceDir });
		for (const file of source.files) {
			const archived = entries.find((entry) => entry.name === file.file);
			if (!archived?.data.equals(file.data)) {
				throw new Error(`ZIP differs from tagged build directory: ${file.file}`);
			}
		}
	}
	return { provenance, manifest, entries, tagInfo };
}

export async function buildReleaseArtifact({
	repoDir,
	sourceDir,
	outputDir,
	expectedChannel,
} = {}) {
	assertCleanGit(sourceDir, 'isolated tagged source before packaging');
	const sourceCommit = runGit(sourceDir, ['rev-parse', 'HEAD']).stdout.trim();
	const releaseVersion = await readReleaseVersion(sourceDir);
	const channel = getReleaseChannel(releaseVersion.version)?.channel;
	if (channel !== expectedChannel) {
		throw new Error(`Release channel mismatch: ${String(channel)} != ${String(expectedChannel)}`);
	}
	const tagInfo = verifyAnnotatedTag({
		repoDir,
		tag: releaseVersion.version,
		expectedVersion: releaseVersion.version,
		expectedCommit: sourceCommit,
	});
	const { manifest, files } = await verifyDistArtifacts({ rootDir: sourceDir });
	await mkdir(outputDir, { recursive: true });
	const { zip: zipName, provenance: provenanceName } = artifactNames(
		manifest.version,
		RELEASE_ARTIFACT_BASENAME,
	);
	const zipPath = path.join(outputDir, zipName);
	const provenancePath = path.join(outputDir, provenanceName);
	const zip = createZipBuffer(files.map(({ file, data }) => ({ name: file, data })));
	await writeFile(zipPath, zip, { flag: 'wx' });
	const provenance = {
		releaseProfile: RELEASE_PROFILE,
		releaseChannel: channel,
		version: releaseVersion.version,
		buildNumber: releaseVersion.buildNumber,
		tag: tagInfo.tag,
		commit: tagInfo.commit,
		dirty: false,
		pluginId: manifest.id,
		minAppVersion: manifest.minAppVersion,
		isDesktopOnly: manifest.isDesktopOnly,
		distribution: DISTRIBUTION,
		artifact: { file: zipName, sha256: sha256Buffer(zip) },
		files: files.map(({ file, sha256 }) => ({ file, sha256 })),
	};
	await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, {
		encoding: 'utf8',
		flag: 'wx',
	});
	assertCleanGit(sourceDir, 'isolated tagged source after packaging');
	await verifyReleaseArtifact({
		repoDir,
		zipPath,
		provenancePath,
		expectedChannel,
		sourceDir,
	});
	return { zipPath, provenancePath, provenance };
}

async function main() {
	if (process.argv[2] !== 'verify-dist') throw new Error('Usage: artifact.mjs verify-dist');
	const rootDir = process.cwd();
	const result = await verifyDistArtifacts({ rootDir });
	const releaseVersion = await readReleaseVersion(rootDir);
	if (result.manifest.version !== releaseVersion.version)
		throw new Error('Dist version drift detected');
	console.log(
		`[artifact] Verified candidate files for ${result.manifest.name} ${result.manifest.version} (plugin id: ${result.manifest.id})`,
	);
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
	try {
		await main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
