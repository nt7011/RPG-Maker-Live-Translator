// Translator monitor preview harness.
// Direct-opening gui/index.html uses this simulated runtime so layout changes
// can be tuned without launching a game. Runtime launches pass supportPath and
// closeWithGame query values, which keep this preview disabled.
'use strict';

(function installTranslatorGuiPreview(root) {
    const STORAGE_KEY = 'rmlt.translatorGui.preview';
    const DEFAULT_OPTIONS = {
        updateState: 'outdated',
        provider: 'local',
        lmStudioState: 'connected',
        concurrency: 5,
        modelAuthor: 'bartowski',
        modelName: 'gemma4-26b-modelname',
        quantization: 'Q4_K_M',
        recordPreset: 'normal',
        hookPreset: 'ready',
        runtimePreset: 'ready',
        drawCapture: true,
        foresight: true,
        showSpoilers: false,
    };

    let options = null;
    let gameWindow = null;
    let controlsRoot = null;
    let controlsDismissed = false;

    function isEnabled() {
        const params = getSearchParams();
        const explicit = String(params.get('preview') || '').trim().toLowerCase();
        if (explicit === '1' || explicit === 'true' || explicit === 'yes') return true;
        if (explicit === '0' || explicit === 'false' || explicit === 'no') return false;
        return !hasRuntimeQuery(params);
    }

    function hasRuntimeQuery(params) {
        return ['supportPath', 'gameRoot', 'translationCacheFile', 'closeWithGame']
            .some((key) => params.has(key));
    }

    function getSearchParams() {
        try {
            return new URL(root.location && root.location.href || '').searchParams;
        } catch (_) {
            return new URLSearchParams();
        }
    }

    function installControls() {
        if (!isEnabled() || controlsRoot || controlsDismissed) return;
        options = loadOptions();
        const main = document.querySelector('main');
        if (!main || typeof document.createElement !== 'function') return;

        controlsRoot = document.createElement('section');
        controlsRoot.id = 'preview-controls';
        controlsRoot.className = 'panel preview-controls';
        controlsRoot.setAttribute('aria-label', 'Translator GUI preview controls');
        controlsRoot.innerHTML = [
            '<div class="preview-controls-header">',
            '<div class="preview-controls-heading">',
            '<h2>Preview Controls</h2>',
            '<span class="preview-badge">Direct-open preview</span>',
            '</div>',
            '<button id="preview-controls-close" class="preview-controls-close" type="button" title="Remove preview controls" aria-label="Remove preview controls">X</button>',
            '</div>',
            '<div class="preview-control-grid">',
            '<label class="preview-field" for="preview-update-state"><span>Update</span><select id="preview-update-state">',
            '<option value="outdated">Outdated</option>',
            '<option value="latest">Latest</option>',
            '<option value="checking">Checking</option>',
            '<option value="error">Error</option>',
            '<option value="disabled">Disabled</option>',
            '<option value="missing">Version info error</option>',
            '</select></label>',
            '<label class="preview-field" for="preview-provider"><span>Provider</span><select id="preview-provider">',
            '<option value="local">LM Studio</option>',
            '<option value="deepl">DeepL</option>',
            '<option value="mocktranslator">Mock</option>',
            '<option value="none">None</option>',
            '</select></label>',
            '<label class="preview-field" for="preview-lmstudio-state"><span>LM Studio</span><select id="preview-lmstudio-state">',
            '<option value="connected">Connected</option>',
            '<option value="pending">Pending</option>',
            '<option value="unverified-concurrency">Concurrency unverified</option>',
            '<option value="no-response">No response</option>',
            '<option value="cors">CORS blocked</option>',
            '<option value="timeout">Timeout</option>',
            '<option value="model-not-loaded">Model not loaded</option>',
            '<option value="auto-many">Auto: many models</option>',
            '<option value="api-error">Chat API error</option>',
            '</select></label>',
            '<label class="preview-field" for="preview-concurrency"><span>Concurrency</span><input id="preview-concurrency" type="number" min="0" max="12" step="1"></label>',
            '<label class="preview-field" for="preview-model-author"><span>REST author</span><input id="preview-model-author" type="text" autocomplete="off" spellcheck="false"></label>',
            '<label class="preview-field" for="preview-model-name"><span>REST model</span><input id="preview-model-name" type="text" autocomplete="off" spellcheck="false"></label>',
            '<label class="preview-field" for="preview-quantization"><span>REST quant</span><input id="preview-quantization" type="text" autocomplete="off" spellcheck="false"></label>',
            '<label class="preview-field" for="preview-record-preset"><span>Records</span><select id="preview-record-preset">',
            '<option value="normal">Normal</option>',
            '<option value="busy">Busy</option>',
            '<option value="empty">Empty</option>',
            '</select></label>',
            '<label class="preview-field" for="preview-hook-preset"><span>Hooks</span><select id="preview-hook-preset">',
            '<option value="ready">Ready</option>',
            '<option value="skipped">Skipped</option>',
            '<option value="failed">Failed</option>',
            '<option value="empty">Empty</option>',
            '</select></label>',
            '<label class="preview-field" for="preview-runtime-preset"><span>Runtime</span><select id="preview-runtime-preset">',
            '<option value="ready">Ready</option>',
            '<option value="unlinked">Unlinked</option>',
            '<option value="missing-support">Missing support</option>',
            '</select></label>',
            '</div>',
            '<div class="preview-check-row">',
            '<label class="preview-check"><input id="preview-draw-capture" type="checkbox">Draw trace</label>',
            '<label class="preview-check"><input id="preview-foresight" type="checkbox">Foresight</label>',
            '<label class="preview-check"><input id="preview-spoilers" type="checkbox">Show spoilers</label>',
            '</div>',
            '<div class="preview-actions">',
            '<button id="preview-reset" type="button">Reset</button>',
            '<span id="preview-status" class="preview-status">Preview data loaded.</span>',
            '</div>',
        ].join('');
        main.insertBefore(controlsRoot, main.firstElementChild);
        setControlValues(options);
        bindPreviewControls();
        if (document.body && document.body.classList) {
            document.body.classList.add('gui-preview-mode');
        }
    }

    function bindPreviewControls() {
        if (!controlsRoot) return;
        controlsRoot.addEventListener('input', handlePreviewControlChange);
        controlsRoot.addEventListener('change', handlePreviewControlChange);
        const resetButton = getControl('preview-reset');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                options = Object.assign({}, DEFAULT_OPTIONS);
                saveOptions(options);
                setControlValues(options);
                applyOptions(options);
            });
        }
        const closeButton = getControl('preview-controls-close');
        if (closeButton) closeButton.addEventListener('click', dismissPreviewControls);
    }

    function dismissPreviewControls() {
        if (!controlsRoot) return;
        const removedControls = controlsRoot;
        controlsRoot = null;
        controlsDismissed = true;
        removedControls.remove();
    }

    function handlePreviewControlChange(event) {
        if (!event || !event.target || event.target.tagName === 'BUTTON') return;
        applyOptions(readControlValues());
    }

    function setControlValues(value) {
        setControlValue('preview-update-state', value.updateState);
        setControlValue('preview-provider', value.provider);
        setControlValue('preview-lmstudio-state', value.lmStudioState);
        setControlValue('preview-concurrency', value.concurrency);
        setControlValue('preview-model-author', value.modelAuthor);
        setControlValue('preview-model-name', value.modelName);
        setControlValue('preview-quantization', value.quantization);
        setControlValue('preview-record-preset', value.recordPreset);
        setControlValue('preview-hook-preset', value.hookPreset);
        setControlValue('preview-runtime-preset', value.runtimePreset);
        setControlChecked('preview-draw-capture', value.drawCapture);
        setControlChecked('preview-foresight', value.foresight);
        setControlChecked('preview-spoilers', value.showSpoilers);
    }

    function readControlValues() {
        return normalizeOptions({
            updateState: getControlValue('preview-update-state'),
            provider: getControlValue('preview-provider'),
            lmStudioState: getControlValue('preview-lmstudio-state'),
            concurrency: getControlValue('preview-concurrency'),
            modelAuthor: getControlValue('preview-model-author'),
            modelName: getControlValue('preview-model-name'),
            quantization: getControlValue('preview-quantization'),
            recordPreset: getControlValue('preview-record-preset'),
            hookPreset: getControlValue('preview-hook-preset'),
            runtimePreset: getControlValue('preview-runtime-preset'),
            drawCapture: getControlChecked('preview-draw-capture'),
            foresight: getControlChecked('preview-foresight'),
            showSpoilers: getControlChecked('preview-spoilers'),
        });
    }

    function getControl(id) {
        return controlsRoot ? controlsRoot.querySelector(`#${id}`) : null;
    }

    function getControlValue(id) {
        const control = getControl(id);
        return control ? control.value : '';
    }

    function setControlValue(id, value) {
        const control = getControl(id);
        if (control) control.value = String(value === undefined || value === null ? '' : value);
    }

    function getControlChecked(id) {
        const control = getControl(id);
        return control ? control.checked === true : false;
    }

    function setControlChecked(id, value) {
        const control = getControl(id);
        if (control) control.checked = value === true;
    }

    function setPreviewStatus(message) {
        const status = getControl('preview-status');
        if (status) status.textContent = message;
    }

    function beforeBoot() {
        if (!isEnabled()) return;
        options = loadOptions();
        gameWindow = createPreviewGameWindow(options);
        if (document.body && document.body.classList) {
            document.body.classList.add('gui-preview-mode');
        }
    }

    function afterBoot() {
        if (!isEnabled()) return;
        setPreviewStatus('Preview data loaded.');
    }

    function getGameWindow() {
        if (!isEnabled()) return null;
        if (!gameWindow) gameWindow = createPreviewGameWindow(loadOptions());
        return gameWindow;
    }

    function applyOptions(nextOptions) {
        options = normalizeOptions(nextOptions);
        saveOptions(options);
        gameWindow = createPreviewGameWindow(options);
        resetPreviewFoldDefaults();
        refreshPreviewRuntimeContext();
        refreshPreviewConfigSummary();
        refreshPreviewVersionPanel();
        refreshRuntimeFeed();
        renderRuntimePanelsForFeed(refreshGuiPolicySnapshot(), { force: true });
        updateHeartbeat();
        setPreviewStatus('Preview data updated.');
    }

    function resetPreviewFoldDefaults() {
        if (typeof resetFoldedPanelDefaults === 'function') {
            resetFoldedPanelDefaults();
            return;
        }
        state.panelDefaultKeys = {};
    }

    function refreshPreviewRuntimeContext() {
        const context = createPreviewRuntimeContext(options || loadOptions());
        state.supportPath = context.supportPath;
        state.gameRoot = context.gameRoot;
        state.translationCacheFile = context.translationCacheFile;
        state.runtimeContext = context;

        const policySnapshot = refreshGuiPolicySnapshot();
        const contextPolicy = getGuiEffectivePolicy(policySnapshot).runtimeContext;

        setText('game-root', state.gameRoot || '-');
        setStatus('game-root-status', contextPolicy.gameRootTone, contextPolicy.gameRootText);
        setText('support-path', state.supportPath || '-');
        setStatus('support-path-status', contextPolicy.supportPathTone, contextPolicy.supportPathText);
        setStatus('main-window-link', contextPolicy.closeWithGameTone, contextPolicy.closeWithGameText);
        setSummaryStatus('runtime-context-summary', contextPolicy.summaryTone, contextPolicy.summaryText);
        renderDiagnosticsSummary();
    }

    function refreshPreviewConfigSummary() {
        const current = options || loadOptions();
        rememberSettings(createPreviewSettings(current), 'preview controls');
        state.provider = getPreviewProviderLabel(current.provider);
        state.translatorProvider = current.provider;
        state.translatorConfigError = '';
        state.cacheEntries = current.recordPreset === 'empty' ? '0' : '142';
        refreshGuiPolicySnapshot();
    }

    function getPreviewProviderLabel(provider) {
        if (provider === 'local') return 'LM Studio preview';
        if (provider === 'deepl') return 'DeepL preview';
        if (provider === 'mocktranslator') return 'Mock preview';
        if (provider === 'none') return 'None';
        return 'unknown';
    }

    function refreshPreviewVersionPanel() {
        applyPreviewVersionState(options || loadOptions());
        renderVersionPanel();
    }

    function createPreviewRuntimeContext(value) {
        const preset = value.runtimePreset;
        const supportPathReady = preset !== 'missing-support';
        const closeWithGame = preset !== 'unlinked';
        return {
            supportPath: supportPathReady ? 'preview/support' : '',
            gameRoot: 'preview/game-root',
            translationCacheFile: 'preview/support/translation-cache.log',
            gameRootReady: true,
            supportPathReady,
            closeWithGame,
            ready: supportPathReady && closeWithGame,
        };
    }

    function applyPreviewVersionState(value) {
        state.checkUpdates = value.updateState !== 'disabled';
        state.updateCheckError = '';
        state.updateCheckInFlight = false;
        state.installedVersionDisplay = '';
        state.installedVersionDisplaySource = '';
        if (value.updateState === 'latest') {
            state.installedVersion = '0.0.0b2';
            state.latestVersion = '';
            setVersionStatus('latest', 'Current version');
            return;
        }
        if (value.updateState === 'checking') {
            state.installedVersion = '0.0.0b1';
            state.latestVersion = '';
            state.updateCheckInFlight = true;
            setVersionStatus('checking', 'Checking for updates');
            return;
        }
        if (value.updateState === 'error') {
            state.installedVersion = '0.0.0b1';
            state.latestVersion = '';
            setVersionStatus('error', 'Update check failed', 'Preview update service error');
            return;
        }
        if (value.updateState === 'disabled') {
            state.installedVersion = '0.0.0b1';
            state.latestVersion = '';
            setVersionStatus('disabled', 'Update checks disabled');
            return;
        }
        if (value.updateState === 'missing') {
            state.installedVersion = '';
            state.latestVersion = '';
            setVersionStatus('missing', 'Version info error');
            return;
        }
        state.installedVersion = '0.0.0b1';
        state.latestVersion = '0.0.0b2';
        setVersionStatus('update', 'Update available (0.0.0b2)');
    }

    function createPreviewGameWindow(value) {
        const current = normalizeOptions(value);
        const hookSnapshot = createPreviewHookSnapshot(current);
        const windowState = {
            closed: false,
            LiveTranslatorSettings: createPreviewSettings(current),
            LiveTranslatorHookInstallSnapshot: hookSnapshot,
            LiveTranslatorHookInstallResults: hookSnapshot.results,
            LiveTranslatorHookInstallSummary: hookSnapshot.summary,
            LiveTranslatorTextOrchestratorIntel: {
                getSnapshot(request) {
                    return createPreviewTextSnapshot(current, request);
                },
                snapshot(request) {
                    return createPreviewTextSnapshot(current, request);
                },
                publish() {},
                clearIntel() {},
            },
            LiveTranslatorTranslationIntel: {
                getSnapshot(request) {
                    return createPreviewTranslationIntelSnapshot(current, request);
                },
                snapshot(request) {
                    return createPreviewTranslationIntelSnapshot(current, request);
                },
                publish() {},
                clearIntel() {},
                clearSnapshot() {},
            },
            LiveTranslatorForesightIntel: {
                getSnapshot(request) {
                    return createPreviewForesightSnapshot(current, request);
                },
                snapshot(request) {
                    return createPreviewForesightSnapshot(current, request);
                },
                publish() {},
                clearDiagnostics() {},
                clearSnapshot() {},
            },
            LiveTranslatorDrawCaptureTraceSnapshot: createPreviewDrawCaptureSnapshot(current),
            LiveTranslatorDrawCaptureTrace: {
                getSnapshot() {
                    return createPreviewDrawCaptureSnapshot(current);
                },
                snapshot() {
                    return createPreviewDrawCaptureSnapshot(current);
                },
                publish() {},
                clearIntel() {},
                clearSnapshot() {},
            },
            LiveTranslatorGuiState: {
                translatorOpen: true,
                updatedAt: Date.now(),
            },
        };
        return windowState;
    }

    function createPreviewSettings(value) {
        return {
            checkUpdates: false,
            enableForesight: value.foresight === true,
            showForesightSpoilers: value.showSpoilers === true,
            intel: {
                captureWhenGuiClosed: true,
                limits: {
                    foresightScans: 5,
                    foresightMessages: 5,
                    archivedItems: 40,
                    detachedItems: 40,
                    pastJobs: 20,
                },
            },
            diagnostics: {
                enabled: value.drawCapture === true,
                drawCaptureTrace: {
                    enabled: value.drawCapture === true,
                    recordCjk: true,
                    recordAll: true,
                    limit: 40,
                },
            },
        };
    }

    function createPreviewHookSnapshot(value) {
        const now = Date.now();
        let results = [
            createPreviewHook('game-message', 'Game Message', 'installed', 'Window_Message wrappers installed.', now),
            createPreviewHook('window-text', 'Window Text', 'installed', 'Window drawText wrappers installed.', now),
            createPreviewHook('sprite-text', 'Sprite Text', 'installed', 'Sprite text observer installed.', now),
            createPreviewHook('pixi-text', 'PIXI Text', 'installed', 'PIXI text observer installed.', now),
        ];
        if (value.hookPreset === 'skipped') {
            results = results.concat(createPreviewHook('bitmap-text', 'Bitmap Text', 'skipped', 'Adapter disabled by runtime policy.', now));
        } else if (value.hookPreset === 'failed') {
            results = results.map((entry) => entry.name === 'sprite-text'
                ? Object.assign({}, entry, { status: 'failed', reason: 'Preview hook install failure.' })
                : entry);
        } else if (value.hookPreset === 'empty') {
            results = [];
        }
        return {
            updatedAt: now,
            results,
            summary: summarizeHookResults(results),
        };
    }

    function createPreviewHook(name, displayName, status, reason, timestamp) {
        return { name, displayName, status, reason, timestamp };
    }

    function createPreviewTextSnapshot(value, request) {
        const records = createPreviewTextRecords(value);
        return {
            updatedAt: Date.now(),
            intelSurface: true,
            active: records.active,
            detached: records.detached,
            archived: records.archived,
        };
    }

    function createPreviewTextRecords(value) {
        if (value.recordPreset === 'empty') {
            return { active: [], detached: [], archived: [] };
        }
        const now = Date.now();
        const active = [
            createPreviewTextRecord('message-active', 'message', 'active', {
                original: 'Good morning, traveler.',
                translation: 'Good morning, traveler.',
                status: 'completed',
                priority: 100,
                metadata: { windowType: 'Window_Message', methodName: 'drawTextEx', x: 32, y: 448 },
            }, now - 9000),
            createPreviewTextRecord('choice-active', 'choice', 'active', {
                original: 'Ask about the crystal',
                translation: 'Ask about the crystal',
                status: 'translating',
                priority: 80,
                metadata: { windowType: 'Window_ChoiceList', methodName: 'drawItem', x: 48, y: 516 },
            }, now - 5000),
            createPreviewTextRecord('hud-active', 'window', 'active', {
                original: 'Gold: 1245',
                translation: '',
                status: 'skipped',
                priority: 20,
                metadata: { windowType: 'Window_Gold', methodName: 'drawText', x: 654, y: 540 },
            }, now - 2800),
        ];
        const detached = [
            createPreviewTextRecord('detached-help', 'window', 'detached', {
                original: 'Press Enter to continue',
                translation: 'Press Enter to continue',
                status: 'completed',
                priority: 40,
                metadata: { windowType: 'Window_Help', methodName: 'drawTextEx', x: 24, y: 24 },
                disappearedAt: now - 16000,
            }, now - 32000),
        ];
        const archived = [
            createPreviewTextRecord('archived-name', 'message', 'archived', {
                original: 'Village Elder',
                translation: 'Village Elder',
                status: 'completed',
                priority: 60,
                metadata: { windowType: 'Window_NameBox', methodName: 'drawText', x: 42, y: 388 },
                disappearedAt: now - 68000,
            }, now - 94000),
        ];

        if (value.recordPreset === 'busy') {
            active.push(
                createPreviewTextRecord('message-future', 'message', 'active', {
                    original: 'The bridge will open after sunset.',
                    translation: 'The bridge will open after sunset.',
                    status: 'pending',
                    priority: 95,
                    metadata: {
                        windowType: 'Window_Message',
                        methodName: 'drawTextEx',
                        foresight: true,
                        foresightConsumed: false,
                    },
                }, now - 2200),
                createPreviewTextRecord('sprite-label', 'sprite', 'active', {
                    original: 'North Gate',
                    translation: 'North Gate',
                    status: 'completed',
                    priority: 50,
                    metadata: { ownerType: 'Sprite_Label', methodName: 'PIXI.Text', x: 412, y: 82 },
                }, now - 1200)
            );
            detached.push(
                createPreviewTextRecord('detached-shop', 'choice', 'detached', {
                    original: 'Buy',
                    translation: 'Buy',
                    status: 'completed',
                    priority: 55,
                    metadata: { windowType: 'Window_ShopCommand', methodName: 'drawItem' },
                    disappearedAt: now - 25000,
                }, now - 42000),
                createPreviewTextRecord('detached-cancel', 'choice', 'detached', {
                    original: 'Cancel',
                    translation: 'Cancel',
                    status: 'completed',
                    priority: 45,
                    metadata: { windowType: 'Window_ShopCommand', methodName: 'drawItem' },
                    disappearedAt: now - 25000,
                }, now - 42000)
            );
            archived.push(
                createPreviewTextRecord('archived-zone', 'pixi', 'archived', {
                    original: 'Crystal Cave',
                    translation: 'Crystal Cave',
                    status: 'completed',
                    priority: 50,
                    metadata: { ownerType: 'PIXI.Text', methodName: 'set text' },
                    disappearedAt: now - 125000,
                }, now - 160000)
            );
        }

        return { active, detached, archived };
    }

    function createPreviewTextRecord(id, hook, lifecycle, fields, seenAt) {
        const now = Date.now();
        const source = Object.assign({
            original: '',
            translation: '',
            status: 'detected',
            priority: 50,
            metadata: {},
        }, fields || {});
        const history = [
            {
                at: seenAt,
                type: 'item.detected',
                status: source.status,
                message: 'Preview record detected.',
                details: {
                    priority: source.priority,
                    policy: {
                        lifecycleIntent: lifecycle,
                        priorityAction: 'set',
                        priority: source.priority,
                        reason: 'preview sample',
                    },
                },
            },
        ];
        if (source.translation) {
            history.push({
                at: Math.min(now, seenAt + 900),
                type: 'translation.completed',
                status: 'completed',
                message: 'Preview translation completed.',
                details: {
                    priority: source.priority,
                    stream: hook === 'message',
                },
            });
        }
        return {
            id,
            hook,
            sourceAdapter: hook,
            original: source.original,
            rawText: source.original,
            visibleText: source.original,
            translationSource: source.original,
            normalizedSource: source.original,
            translatedText: source.translation,
            translation: source.translation,
            translationReceived: source.translation,
            translationDrawn: source.translation,
            status: source.status,
            active: lifecycle === 'active',
            visible: lifecycle === 'active',
            screenState: lifecycle === 'active' ? 'visible' : 'hidden',
            priority: source.priority,
            seenAt,
            lastSeenAt: seenAt,
            updatedAt: now,
            disappearedAt: source.disappearedAt || null,
            deactivatedAt: source.disappearedAt || null,
            metadata: source.metadata,
            history,
        };
    }

    function createPreviewTranslationIntelSnapshot(value, request) {
        const now = Date.now();
        const capacity = value.lmStudioState === 'pending'
            ? 0
            : clampInteger(value.concurrency, 0, 12, DEFAULT_OPTIONS.concurrency);
        const running = capacity > 0 ? Math.min(capacity, value.recordPreset === 'busy' ? 3 : 1) : 0;
        const queued = value.recordPreset === 'busy' ? 4 : (value.recordPreset === 'empty' ? 0 : 1);
        const jobs = createPreviewDiagnosticJobs(value, now, running, queued);
        const provider = createPreviewDiagnosticProvider(value, now, capacity, running);
        return {
            updatedAt: now,
            provider,
            summary: {
                queued,
                running,
                jobs: jobs.running.length + jobs.queued.length,
                pastJobs: jobs.past.length,
                activeSubscribers: value.recordPreset === 'empty' ? 0 : activeSubscriberCount(value),
                subscribers: value.recordPreset === 'empty' ? 0 : activeSubscriberCount(value) + 1,
                streamJobs: running,
                streamRunning: running,
                completedCacheEntries: value.recordPreset === 'empty' ? 0 : 142,
                pumpScheduled: queued > 0,
                pumpRunning: running > 0,
            },
            cache: {
                completed: value.recordPreset === 'empty' ? 0 : 142,
                diskEnabled: true,
                precache: {
                    active: false,
                    records: 12,
                    translatedRecords: 9,
                    exactKeys: 18,
                },
            },
            jobs,
            priorityBuckets: [
                { name: 'active-message', queued: queued > 0 ? 1 : 0, running: running > 0 ? 1 : 0, stream: running > 0 ? 1 : 0, subscribers: 1 },
                { name: 'background', queued: Math.max(0, queued - 1), running: Math.max(0, running - 1), stream: 0, subscribers: 1 },
            ],
            hooks: [
                { name: 'message', queued: queued > 0 ? 1 : 0, running: running > 0 ? 1 : 0, stream: 1, subscribers: 1 },
                { name: 'choice', queued: Math.max(0, queued - 1), running: 0, stream: 0, subscribers: 1 },
            ],
            counters: {
                preview: true,
                translated: value.recordPreset === 'empty' ? 0 : 8,
            },
            events: [
                {
                    id: 'preview-intel-event',
                    at: now - 700,
                    type: 'scheduler.pump',
                    details: { capacity, running, queued },
                },
            ],
            intelSurface: true,
        };
    }

    function activeSubscriberCount(value) {
        return value.recordPreset === 'busy' ? 5 : 2;
    }

    function createPreviewDiagnosticProvider(value, now, capacity, running) {
        if (value.provider !== 'local') {
            return {
                kind: value.provider,
                capacity: value.provider === 'mocktranslator' ? 32 : 1,
                running: 0,
                available: value.provider === 'mocktranslator' ? 32 : 1,
                refreshingCapacity: false,
                lastCapacityRefreshAt: now - 12000,
            };
        }
        const hasSelectedModel = ['connected', 'api-error', 'unverified-concurrency'].includes(value.lmStudioState);
        const apiResponding = ['connected', 'api-error', 'unverified-concurrency', 'model-not-loaded', 'auto-many'].includes(value.lmStudioState);
        const capacityVerified = ['connected', 'api-error'].includes(value.lmStudioState);
        const selectionError = getPreviewLmStudioSelectionError(value);
        const catalogError = apiResponding ? '' : getPreviewLmStudioCapacityError(value);
        const modelKey = `${value.modelAuthor}/${value.modelName}`;
        const selectedVariant = value.quantization ? `${modelKey}@${value.quantization}` : modelKey;
        return {
            kind: 'local',
            apiResponding,
            modelCatalogAt: apiResponding ? now - 1200 : 0,
            modelCatalogError: catalogError,
            modelCount: apiResponding ? 1 : 0,
            loadedLlmInstanceCount: value.lmStudioState === 'auto-many'
                ? 2
                : (hasSelectedModel ? 1 : 0),
            modelSelectionReady: hasSelectedModel,
            modelSelectionError: selectionError,
            statusUpdatedAt: now - 1200,
            modelKey: hasSelectedModel ? modelKey : '',
            modelInstanceId: hasSelectedModel ? modelKey : '',
            modelAuthor: hasSelectedModel ? value.modelAuthor : '',
            modelName: hasSelectedModel ? value.modelName : '',
            quantization: hasSelectedModel ? value.quantization : '',
            selectedVariant: hasSelectedModel ? selectedVariant : '',
            capacity,
            capacityVerified,
            running,
            available: Math.max(0, capacity - running),
            refreshingCapacity: false,
            lastCapacityRefreshAt: now - 12000,
            lastCapacityRefreshError: selectionError || catalogError,
        };
    }

    function getPreviewLmStudioSelectionError(value) {
        if (value.lmStudioState === 'model-not-loaded') {
            return 'The LM Studio model in settings.json is "auto", but LM Studio currently has 0 loaded LLM instance(s): none. Load exactly one LLM instance or set the LM Studio model in settings.json to a specific loaded instance identifier.';
        }
        if (value.lmStudioState === 'auto-many') {
            return 'The LM Studio model in settings.json is "auto", but LM Studio currently has 2 loaded LLM instance(s): alpha, beta. Load exactly one LLM instance or set the LM Studio model in settings.json to a specific loaded instance identifier.';
        }
        return '';
    }

    function getPreviewLmStudioCapacityError(value) {
        if (value.lmStudioState === 'no-response') return 'Local LLM model list request failed: Failed to fetch';
        if (value.lmStudioState === 'cors') return 'Local LLM model list request failed: CORS request blocked by browser.';
        if (value.lmStudioState === 'timeout') return 'Translation request timed out after 5000ms.';
        return '';
    }

    function createPreviewDiagnosticJobs(value, now, runningCount, queuedCount) {
        const running = runningCount > 0 ? [
            createPreviewJob('job-message-active', 'running', 'message', 'Good morning, traveler.', 'message-active', now - 2400, 100, true),
        ] : [];
        if (runningCount > 1) {
            running.push(createPreviewJob('job-choice-active', 'running', 'choice', 'Ask about the crystal', 'choice-active', now - 1800, 80, false));
        }
        if (runningCount > 2) {
            running.push(createPreviewJob('job-message-future', 'running', 'message', 'The bridge will open after sunset.', 'message-future', now - 1200, 95, true));
        }

        const queued = [];
        for (let index = 0; index < queuedCount; index += 1) {
            queued.push(createPreviewJob(
                `job-queued-${index + 1}`,
                'queued',
                index === 0 ? 'message' : 'window',
                index === 0 ? 'Next message preview' : `Background label ${index}`,
                index === 0 ? 'message-future' : '',
                now - (index + 1) * 900,
                Math.max(10, 75 - index * 10),
                index === 0
            ));
        }

        const past = value.recordPreset === 'empty' ? [] : [
            Object.assign(
                createPreviewJob('job-archived-name', 'completed', 'message', 'Village Elder', 'archived-name', now - 82000, 60, true),
                { terminalAt: now - 80000, terminalReason: 'completed' }
            ),
        ];
        if (value.provider === 'local' && value.lmStudioState === 'api-error') {
            past.unshift(Object.assign(
                createPreviewJob('job-lmstudio-error', 'failed', 'message', 'Good morning, traveler.', 'message-active', now - 2200, 100, true),
                {
                    terminalAt: now - 900,
                    terminalReason: 'failed',
                    lastError: 'Local LLM error: 500 Internal Server Error',
                }
            ));
        }

        return { running, queued, past };
    }

    function createPreviewJob(id, status, hook, textPreview, recordId, at, priority, stream) {
        return {
            id,
            status,
            hook,
            source: hook,
            textPreview,
            textLength: textPreview.length,
            createdAt: at - 500,
            queuedAt: at - 500,
            startedAt: status === 'running' || status === 'completed' ? at : null,
            queuePosition: status === 'queued' ? 1 : null,
            effectivePriority: priority,
            priorityBucket: priority >= 90 ? 'active-message' : 'background',
            stream: stream === true,
            timeoutMs: 45000,
            attempt: 1,
            retryCount: 0,
            lastError: '',
            lastDeltaAt: status === 'running' ? Date.now() - 500 : null,
            deltaCount: status === 'running' && stream ? 4 : 0,
            subscribers: recordId ? 1 : 0,
            totalSubscribers: recordId ? 1 : 0,
            subscriberRecords: recordId ? [{ id: `${id}-sub`, status, recordId, hook, priority, stream }] : [],
            history: [
                {
                    id: `${id}-event`,
                    at,
                    type: `job.${status}`,
                    hook,
                    jobId: id,
                    recordId,
                    details: { jobId: id, recordId, priority, effectivePriority: priority, textPreview },
                },
            ],
        };
    }

    function createPreviewDrawCaptureSnapshot(value) {
        if (value.drawCapture !== true) return null;
        const now = Date.now();
        return {
            updatedAt: now,
            enabled: true,
            limit: 40,
            size: 4,
            sequence: 4,
            filters: { preview: true },
            summary: { events: 4 },
            events: [
                createPreviewDrawEvent(1, now - 4800, 'capture', 'Good morning, traveler.', 'message', 'recorded'),
                createPreviewDrawEvent(2, now - 3500, 'classify', 'Ask about the crystal', 'choice', 'recorded'),
                createPreviewDrawEvent(3, now - 2100, 'skip', 'Gold: 1245', 'window', 'numeric-ui'),
                createPreviewDrawEvent(4, now - 900, 'capture', 'North Gate', 'sprite', 'recorded'),
            ],
        };
    }

    function createPreviewDrawEvent(seq, at, stage, text, adapter, status) {
        return {
            seq,
            at,
            stage,
            adapter,
            methodName: adapter === 'sprite' ? 'PIXI.Text' : 'drawTextEx',
            rawText: text,
            visibleText: text,
            normalizedText: text,
            reason: status,
            status,
            windowType: adapter === 'choice' ? 'Window_ChoiceList' : 'Window_Message',
            x: 32 + seq * 12,
            y: 420 + seq * 24,
        };
    }

    function createPreviewForesightSnapshot(value, request) {
        if (value.foresight !== true) return null;
        const now = Date.now();
        return {
            updatedAt: now,
            summary: { scans: 1, messages: value.recordPreset === 'busy' ? 3 : 2 },
            recent: [
                {
                    at: now - 1400,
                    interpreterId: 'preview-map',
                    status: value.recordPreset === 'busy' ? 'blocked' : 'scanned',
                    matchedCurrentMessage: true,
                    startIndex: 10,
                    stopIndex: value.recordPreset === 'busy' ? 28 : 18,
                    stopReason: value.recordPreset === 'busy' ? 'control-flow-target' : 'event-end',
                    stopReasonLabel: value.recordPreset === 'busy'
                        ? 'Stopped before an unresolved control-flow target.'
                        : 'Reached the end of the event list.',
                    budget: { before: { remaining: 30 }, after: { remaining: 24 }, cost: 6 },
                    scannedCommands: value.recordPreset === 'busy' ? 14 : 8,
                    advancedCommands: value.recordPreset === 'busy' ? 9 : 5,
                    staleRiskCommands: 1,
                    blocks: value.recordPreset === 'busy' ? 3 : 2,
                    routeCommands: 0,
                    routeBarriers: 0,
                    pathStops: [],
                    commandActionLimit: 150,
                    commandActionsTruncated: 0,
                    commandActions: createPreviewForesightActions(value),
                },
            ],
            intelSurface: true,
        };
    }

    function createPreviewForesightActions(value) {
        const actions = [
            createPreviewForesightAction(10, 101, 'Show Text', 'linear', 'Good morning, traveler.'),
            createPreviewForesightAction(11, 102, 'Show Choices', 'branching', 'Ask about the crystal'),
            createPreviewForesightAction(14, 101, 'Show Text', 'linear', 'The bridge will open after sunset.'),
        ];
        if (value.recordPreset === 'busy') {
            actions.push(
                createPreviewForesightAction(18, 111, 'Conditional Branch', 'branching', 'Check switch 12'),
                createPreviewForesightAction(22, 101, 'Show Text', 'linear', 'Come back after sunset.'),
                createPreviewForesightAction(28, 119, 'Jump to Label', 'branching', 'LoopStart')
            );
        }
        return actions;
    }

    function createPreviewForesightAction(index, code, label, classification, summary) {
        const messageAction = Number(code) === 101;
        return {
            index,
            code,
            label,
            classification,
            native: true,
            category: messageAction ? 'message' : 'flow',
            scanBehavior: messageAction ? 'message' : 'advance',
            action: messageAction ? 'message' : 'advance',
            summary,
            budget: { before: { remaining: 30 }, after: { remaining: 29 }, cost: 1 },
            branchDepth: classification === 'branching' ? 1 : 0,
            branchPath: [],
            listContext: { listId: 'preview-map', interpreterId: 'preview-map' },
        };
    }

    function loadOptions() {
        let stored = {};
        try {
            if (root.localStorage) {
                stored = JSON.parse(root.localStorage.getItem(STORAGE_KEY) || '{}') || {};
            }
        } catch (_) {
            stored = {};
        }
        return normalizeOptions(Object.assign({}, DEFAULT_OPTIONS, stored));
    }

    function saveOptions(value) {
        try {
            if (root.localStorage) {
                root.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
            }
        } catch (_) {}
    }

    function normalizeOptions(value) {
        const source = value && typeof value === 'object' ? value : {};
        return {
            updateState: pickOption(source.updateState, ['outdated', 'latest', 'checking', 'error', 'disabled', 'missing'], DEFAULT_OPTIONS.updateState),
            provider: pickOption(source.provider, ['local', 'deepl', 'mocktranslator', 'none'], DEFAULT_OPTIONS.provider),
            lmStudioState: pickOption(source.lmStudioState, ['connected', 'pending', 'unverified-concurrency', 'no-response', 'cors', 'timeout', 'model-not-loaded', 'auto-many', 'api-error'], DEFAULT_OPTIONS.lmStudioState),
            concurrency: clampInteger(source.concurrency, 0, 12, DEFAULT_OPTIONS.concurrency),
            modelAuthor: normalizePreviewText(source.modelAuthor, DEFAULT_OPTIONS.modelAuthor, 48),
            modelName: normalizePreviewText(source.modelName, DEFAULT_OPTIONS.modelName, 96),
            quantization: normalizePreviewText(source.quantization, DEFAULT_OPTIONS.quantization, 32),
            recordPreset: pickOption(source.recordPreset, ['normal', 'busy', 'empty'], DEFAULT_OPTIONS.recordPreset),
            hookPreset: pickOption(source.hookPreset, ['ready', 'skipped', 'failed', 'empty'], DEFAULT_OPTIONS.hookPreset),
            runtimePreset: pickOption(source.runtimePreset, ['ready', 'unlinked', 'missing-support'], DEFAULT_OPTIONS.runtimePreset),
            drawCapture: source.drawCapture !== false,
            foresight: source.foresight !== false,
            showSpoilers: source.showSpoilers === true,
        };
    }

    function pickOption(value, allowed, fallback) {
        const text = String(value || '');
        return allowed.includes(text) ? text : fallback;
    }

    function normalizePreviewText(value, fallback, maxLength) {
        const text = String(value || '').replace(/\s+/gu, ' ').trim();
        return (text || fallback).slice(0, maxLength);
    }

    function clampInteger(value, min, max, fallback) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return fallback;
        return Math.min(max, Math.max(min, Math.round(numeric)));
    }

    const api = {
        isEnabled,
        installControls,
        beforeBoot,
        afterBoot,
        getGameWindow,
        refreshRuntimeContext: refreshPreviewRuntimeContext,
        refreshConfigSummary: refreshPreviewConfigSummary,
        refreshVersionPanel: refreshPreviewVersionPanel,
        applyOptions,
        getOptions() {
            return Object.assign({}, options || loadOptions());
        },
    };
    root.LiveTranslatorGuiPreview = api;
    if (typeof globalThis !== 'undefined') {
        globalThis.LiveTranslatorGuiPreview = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
