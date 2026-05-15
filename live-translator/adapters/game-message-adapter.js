// Game message adapter facade for RPG Maker MV/MZ.
//
// Window_Message observation, redraw, glyph ownership, and foresight scanning are
// split across adapters/game-message/*.js. This file composes those controllers
// into the public adapters.gameMessage module used by bootstrap.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) globalScope.LiveTranslatorModules = {};
    if (!globalScope.LiveTranslatorModules.adapters) globalScope.LiveTranslatorModules.adapters = {};

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/game-message-adapter.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/game-message-adapter.js.');
    }

    const controllers = {
        install: requireRuntimeModule('adapters.gameMessage.install'),
        text: requireRuntimeModule('adapters.gameMessage.text'),
        wrapping: requireRuntimeModule('adapters.gameMessage.wrapping'),
        redraw: requireRuntimeModule('adapters.gameMessage.redraw'),
        session: requireRuntimeModule('adapters.gameMessage.session'),
        detection: requireRuntimeModule('adapters.gameMessage.detection'),
        foresightContext: requireRuntimeModule('adapters.gameMessage.foresightContext'),
        foresightHooks: requireRuntimeModule('adapters.gameMessage.foresightHooks'),
        foresightRecords: requireRuntimeModule('adapters.gameMessage.foresightRecords'),
        clear: requireRuntimeModule('adapters.gameMessage.clear'),
        records: requireRuntimeModule('adapters.gameMessage.records'),
        render: requireRuntimeModule('adapters.gameMessage.render'),
    };

    const MESSAGE_ADAPTER_ID = 'message';
    const MESSAGE_RENDER_STRATEGY = 'messageRedraw';
    const MESSAGE_ACTIVE_PRIORITY = 1000;
    const MESSAGE_BACKGROUND_PRIORITY = 100;
    const FORESIGHT_BASE_PRIORITY = 400;
    const FORESIGHT_BUDGET = 30;
    const FORESIGHT_SURFACE_BUDGET = 10;
    const FORESIGHT_MAX_SCAN_COMMANDS = 150;
    const FORESIGHT_SURFACE_MAX_SCAN_COMMANDS = 50;
    const FORESIGHT_RECORD_TTL_MS = 45000;
    const BREAK_SENTINEL_PREFIX = '\uE000LTMB';
    const BREAK_SENTINEL_SUFFIX = '\uE001';
    const RAW_BREAK_PATTERN = /\f|\r\n|\r|\n/g;
    const SOFT_BREAK_PATTERN = /[ \t\v]*(?:\f|\r\n|\r|\n)[ \t\v]*/g;
    const NO_SPACE_LINE_JOIN_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
    const SENTINEL_BOUNDARY_PATTERN = /[\uE000\uE001]/u;
    const ESCAPE_CODE_PATTERN = /^[\$\.\|\^!><\{\}\\]|^[A-Z]+/i;
    const NUMERIC_PARAM_PATTERN = /^\[\d+\]/;
    const CJK_CHAR_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/u;
    const EVENT_COMMAND_CONTINUATION_CODES = Object.freeze({
        105: 405,
        108: 408,
        205: 505,
        355: 655,
        357: 657,
    });

    function installGameMessageAdapter(context = {}) {
        const adapter = createGameMessageAdapter(context);
        const result = adapter.install();
        result.helpers = {
            drawMessageFaceIfNeeded: adapter.drawMessageFaceIfNeeded,
            redrawGameMessageText: adapter.redrawGameMessageText,
            applyPendingMessageRedraw: adapter.applyPendingMessageRedraw,
            resolveMessageStartCoordinates: adapter.resolveMessageStartCoordinates,
        };
        return result;
    }

    function createGameMessageAdapter(context = {}) {
        const scope = {
            globalScope,
            logger: context.logger || console,
            dbg: typeof context.dbg === 'function' ? context.dbg : () => {},
            diag: typeof context.diag === 'function' ? context.diag : () => {},
            preview: typeof context.preview === 'function' ? context.preview : (text) => String(text ?? ''),
            stripControls: typeof context.stripControls === 'function' ? context.stripControls : (text) => String(text ?? ''),
            encodeText: typeof context.encodeText === 'function'
                ? context.encodeText
                : (text) => ({
                    originalText: String(text ?? ''),
                    visibleText: String(text ?? '').trim(),
                    translationText: String(text ?? ''),
                    normalizedText: String(text ?? '').trim(),
                    tokens: [],
                }),
            restoreText: typeof context.restoreText === 'function' ? context.restoreText : (translated) => translated,
            telemetry: context.telemetry || null,
            adapterContract: context.adapterContract || null,
            settings: context.settings && typeof context.settings === 'object' ? context.settings : {},
            captureBitmapDrawState: typeof context.captureBitmapDrawState === 'function' ? context.captureBitmapDrawState : () => null,
            applyBitmapDrawState: typeof context.applyBitmapDrawState === 'function' ? context.applyBitmapDrawState : () => {},
            contentsOwners: context.contentsOwners || null,
            registeredWindows: context.registeredWindows || null,
            pruneDetachedRegisteredWindows: typeof context.pruneDetachedRegisteredWindows === 'function' ? context.pruneDetachedRegisteredWindows : null,
            logEscape: typeof context.logEscape === 'function' ? context.logEscape : () => {},
            trackedMessageWindows: new Set(),
            messageRecordsById: new Map(),
            renderTargets: new Map(),
            detachedRecords: new Map(),
            bitmapGlyphSources: new Map(),
            foresightRecordsBySource: new Map(),
            interpreterExecutionStack: [],
            nextForesightId: 0,
            textScalePercent: null,
            originAwareLineBreaks: null,
            foresightEnabled: null,
            fallbackMessageState: null,
            foresightScanner: null,
            MESSAGE_ADAPTER_ID, MESSAGE_RENDER_STRATEGY, MESSAGE_ACTIVE_PRIORITY, MESSAGE_BACKGROUND_PRIORITY,
            FORESIGHT_BASE_PRIORITY, FORESIGHT_BUDGET, FORESIGHT_SURFACE_BUDGET,
            FORESIGHT_MAX_SCAN_COMMANDS, FORESIGHT_SURFACE_MAX_SCAN_COMMANDS, FORESIGHT_RECORD_TTL_MS,
            BREAK_SENTINEL_PREFIX, BREAK_SENTINEL_SUFFIX, RAW_BREAK_PATTERN, SOFT_BREAK_PATTERN,
            NO_SPACE_LINE_JOIN_PATTERN, SENTINEL_BOUNDARY_PATTERN, ESCAPE_CODE_PATTERN, NUMERIC_PARAM_PATTERN,
            CJK_CHAR_PATTERN, EVENT_COMMAND_CONTINUATION_CODES,
        };
        const methodControllers = {
            install: 'install',
            hasTextOrchestrator: 'install',
            getGameMessageForWindow: 'install',
            isMessageWindowLike: 'install',
            markDedicatedMessageWindow: 'install',
            claimMessageContentsSurface: 'install',
            drawMessageFaceIfNeeded: 'install',
            exposeAdapterApi: 'install',
            resolveMessageStartCoordinates: 'install',
            resolveGameMessageTextScale: 'text',
            resolveGameMessageOriginAwareLineBreaks: 'text',
            resolveEnableForesight: 'text',
            createBreakToken: 'text',
            createBreakMap: 'text',
            countTokenOccurrences: 'text',
            previousNonHorizontalWhitespace: 'text',
            nextNonHorizontalWhitespace: 'text',
            shouldJoinSoftBreakWithoutSpace: 'text',
            collapseGameMessageSoftBreaks: 'text',
            normalizeConvertedMessageText: 'text',
            sanitizeRestoredMessageText: 'text',
            createEscapeAwarePayload: 'text',
            restoreMessageText: 'text',
            restoreStreamingText: 'text',
            getResolvedTextForWindow: 'text',
            createTextScaleScope: 'wrapping',
            disposeTextScaleScope: 'wrapping',
            ensureTextScaleScope: 'wrapping',
            getCurrentLineHeight: 'wrapping',
            canSoftWrap: 'wrapping',
            resetWrapPageState: 'wrapping',
            commitWrapLineBreak: 'wrapping',
            readEscapeToken: 'wrapping',
            isMessageWhitespace: 'wrapping',
            isMessageCjkCharacter: 'wrapping',
            tokenizeMessageText: 'wrapping',
            measureTokenWidth: 'wrapping',
            applyEscapeToken: 'wrapping',
            appendMeasuredText: 'wrapping',
            appendTextRun: 'wrapping',
            wrapMessageText: 'wrapping',
            resolveMessageStartX: 'wrapping',
            appendEscapeTokenForWrap: 'wrapping',
            appendSpaceTokenForWrap: 'wrapping',
            canUseNativeRender: 'redraw',
            drawMessageFaceIfReady: 'redraw',
            createNativeTextState: 'redraw',
            flushNativeText: 'redraw',
            redrawFallback: 'redraw',
            redrawGameMessageText: 'redraw',
            redrawMessageText: 'redraw',
            isMessageWindowReadyForRedraw: 'redraw',
            shouldDeferMessageRedraw: 'redraw',
            applyPendingMessageRedraw: 'redraw',
            createPendingRenderDecision: 'redraw',
            acceptPendingMessageRender: 'redraw',
            rejectPendingMessageRender: 'redraw',
            clearPendingMessageRedraw: 'redraw',
            createMessageState: 'session',
            getMessageState: 'session',
            beginMessageSession: 'session',
            resetWindowMessageState: 'session',
            isSessionCurrent: 'session',
            isCurrentTranslation: 'session',
            captureTextStateStart: 'session',
            collectWindowsForGameMessage: 'session',
            collectSceneMessageWindows: 'session',
            wrapMessageContents: 'session',
            installLifecycleHooks: 'session',
            wrapLifecycleMethod: 'session',
            wrapUpdateForVisibility: 'session',
            updateMessageVisibilityFromWindow: 'session',
            messageHasQueuedText: 'session',
            installStartMessageHook: 'session',
            observeStartedMessage: 'session',
            discoverAndHookMessageWindowCtors: 'session',
            installMessageWindowCtorHooks: 'session',
            installProcessCharacterFallback: 'session',
            prepareProcessCharacterPayload: 'session',
            completeProcessCharacterFallback: 'session',
            installProcessCompleteMessage: 'session',
            processCompleteMessage: 'detection',
            scheduleForesightTranslations: 'detection',
            collectUpcomingMessageBlocks: 'detection',
            createForesightScanner: 'foresightHooks',
            installGameInterpreterExecutionContextHook: 'foresightHooks',
            installGameInterpreterChildOriginHook: 'foresightHooks',
            installGameMessageAddOriginHook: 'foresightHooks',
            attachGameMessageAddOrigin: 'foresightContext',
            attachChildInterpreterOriginContext: 'foresightContext',
            peekInterpreterExecutionContext: 'foresightContext',
            createInterpreterExecutionContext: 'foresightContext',
            createForesightFrameFromContext: 'foresightContext',
            createChildInterpreterDescriptor: 'foresightContext',
            getEventCommandNextIndex: 'foresightContext',
            cloneForesightFrames: 'foresightContext',
            cloneForesightFrame: 'foresightContext',
            readCommonEventIdFromCommand: 'foresightContext',
            getCommonEventData: 'foresightContext',
            getInterpreterForesightId: 'foresightContext',
            getInterpreterForesightListId: 'foresightContext',
            getInterpreterCommonEventId: 'foresightContext',
            getInterpreterCommonEventName: 'foresightContext',
            installGameInterpreterMessageOriginHook: 'foresightHooks',
            installGamePlayerTransferForesightHook: 'foresightHooks',
            wrapGamePlayerTransferForesightMethod: 'foresightHooks',
            createPendingMessageOrigin: 'foresightHooks',
            attachCompletedMessageOrigin: 'foresightHooks',
            getVerifiedMessageOrigin: 'foresightHooks',
            isGameMessageAddOrigin: 'foresightHooks',
            parseMessageOriginBlock: 'foresightContext',
            clearMessageOrigin: 'foresightContext',
            readMessageOriginText: 'foresightContext',
            getInterpreterOriginId: 'foresightContext',
            getGlobalGameMessage: 'foresightRecords',
            integerIndex: 'foresightRecords',
            createForesightPayload: 'foresightRecords',
            convertMessageTextForForesight: 'foresightRecords',
            requestForesightTranslation: 'foresightRecords',
            cancelForesightTranslations: 'foresightRecords',
            consumeForesightRecord: 'foresightRecords',
            pruneForesightRecords: 'foresightRecords',
            getForesightSourceKey: 'foresightRecords',
            createForesightRecordId: 'foresightRecords',
            hashTextForId: 'foresightRecords',
            applyStreamDelta: 'foresightRecords',
            installGameMessageClearHook: 'clear',
            hasHookInChain: 'clear',
            clearForesightSnapshot: 'clear',
            showDiagnostics: 'clear',
            clearRecordFields: 'clear',
            detachCurrentMessageRecord: 'clear',
            updateRecordVisibility: 'clear',
            installOrchestratorSubscription: 'records',
            detectMessageRecord: 'records',
            detectSkippedMessageRecord: 'records',
            describeMessageEligibility: 'records',
            createObservation: 'records',
            createMessageRecord: 'records',
            syncMessageRecord: 'records',
            createRecordId: 'records',
            getWindowId: 'records',
            getWindowType: 'records',
            observeMessageRecord: 'records',
            updateItem: 'records',
            recordDecision: 'records',
            recordRenderAccepted: 'records',
            recordRenderDeferred: 'records',
            recordRenderRejected: 'records',
            backgroundItem: 'records',
            setRecordPriority: 'records',
            cancelRecordTranslation: 'records',
            setRecordVisibility: 'records',
            retireItem: 'records',
            resolveMessageRecord: 'records',
            rememberRenderTarget: 'records',
            forgetRenderTarget: 'records',
            rememberBitmapGlyphSource: 'records',
            rememberPendingBitmapGlyphSource: 'records',
            forgetPendingBitmapGlyphSource: 'records',
            forgetBitmapGlyphSource: 'records',
            getPendingBitmapGlyphSourceKey: 'records',
            claimMessageGlyphSource: 'records',
            releaseBitmapGlyphSource: 'records',
            buildBitmapGlyphSearchText: 'records',
            normalizeGlyphSearchText: 'records',
            applyRenderCommand: 'render',
            getLifecycleRecord: 'render',
            getRenderGeneration: 'render',
            isRenderTargetCurrent: 'render',
            handleRenderRejected: 'render',
            skipRender: 'render',
            stopStreamPreview: 'render',
            restoreOriginalAfterStreamPreview: 'render',
            clearCurrentRequestToken: 'render',
            markRenderSkipped: 'render',
            markRenderFailed: 'render',
            markMessageRendered: 'render',
            retireDetachedRecord: 'render',
            handleRequestFailed: 'render',
            handleRequestSkipped: 'render',
            resetStreamState: 'render',
            getMessageScreenState: 'render',
            warn: 'render',
            isAdapterContractFailure: 'render',
            errorLog: 'render',
        };
        const instances = {};
        function getController(key) {
            if (!instances[key]) instances[key] = controllers[key].create(scope);
            return instances[key];
        }
        function callController(methodName, ...args) {
            const key = methodControllers[methodName];
            const controller = key ? getController(key) : null;
            const method = controller && controller[methodName];
            if (typeof method !== 'function') throw new Error('[GameMessage] Missing controller method: ' + methodName);
            return method(...args);
        }
        Object.keys(methodControllers).forEach((methodName) => {
            scope[methodName] = (...args) => callController(methodName, ...args);
        });
        scope.textScalePercent = scope.resolveGameMessageTextScale(scope.settings);
        scope.originAwareLineBreaks = scope.resolveGameMessageOriginAwareLineBreaks(scope.settings);
        scope.foresightEnabled = scope.resolveEnableForesight(scope.settings);
        scope.fallbackMessageState = scope.createMessageState();
        scope.foresightScanner = scope.foresightEnabled ? scope.createForesightScanner() : null;
        return {
            install: scope.install,
            drawMessageFaceIfNeeded: scope.drawMessageFaceIfNeeded,
            redrawGameMessageText: scope.redrawGameMessageText,
            applyPendingMessageRedraw: scope.applyPendingMessageRedraw,
            resolveMessageStartCoordinates: scope.resolveMessageStartCoordinates,
        };
    }

    defineRuntimeModule('adapters.gameMessage', {
        install: installGameMessageAdapter,
        create: createGameMessageAdapter,
    });
})();
