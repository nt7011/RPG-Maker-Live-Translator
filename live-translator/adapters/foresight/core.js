// Public foresight scanner factory.
(() => {
    'use strict';

    LiveTranslatorRun({
        name: 'adapters.foresight.core',
        requires: {
            partsRegistry: 'adapters.foresight.partsRegistry',
        },
        loadAfter: ['adapters.foresight.partsRegistry'],
        scriptAfter: ['adapters/foresight/constants.js', 'adapters/foresight/part-facades.js', 'adapters/foresight/catalog.js'],
        loadBefore: ['adapters.foresight'],
        run({ partsRegistry }, { scope: globalScope }) {
            const parts = partsRegistry.getParts();
            const { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, MAX_BRANCH_DEPTH, INTEL_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET, BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES, commandCatalog } = parts;
            const { resolveMessageOrigin } = parts.facades.origin;
            const { collectLinearMessageBlocks } = parts.facades.scanner;
            const { createInitialBudgetSnapshot } = parts.facades.budget;
            const { createIntel, recordScan, intelSnapshot, publishIntelSnapshot, clearIntel } = parts.facades.intel;
            const { positiveInteger } = parts.facades.utils;

            function getIntelForesightMessageLimit(policy) {
                    if (!policy || policy.surface !== true || policy.captureForesightMessages === false) return 0;
                    return positiveInteger(policy.limits && policy.limits.foresightMessages, 0);
                }

            function createGameMessageForesight(options = {}) {
                    const budgetLimit = positiveInteger(options.budget, DEFAULT_BUDGET);
                    const maxMessages = positiveInteger(options.maxMessages, budgetLimit);
                    const maxScanCommands = positiveInteger(options.maxScanCommands, DEFAULT_MAX_SCAN_COMMANDS);
                    const intel = createIntel({
                        settings: options.settings,
                    });

                    function collectUpcomingMessageBlocks(input = {}) {
                        const origin = resolveMessageOrigin(input.currentMessageOrigin);
                        if (!origin) {
                            recordScan(intel, {
                                interpreterId: '',
                                matchedCurrentMessage: false,
                                status: 'miss',
                                stopReason: 'current-message-unattached',
                                blocks: 0,
                                scannedCommands: 0,
                                advancedCommands: 0,
                                budget: createInitialBudgetSnapshot(budgetLimit, maxMessages),
                            });
                            return [];
                        }
                        const policy = parts.getIntelPolicy(intel);
                        const previewMessageLimit = getIntelForesightMessageLimit(policy);
                        const captureForesightActions = policy
                            && policy.surface === true
                            && policy.captureForesightActions === true;

                        const result = collectLinearMessageBlocks(
                            origin.list,
                            origin.nextIndex,
                            origin.interpreterId,
                            origin.indent,
                            maxMessages,
                            maxScanCommands,
                            budgetLimit,
                            origin.frames,
                            {
                                captureCommandActions: captureForesightActions || previewMessageLimit > 0,
                                commandActionMessageLimit: captureForesightActions ? 0 : previewMessageLimit,
                                captureBlockIntel: policy
                                    && policy.surface === true
                                    && policy.captureForesightMetadata === true,
                            }
                        );
                        recordScan(intel, Object.assign({}, result.intel, {
                            interpreterId: origin.interpreterId,
                            matchedCurrentMessage: true,
                        }));
                        return result.blocks;
                    }

                    function getSnapshot(optionsArg = {}) {
                        return intelSnapshot(intel, optionsArg);
                    }

                    function publishSnapshot() {
                        return publishIntelSnapshot(intel);
                    }

                    function clearSnapshot() {
                        clearIntel(intel);
                        return publishIntelSnapshot(intel);
                    }

                    const api = {
                        collectUpcomingMessageBlocks,
                        getSnapshot,
                        snapshot: getSnapshot,
                        publishSnapshot,
                        publish: publishSnapshot,
                        clearSnapshot,
                        clearIntel: clearSnapshot,
                    };
                    try { globalScope.LiveTranslatorForesightIntel = api; } catch (_) {}
                    publishSnapshot();
                    return api;
                }

            Object.assign(parts, { createGameMessageForesight });
        },
    });
})();
