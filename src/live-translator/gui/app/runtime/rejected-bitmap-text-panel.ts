import { formatNumber, formatTime, setSummaryStatus } from '../core.js';
import { appendEmptyState, createTextElement } from '../dom/builders.js';
import { normalizeCoordinate } from '../formatters.js';
import { getGuiDrawCapturePolicy, refreshGuiPolicySnapshot } from '../policy.js';
import { refs, state } from '../state.js';
import type { GuiDrawCaptureEvent, GuiPolicySnapshot } from '../types.js';
import { falsyFallback, isGuiButtonElement, isGuiDetailsElement } from '../types.js';
export function renderDrawCaptureTracePanel(policySnapshot: GuiPolicySnapshot = refreshGuiPolicySnapshot()): void {
    const trace = state.drawCaptureTrace;
    const panel = refs['draw-capture-panel'];
    const container = refs['draw-capture-trace'];
    const clearButton = refs['draw-capture-clear'];
    const copyButton = refs['draw-capture-copy'];
    const tracePolicy = getGuiDrawCapturePolicy(policySnapshot);
    const enabled = tracePolicy.enabled;
    if (panel) {
        panel.hidden = !tracePolicy.panelVisible;
        if (!tracePolicy.panelVisible && isGuiDetailsElement(panel))
            panel.open = false;
    }
    if (!tracePolicy.panelVisible) {
        for (const button of [clearButton, copyButton]) {
            if (!isGuiButtonElement(button))
                continue;
            button.disabled = true;
            button.title = '';
        }
        if (container)
            container.innerHTML = '';
        return;
    }
    if (isGuiButtonElement(copyButton)) {
        const canCopy = tracePolicy.copyEnabled;
        copyButton.disabled = !canCopy;
        copyButton.title = enabled
            ? canCopy
                ? 'Copy rejected Bitmap text'
                : 'No rejected Bitmap text to copy'
            : tracePolicy.disabledReason;
    }
    if (isGuiButtonElement(clearButton)) {
        const canClear = tracePolicy.copyEnabled;
        clearButton.disabled = !canClear;
        clearButton.title = enabled
            ? canClear
                ? 'Clear rejected Bitmap text'
                : 'No rejected Bitmap text to clear'
            : tracePolicy.disabledReason;
    }
    if (!enabled) {
        setSummaryStatus('draw-capture-summary', 'neutral', 'disabled');
        if (container) {
            container.innerHTML = '';
            appendEmptyState(container, falsyFallback(tracePolicy.disabledReason, 'Draw capture trace disabled.'));
        }
        return;
    }
    if (!container)
        return;
    container.innerHTML = '';
    const events = trace?.events ?? [];
    setSummaryStatus('draw-capture-summary', events.length ? 'ok' : 'neutral', trace?.enabled === false ? 'disabled' : `${formatNumber(events.length)} rejected`);
    if (!events.length) {
        appendEmptyState(container, 'No rejected Bitmap text.');
        return;
    }
    events
        .slice(-tracePolicy.eventDisplayLimit)
        .reverse()
        .forEach((event) => {
        container.appendChild(createDrawCaptureTraceRow(event));
    });
}
export function createDrawCaptureTraceRow(event: GuiDrawCaptureEvent): HTMLElement {
    const row = document.createElement('div');
    row.className = 'capture-trace-row';
    row.appendChild(createTextElement('div', 'capture-trace-stage', falsyFallback(event.stage, 'draw')));
    const main = document.createElement('div');
    main.className = 'capture-trace-main';
    main.appendChild(createTextElement('div', 'capture-trace-text', falsyFallback(event.normalizedText, falsyFallback(event.visibleText, falsyFallback(event.rawText, '-')))));
    main.appendChild(createTextElement('div', 'capture-trace-meta', formatDrawCaptureTraceMeta(event)));
    row.appendChild(main);
    return row;
}
export function formatDrawCaptureTraceMeta(event: GuiDrawCaptureEvent): string {
    const parts: string[] = [];
    if (event.at)
        parts.push(formatTime(event.at));
    if (event.adapter)
        parts.push(event.adapter);
    if (event.methodName)
        parts.push(event.methodName);
    if (event.reason)
        parts.push(event.reason);
    const x = normalizeCoordinate(event.x);
    const y = normalizeCoordinate(event.y);
    if (x !== null || y !== null) {
        parts.push(`(${x !== null ? String(x) : '-'},${y !== null ? String(y) : '-'})`);
    }
    return parts.join(' | ');
}
