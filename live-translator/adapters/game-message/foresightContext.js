// Game message adapter support: foresight context.
// Tracks interpreter-origin frames used by foresight scanning and prefetch reuse.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/game-message/foresightContext.js.');
    }

    function createController(scope = {}) {
        const { EVENT_COMMAND_CONTINUATION_CODES, globalScope, interpreterExecutionStack } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { integerIndex } = Object.fromEntries(['integerIndex'].map((name) => [name, callScope(name)]));

        function attachGameMessageAddOrigin(gameMessage) {
            if (!gameMessage) return false;
            const context = peekInterpreterExecutionContext();
            if (!context) return false;

            const rawText = readMessageOriginText(gameMessage);
            if (!rawText.trim()) return false;

            const currentFrame = createForesightFrameFromContext(context, context.nextIndex);
            if (!currentFrame) return false;
            const parentFrames = cloneForesightFrames(context.parentFrames);
            const origin = {
                gameMessage,
                interpreter: context.interpreter,
                interpreterId: context.interpreterId,
                listId: context.listId,
                commonEventId: context.commonEventId,
                commonEventName: context.commonEventName,
                list: context.list,
                startIndex: context.startIndex,
                nextIndex: context.nextIndex,
                indent: context.indent,
                rawText,
                commandCode: context.commandCode,
                originKind: 'game-message-add',
                verified: true,
                frames: parentFrames.concat(currentFrame),
                createdAt: Date.now(),
            };
            gameMessage._trMessageOrigin = origin;
            return true;
        }

        function attachChildInterpreterOriginContext(parentInterpreter, parentContext) {
            if (!parentInterpreter || !parentContext) return false;
            const childInterpreter = parentInterpreter._childInterpreter || null;
            if (!childInterpreter || childInterpreter === parentInterpreter) return false;

            const childDescriptor = createChildInterpreterDescriptor(parentContext);
            const parentFrame = createForesightFrameFromContext(parentContext, parentContext.nextIndex);
            if (!parentFrame) return false;
            const parentFrames = cloneForesightFrames(parentContext.parentFrames).concat(parentFrame);
            try {
                childInterpreter._trForesightParentFrames = parentFrames;
                childInterpreter._trForesightInterpreterId = childDescriptor.interpreterId;
                childInterpreter._trForesightListId = childDescriptor.listId;
                childInterpreter._trForesightCommonEventId = childDescriptor.commonEventId;
                childInterpreter._trForesightCommonEventName = childDescriptor.commonEventName;
            } catch (_) {}
            return true;
        }

        function peekInterpreterExecutionContext(interpreter = null) {
            for (let index = interpreterExecutionStack.length - 1; index >= 0; index -= 1) {
                const context = interpreterExecutionStack[index];
                if (!context) continue;
                if (!interpreter || context.interpreter === interpreter) return context;
            }
            return null;
        }

        function createInterpreterExecutionContext(interpreter) {
            if (!interpreter || !Array.isArray(interpreter._list)) return null;
            const startIndex = integerIndex(interpreter._index);
            if (startIndex === null || startIndex < 0 || startIndex >= interpreter._list.length) return null;
            const command = interpreter._list[startIndex];
            if (!command) return null;
            const indent = Number(command.indent) || 0;
            const nextIndex = getEventCommandNextIndex(interpreter._list, startIndex, indent);
            if (nextIndex <= startIndex || nextIndex > interpreter._list.length) return null;

            return {
                interpreter,
                list: interpreter._list,
                command,
                commandCode: Number(command.code),
                startIndex,
                nextIndex,
                indent,
                interpreterId: getInterpreterForesightId(interpreter),
                listId: getInterpreterForesightListId(interpreter),
                commonEventId: getInterpreterCommonEventId(interpreter),
                commonEventName: getInterpreterCommonEventName(interpreter),
                parentFrames: cloneForesightFrames(interpreter._trForesightParentFrames),
            };
        }

        function createForesightFrameFromContext(context, index) {
            if (!context || !Array.isArray(context.list)) return null;
            const frameIndex = integerIndex(index);
            if (frameIndex === null || frameIndex < 0 || frameIndex > context.list.length) return null;
            return {
                list: context.list,
                index: frameIndex,
                expectedIndent: context.indent,
                interpreterId: context.interpreterId,
                listId: context.listId,
                commonEventId: context.commonEventId,
                commonEventName: context.commonEventName,
            };
        }

        function createChildInterpreterDescriptor(parentContext) {
            const commonEventId = readCommonEventIdFromCommand(parentContext && parentContext.command);
            const parentId = parentContext && parentContext.interpreterId ? parentContext.interpreterId : 'attached';
            if (commonEventId) {
                const commonEvent = getCommonEventData(commonEventId);
                return {
                    interpreterId: `${parentId}:common:${commonEventId}`,
                    listId: `common:${commonEventId}`,
                    commonEventId,
                    commonEventName: commonEvent && commonEvent.name ? String(commonEvent.name) : '',
                };
            }
            const startIndex = Number(parentContext && parentContext.startIndex);
            const suffix = Number.isFinite(startIndex) ? startIndex : 'child';
            return {
                interpreterId: `${parentId}:child:${suffix}`,
                listId: `${parentContext && parentContext.listId ? parentContext.listId : parentId}:child:${suffix}`,
                commonEventId: null,
                commonEventName: '',
            };
        }

        function getEventCommandNextIndex(list, startIndex, indent) {
            const numericStart = integerIndex(startIndex);
            if (!Array.isArray(list) || numericStart === null || numericStart < 0 || numericStart >= list.length) return 0;
            const command = list[numericStart];
            if (!command) return numericStart + 1;
            const code = Number(command.code);
            if (code === 101) {
                const block = parseMessageOriginBlock(list, numericStart, indent);
                return block ? block.nextIndex : numericStart + 1;
            }

            const continuationCode = EVENT_COMMAND_CONTINUATION_CODES[String(code)];
            if (!continuationCode) return numericStart + 1;
            let nextIndex = numericStart + 1;
            while (nextIndex < list.length) {
                const next = list[nextIndex];
                if (!next
                    || Number(next.code) !== continuationCode
                    || (Number(next.indent) || 0) !== indent) {
                    break;
                }
                nextIndex += 1;
            }
            return nextIndex;
        }

        function cloneForesightFrame(frame) {
            if (!frame || !Array.isArray(frame.list)) return null;
            const clone = Object.assign({}, frame);
            clone.pendingNestedFrames = cloneForesightFrames(frame.pendingNestedFrames);
            return clone;
        }

        function cloneForesightFrames(frames) {
            return Array.isArray(frames)
                ? frames.map(cloneForesightFrame).filter(Boolean)
                : [];
        }

        function readCommonEventIdFromCommand(command) {
            if (!command || Number(command.code) !== 117) return null;
            const params = Array.isArray(command.parameters) ? command.parameters : [];
            const id = Number(params[0]);
            return Number.isInteger(id) && id > 0 ? id : null;
        }

        function getCommonEventData(commonEventId) {
            try {
                const commonEvents = globalScope.$dataCommonEvents;
                return commonEvents && commonEvents[commonEventId] && typeof commonEvents[commonEventId] === 'object'
                    ? commonEvents[commonEventId]
                    : null;
            } catch (_) {
                return null;
            }
        }

        function getInterpreterForesightId(interpreter) {
            return String((interpreter && interpreter._trForesightInterpreterId) || getInterpreterOriginId(interpreter));
        }

        function getInterpreterForesightListId(interpreter) {
            return String((interpreter && interpreter._trForesightListId) || getInterpreterForesightId(interpreter));
        }

        function getInterpreterCommonEventId(interpreter) {
            const value = Number(interpreter && interpreter._trForesightCommonEventId);
            return Number.isInteger(value) && value > 0 ? value : null;
        }

        function getInterpreterCommonEventName(interpreter) {
            return String((interpreter && interpreter._trForesightCommonEventName) || '');
        }

        function parseMessageOriginBlock(list, startIndex, indent) {
            if (!Array.isArray(list)) return null;
            const numericStart = integerIndex(startIndex);
            if (numericStart === null || numericStart < 0 || numericStart >= list.length) return null;
            const command = list[numericStart];
            if (!command || Number(command.code) !== 101 || (Number(command.indent) || 0) !== indent) return null;

            const lines = [];
            let nextIndex = numericStart + 1;
            while (nextIndex < list.length) {
                const next = list[nextIndex];
                if (!next || Number(next.code) !== 401 || (Number(next.indent) || 0) !== indent) break;
                const params = Array.isArray(next.parameters) ? next.parameters : [];
                lines.push(String(params[0] ?? ''));
                nextIndex += 1;
            }
            return {
                nextIndex,
                rawText: lines.join('\n'),
            };
        }

        function clearMessageOrigin(gameMessage) {
            if (gameMessage) gameMessage._trMessageOrigin = null;
        }

        function readMessageOriginText(gameMessage) {
            if (!gameMessage) return '';
            if (typeof gameMessage.allText === 'function') return String(gameMessage.allText() || '');
            if (Array.isArray(gameMessage._texts)) return gameMessage._texts.map((line) => String(line ?? '')).join('\n');
            return '';
        }

        function getInterpreterOriginId(interpreter) {
            if (globalScope.$gameMap && globalScope.$gameMap._interpreter === interpreter) return 'map';
            if (globalScope.$gameTroop && globalScope.$gameTroop._interpreter === interpreter) return 'troop';
            const commonEvents = globalScope.$gameMap && globalScope.$gameMap._commonEvents;
            if (Array.isArray(commonEvents)) {
                for (let index = 0; index < commonEvents.length; index += 1) {
                    if (commonEvents[index] && commonEvents[index]._interpreter === interpreter) return `common:${index}`;
                }
            }
            return 'attached';
        }

        return { attachGameMessageAddOrigin, attachChildInterpreterOriginContext, peekInterpreterExecutionContext, createInterpreterExecutionContext, createForesightFrameFromContext, createChildInterpreterDescriptor, getEventCommandNextIndex, cloneForesightFrames, cloneForesightFrame, readCommonEventIdFromCommand, getCommonEventData, getInterpreterForesightId, getInterpreterForesightListId, getInterpreterCommonEventId, getInterpreterCommonEventName, parseMessageOriginBlock, clearMessageOrigin, readMessageOriginText, getInterpreterOriginId };
    }

    defineRuntimeModule('adapters.gameMessage.foresightContext', { create: createController });
})();
