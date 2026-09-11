import { renderProviderHeader } from './panels/provider-header.js';
import { renderLagIncidentsPanel } from './runtime/lag-incidents-panel.js';
import { renderResourcePanel } from './runtime/resource-panel.js';
import { copyDrawCaptureTrace, copyTextTroubleshootingLog, copyResourceProbe } from './copy/actions.js';
import { addLog, bindFoldedPanelSummaryControls, clearLog, getGameWindow, initNode, initRefs, refreshConfigSummary, refreshRuntimeContext, syncPanelDisclosureIndicators, updateHeartbeat, } from './core.js';
import { refreshGuiPolicySnapshot } from './policy.js';
import { clearDrawCaptureTrace } from './runtime/diagnostics-control.js';
import { renderDrawCaptureTracePanel } from './runtime/rejected-bitmap-text-panel.js';
import { refs } from './state.js';
import { renderTextRecordSections } from './text-records/lists.js';
import { bindVersionUpdateAction, startUpdateChecker, stopUpdateChecker } from './version/controller.js';
const UNSUPPORTED_PANEL_IDS = Object.freeze(['foresight-panel', 'hook-installation-panel']);
function bindEvents(): void {
    refs['clear-log']?.addEventListener('click', clearLog);
    refs['resource-probe-copy']?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void copyResourceProbe(refs['resource-probe-copy']);
    });
    refs['text-log-copy']?.addEventListener('click', () => {
        copyTextTroubleshootingLog(refs['text-log-copy']);
    });
    refs['draw-capture-clear']?.addEventListener('click', () => {
        clearDrawCaptureTrace(getGameWindow());
    });
    refs['draw-capture-copy']?.addEventListener('click', () => {
        copyDrawCaptureTrace(refs['draw-capture-copy']);
    });
    bindVersionUpdateAction();
    bindFoldedPanelSummaryControls();
    syncPanelDisclosureIndicators();
}
function hideUnsupportedPanels(): void {
    for (const id of UNSUPPORTED_PANEL_IDS) {
        const element = refs[id];
        if (element)
            element.hidden = true;
    }
}
export function initializeGuiShell(): void {
    initRefs();
    bindEvents();
}
export function renderInitialGuiState(): void {
    const policy = refreshGuiPolicySnapshot();
    renderTextRecordSections(policy);
    renderDrawCaptureTracePanel(policy);
    renderResourcePanel();
    renderLagIncidentsPanel();
    renderProviderHeader();
    updateHeartbeat();
}
export function logGuiLoaded(message: string): void {
    addLog('info', message);
}
export function bootGuiApplication(): void {
    initializeGuiShell();
    hideUnsupportedPanels();
    window.addEventListener('beforeunload', () => {
        stopUpdateChecker();
    });
    const nodeReady = initNode();
    refreshRuntimeContext();
    refreshConfigSummary();
    startUpdateChecker();
    renderInitialGuiState();
    logGuiLoaded(nodeReady ? 'GUI monitor loaded.' : 'GUI monitor loaded without Node APIs.');
}
