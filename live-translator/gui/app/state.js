// Shared state and constants for the translator monitor window.
// Feature scripts load after this file and read these globals directly.
'use strict';

var refs = {};
var INACTIVE_TEXT_DISPLAY_LIMIT = 100;
var VERSION_CHECK_URL = 'https://nt7011.github.io/info/translator-version.json';
var UPDATE_PAGE_URL = 'https://nt7011.github.io/';
var VERSION_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000;
var VERSION_CHECK_TIMEOUT_MS = 8000;
var VERSION_CHECK_MAX_BYTES = 16 * 1024;
var VERSION_CHECK_MAX_REDIRECTS = 5;
var FORESIGHT_ACTION_DISPLAY_LIMIT = 150;
var FORESIGHT_SURFACE_DISPLAY_LIMIT = 8;
var RESERVED_LANE_MIN_CONCURRENCY = 3;
// TODO: Replace this local reminder copy with policy-driven diagnostics once reserved lanes become user-configurable.
var RESERVED_LANE_READY_MESSAGE = 'Concurrent streams >= 3: One of the concurrent requests will be reserved for the active Game Message.';
var RESERVED_LANE_DISABLED_MESSAGE = 'Concurrent streams < 3: Increase the number of concurrent requests to 3 or more to reserve a lane for the active Game Message.';
var RESERVED_LANE_WAITING_MESSAGE = 'Waiting for concurrent stream diagnostics.';
var state = {
    startedAt: Date.now(),
    heartbeatTimer: null,
    updateCheckTimer: null,
    supportPath: '',
    gameRoot: '',
    translationCacheFile: '',
    installedVersion: '',
    latestVersion: '',
    checkUpdates: true,
    settings: null,
    settingsSource: '',
    settingsError: '',
    updateCheckStatus: 'loading',
    updateCheckMessage: 'Checking installation',
    updateCheckError: '',
    updateCheckInFlight: false,
    activeTexts: [],
    detachedTexts: [],
    archivedTexts: [],
    activeTextRecordDetailKey: '',
    renderedTextRecordDetailKey: '',
    diagnosticDetailKey: '',
    panelHealth: {
        runtimeContext: null,
        hookInstallation: null,
    },
    hookResults: [],
    hookSummary: null,
    textSummary: null,
    diagnostics: null,
    drawCaptureTrace: null,
    foresight: null,
    foresightVisible: true,
    foresightMessagesOnly: true,
    logLines: [],
    provider: '-',
    cacheEntries: '-',
};

var fs = null;
var path = null;
var https = null;
