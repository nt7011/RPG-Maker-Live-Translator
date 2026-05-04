// Window lifecycle hooks for open, close, contents replacement, and pending redraws.
// These hooks keep the shared window registry current so draw hooks can safely redraw translated text later.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.hooks) {
        globalScope.LiveTranslatorModules.hooks = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/window-state-hooks.js.');
    }

    function installWindowStateHooks(options = {}) {
        const {
            logger,
            dbg = () => {},
            textTracker = null,
            windowRegistry,
            registeredWindows,
            addWindowToRegistry,
            getWindowDrawHelpers = () => null,
            redrawGameMessageText,
            getRedrawGameMessageText = null,
        } = options;

        if (!logger || !windowRegistry || typeof addWindowToRegistry !== 'function') {
            throw new Error('[WindowStateHooks] Missing required dependencies.');
        }
        if (typeof Window_Base === 'undefined' || !Window_Base || !Window_Base.prototype) {
            return {
                status: 'skipped',
                reason: 'Window_Base is unavailable.',
            };
        }

        installWindowBaseStateHooks({
            logger,
            dbg,
            textTracker,
            windowRegistry,
            registeredWindows,
            addWindowToRegistry,
            getWindowDrawHelpers,
        });
        installMessagePendingRedrawHook({ logger, redrawGameMessageText, getRedrawGameMessageText });
        return {
            status: 'installed',
            reason: 'Window_Base lifecycle hooks installed.',
        };
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

    function installWindowBaseStateHooks(context) {
        const {
            logger,
            dbg,
            windowRegistry,
            registeredWindows,
            addWindowToRegistry,
            getWindowDrawHelpers,
            textTracker,
        } = context;
        const markRecordDisappeared = (recordId, reason, details = null) => {
            if (!textTracker || !recordId) return;
            if (typeof textTracker.disappear === 'function') {
                textTracker.disappear(recordId, reason, details);
            } else if (typeof textTracker.stale === 'function') {
                textTracker.stale(recordId, reason, details);
            }
        };
        const upsertWindowDrawRecord = (windowInstance, windowData, entry, reason) => {
            if (!textTracker || typeof textTracker.upsert !== 'function' || !entry || !entry.recordId) return;
            const windowType = windowData && windowData.windowType
                ? windowData.windowType
                : (windowInstance && windowInstance.constructor ? windowInstance.constructor.name : '');
            textTracker.upsert({
                id: entry.recordId,
                hook: entry.type || 'drawText',
                hookLabel: 'Window Draw',
                surfaceType: 'window',
                status: entry.translationStatus || 'detected',
                rawText: entry.rawText || '',
                convertedText: entry.convertedText || '',
                visibleText: entry.visibleText || entry.convertedText || entry.rawText || '',
                original: entry.visibleText || entry.convertedText || entry.rawText || '',
                translationSource: entry.translationSource || '',
                normalizedSource: String(entry.translationSource || '').trim(),
                translation: entry.translatedText || '',
                x: entry.position && entry.position.x,
                y: entry.position && entry.position.y,
                bounds: entry.bounds || null,
                onScreen: true,
                screenState: 'visible',
                windowType,
                methodName: entry.type || '',
                metadata: {
                    contentsRevision: windowData && windowData.contentsRevision ? windowData.contentsRevision : 0,
                },
            }, {
                type: 'screen.visible',
                message: reason || 'window-visible',
                details: { windowType },
            });
            entry._trTrackerVisible = true;
        };
        const getWindowScreenState = (windowInstance, data) => {
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
        };
        const markWindowEntriesOffscreen = (windowInstance, data, reason) => {
            if (!data || !data.texts || typeof data.texts.forEach !== 'function') return;
            const windowType = data.windowType || (windowInstance && windowInstance.constructor ? windowInstance.constructor.name : '');
            data.texts.forEach((entry) => {
                if (!entry || !entry.recordId || entry._trStale || entry._trTrackerVisible === false) return;
                markRecordDisappeared(entry.recordId, reason || 'window-offscreen', { windowType });
                entry._trTrackerVisible = false;
            });
        };
        const markWindowEntriesVisible = (windowInstance, data, reason) => {
            if (!data || !data.texts || typeof data.texts.forEach !== 'function') return;
            data.texts.forEach((entry) => {
                if (!entry || !entry.recordId || entry._trStale || entry._trTrackerVisible !== false) return;
                upsertWindowDrawRecord(windowInstance, data, entry, reason || 'window-visible');
            });
        };
        const syncWindowTextScreenState = (windowInstance, reason) => {
            const data = windowRegistry.get(windowInstance);
            if (!data) return;
            const screenState = getWindowScreenState(windowInstance, data);
            if (screenState === 'visible') {
                markWindowEntriesVisible(windowInstance, data, reason || 'window-visible');
            } else {
                markWindowEntriesOffscreen(windowInstance, data, reason || `window-${screenState}`);
            }
            data._trLastScreenState = screenState;
        };
        const commitPendingWindowEntryStaleRecords = (windowInstance, data, reason) => {
            if (!data || !data.texts || typeof data.texts.forEach !== 'function') return;
            const windowType = data.windowType || (windowInstance && windowInstance.constructor ? windowInstance.constructor.name : '');
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
                    entry._trStale = true;
                    entry.canceledReason = (pending && pending.reason) || reason || 'window-contents-invalidated';
                    entry.canceledAt = (pending && pending.at) || Date.now();
                    if (entry.translationStatus === 'completed') {
                        entry.translationStatus = 'stale';
                    }
                    if (entry.recordId && entry._trTrackerVisible !== false) {
                        markRecordDisappeared(entry.recordId, entry.canceledReason, {
                            key: String(key || ''),
                            windowType,
                        });
                    }
                    entry._trTrackerVisible = false;
                } catch (_) {}
                try { data.texts.delete(key); } catch (_) {}
                try {
                    if (data.pendingRedraws && typeof data.pendingRedraws.delete === 'function') {
                        data.pendingRedraws.delete(key);
                    }
                } catch (_) {}
            });
        };

        if (typeof Window_Base.prototype.open === 'function'
            && !Window_Base.prototype.open.__trWindowStateWrapped) {
            const originalWindowOpen = Window_Base.prototype.open;
            Window_Base.prototype.open = function(...args) {
                this._uniqueId = this._uniqueId || Math.random().toString(36).substring(2, 11);
                const existing = windowRegistry.get(this);
                const data = existing || createWindowData(this, true);
                data.isOpen = true;
                if (!data.pendingRedraws) data.pendingRedraws = new Map();
                addWindowToRegistry(this, data);
                const result = originalWindowOpen.apply(this, args);
                syncWindowTextScreenState(this, 'window-opened');
                return result;
            };
            Window_Base.prototype.open.__trWindowStateWrapped = true;
            Window_Base.prototype.open.__trOriginal = originalWindowOpen;
        }

        if (typeof Window_Base.prototype.close === 'function'
            && !Window_Base.prototype.close.__trWindowStateWrapped) {
            const originalWindowClose = Window_Base.prototype.close;
            Window_Base.prototype.close = function(...args) {
                const existing = windowRegistry.get(this);
                const data = existing || createWindowData(this, false);
                data.isOpen = false;
                if (data.texts && typeof data.texts.forEach === 'function') {
                    try {
                        data.texts.forEach((entry) => {
                            if (entry && entry.recordId) {
                                entry._trStale = true;
                                entry.canceledReason = 'window-closed';
                                entry.canceledAt = Date.now();
                                if (entry._trTrackerVisible !== false) {
                                    markRecordDisappeared(entry.recordId, 'window-closed', {
                                        windowType: data.windowType || (this && this.constructor ? this.constructor.name : ''),
                                    });
                                }
                            }
                        });
                        data.texts.clear();
                    } catch (_) {}
                }
                if (!data.pendingRedraws) data.pendingRedraws = new Map();
                try { data.pendingRedraws.clear(); } catch (_) {}
                windowRegistry.set(this, data);
                return originalWindowClose.apply(this, args);
            };
            Window_Base.prototype.close.__trWindowStateWrapped = true;
            Window_Base.prototype.close.__trOriginal = originalWindowClose;
        }

        if (typeof Window_Base.prototype.destroy === 'function'
            && !Window_Base.prototype.destroy.__trWindowStateWrapped) {
            const originalWindowDestroy = Window_Base.prototype.destroy;
            Window_Base.prototype.destroy = function(...args) {
                const existing = windowRegistry.get(this);
                const data = existing || createWindowData(this, false);
                data.isOpen = false;
                if (data.texts && typeof data.texts.forEach === 'function') {
                    try {
                        data.texts.forEach((entry) => {
                            if (entry && entry.recordId) {
                                entry._trStale = true;
                                entry.canceledReason = 'window-destroyed';
                                entry.canceledAt = Date.now();
                                if (entry._trTrackerVisible !== false) {
                                    markRecordDisappeared(entry.recordId, 'window-destroyed', {
                                        windowType: data.windowType || (this && this.constructor ? this.constructor.name : ''),
                                    });
                                }
                            }
                        });
                        data.texts.clear();
                    } catch (_) {}
                }
                if (!data.pendingRedraws) data.pendingRedraws = new Map();
                try { data.pendingRedraws.clear(); } catch (_) {}
                windowRegistry.set(this, data);
                try { registeredWindows.delete(this); } catch (_) {}
                return originalWindowDestroy.apply(this, args);
            };
            Window_Base.prototype.destroy.__trWindowStateWrapped = true;
            Window_Base.prototype.destroy.__trOriginal = originalWindowDestroy;
        }

        if (typeof Window_Base.prototype.hide === 'function'
            && !Window_Base.prototype.hide.__trWindowStateWrapped) {
            const originalWindowHide = Window_Base.prototype.hide;
            Window_Base.prototype.hide = function(...args) {
                const result = originalWindowHide.apply(this, args);
                syncWindowTextScreenState(this, 'window-hidden');
                return result;
            };
            Window_Base.prototype.hide.__trWindowStateWrapped = true;
            Window_Base.prototype.hide.__trOriginal = originalWindowHide;
        }

        if (typeof Window_Base.prototype.show === 'function'
            && !Window_Base.prototype.show.__trWindowStateWrapped) {
            const originalWindowShow = Window_Base.prototype.show;
            Window_Base.prototype.show = function(...args) {
                const result = originalWindowShow.apply(this, args);
                syncWindowTextScreenState(this, 'window-shown');
                return result;
            };
            Window_Base.prototype.show.__trWindowStateWrapped = true;
            Window_Base.prototype.show.__trOriginal = originalWindowShow;
        }

        if (typeof Window_Base.prototype.createContents === 'function'
            && !Window_Base.prototype.createContents.__trWindowStateWrapped) {
            const originalCreateContents = Window_Base.prototype.createContents;
            Window_Base.prototype.createContents = function(...args) {
                const result = originalCreateContents.apply(this, args);
                try {
                    const existing = windowRegistry.get(this);
                    const data = existing || createWindowData(
                        this,
                        typeof this.isOpen === 'function' ? this.isOpen() : true
                    );
                    if (!data.pendingRedraws) data.pendingRedraws = new Map();
                    if (!data.recentlyRedrawn) data.recentlyRedrawn = new Map();
                    addWindowToRegistry(this, data);
                } catch (error) {
                    logger.error('[Window_Base.createContents Hook Error]', error);
                }
                return result;
            };
            Window_Base.prototype.createContents.__trWindowStateWrapped = true;
            Window_Base.prototype.createContents.__trOriginal = originalCreateContents;
        }

        if (typeof Window_Base.prototype.update === 'function'
            && !Window_Base.prototype.update.__trWindowStateWrapped) {
            const originalWindowUpdate = Window_Base.prototype.update;
            Window_Base.prototype.update = function(...args) {
                const result = originalWindowUpdate.apply(this, args);
                try {
                    commitPendingWindowEntryStaleRecords(this, windowRegistry.get(this), 'window-update-commit');
                    flushPendingWindowRedraws(this, {
                        logger,
                        dbg,
                        windowRegistry,
                        getWindowDrawHelpers,
                    });
                    syncWindowTextScreenState(this, 'window-update');
                } catch (error) {
                    logger.error('[Window_Base.update Hook Error]', error);
                }
                return result;
            };
            Window_Base.prototype.update.__trWindowStateWrapped = true;
            Window_Base.prototype.update.__trOriginal = originalWindowUpdate;
        }
    }

    function flushPendingWindowRedraws(windowInstance, context) {
        const {
            dbg,
            windowRegistry,
            getWindowDrawHelpers,
        } = context;

        const data = windowRegistry.get(windowInstance);
        if (!data || !data.pendingRedraws || data.pendingRedraws.size === 0) return;
        const ready = windowInstance.visible && windowInstance.isOpen() && windowInstance.contents;
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
                dbg(`[Redraw Queue Drop] replaced at ${key}`);
                continue;
            }

            if (entry._trPendingInvalidation) {
                data.pendingRedraws.delete(key);
                dbg(`[Redraw Queue Drop] pending invalidation at ${key}`);
                continue;
            }

            if (entry.translationStatus === 'completed' && entry.translatedText) {
                const windowDrawHelpers = getWindowDrawHelpers();
                if (windowDrawHelpers && typeof windowDrawHelpers.redrawTranslatedText === 'function') {
                    windowDrawHelpers.redrawTranslatedText(entry, data);
                }
                if (data.pendingRedraws && data.pendingRedraws.get(key) === entry) {
                    data.pendingRedraws.delete(key);
                }
            } else {
                data.pendingRedraws.delete(key);
                dbg(`[Redraw Queue Drop] not completed at ${key}`);
            }
        }
    }

    function installMessagePendingRedrawHook(context) {
        const {
            logger,
            redrawGameMessageText,
            getRedrawGameMessageText,
        } = context;

        const resolveRedrawGameMessageText = () => {
            if (typeof getRedrawGameMessageText === 'function') {
                try {
                    const resolved = getRedrawGameMessageText();
                    if (typeof resolved === 'function') return resolved;
                } catch (_) {}
            }
            return typeof redrawGameMessageText === 'function' ? redrawGameMessageText : null;
        };
        if (!resolveRedrawGameMessageText() && typeof getRedrawGameMessageText !== 'function') return;

        try {
            if (typeof Window_Message === 'undefined'
                || !Window_Message
                || !Window_Message.prototype
                || typeof Window_Message.prototype.update !== 'function'
                || Window_Message.prototype.update.__trPendingRedrawWrapped) {
                return;
            }

            const originalMessageUpdate = Window_Message.prototype.update;
            Window_Message.prototype.update = function(...args) {
                const result = originalMessageUpdate.apply(this, args);
                try {
                    const redraw = resolveRedrawGameMessageText();
                    if (typeof redraw !== 'function') return result;
                    if (this._trStreamLoopActive
                        && this._trStreamSessionId
                        && this._trStreamSessionId === this._trSessionId
                        && typeof this._trStreamText === 'string'
                        && this._trStreamText
                        && this.visible
                        && this.isOpen()
                        && this.contents) {
                        redraw(this, this._trStreamText, { streaming: true });
                    }

                    const pending = this._trPendingRedraw;
                    if (pending && this.visible && this.isOpen() && this.contents) {
                        if (this._trSessionId === pending.sessionId) {
                            redraw(this, pending.text, pending);
                        }
                        this._trPendingRedraw = null;
                    }
                } catch (error) {
                    logger.warn('[Window_Message.update pending redraw error]', error);
                }
                return result;
            };
            Window_Message.prototype.update.__trPendingRedrawWrapped = true;
            Window_Message.prototype.update.__trOriginal = originalMessageUpdate;
        } catch (error) {
            logger.warn('[Init] Window_Message update hook error', error);
        }
    }

    defineRuntimeModule('hooks.windowState', {
        install: installWindowStateHooks,
    });
})();
