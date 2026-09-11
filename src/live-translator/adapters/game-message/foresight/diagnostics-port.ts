import type { BoundedValueCloneLimits } from '../../../runtime/bounded-value-clone.js';
import { captureLogRedactor } from '../../../runtime/log-redaction-port.js';
import { captureOptionalDiagnosticsHooks, cloneDiagnosticValue, createOptionalDiagnosticsBindingFromHooks, isDiagnosticsPropertyBag, readDiagnosticsCallback, readDiagnosticsProperty, type DiagnosticsCallback, } from '../../../runtime/diagnostics-interop.js';
type RuntimeCallback = DiagnosticsCallback;
export interface ForesightDiagnosticsPortParts {
    createDiagnosticsSession(options?: unknown): unknown;
    captureDiagnosticsPolicy(session?: unknown, options?: unknown): unknown;
    beginDiagnosticsScan(scan: unknown, policy?: unknown): void;
    filterDiagnosticActionsForBlockedReturns(scan: unknown, blocked: unknown): void;
    captureDiagnosticActionBudget(scan: unknown, budget: unknown, options?: unknown): unknown;
    captureDiagnosticBlock(scan: unknown, block: unknown): void;
    recordDiagnosticAction(scan: unknown, path: unknown, action?: unknown, options?: unknown): void;
    captureDiagnosticConsumedCommands(scan: unknown, previews: unknown, options?: unknown): unknown;
    recordDiagnosticCode(scan: unknown, category: unknown, code: unknown, label?: unknown): void;
    recordDiagnosticScan(session: unknown, scan: unknown, policy?: unknown, overrides?: unknown): void;
}
const CLOSED_POLICY = Object.freeze({
    enabled: false,
    captureActions: false,
    captureBlocks: false,
});
const DIAGNOSTIC_PROJECTION_LIMITS: BoundedValueCloneLimits = Object.freeze({
    arrayEntries: 96,
    depth: 5,
    nestedObjectKeys: 48,
    rootObjectKeys: 64,
    totalEntries: 1024,
});
function projectDiagnosticValue(value: unknown, defaultValue: unknown): unknown {
    return cloneDiagnosticValue(value, DIAGNOSTIC_PROJECTION_LIMITS, defaultValue);
}
export function createForesightDiagnosticsPort(globalScope: unknown): ForesightDiagnosticsPortParts {
    const hooks = captureOptionalDiagnosticsHooks(globalScope);
    const redactor = captureLogRedactor(globalScope);
    const project = redactor === undefined
        ? projectDiagnosticValue
        : (value: unknown, fallback: unknown): unknown => redactor.record(projectDiagnosticValue(value, fallback), ['diagnosticsTokenKind']);
    const binding = createOptionalDiagnosticsBindingFromHooks(hooks, 'createForesightDiagnostics');
    const scanTokens = new WeakMap<object, Readonly<Record<string, unknown>>>();
    let nextTokenId = 1;
    function createPortToken(kind: string): Readonly<Record<string, unknown>> {
        const token = Object.freeze({
            diagnosticsTokenId: nextTokenId,
            diagnosticsTokenKind: kind,
        });
        nextTokenId += 1;
        return token;
    }
    function scanToken(scan: unknown): unknown {
        return isDiagnosticsPropertyBag(scan) ? scanTokens.get(scan) : undefined;
    }
    function createDiagnosticsSession(options: unknown = {}): unknown {
        const token = createPortToken('session');
        binding.invokeLazy('createSession', () => [token, project(options, {})]);
        return token;
    }
    function captureDiagnosticsPolicy(session: unknown = null, options: unknown = {}): unknown {
        const token = createPortToken('policy');
        binding.invokeLazy('capturePolicy', () => [token, project(session, null), project(options, {})]);
        return token;
    }
    function beginDiagnosticsScan(scan: unknown, policy: unknown = CLOSED_POLICY): void {
        if (!isDiagnosticsPropertyBag(scan))
            return;
        const token = createPortToken('scan');
        scanTokens.set(scan, token);
        binding.invokeLazy('beginScan', () => [token, project(scan, {}), project(policy, CLOSED_POLICY)]);
    }
    function filterDiagnosticActionsForBlockedReturns(scan: unknown, blocked: unknown): void {
        const token = scanToken(scan);
        if (token === undefined)
            return;
        binding.invokeLazy('filterActionsForBlockedReturns', () => [token, project(blocked, {})]);
    }
    function captureDiagnosticActionBudget(scan: unknown, budget: unknown, options: unknown = {}): unknown {
        const token = createPortToken('budget');
        const correlatedScan = scanToken(scan);
        binding.invokeLazy('captureActionBudget', () => [
            token,
            correlatedScan,
            project(budget, null),
            project(options, {}),
        ]);
        return token;
    }
    function captureDiagnosticBlock(scan: unknown, block: unknown): void {
        const token = scanToken(scan);
        if (token === undefined)
            return;
        binding.invokeLazy('captureBlock', () => [token, project(block, {})]);
    }
    function recordDiagnosticAction(scan: unknown, path: unknown, action: unknown = {}, options: unknown = {}): void {
        const token = scanToken(scan);
        if (token === undefined)
            return;
        binding.invokeLazy('recordAction', () => {
            let payload: unknown = action;
            if (typeof action === 'function') {
                try {
                    payload = Reflect.apply(action as RuntimeCallback, undefined, []);
                }
                catch {
                    return null;
                }
            }
            const optionSource = isDiagnosticsPropertyBag(options) ? options : null;
            const fullListContextFactory = readDiagnosticsCallback(optionSource, 'createFullListContext');
            let fullListContext: unknown;
            if (fullListContextFactory) {
                try {
                    fullListContext = Reflect.apply(fullListContextFactory, optionSource, []);
                }
                catch {
                    fullListContext = undefined;
                }
            }
            const diagnosticOptions = {
                previewKind: project(readDiagnosticsProperty(optionSource, 'previewKind'), undefined),
                fullListContext: project(fullListContext, undefined),
            };
            return [token, project(path, {}), project(payload, {}), diagnosticOptions];
        });
    }
    function captureDiagnosticConsumedCommands(scan: unknown, previews: unknown, options: unknown = {}): unknown {
        const token = createPortToken('commands');
        binding.invokeLazy('captureConsumedCommands', () => [
            token,
            scanToken(scan),
            project(previews, []),
            project(options, {}),
        ]);
        return token;
    }
    function recordDiagnosticCode(scan: unknown, category: unknown, code: unknown, label: unknown = ''): void {
        const token = scanToken(scan);
        if (token === undefined)
            return;
        binding.invokeLazy('recordCode', () => [token, project(category, ''), project(code, null), project(label, '')]);
    }
    function recordDiagnosticScan(session: unknown, scan: unknown, policy: unknown = CLOSED_POLICY, overrides: unknown = null): void {
        binding.invokeLazy('recordScan', () => [
            project(session, null),
            scanToken(scan),
            project(policy, CLOSED_POLICY),
            project(overrides, null),
            project(scan, {}),
        ]);
    }
    return Object.freeze({
        createDiagnosticsSession,
        captureDiagnosticsPolicy,
        beginDiagnosticsScan,
        filterDiagnosticActionsForBlockedReturns,
        captureDiagnosticActionBudget,
        captureDiagnosticBlock,
        recordDiagnosticAction,
        captureDiagnosticConsumedCommands,
        recordDiagnosticCode,
        recordDiagnosticScan,
    });
}
