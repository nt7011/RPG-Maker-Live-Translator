// Translator monitor version helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
'use strict';

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
    const beta = match[4] ? parseSafeVersionNumber(match[4]) : null;
    if (major === null || minor === null || patch === null || (match[4] && beta === null)) return null;

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

function isSameUpdateBase(left, right) {
    return Boolean(left && right
        && left.major === right.major
        && left.minor === right.minor
        && left.patch === right.patch);
}

function normalizeVersionRecommendations(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const recommended = parseUpdateVersion(value.recommended);
        const betaValue = value.recommendedBeta || value['recommended-beta'] || '';
        const recommendedBeta = betaValue ? parseUpdateVersion(betaValue) : null;
        return { recommended, recommendedBeta };
    }

    return { recommended: null, recommendedBeta: null };
}

function getEligibleUpdateTarget(installed, recommendations) {
    const stable = recommendations && recommendations.recommended;
    const beta = recommendations && recommendations.recommendedBeta;
    if (!stable || !stable.stable) return null;
    if (!installed) return stable;

    if (installed.stable) {
        return compareParsedUpdateVersions(installed, stable) < 0 ? stable : null;
    }

    if (compareParsedUpdateVersions(installed, stable) < 0) return stable;
    if (beta && !beta.stable && isSameUpdateBase(installed, beta)
        && compareParsedUpdateVersions(installed, beta) < 0) {
        return beta;
    }
    return null;
}

function hasHigherIneligibleBeta(installed, recommendations) {
    const beta = recommendations && recommendations.recommendedBeta;
    return Boolean(installed && beta && !beta.stable && compareParsedUpdateVersions(installed, beta) < 0);
}

function isCurrentRecommendedBeta(installed, recommendations) {
    const beta = recommendations && recommendations.recommendedBeta;
    return Boolean(installed && beta && !beta.stable
        && isSameUpdateBase(installed, beta)
        && compareParsedUpdateVersions(installed, beta) === 0);
}

function getNoUpdateMessage(installed, recommendations) {
    const stable = recommendations && recommendations.recommended;
    if (!installed) return 'No eligible update available';
    if (isCurrentRecommendedBeta(installed, recommendations)) return 'Current release';
    if (hasHigherIneligibleBeta(installed, recommendations)) return 'No eligible update available';
    if (stable && compareParsedUpdateVersions(installed, stable) > 0) return 'Newer than current release';
    return 'Current release';
}

function parseVersionPayload(text) {
    const payload = JSON.parse(String(text || '').replace(/^\uFEFF/u, ''));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('version payload must be a JSON object');
    }
    const recommended = parseUpdateVersion(payload.recommended);
    if (!recommended || !recommended.stable) {
        throw new Error('version payload missing a valid stable "recommended" version');
    }
    let recommendedBeta = null;
    if (Object.prototype.hasOwnProperty.call(payload, 'recommended-beta')) {
        const betaRaw = payload['recommended-beta'];
        const betaValue = typeof betaRaw === 'string' ? betaRaw.trim() : betaRaw;
        if (betaValue !== '') {
            recommendedBeta = parseUpdateVersion(betaValue);
        }
        if (recommendedBeta && recommendedBeta.stable) {
            throw new Error('version payload "recommended-beta" must be a valid beta version');
        }
        if (betaValue !== '' && !recommendedBeta) {
            throw new Error('version payload "recommended-beta" must be a valid beta version');
        }
    }

    return {
        recommended: recommended.version,
        recommendedBeta: recommendedBeta ? recommendedBeta.version : '',
    };
}

function setVersionStatus(status, message, error = '') {
    state.updateCheckStatus = status;
    state.updateCheckMessage = message;
    state.updateCheckError = error;
}

function getVersionCheckResult(installedVersion, latestVersion) {
    const installed = parseUpdateVersion(installedVersion);
    const recommendations = normalizeVersionRecommendations(latestVersion);
    const target = getEligibleUpdateTarget(installed, recommendations);

    if (!recommendations.recommended || !recommendations.recommended.stable) {
        return {
            status: 'error',
            message: 'Update check failed',
            logMessage: 'Update check failed: stable recommended version is invalid.',
            targetVersion: '',
        };
    }

    if (!target) {
        return {
            status: 'latest',
            message: getNoUpdateMessage(installed, recommendations),
            logMessage: '',
            targetVersion: '',
        };
    }

    return {
        status: 'update',
        message: installed ? `Update available (${target.version})` : `Upgrade recommended (${target.version})`,
        logMessage: installed
            ? `Update available: installed ${installed.version}, latest ${target.version}.`
            : `Upgrade recommended: installed version unknown, latest ${target.version}.`,
        targetVersion: target.version,
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
        const versionLabel = state.installedVersion ? `Version ${state.installedVersion}` : 'Version unknown';
        indicator.className = `version-indicator ${toneForVersionStatus()}`;
        indicator.textContent = `${versionLabel}: ${state.updateCheckMessage || 'Checking installation'}`;
        indicator.title = state.updateCheckError || '';
    }

    const link = refs['version-update-link'];
    if (link) {
        link.href = UPDATE_PAGE_URL;
        link.hidden = state.updateCheckStatus !== 'update';
        link.textContent = state.latestVersion ? `Update to ${state.latestVersion}` : 'Open installer';
        link.title = 'Open the RPG Maker Live Translator installer page';
    }
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
    if (!Object.prototype.hasOwnProperty.call(settings, 'checkUpdates')) return true;
    if (settings.checkUpdates === false) return false;
    if (settings.checkUpdates === true) return true;
    addLog('warn', 'settings.json "checkUpdates" should be a boolean. Defaulting to true.');
    return true;
}

function refreshVersionSettings() {
    state.installedVersion = readInstalledVersion();
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
        setVersionStatus(result.status, result.message);
        if (result.status === 'update' && !wasSameUpdate && result.logMessage) {
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
    state.updateCheckTimer = setInterval(runUpdateCheck, VERSION_CHECK_INTERVAL_MS);
}

function stopUpdateChecker() {
    if (state.updateCheckTimer) clearInterval(state.updateCheckTimer);
    state.updateCheckTimer = null;
}

async function fetchRemoteVersion() {
    const text = await fetchRemoteText(VERSION_CHECK_URL);
    return parseVersionPayload(text);
}
