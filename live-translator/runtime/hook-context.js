// Shared hook state and helper context builder.
// It creates the WeakMaps/Sets and helper references that let separate hook modules cooperate on the same windows.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.hookContext',
        requires: {
            entryLifecycle: 'runtime.entryLifecycle',
            windowHelpers: 'hooks.window.helpers',
            textCodec: 'runtime.textCodec',
            surfaceOwnership: 'runtime.surfaceOwnership',
        },
        factory({ entryLifecycle, windowHelpers, textCodec, surfaceOwnership }) {

            function resolveWindowHelpers() {
                return windowHelpers;
            }

            function resolveTextCodec() {
                return textCodec;
            }

            function resolveSurfaceOwnership() {
                return surfaceOwnership;
            }

            function createWindowLifecycleBoundary(options = {}) {
                const source = options && typeof options === 'object' ? options : {};
                const adapterContract = source.adapterContract || null;
                const windowRegistry = source.windowRegistry || null;
                // One token identifies one logical Window_Base.refresh pass across
                // window draw hooks and contents-bitmap mutation hooks.
                let nextWindowRefreshToken = 0;
                let nextRenderDrainToken = 0;

                function getWindowData(windowInstance, windowData = null) {
                    if (windowData) return windowData;
                    if (!windowInstance || !windowRegistry || typeof windowRegistry.get !== 'function') return null;
                    try {
                        return windowRegistry.get(windowInstance) || null;
                    } catch (_) {
                        return null;
                    }
                }

                function beginRefresh(windowInstance, windowData = null) {
                    if (!windowInstance) return 0;
                    const currentDepth = Number(windowInstance._trWindowRefreshDepth) || 0;
                    const token = currentDepth > 0 && windowInstance._trWindowRefreshToken
                        ? windowInstance._trWindowRefreshToken
                        : ++nextWindowRefreshToken;
                    windowInstance._trWindowRefreshToken = token;
                    const data = getWindowData(windowInstance, windowData);
                    if (data) {
                        data._trActiveRefreshToken = token;
                        data._trWindowRefreshDepth = (Number(data._trWindowRefreshDepth) || 0) + 1;
                        ensureRefreshLedger(data, token);
                    }
                    return token;
                }

                function finishRefresh(windowInstance, token, windowData = null) {
                    if (!windowInstance) return;
                    const data = getWindowData(windowInstance, windowData);
                    if (data && Number(data._trWindowRefreshDepth) > 0) {
                        data._trWindowRefreshDepth = Math.max(0, Number(data._trWindowRefreshDepth) - 1);
                    }
                    const finished = getRefreshDepth(windowInstance, data) <= 0;
                    if (finished) commitRefreshLedger(windowInstance, data, token);
                    if ((Number(windowInstance._trWindowRefreshDepth) || 0) <= 0) {
                        if (windowInstance._trWindowRefreshToken === token) {
                            delete windowInstance._trWindowRefreshToken;
                        }
                        if (data && data._trActiveRefreshToken === token) {
                            delete data._trActiveRefreshToken;
                        }
                    }
                }

                function getRefreshState(windowInstance, windowData = null) {
                    const data = getWindowData(windowInstance, windowData);
                    const dataDepth = positiveInteger(data && data._trWindowRefreshDepth);
                    const windowDepth = positiveInteger(windowInstance && windowInstance._trWindowRefreshDepth);
                    const contentsDepth = positiveInteger(windowInstance && windowInstance.contents && windowInstance.contents._trWindowRefreshDepth);
                    const active = dataDepth > 0 || windowDepth > 0 || contentsDepth > 0;
                    const dataToken = positiveInteger(data && data._trActiveRefreshToken);
                    const windowToken = positiveInteger(windowInstance && windowInstance._trWindowRefreshToken);
                    const token = active ? (dataToken || windowToken) : 0;
                    return {
                        active,
                        token,
                        depth: Math.max(dataDepth, windowDepth, contentsDepth),
                        dataDepth,
                        windowDepth,
                        contentsDepth,
                    };
                }

                function getActiveRefreshToken(windowInstance, windowData = null) {
                    return getRefreshState(windowInstance, windowData).token;
                }

                function beginRenderDrain(windowInstance, windowData = null, reason = 'window-render-drain') {
                    if (!windowInstance) return null;
                    const data = getWindowData(windowInstance, windowData);
                    if (!data) return null;
                    const token = {
                        id: ++nextRenderDrainToken,
                        reason: String(reason || 'window-render-drain'),
                    };
                    const stack = Array.isArray(data._trRenderDrainStack)
                        ? data._trRenderDrainStack
                        : [];
                    stack.push(token);
                    data._trRenderDrainStack = stack;
                    data._trRenderDrainDepth = stack.length;
                    data._trRenderDrainReason = token.reason;
                    windowInstance._trRenderDrainDepth = (Number(windowInstance._trRenderDrainDepth) || 0) + 1;
                    windowInstance._trRenderDrainReason = token.reason;
                    return token;
                }

                function finishRenderDrain(windowInstance, token = null, windowData = null) {
                    if (!windowInstance) return;
                    const data = getWindowData(windowInstance, windowData);
                    if (data) {
                        const stack = Array.isArray(data._trRenderDrainStack)
                            ? data._trRenderDrainStack
                            : [];
                        if (stack.length > 0) {
                            if (token && stack[stack.length - 1] !== token) {
                                const index = stack.indexOf(token);
                                if (index >= 0) stack.splice(index, 1);
                            } else {
                                stack.pop();
                            }
                        }
                        data._trRenderDrainDepth = stack.length;
                        const current = stack.length > 0 ? stack[stack.length - 1] : null;
                        data._trRenderDrainReason = current ? current.reason : '';
                        if (!stack.length) delete data._trRenderDrainStack;
                    }
                    windowInstance._trRenderDrainDepth = Math.max(0, (Number(windowInstance._trRenderDrainDepth) || 1) - 1);
                    if (windowInstance._trRenderDrainDepth > 0) {
                        const state = getRenderDrainState(windowInstance, data);
                        windowInstance._trRenderDrainReason = state.reason || '';
                    } else {
                        delete windowInstance._trRenderDrainReason;
                    }
                }

                function withRenderDrain(windowInstance, windowData = null, reason = 'window-render-drain', callback = null) {
                    if (typeof callback !== 'function') return undefined;
                    const token = beginRenderDrain(windowInstance, windowData, reason);
                    if (!token) return callback();
                    try {
                        return callback();
                    } finally {
                        finishRenderDrain(windowInstance, token, windowData);
                    }
                }

                function getRenderDrainState(windowInstance, windowData = null) {
                    const data = getWindowData(windowInstance, windowData);
                    const dataDepth = positiveInteger(data && data._trRenderDrainDepth);
                    const windowDepth = positiveInteger(windowInstance && windowInstance._trRenderDrainDepth);
                    const active = dataDepth > 0 || windowDepth > 0;
                    const stack = data && Array.isArray(data._trRenderDrainStack)
                        ? data._trRenderDrainStack
                        : [];
                    const current = stack.length > 0 ? stack[stack.length - 1] : null;
                    return {
                        active,
                        depth: Math.max(dataDepth, windowDepth),
                        dataDepth,
                        windowDepth,
                        reason: current && current.reason
                            ? current.reason
                            : String((data && data._trRenderDrainReason) || (windowInstance && windowInstance._trRenderDrainReason) || ''),
                    };
                }

                function isRenderDrainActive(windowInstance, windowData = null) {
                    return getRenderDrainState(windowInstance, windowData).active === true;
                }

                function markEntryObservedInRefresh(entry, windowInstance, windowData = null) {
                    if (!entry) return 0;
                    const state = getRefreshState(windowInstance, windowData);
                    const lifecycle = ensureEntryRenderLifecycle(entry);
                    lifecycle.refreshObservation = {
                        token: state.token,
                        active: state.active,
                        depth: state.depth,
                        observedAt: Date.now(),
                    };
                    recordRefreshObservation(entry, windowInstance, windowData, state);
                    return state.token;
                }

                function wasEntryObservedInRefresh(entry, windowInstance, windowData = null) {
                    if (!entry) return false;
                    const state = getRefreshState(windowInstance, windowData);
                    if (!state.active || !state.token) return false;
                    const observation = getEntryRefreshObservation(entry);
                    const entryToken = positiveInteger(observation && observation.token);
                    return entryToken > 0 && entryToken === state.token;
                }

                function getEntryRefreshObservation(entry) {
                    return entry && entry.renderLifecycle && entry.renderLifecycle.refreshObservation
                        ? entry.renderLifecycle.refreshObservation
                        : null;
                }

                function ensureEntryRenderLifecycle(entry) {
                    if (!entry.renderLifecycle || typeof entry.renderLifecycle !== 'object') {
                        entry.renderLifecycle = {};
                    }
                    return entry.renderLifecycle;
                }

                function positiveInteger(value) {
                    const number = Number(value);
                    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
                }

                function getRefreshDepth(windowInstance, windowData = null) {
                    const dataDepth = positiveInteger(windowData && windowData._trWindowRefreshDepth);
                    const windowDepth = positiveInteger(windowInstance && windowInstance._trWindowRefreshDepth);
                    const contentsDepth = positiveInteger(windowInstance && windowInstance.contents && windowInstance.contents._trWindowRefreshDepth);
                    return Math.max(dataDepth, windowDepth, contentsDepth);
                }

                function ensureRefreshLedger(windowData, token) {
                    if (!windowData || !token) return null;
                    const current = windowData._trRefreshLedger;
                    if (current && current.token === token) return current;
                    const ledger = {
                        token,
                        observedSlots: new Map(),
                        replacedTargets: new Map(),
                        pendingRetirements: new Map(),
                    };
                    windowData._trRefreshLedger = ledger;
                    return ledger;
                }

                function getRefreshLedger(windowData, token = 0) {
                    const ledger = windowData && windowData._trRefreshLedger;
                    if (!ledger || !ledger.token) return null;
                    if (token && ledger.token !== token) return null;
                    return ledger;
                }

                function recordRefreshObservation(entry, windowInstance, windowData = null, refreshState = null) {
                    const state = refreshState || getRefreshState(windowInstance, windowData);
                    if (!entry || !state.active || !state.token) return false;
                    const data = getWindowData(windowInstance, windowData);
                    const ledger = getRefreshLedger(data, state.token);
                    if (!ledger) return false;
                    const proof = createRefreshEntryProof(entry, '');
                    if (!proof || !proof.key) return false;
                    proof.token = state.token;
                    proof.observedAt = Date.now();
                    ledger.observedSlots.set(proof.key, proof);
                    const pending = ledger.pendingRetirements.get(proof.key);
                    if (pending && pending.retargeted === true) {
                        ledger.pendingRetirements.delete(proof.key);
                    } else if (pending) {
                        pending.observedAfterReplacement = true;
                        pending.details = Object.assign({}, pending.details || {}, {
                            refreshObservedAfterReplacement: true,
                            renderTargetRetargeted: false,
                        });
                    }
                    return true;
                }

                function recordRefreshTargetReplacement(windowInstance, windowData = null, details = {}) {
                    const data = getWindowData(windowInstance, windowData);
                    const state = getRefreshState(windowInstance, data);
                    if (!data || !state.active || !state.token || !data.texts || typeof data.texts.forEach !== 'function') return 0;
                    const ledger = ensureRefreshLedger(data, state.token);
                    const source = details && typeof details === 'object' ? details : {};
                    const reason = String(source.reason || source.message || 'contents-replaced');
                    const windowType = data.windowType || (windowInstance && windowInstance.constructor ? windowInstance.constructor.name : '');
                    let count = 0;
                    data.texts.forEach((entry, key) => {
                        if (!entry || !isEntryActive(entry)) return;
                        const proof = createRefreshEntryProof(entry, key);
                        if (!proof || !proof.key) return;
                        const pendingDetails = {
                            key: String(key || ''),
                            windowType,
                            refreshToken: state.token,
                            slotKey: proof.slotKey,
                            normalizedSource: proof.normalizedSource,
                            previousContentsRevision: Number(source.previousContentsRevision) || 0,
                            nextContentsRevision: Number(source.nextContentsRevision) || 0,
                            wasCompleted: isEntryCompleted(entry),
                        };
                        const retargeted = retargetEntryRenderTarget(entry, reason, pendingDetails);
                        pendingDetails.renderTargetRetargeted = retargeted;
                        ledger.replacedTargets.set(proof.key, Object.assign({}, proof, {
                            token: state.token,
                            replacedAt: Date.now(),
                            retargeted,
                            details: pendingDetails,
                        }));
                        ledger.pendingRetirements.set(proof.key, {
                            token: state.token,
                            entry,
                            key: String(key || ''),
                            reason,
                            retargeted,
                            details: pendingDetails,
                        });
                        count += 1;
                    });
                    return count;
                }

                function createRefreshEntryProof(entry, key) {
                    const slotKey = firstNonEmptyString(
                        entry && entry.slotKey,
                        key,
                        entry && entry.key
                    );
                    const normalizedSource = firstNonEmptyString(
                        entry && entry.normalizedSource,
                        entry && entry.translationSource,
                        entry && entry.visibleText,
                        entry && entry.rawText
                    ).trim();
                    if (!slotKey || !normalizedSource) return null;
                    return {
                        key: `${slotKey}\u001f${normalizedSource}`,
                        slotKey,
                        normalizedSource,
                    };
                }

                function firstNonEmptyString(...values) {
                    for (const value of values) {
                        const text = String(value ?? '');
                        if (text.trim()) return text;
                    }
                    return '';
                }

                function retargetEntryRenderTarget(entry, reason, details) {
                    if (!adapterContract || typeof adapterContract.retargetRenderTarget !== 'function') return false;
                    try {
                        const result = adapterContract.retargetRenderTarget(entry, {
                            message: reason || 'contents-replaced',
                            reason: reason || 'contents-replaced',
                            details,
                        });
                        return !!(result && result.handled === true);
                    } catch (_) {
                        return false;
                    }
                }

                function commitRefreshLedger(windowInstance, windowData, token) {
                    const ledger = getRefreshLedger(windowData, token);
                    if (!ledger) return false;
                    try {
                        ledger.pendingRetirements.forEach((pending) => {
                            commitPendingRefreshRetirement(windowInstance, windowData, pending);
                        });
                    } finally {
                        if (windowData && windowData._trRefreshLedger === ledger) {
                            delete windowData._trRefreshLedger;
                        }
                    }
                    return true;
                }

                function commitPendingRefreshRetirement(windowInstance, windowData, pending) {
                    if (!pending || !pending.entry) return false;
                    const entry = pending.entry;
                    const reason = pending.reason || 'contents-replaced';
                    const details = pending.details || {};
                    try {
                        entryLifecycle.markStale(entry, reason, {
                            surfaceVisible: false,
                            screenState: 'hidden',
                        });
                    } catch (_) {}
                    retireEntry(entry, reason, details, {
                        eventType: 'item.disappeared',
                        policy: { kind: 'retired' },
                    });
                    try {
                        entryLifecycle.setSurfaceVisible(entry, false, {
                            reason,
                            screenState: 'hidden',
                        });
                    } catch (_) {}
                    if (windowData && windowData.texts && pending.key) {
                        try {
                            if (windowData.texts.get(pending.key) === entry) windowData.texts.delete(pending.key);
                        } catch (_) {}
                    }
                    if (windowData && windowData.renderReadinessSchedule && pending.key) {
                        try { windowData.renderReadinessSchedule.delete(pending.key); } catch (_) {}
                    }
                    if (windowData && windowData.recentlyRedrawn && pending.key) {
                        try { windowData.recentlyRedrawn.delete(pending.key); } catch (_) {}
                    }
                    return true;
                }

                function retireEntry(entry, reason, details = null, options = {}) {
                    if (!entry || !entry.recordId) return false;
                    let touched = false;
                    try {
                        if (adapterContract && typeof adapterContract.retireItem === 'function') {
                            adapterContract.retireItem(entry, 'disappeared', {
                                eventType: options.eventType || 'item.disappeared',
                                message: reason || '',
                                policy: options.policy && typeof options.policy === 'object'
                                    ? options.policy
                                    : { kind: 'retired' },
                                details,
                            });
                            touched = true;
                        }
                    } catch (_) {}
                    return touched;
                }

                function setEntryVisible(entry, visible, details = {}) {
                    if (!entry || !entry.recordId || !isEntryActive(entry)) return false;
                    const isVisible = visible === true;
                    try {
                        if (adapterContract && typeof adapterContract.setItemVisibility === 'function') {
                            adapterContract.setItemVisibility(entry, isVisible, details || {});
                        }
                    } catch (_) {}
                    entryLifecycle.setSurfaceVisible(entry, isVisible, details || {});
                    return true;
                }

                function getEntryStatus(entry, fallback = '') {
                    if (!entry || !entry.recordId) return String(fallback || '');
                    if (adapterContract && typeof adapterContract.getRecordStatus === 'function') {
                        return adapterContract.getRecordStatus(entry, fallback);
                    }
                    return String(fallback || '');
                }

                function isEntryActive(entry) {
                    if (!entry || !entry.recordId) return false;
                    if (adapterContract && typeof adapterContract.isRecordActive === 'function') {
                        return adapterContract.isRecordActive(entry);
                    }
                    return false;
                }

                function isEntryCompleted(entry) {
                    return getEntryStatus(entry) === 'completed';
                }

                function isEntryTranslationPending(entry) {
                    if (!entry || !entry.recordId) return false;
                    if (adapterContract && typeof adapterContract.isRecordRequestActive === 'function') {
                        return adapterContract.isRecordRequestActive(entry);
                    }
                    const status = getEntryStatus(entry);
                    return status === 'pending' || status === 'translating';
                }

                function notifyRenderCommandReady(commandId, details = {}) {
                    if (!adapterContract || typeof adapterContract.notifyRenderCommandReady !== 'function') {
                        return {
                            status: 'unavailable',
                            handled: false,
                            changed: false,
                            terminal: true,
                            commandId: String(commandId || ''),
                            reason: 'notifyRenderCommandReady unavailable',
                        };
                    }
                    return adapterContract.notifyRenderCommandReady(commandId, details || {});
                }

                return {
                    retireEntry,
                    setEntryVisible,
                    getEntryStatus,
                    isEntryActive,
                    isEntryCompleted,
                    isEntryTranslationPending,
                    notifyRenderCommandReady,
                    beginRefresh,
                    finishRefresh,
                    getRefreshState,
                    getActiveRefreshToken,
                    getRefreshLedger,
                    recordRefreshTargetReplacement,
                    beginRenderDrain,
                    finishRenderDrain,
                    withRenderDrain,
                    getRenderDrainState,
                    isRenderDrainActive,
                    markEntryObservedInRefresh,
                    wasEntryObservedInRefresh,
                };
            }

            return {
                createHookContext(options = {}) {
                    const {
                        adapterContract = null,
                        windowAdapterContract = adapterContract,
                    } = options || {};
                    const windowHelpers = resolveWindowHelpers();
                    const textCodec = resolveTextCodec();
                    const surfaceOwnershipFactory = resolveSurfaceOwnership();
                    const windowRegistry = new WeakMap();
                    const registeredWindows = new Set();
                    const contentsOwners = new WeakMap();
                    const surfaceOwnership = surfaceOwnershipFactory.createSurfaceOwnershipService({
                        contentsOwners,
                        windowRegistry,
                        registeredWindows,
                    });
                    const windowLifecyclePrototypeHooks = {
                        install: null,
                    };
                    let windowTextHelpersProvider = null;
                    const getWindowTextHelpers = () => {
                        if (typeof windowTextHelpersProvider !== 'function') return null;
                        try {
                            return windowTextHelpersProvider() || null;
                        } catch (_) {
                            return null;
                        }
                    };
                    const windowLifecycle = createWindowLifecycleBoundary({
                        adapterContract: windowAdapterContract,
                        windowRegistry,
                    });

                    const {
                        addWindowToRegistry,
                        ensureWindowRegistered,
                        unregisterWindow,
                        pruneDetachedRegisteredWindows,
                    } = windowHelpers.createWindowRegistryHelpers({
                        windowRegistry,
                        registeredWindows,
                        contentsOwners,
                        surfaceOwnership,
                        windowLifecycle,
                        adapterContract: windowAdapterContract,
                        windowLifecyclePrototypeHooks,
                        getWindowTextHelpers,
                    });

                    function registerWindowLifecyclePrototypeInstaller(installer) {
                        windowLifecyclePrototypeHooks.install = typeof installer === 'function'
                            ? installer
                            : null;
                    }

                    function setWindowTextHelpersProvider(provider) {
                        windowTextHelpersProvider = typeof provider === 'function'
                            ? provider
                            : null;
                    }

                    return {
                        windowHelpers,
                        textCodec,
                        captureBitmapDrawState: windowHelpers.captureBitmapDrawState,
                        applyBitmapDrawState: windowHelpers.applyBitmapDrawState,
                        resolveTextScalePercent: windowHelpers.resolveTextScalePercent,
                        scaleBitmapDrawState: windowHelpers.scaleBitmapDrawState,
                        scaleFontSizeValue: windowHelpers.scaleFontSizeValue,
                        createWindowTextScaleScope: windowHelpers.createWindowTextScaleScope,
                        generateKey: windowHelpers.generateKey,
                        stripControls: textCodec.stripControls,
                        createTextSource: textCodec.createTextSource,
                        restoreText: textCodec.restoreText,
                        windowRegistry,
                        registeredWindows,
                        contentsOwners,
                        surfaceOwnership,
                        windowAdapterContract,
                        windowLifecycle,
                        setWindowTextHelpersProvider,
                        registerWindowLifecyclePrototypeInstaller,
                        addWindowToRegistry,
                        ensureWindowRegistered,
                        unregisterWindow,
                        pruneDetachedRegisteredWindows,
                        PER_CHAR_MARK: '\u2060',
                    };
                },
            };
        },
    });
})();
