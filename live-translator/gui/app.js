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
            normalizeTextOrchestratorSnapshot,
            normalizeForesightSnapshot,
            normalizeDrawCaptureTraceSnapshot,
            getMonitorSettings,
            isForesightEnabled,
            shouldShowForesightSpoilers,
            isDiagnosticsPerformanceModeEnabled,
            isDiagnosticsDetailViewEnabled,
            shouldCensorForesightSpoilerRecord,
            isDrawCaptureTraceEnabled,
            getForesightDisabledMessage,
            buildDrawCaptureTraceCopyPayload,
            buildForesightDiagnosticsCopyPayload,
            buildTextRecordCopyPayload,
            getTextRecordPolicyDiagnostics,
            getTextRecordTranslationRailInfo,
        };
    }

    boot();
})();
