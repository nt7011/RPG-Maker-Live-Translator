import { syncFoldedPanelDefaults } from '../dom/details.js';
import { renderProviderHeader } from './provider-header.js';
import { createRuntimePanelRenderKeys, hasRuntimePanelKeyChanged, rememberRuntimePanelKey } from './render-keys.js';
import { refreshGuiPolicySnapshot } from '../policy.js';
import { RUNTIME_FEED_LABELS, RUNTIME_FEED_NAMES } from '../runtime/feed-health.js';
import { renderDrawCaptureTracePanel } from '../runtime/rejected-bitmap-text-panel.js';
export { createDrawCaptureTraceRow, formatDrawCaptureTraceMeta, renderDrawCaptureTracePanel, } from '../runtime/rejected-bitmap-text-panel.js';
export { readTextEventLogSnapshot, readTextRecordHistorySnapshot, readTranslationDiagnosticsSnapshot, refreshRuntimeFeed, } from '../runtime/feed-refresh.js';
export { clearDrawCaptureTrace } from '../runtime/diagnostics-control.js';
import { refs, state } from '../state.js';
import { renderHookResults, renderTextRecordSections, syncTextTroubleshootingLogCopyEnabled, } from '../text-records/lists.js';
import type { GuiPolicySnapshot, GuiRuntimeFeedName } from '../types.js';
import { renderForesightPanel } from '../runtime/foresight-panel.js';
export { renderForesightPanel } from '../runtime/foresight-panel.js';
interface RuntimePanelRenderOptions {
    force?: boolean;
}
export function renderStatus(policySnapshot: GuiPolicySnapshot = refreshGuiPolicySnapshot()): void {
    syncFoldedPanelDefaults(policySnapshot);
    renderRuntimeFeedHealthMarkers();
    renderTranslationStatusPanel();
    renderDrawCaptureTracePanel(policySnapshot);
    renderForesightPanel();
}
const RUNTIME_FEED_HEALTH_MARKER_IDS: Readonly<Record<GuiRuntimeFeedName, readonly string[]>> = {
    settings: ['settings-feed-health'],
    hooks: ['hooks-feed-health'],
    textRecords: ['text-record-feed-health'],
    translation: ['translation-feed-health'],
    drawCapture: ['draw-capture-feed-health'],
};
export function renderRuntimeFeedHealthMarkers(): void {
    const feedCount = RUNTIME_FEED_NAMES.length;
    for (let feedIndex = 0; feedIndex < feedCount; feedIndex += 1) {
        const name = RUNTIME_FEED_NAMES[feedIndex];
        if (name === undefined)
            continue;
        const health = state.runtimeFeedHealth[name];
        const retained = health.lastSuccessGeneration !== null;
        const label = health.status === 'current'
            ? ''
            : retained
                ? `${RUNTIME_FEED_LABELS[name]}: stale (${health.status})`
                : `${RUNTIME_FEED_LABELS[name]}: ${health.status}`;
        const tone = health.status === 'failed' && !retained ? 'bad' : 'warn';
        const markerIds = RUNTIME_FEED_HEALTH_MARKER_IDS[name];
        const markerCount = markerIds.length;
        for (let markerIndex = 0; markerIndex < markerCount; markerIndex += 1) {
            const id = markerIds[markerIndex];
            if (id === undefined)
                continue;
            const marker = refs[id];
            if (!marker)
                continue;
            marker.hidden = health.status === 'current';
            marker.className = `runtime-feed-health ${tone}`;
            marker.textContent = label;
            marker.title = health.reason;
        }
    }
    syncTextTroubleshootingLogCopyEnabled();
}
export function renderRuntimePanelsForFeed(policySnapshot: GuiPolicySnapshot = refreshGuiPolicySnapshot(), options: RuntimePanelRenderOptions = {}): void {
    const force = options.force === true;
    syncFoldedPanelDefaults(policySnapshot);
    const keys = createRuntimePanelRenderKeys(policySnapshot);
    if (force || hasRuntimePanelKeyChanged('status', keys.status)) {
        renderStatus(policySnapshot);
        rememberRuntimePanelKey('status', keys.status);
    }
    if (force || hasRuntimePanelKeyChanged('hooks', keys.hooks)) {
        renderHookResults(policySnapshot);
        rememberRuntimePanelKey('hooks', keys.hooks);
    }
    if (force || !keys.textRecords.complete || hasRuntimePanelKeyChanged('textRecords', keys.textRecords.key)) {
        renderTextRecordSections(policySnapshot);
        rememberRuntimePanelKey('textRecords', keys.textRecords.key);
    }
}
export function renderTranslationStatusPanel(): void {
    renderProviderHeader();
}
