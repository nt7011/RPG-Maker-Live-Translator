// Window_Base lifecycle support: registry state, visibility, and render readiness schedules.
(() => {
    'use strict';

    let displayStateModule = null;
    let entryLifecycle = null;
    let runtimeScope = null;

    function createWindowData(windowInstance, isOpen) {
        return {
            texts: new Map(),
            isOpen,
            renderReadinessSchedule: new Map(),
            recentlyRedrawn: new Map(),
            _trRenderDrainDepth: 0,
            _trRenderDrainReason: '',
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
        const displayState = displayStateModule.createDisplayStateService(runtimeScope);

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

        function setWindowDrawRecordVisible(windowInstance, windowData, entry, visible, reason, screenState = null) {
            if (!isWindowEntryActive(entry)) return;
            const windowType = getWindowType(windowInstance, windowData);
            const resolvedScreenState = visible ? 'visible' : (String(screenState || '') || 'hidden');
            try {
                if (windowLifecycle && typeof windowLifecycle.setEntryVisible === 'function') {
                    windowLifecycle.setEntryVisible(entry, visible === true, {
                        reason: reason || (visible ? 'window-visible' : 'window-offscreen'),
                        screenState: resolvedScreenState,
                        windowType,
                    });
                } else {
                    entryLifecycle.setSurfaceVisible(entry, visible === true, {
                        reason: reason || (visible ? 'window-visible' : 'window-offscreen'),
                        screenState: resolvedScreenState,
                    });
                }
            } catch (_) {
                entryLifecycle.setSurfaceVisible(entry, visible === true, {
                    reason: reason || (visible ? 'window-visible' : 'window-offscreen'),
                    screenState: resolvedScreenState,
                });
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
                try {
                    const result = windowTextHelpers.rejectPendingRender(entry, reason, details);
                    return !!(result && result.handled === true);
                } catch (_) {}
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
            const chainState = displayState.describeDisplayChain(windowInstance);
            if (chainState.state === 'inactive-scene') return 'inactive-scene';
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
            if (!hasOpenArea) return isOpenState ? 'opening' : 'closed';
            if (!isOpenState) return 'closed';
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
                    const pending = entryLifecycle.getPendingInvalidation(entry);
                    if (!entry || !pending) return;
                    if (pending.reason !== 'window-entry-stale') return;
                    removed.push({ key, entry, pending });
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
                    entryLifecycle.markStale(entry, staleReason, {
                        at: (pending && pending.at) || Date.now(),
                        surfaceVisible: false,
                        screenState: 'hidden',
                    });
                    rejectWindowPendingRender(entry, staleReason, entryDetails);
                    if (isWindowEntryActive(entry)) {
                        retireWindowEntry(entry, staleReason, Object.assign({}, entryDetails, {
                            wasCompleted: isWindowEntryCompleted(entry),
                        }), {
                            policy: { kind: 'retired' },
                        });
                    }
                    forgetWindowEntryRecord(entry, staleReason, entryDetails);
                    entryLifecycle.setSurfaceVisible(entry, false, {
                        reason: staleReason,
                        screenState: 'hidden',
                    });
                } catch (_) {}
                try { data.texts.delete(key); } catch (_) {}
                try {
                    if (data.renderReadinessSchedule && typeof data.renderReadinessSchedule.delete === 'function') {
                        data.renderReadinessSchedule.delete(key);
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
                    try {
                        flushWindowRenderReadinessSchedule(windowInstance, 'window-refresh-complete');
                    } catch (error) {
                        warn('[Window_Base.refresh render readiness schedule error]', error);
                    }
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

        // Completed translations may arrive while a source draw, refresh, or
        // visibility transition is still in progress. This queue is only a
        // wakeup schedule: it validates that a command can be retried, then
        // asks the orchestrator to dispatch the same command id again.
        function flushWindowRenderReadinessSchedule(windowInstance, reason = 'window-update') {
            const data = windowRegistry.get(windowInstance);
            if (!data || !data.renderReadinessSchedule || data.renderReadinessSchedule.size === 0) return;
            const ready = !!(windowInstance
                && windowInstance.visible
                && (typeof windowInstance.isOpen !== 'function' || windowInstance.isOpen())
                && windowInstance.contents);
            if (!ready) return;

            const flush = () => {
                const queuedRecords = Array.from(data.renderReadinessSchedule.entries())
                    .sort(compareQueuedRenderRecords);
                for (const [key, queued] of queuedRecords) {
                    if (data.renderReadinessSchedule.get(key) !== queued) continue;
                    const entry = queued && queued.entry ? queued.entry : null;
                    if (!entry) {
                        data.renderReadinessSchedule.delete(key);
                        continue;
                    }

                    const current = data.texts.get(key);
                    if (current !== entry) {
                        data.renderReadinessSchedule.delete(key);
                        rejectWindowPendingRender(entry, 'window-entry-replaced', {
                            key,
                            windowType: data.windowType || '',
                        });
                        debug(`[Redraw Schedule Drop] replaced at ${key}`);
                        continue;
                    }

                    const pendingInvalidation = entryLifecycle.getPendingInvalidation(entry);
                    if (pendingInvalidation) {
                        data.renderReadinessSchedule.delete(key);
                        rejectWindowPendingRender(entry, 'window-redraw-invalidated', {
                            key,
                            reason: pendingInvalidation.reason || '',
                            windowType: data.windowType || '',
                        });
                        debug(`[Redraw Schedule Drop] pending invalidation at ${key}`);
                        continue;
                    }

                    if (isWindowEntryCompleted(entry) && entry.renderedText) {
                        const commandId = resolveQueuedRenderCommandId(queued, entry);
                        data.renderReadinessSchedule.delete(key);
                        if (!commandId) {
                            rejectWindowPendingRender(entry, 'render-command-id-required', {
                                key,
                                windowType: data.windowType || '',
                            });
                            debug(`[Redraw Schedule Drop] missing command at ${key}`);
                            continue;
                        }
                        const result = notifyQueuedRenderCommandReady(queued, entry, data, key, reason);
                        if (!result || (result.changed !== true && result.status !== 'terminal-command')) {
                            rejectWindowPendingRender(entry, 'render-command-wake-failed', {
                                key,
                                windowType: data.windowType || '',
                                commandId,
                                wakeStatus: result && result.status ? result.status : '',
                                reason: result && result.reason ? result.reason : '',
                            });
                        }
                    } else {
                        data.renderReadinessSchedule.delete(key);
                        rejectWindowPendingRender(entry, 'window-redraw-not-completed', {
                            key,
                            windowType: data.windowType || '',
                        });
                        debug(`[Redraw Schedule Drop] not completed at ${key}`);
                    }
                }
            };

            if (windowLifecycle && typeof windowLifecycle.withRenderDrain === 'function') {
                return windowLifecycle.withRenderDrain(windowInstance, data, reason || 'window-update', flush);
            }
            return flush();
        }

        function resolveQueuedRenderCommandId(queued, entry) {
            return String(
                queued && queued.commandId
                    || entry && entry.renderTransaction && entry.renderTransaction.commandId
                    || ''
            );
        }

        function notifyQueuedRenderCommandReady(queued, entry, windowData, key, reason) {
            const commandId = resolveQueuedRenderCommandId(queued, entry);
            if (!commandId) {
                return {
                    status: 'missing-command-id',
                    changed: false,
                    terminal: true,
                    reason: 'render-command-id-required',
                };
            }
            if (!windowLifecycle || typeof windowLifecycle.notifyRenderCommandReady !== 'function') {
                return {
                    status: 'unavailable',
                    changed: false,
                    terminal: true,
                    reason: 'notifyRenderCommandReady unavailable',
                };
            }
            return windowLifecycle.notifyRenderCommandReady(commandId, {
                reason: 'window-render-drain-ready',
                trigger: String(reason || 'window-update'),
                deferredReason: queued && queued.reason ? String(queued.reason) : '',
                queue: queued && queued.queue ? String(queued.queue) : '',
                key: String(key || ''),
                windowType: windowData && windowData.windowType ? String(windowData.windowType) : '',
                commandGeneration: Number(queued && queued.commandGeneration) || 0,
                entryGeneration: Number(queued && queued.entryGeneration) || Number(entry && entry.surfaceRevision) || 0,
                contentsRevision: Number(windowData && windowData.contentsRevision) || 0,
                proof: {
                    windowReady: true,
                    renderDrainActive: true,
                },
            });
        }

        function compareQueuedRenderRecords(left, right) {
            const leftKey = String(left && left[0] || '');
            const rightKey = String(right && right[0] || '');
            const leftQueued = left && left[1] ? left[1] : null;
            const rightQueued = right && right[1] ? right[1] : null;
            const leftEntry = leftQueued && leftQueued.entry ? leftQueued.entry : null;
            const rightEntry = rightQueued && rightQueued.entry ? rightQueued.entry : null;
            const commandOrder = compareQueuedRenderCommandBacked(leftQueued, leftEntry, rightQueued, rightEntry);
            if (commandOrder !== 0) return commandOrder;
            const leftHasCommand = hasQueuedRenderCommand(leftQueued, leftEntry);
            const rightHasCommand = hasQueuedRenderCommand(rightQueued, rightEntry);
            if (!leftHasCommand && !rightHasCommand) {
                const queuedAtOrder = compareFiniteNumbers(leftQueued && leftQueued.queuedAt, rightQueued && rightQueued.queuedAt);
                if (queuedAtOrder !== 0) return queuedAtOrder;
            }
            const drawOrder = compareFiniteNumbers(leftEntry && leftEntry.drawOrder, rightEntry && rightEntry.drawOrder);
            if (drawOrder !== 0) return drawOrder;
            const yOrder = compareFiniteNumbers(
                leftEntry && leftEntry.position && leftEntry.position.y,
                rightEntry && rightEntry.position && rightEntry.position.y
            );
            if (yOrder !== 0) return yOrder;
            const xOrder = compareFiniteNumbers(
                leftEntry && leftEntry.position && leftEntry.position.x,
                rightEntry && rightEntry.position && rightEntry.position.x
            );
            if (xOrder !== 0) return xOrder;
            const queuedAtOrder = compareFiniteNumbers(leftQueued && leftQueued.queuedAt, rightQueued && rightQueued.queuedAt);
            if (queuedAtOrder !== 0) return queuedAtOrder;
            return leftKey.localeCompare(rightKey);
        }

        function compareQueuedRenderCommandBacked(leftQueued, leftEntry, rightQueued, rightEntry) {
            const leftHasCommand = hasQueuedRenderCommand(leftQueued, leftEntry);
            const rightHasCommand = hasQueuedRenderCommand(rightQueued, rightEntry);
            if (leftHasCommand === rightHasCommand) return 0;
            return leftHasCommand ? -1 : 1;
        }

        function hasQueuedRenderCommand(queued, entry) {
            return !!resolveQueuedRenderCommandId(queued, entry);
        }

        function compareFiniteNumbers(left, right) {
            const a = Number(left);
            const b = Number(right);
            const hasA = Number.isFinite(a);
            const hasB = Number.isFinite(b);
            if (hasA && hasB && a !== b) return a - b;
            if (hasA !== hasB) return hasA ? -1 : 1;
            return 0;
        }

        function markWindowEntriesOffscreen(windowInstance, data, reason) {
            if (!data || !data.texts || typeof data.texts.forEach !== 'function') return;
            const completed = [];
            const screenState = getWindowScreenState(windowInstance, data);
            data.texts.forEach((entry, key) => {
                if (!isWindowEntryActive(entry) || entryLifecycle.isStale(entry)) return;
                if (entryLifecycle.getSurfaceVisible(entry) !== false) {
                    setWindowDrawRecordVisible(windowInstance, data, entry, false, reason || 'window-offscreen', screenState);
                }
                if (isWindowEntryCompleted(entry) && shouldRetireOffscreenCompletedEntry(screenState)) {
                    completed.push({ key, entry });
                }
            });
            completed.forEach(({ key, entry }) => {
                retireOffscreenCompletedWindowEntry(windowInstance, data, key, entry, reason || 'window-offscreen');
            });
        }

        function shouldRetireOffscreenCompletedEntry(screenState) {
            const state = String(screenState || '');
            // Opening and transparent contents are visibility transitions, not
            // proof that the logical text owner disappeared. RPG Maker plugins
            // commonly fade contentsOpacity or use a transparent Window_Base as
            // a scratch text surface before copying pixels elsewhere.
            return state !== 'opening' && state !== 'transparent';
        }

        function retireOffscreenCompletedWindowEntry(windowInstance, data, key, entry, reason) {
            if (!entry || entryLifecycle.isStale(entry) || !isWindowEntryActive(entry) || !isWindowEntryCompleted(entry)) return false;
            const entryDetails = {
                key: String(key || ''),
                windowType: getWindowType(windowInstance, data),
                screenState: getWindowScreenState(windowInstance, data),
                wasCompleted: true,
            };
            const staleReason = reason || 'window-offscreen';
            entryLifecycle.markStale(entry, staleReason, {
                surfaceVisible: false,
                screenState: 'hidden',
            });
            rejectWindowPendingRender(entry, staleReason, entryDetails);
            retireWindowEntry(entry, staleReason, entryDetails, {
                policy: { kind: 'retired' },
            });
            // Completed hidden window text already has a cached translation and
            // is no longer an on-screen owner. Future redraws can hydrate from
            // the source cache instead of keeping this physical window active.
            forgetWindowEntryRecord(entry, staleReason, entryDetails);
            entryLifecycle.setSurfaceVisible(entry, false, {
                reason: staleReason,
                screenState: 'hidden',
            });
            try { data.texts.delete(key); } catch (_) {}
            try {
                if (data.renderReadinessSchedule && typeof data.renderReadinessSchedule.delete === 'function') {
                    data.renderReadinessSchedule.delete(key);
                }
            } catch (_) {}
            return true;
        }

        function markWindowEntriesVisible(windowInstance, data, reason) {
            if (!data || !data.texts || typeof data.texts.forEach !== 'function') return;
            data.texts.forEach((entry) => {
                if (!isWindowEntryActive(entry) || entryLifecycle.isStale(entry) || entryLifecycle.getSurfaceVisible(entry) !== false) return;
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
            forgetWindowEntryRecord,
            getWindowScreenState,
            syncWindowTextScreenState,
            commitPendingWindowEntryStaleRecords,
            withWindowRefreshDepth,
            unregisterWindowSafely,
            flushWindowRenderReadinessSchedule,
        };
    }

    LiveTranslatorDefine({
        name: 'hooks.window.baseLifecycleState',
        requires: {
            displayState: 'runtime.displayState',
            entryLifecycleModule: 'runtime.entryLifecycle',
        },
        factory({ displayState, entryLifecycleModule }, { scope }) {
            displayStateModule = displayState;
            entryLifecycle = entryLifecycleModule;
            runtimeScope = scope;

            return {
                create: createLifecycleStateHelpers,
                createWindowData,
            };
        },
    });
})();
