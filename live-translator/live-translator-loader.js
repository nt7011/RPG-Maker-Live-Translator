// RPG Maker loads this file as the plugin entry point.
// Keep it ES5-compatible: older NW.js builds must be able to parse this file
// before the modern runtime loader is injected.
(function () {
    'use strict';

    // The manifest cannot be read before this gate, so keep these values in
    // sync with install-manifest.json. The minimum is the modern-JS parse floor;
    // the recommended version is the runtime validated for current releases.
    var MIN_NW_VERSION = '0.44.0';
    var RECOMMENDED_NW_VERSION = '0.105.0';
    var RUNTIME_LOADER_FILE = 'live-translator-runtime-loader.js';

    function getScope() {
        if (typeof window !== 'undefined') return window;
        try {
            return Function('return this')();
        } catch (_) {
            return null;
        }
    }

    function getProcessRef(scope) {
        if (scope && scope.process) return scope.process;
        if (typeof process !== 'undefined') return process;
        return null;
    }

    function detectNwVersion(scope) {
        var processRef = getProcessRef(scope);
        var versions = processRef && processRef.versions;
        return versions && versions.nw ? String(versions.nw) : '';
    }

    function parseVersionParts(version) {
        var rawParts = String(version || '').split('.');
        var parts = [];
        var index;
        var value;
        for (index = 0; index < rawParts.length; index += 1) {
            value = parseInt(rawParts[index], 10);
            parts[index] = isNaN(value) ? 0 : value;
        }
        return parts;
    }

    function compareVersions(a, b) {
        var pa = parseVersionParts(a);
        var pb = parseVersionParts(b);
        var length = Math.max(pa.length, pb.length);
        var index;
        var av;
        var bv;
        for (index = 0; index < length; index += 1) {
            av = pa[index] || 0;
            bv = pb[index] || 0;
            if (av > bv) return 1;
            if (av < bv) return -1;
        }
        return 0;
    }

    function shouldWarnNwVersion(version) {
        return !!version && compareVersions(version, RECOMMENDED_NW_VERSION) < 0;
    }

    function showUnsupportedAlert(scope, currentVersion) {
        var currentLabel = currentVersion || 'unknown';
        var message = [
            'RPG Maker Live Translator detected an old or unknown NW.js runtime.',
            '',
            'Current NW.js: ' + currentLabel,
            'Minimum NW.js: ' + MIN_NW_VERSION + ' or newer',
            'Recommended NW.js: ' + RECOMMENDED_NW_VERSION + ' or newer',
            '',
            'The translator will try to start anyway, but updating NW.js is recommended.'
        ].join('\n');

        try {
            if (scope && typeof scope.alert === 'function') {
                scope.alert(message);
            } else if (typeof alert === 'function') {
                alert(message);
            }
        } catch (_) {}

        try {
            if (scope && scope.console && typeof scope.console.warn === 'function') {
                scope.console.warn(message);
            }
        } catch (_) {}

        return message;
    }

    function warnOutdatedNwVersion(scope, currentVersion) {
        var message = [
            '[LiveTranslatorLoader][Compat] Detected NW.js version ' + currentVersion + ';',
            'recommended ' + RECOMMENDED_NW_VERSION + ' or newer.',
            'The translator will try to start, but updating NW.js is recommended.'
        ].join(' ');

        try {
            if (scope && scope.console && typeof scope.console.warn === 'function') {
                scope.console.warn(message);
            }
        } catch (_) {}

        return message;
    }

    function shouldAlertUnsupportedNwVersion(version) {
        return !version || compareVersions(version, MIN_NW_VERSION) < 0;
    }

    function getCurrentScript(doc) {
        var scripts;
        if (!doc) return null;
        if (doc.currentScript) return doc.currentScript;
        if (typeof doc.getElementsByTagName !== 'function') return null;
        scripts = doc.getElementsByTagName('script');
        return scripts && scripts.length ? scripts[scripts.length - 1] : null;
    }

    function stripUrlSuffixes(src) {
        var value = String(src || '');
        var hashIndex = value.indexOf('#');
        var queryIndex;
        if (hashIndex >= 0) value = value.slice(0, hashIndex);
        queryIndex = value.indexOf('?');
        if (queryIndex >= 0) value = value.slice(0, queryIndex);
        return value;
    }

    function resolveSiblingScriptUrl(script, fileName) {
        var src = script && (script.src || (typeof script.getAttribute === 'function' ? script.getAttribute('src') : ''));
        var cleanSrc = stripUrlSuffixes(src);
        var slashIndex = cleanSrc.lastIndexOf('/');
        var backslashIndex = cleanSrc.lastIndexOf('\\');
        var baseIndex = Math.max(slashIndex, backslashIndex);
        return baseIndex >= 0 ? cleanSrc.slice(0, baseIndex + 1) + fileName : fileName;
    }

    function injectRuntimeLoader(scope) {
        var doc = scope && scope.document;
        var parent;
        var tag;
        if (!doc || typeof doc.createElement !== 'function') {
            throw new Error('[LiveTranslatorLoader] No document context available.');
        }
        parent = doc.head || doc.documentElement;
        if (!parent || typeof parent.appendChild !== 'function') {
            throw new Error('[LiveTranslatorLoader] Document has no script insertion point.');
        }

        tag = doc.createElement('script');
        tag.src = resolveSiblingScriptUrl(getCurrentScript(doc), RUNTIME_LOADER_FILE);
        tag.async = false;
        tag.onerror = function () {
            throw new Error('[LiveTranslatorLoader] Failed to load ' + RUNTIME_LOADER_FILE + '.');
        };
        parent.appendChild(tag);
    }

    function run() {
        var scope = getScope();
        var currentVersion = detectNwVersion(scope);

        if (shouldAlertUnsupportedNwVersion(currentVersion)) {
            showUnsupportedAlert(scope, currentVersion);
        } else if (shouldWarnNwVersion(currentVersion)) {
            warnOutdatedNwVersion(scope, currentVersion);
        }

        injectRuntimeLoader(scope);
    }

    run();
})();
