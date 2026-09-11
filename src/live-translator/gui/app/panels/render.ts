import { formatNumber, formatTime, setSummaryStatus } from '../core.js';
import { syncFoldedPanelDefaults } from '../dom/details.js';
import { renderProviderHeader } from './provider-header.js';
import { createRuntimePanelRenderKeys, hasRuntimePanelKeyChanged, rememberRuntimePanelKey } from './render-keys.js';
import { getGuiConfiguredPolicy, getGuiForesightPolicy, getGuiTextRecordPolicy, refreshGuiPolicySnapshot, } from '../policy.js';
import { createRuntimeFeedHealthRenderKey, RUNTIME_FEED_LABELS, RUNTIME_FEED_NAMES } from '../runtime/feed-health.js';
import { renderDrawCaptureTracePanel } from '../runtime/rejected-bitmap-text-panel.js';
export { createDrawCaptureTraceRow, formatDrawCaptureTraceMeta, renderDrawCaptureTracePanel, } from '../runtime/rejected-bitmap-text-panel.js';
export { readForesightDiagnosticsSnapshot, readTextEventLogSnapshot, readTextRecordHistorySnapshot, readTranslationDiagnosticsSnapshot, refreshRuntimeFeed, } from '../runtime/feed-refresh.js';
export { clearDrawCaptureTrace } from '../runtime/diagnostics-control.js';
import { normalizeActiveTextRecord } from '../runtime/records.js';
import { refs, state } from '../state.js';
import { createForesightTranslationPillForContext, createTextRecordRenderContext, getCurrentForesightGameMessageRecord, getForesightTextRecords, renderHookResults, renderTextRecordSections, syncTextTroubleshootingLogCopyEnabled, syncTextRecordVolatileDom, } from '../text-records/lists.js';
import type { GuiPolicySnapshot, GuiRuntimeFeedName } from '../types.js';
import { falsyFallback, isGuiButtonElement, isGuiDetailsElement, isGuiHtmlElement, isGuiInputElement, isUnknownRecord, propertyValue, stringValue, } from '../types.js';
import { render as renderForesightTree } from '../../foresight-tree/renderer.js';
interface RuntimePanelRenderOptions {
    force?: boolean;
}
export function renderStatus(policySnapshot: GuiPolicySnapshot = refreshGuiPolicySnapshot()): void {
    syncFoldedPanelDefaults(policySnapshot);
    renderRuntimeFeedHealthMarkers();
    renderTranslationStatusPanel();
    renderDrawCaptureTracePanel(policySnapshot);
    renderForesightPanel(policySnapshot);
}
const RUNTIME_FEED_HEALTH_MARKER_IDS: Readonly<Record<GuiRuntimeFeedName, readonly string[]>> = {
    settings: ['settings-feed-health'],
    hooks: ['hooks-feed-health'],
    textRecords: ['text-record-feed-health'],
    translation: ['translation-feed-health'],
    drawCapture: ['draw-capture-feed-health'],
    foresight: ['foresight-feed-health'],
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
    else {
        syncTextRecordVolatileDom(createTextRecordRenderContext(policySnapshot));
    }
}
export function renderTranslationStatusPanel(): void {
    renderProviderHeader();
}
export function renderForesightPanel(policySnapshot: GuiPolicySnapshot = refreshGuiPolicySnapshot()): void {
    const container = refs['foresight-tree'];
    const panel = refs['foresight-panel'];
    const foresightPolicy = getGuiForesightPolicy(policySnapshot);
    if (panel) {
        panel.hidden = !foresightPolicy.visible;
        if (!foresightPolicy.visible && isGuiDetailsElement(panel))
            panel.open = false;
    }
    if (!foresightPolicy.visible) {
        if (container)
            container.innerHTML = '';
        setForesightCopyEnabled(false);
        return;
    }
    if (!container)
        return;
    syncForesightPanelDisabledState(foresightPolicy);
    syncForesightMessageFilterToggle(policySnapshot);
    if (!foresightPolicy.controlsEnabled) {
        container.innerHTML = '';
        container.hidden = true;
        setSummaryStatus('foresight-summary', 'neutral', 'disabled');
        setForesightCopyEnabled(false);
        return;
    }
    container.hidden = false;
    const textRecords = getForesightTextRecords();
    const textRecordRenderContext = createTextRecordRenderContext(policySnapshot, textRecords);
    const model: unknown = renderForesightTree(container, {
        snapshot: state.foresight,
        textRecords,
        currentMessageRecord: getCurrentForesightGameMessageRecord(state.diagnosticRecords),
        createTranslationPill: (item: unknown) => createForesightTranslationPillForContext(normalizeActiveTextRecord(item), textRecordRenderContext),
        maxActions: foresightPolicy.actionDisplayLimit,
        messagesOnly: foresightPolicy.messagesOnly,
        dynamicRenderKey: createForesightDynamicRenderKey(policySnapshot),
        projectionPolicy: getGuiConfiguredPolicy(policySnapshot).diagnostics.guiProjection,
        formatTime,
    });
    renderForesightSummary(model);
    setForesightCopyEnabled(propertyValue(model, 'hasSnapshot') === true && Boolean(propertyValue(model, 'scan')));
}
export function syncForesightPanelDisabledState(foresightPolicy: ReturnType<typeof getGuiForesightPolicy> = getGuiForesightPolicy()): void {
    const panel = refs['foresight-panel'];
    const disabled = !foresightPolicy.controlsEnabled;
    if (!panel)
        return;
    panel.classList.toggle('foresight-panel-disabled', disabled);
    if (disabled && isGuiDetailsElement(panel)) {
        panel.open = false;
        panel.setAttribute('aria-disabled', 'true');
        panel.title = falsyFallback(foresightPolicy.disabledReason, 'Foresight disabled');
    }
    else {
        panel.removeAttribute('aria-disabled');
        panel.title = '';
    }
}
export function syncForesightMessageFilterToggle(policySnapshot: GuiPolicySnapshot = refreshGuiPolicySnapshot()): void {
    const toggle = refs['foresight-message-filter-toggle'];
    if (!isGuiInputElement(toggle))
        return;
    const foresightPolicy = getGuiForesightPolicy(policySnapshot);
    toggle.checked = foresightPolicy.controlsEnabled && foresightPolicy.messagesOnly;
    toggle.disabled = !foresightPolicy.controlsEnabled;
    toggle.title = foresightPolicy.messageFilterTitle;
    const wrapper = toggle.parentNode;
    if (isGuiHtmlElement(wrapper))
        wrapper.hidden = !foresightPolicy.controlsEnabled;
}
export function createForesightDynamicRenderKey(policySnapshot: GuiPolicySnapshot = refreshGuiPolicySnapshot()): string {
    const status = state.translationDiagnostics;
    const summary = status?.summary ?? {};
    const textRecordPolicy = getGuiTextRecordPolicy(policySnapshot);
    return [
        textRecordPolicy.showForesightSpoilers ? 'spoilers:show' : 'spoilers:censor',
        falsyFallback(status?.updatedAt, ''),
        falsyFallback(summary['queued'], 0),
        falsyFallback(summary['running'], 0),
        falsyFallback(summary['activeSubscribers'], 0),
        JSON.stringify(createRuntimeFeedHealthRenderKey(state.runtimeFeedHealth, ['foresight', 'textRecords', 'translation'])),
    ]
        .map(stringValue)
        .join('|');
}
export function renderForesightSummary(model: unknown): void {
    const scan = propertyValue(model, 'scan');
    if (propertyValue(model, 'hasSnapshot') !== true || !isUnknownRecord(scan)) {
        setSummaryStatus('foresight-summary', 'neutral', 'no scans');
        return;
    }
    const count = Number(propertyValue(model, 'actionCount')) || 0;
    const hidden = Number(propertyValue(model, 'actionsTruncated')) || 0;
    const condensed = Number(propertyValue(model, 'condensedActionCount')) || 0;
    const blocks = Number(scan['blocks']) || 0;
    const suffix = [
        hidden > 0 ? `+${formatNumber(hidden)} hidden` : '',
        condensed > 0 ? `${formatNumber(condensed)} condensed` : '',
        blocks > 0 ? `${formatNumber(blocks)} messages` : '',
    ]
        .filter(Boolean)
        .join(' / ');
    const label = suffix ? `${formatNumber(count)} actions / ${suffix}` : `${formatNumber(count)} actions`;
    setSummaryStatus('foresight-summary', getForesightSummaryTone(model), label);
}
export function getForesightSummaryTone(model: unknown): string {
    const scan = propertyValue(model, 'scan');
    const routeBarriers = propertyValue(scan, 'routeBarriers');
    const barrierCode = propertyValue(scan, 'barrierCode');
    if (routeBarriers || (barrierCode !== null && barrierCode !== undefined))
        return 'warn';
    const stopReason = propertyValue(scan, 'stopReason');
    if (typeof stopReason === 'string' &&
        stopReason &&
        !['event-end', 'message-limit', 'scan-limit'].includes(stopReason))
        return 'warn';
    return propertyValue(model, 'actionCount') ? 'ok' : 'neutral';
}
export function setForesightCopyEnabled(enabled: boolean): void {
    const button = refs['foresight-copy'];
    if (!isGuiButtonElement(button))
        return;
    const foresightPolicy = getGuiForesightPolicy();
    button.hidden = !foresightPolicy.controlsEnabled;
    button.disabled = !enabled;
    button.title = enabled ? 'Copy foresight diagnostics' : 'No foresight diagnostics to copy';
}
