import { getGuiEffectivePolicy, getGuiPolicySnapshot } from '../policy.js';
import { serializeGuiValueOutcome } from '../../projection.js';
import { getVisibleHookResults, getVisibleHookSummary } from '../runtime/records.js';
import { createRuntimeFeedHealthRenderKey } from '../runtime/feed-health.js';
import { state } from '../state.js';
import { getTextRecordDetailDomKey } from '../text-records/identity.js';
import { createTextRecordDetailRenderKey, createTextRecordRenderContext, createTextRecordRowRenderKey, createTextRecordRows, findActiveTextRecordIndex, getPrioritizedTextRecords, } from '../text-records/lists.js';
import { createTextRecordStableRenderKey } from '../text-records/render-key.js';
import type { TextRecordRenderKey } from '../text-records/render-key.js';
import type { GuiDrawCaptureTrace, GuiForesightSnapshot, GuiTranslationDiagnosticsSnapshot, GuiTranslationStatusSnapshot, GuiPolicySnapshot, GuiTextRecord, UnknownRecord, } from '../types.js';
import { falsyFallback } from '../types.js';
export type RuntimePanelName = keyof typeof state.renderedPanelKeys;
type TextRecordRenderContext = ReturnType<typeof createTextRecordRenderContext>;
interface TextRecordPanelOptions {
    bodyId?: string;
    limit?: number;
    itemOptions?: UnknownRecord;
}
export interface RuntimePanelRenderKeys {
    readonly status: string;
    readonly hooks: string;
    readonly textRecords: TextRecordRenderKey;
}
export interface TextRecordPanelKeySource {
    readonly complete: boolean;
    readonly value: unknown[];
}
const MAX_RUNTIME_PANEL_RENDER_KEY_NONCE = Number.MAX_SAFE_INTEGER;
const stringifyRuntimePanelRenderKeyNonce = String;
let runtimePanelRenderKeyNonce = 0;
function createIncompleteRuntimePanelRenderKey(): string {
    const nonce = runtimePanelRenderKeyNonce;
    runtimePanelRenderKeyNonce = nonce === MAX_RUNTIME_PANEL_RENDER_KEY_NONCE ? 0 : nonce + 1;
    return `incomplete:${stringifyRuntimePanelRenderKeyNonce(nonce)}`;
}
export function hasRuntimePanelKeyChanged(name: RuntimePanelName, key: string): boolean {
    return state.renderedPanelKeys[name] !== key;
}
export function rememberRuntimePanelKey(name: RuntimePanelName, key: string): void {
    state.renderedPanelKeys[name] = key;
}
export function createRuntimePanelRenderKeys(policySnapshot: GuiPolicySnapshot = getGuiPolicySnapshot()): RuntimePanelRenderKeys {
    const effectivePolicy = getGuiEffectivePolicy(policySnapshot);
    const visibleHookResults = getVisibleHookResults(policySnapshot);
    const textRecordRenderContext = createTextRecordRenderContext(policySnapshot);
    const diagnosticRecords = createTextRecordPanelKeySource(state.diagnosticRecords, {
        bodyId: 'text-records',
    }, textRecordRenderContext);
    const textRecords = createTextRecordStableRenderKey({
        policy: {
            detailsEnabled: effectivePolicy.textRecords.detailsEnabled,
            inactiveDisplayLimit: effectivePolicy.textRecords.inactiveDisplayLimit,
            showForesightSpoilers: effectivePolicy.textRecords.showForesightSpoilers,
            selectedDetailKey: effectivePolicy.textRecords.selectedDetailKey,
        },
        records: diagnosticRecords.value,
    });
    const textRecordsComplete = textRecords.complete && diagnosticRecords.complete;
    return {
        status: createRuntimePanelRenderKey({
            translationDiagnostics: createTranslationDiagnosticsPanelKeySource(state.translationDiagnostics),
            drawCaptureTrace: createDrawCapturePanelKeySource(state.drawCaptureTrace),
            foresight: createForesightPanelKeySource(state.foresight),
            diagnosticsPolicy: effectivePolicy.diagnostics,
            drawCapturePolicy: effectivePolicy.drawCaptureTrace,
            foresightPolicy: effectivePolicy.foresight,
            runtimeFeedHealth: createRuntimeFeedHealthRenderKey(state.runtimeFeedHealth),
        }),
        hooks: createRuntimePanelRenderKey({
            summary: getVisibleHookSummary(policySnapshot),
            diagnosticsEnabled: effectivePolicy.diagnostics.enabled,
            results: visibleHookResults.map((item) => [item.name, item.displayName, item.category, item.status]),
            runtimeFeedHealth: createRuntimeFeedHealthRenderKey(state.runtimeFeedHealth, ['settings', 'hooks']),
        }),
        textRecords: {
            complete: textRecordsComplete,
            key: createRuntimePanelRenderKey({
                records: textRecords.key,
                runtimeFeedHealth: createRuntimeFeedHealthRenderKey(state.runtimeFeedHealth, [
                    'settings',
                    'textRecords',
                    'translation',
                ]),
            }),
        },
    };
}
export function createTranslationStatusPanelKeySource(status: GuiTranslationStatusSnapshot | null): UnknownRecord {
    const provider = status?.provider;
    const summary = status?.summary ?? {};
    const cache = status?.cache ?? {};
    return {
        updatedAt: falsyFallback(status?.updatedAt, ''),
        translatorProvider: falsyFallback(state.translatorProvider, falsyFallback(state.provider, '')),
        translatorConfigError: falsyFallback(state.translatorConfigError, ''),
        provider: {
            kind: falsyFallback(provider?.kind, ''),
            apiResponding: provider?.apiResponding === true,
            modelCatalogAt: falsyFallback(provider?.modelCatalogAt, ''),
            modelCatalogError: falsyFallback(provider?.modelCatalogError, ''),
            modelCount: falsyFallback(provider?.modelCount, 0),
            loadedLlmInstanceCount: falsyFallback(provider?.loadedLlmInstanceCount, 0),
            modelSelectionReady: provider?.modelSelectionReady === true,
            modelSelectionError: falsyFallback(provider?.modelSelectionError, ''),
            statusUpdatedAt: falsyFallback(provider?.statusUpdatedAt, ''),
            modelKey: falsyFallback(provider?.modelKey, ''),
            modelInstanceId: falsyFallback(provider?.modelInstanceId, ''),
            modelAuthor: falsyFallback(provider?.modelAuthor, ''),
            modelName: falsyFallback(provider?.modelName, ''),
            quantization: falsyFallback(provider?.quantization, ''),
            selectedVariant: falsyFallback(provider?.selectedVariant, ''),
            propsAt: falsyFallback(provider?.propsAt, ''),
            capacityError: falsyFallback(provider?.capacityError, ''),
            capacity: falsyFallback(provider?.capacity, 0),
            capacityVerified: provider?.capacityVerified === true,
            capacitySource: falsyFallback(provider?.capacitySource, ''),
            running: falsyFallback(provider?.running, 0),
            refreshingCapacity: provider?.refreshingCapacity === true,
            lastCapacityRefreshAt: falsyFallback(provider?.lastCapacityRefreshAt, ''),
            lastCapacityRefreshError: falsyFallback(provider?.lastCapacityRefreshError, ''),
        },
        summary: {
            queued: falsyFallback(summary['queued'], 0),
            running: falsyFallback(summary['running'], 0),
            activeSubscribers: falsyFallback(summary['activeSubscribers'], 0),
        },
        cache: {
            completed: falsyFallback(cache['completed'], 0),
            diskEnabled: cache['diskEnabled'] === true,
        },
    };
}
export function createTranslationDiagnosticsPanelKeySource(diagnostics: GuiTranslationDiagnosticsSnapshot | null): UnknownRecord {
    return Object.assign(createTranslationStatusPanelKeySource(diagnostics), {
        providerErrors: createLocalLlmDiagnosticsErrorKeySource(diagnostics?.jobs),
    });
}
export function createLocalLlmDiagnosticsErrorKeySource(jobs: GuiTranslationDiagnosticsSnapshot['jobs'] | undefined): unknown[] {
    return (['running', 'queued', 'past'] as const).map((name) => {
        const list = jobs?.[name] ?? [];
        return list.map((job) => [
            job.id,
            job.status,
            job.lastError,
            job.terminalAt,
            job.startedAt,
            job.queuedAt,
            job.createdAt,
        ]);
    });
}
export function createDrawCapturePanelKeySource(trace: GuiDrawCaptureTrace | null): UnknownRecord {
    return {
        updatedAt: falsyFallback(trace?.updatedAt, ''),
        enabled: trace?.enabled !== false,
        size: falsyFallback(trace?.size, 0),
        sequence: falsyFallback(trace?.sequence, 0),
        events: (trace?.events ?? []).map((event) => [
            event.seq,
            event.at,
            event.stage,
            event.normalizedText,
            event.reason,
            event.status,
        ]),
    };
}
export function createForesightPanelKeySource(snapshot: GuiForesightSnapshot | null): UnknownRecord {
    const recent = snapshot?.recent ?? [];
    const scan = recent.at(-1) ?? null;
    return {
        updatedAt: falsyFallback(snapshot?.updatedAt, ''),
        recent: recent.length,
        latestScan: scan
            ? [
                scan.at,
                scan.status,
                scan.blocks,
                scan.stopReason,
                scan.commandActionsTruncated,
                scan.commandActions.length,
            ]
            : null,
    };
}
export function createTextRecordPanelKeySource(records: GuiTextRecord[], options: TextRecordPanelOptions = {}, renderContext: TextRecordRenderContext = createTextRecordRenderContext()): TextRecordPanelKeySource {
    const rows = createTextRecordRows(getPrioritizedTextRecords(records, options.limit), options);
    const activeIndex = findActiveTextRecordIndex(rows, renderContext);
    let complete = true;
    const value = rows.map((row, index) => {
        const itemOptions = Object.assign({
            active: index === activeIndex,
            detailKey: row.detailKey,
            recordKey: row.recordKey,
            domKey: row.domKey,
        }, row.itemOptions);
        const rowKey = createTextRecordRowRenderKey(row.item, itemOptions, renderContext);
        const detailKey = index === activeIndex
            ? createTextRecordDetailRenderKey(row.item, Object.assign({}, row.itemOptions, {
                detailKey: row.detailKey,
                recordKey: row.recordKey,
                domKey: getTextRecordDetailDomKey(row.recordKey),
            }), renderContext)
            : null;
        if (!rowKey.complete || detailKey?.complete === false)
            complete = false;
        return {
            domKey: row.domKey,
            recordKey: row.recordKey,
            row: rowKey.key,
            detail: detailKey?.key ?? '',
        };
    });
    return { complete, value };
}
export function createRuntimePanelRenderKey(value: unknown): string {
    try {
        const serialized = serializeGuiValueOutcome(value);
        return serialized.complete ? `complete:${serialized.text}` : createIncompleteRuntimePanelRenderKey();
    }
    catch {
        return createIncompleteRuntimePanelRenderKey();
    }
}
