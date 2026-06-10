// Window text adapter support: render readiness planning.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/render-planner.js.');
    }

    function createRenderPlannerController(context = {}) {
        const { lifecycle: lifecycleService } = context.services;
        const { entryLifecycleState } = context;

        function planTranslatedRedraw(entry, windowData = null) {
            if (!entry) return reject('missing-entry');
            if (entryLifecycleState.isStale(entry)) return reject('window-entry-stale');

            const activeWindowData = windowData || context.resolveWindowData(entry);
            const targetWindow = context.resolveTargetWindow(entry, activeWindowData);
            if (!targetWindow || !activeWindowData) {
                return reject('window-redraw-target-missing', {
                    windowType: activeWindowData && activeWindowData.windowType ? activeWindowData.windowType : '',
                });
            }

            const textKey = entry.key || context.getTextEntryKey(activeWindowData, entry);
            const currentEntry = textKey && activeWindowData.texts ? activeWindowData.texts.get(textKey) : null;
            if (currentEntry !== entry) {
                return reject('window-entry-replaced', {
                    key: textKey || '',
                    windowType: context.getWindowTypeName(targetWindow, activeWindowData),
                    textKey,
                });
            }

            const pendingInvalidation = entryLifecycleState.getPendingInvalidation(entry);
            if (pendingInvalidation && !hasCopiedStagingRenderTarget(entry)) {
                return defer('window-redraw-invalidated', 'on-update-ready', {
                    key: textKey || '',
                    reason: pendingInvalidation.reason || '',
                    textKey,
                    targetWindow,
                    windowData: activeWindowData,
                });
            }

            if (isNativeSourceDrawPending(entry)) {
                return defer('native-source-draw-pending', 'after-source-draw', {
                    textKey,
                    targetWindow,
                    windowData: activeWindowData,
                });
            }

            if (isObservedInActiveRefresh(entry, targetWindow, activeWindowData)) {
                return defer('active-refresh-transaction', 'after-refresh', {
                    textKey,
                    targetWindow,
                    windowData: activeWindowData,
                });
            }

            const contents = context.getRedrawContents(targetWindow, entry);
            if (!context.isWindowReadyForRedraw(targetWindow, contents)) {
                return defer('window-not-ready', 'on-update-ready', {
                    textKey,
                    targetWindow,
                    windowData: activeWindowData,
                });
            }

            const renderDrain = getRenderDrainState(targetWindow, activeWindowData);
            if (!renderDrain.active) {
                return defer('render-drain-not-active', 'on-update-ready', {
                    textKey,
                    targetWindow,
                    windowData: activeWindowData,
                    key: textKey || '',
                    windowType: context.getWindowTypeName(targetWindow, activeWindowData),
                    renderDrain,
                });
            }

            return {
                action: 'draw-now',
                reason: '',
                queue: '',
                entry,
                textKey,
                targetWindow,
                windowData: activeWindowData,
                contents,
                details: {
                    key: textKey || '',
                    windowType: context.getWindowTypeName(targetWindow, activeWindowData),
                },
            };
        }

        function hasCopiedStagingRenderTarget(entry) {
            const isStaging = !!(entry
                && (entry.requiresCopiedTarget === true
                    || entry.sourceContentsRole === 'window-staging-contents'));
            if (!isStaging || !Array.isArray(entry._trCopiedRenderTargets)) return false;
            return entry._trCopiedRenderTargets.some((target) => target && target.targetBitmap);
        }

        function isObservedInActiveRefresh(entry, targetWindow, windowData) {
            return !!(lifecycleService
                && typeof lifecycleService.wasEntryObservedInRefresh === 'function'
                && lifecycleService.wasEntryObservedInRefresh(entry, targetWindow, windowData));
        }

        function isNativeSourceDrawPending(entry) {
            const sourceDraw = entry
                && entry.renderLifecycle
                && entry.renderLifecycle.sourceDraw;
            return !!(sourceDraw
                && sourceDraw.status === 'pending'
                && sameGeneration(sourceDraw.entryGeneration, entry.surfaceRevision));
        }

        function getRenderDrainState(targetWindow, windowData) {
            if (!lifecycleService || typeof lifecycleService.getRenderDrainState !== 'function') {
                return { active: false, depth: 0, dataDepth: 0, windowDepth: 0, reason: '' };
            }
            const state = lifecycleService.getRenderDrainState(targetWindow, windowData);
            return state && typeof state === 'object'
                ? state
                : { active: false, depth: 0, dataDepth: 0, windowDepth: 0, reason: '' };
        }

        function sameGeneration(left, right) {
            const leftNumber = Number(left);
            const rightNumber = Number(right);
            return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber;
        }

        function defer(reason, queue, details = {}) {
            const {
                textKey = '',
                targetWindow = null,
                windowData = null,
                ...diagnosticDetails
            } = details || {};
            return {
                action: 'defer',
                reason,
                queue,
                textKey,
                targetWindow,
                windowData,
                details: diagnosticDetails,
            };
        }

        function reject(reason, details = {}) {
            return {
                action: 'reject',
                reason,
                queue: '',
                details,
            };
        }

        return { planTranslatedRedraw };
    }

    defineRuntimeModule('adapters.windowTextRenderPlanner', { create: createRenderPlannerController });
})();
