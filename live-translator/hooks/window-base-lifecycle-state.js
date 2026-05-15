// Window_Base lifecycle support: registry state, visibility, and redraw queues.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/window-base-lifecycle-state.js.');
    }

    function createWindowData(windowInstance, isOpen) {
        return {
            texts: new Map(),
            isOpen,
            pendingRedraws: new Map(),
            recentlyRedrawn: new Map(),
            windowType: windowInstance && windowInstance.constructor
                ? windowInstance.constructor.name
                : undefined,
        };
    }

    function createLifecycleStateHelpers(context = {}) {
        const {
            logger = {},
            dbg = () => {},
            windowRegistry,
            unregisterWindow,
            getWindowTextHelpers,
            getWindowDrawHelpers,
            windowLifecycle,
        } = context;
        const debug = typeof dbg === 'function' ? dbg : () => {};

        function isWindowEntryActive(entry) {
            return !!(entry
                && entry.recordId
                && windowLifecycle
                && typeof windowLifecycle.isEntryActive === 'function'
                && windowLifecycle.isEntryActive(entry));
        }

        function isWindowEntryCompleted(entry) {
            return !!(entry
                && entry.recordId
                && windowLifecycle
                && typeof windowLifecycle.isEntryCompleted === 'function'
                && windowLifecycle.isEntryCompleted(entry));
        }

        function retireWindowEntry(entry, reason, details = null, options = {}) {
            if (!isWindowEntryActive(entry)) return;
            try {
                if (windowLifecycle && typeof windowLifecycle.retireEntry === 'function') {
                    windowLifecycle.retireEntry(entry, reason || 'window-disappeared', details, options);
                }
            } catch (_) {}
        }

        function setWindowDrawRecordVisible(windowInstance, windowData, entry, visible, reason) {
            if (!isWindowEntryActive(entry)) return;
            const windowType = getWindowType(windowInstance, windowData);
            try {
                if (windowLifecycle && typeof windowLifecycle.setEntryVisible === 'function') {
                    windowLifecycle.setEntryVisible(entry, visible === true, {
                        reason: reason || (visible ? 'window-visible' : 'window-offscreen'),
                        screenState: visible ? 'visible' : 'hidden',
                        windowType,
                    });
                } else {
                    entry._trSurfaceVisible = visible === true;
                }
            } catch (_) {
                entry._trSurfaceVisible = visible === true;
            }
        }

        function beginWindowRefresh(windowInstance) {
            if (!windowInstance) return 0;
            if (!windowLifecycle || typeof windowLifecycle.beginRefresh !== 'function') return 0;
            try {
                return windowLifecycle.beginRefresh(windowInstance, windowRegistry.get(windowInstance));
            } catch (_) {
                return 0;
            }
        }

        function finishWindowRefresh(windowInstance, token) {
            if (!windowInstance) return;
            if (!windowLifecycle || typeof windowLifecycle.finishRefresh !== 'function') return;
            try {
                windowLifecycle.finishRefresh(windowInstance, token, windowRegistry.get(windowInstance));
            } catch (_) {}
        }

        function rejectWindowPendingRender(entry, reason, details = null) {
            const helperGetter = typeof getWindowTextHelpers === 'function'
                ? getWindowTextHelpers
                : getWindowDrawHelpers;
            const windowTextHelpers = typeof helperGetter === 'function' ? helperGetter() : null;
            if (windowTextHelpers && typeof windowTextHelpers.rejectPendingRender === 'function') {
                try { return windowTextHelpers.rejectPendingRender(entry, reason, details) === true; } catch (_) {}
            }
            return false;
        }

        function forgetWindowEntryRecord(entry, reason = 'window-entry-detached', details = null) {
            const helperGetter = typeof getWindowTextHelpers === 'function'
                ? getWindowTextHelpers
                : getWindowDrawHelpers;
            const windowTextHelpers = typeof helperGetter === 'function' ? helperGetter() : null;
            if (windowTextHelpers && typeof windowTextHelpers.forgetEntryRecord === 'function') {
                try { return windowTextHelpers.forgetEntryRecord(entry, reason, details) === true; } catch (_) {}
            }
            return false;
        }

        function getWindowScreenState(windowInstance, data) {
            if (!windowInstance) return 'removed';
            const visible = windowInstance.visible !== false;
            const openness = Number(windowInstance.openness);
            const hasOpenArea = Number.isFinite(openness)
                ? openness > 0
                : (typeof windowInstance.isOpen === 'function' ? windowInstance.isOpen() : true);
            const contentsOpacity = Number(windowInstance.contentsOpacity);
            const textOpacityVisible = !Number.isFinite(contentsOpacity) || contentsOpacity > 0;
            const isOpenState = data && Object.prototype.hasOwnProperty.call(data, 'isOpen')
                ? data.isOpen !== false
                : true;
            if (!visible) return 'hidden';
            if (!hasOpenArea || !isOpenState) return 'closed';
            if (!textOpacityVisible) return 'transparent';
            return 'visible';
        }

        function syncWindowTextScreenState(windowInstance, reason) {
            const data = windowRegistry.get(windowInstance);
            if (!data) return;
            const screenState = getWindowScreenState(windowInstance, data);
            if (screenState === 'visible') {
                markWindowEntriesVisible(windowInstance, data, reason || 'window-visible');
            } else {
                markWindowEntriesOffscreen(windowInstance, data, reason || `window-${screenState}`);
            }
            data._trLastScreenState = screenState;
        }

        function commitPendingWindowEntryStaleRecords(windowInstance, data, reason) {
            if (!data || !data.texts || typeof data.texts.forEach !== 'function') return;
            const windowType = getWindowType(windowInstance, data);
            const removed = [];
            try {
                data.texts.forEach((entry, key) => {
                    if (!entry || !entry._trPendingInvalidation) return;
                    if (entry._trPendingInvalidation.reason !== 'window-entry-stale') return;
                    removed.push({ key, entry, pending: entry._trPendingInvalidation });
                });
            } catch (_) {}
            removed.forEach(({ key, entry, pending }) => {
                try {
                    const staleReason = (pending && pending.sourceReason)
                        || (pending && pending.reason)
                        || reason
                        || 'window-contents-invalidated';
                    const entryDetails = {
                        key: String(key || ''),
                        windowType,
                    };
                    entry._trStale = true;
                    entry.canceledReason = staleReason;
                    entry.canceledAt = (pending && pending.at) || Date.now();
                    rejectWindowPendingRender(entry, staleReason, entryDetails);
                    if (isWindowEntryActive(entry)) {
                        retireWindowEntry(entry, staleReason, Object.assign({}, entryDetails, {
                            wasCompleted: isWindowEntryCompleted(entry),
                        }));
                    }
                    forgetWindowEntryRecord(entry, staleReason, entryDetails);
                    entry._trSurfaceVisible = false;
                } catch (_) {}
                try { data.texts.delete(key); } catch (_) {}
                try {
                    if (data.pendingRedraws && typeof data.pendingRedraws.delete === 'function') {
                        data.pendingRedraws.delete(key);
                    }
                } catch (_) {}
            });
        }

        function withWindowRefreshDepth(windowInstance, callback) {
            if (!windowInstance || typeof callback !== 'function') return undefined;
            const refreshToken = beginWindowRefresh(windowInstance);
            const contents = windowInstance.contents || null;
            windowInstance._trWindowRefreshDepth = (windowInstance._trWindowRefreshDepth || 0) + 1;
            if (contents) contents._trWindowRefreshDepth = (contents._trWindowRefreshDepth || 0) + 1;
            try {
                return callback();
            } finally {
                if (contents) {
                    contents._trWindowRefreshDepth = Math.max(0, (contents._trWindowRefreshDepth || 1) - 1);
                }
                windowInstance._trWindowRefreshDepth = Math.max(0, (windowInstance._trWindowRefreshDepth || 1) - 1);
                try {
                    commitPendingWindowEntryStaleRecords(windowInstance, windowRegistry.get(windowInstance), 'window-refresh-commit');
                } catch (error) {
                    warn('[Window_Base.refresh pending invalidation error]', error);
                } finally {
                    finishWindowRefresh(windowInstance, refreshToken);
                }
            }
        }

        function unregisterWindowSafely(windowInstance, reason) {
            if (!windowInstance || typeof unregisterWindow !== 'function') return;
            try {
                unregisterWindow(windowInstance, reason || 'window-unregistered');
            } catch (error) {
                warn('[WindowLifecycle] Window unregister failed.', error);
            }
        }

        // Completed translations may arrive after Window_Base.refresh() has
        // cleared the bitmap. The pending queue redraws only still-current
        // entries and rejects everything that became stale or replaced.
        function flushPendingWindowRedraws(windowInstance) {
            const data = windowRegistry.get(windowInstance);
            if (!data || !data.pendingRedraws || data.pendingRedraws.size === 0) return;
            const ready = !!(windowInstance
                && windowInstance.visible
                && (typeof windowInstance.isOpen !== 'function' || windowInstance.isOpen())
                && windowInstance.contents);
            if (!ready) return;

            const keys = Array.from(data.pendingRedraws.keys());
            for (const key of keys) {
                const entry = data.pendingRedraws.get(key);
                if (!entry) {
                    data.pendingRedraws.delete(key);
                    continue;
                }

                const current = data.texts.get(key);
                if (current !== entry) {
                    data.pendingRedraws.delete(key);
                    rejectWindowPendingRender(entry, 'window-entry-replaced', {
                        key,
                        windowType: data.windowType || '',
                    });
                    debug(`[Redraw Queue Drop] replaced at ${key}`);
                    continue;
                }

                if (entry._trPendingInvalidation) {
                    data.pendingRedraws.delete(key);
                    rejectWindowPendingRender(entry, 'window-redraw-invalidated', {
                        key,
                        reason: entry._trPendingInvalidation.reason || '',
                        windowType: data.windowType || '',
                    });
                    debug(`[Redraw Queue Drop] pending invalidation at ${key}`);
                    continue;
                }

                if (isWindowEntryCompleted(entry) && entry.renderedText) {
                    const helperGetter = typeof getWindowTextHelpers === 'function'
                        ? getWindowTextHelpers
                        : getWindowDrawHelpers;
                    const windowTextHelpers = typeof helperGetter === 'function' ? helperGetter() : null;
                    if (windowTextHelpers && typeof windowTextHelpers.redrawTranslatedText === 'function') {
                        const result = windowTextHelpers.redrawTranslatedText(entry, data);
                        if (result !== 'drawn' && data.pendingRedraws && data.pendingRedraws.get(key) === entry) {
                            rejectWindowPendingRender(entry, 'window-redraw-failed', {
                                key,
                                windowType: data.windowType || '',
                            });
                        }
                    }
                    if (data.pendingRedraws && data.pendingRedraws.get(key) === entry) {
                        data.pendingRedraws.delete(key);
                    }
                } else {
                    data.pendingRedraws.delete(key);
                    rejectWindowPendingRender(entry, 'window-redraw-not-completed', {
                        key,
                        windowType: data.windowType || '',
                    });
                    debug(`[Redraw Queue Drop] not completed at ${key}`);
                }
            }
        }

        function markWindowEntriesOffscreen(windowInstance, data, reason) {
            if (!data || !data.texts || typeof data.texts.forEach !== 'function') return;
            data.texts.forEach((entry) => {
                if (!isWindowEntryActive(entry) || entry._trStale || entry._trSurfaceVisible === false) return;
                setWindowDrawRecordVisible(windowInstance, data, entry, false, reason || 'window-offscreen');
            });
        }

        function markWindowEntriesVisible(windowInstance, data, reason) {
            if (!data || !data.texts || typeof data.texts.forEach !== 'function') return;
            data.texts.forEach((entry) => {
                if (!isWindowEntryActive(entry) || entry._trStale || entry._trSurfaceVisible !== false) return;
                setWindowDrawRecordVisible(windowInstance, data, entry, true, reason || 'window-visible');
            });
        }

        function getWindowType(windowInstance, data) {
            return data && data.windowType
                ? data.windowType
                : (windowInstance && windowInstance.constructor ? windowInstance.constructor.name : '');
        }

        function warn(message, error) {
            if (logger && typeof logger.warn === 'function') {
                try { logger.warn(message, error); } catch (_) {}
            }
        }

        return {
            createWindowData,
            isWindowEntryActive,
            isWindowEntryCompleted,
            retireWindowEntry,
            setWindowDrawRecordVisible,
            beginWindowRefresh,
            finishWindowRefresh,
            rejectWindowPendingRender,
            getWindowScreenState,
            syncWindowTextScreenState,
            commitPendingWindowEntryStaleRecords,
            withWindowRefreshDepth,
            unregisterWindowSafely,
            flushPendingWindowRedraws,
        };
    }

    defineRuntimeModule('hooks.windowBaseLifecycleState', {
        create: createLifecycleStateHelpers,
        createWindowData,
    });
})();
