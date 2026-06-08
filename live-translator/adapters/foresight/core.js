// Public foresight scanner factory.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before Foresight parts.');
    }
    const parts = requireRuntimeModule('adapters.foresight.partsRegistry').getParts();

    const { DEFAULT_BUDGET, DEFAULT_MAX_SCAN_COMMANDS, MESSAGE_BUDGET_COST, BRANCH_BUDGET_STRATEGY, MAX_NESTED_LIST_DEPTH, MAX_NESTED_LISTS_PER_COMMAND, MAX_BRANCH_DEPTH, DIAGNOSTIC_ACTION_LIMIT, RECENT_SCAN_LIMIT, COMMAND_CATALOG_ASSET, BRANCH_MARKER_CODES, RESOLVABLE_CONTROL_FLOW_CODES, commandCatalog } = parts;
    const { resolveMessageOrigin } = parts.facades.origin;
    const { collectLinearMessageBlocks } = parts.facades.scanner;
    const { createInitialBudgetSnapshot } = parts.facades.budget;
    const { createDiagnostics, recordScan, diagnosticsSnapshot, publishDiagnosticsSnapshot, clearDiagnostics } = parts.facades.diagnostics;
    const { positiveInteger } = parts.facades.utils;
    
    function getPerformanceForesightMessageLimit(policy) {
            if (!policy || policy.performanceMode !== true) return 0;
            return positiveInteger(policy.limits && policy.limits.foresightMessages, 0);
        }

    function createGameMessageForesight(options = {}) {
            const budgetLimit = positiveInteger(options.budget, DEFAULT_BUDGET);
            const maxMessages = positiveInteger(options.maxMessages, budgetLimit);
            const maxScanCommands = positiveInteger(options.maxScanCommands, DEFAULT_MAX_SCAN_COMMANDS);
            const diagnostics = createDiagnostics({
                settings: options.settings,
            });
    
            function collectUpcomingMessageBlocks(input = {}) {
                const origin = resolveMessageOrigin(input.currentMessageOrigin);
                if (!origin) {
                    recordScan(diagnostics, {
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
                const policy = parts.getDiagnosticsPolicy(diagnostics);
                const previewMessageLimit = getPerformanceForesightMessageLimit(policy);
    
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
                        captureCommandActions: policy.captureForesightActions === true || previewMessageLimit > 0,
                        commandActionMessageLimit: policy.captureForesightActions === true ? 0 : previewMessageLimit,
                        captureBlockDiagnostics: policy.captureForesightMetadata === true,
                    }
                );
                recordScan(diagnostics, Object.assign({}, result.diagnostics, {
                    interpreterId: origin.interpreterId,
                    matchedCurrentMessage: true,
                }));
                return result.blocks;
            }
    
            function getSnapshot(optionsArg = {}) {
                return diagnosticsSnapshot(diagnostics, optionsArg);
            }
    
            function publishSnapshot() {
                return publishDiagnosticsSnapshot(diagnostics);
            }
    
            function clearSnapshot() {
                clearDiagnostics(diagnostics);
                return publishDiagnosticsSnapshot(diagnostics);
            }
    
            const api = {
                collectUpcomingMessageBlocks,
                getSnapshot,
                snapshot: getSnapshot,
                publishSnapshot,
                publish: publishSnapshot,
                clearSnapshot,
                clearDiagnostics: clearSnapshot,
            };
            try { globalScope.LiveTranslatorForesightDiagnostics = api; } catch (_) {}
            publishSnapshot();
            return api;
        }
    
    Object.assign(parts, { createGameMessageForesight });

})();
