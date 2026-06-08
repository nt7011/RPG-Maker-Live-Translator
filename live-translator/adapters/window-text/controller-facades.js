// Window text adapter support: explicit controller dependency facades.
//
// Window Text controllers are created lazily and can call each other through
// the adapter dispatcher. These facades keep those cross-controller
// dependencies narrow and reviewable instead of letting each controller reach
// into the whole adapter context.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/controller-facades.js.');
    }

    function createWindowTextControllerFacades(context = {}) {
        const callController = context.callController;
        if (typeof callController !== 'function') {
            throw new Error('[WindowTextAdapter] controller facades require a controller dispatcher.');
        }

        return Object.freeze({
            diagnostics: bindControllerMethods(callController, [
                'recordDrawTrace',
                'windowTraceDetails',
                'recordDecision',
                'roundDiagnosticNumber',
                'cloneDiagnosticRect',
                'cloneDiagnosticArea',
                'getSnapshotDiagnostics',
                'summarizeReplayItemsForDiagnostics',
                'summarizeReplayStateForDiagnostics',
            ]),
            entryLifecycle: bindControllerMethods(callController, [
                'markRecordDisappeared',
                'findExistingEntry',
                'retireEntriesInSameSlot',
                'rememberDetachedEntry',
                'takeDetachedEntry',
                'clearPendingInvalidation',
                'getCurrentEntry',
                'getTextEntryKey',
                'resolveWindowData',
                'resolveTargetWindow',
                'isWindowReadyForRedraw',
                'refreshEntryBounds',
            ]),
            entryRecords: bindControllerMethods(callController, [
                'getEntryStatus',
                'isEntryActive',
                'isEntryCompleted',
                'firstNonEmptyString',
                'requestEntryTranslation',
                'observeEntry',
                'getRegisteredWindowData',
                'markEntryObservedInRefresh',
                'safeStripRpgmEscapes',
                'describeWindowScreenState',
            ]),
            requestLifecycle: bindControllerMethods(callController, [
                'markRequestFailed',
            ]),
            renderCommands: bindControllerMethods(callController, [
                'applyRenderCommand',
                'markRequestSkipped',
                'markRequestFailed',
                'updateOrchestratorItem',
                'beginPendingRenderCommand',
                'markPendingRenderDeferred',
                'completePendingRenderCommand',
                'redrawTranslatedText',
            ]),
            renderCompletion: bindControllerMethods(callController, [
                'updateOrchestratorItem',
                'completePendingRenderCommand',
                'rejectPendingRender',
            ]),
            renderDraw: bindControllerMethods(callController, [
                'drawTranslatedEntry',
                'drawTranslatedWindowText',
                'invokeCompletedEntry',
                'invokeOriginalDrawText',
                'invokeOriginalDrawTextEx',
                'isWindowTranslatedDrawActive',
            ]),
            renderQueue: bindControllerMethods(callController, [
                'queueRenderRetry',
                'dropRenderRetry',
            ]),
            renderReadiness: bindControllerMethods(callController, [
                'planTranslatedRedraw',
            ]),
            sourceDraw: bindControllerMethods(callController, [
                'captureWindowEntrySource',
                'beginEntryNativeSourceDraw',
                'completeEntryNativeSourceDraw',
            ]),
            textConversion: bindControllerMethods(callController, [
                'restoreTranslatedWindowText',
                'sanitizeDrawTextOutput',
                'convertWindowText',
            ]),
            textMetrics: bindControllerMethods(callController, [
                'estimateEntryBounds',
                'estimateMaxDrawTextExFallbackHeight',
                'prepareTranslationSource',
                'getLineHeight',
                'getSurfaceId',
                'getIdentitySurfaceId',
                'createSlotKey',
                'createWindowTextRecordId',
                'getWindowTypeName',
                'getWindowCtorName',
                'describeWindowTextEligibility',
                'describeEntryEligibility',
                'isDedicatedMessageWindow',
                'normalizeDrawTextAlignValue',
            ]),
            bitmapReplay: bindControllerMethods(callController, [
                'mergeBounds',
                'isValidRect',
                'calculateBitmapSurfaceTextYOffset',
                'estimateBitmapSurfaceTextBounds',
                'withWindowRedrawClear',
                'withWindowContents',
                'isUsableBitmap',
                'getRedrawContents',
                'getBitmapReplayApi',
                'assignWindowTextDrawOrder',
                'captureWindowEntryBackground',
                'captureWindowEntryBackgroundPatch',
                'ensureWindowEntryBackground',
                'createClearRectFromArea',
                'getReplayItemRect',
                'expandReplayDirtyRect',
                'collectWindowTextReplayItems',
                'combineReplayItems',
                'filterReplayForEntry',
                'replayMixedItems',
                'supportsBitmapReplayClip',
                'getWindowEntryBackgroundSnapshotStatus',
                'restoreWindowEntryBackground',
            ]),
        });
    }

    function bindControllerMethods(callController, names) {
        const facade = Object.create(null);
        names.forEach((name) => {
            facade[name] = (...args) => callController(name, ...args);
        });
        return Object.freeze(facade);
    }

    defineRuntimeModule('adapters.windowTextControllerFacades', { create: createWindowTextControllerFacades });
})();
