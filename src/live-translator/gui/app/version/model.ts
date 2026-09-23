import type { UnknownRecord } from '../types.js';
import { falsyFallback, isUnknownRecord, propertyValue, stringValue } from '../types.js';
export const VERSION_ALIASES_MAX_ENTRIES = 64;
export const VERSION_ALIASES_FIELD_NAME = 'version-aliases';
export const AVAILABLE_VERSIONS_MAX_ENTRIES = 512;
export const AVAILABLE_VERSIONS_FIELD_NAME = 'available-versions';
export const LATEST_FIELD_NAME = 'latest';
export const LATEST_BETA_INTERNAL_FIELD_NAME = 'latestBeta';
export const RECOMMENDED_FIELD_NAME = 'recommended';
export const RECOMMENDED_BETA_REMOTE_FIELD_NAME = 'recommended-beta';
export const LOCAL_VERSION_PATTERN = /^local[A-Za-z0-9._-]*$/u;
export interface ParsedUpdateVersion {
    version: string;
    major: number;
    minor: number;
    patch: number;
    beta: number | null;
    stable: boolean;
}
export interface VersionAlias {
    source: ParsedUpdateVersion;
    target: ParsedUpdateVersion;
}
export type AvailableVersions = Record<string, string>;
export interface LatestVersionTargets {
    rawLatest: ParsedUpdateVersion;
    rawLatestBeta: ParsedUpdateVersion | null;
    latest: ParsedUpdateVersion;
    latestBeta: ParsedUpdateVersion | null;
    versionAliases: VersionAlias[];
}
export interface VersionCheckResult {
    status: 'local' | 'error' | 'latest' | 'ahead' | 'update' | 'missing';
    message: string;
    logMessage: string;
    targetVersion: string;
    currentVersion: string;
}
export function normalizeVersionString(value: unknown): string {
    const parsed = parseUpdateVersion(value);
    return parsed ? parsed.version : normalizeLocalVersionString(value);
}
export function normalizeLocalVersionString(value: unknown): string {
    if (typeof value !== 'string')
        return '';
    const version = value.trim();
    if (!version || version.length > 64)
        return '';
    return LOCAL_VERSION_PATTERN.test(version) ? version : '';
}
export function isLocalVersionString(value: unknown): boolean {
    return !!normalizeLocalVersionString(value);
}
export function parseUpdateVersion(value: unknown): ParsedUpdateVersion | null {
    if (typeof value !== 'string' && typeof value !== 'number')
        return null;
    const version = String(value).trim();
    if (!version || version.length > 64)
        return null;
    const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:b(0|[1-9][0-9]*))?$/u.exec(version);
    if (!match)
        return null;
    const major = parseSafeVersionNumber(match[1]);
    const minor = parseSafeVersionNumber(match[2]);
    const patch = parseSafeVersionNumber(match[3]);
    const hasBeta = match[4] !== undefined;
    const beta = hasBeta ? parseSafeVersionNumber(match[4]) : null;
    if (major === null || minor === null || patch === null || (hasBeta && beta === null))
        return null;
    return {
        version,
        major,
        minor,
        patch,
        beta,
        stable: beta === null,
    };
}
export function parseSafeVersionNumber(value: unknown): number | null {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
export function compareUpdateVersions(leftValue: unknown, rightValue: unknown): -1 | 0 | 1 {
    const left = parseUpdateVersion(leftValue);
    const right = parseUpdateVersion(rightValue);
    if (!left || !right) {
        throw new Error('invalid update version');
    }
    return compareParsedUpdateVersions(left, right);
}
export function compareParsedUpdateVersions(left: ParsedUpdateVersion, right: ParsedUpdateVersion): -1 | 0 | 1 {
    for (const key of ['major', 'minor', 'patch'] as const) {
        if (left[key] > right[key])
            return 1;
        if (left[key] < right[key])
            return -1;
    }
    if (left.beta === right.beta)
        return 0;
    if (left.beta === null)
        return 1;
    if (right.beta === null)
        return -1;
    return left.beta > right.beta ? 1 : -1;
}
export function normalizeVersionAliases(value: unknown): VersionAlias[] {
    if (value === undefined)
        return [];
    if (!isUnknownRecord(value)) {
        throw new Error('version payload "version-aliases" must be a version map');
    }
    const entries = Object.keys(value);
    if (entries.length > VERSION_ALIASES_MAX_ENTRIES) {
        throw new Error('version payload version aliases have too many entries');
    }
    const aliases: VersionAlias[] = [];
    entries.forEach((rawSource) => {
        addVersionAliasPair(aliases, rawSource, value[rawSource]);
    });
    validateVersionAliasGraph(aliases);
    return aliases;
}
export function addVersionAliasPair(aliases: VersionAlias[], rawSource: unknown, rawTarget: unknown): void {
    const source = parseUpdateVersion(rawSource);
    const target = parseUpdateVersion(rawTarget);
    if (!source || !target) {
        throw new Error('version payload version aliases contain an invalid version');
    }
    if (source.version !== target.version)
        aliases.push({ source, target });
}
export function validateVersionAliasGraph(aliases: readonly VersionAlias[]): void {
    aliases.forEach((alias) => {
        resolveVersionAlias(alias.source, aliases);
    });
}
export function serializeVersionAliases(aliases: readonly VersionAlias[]): Record<string, string> {
    const map: Record<string, string> = {};
    if (!aliases.length)
        return map;
    aliases.forEach((alias) => {
        map[alias.source.version] = alias.target.version;
    });
    return map;
}
export function normalizeAvailableVersions(value: unknown): AvailableVersions {
    if (!isUnknownRecord(value)) {
        throw new Error('version payload "available-versions" must be a version map');
    }
    const entries = Object.keys(value);
    if (entries.length > AVAILABLE_VERSIONS_MAX_ENTRIES) {
        throw new Error('version payload available versions have too many entries');
    }
    const versions: AvailableVersions = {};
    entries.forEach((rawVersion) => {
        const parsed = parseUpdateVersion(rawVersion);
        if (!parsed) {
            throw new Error('version payload available versions contain an invalid version');
        }
        versions[parsed.version] = normalizeAvailableVersionGroup(value[rawVersion]);
    });
    return versions;
}
export function normalizeAvailableVersionGroup(value: unknown): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(value)) {
        throw new Error('version payload available version groups must be safe identifiers');
    }
    return value;
}
export function serializeAvailableVersions(availableVersions: AvailableVersions): AvailableVersions {
    return Object.assign({}, availableVersions);
}
export function assertRecommendedVersionIsAvailable(parsed: ParsedUpdateVersion | null, availableVersions: AvailableVersions, fieldName: string): void {
    if (!parsed)
        return;
    if (!Object.hasOwn(availableVersions, parsed.version)) {
        throw new Error(`version payload "${fieldName}" must be listed in "available-versions"`);
    }
}
export function getVersionAliasesValue(value: unknown): unknown {
    if (!isUnknownRecord(value))
        return undefined;
    return Object.hasOwn(value, VERSION_ALIASES_FIELD_NAME) ? value[VERSION_ALIASES_FIELD_NAME] : undefined;
}
export function resolveVersionAlias(parsed: ParsedUpdateVersion, aliases: readonly VersionAlias[]): ParsedUpdateVersion;
export function resolveVersionAlias(parsed: null, aliases: readonly VersionAlias[]): null;
export function resolveVersionAlias(parsed: ParsedUpdateVersion | null, aliases: readonly VersionAlias[]): ParsedUpdateVersion | null;
export function resolveVersionAlias(parsed: ParsedUpdateVersion | null, aliases: readonly VersionAlias[]): ParsedUpdateVersion | null {
    if (!parsed)
        return null;
    if (!aliases.length)
        return parsed;
    const bySource = new Map<string, ParsedUpdateVersion>();
    aliases.forEach((alias) => {
        bySource.set(alias.source.version, alias.target);
    });
    let current = parsed;
    const seen = new Set<string>();
    for (;;) {
        if (seen.has(current.version)) {
            throw new Error('version payload version aliases contain a cycle');
        }
        seen.add(current.version);
        const target = bySource.get(current.version);
        if (!target)
            return current;
        current = target;
    }
}
export function parseVersionPayload(text: unknown): UnknownRecord {
    const parsedPayload: unknown = JSON.parse(stringValue(falsyFallback(text, '')).replace(/^\uFEFF/u, ''));
    if (!isUnknownRecord(parsedPayload)) {
        throw new Error('version payload must be a JSON object');
    }
    const payload = parsedPayload;
    if (Object.hasOwn(payload, LATEST_BETA_INTERNAL_FIELD_NAME)) {
        throw new Error('version payload must use "recommended-beta", not "latestBeta"');
    }
    const recommended = readVersionPayloadField(payload, RECOMMENDED_FIELD_NAME);
    if (!Object.hasOwn(payload, RECOMMENDED_BETA_REMOTE_FIELD_NAME)) {
        throw new Error('version payload missing "recommended-beta"');
    }
    const recommendedBetaValue = payload[RECOMMENDED_BETA_REMOTE_FIELD_NAME];
    let recommendedBeta = null;
    if (recommendedBetaValue !== '') {
        recommendedBeta = readVersionPayloadField(payload, RECOMMENDED_BETA_REMOTE_FIELD_NAME);
    }
    const availableVersions = normalizeAvailableVersions(payload[AVAILABLE_VERSIONS_FIELD_NAME]);
    assertRecommendedVersionIsAvailable(recommended, availableVersions, RECOMMENDED_FIELD_NAME);
    assertRecommendedVersionIsAvailable(recommendedBeta, availableVersions, RECOMMENDED_BETA_REMOTE_FIELD_NAME);
    const versionAliases = normalizeVersionAliases(getVersionAliasesValue(payload));
    const targets = createLatestVersionTargets(recommended, recommendedBeta, versionAliases);
    const result = {
        latest: targets.rawLatest.version,
        [LATEST_BETA_INTERNAL_FIELD_NAME]: targets.rawLatestBeta ? targets.rawLatestBeta.version : '',
        [VERSION_ALIASES_FIELD_NAME]: serializeVersionAliases(targets.versionAliases),
        [AVAILABLE_VERSIONS_FIELD_NAME]: serializeAvailableVersions(availableVersions),
    };
    return result;
}
export function readVersionPayloadField(payload: UnknownRecord, fieldName: string): ParsedUpdateVersion {
    if (!Object.hasOwn(payload, fieldName)) {
        throw new Error(`version payload missing "${fieldName}"`);
    }
    if (typeof payload[fieldName] !== 'string') {
        throw new Error(`version payload "${fieldName}" must be a version string`);
    }
    const parsed = parseUpdateVersion(payload[fieldName]);
    if (!parsed) {
        throw new Error(`version payload "${fieldName}" must be a valid version`);
    }
    return parsed;
}
export function normalizeLatestVersions(value: unknown): LatestVersionTargets {
    if (!isUnknownRecord(value)) {
        throw new Error('latest version payload must be a version object');
    }
    if (Object.hasOwn(value, RECOMMENDED_BETA_REMOTE_FIELD_NAME)) {
        throw new Error('latest version payload must be normalized before version selection');
    }
    const latest = readInternalLatestField(value, LATEST_FIELD_NAME);
    if (!Object.hasOwn(value, LATEST_BETA_INTERNAL_FIELD_NAME)) {
        throw new Error('latest version payload missing "latestBeta"');
    }
    let latestBeta = null;
    if (value[LATEST_BETA_INTERNAL_FIELD_NAME] !== '') {
        latestBeta = readInternalLatestField(value, LATEST_BETA_INTERNAL_FIELD_NAME);
    }
    const versionAliases = normalizeVersionAliases(getVersionAliasesValue(value));
    return createLatestVersionTargets(latest, latestBeta, versionAliases);
}
export function readInternalLatestField(payload: UnknownRecord, fieldName: string): ParsedUpdateVersion {
    if (!Object.hasOwn(payload, fieldName)) {
        throw new Error(`latest version payload missing "${fieldName}"`);
    }
    const parsed = parseUpdateVersion(payload[fieldName]);
    if (!parsed) {
        throw new Error(`latest version payload "${fieldName}" is invalid`);
    }
    return parsed;
}
export function createLatestVersionTargets(rawLatest: ParsedUpdateVersion, rawLatestBeta: ParsedUpdateVersion | null, versionAliases: VersionAlias[]): LatestVersionTargets {
    const latest = resolveVersionAlias(rawLatest, versionAliases);
    const latestBeta = rawLatestBeta ? resolveVersionAlias(rawLatestBeta, versionAliases) : null;
    return {
        rawLatest,
        rawLatestBeta,
        latest,
        latestBeta,
        versionAliases,
    };
}
export function getHighestUpdateVersion(left: ParsedUpdateVersion | null, right: ParsedUpdateVersion | null): ParsedUpdateVersion | null {
    if (!left)
        return right ?? null;
    if (!right)
        return left;
    return compareParsedUpdateVersions(left, right) >= 0 ? left : right;
}
export function getEligibleUpdateTarget(installed: ParsedUpdateVersion | null, latestVersions: LatestVersionTargets): ParsedUpdateVersion | null {
    if (!installed)
        return latestVersions.latest;
    if (installed.stable) {
        return compareParsedUpdateVersions(installed, latestVersions.latest) < 0 ? latestVersions.latest : null;
    }
    const target = getHighestUpdateVersion(latestVersions.latest, latestVersions.latestBeta);
    return target && compareParsedUpdateVersions(installed, target) < 0 ? target : null;
}
export function getNoUpdateStatus(installed: ParsedUpdateVersion | null, latestVersions: LatestVersionTargets): 'latest' | 'ahead' {
    if (!installed)
        return 'latest';
    const target = installed.stable
        ? latestVersions.latest
        : getHighestUpdateVersion(latestVersions.latest, latestVersions.latestBeta);
    if (target && compareParsedUpdateVersions(installed, target) > 0) {
        return 'ahead';
    }
    return 'latest';
}
export function getVersionCheckResult(installedVersion: unknown, latestVersion: unknown): VersionCheckResult {
    const localVersion = normalizeLocalVersionString(installedVersion);
    if (localVersion) {
        return {
            status: 'local',
            message: 'Local development build',
            logMessage: '',
            targetVersion: '',
            currentVersion: localVersion,
        };
    }
    const installed = parseUpdateVersion(installedVersion);
    let latestVersions: LatestVersionTargets;
    let effectiveInstalled: ParsedUpdateVersion | null;
    try {
        latestVersions = normalizeLatestVersions(latestVersion);
        effectiveInstalled = resolveVersionAlias(installed, latestVersions.versionAliases);
    }
    catch (err) {
        const message = falsyFallback(propertyValue(err, 'message'), 'invalid latest version payload');
        return {
            status: 'error',
            message: 'Update check failed',
            logMessage: `Update check failed: ${stringValue(message)}.`,
            targetVersion: '',
            currentVersion: installed ? installed.version : '',
        };
    }
    const target = getEligibleUpdateTarget(effectiveInstalled, latestVersions);
    if (!target) {
        const status = getNoUpdateStatus(effectiveInstalled, latestVersions);
        return {
            status,
            message: status === 'ahead' ? 'Newer than current release' : 'Current release',
            logMessage: '',
            targetVersion: '',
            currentVersion: effectiveInstalled ? effectiveInstalled.version : '',
        };
    }
    return {
        status: 'update',
        message: effectiveInstalled
            ? `Update available (${target.version})`
            : `Upgrade recommended (${target.version})`,
        logMessage: effectiveInstalled
            ? `Update available: installed ${effectiveInstalled.version}, latest ${target.version}.`
            : `Upgrade recommended: installed version unknown, latest ${target.version}.`,
        targetVersion: target.version,
        currentVersion: effectiveInstalled ? effectiveInstalled.version : '',
    };
}
