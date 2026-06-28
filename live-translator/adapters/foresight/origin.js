// Current-message origin normalization.
(() => {
    'use strict';

    LiveTranslatorRun({
        name: 'adapters.foresight.origin',
        requires: {
            partsRegistry: 'adapters.foresight.partsRegistry',
        },
        loadAfter: ['adapters.foresight.partsRegistry'],
        scriptAfter: ['adapters/foresight/constants.js', 'adapters/foresight/part-facades.js', 'adapters/foresight/catalog.js'],
        loadBefore: ['adapters.foresight'],
        run({ partsRegistry }) {
            const parts = partsRegistry.getParts();
            const { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, MAX_BRANCH_DEPTH, DIAGNOSTIC_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET, BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES, commandCatalog } = parts;
            const { isEventScanBehavior } = parts.facades.catalog;
            const { createScanFrame } = parts.facades.nestedLists;
            const { integerIndex, nonEmptyString } = parts.facades.utils;

            function resolveMessageOrigin(origin) {
                    if (!origin || typeof origin !== 'object') return null;
                    const interpreter = origin.interpreter || null;
                    const list = Array.isArray(origin.list) ? origin.list : null;
                    if (!interpreter || !Array.isArray(list) || !list.length) return null;
                    if (interpreter._list !== list) return null;

                    const startIndex = integerIndex(origin.startIndex);
                    const nextIndex = integerIndex(origin.nextIndex);
                    if (startIndex === null || nextIndex === null) return null;
                    if (startIndex < 0 || startIndex >= list.length) return null;
                    if (nextIndex <= startIndex || nextIndex > list.length) return null;

                    const command = list[startIndex];
                    if (!command) return null;
                    const generatedByGameMessageAdd = isGeneratedMessageOrigin(origin);
                    if (!generatedByGameMessageAdd && !isEventScanBehavior(command, 'message')) return null;

                    const commandIndent = Number(command.indent) || 0;
                    const indent = Number.isFinite(Number(origin.indent)) ? Number(origin.indent) : commandIndent;
                    if (indent !== commandIndent) return null;
                    const interpreterId = nonEmptyString(origin.interpreterId) || 'attached';

                    return {
                        interpreter,
                        list,
                        startIndex,
                        nextIndex,
                        indent,
                        interpreterId,
                        frames: resolveOriginFrames(origin, {
                            list,
                            nextIndex,
                            indent,
                            interpreterId,
                            listId: nonEmptyString(origin.listId) || interpreterId,
                            commonEventId: origin.commonEventId,
                            commonEventName: origin.commonEventName,
                        }),
                    };
                }

            function isGeneratedMessageOrigin(origin) {
                    return !!(origin
                        && origin.originKind === 'game-message-add'
                        && origin.verified === true);
                }

            function resolveOriginFrames(origin, fallback = {}) {
                    const rawFrames = Array.isArray(origin && origin.frames) ? origin.frames : [];
                    const frames = rawFrames.map(resolveOriginFrame).filter(Boolean);
                    const last = frames[frames.length - 1] || null;
                    if (last
                        && last.list === fallback.list
                        && Number(last.index) === Number(fallback.nextIndex)) {
                        return frames;
                    }
                    return [createScanFrame({
                        list: fallback.list,
                        index: fallback.nextIndex,
                        expectedIndent: fallback.indent,
                        interpreterId: fallback.interpreterId,
                        listId: fallback.listId,
                        commonEventId: fallback.commonEventId,
                        commonEventName: fallback.commonEventName,
                    })];
                }

            function resolveOriginFrame(frame) {
                    if (!frame || typeof frame !== 'object' || !Array.isArray(frame.list)) return null;
                    const index = integerIndex(frame.index);
                    if (index === null || index < 0 || index > frame.list.length) return null;
                    return createScanFrame({
                        list: frame.list,
                        index,
                        endIndex: frame.endIndex,
                        expectedIndent: frame.expectedIndent,
                        interpreterId: frame.interpreterId,
                        listId: frame.listId,
                        commonEventId: frame.commonEventId,
                        commonEventName: frame.commonEventName,
                        parentInterpreterId: frame.parentInterpreterId,
                        parentListId: frame.parentListId,
                        parentCommandIndex: frame.parentCommandIndex,
                        parentCommandCode: frame.parentCommandCode,
                        nestedListType: frame.nestedListType,
                        nestedListName: frame.nestedListName,
                        nestedListPath: frame.nestedListPath,
                        nestedListIndex: frame.nestedListIndex,
                        branchLabel: frame.branchLabel,
                        branchIndex: frame.branchIndex,
                        branchCount: frame.branchCount,
                        pendingNestedFrames: frame.pendingNestedFrames,
                    });
                }

            Object.assign(parts, { resolveMessageOrigin, isGeneratedMessageOrigin, resolveOriginFrames, resolveOriginFrame });
        },
    });
})();
