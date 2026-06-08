// Translator monitor version helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
'use strict';

var VERSION_ALIASES_MAX_ENTRIES = 64;
var VERSION_ALIASES_FIELD_NAME = 'version-aliases';
var AVAILABLE_VERSIONS_MAX_ENTRIES = 512;
var AVAILABLE_VERSIONS_FIELD_NAME = 'available-versions';
var LATEST_FIELD_NAME = 'latest';
var LATEST_BETA_INTERNAL_FIELD_NAME = 'latestBeta';
var RECOMMENDED_FIELD_NAME = 'recommended';
var RECOMMENDED_BETA_REMOTE_FIELD_NAME = 'recommended-beta';

function normalizeVersionString(value) {
    const parsed = parseUpdateVersion(value);
    return parsed ? parsed.version : '';
}

function parseUpdateVersion(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const version = String(value).trim();
    if (!version || version.length > 64) return null;

    const match = version.match(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:b(0|[1-9][0-9]*))?$/u);
    if (!match) return null;

    const major = parseSafeVersionNumber(match[1]);
    const minor = parseSafeVersionNumber(match[2]);
    const patch = parseSafeVersionNumber(match[3]);
    const hasBeta = match[4] !== undefined;
    const beta = hasBeta ? parseSafeVersionNumber(match[4]) : null;
    if (major === null || minor === null || patch === null || (hasBeta && beta === null)) return null;

    return {
        version,
        major,
        minor,
        patch,
        beta,
        stable: beta === null,
    };
}

function parseSafeVersionNumber(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function compareUpdateVersions(leftValue, rightValue) {
    const left = parseUpdateVersion(leftValue);
    const right = parseUpdateVersion(rightValue);
    if (!left || !right) {
        throw new Error('invalid update version');
    }
    return compareParsedUpdateVersions(left, right);
}

function compareParsedUpdateVersions(left, right) {
    for (const key of ['major', 'minor', 'patch']) {
        if (left[key] > right[key]) return 1;
        if (left[key] < right[key]) return -1;
    }

    if (left.beta === right.beta) return 0;
    if (left.beta === null) return 1;
    if (right.beta === null) return -1;
    return left.beta > right.beta ? 1 : -1;
}

function normalizeVersionAliases(value) {
    if (value === undefined) return [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('version payload "version-aliases" must be a version map');
    }
    const entries = Object.keys(value);
    if (entries.length > VERSION_ALIASES_MAX_ENTRIES) {
        throw new Error('version payload version aliases have too many entries');
    }

    const aliases = [];
    entries.forEach((rawSource) => {
        addVersionAliasPair(aliases, rawSource, value[rawSource]);
    });
    validateVersionAliasGraph(aliases);
    return aliases;
}

function addVersionAliasPair(aliases, rawSource, rawTarget) {
    const source = parseUpdateVersion(rawSource);
    const target = parseUpdateVersion(rawTarget);
    if (!source || !target) {
        throw new Error('version payload version aliases contain an invalid version');
    }

    // A self-alias is deterministic but has no effect, so keep the graph minimal.
    if (source.version !== target.version) aliases.push({ source, target });
}

function validateVersionAliasGraph(aliases) {
    aliases.forEach((alias) => {
        resolveVersionAlias(alias.source, aliases);
    });
}

function serializeVersionAliases(aliases) {
    const map = {};
    if (!Array.isArray(aliases) || !aliases.length) return map;
    aliases.forEach((alias) => {
        if (alias && alias.source && alias.target) {
            map[alias.source.version] = alias.target.version;
        }
    });
    return map;
}

function normalizeAvailableVersions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('version payload "available-versions" must be a version map');
    }
    const entries = Object.keys(value);
    if (entries.length > AVAILABLE_VERSIONS_MAX_ENTRIES) {
        throw new Error('version payload available versions have too many entries');
    }

    const versions = {};
    entries.forEach((rawVersion) => {
        const parsed = parseUpdateVersion(rawVersion);
        if (!parsed) {
            throw new Error('version payload available versions contain an invalid version');
        }
        versions[parsed.version] = normalizeAvailableVersionGroup(value[rawVersion]);
    });
    return versions;
}

function normalizeAvailableVersionGroup(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(value)) {
        throw new Error('version payload available version groups must be safe identifiers');
    }
    return value;
}

function serializeAvailableVersions(availableVersions) {
    return Object.assign({}, availableVersions || {});
}

function assertRecommendedVersionIsAvailable(parsed, availableVersions, fieldName) {
    if (!parsed) return;
    if (!Object.prototype.hasOwnProperty.call(availableVersions, parsed.version)) {
        throw new Error(`version payload "${fieldName}" must be listed in "available-versions"`);
    }
}

function getVersionAliasesValue(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return Object.prototype.hasOwnProperty.call(value, VERSION_ALIASES_FIELD_NAME)
        ? value[VERSION_ALIASES_FIELD_NAME]
        : undefined;
}

function resolveVersionAlias(parsed, aliases) {
    if (!parsed) return null;
    if (!Array.isArray(aliases) || !aliases.length) return parsed;

    const bySource = Object.create(null);
    aliases.forEach((alias) => {
        if (alias && alias.source && alias.target) {
            bySource[alias.source.version] = alias.target;
        }
    });

    // Aliases are a directed canonicalization graph: source version -> effective version.
    let current = parsed;
    const seen = new Set();
    while (true) {
        if (seen.has(current.version)) {
            throw new Error('version payload version aliases contain a cycle');
        }
        seen.add(current.version);

        const target = bySource[current.version];
        if (!target) return current;
        current = target;
    }
}

function parseVersionPayload(text) {
    const payload = JSON.parse(String(text || '').replace(/^\uFEFF/u, ''));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('version payload must be a JSON object');
    }
    if (Object.prototype.hasOwnProperty.call(payload, LATEST_BETA_INTERNAL_FIELD_NAME)) {
        throw new Error('version payload must use "recommended-beta", not "latestBeta"');
    }

    const recommended = readVersionPayloadField(payload, RECOMMENDED_FIELD_NAME);
    if (!Object.prototype.hasOwnProperty.call(payload, RECOMMENDED_BETA_REMOTE_FIELD_NAME)) {
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
        [LATEST_BETA_INTERNAL_FIELD_NAME]: targets.rawLatestBeta
            ? targets.rawLatestBeta.version
            : '',
        [VERSION_ALIASES_FIELD_NAME]: serializeVersionAliases(targets.versionAliases),
        [AVAILABLE_VERSIONS_FIELD_NAME]: serializeAvailableVersions(availableVersions),
    };
    return result;
}

function readVersionPayloadField(payload, fieldName) {
    if (!Object.prototype.hasOwnProperty.call(payload, fieldName)) {
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

function normalizeLatestVersions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('latest version payload must be a version object');
    }
    if (Object.prototype.hasOwnProperty.call(value, RECOMMENDED_BETA_REMOTE_FIELD_NAME)) {
        throw new Error('latest version payload must be normalized before version selection');
    }

    const latest = readInternalLatestField(value, LATEST_FIELD_NAME);
    if (!Object.prototype.hasOwnProperty.call(value, LATEST_BETA_INTERNAL_FIELD_NAME)) {
        throw new Error('latest version payload missing "latestBeta"');
    }

    let latestBeta = null;
    if (value[LATEST_BETA_INTERNAL_FIELD_NAME] !== '') {
        latestBeta = readInternalLatestField(value, LATEST_BETA_INTERNAL_FIELD_NAME);
    }

    const versionAliases = normalizeVersionAliases(getVersionAliasesValue(value));
    return createLatestVersionTargets(latest, latestBeta, versionAliases);
}

function readInternalLatestField(payload, fieldName) {
    if (!Object.prototype.hasOwnProperty.call(payload, fieldName)) {
        throw new Error(`latest version payload missing "${fieldName}"`);
    }
    const parsed = parseUpdateVersion(payload[fieldName]);
    if (!parsed) {
        throw new Error(`latest version payload "${fieldName}" is invalid`);
    }
    return parsed;
}

function createLatestVersionTargets(rawLatest, rawLatestBeta, versionAliases) {
    const latest = resolveVersionAlias(rawLatest, versionAliases);
    const latestBeta = rawLatestBeta
        ? resolveVersionAlias(rawLatestBeta, versionAliases)
        : null;

    return {
        rawLatest,
        rawLatestBeta,
        latest,
        latestBeta,
        versionAliases,
    };
}

function getHighestUpdateVersion(left, right) {
    if (!left) return right || null;
    if (!right) return left;
    return compareParsedUpdateVersions(left, right) >= 0 ? left : right;
}

function getEligibleUpdateTarget(installed, latestVersions) {
    if (!installed) return latestVersions.latest;

    // Aliases can turn an installed beta into a stable-equivalent release. Once
    // resolved, stable installs only follow the recommended field.
    if (installed.stable) {
        return compareParsedUpdateVersions(installed, latestVersions.latest) < 0
            ? latestVersions.latest
            : null;
    }

    // Non-aliased beta installs track the highest active target. The server
    // channels may resolve through aliases to either stable or beta releases.
    const target = getHighestUpdateVersion(latestVersions.latest, latestVersions.latestBeta);
    return compareParsedUpdateVersions(installed, target) < 0 ? target : null;
}

function getNoUpdateMessage(installed, latestVersions) {
    if (!installed) return 'No eligible update available';

    const target = installed.stable
        ? latestVersions.latest
        : getHighestUpdateVersion(latestVersions.latest, latestVersions.latestBeta);
    if (compareParsedUpdateVersions(installed, target) > 0) {
        return 'Newer than current release';
    }
    return 'Current release';
}

function setVersionStatus(status, message, error = '') {
    state.updateCheckStatus = status;
    state.updateCheckMessage = message;
    state.updateCheckError = error;
}

function getVersionCheckResult(installedVersion, latestVersion) {
    const installed = parseUpdateVersion(installedVersion);
    let latestVersions;
    let effectiveInstalled = installed;

    try {
        latestVersions = normalizeLatestVersions(latestVersion);
        effectiveInstalled = resolveVersionAlias(installed, latestVersions.versionAliases);
    } catch (err) {
        const message = err && err.message ? err.message : 'invalid latest version payload';
        return {
            status: 'error',
            message: 'Update check failed',
            logMessage: `Update check failed: ${message}.`,
            targetVersion: '',
            currentVersion: installed ? installed.version : '',
        };
    }

    const target = getEligibleUpdateTarget(effectiveInstalled, latestVersions);
    if (!target) {
        return {
            status: 'latest',
            message: getNoUpdateMessage(effectiveInstalled, latestVersions),
            logMessage: '',
            targetVersion: '',
            currentVersion: effectiveInstalled ? effectiveInstalled.version : '',
        };
    }

    return {
        status: 'update',
        message: effectiveInstalled ? `Update available (${target.version})` : `Upgrade recommended (${target.version})`,
        logMessage: effectiveInstalled
            ? `Update available: installed ${effectiveInstalled.version}, latest ${target.version}.`
            : `Upgrade recommended: installed version unknown, latest ${target.version}.`,
        targetVersion: target.version,
        currentVersion: effectiveInstalled ? effectiveInstalled.version : '',
    };
}

function toneForVersionStatus() {
    if (state.updateCheckStatus === 'latest') return 'ok';
    if (state.updateCheckStatus === 'update'
        || state.updateCheckStatus === 'error'
        || state.updateCheckStatus === 'missing') return 'warn';
    return 'neutral';
}

function renderVersionPanel() {
    const indicator = refs['version-indicator'];
    if (indicator) {
        const versionLabel = formatVersionIndicatorVersion();
        const versionState = formatVersionHeaderState();
        indicator.className = `version-indicator ${toneForVersionStatus()}`;
        indicator.textContent = versionState ? `${versionLabel} (${versionState})` : versionLabel;
        indicator.title = state.updateCheckError || '';
    }

    const status = refs['version-status-message'];
    if (status) {
        const statusText = formatVersionStatusText();
        status.hidden = !statusText;
        setToneText(status, 'header-complaint version-status-message', toneForVersionStatus(), statusText || '');
        status.title = state.updateCheckError || statusText || '';
    }
    updateHeaderComplaintsVisibility();
}

function formatVersionIndicatorVersion() {
    if (state.updateCheckStatus === 'disabled' || state.checkUpdates === false) return '0.0.0b0';
    if (state.installedVersionDisplay
        && state.installedVersionDisplaySource === state.installedVersion) {
        return state.installedVersionDisplay;
    }
    return state.installedVersion || 'unknown';
}

function setInstalledVersionDisplay(displayVersion, sourceVersion = state.installedVersion) {
    state.installedVersionDisplay = normalizeVersionString(displayVersion);
    state.installedVersionDisplaySource = state.installedVersionDisplay ? String(sourceVersion || '') : '';
}

function formatVersionHeaderState() {
    if (state.updateCheckStatus === 'latest') return 'latest';
    if (state.updateCheckStatus === 'update') return 'outdated';
    if (state.updateCheckStatus === 'checking') return 'Checking';
    if (state.updateCheckStatus === 'error' || state.updateCheckStatus === 'missing') return 'Error';
    if (state.updateCheckStatus === 'disabled') return 'Update Check Disabled';
    return '';
}

function formatVersionStatusText() {
    if (state.updateCheckStatus === 'update') {
        return state.latestVersion ? `Update Available (${state.latestVersion})` : 'Update Available';
    }
    if (state.updateCheckStatus === 'error') return 'Update Check Failed';
    if (state.updateCheckStatus === 'missing') return 'Version Info Error';
    return '';
}

function readInstalledVersion() {
    if (!fs || !path || !state.supportPath) return '';
    const versionFile = path.join(state.supportPath, 'version.json');
    if (!isFile(versionFile)) return '';
    try {
        const payload = readJsonFile(versionFile);
        return normalizeVersionString(payload && payload.version);
    } catch (err) {
        addLog('warn', `version.json read failed: ${formatError(err)}`);
        return '';
    }
}

function readCheckUpdatesSetting() {
    const settings = state.settings || refreshSettingsState();
    if (!settings || typeof settings !== 'object') return true;
    if (Object.prototype.hasOwnProperty.call(settings, 'checkUpdates')
        && settings.checkUpdates !== false
        && settings.checkUpdates !== true) {
        addLog('warn', 'settings.json "checkUpdates" should be a boolean. Defaulting to true.');
    }
    return createGuiConfiguredPolicy({ settings }).updates.checkUpdates;
}

function refreshVersionSettings() {
    state.installedVersion = readInstalledVersion();
    setInstalledVersionDisplay(state.installedVersion);
    state.latestVersion = '';
    state.checkUpdates = readCheckUpdatesSetting();
    state.updateCheckError = '';

    if (!state.installedVersion) {
        setVersionStatus('update', 'Upgrade recommended');
        renderVersionPanel();
        return;
    }

    if (!state.checkUpdates) {
        setVersionStatus('disabled', 'Update checks disabled');
        renderVersionPanel();
        return;
    }

    setVersionStatus('idle', 'Ready to check updates');
    renderVersionPanel();
}

async function runUpdateCheck() {
    if (state.updateCheckInFlight || !state.checkUpdates) return;

    const previousUpdateStatus = state.updateCheckStatus;
    const previousLatestVersion = state.latestVersion;
    state.updateCheckInFlight = true;
    setVersionStatus('checking', 'Checking for updates');
    renderVersionPanel();

    try {
        const remote = await fetchRemoteVersion();
        const result = getVersionCheckResult(state.installedVersion, remote);
        const wasSameUpdate = previousUpdateStatus === 'update' && previousLatestVersion === result.targetVersion;
        state.latestVersion = result.targetVersion || '';
        setInstalledVersionDisplay(result.currentVersion || state.installedVersion);
        setVersionStatus(result.status, result.message);
        if (result.status === 'update' && !wasSameUpdate && result.logMessage) {
            addLog('warn', result.logMessage);
        } else if (result.status === 'error' && result.logMessage) {
            addLog('warn', result.logMessage);
        }
    } catch (err) {
        state.latestVersion = '';
        if (state.installedVersion) {
            setVersionStatus('error', 'Update check failed', formatError(err));
        } else {
            setVersionStatus('update', 'Upgrade recommended', formatError(err));
        }
        addLog('warn', `Update check failed: ${formatError(err)}`);
    } finally {
        state.updateCheckInFlight = false;
        renderVersionPanel();
    }
}

function startUpdateChecker() {
    refreshVersionSettings();
    if (!state.checkUpdates) return;
    runUpdateCheck();
    state.updateCheckTimer = setInterval(runUpdateCheck, getGuiConfiguredPolicy().updates.intervalMs);
}

function stopUpdateChecker() {
    if (state.updateCheckTimer) clearInterval(state.updateCheckTimer);
    state.updateCheckTimer = null;
}

async function fetchRemoteVersion() {
    const text = await fetchRemoteText(getGuiConfiguredPolicy().updates.versionCheckUrl);
    return parseVersionPayload(text);
}
