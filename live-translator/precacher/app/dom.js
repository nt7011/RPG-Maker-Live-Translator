// Precacher DOM helpers.
//
// The app controller owns job flow; this module owns the small DOM mutations and
// event wiring that keep the offline precache UI responsive.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    function createDomController(options = {}) {
        const {
            refs,
            state,
            getPaths,
            isDirectory,
            isFile,
            formatError,
            addLog,
            refreshPreflight,
            runExtract,
            runTranslate,
            stopTranslation,
            stopStatsPolling,
            scheduleUiSettingsSave,
            flushUiSettingsSave,
        } = options;

        function setText(id, value) {
            if (refs[id]) refs[id].textContent = String(value);
        }

        function setStatus(id, tone, value) {
            const el = refs[id];
            if (!el) return;
            el.className = `status ${tone}`;
            el.textContent = value;
        }

        function setRunState(tone, value) {
            refs['run-state'].className = `run-state ${tone}`;
            refs['run-state'].textContent = value;
        }

        function setPreflightOverview(tone, value) {
            if (!refs['preflight-overview']) return;
            refs['preflight-overview'].className = `summary-status ${tone}`;
            refs['preflight-overview'].textContent = value;
        }

        function showPrecacheRelaunchReminder() {
            const reminder = refs['precache-relaunch-reminder'];
            if (reminder) reminder.classList.remove('hidden');
        }

        function setBusy(operation) {
            state.busy = true;
            state.operation = operation;
            updateButtons();
        }

        function clearBusy() {
            state.busy = false;
            state.operation = '';
            state.abortController = null;
            stopStatsPolling();
            updateButtons();
        }

        function updateButtons() {
            const paths = getPaths();
            const canExtract = isDirectory(paths && paths.dataDir) && !state.busy;
            const canTranslate = isFile(paths && paths.outputFile) && isFile(paths && paths.translatorConfig) && !state.busy;
            refs['extract-strings'].disabled = !canExtract;
            refs['translate-missing'].disabled = !canTranslate;
            refs['stop-translation'].disabled = !(state.busy && state.operation === 'translate');
        }

        function bindEvents() {
            refs['refresh-preflight'].addEventListener('click', () => {
                refreshPreflight().catch((err) => {
                    addLog(`[PrecacheUI] Refresh failed: ${formatError(err)}`);
                });
            });
            refs['extract-strings'].addEventListener('click', () => {
                runExtract().catch((err) => {
                    addLog(`[PrecacheUI] Extract crashed: ${formatError(err)}`);
                    clearBusy();
                });
            });
            refs['translate-missing'].addEventListener('click', () => {
                runTranslate().catch((err) => {
                    addLog(`[PrecacheUI] Translate crashed: ${formatError(err)}`);
                    clearBusy();
                });
            });
            refs['stop-translation'].addEventListener('click', stopTranslation);
            for (const id of ['concurrency', 'token-budget', 'system-prompt']) {
                refs[id].addEventListener('input', scheduleUiSettingsSave);
                refs[id].addEventListener('change', flushUiSettingsSave);
                refs[id].addEventListener('blur', flushUiSettingsSave);
            }
            window.addEventListener('beforeunload', flushUiSettingsSave);
        }

        return {
            setText,
            setStatus,
            setRunState,
            setPreflightOverview,
            showPrecacheRelaunchReminder,
            setBusy,
            clearBusy,
            updateButtons,
            bindEvents,
        };
    }

    globalScope.PrecacheUiDom = { createDomController };
})();
