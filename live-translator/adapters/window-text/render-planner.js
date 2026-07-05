// Window text adapter support: render readiness planning.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.renderPlanner',
        requires: {
            restorePlannerModule: 'runtime.bitmap.restorePlanner',
            bitmapRenderPlannerModule: 'runtime.bitmap.renderPlanner',
        },
        factory({ restorePlannerModule, bitmapRenderPlannerModule }) {

    function createRenderPlannerController(context = {}) {
        const { lifecycle: lifecycleService } = context.services;
        const { entryLifecycleState } = context;
        const facades = context.facades || {};
        const bitmapGeometry = facades.bitmapGeometry || {};
        const bitmapReplay = facades.bitmapReplay || {};
        const intel = facades.intel || {};
        const entryLifecycle = facades.entryLifecycle || {};
        const textMetrics = facades.textMetrics || {};
        const {
                    materializeCopiedRenderTargetsForEntry,
                    collectWindowTextReplayItems,
                    combineReplayItems,
                    filterReplayForEntry,
                    getRedrawContents,
                } = bitmapReplay;
        const {
                    createClearRectFromArea,
                    getReplayItemRect,
                    expandReplayDirtyRect,
                    supportsBitmapReplayClip,
                    isValidRect,
                } = bitmapGeometry;
        const { summarizeReplayStateForIntel } = intel;
        const {
                    resolveWindowData,
                    resolveTargetWindow,
                    getCurrentEntry,
                    getTextEntryKey,
                    isWindowReadyForRedraw,
                } = entryLifecycle;
        const resolveCurrentEntry = typeof getCurrentEntry === 'function'
            ? getCurrentEntry
            : ((data, targetEntry) => {
                const key = targetEntry && (targetEntry.key || (typeof getTextEntryKey === 'function' ? getTextEntryKey(data, targetEntry) : ''));
                return key && data && data.texts ? data.texts.get(key) || null : null;
            });
        const { getWindowTypeName } = textMetrics;
        const restorePlanner = restorePlannerModule.create({
            getReplayItemRect,
            isBitmapSurfaceTextEntry,
            isValidRect,
        });
        const bitmapRenderPlanner = hasWindowBitmapPlannerMethods(context.bitmapRenderPlanner)
            ? context.bitmapRenderPlanner
            : bitmapRenderPlannerModule.create({
                restorePlanner,
                createClearRectFromArea,
                expandReplayDirtyRect,
                supportsBitmapReplayClip,
                collectWindowTextReplayItems,
                combineReplayItems,
                filterReplayForEntry,
                summarizeReplayState: summarizeReplayStateForIntel,
            });

        function planTranslatedRedraw(entry, windowData = null) {
            if (!entry) return reject('missing-entry');
            if (entryLifecycleState.isStale(entry)) return reject('window-entry-stale');

            const activeWindowData = windowData || resolveWindowData(entry);
            const targetWindow = resolveTargetWindow(entry, activeWindowData);
            if (!targetWindow || !activeWindowData) {
                return reject('window-redraw-target-missing', {
                    windowType: activeWindowData && activeWindowData.windowType ? activeWindowData.windowType : '',
                });
            }

            const textKey = entry.key || getTextEntryKey(activeWindowData, entry);
            const currentEntry = textKey && activeWindowData.texts
                ? resolveCurrentEntry(activeWindowData, entry)
                : null;
            if (currentEntry !== entry) {
                return reject('window-entry-replaced', {
                    key: textKey || '',
                    windowType: getWindowTypeName(targetWindow, activeWindowData),
                    textKey,
                });
            }

            const pendingInvalidation = entryLifecycleState.getPendingInvalidation(entry);
            const copiedTargetReadiness = pendingInvalidation
                ? planCopiedStagingReadiness(entry, pendingInvalidation)
                : null;
            if (pendingInvalidation && (!copiedTargetReadiness || copiedTargetReadiness.status !== 'planned')) {
                return defer('window-redraw-invalidated', 'on-update-ready', {
                    key: textKey || '',
                    reason: pendingInvalidation.reason || '',
                    textKey,
                    targetWindow,
                    windowData: activeWindowData,
                    copiedTargetReadiness: copiedTargetReadiness && copiedTargetReadiness.intel || null,
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

            const contents = getRedrawContents(targetWindow, entry);
            if (!isWindowReadyForRedraw(targetWindow, contents)) {
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
                    windowType: getWindowTypeName(targetWindow, activeWindowData),
                    renderDrain,
                });
            }

            const details = {
                key: textKey || '',
                windowType: getWindowTypeName(targetWindow, activeWindowData),
            };
            if (copiedTargetReadiness) {
                details.copiedTargetReadiness = copiedTargetReadiness.intel || null;
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
                details,
            };
        }

        function planWindowCopiedTargetRedraw(entry, renderedText) {
            const sourceDraw = entry && entry.renderLifecycle && entry.renderLifecycle.sourceDraw || null;
            const renderPlan = bitmapRenderPlanner.createWindowSourceEntryCopiedTargetRenderPlan({
                entry,
                text: renderedText,
                collectProjectedTargets: materializeCopiedRenderTargetsForEntry,
                sourceCommitted: !!(sourceDraw && sourceDraw.sourceCommitted === true),
            });
            return {
                renderPlan,
                intel: renderPlan && renderPlan.intel || null,
            };
        }

        function planWindowBitmapReplay(input) {
            return bitmapRenderPlanner.createWindowBitmapReplayPlan(input || {});
        }

        function planWindowBitmapRedraw(input) {
            return bitmapRenderPlanner.createWindowBitmapRenderPlan(input || {});
        }

        function planCopiedStagingReadiness(entry, pendingInvalidation) {
            return bitmapRenderPlanner.createWindowSourceEntryCopiedTargetReadinessPlan({
                entry,
                collectProjectedTargets: materializeCopiedRenderTargetsForEntry,
                pendingInvalidation: !!pendingInvalidation,
            });
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
                ...intelDetails
            } = details || {};
            return {
                action: 'defer',
                reason,
                queue,
                textKey,
                targetWindow,
                windowData,
                details: intelDetails,
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

        function isBitmapSurfaceTextEntry(entry) {
            const origin = entry && entry.drawOrigin;
            return !!(origin && origin.type === 'bitmapSurface');
        }

        function hasWindowBitmapPlannerMethods(planner) {
            return !!(planner
                && typeof planner.createWindowBitmapReplayPlan === 'function'
                && typeof planner.createWindowBitmapRenderPlan === 'function'
                && typeof planner.createWindowSourceEntryCopiedTargetReadinessPlan === 'function'
                && typeof planner.createWindowSourceEntryCopiedTargetRenderPlan === 'function');
        }

        return {
            planTranslatedRedraw,
            planWindowBitmapReplay,
            planWindowBitmapRedraw,
            planWindowCopiedTargetRedraw,
        };
    }
            return { create: createRenderPlannerController };
        },
    });
})();
