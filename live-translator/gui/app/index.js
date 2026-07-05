// Translator monitor boot facade.
// The monitor implementation is split across gui/app/*.js so each feature area stays small.
(() => {
    'use strict';

    if (globalThis.__LiveTranslatorGuiExposeTestApi === true) {
        globalThis.LiveTranslatorGuiTestApi = {
            normalizeVersionString,
            parseUpdateVersion,
            compareUpdateVersions,
            parseVersionPayload,
            getVersionCheckResult,
            validateVersionCheckUrl,
            fetchRemoteTextWithNode,
            replaceVersionHttpsForTest(value) {
                const previous = https;
                https = value;
                return previous;
            },
            openGuiUpdatePage,
            normalizeTextOrchestratorSnapshot,
            normalizeForesightSnapshot,
            normalizeDrawCaptureTraceSnapshot,
            createGuiConfiguredPolicy,
            getGuiConfiguredPolicy,
            getGuiRuntimeState,
            getGuiViewState,
            getGuiEffectivePolicy,
            refreshGuiPolicySnapshot,
            deriveIntelSummaryModel,
            filterVisibleHookResults,
            getGuiIntelSnapshotRequest,
            isGuiTextRecordSpoilerCensored,
            syncRuntimeIntelForGuiState,
            buildDrawCaptureTraceCopyPayload,
            buildForesightIntelCopyPayload,
            buildTextRecordCopyPayload,
            getTextRecordRuntimePolicyIntel,
            getTextRecordTranslationRailInfo,
            createTextRecordRenderContext,
            createRuntimePanelRenderKeys,
            createTextRecordPanelKeySource,
            createTextRecordRowRenderKey,
            createTextRecordDetailRenderKey,
            renderTextRecordSections,
            createTextRecordDetail,
            syncTextRecordListBodyVisibility,
            createLmStudioStatusModel,
            formatLmStudioModelLabel,
            formatLmStudioComplaint,
            patchGuiStateForTest(value) {
                Object.assign(state, value || {});
                return state;
            },
            patchGuiRefsForTest(value) {
                Object.assign(refs, value || {});
                return refs;
            },
        };
    }

    boot();
})();
