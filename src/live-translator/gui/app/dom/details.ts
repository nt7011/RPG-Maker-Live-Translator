import { applyFoldedPanelDefault, createStatusSummaryModel, syncStatusPanelDefault } from '../core.js';
import { createStatusPill, createTextElement } from './builders.js';
import { toneForHookStatus } from '../formatters.js';
import { getGuiEffectivePolicy, getGuiPolicySnapshot } from '../policy.js';
import type { GuiPolicySnapshot } from '../types.js';
import { falsyFallback } from '../types.js';
export function syncFoldedPanelDefaults(policySnapshot: GuiPolicySnapshot = getGuiPolicySnapshot()): void {
    const effectivePolicy = getGuiEffectivePolicy(policySnapshot);
    applyFoldedPanelDefault('draw-capture-panel', 'drawCaptureTrace', true, `draw:${effectivePolicy.drawCaptureTrace.panelVisible ? 'visible' : 'hidden'}`);
    applyFoldedPanelDefault('text-record-panel', 'activeText', true, 'active:default');
    syncStatusPanelDefault(createStatusSummaryModel(policySnapshot));
}
export function createLine(value: unknown, kind: string): HTMLElement {
    return createTextElement('span', `text-line ${kind}`, falsyFallback(value, '-'));
}
export function createCell(value: unknown): HTMLElement {
    return createTextElement('td', '', value);
}
export function createStatusCell(value: unknown): HTMLElement {
    const cell = document.createElement('td');
    cell.appendChild(createStatusPill(value, toneForHookStatus(value)));
    return cell;
}
