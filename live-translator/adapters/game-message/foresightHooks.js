// Game message adapter support: foresightHooks.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/game-message/foresightHooks.js.');
    }

    function createController(scope = {}) {
        const {
            FORESIGHT_BUDGET,
            FORESIGHT_SURFACE_BUDGET,
            FORESIGHT_MAX_SCAN_COMMANDS,
            FORESIGHT_SURFACE_MAX_SCAN_COMMANDS,
            EVENT_COMMAND_CONTINUATION_CODES,
            globalScope,
            interpreterExecutionStack,
        } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { getGameMessageForWindow, getGlobalGameMessage, integerIndex, cancelForesightTranslations, hasHookInChain, warn, attachGameMessageAddOrigin, attachChildInterpreterOriginContext, peekInterpreterExecutionContext, createInterpreterExecutionContext, createForesightFrameFromContext, createChildInterpreterDescriptor, getEventCommandNextIndex, cloneForesightFrames, cloneForesightFrame, readCommonEventIdFromCommand, getCommonEventData, getInterpreterForesightId, getInterpreterForesightListId, getInterpreterCommonEventId, getInterpreterCommonEventName, parseMessageOriginBlock, clearMessageOrigin, readMessageOriginText, getInterpreterOriginId } = Object.fromEntries(['getGameMessageForWindow', 'getGlobalGameMessage', 'integerIndex', 'cancelForesightTranslations', 'hasHookInChain', 'warn', 'attachGameMessageAddOrigin', 'attachChildInterpreterOriginContext', 'peekInterpreterExecutionContext', 'createInterpreterExecutionContext', 'createForesightFrameFromContext', 'createChildInterpreterDescriptor', 'getEventCommandNextIndex', 'cloneForesightFrames', 'cloneForesightFrame', 'readCommonEventIdFromCommand', 'getCommonEventData', 'getInterpreterForesightId', 'getInterpreterForesightListId', 'getInterpreterCommonEventId', 'getInterpreterCommonEventName', 'parseMessageOriginBlock', 'clearMessageOrigin', 'readMessageOriginText', 'getInterpreterOriginId'].map((name) => [name, callScope(name)]));

        function createForesightScanner() {
            try {
                const modules = globalScope.LiveTranslatorModules || null;
                const module = (modules && modules.adapters && modules.adapters.foresight)
                    || (modules && modules['adapters.foresight']);
                if (module && typeof module.createGameMessageForesight === 'function') {
                    const budget = getForesightLookaheadBudget();
                    return module.createGameMessageForesight({
                        budget,
                        maxMessages: budget,
                        maxScanCommands: getForesightMaxScanCommands(),
                        settings: scope.settings,
                    });
                }
            } catch (error) {
                warn('[GameMessage] Foresight scanner unavailable; lookahead disabled.', error);
            }
            return null;
        }

        function getForesightLookaheadBudget() {
            return isDiagnosticsPerformanceModeEnabled()
                ? positiveInteger(FORESIGHT_SURFACE_BUDGET, 10)
                : positiveInteger(FORESIGHT_BUDGET, 30);
        }

        function getForesightMaxScanCommands() {
            return isDiagnosticsPerformanceModeEnabled()
                ? positiveInteger(FORESIGHT_SURFACE_MAX_SCAN_COMMANDS, 50)
                : positiveInteger(FORESIGHT_MAX_SCAN_COMMANDS, 150);
        }

        function isDiagnosticsPerformanceModeEnabled() {
            const settings = scope.settings && typeof scope.settings === 'object' ? scope.settings : {};
            const diagnostics = settings.diagnostics && typeof settings.diagnostics === 'object'
                ? settings.diagnostics
                : null;
            return !!(diagnostics
                && Object.prototype.hasOwnProperty.call(diagnostics, 'performanceMode')
                && diagnostics.performanceMode === true);
        }

        function positiveInteger(value, fallback) {
            const numeric = Math.floor(Number(value));
            return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
        }

        function installGameInterpreterExecutionContextHook() {
            if (typeof Game_Interpreter === 'undefined'
                || !Game_Interpreter
                || !Game_Interpreter.prototype
                || typeof Game_Interpreter.prototype.executeCommand !== 'function'
                || hasHookInChain(Game_Interpreter.prototype.executeCommand, '__trInterpreterContextWrapped', true)) {
                return false;
            }

            const original = Game_Interpreter.prototype.executeCommand;
            Game_Interpreter.prototype.executeCommand = function(...args) {
                const context = createInterpreterExecutionContext(this);
                if (context) interpreterExecutionStack.push(context);
                try {
                    return original.apply(this, args);
                } finally {
                    if (context) interpreterExecutionStack.pop();
                }
            };
            Game_Interpreter.prototype.executeCommand.__trOriginal = original;
            Game_Interpreter.prototype.executeCommand.__trInterpreterContextWrapped = true;
            return true;
        }

        function installGameInterpreterChildOriginHook() {
            if (typeof Game_Interpreter === 'undefined'
                || !Game_Interpreter
                || !Game_Interpreter.prototype
                || typeof Game_Interpreter.prototype.setupChild !== 'function'
                || hasHookInChain(Game_Interpreter.prototype.setupChild, '__trChildOriginWrapped', true)) {
                return false;
            }

            const original = Game_Interpreter.prototype.setupChild;
            Game_Interpreter.prototype.setupChild = function(...args) {
                const parentContext = peekInterpreterExecutionContext(this) || createInterpreterExecutionContext(this);
                const result = original.apply(this, args);
                attachChildInterpreterOriginContext(this, parentContext);
                return result;
            };
            Game_Interpreter.prototype.setupChild.__trOriginal = original;
            Game_Interpreter.prototype.setupChild.__trChildOriginWrapped = true;
            return true;
        }

        function installGameMessageAddOriginHook() {
            if (typeof Game_Message === 'undefined'
                || !Game_Message
                || !Game_Message.prototype
                || typeof Game_Message.prototype.add !== 'function'
                || hasHookInChain(Game_Message.prototype.add, '__trMessageAddOriginWrapped', true)) {
                return false;
            }

            const original = Game_Message.prototype.add;
            Game_Message.prototype.add = function(...args) {
                const result = original.apply(this, args);
                try { attachGameMessageAddOrigin(this); } catch (error) {
                    warn('[GameMessage] Game_Message.add origin hook error', error);
                }
                return result;
            };
            Game_Message.prototype.add.__trOriginal = original;
            Game_Message.prototype.add.__trMessageAddOriginWrapped = true;
            return true;
        }

        function installGameInterpreterMessageOriginHook() {
            if (typeof Game_Interpreter === 'undefined'
                || !Game_Interpreter
                || !Game_Interpreter.prototype
                || typeof Game_Interpreter.prototype.command101 !== 'function'
                || hasHookInChain(Game_Interpreter.prototype.command101, '__trGameMessageOriginWrapped', true)) {
                return false;
            }

            const original = Game_Interpreter.prototype.command101;
            Game_Interpreter.prototype.command101 = function(...args) {
                const pendingOrigin = createPendingMessageOrigin(this);
                if (pendingOrigin) clearMessageOrigin(pendingOrigin.gameMessage);
                const result = original.apply(this, args);
                if (pendingOrigin) attachCompletedMessageOrigin(pendingOrigin);
                return result;
            };
            Game_Interpreter.prototype.command101.__trOriginal = original;
            Game_Interpreter.prototype.command101.__trGameMessageOriginWrapped = true;
            return true;
        }

        function installGamePlayerTransferForesightHook() {
            if (typeof Game_Player === 'undefined' || !Game_Player || !Game_Player.prototype) return false;
            const prototype = Game_Player.prototype;
            const reserveHooked = wrapGamePlayerTransferForesightMethod(prototype, 'reserveTransfer', 'map-transfer-reserved');
            const performHooked = wrapGamePlayerTransferForesightMethod(prototype, 'performTransfer', 'map-transfer-started');
            return reserveHooked || performHooked;
        }

        function wrapGamePlayerTransferForesightMethod(prototype, methodName, reason) {
            if (!prototype || typeof prototype[methodName] !== 'function') return false;
            const current = prototype[methodName];
            if (hasHookInChain(current, '__trForesightTransferWrapped', true)) return false;
            const original = current;
            const wrapped = function(...args) {
                cancelForesightTranslations(reason);
                return original.apply(this, args);
            };
            wrapped.__trOriginal = original;
            wrapped.__trForesightTransferWrapped = true;
            prototype[methodName] = wrapped;
            return true;
        }

        function createPendingMessageOrigin(interpreter) {
            const gameMessage = getGlobalGameMessage();
            if (!gameMessage || !interpreter || !Array.isArray(interpreter._list)) return null;
            if (typeof gameMessage.isBusy === 'function' && gameMessage.isBusy()) return null;

            const startIndex = integerIndex(interpreter._index);
            if (startIndex === null || startIndex < 0 || startIndex >= interpreter._list.length) return null;
            const command = interpreter._list[startIndex];
            if (!command || Number(command.code) !== 101) return null;

            return {
                gameMessage,
                interpreter,
                list: interpreter._list,
                startIndex,
                indent: Number(command.indent) || 0,
                context: createInterpreterExecutionContext(interpreter),
            };
        }

        function attachCompletedMessageOrigin(pendingOrigin) {
            if (!pendingOrigin) return false;
            if (pendingOrigin.interpreter._list !== pendingOrigin.list) return false;

            const command = pendingOrigin.list[pendingOrigin.startIndex];
            if (!command || Number(command.code) !== 101 || (Number(command.indent) || 0) !== pendingOrigin.indent) {
                return false;
            }
            const block = parseMessageOriginBlock(pendingOrigin.list, pendingOrigin.startIndex, pendingOrigin.indent);
            if (!block || !block.rawText.trim()) return false;

            const context = pendingOrigin.context || null;
            const currentFrame = context ? createForesightFrameFromContext(context, block.nextIndex) : null;
            const origin = {
                gameMessage: pendingOrigin.gameMessage,
                interpreter: pendingOrigin.interpreter,
                interpreterId: context ? context.interpreterId : getInterpreterOriginId(pendingOrigin.interpreter),
                listId: context ? context.listId : getInterpreterOriginId(pendingOrigin.interpreter),
                commonEventId: context ? context.commonEventId : null,
                commonEventName: context ? context.commonEventName : '',
                list: pendingOrigin.list,
                startIndex: pendingOrigin.startIndex,
                nextIndex: block.nextIndex,
                indent: pendingOrigin.indent,
                rawText: block.rawText,
                frames: currentFrame ? cloneForesightFrames(context.parentFrames).concat(currentFrame) : [],
                createdAt: Date.now(),
            };
            pendingOrigin.gameMessage._trMessageOrigin = origin;
            return true;
        }

        function getVerifiedMessageOrigin(windowInstance) {
            const gameMessage = getGameMessageForWindow(windowInstance);
            const origin = gameMessage && gameMessage._trMessageOrigin;
            if (!origin || origin.gameMessage !== gameMessage) return null;
            if (!origin.interpreter || origin.interpreter._list !== origin.list) return null;
            if (!Array.isArray(origin.list) || !origin.list.length) return null;

            const startIndex = integerIndex(origin.startIndex);
            const nextIndex = integerIndex(origin.nextIndex);
            if (startIndex === null || nextIndex === null) return null;
            if (startIndex < 0 || startIndex >= origin.list.length) return null;
            if (nextIndex <= startIndex || nextIndex > origin.list.length) return null;

            const command = origin.list[startIndex];
            if (!command) return null;
            const indent = Number(command.indent) || 0;
            if (Number(origin.indent) !== indent) return null;

            if (isGameMessageAddOrigin(origin)) {
                if (nextIndex !== getEventCommandNextIndex(origin.list, startIndex, indent)) return null;
                return origin;
            }

            if (Number(command.code) !== 101) return null;
            const block = parseMessageOriginBlock(origin.list, startIndex, indent);
            if (!block || block.nextIndex !== nextIndex) return null;
            return origin;
        }

        function isGameMessageAddOrigin(origin) {
            return !!(origin
                && origin.originKind === 'game-message-add'
                && origin.verified === true);
        }

        return {
            createForesightScanner,
            installGameInterpreterExecutionContextHook,
            installGameInterpreterChildOriginHook,
            installGameMessageAddOriginHook,
            attachGameMessageAddOrigin,
            attachChildInterpreterOriginContext,
            peekInterpreterExecutionContext,
            createInterpreterExecutionContext,
            createForesightFrameFromContext,
            createChildInterpreterDescriptor,
            getEventCommandNextIndex,
            cloneForesightFrames,
            cloneForesightFrame,
            readCommonEventIdFromCommand,
            getCommonEventData,
            getInterpreterForesightId,
            getInterpreterForesightListId,
            getInterpreterCommonEventId,
            getInterpreterCommonEventName,
            installGameInterpreterMessageOriginHook,
            installGamePlayerTransferForesightHook,
            wrapGamePlayerTransferForesightMethod,
            createPendingMessageOrigin,
            attachCompletedMessageOrigin,
            getVerifiedMessageOrigin,
            isGameMessageAddOrigin,
            parseMessageOriginBlock,
            clearMessageOrigin,
            readMessageOriginText,
            getInterpreterOriginId,
        };
    }

    defineRuntimeModule('adapters.gameMessage.foresightHooks', { create: createController });
})();
