// Live Translator early runtime error suppression.
//
// This file is a separate RPG Maker plugin entry so it can run before game
// plugins. Keep it ES5-compatible: it executes before the compatibility loader
// can inspect the installed NW.js version.
(function () {
    'use strict';

    var scope = typeof window !== 'undefined' ? window : Function('return this')();
    var existing = scope.LiveTranslatorErrorGuard;
    if (existing && existing.loaded === true) return;

    var MAX_RECORDS = 200;
    var SETTINGS_FILE = 'settings.json';
    var records = [];
    var sequence = 0;
    var droppedCount = 0;
    var overflowLogged = false;
    var appendRecord = null;
    var artifactFile = '';
    var persistedThroughSequence = 0;
    var enabled = true;
    var listenersInstalled = false;
    var settingsLoaded = false;
    var settingsError = '';

    function stringValue(value) {
        if (value === undefined || value === null) return '';
        try {
            return String(value);
        } catch (_) {
            return '';
        }
    }

    function consoleSink() {
        try {
            return scope.console || (typeof console !== 'undefined' ? console : null);
        } catch (_) {
            return null;
        }
    }

    function warn(message) {
        try {
            var sink = consoleSink();
            if (sink && typeof sink.warn === 'function') sink.warn(message);
        } catch (_) {}
    }

    function currentScript() {
        var doc = scope.document;
        var scripts;
        if (!doc) return null;
        if (doc.currentScript) return doc.currentScript;
        if (typeof doc.getElementsByTagName !== 'function') return null;
        scripts = doc.getElementsByTagName('script');
        return scripts && scripts.length ? scripts[scripts.length - 1] : null;
    }

    function siblingUrl(fileName) {
        var script = currentScript();
        var src = script && (script.src || (typeof script.getAttribute === 'function' ? script.getAttribute('src') : ''));
        var value = stringValue(src);
        var hashIndex = value.indexOf('#');
        var queryIndex;
        var baseIndex;
        if (hashIndex >= 0) value = value.slice(0, hashIndex);
        queryIndex = value.indexOf('?');
        if (queryIndex >= 0) value = value.slice(0, queryIndex);
        baseIndex = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
        return baseIndex >= 0 ? value.slice(0, baseIndex + 1) + fileName : fileName;
    }

    function readEarlySettings() {
        var request;
        var status;
        var parsed;
        try {
            if (typeof scope.XMLHttpRequest !== 'function') {
                throw new Error('XMLHttpRequest is unavailable');
            }
            request = new scope.XMLHttpRequest();
            request.open('GET', siblingUrl(SETTINGS_FILE), false);
            request.send(null);
            status = Number(request.status) || 0;
            if (status !== 0 && (status < 200 || status >= 300)) {
                throw new Error('HTTP ' + status);
            }
            parsed = JSON.parse(stringValue(request.responseText));
            if (!parsed || typeof parsed !== 'object') {
                throw new Error('settings.json is not an object');
            }
            settingsLoaded = true;
            return parsed;
        } catch (error) {
            settingsError = error && error.message ? stringValue(error.message) : stringValue(error);
            warn('[LiveTranslator][ErrorGuard] Could not read settings.json before game plugins; using the default enabled state. ' + settingsError);
            return null;
        }
    }

    function settingEnabled(settings) {
        var errorHandling = settings && settings.errorHandling;
        return !(errorHandling && errorHandling.suppressRuntimeErrors === false);
    }

    function errorDetails(value, details) {
        var error = value && typeof value === 'object' ? value : null;
        var explicitMessage = stringValue(details && details.message);
        return {
            name: stringValue(error && error.name) || stringValue(details && details.name) || 'Error',
            message: explicitMessage || stringValue(error && error.message) || stringValue(value) || 'Unknown error',
            stack: stringValue(error && error.stack) || stringValue(details && details.stack)
        };
    }

    function logRecord(record) {
        var sink;
        var location;
        var stack;
        try {
            sink = consoleSink();
            if (!sink || typeof sink.error !== 'function') return;
            location = record.source
                ? ' (' + record.source + (record.line ? ':' + record.line + ':' + (record.column || 0) : '') + ')'
                : '';
            stack = record.stack ? '\n' + record.stack : '';
            sink.error('[LiveTranslator][ErrorGuard] Suppressed ' + record.kind + ': ' + record.name + ': ' + record.message + location + stack);
        } catch (_) {}
    }

    function logOverflow() {
        var sink;
        if (overflowLogged) return;
        overflowLogged = true;
        try {
            sink = consoleSink();
            if (sink && typeof sink.error === 'function') {
                sink.error('[LiveTranslator][ErrorGuard] Runtime error log reached ' + MAX_RECORDS + ' records; further errors are suppressed and counted.');
            }
        } catch (_) {}
    }

    function persist(record) {
        var sink;
        var errorMessage;
        if (typeof appendRecord !== 'function' || !record || record.seq <= persistedThroughSequence) return;
        try {
            appendRecord(record);
            persistedThroughSequence = record.seq;
        } catch (error) {
            try {
                sink = consoleSink();
                errorMessage = error && error.message ? error.message : stringValue(error);
                if (sink && typeof sink.error === 'function') {
                    sink.error('[LiveTranslator][ErrorGuard] Failed to persist suppressed runtime error: ' + errorMessage);
                }
            } catch (_) {}
        }
    }

    function record(kind, value, details) {
        var normalized;
        var entry;
        details = details || {};
        if (!enabled) return null;
        if (records.length >= MAX_RECORDS) {
            droppedCount += 1;
            logOverflow();
            return null;
        }
        normalized = errorDetails(value, details);
        entry = {
            schemaVersion: 1,
            seq: ++sequence,
            at: Date.now(),
            kind: stringValue(kind) || 'error',
            name: normalized.name,
            message: normalized.message,
            stack: normalized.stack,
            source: stringValue(details.source),
            line: Math.max(0, Math.round(Number(details.line) || 0)),
            column: Math.max(0, Math.round(Number(details.column) || 0))
        };
        records.push(entry);
        logRecord(entry);
        persist(entry);
        return entry;
    }

    function cancelEvent(event) {
        try {
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
        } catch (_) {}
        try {
            if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        } catch (_) {}
    }

    function clearRpgMakerBootError() {
        try {
            if (typeof main !== 'undefined' && main && 'error' in main) {
                main.error = null;
                return;
            }
        } catch (_) {}
        try {
            if (scope.main && 'error' in scope.main) scope.main.error = null;
        } catch (_) {}
    }

    function suppressWindowError(event) {
        record('uncaught-error', event && event.error, {
            name: event && event.error && event.error.name,
            message: event && event.message,
            source: event && event.filename,
            line: event && event.lineno,
            column: event && event.colno
        });
        clearRpgMakerBootError();
        cancelEvent(event);
        return false;
    }

    function suppressUnhandledRejection(event) {
        var reason = event && event.reason;
        record('unhandled-rejection', reason, {
            message: reason && reason.message ? reason.message : stringValue(reason)
        });
        cancelEvent(event);
        return false;
    }

    function markGuarded(fn, original) {
        try {
            Object.defineProperty(fn, '__liveTranslatorErrorGuard', { value: true });
            Object.defineProperty(fn, '__liveTranslatorOriginal', { value: original });
        } catch (_) {}
        return fn;
    }

    function installSceneManagerGuard() {
        var sceneManager = scope.SceneManager;
        var original;
        var guarded;
        if (!enabled || !sceneManager || (typeof sceneManager !== 'object' && typeof sceneManager !== 'function')) return false;

        if (typeof sceneManager.catchException === 'function' && sceneManager.catchException.__liveTranslatorErrorGuard !== true) {
            original = sceneManager.catchException;
            guarded = function (error) {
                record('scene-exception', error);
            };
            try { sceneManager.catchException = markGuarded(guarded, original); } catch (_) {}
        }
        if (typeof sceneManager.onError === 'function' && sceneManager.onError.__liveTranslatorErrorGuard !== true) {
            original = sceneManager.onError;
            guarded = function (event) {
                return suppressWindowError(event);
            };
            try { sceneManager.onError = markGuarded(guarded, original); } catch (_) {}
        }
        if (typeof sceneManager.onReject === 'function' && sceneManager.onReject.__liveTranslatorErrorGuard !== true) {
            original = sceneManager.onReject;
            guarded = function (event) {
                return suppressUnhandledRejection(event);
            };
            try { sceneManager.onReject = markGuarded(guarded, original); } catch (_) {}
        }
        return true;
    }

    function restoreSceneManagerGuard() {
        var sceneManager = scope.SceneManager;
        var names = ['catchException', 'onError', 'onReject'];
        var index;
        var current;
        if (!sceneManager) return;
        for (index = 0; index < names.length; index += 1) {
            current = sceneManager[names[index]];
            if (current && current.__liveTranslatorErrorGuard === true && current.__liveTranslatorOriginal) {
                try { sceneManager[names[index]] = current.__liveTranslatorOriginal; } catch (_) {}
            }
        }
    }

    function installListeners() {
        if (listenersInstalled || !scope || typeof scope.addEventListener !== 'function') return;
        scope.addEventListener('error', suppressWindowError, true);
        scope.addEventListener('unhandledrejection', suppressUnhandledRejection, true);
        listenersInstalled = true;
    }

    function removeListeners() {
        if (!listenersInstalled || !scope || typeof scope.removeEventListener !== 'function') return;
        scope.removeEventListener('error', suppressWindowError, true);
        scope.removeEventListener('unhandledrejection', suppressUnhandledRejection, true);
        listenersInstalled = false;
    }

    function setEnabled(nextEnabled) {
        enabled = nextEnabled !== false;
        if (enabled) {
            installListeners();
            installSceneManagerGuard();
        } else {
            removeListeners();
            restoreSceneManagerGuard();
        }
        return snapshot();
    }

    function applySettings(settings) {
        return setEnabled(settingEnabled(settings));
    }

    function configure(options) {
        var index;
        options = options || {};
        appendRecord = typeof options.appendRecord === 'function' ? options.appendRecord : null;
        artifactFile = stringValue(options.artifactFile);
        persistedThroughSequence = 0;
        if (appendRecord) {
            for (index = 0; index < records.length; index += 1) persist(records[index]);
        }
        installSceneManagerGuard();
        return snapshot();
    }

    function snapshot() {
        return {
            loaded: true,
            installed: enabled && listenersInstalled,
            enabled: enabled,
            recordCount: records.length,
            droppedCount: droppedCount,
            maxRecords: MAX_RECORDS,
            artifactFile: artifactFile,
            settingsLoaded: settingsLoaded,
            settingsError: settingsError
        };
    }

    scope.LiveTranslatorErrorGuard = {
        loaded: true,
        applySettings: applySettings,
        configure: configure,
        installSceneManagerGuard: installSceneManagerGuard,
        record: record,
        records: function () { return records.slice(); },
        setEnabled: setEnabled,
        snapshot: snapshot
    };

    applySettings(readEarlySettings());
}());
