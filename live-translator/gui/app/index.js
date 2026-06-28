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
            deriveDiagnosticsSummaryModel,
            filterVisibleHookResults,
            getGuiDiagnosticsSnapshotRequest,
            isGuiTextRecordSpoilerCensored,
            syncRuntimeDiagnosticsForGuiState,
            buildDrawCaptureTraceCopyPayload,
            buildForesightDiagnosticsCopyPayload,
            buildTextRecordCopyPayload,
            getTextRecordRuntimePolicyDiagnostics,
            getTextRecordTranslationRailInfo,
            syncTextRecordListBodyVisibility,
            createLmStudioStatusModel,
            formatLmStudioModelLabel,
            formatLmStudioComplaint,
        };
    }

    boot();
})();
