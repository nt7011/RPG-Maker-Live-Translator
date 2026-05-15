// Persistent control values for the Precacher UI.
// This keeps ui.json read/write concerns outside the page workflow code.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    function createUiSettingsController(context) {
        const {
            refs,
            state,
            getPaths,
            isFile,
            readJsonFile,
            writeJsonFile,
            addLog,
            formatError,
            readPositiveInteger,
            normalizePositiveInteger,
            firstPositiveInteger,
        } = context;

        function loadUiSettings() {
            state.uiSettingsLoaded = false;
            const paths = getPaths();
            let settings = null;

            if (paths && isFile(paths.uiSettingsFile)) {
                try {
                    settings = readJsonFile(paths.uiSettingsFile);
                } catch (err) {
                    addLog(`[PrecacheUI] Failed to read precacher/ui.json: ${formatError(err)}`);
                }
            }

            if (settings && typeof settings === 'object') {
                applyUiSettings(settings);
            }
            state.uiSettingsLoaded = true;
        }

        function applyUiSettings(settings) {
            if (typeof settings.systemPrompt === 'string') {
                refs['system-prompt'].value = settings.systemPrompt;
            }

            const concurrency = normalizePositiveInteger(settings.concurrency);
            if (concurrency !== null) {
                refs.concurrency.value = String(concurrency);
            }

            const inputTokenBudget = firstPositiveInteger(
                settings.inputTokenBudget,
                settings.inputTokensPerRequest,
                settings.inputTokenPerRequest
            );
            if (inputTokenBudget !== null) {
                refs['token-budget'].value = String(inputTokenBudget);
            }
        }

        function collectUiSettings() {
            const concurrency = readPositiveInteger('concurrency');
            const inputTokenBudget = readPositiveInteger('token-budget');
            if (concurrency === null || inputTokenBudget === null) return null;
            return {
                version: 1,
                systemPrompt: refs['system-prompt'].value,
                concurrency,
                inputTokenBudget,
            };
        }

        function scheduleUiSettingsSave() {
            const paths = getPaths();
            if (!state.uiSettingsLoaded || !paths) return;
            if (state.uiSettingsSaveTimer) clearTimeout(state.uiSettingsSaveTimer);
            state.uiSettingsSaveTimer = setTimeout(() => {
                state.uiSettingsSaveTimer = null;
                saveUiSettings({ silent: true });
            }, 350);
        }

        function flushUiSettingsSave() {
            const paths = getPaths();
            if (!state.uiSettingsLoaded || !paths) return;
            saveUiSettings({ silent: true });
        }

        function saveUiSettings(options = {}) {
            const paths = getPaths();
            if (!paths || !paths.uiSettingsFile) return false;
            if (state.uiSettingsSaveTimer) {
                clearTimeout(state.uiSettingsSaveTimer);
                state.uiSettingsSaveTimer = null;
            }

            const settings = collectUiSettings();
            if (!settings) return false;

            try {
                writeJsonFile(paths.uiSettingsFile, settings);
                return true;
            } catch (err) {
                if (!options.silent) {
                    addLog(`[PrecacheUI] Failed to save precacher/ui.json: ${formatError(err)}`);
                }
                return false;
            }
        }

        return {
            flushUiSettingsSave,
            loadUiSettings,
            saveUiSettings,
            scheduleUiSettingsSave,
        };
    }

    globalScope.PrecacheUiSettings = Object.freeze({ createUiSettingsController });
})();
