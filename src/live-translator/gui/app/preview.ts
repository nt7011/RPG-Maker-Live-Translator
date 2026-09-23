import { DEFAULT_FORESIGHT_SETTINGS } from '../../configuration/foresight.js';
import { rememberSettings, renderStatusSummary, setStatus, setSummaryStatus, setText, updateHeartbeat, } from './core.js';
import { resetFoldedPanelDefaults } from './core.js';
import { getGuiEffectivePolicy, refreshGuiPolicySnapshot } from './policy.js';
import { refreshRuntimeFeed, renderRuntimePanelsForFeed } from './panels/render.js';
import { normalizeHookFeedResult, summarizeHookResults } from './runtime/records.js';
import { readProviderStatusSnapshot } from './runtime/provider-status.js';
import { basicPresentation } from './text-records/presentation.js';
import type { RuntimeTextRecordSnapshot, SemanticControl } from '../../runtime/text-record-types.js';
import type { TranslationStatusSnapshot } from '../../runtime/translation-status-types.js';
import { state } from './state.js';
import { publishGuiTextRecordsSink } from './runtime/current-translations.js';
import type { TextRecordsSnapshot } from '../../runtime/text-record-types.js';
import type { ForesightView } from '../../foresight/view.js';
import type { GuiRuntimeContext, UnknownRecord } from './types.js';
import { falsyFallback, isGuiHtmlElement, isUnknownRecord, propertyValue, stringValue } from './types.js';
import { renderVersionPanel, setVersionStatus } from './version/controller.js';
type PreviewUpdateState = 'outdated' | 'latest' | 'checking' | 'error' | 'disabled' | 'missing';
type PreviewProvider = 'llamacpp' | 'lmstudio' | 'mocktranslator' | 'none';
type PreviewLocalLlmState = 'connected' | 'pending' | 'unverified-concurrency' | 'no-response' | 'cors' | 'timeout' | 'model-not-loaded' | 'auto-many' | 'api-error';
type PreviewRecordPreset = 'normal' | 'busy' | 'empty';
type PreviewHookPreset = 'ready' | 'skipped' | 'failed' | 'empty';
type PreviewRuntimePreset = 'ready' | 'unlinked' | 'missing-support';
interface PreviewOptions {
    updateState: PreviewUpdateState;
    provider: PreviewProvider;
    localLlmState: PreviewLocalLlmState;
    concurrency: number;
    modelAuthor: string;
    modelName: string;
    quantization: string;
    recordPreset: PreviewRecordPreset;
    hookPreset: PreviewHookPreset;
    runtimePreset: PreviewRuntimePreset;
    drawCapture: boolean;
    foresight: boolean;
    showSpoilers: boolean;
}
interface PreviewTextRecordFields {
    original: string;
    translation: string;
    state: RuntimeTextRecordSnapshot['state'];
    semanticControl: SemanticControl;
    priority: number;
    metadata: UnknownRecord;
    disappearedAt?: number;
}
interface PreviewHookResult {
    category: string;
    name: string;
    displayName: string;
    status: string;
    reason: string;
    timestamp: number;
}
interface PreviewRuntimeContext extends GuiRuntimeContext {
    supportPath: string;
    gameRoot: string;
    translationCacheFile: string;
    gameRootReady: boolean;
    supportPathReady: boolean;
    closeWithGame: boolean;
    ready: boolean;
}
function createTranslatorGuiPreview(root: typeof globalThis) {
    const STORAGE_KEY = 'rmlt.translatorGui.preview';
    const DEFAULT_OPTIONS: PreviewOptions = {
        updateState: 'outdated',
        provider: 'llamacpp',
        localLlmState: 'connected',
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
    let options: PreviewOptions | null = null;
    let gameWindow: UnknownRecord | null = null;
    let controlsRoot: HTMLElement | null = null;
    let controlsDismissed = false;
    let providerSequence = 0;
    let currentRecords: ReturnType<typeof publishGuiTextRecordsSink> | null = null;
    let recordSequence = 0;
    function ignorePreviewLifecycleSignal(): void {
    }
    function isEnabled(): boolean {
        const params = getSearchParams();
        return params.get('preview') === '1';
    }
    function getSearchParams(): URLSearchParams {
        try {
            return new URL(root.location.href).searchParams;
        }
        catch {
            return new URLSearchParams();
        }
    }
    function installControls(): void {
        if (controlsRoot || controlsDismissed)
            return;
        options = loadOptions();
        const main = document.querySelector('main');
        if (!main)
            return;
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
            '<option value="llamacpp">llama.cpp</option>',
            '<option value="lmstudio">LM Studio</option>',
            '<option value="mocktranslator">Mock</option>',
            '<option value="none">None</option>',
            '</select></label>',
            '<label class="preview-field" for="preview-local-llm-state"><span>Local LLM</span><select id="preview-local-llm-state">',
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
        const body = propertyValue(document, 'body');
        if (isGuiHtmlElement(body))
            body.classList.add('gui-preview-mode');
    }
    function bindPreviewControls(): void {
        if (!controlsRoot)
            return;
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
        if (closeButton)
            closeButton.addEventListener('click', dismissPreviewControls);
    }
    function dismissPreviewControls(): void {
        if (!controlsRoot)
            return;
        const removedControls = controlsRoot;
        controlsRoot = null;
        controlsDismissed = true;
        removedControls.remove();
    }
    function handlePreviewControlChange(event: Event): void {
        if (!event.target || propertyValue(event.target, 'tagName') === 'BUTTON')
            return;
        applyOptions(readControlValues());
    }
    function setControlValues(value: PreviewOptions): void {
        setControlValue('preview-update-state', value.updateState);
        setControlValue('preview-provider', value.provider);
        setControlValue('preview-local-llm-state', value.localLlmState);
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
    function readControlValues(): PreviewOptions {
        return normalizeOptions({
            updateState: getControlValue('preview-update-state'),
            provider: getControlValue('preview-provider'),
            localLlmState: getControlValue('preview-local-llm-state'),
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
    function getControl(id: string): HTMLElement | null {
        const control = controlsRoot?.querySelector(`#${id}`);
        return isGuiHtmlElement(control) ? control : null;
    }
    function getControlValue(id: string): unknown {
        const control = getControl(id);
        return falsyFallback(propertyValue(control, 'value'), '');
    }
    function setControlValue(id: string, value: unknown): void {
        const control = getControl(id);
        if (control)
            Reflect.set(control, 'value', stringValue(value ?? ''));
    }
    function getControlChecked(id: string): boolean {
        const control = getControl(id);
        return propertyValue(control, 'checked') === true;
    }
    function setControlChecked(id: string, value: unknown): void {
        const control = getControl(id);
        if (control)
            Reflect.set(control, 'checked', value === true);
    }
    function setPreviewStatus(message: string): void {
        const status = getControl('preview-status');
        if (status)
            status.textContent = message;
    }
    function beforeBoot(): void {
        options = loadOptions();
        gameWindow = createPreviewGameWindow(options);
        const body = propertyValue(document, 'body');
        if (isGuiHtmlElement(body))
            body.classList.add('gui-preview-mode');
    }
    function afterBoot(): void {
        refreshPreviewCurrentRecords();
        setPreviewStatus('Preview data loaded.');
    }
    function getGameWindow(): UnknownRecord | null {
        gameWindow ??= createPreviewGameWindow(loadOptions());
        return gameWindow;
    }
    function applyOptions(nextOptions: unknown): void {
        options = normalizeOptions(nextOptions);
        saveOptions(options);
        gameWindow = createPreviewGameWindow(options);
        resetPreviewFoldDefaults();
        refreshPreviewRuntimeContext();
        refreshPreviewConfigSummary();
        refreshPreviewVersionPanel();
        refreshRuntimeFeed(getGameWindow());
        refreshPreviewCurrentRecords();
        renderRuntimePanelsForFeed(refreshGuiPolicySnapshot(), { force: true });
        updateHeartbeat();
        setPreviewStatus('Preview data updated.');
    }
    function resetPreviewFoldDefaults(): void {
        resetFoldedPanelDefaults();
    }
    function refreshPreviewRuntimeContext(): void {
        const context = createPreviewRuntimeContext(options ?? loadOptions());
        state.supportPath = context.supportPath;
        state.gameRoot = context.gameRoot;
        state.translationCacheFile = context.translationCacheFile;
        state.runtimeContext = context;
        const policySnapshot = refreshGuiPolicySnapshot();
        const contextPolicy = getGuiEffectivePolicy(policySnapshot).runtimeContext;
        setText('game-root', falsyFallback(state.gameRoot, '-'));
        setStatus('game-root-status', contextPolicy.gameRootTone, contextPolicy.gameRootText);
        setText('support-path', falsyFallback(state.supportPath, '-'));
        setStatus('support-path-status', contextPolicy.supportPathTone, contextPolicy.supportPathText);
        setStatus('main-window-link', contextPolicy.closeWithGameTone, contextPolicy.closeWithGameText);
        setSummaryStatus('runtime-context-summary', contextPolicy.summaryTone, contextPolicy.summaryText);
        renderStatusSummary();
    }
    function refreshPreviewConfigSummary(): void {
        const current = options ?? loadOptions();
        rememberSettings(createPreviewSettings(current), 'preview controls');
        state.provider = getPreviewProviderLabel(current.provider);
        state.translatorProvider = current.provider;
        state.translatorConfigError = '';
        state.providerStatus = readProviderStatusSnapshot(createPreviewProviderStatus(current));
        refreshGuiPolicySnapshot();
    }
    function getPreviewProviderLabel(provider: PreviewProvider): string {
        if (provider === 'llamacpp')
            return 'llama.cpp preview';
        if (provider === 'lmstudio')
            return 'LM Studio preview';
        if (provider === 'mocktranslator')
            return 'Mock preview';
        return 'None';
    }
    function refreshPreviewVersionPanel(): void {
        applyPreviewVersionState(options ?? loadOptions());
        renderVersionPanel();
    }
    function createPreviewRuntimeContext(value: PreviewOptions): PreviewRuntimeContext {
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
    function applyPreviewVersionState(value: PreviewOptions): void {
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
    function createPreviewGameWindow(value: unknown): UnknownRecord {
        const current = normalizeOptions(value);
        const hookSnapshot = createPreviewHookSnapshot(current);
        const windowState = {
            closed: false,
            LiveTranslatorSettings: createPreviewSettings(current),
            LiveTranslatorHookInstallSnapshot: hookSnapshot,
            LiveTranslatorHookInstallResults: hookSnapshot.results,
            LiveTranslatorHookInstallSummary: hookSnapshot.summary,
            LiveTranslatorTextCoreStatus: {
                getSnapshot() {
                    return createPreviewTextStatus(current);
                },
            },
            LiveTranslatorDrawCaptureTraceSnapshot: createPreviewDrawCaptureSnapshot(current),
            LiveTranslatorDrawCaptureTrace: {
                getSnapshot() {
                    return createPreviewDrawCaptureSnapshot(current);
                },
                snapshot() {
                    return createPreviewDrawCaptureSnapshot(current);
                },
                publish: ignorePreviewLifecycleSignal,
                clearDiagnostics: ignorePreviewLifecycleSignal,
                clearSnapshot: ignorePreviewLifecycleSignal,
            },
            LiveTranslatorGuiState: {
                translatorOpen: true,
                updatedAt: Date.now(),
            },
        };
        return windowState;
    }
    function createPreviewSettings(value: PreviewOptions): UnknownRecord {
        return {
            gui: {
                checkUpdates: false,
            },
            foresight: { ...DEFAULT_FORESIGHT_SETTINGS, showSpoilers: value.showSpoilers },
            adapters: { window: true, gameMessage: true, foresight: value.foresight },
            diagnostics: {
                enabled: value.drawCapture,
                captureWhenGuiClosed: true,
                limits: {
                    archivedItems: 40,
                    detachedItems: 40,
                    pastJobs: 20,
                },
                guiProjection: {
                    enabled: false,
                    maxArrayEntries: 256,
                    maxDepth: 12,
                    maxDescriptorReads: 4096,
                    maxKeyCodeUnits: 256,
                    maxNodes: 2048,
                    maxObjectKeys: 128,
                    maxSerializedBytes: 131072,
                    maxStringCodeUnits: 16384,
                    maxTotalStringCodeUnits: 131072,
                },
                drawCaptureTrace: {
                    enabled: value.drawCapture,
                    recordOnlyCjk: false,
                    recordAll: true,
                    limit: 40,
                },
            },
        };
    }
    function createPreviewHookSnapshot(value: PreviewOptions) {
        const now = Date.now();
        let results = [
            createPreviewHook('game-message', 'Game Message', 'installed', 'Window_Message wrappers installed.', now),
            createPreviewHook('window-text', 'Window Text', 'installed', 'Window drawText wrappers installed.', now),
            createPreviewHook('sprite-text', 'Sprite Text', 'installed', 'Sprite text observer installed.', now),
            createPreviewHook('pixi-text', 'PIXI Text', 'installed', 'PIXI text observer installed.', now),
        ];
        if (value.hookPreset === 'skipped') {
            results = results.concat(createPreviewHook('bitmap-text', 'Bitmap Text', 'skipped', 'Adapter disabled by runtime policy.', now));
        }
        else if (value.hookPreset === 'failed') {
            results = results.map((entry) => entry.name === 'sprite-text'
                ? Object.assign({}, entry, { status: 'failed', reason: 'Preview hook install failure.' })
                : entry);
        }
        else if (value.hookPreset === 'empty') {
            results = [];
        }
        return {
            updatedAt: now,
            results,
            summary: summarizeHookResults(results.map(normalizeHookFeedResult)),
        };
    }
    function createPreviewHook(name: string, displayName: string, status: string, reason: string, timestamp: number): PreviewHookResult {
        return { name, displayName, category: name, status, reason, timestamp };
    }
    function createPreviewTextStatus(value: PreviewOptions): UnknownRecord {
        const records = createPreviewTextRecords(value);
        return {
            updatedAt: Date.now(),
            active: records.active,
            attached: records.attached,
            detached: records.detached,
            inactive: records.archived,
        };
    }
    function createPreviewTextRecords(value: PreviewOptions): {
        active: UnknownRecord[];
        attached: UnknownRecord[];
        detached: UnknownRecord[];
        archived: UnknownRecord[];
    } {
        if (value.recordPreset === 'empty') {
            return { active: [], attached: [], detached: [], archived: [] };
        }
        const now = Date.now();
        const active = [
            createPreviewTextRecord('message-active', 'message', 'active', {
                original: 'Good morning, traveler.',
                semanticControl: 'game-message',
                translation: 'Good morning, traveler.',
                state: 'available',
                priority: 100,
                metadata: { windowType: 'Window_Message', methodName: 'drawTextEx', x: 32, y: 448 },
            }, now - 9000),
            createPreviewTextRecord('choice-active', 'choice', 'active', {
                original: 'Ask about the crystal',
                semanticControl: 'window',
                translation: 'Ask about the crystal',
                state: 'translating',
                priority: 80,
                metadata: { windowType: 'Window_ChoiceList', methodName: 'drawItem', x: 48, y: 516 },
            }, now - 5000),
            createPreviewTextRecord('hud-active', 'window', 'active', {
                original: 'Gold: 1245',
                semanticControl: 'window',
                translation: '',
                state: 'no-translation',
                priority: 20,
                metadata: { windowType: 'Window_Gold', methodName: 'drawText', x: 654, y: 540 },
            }, now - 2800),
        ];
        const attached = [
            createPreviewTextRecord('bitmap-attached', 'bitmap', 'attached', {
                original: 'Unverified bitmap label',
                semanticControl: 'none',
                translation: '',
                state: 'translating',
                priority: 45,
                metadata: { ownerType: 'Bitmap', methodName: 'drawText', x: 280, y: 180 },
            }, now - 1800),
        ];
        const detached = [
            createPreviewTextRecord('detached-help', 'window', 'detached', {
                original: 'Press Enter to continue',
                semanticControl: 'window',
                translation: 'Press Enter to continue',
                state: 'available',
                priority: 40,
                metadata: { windowType: 'Window_Help', methodName: 'drawTextEx', x: 24, y: 24 },
                disappearedAt: now - 16000,
            }, now - 32000),
        ];
        const archived = [
            createPreviewTextRecord('archived-name', 'message', 'archived', {
                original: 'Village Elder',
                semanticControl: 'game-message',
                translation: 'Village Elder',
                state: 'available',
                priority: 60,
                metadata: { windowType: 'Window_NameBox', methodName: 'drawText', x: 42, y: 388 },
                disappearedAt: now - 68000,
            }, now - 94000),
        ];
        if (value.recordPreset === 'busy') {
            active.push(createPreviewTextRecord('sprite-label', 'sprite', 'active', {
                original: 'North Gate',
                semanticControl: 'sprite',
                translation: 'North Gate',
                state: 'available',
                priority: 50,
                metadata: { ownerType: 'Sprite_Label', methodName: 'PIXI.Text', x: 412, y: 82 },
            }, now - 1200));
            detached.push(createPreviewTextRecord('detached-shop', 'choice', 'detached', {
                original: 'Buy',
                semanticControl: 'window',
                translation: 'Buy',
                state: 'available',
                priority: 55,
                metadata: { windowType: 'Window_ShopCommand', methodName: 'drawItem' },
                disappearedAt: now - 25000,
            }, now - 42000), createPreviewTextRecord('detached-cancel', 'choice', 'detached', {
                original: 'Cancel',
                semanticControl: 'window',
                translation: 'Cancel',
                state: 'available',
                priority: 45,
                metadata: { windowType: 'Window_ShopCommand', methodName: 'drawItem' },
                disappearedAt: now - 25000,
            }, now - 42000));
            archived.push(createPreviewTextRecord('archived-zone', 'pixi', 'archived', {
                original: 'Crystal Cave',
                semanticControl: 'sprite',
                translation: 'Crystal Cave',
                state: 'available',
                priority: 50,
                metadata: { ownerType: 'PIXI.Text', methodName: 'set text' },
                disappearedAt: now - 125000,
            }, now - 160000));
        }
        return { active, attached, detached, archived };
    }
    function createPreviewTextRecord(id: string, hook: string, lifecycle: string, fields: PreviewTextRecordFields, seenAt: number): UnknownRecord {
        const now = Date.now();
        const source = fields;
        const presentation = basicPresentation(source.state, source.semanticControl);
        const translation = source.state === 'available' ? source.translation : null;
        const history: UnknownRecord[] = [
            {
                at: seenAt,
                type: 'Record observed',
                message: 'Preview record detected.',
                details: { priority: source.priority },
            },
        ];
        if (translation !== null) {
            history.push({
                at: Math.min(now, seenAt + 900),
                type: 'Translation available',
                message: 'Preview translation completed.',
                details: { priority: source.priority, stream: hook === 'message' },
            });
        }
        return {
            id,
            hook,
            sourceAdapter: hook,
            original: source.original,
            rawText: source.original,
            visibleText: source.original,
            translation,
            presentation,
            status: presentation.result,
            active: lifecycle === 'active',
            visible: lifecycle === 'active' ? true : lifecycle === 'attached' ? null : false,
            screenState: lifecycle === 'active' ? 'visible' : lifecycle === 'attached' ? 'unverified' : 'hidden',
            priority: source.priority,
            seenAt,
            lastSeenAt: seenAt,
            updatedAt: now,
            disappearedAt: source.disappearedAt ?? null,
            deactivatedAt: source.disappearedAt ?? null,
            metadata: source.metadata,
            history,
        };
    }
    function createPreviewProviderStatus(value: PreviewOptions): TranslationStatusSnapshot {
        const now = Date.now();
        const local = value.provider === 'llamacpp' || value.provider === 'lmstudio';
        const active = value.provider !== 'none';
        const loading = local && value.localLlmState === 'pending';
        const unverified = local && value.localLlmState === 'unverified-concurrency';
        const connected = !local || value.localLlmState === 'connected' || unverified;
        const capacity = connected && active && !unverified ? (local ? value.concurrency : 32) : 0;
        const capacityVerified = capacity > 0;
        const dispatchLimit = unverified ? 1 : capacity;
        const available = active && connected && dispatchLimit > 0;
        const running = available && value.recordPreset !== 'empty'
            ? Math.min(dispatchLimit, value.recordPreset === 'busy' ? 3 : 1)
            : 0;
        const queued = active && value.recordPreset !== 'empty' ? (value.recordPreset === 'busy' ? 4 : 1) : 0;
        const name = value.provider === 'llamacpp' ? 'llama.cpp' : 'LM Studio';
        const modelSelected = connected || value.localLlmState === 'api-error';
        const modelId = local && modelSelected ? `${value.modelAuthor}/${value.modelName}` : '';
        let code = available ? 'ready' : loading ? 'model-loading' : 'capacity-pending';
        let message = '';
        if (local) {
            switch (value.localLlmState) {
                case 'unverified-concurrency':
                    code = 'capacity-unverified';
                    message = 'Concurrency is not reported; using one request at a time.';
                    break;
                case 'model-not-loaded':
                    code = 'no-model-loaded';
                    message = `No model is loaded in ${name}. Load one model to translate.`;
                    break;
                case 'auto-many':
                    code = 'multiple-models-loaded';
                    message = `${name} exposes multiple models. Select one model in translator.jsonc.`;
                    break;
                case 'no-response':
                    code = 'connection-failed';
                    message = `${name} request failed: Failed to fetch`;
                    break;
                case 'cors':
                    code = 'connection-failed';
                    message = `${name} request failed: CORS request blocked by browser.`;
                    break;
                case 'timeout':
                    code = 'request-timeout';
                    message = 'Translation request timed out after 5000ms.';
                    break;
                case 'api-error':
                    code = 'request-failed';
                    message = `${name} chat error: 500 Internal Server Error`;
                    break;
            }
        }
        return {
            generation: 1,
            sequence: ++providerSequence,
            active,
            updatedAt: now,
            provider: {
                kind: value.provider,
                state: available ? 'available' : loading || connected ? 'pending' : 'unavailable',
                code,
                message,
                model: local ? modelId + (modelId && value.quantization ? ` (${value.quantization})` : '') : '',
                observation: local
                    ? {
                        apiResponding: modelSelected ||
                            value.localLlmState === 'model-not-loaded' ||
                            value.localLlmState === 'auto-many',
                        modelId,
                        instanceId: modelId,
                        publisher: modelId ? value.modelAuthor : '',
                        quantization: modelId ? value.quantization : '',
                        capacitySource: capacityVerified ? 'preview' : '',
                    }
                    : null,
                capacity,
                capacityVerified,
                dispatchLimit,
                running,
                queued,
                available: Math.max(0, dispatchLimit - running),
                connection: available ? 'connected' : loading || connected ? 'pending' : 'error',
                refreshing: loading,
                checkedAt: now,
                lastSuccessAt: available ? now : 0,
                expiresAt: 0,
                priorityLane: capacityVerified && capacity >= 3,
            },
        };
    }
    function createPreviewDrawCaptureSnapshot(value: PreviewOptions): UnknownRecord | null {
        if (!value.drawCapture)
            return null;
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
    function createPreviewDrawEvent(seq: number, at: number, stage: string, text: string, adapter: string, status: string): UnknownRecord {
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
    function refreshPreviewCurrentRecords(): void {
        const value = options ?? loadOptions();
        currentRecords ??= publishGuiTextRecordsSink(root);
        const snapshot: TextRecordsSnapshot = {
            generation: 1,
            sequence: ++recordSequence,
            active: true,
            records: value.recordPreset === 'empty'
                ? []
                : [
                    {
                        textId: 1,
                        semanticRevision: 1,
                        attempt: 1,
                        sourceText: 'The road leads to the village.',
                        translation: 'The road leads to the village.',
                        state: 'available',
                        semanticControl: 'game-message',
                        onScreenGameMessage: true,
                        request: { priority: 1000, stream: false },
                    },
                ],
            foresight: createPreviewForesightView(value),
        };
        currentRecords.accept(snapshot);
    }
    function createPreviewForesightView(value: PreviewOptions): ForesightView | null {
        if (!value.foresight)
            return null;
        const empty = value.recordPreset === 'empty';
        return {
            revision: recordSequence,
            showSpoilers: value.showSpoilers,
            limits: DEFAULT_FORESIGHT_SETTINGS.limits.view,
            state: empty ? 'waiting' : 'complete',
            waiting: empty ? 'no-submission' : null,
            anchor: empty ? null : { id: 1, textId: 1, index: 4 },
            stats: empty ? null : { reads: 8, nodes: 2, candidates: 1, units: 34, stops: { end: 1 }, lastStop: null },
            prepared: empty ? 0 : 1,
            failed: 0,
            outstanding: false,
            graph: {
                truncated: false,
                projection: null,
                nodes: empty
                    ? []
                    : [
                        {
                            id: 0,
                            index: 4,
                            kind: 'root',
                            arm: null,
                            valid: true,
                            next: [1],
                            texts: [],
                            stops: [],
                            location: { commonEvent: null, index: 4, via: [] },
                            omittedNext: 0,
                            outcome: null,
                        },
                        {
                            id: 1,
                            index: 6,
                            kind: 'message',
                            arm: null,
                            valid: true,
                            next: [],
                            stops: [],
                            location: { commonEvent: null, index: 6, via: [] },
                            omittedNext: 0,
                            outcome: null,
                            texts: [
                                {
                                    choice: null,
                                    preview: 'A preview of the next message.',
                                    truncated: false,
                                    preparation: 'ready',
                                    translation: 'A prepared translation.',
                                    translationTruncated: false,
                                },
                            ],
                        },
                    ],
            },
        };
    }
    function loadOptions(): PreviewOptions {
        let stored: unknown;
        try {
            const parsed: unknown = JSON.parse(falsyFallback(root.localStorage.getItem(STORAGE_KEY), '{}'));
            stored = falsyFallback(parsed, {});
        }
        catch {
            stored = {};
        }
        return normalizeOptions(Object.assign({}, DEFAULT_OPTIONS, stored));
    }
    function saveOptions(value: PreviewOptions): void {
        try {
            root.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
        }
        catch {
        }
    }
    function normalizeOptions(value: unknown): PreviewOptions {
        const source = isUnknownRecord(value) ? value : {};
        return {
            updateState: pickOption(source['updateState'], ['outdated', 'latest', 'checking', 'error', 'disabled', 'missing'], DEFAULT_OPTIONS.updateState),
            provider: pickOption(source['provider'], ['llamacpp', 'lmstudio', 'mocktranslator', 'none'], DEFAULT_OPTIONS.provider),
            localLlmState: pickOption(source['localLlmState'], [
                'connected',
                'pending',
                'unverified-concurrency',
                'no-response',
                'cors',
                'timeout',
                'model-not-loaded',
                'auto-many',
                'api-error',
            ], DEFAULT_OPTIONS.localLlmState),
            concurrency: clampInteger(source['concurrency'], 0, 12, DEFAULT_OPTIONS.concurrency),
            modelAuthor: normalizePreviewText(source['modelAuthor'], DEFAULT_OPTIONS.modelAuthor, 48),
            modelName: normalizePreviewText(source['modelName'], DEFAULT_OPTIONS.modelName, 96),
            quantization: normalizePreviewText(source['quantization'], DEFAULT_OPTIONS.quantization, 32),
            recordPreset: pickOption(source['recordPreset'], ['normal', 'busy', 'empty'], DEFAULT_OPTIONS.recordPreset),
            hookPreset: pickOption(source['hookPreset'], ['ready', 'skipped', 'failed', 'empty'], DEFAULT_OPTIONS.hookPreset),
            runtimePreset: pickOption(source['runtimePreset'], ['ready', 'unlinked', 'missing-support'], DEFAULT_OPTIONS.runtimePreset),
            drawCapture: source['drawCapture'] !== false,
            foresight: source['foresight'] !== false,
            showSpoilers: source['showSpoilers'] === true,
        };
    }
    function pickOption<Option extends string>(value: unknown, allowed: readonly Option[], fallback: Option): Option {
        const text = stringValue(falsyFallback(value, ''));
        return falsyFallback(allowed.find((option) => option === text), fallback);
    }
    function normalizePreviewText(value: unknown, fallback: string, maxLength: number): string {
        const text = stringValue(falsyFallback(value, '')).replace(/\s+/gu, ' ').trim();
        return falsyFallback(text, fallback).slice(0, maxLength);
    }
    function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
        const numeric = Number(value);
        if (!Number.isFinite(numeric))
            return fallback;
        return Math.min(max, Math.max(min, Math.round(numeric)));
    }
    return Object.freeze({
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
            return Object.assign({}, options ?? loadOptions());
        },
    });
}
export const guiPreviewController = createTranslatorGuiPreview(typeof window !== 'undefined' ? window : globalThis);
