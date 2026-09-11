import type { TextRecordsSnapshot } from '../../runtime/text-record-types.js';
import type { TranslationStatusSnapshot } from '../../runtime/translation-status-types.js';
import type { GuiResourceSnapshot, GuiConfiguredPolicy, GuiDrawCaptureTrace, GuiEffectivePolicy, GuiForesightSnapshot, GuiHookResult, GuiHookSummary, GuiTranslationDiagnosticsSnapshot, GuiRuntimeContext, GuiRuntimeFeedHealthMap, GuiRuntimeState, GuiTextRecord, GuiTextHistoryCacheEntry, GuiTextSummary, GuiViewState, UnknownRecord, } from './types.js';
import { createInitialRuntimeFeedHealth } from './runtime/feed-health.js';
export const refs: Record<string, HTMLElement | undefined> = {};
export const INACTIVE_TEXT_DISPLAY_LIMIT = 100;
export const VERSION_CHECK_URL = 'https://rmlt.pages.dev/info/available-versions.json';
export const UPDATE_PAGE_URL = 'https://rmlt.pages.dev/';
export const VERSION_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const VERSION_CHECK_TIMEOUT_MS = 8000;
export const VERSION_CHECK_MAX_BYTES = 16 * 1024;
export const VERSION_CHECK_MAX_REDIRECTS = 5;
export const FORESIGHT_ACTION_DISPLAY_LIMIT = 150;
export interface GuiState {
    providerStatus: TranslationStatusSnapshot | null;
    startedAt: number;
    updateCheckTimer: number | null;
    supportPath: string;
    gameRoot: string;
    translationCacheFile: string;
    installedVersion: string;
    installedVersionDisplay: string;
    installedVersionDisplaySource: string;
    latestVersion: string;
    checkUpdates: boolean;
    settings: UnknownRecord | null;
    settingsSource: string;
    settingsError: string;
    settingsFoldKey: string;
    updateCheckStatus: string;
    updateCheckMessage: string;
    updateCheckError: string;
    updateCheckInFlight: boolean;
    runtimeTextRecords: TextRecordsSnapshot | null;
    diagnosticRecords: GuiTextRecord[];
    textHistoryById: Map<string, GuiTextHistoryCacheEntry>;
    diagnosticsFeedRevision: number | null;
    resources: GuiResourceSnapshot | null;
    lagIncidents: UnknownRecord | null;
    runtimeContext: GuiRuntimeContext | null;
    configuredPolicy: GuiConfiguredPolicy | null;
    runtimeState: GuiRuntimeState | null;
    viewState: GuiViewState | null;
    effectivePolicy: GuiEffectivePolicy | null;
    selectedTextRecordKey: string;
    panelDefaultKeys: Record<string, string | undefined>;
    renderedPanelKeys: Record<'status' | 'hooks' | 'textRecords', string>;
    runtimeFeedHealth: GuiRuntimeFeedHealthMap;
    hookResults: GuiHookResult[];
    hookSummary: GuiHookSummary | null;
    hookDiagnosticsSurface: boolean;
    textSummary: GuiTextSummary | null;
    textDiagnosticsSurface: boolean;
    translationDiagnostics: GuiTranslationDiagnosticsSnapshot | null;
    drawCaptureTrace: GuiDrawCaptureTrace | null;
    foresight: GuiForesightSnapshot | null;
    foresightMessagesOnly: boolean;
    logLines: string[];
    provider: string;
    translatorProvider: string;
    translatorConfigError: string;
}
export const state: GuiState = {
    startedAt: Date.now(),
    updateCheckTimer: null,
    supportPath: '',
    gameRoot: '',
    translationCacheFile: '',
    installedVersion: '',
    installedVersionDisplay: '',
    installedVersionDisplaySource: '',
    latestVersion: '',
    checkUpdates: true,
    settings: null,
    settingsSource: '',
    settingsError: '',
    settingsFoldKey: '',
    updateCheckStatus: 'loading',
    updateCheckMessage: 'Checking installation',
    updateCheckError: '',
    updateCheckInFlight: false,
    runtimeTextRecords: null,
    diagnosticRecords: [],
    textHistoryById: new Map(),
    providerStatus: null,
    diagnosticsFeedRevision: null,
    resources: null,
    lagIncidents: null,
    runtimeContext: null,
    configuredPolicy: null,
    runtimeState: null,
    viewState: null,
    effectivePolicy: null,
    selectedTextRecordKey: '',
    panelDefaultKeys: {},
    renderedPanelKeys: {
        status: '',
        hooks: '',
        textRecords: '',
    },
    runtimeFeedHealth: createInitialRuntimeFeedHealth(),
    hookResults: [],
    hookSummary: null,
    hookDiagnosticsSurface: false,
    textSummary: null,
    textDiagnosticsSurface: false,
    translationDiagnostics: null,
    drawCaptureTrace: null,
    foresight: null,
    foresightMessagesOnly: true,
    logLines: [],
    provider: '-',
    translatorProvider: '',
    translatorConfigError: '',
};
export const nodeModules: {
    fs: unknown;
    path: unknown;
    https: unknown;
} = {
    fs: null,
    path: null,
    https: null,
};
