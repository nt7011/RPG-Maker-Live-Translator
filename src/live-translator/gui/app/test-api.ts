import { buildDrawCaptureTraceCopyPayload, buildForesightDiagnosticsCopyPayload, buildTextRecordCopyPayload, buildTextTroubleshootingLogCopyPayload, } from './copy/actions.js';
import { deriveStatusSummaryModel } from './core.js';
import { createProviderHeaderModel } from './panels/provider-header.js';
import { getPriorityLaneNotification } from './panels/priority-lane.js';
import { createRuntimePanelRenderKeys, createTextRecordPanelKeySource } from './panels/render-keys.js';
import { clearDrawCaptureTrace, readTextEventLogSnapshot, readTextRecordHistorySnapshot, readTranslationDiagnosticsSnapshot, refreshRuntimeFeed, renderRuntimePanelsForFeed, } from './panels/render.js';
import { createRuntimeFeedHealthRenderKey, copyRuntimeFeedHealth } from './runtime/feed-health.js';
import { createGuiConfiguredPolicy, getGuiConfiguredPolicy, getGuiDiagnosticsSnapshotRequest, getGuiEffectivePolicy, getGuiRuntimeState, getGuiViewState, refreshGuiPolicySnapshot, } from './policy.js';
import { normalizeDrawCaptureTraceSnapshot } from './runtime/diagnostics.js';
import { filterVisibleHookResults, normalizeTextCoreStatus, readHookDiagnostics, readTextCoreDiagnostics, readTextCoreStatus, readTranslationStatus, } from './runtime/records.js';
import { nodeModules, refs, state } from './state.js';
import { applyCachedTextRecordHistory, createTextRecordDetail } from './text-records/details.js';
import { createTextRecordDetailRenderKey, createTextRecordRowRenderKey, renderTextRecordSections, } from './text-records/lists.js';
import { createTextRecordRenderContext } from './text-records/view-model.js';
import type { UnknownRecord } from './types.js';
import { isUnknownRecord } from './types.js';
import { compareUpdateVersions, getVersionCheckResult, normalizeVersionString, parseUpdateVersion, parseVersionPayload, } from './version/model.js';
import { openGuiUpdatePage, refreshVersionSettings, runUpdateCheck } from './version/controller.js';
import { fetchRemoteTextWithBrowser, fetchRemoteTextWithNode, validateVersionCheckUrl } from './version/network.js';
function patchGuiStateForTest(value: unknown): typeof state {
    if (isUnknownRecord(value))
        Object.assign(state, value);
    return state;
}
function patchGuiRefsForTest(value: unknown): typeof refs {
    if (isUnknownRecord(value))
        Object.assign(refs, value);
    return refs;
}
function replaceVersionHttpsForTest(value: unknown): unknown {
    const previous = nodeModules.https;
    nodeModules.https = value;
    return previous;
}
export function createGuiTestApi(): UnknownRecord {
    return {
        normalizeVersionString,
        parseUpdateVersion,
        compareUpdateVersions,
        parseVersionPayload,
        getVersionCheckResult,
        runUpdateCheck,
        refreshVersionSettings,
        validateVersionCheckUrl,
        fetchRemoteTextWithBrowser,
        fetchRemoteTextWithNode,
        replaceVersionHttpsForTest,
        openGuiUpdatePage,
        normalizeTextCoreStatus,
        readHookDiagnostics,
        readTextCoreDiagnostics,
        readTextCoreStatus,
        readTranslationStatus,
        readTranslationDiagnosticsSnapshot,
        clearDrawCaptureTrace,
        readTextEventLogSnapshot,
        readTextRecordHistorySnapshot,
        refreshRuntimeFeed,
        createRuntimeFeedHealthRenderKey,
        copyRuntimeFeedHealth,
        normalizeDrawCaptureTraceSnapshot,
        createGuiConfiguredPolicy,
        getGuiConfiguredPolicy,
        getGuiRuntimeState,
        getGuiViewState,
        getGuiEffectivePolicy,
        refreshGuiPolicySnapshot,
        deriveStatusSummaryModel,
        filterVisibleHookResults,
        getGuiDiagnosticsSnapshotRequest,
        buildDrawCaptureTraceCopyPayload,
        buildForesightDiagnosticsCopyPayload,
        buildTextRecordCopyPayload,
        buildTextTroubleshootingLogCopyPayload,
        createTextRecordRenderContext,
        createRuntimePanelRenderKeys,
        createTextRecordPanelKeySource,
        createTextRecordRowRenderKey,
        createTextRecordDetailRenderKey,
        renderRuntimePanelsForFeed,
        renderTextRecordSections,
        createTextRecordDetail,
        applyCachedTextRecordHistory,
        getPriorityLaneNotification,
        createProviderHeaderModel,
        patchGuiStateForTest,
        patchGuiRefsForTest,
    };
}
