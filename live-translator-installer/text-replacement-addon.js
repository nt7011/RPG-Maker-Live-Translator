(() => {
    'use strict';

    const cachedSettings = (() => {
        const scope = typeof globalThis !== 'undefined'
            ? globalThis
            : (typeof window !== 'undefined' ? window : null);
        if (scope && scope.LiveTranslatorSettings && typeof scope.LiveTranslatorSettings === 'object') {
            return scope.LiveTranslatorSettings;
        }
        throw new Error('[LiveTranslator] settings.json not loaded (LiveTranslatorSettings missing). Ensure live-translator-loader.js runs first.');
    })();

    function requireSettings() {
        return cachedSettings;
    }

    let localProviderBypassFlag = false;

    const loggerBundleFactory = (() => {
        const scope = typeof globalThis !== 'undefined'
            ? globalThis
            : (typeof window !== 'undefined' ? window : null);
        if (scope && scope.LiveTranslatorModules) {
            if (typeof scope.LiveTranslatorModules.getLoggerBundle === 'function') {
                return scope.LiveTranslatorModules.getLoggerBundle;
            }
            if (typeof scope.LiveTranslatorModules.createLoggerBundle === 'function') {
                return scope.LiveTranslatorModules.createLoggerBundle;
            }
        }
        throw new Error('[LiveTranslator] logger.js not loaded (logger bundle factory missing).');
    })();

    const loggingBundle = loggerBundleFactory({
        settings: cachedSettings,
        maxLogsPerFrame: 1000,
        shouldBypassThrottle: () => localProviderBypassFlag,
    });

    const {
        logger,
        dbg,
        diag,
        getFastTimestamp,
        isLoggingEnabled,
        preview: loggerPreview
    } = loggingBundle;
    const windowHelpers = (() => {
        const scope = typeof globalThis !== 'undefined'
            ? globalThis
            : (typeof window !== 'undefined' ? window : null);
        if (scope && scope.LiveTranslatorModules && scope.LiveTranslatorModules.windowHelpers) {
            return scope.LiveTranslatorModules.windowHelpers;
        }
        throw new Error('[LiveTranslator] window-helpers module missing; ensure window-helpers.js loads before text-replacement-addon.js.');
    })();

    const {
        captureBitmapDrawState,
        applyBitmapDrawState,
        generateKey,
        createWindowRegistryHelpers,
    } = windowHelpers;

    const controlCodeHelpers = (() => {
        const scope = typeof globalThis !== 'undefined'
            ? globalThis
            : (typeof window !== 'undefined' ? window : null);
        if (scope && scope.LiveTranslatorModules && scope.LiveTranslatorModules.controlCodeHelpers) {
            return scope.LiveTranslatorModules.controlCodeHelpers;
        }
        throw new Error('[LiveTranslator] control-code-helpers module missing; ensure control-code-helpers.js loads before text-replacement-addon.js.');
    })();

    const {
        stripRpgmEscapes,
        prepareTextForTranslation,
        restoreControlCodes,
    } = controlCodeHelpers;

    const textHookFactory = (() => {
        const scope = typeof globalThis !== 'undefined'
            ? globalThis
            : (typeof window !== 'undefined' ? window : null);
        if (scope && scope.LiveTranslatorModules && typeof scope.LiveTranslatorModules.createTextHookInstallers === 'function') {
            return scope.LiveTranslatorModules.createTextHookInstallers;
        }
        throw new Error('[LiveTranslator] hooks.js not loaded (createTextHookInstallers missing).');
    })();

    const translationManagerFactory = resolveTranslationManagerFactory();
    if (!translationManagerFactory) {
        throw new Error('[LiveTranslator] translation-manager module missing; ensure translation-manager.js loads before text-replacement-addon.js.');
    }

    if (typeof window !== 'undefined') {
        window.translationLogger = logger;
    }

    logger.info('TEXT REPLACEMENT ADDON LOADED');

    function resolveTranslationManagerFactory() {
        if (typeof window !== 'undefined'
            && window.LiveTranslatorModules
            && typeof window.LiveTranslatorModules.createTranslationManager === 'function') {
            return window.LiveTranslatorModules.createTranslationManager;
        }
        if (typeof globalThis !== 'undefined'
            && globalThis.LiveTranslatorModules
            && typeof globalThis.LiveTranslatorModules.createTranslationManager === 'function') {
            return globalThis.LiveTranslatorModules.createTranslationManager;
        }
        return null;
    }

    const preview = typeof loggerPreview === 'function'
        ? loggerPreview
        : (text, max = 48) => {
            const s = String(text ?? '').replace(/\s+/g, ' ').trim();
            if (s.length <= max) return s;
            return s.slice(0, Math.max(0, max - 1)) + '…';
        };

    const telemetry = loggingBundle.createTelemetryChannel({ preview });

    // Test debug functions
    logger.debug('Debug settings:', cachedSettings.debug);
    dbg('DBG function test - this should appear if debug level includes debug');
    diag('DIAG function test - this should appear if debug level includes trace');

    // Make telemetry globally accessible for manual inspection (preserve legacy name)
    if (typeof window !== 'undefined') {
        window.translationTelemetry = telemetry;
        window.translationDiagnostics = telemetry;
    }

    // Import translator (DeepL/local helper)
    let textProcessor = null;
    if (typeof window !== 'undefined' && window.TextProcessor) {
        textProcessor = window.TextProcessor;
    } else if (typeof globalThis !== 'undefined' && globalThis.TextProcessor) {
        textProcessor = globalThis.TextProcessor;
    }

    if (!textProcessor) {
        logger.warn('TextProcessor global not found. Translation features will be unavailable.');
    }

    function getTranslatorConfig() {
        try {
            if (typeof globalThis !== 'undefined' && globalThis && globalThis.LiveTranslatorConfig) {
                const cfg = globalThis.LiveTranslatorConfig;
                if (cfg && typeof cfg === 'object') return cfg;
            }
        } catch (_) {}
        return null;
    }

    function getActiveProvider() {
        try {
            if (typeof window !== 'undefined' && window && window.FORCE_LOCAL_ASYNC === true) {
                return 'local';
            }
        } catch (_) {}
        try {
            if (typeof process !== 'undefined' && process.env && process.env.LIVE_TRANSLATOR_LOCAL === '1') {
                return 'local';
            }
        } catch (_) {}
        const cfg = getTranslatorConfig();
        if (cfg && typeof cfg.provider === 'string') {
            const provider = cfg.provider.trim().toLowerCase();
            if (provider) return provider;
        }
        return null;
    }

    const ACTIVE_PROVIDER = getActiveProvider();
    const USING_LOCAL_PROVIDER = ACTIVE_PROVIDER === 'local';
    const USING_CACHE_ONLY_PROVIDER = ACTIVE_PROVIDER === 'none';

    localProviderBypassFlag = USING_LOCAL_PROVIDER === true;


    let initializationScheduled = false;
    let initializationStarted = false;
    let initializationCompleted = false;

    function scheduleInitialization(delayMs = 100) {
        if (initializationScheduled) return;
        initializationScheduled = true;
        setTimeout(() => {
            initializeTextReplacement();
        }, delayMs);
    }

    function initializeTextReplacement() {
        if (initializationCompleted) {
            logger.debug('[INIT] Initialization already completed; skipping.');
            return;
        }
        if (initializationStarted) {
            logger.debug('[INIT] Initialization already in progress; skipping.');
            return;
        }
        initializationStarted = true;
        try {
            logger.info('[INIT] Starting text replacement initialization...');
            logger.debug('[INIT] Window_Base available:', typeof Window_Base !== 'undefined');
            logger.debug('[INIT] Window_Base.prototype.drawText available:', typeof Window_Base !== 'undefined' && typeof Window_Base.prototype.drawText === 'function');
            
            trackWindowState()
            logger.debug('[INIT] trackWindowState completed');
            
            trackWindowDrawText()
            logger.debug('[INIT] trackWindowDrawText completed');
            
            trackGameMessage()
            logger.debug('[INIT] trackGameMessage completed');
            
            trackChoiceList()
            logger.debug('[INIT] trackChoiceList completed');

            trackHelpWindow()
            logger.debug('[INIT] trackHelpWindow completed');

            trackBitmapDrawText()
            logger.debug('[INIT] trackBitmapDrawText completed');

            trackPixiText()
            logger.debug('[INIT] trackPixiText completed');
            
            logger.info('[INIT] Text replacement initialization completed');
            initializationCompleted = true;
            
            // Show initial stats
            setTimeout(() => {
                logger.info('═══ TEXT REPLACEMENT ADDON INITIALIZED ═══');
                logger.info('Hooks installed: drawText, drawTextEx, Game_Message.clear, Window_Base.open/close/update, Window_Help.setText, Bitmap.drawText, PIXI.Text/.BitmapText setters');
                // Translation target is determined by translator configuration
                const maxMb = diskCache.enabled && typeof diskCache.getMaxMegabytes === 'function'
                    ? diskCache.getMaxMegabytes()
                    : Number(diskCacheSettings.maxMegabytes);
                const retention = Number.isFinite(maxMb) && maxMb > 0 ? `${Math.floor(maxMb)} MB` : 'unlimited';
                logger.info(`Disk cache: ${diskCache.enabled ? 'enabled' : 'disabled'}${diskCache.enabled ? ` (${retention})` : ''}`);
            }, 1000);
        } catch (error) {
            initializationStarted = false;
            initializationScheduled = false;
            logger.error('[INIT] Text replacement initialization failed:', error);
        }
    }

    // contains all windows that are in memory
    // automatically deleted when window is garbage collected
    const windowRegistry = new WeakMap();
    // Store all registered windows for telemetry/debug purpose only
    const registeredWindows = new Set();
    // Map a contents Bitmap back to its owning Window (used to scope hooks)
    const contentsOwners = new WeakMap();

    const { addWindowToRegistry, ensureWindowRegistered } = createWindowRegistryHelpers({
        windowRegistry,
        registeredWindows,
        contentsOwners,
    });

    // Invisible unicode signature to detect our own redraws
    const REDRAW_SIGNATURE = '\u200B\u200C\u200D\u200B\u200C\u200D\uFEFF\u200B'; // Zero-width chars pattern
    // Additional invisible mark to insert between every translated character to help
    // downstream hooks (e.g., Bitmap) ignore already-translated fragments.
    const PER_CHAR_MARK = '\u2060'; // WORD JOINER

    // Disk cache integration (delegates to shared module via loader)
    const diskCacheFactory = (() => {
        if (typeof window !== 'undefined'
            && window.LiveTranslatorModules
            && typeof window.LiveTranslatorModules.createDiskCache === 'function') {
            return window.LiveTranslatorModules.createDiskCache;
        }
        if (typeof globalThis !== 'undefined'
            && globalThis.LiveTranslatorModules
            && typeof globalThis.LiveTranslatorModules.createDiskCache === 'function') {
            return globalThis.LiveTranslatorModules.createDiskCache;
        }
        return null;
    })();

    const diskCacheSettings = cachedSettings.diskCache || {};

    const diskCache = diskCacheFactory
        ? diskCacheFactory({
            logger,
            settings: diskCacheSettings,
            defaultCacheMegabytes: Number(diskCacheSettings.maxMegabytes) || 32,
        })
        : {
            enabled: false,
            appendRecord: async () => {},
            loadAll: async () => [],
            ensureLaunchPrune: async () => {},
            getMaxMegabytes: () => Number(diskCacheSettings.maxMegabytes) || 0,
        };

    const translationManagerInstance = translationManagerFactory({
        logger,
        telemetry,
        diskCache,
        preview,
        getCacheEntryLimit,
        pruneMapToLimit,
        textProcessor,
        isLocalProvider: USING_LOCAL_PROVIDER,
        isCacheOnlyProvider: USING_CACHE_ONLY_PROVIDER,
        dbg,
        diag,
        settings: cachedSettings,
    });

    if (!translationManagerInstance || !translationManagerInstance.translationCache) {
        throw new Error('[LiveTranslator] translation-manager failed to provide a translation cache.');
    }

    const translationCache = translationManagerInstance.translationCache;

    const {
        trackGameMessage,
        trackChoiceList,
        trackPixiText,
        trackBitmapDrawText,
        trackHelpWindow,
        redrawGameMessageText,
    } = textHookFactory({
        logger,
        dbg,
        diag,
        preview,
        stripRpgmEscapes,
        prepareTextForTranslation,
        restoreControlCodes,
        telemetry,
        translationCache,
        settings: cachedSettings,
        captureBitmapDrawState,
        applyBitmapDrawState,
        generateKey,
        contentsOwners,
        windowRegistry,
        registeredWindows,
        PER_CHAR_MARK,
        REDRAW_SIGNATURE,
    });

    const windowDrawHooksInstaller = (() => {
        if (typeof window !== 'undefined'
            && window.LiveTranslatorModules
            && typeof window.LiveTranslatorModules.installWindowDrawHooks === 'function') {
            return window.LiveTranslatorModules.installWindowDrawHooks;
        }
        if (typeof globalThis !== 'undefined'
            && globalThis.LiveTranslatorModules
            && typeof globalThis.LiveTranslatorModules.installWindowDrawHooks === 'function') {
            return globalThis.LiveTranslatorModules.installWindowDrawHooks;
        }
        return null;
    })();
    let windowDrawHelpers = null;

    function getCacheEntryLimit() {
        return 0;
    }

    function pruneMapToLimit() {}

    // Global translation cache system
    // translationCache is provided by translation-manager module (see below).

    function trackWindowDrawText() {
        if (!windowDrawHooksInstaller) {
            logger.error('[HOOK INSTALL] window-draw-hooks module missing; drawText hooks will not be installed.');
            return;
        }
        try {
            const helpers = windowDrawHooksInstaller({
                logger,
                telemetry,
                translationCache,
                windowRegistry,
                registeredWindows,
                ensureWindowRegistered,
                generateKey,
                captureBitmapDrawState,
                applyBitmapDrawState,
                stripRpgmEscapes,
                prepareTextForTranslation,
                restoreControlCodes,
                preview,
                settings: cachedSettings,
                REDRAW_SIGNATURE,
                diag,
                dbg,
            });
            if (helpers && typeof helpers === 'object') {
                windowDrawHelpers = helpers;
            }
        } catch (error) {
            logger.error('[HOOK INSTALL] Failed to install drawText hooks:', error);
        }
    }

    function trackWindowState() {
        const originalWindowOpen = Window_Base.prototype.open;
        const originalWindowClose = Window_Base.prototype.close;

        Window_Base.prototype.open = function () {
            this._uniqueId = this._uniqueId || Math.random().toString(36).substring(2, 11);
            // Preserve existing data if any, but mark as open
            const existing = windowRegistry.get(this);
            const data = existing || { texts: new Map(), isOpen: true, pendingRedraws: new Map() };
            data.isOpen = true;
            if (!data.pendingRedraws) data.pendingRedraws = new Map();
            addWindowToRegistry(this, data);
            return originalWindowOpen.call(this);
        };

        Window_Base.prototype.close = function () {
            const existing = windowRegistry.get(this);
            const data = existing || { texts: new Map(), isOpen: false, pendingRedraws: new Map() };
            data.isOpen = false;
            if (!data.pendingRedraws) data.pendingRedraws = new Map();
            windowRegistry.set(this, data);
            return originalWindowClose.call(this);
        };

        if (typeof Window_Base.prototype.createContents === 'function'
            && !Window_Base.prototype.createContents.__trWindowStateWrapped) {
            const originalCreateContents = Window_Base.prototype.createContents;
            Window_Base.prototype.createContents = function(...args) {
                const result = originalCreateContents.apply(this, args);
                try {
                    const existing = windowRegistry.get(this);
                    const data = existing || {
                        texts: new Map(),
                        isOpen: typeof this.isOpen === 'function' ? this.isOpen() : true,
                        pendingRedraws: new Map(),
                        recentlyRedrawn: new Map(),
                    };
                    if (!data.pendingRedraws) data.pendingRedraws = new Map();
                    if (!data.recentlyRedrawn) data.recentlyRedrawn = new Map();
                    addWindowToRegistry(this, data);
                } catch (error) {
                    logger.error('[Window_Base.createContents Hook Error]', error);
                }
                return result;
            };
            Window_Base.prototype.createContents.__trWindowStateWrapped = true;
            Window_Base.prototype.createContents.__trOriginal = originalCreateContents;
        }

        // Apply pending redraws once window becomes visible/open again
        const originalWindowUpdate = Window_Base.prototype.update;
        Window_Base.prototype.update = function() {
            const res = originalWindowUpdate.call(this);
            try {
                const data = windowRegistry.get(this);
                if (!data || !data.pendingRedraws || data.pendingRedraws.size === 0) return res;
                const ready = this.visible && this.isOpen() && this.contents;
                if (!ready) return res;


                // Normal window processing
                const keys = Array.from(data.pendingRedraws.keys());
                for (const key of keys) {
                    const entry = data.pendingRedraws.get(key);
                    if (!entry) { data.pendingRedraws.delete(key); continue; }
                    // Drop if a newer entry replaced it
                    const current = data.texts.get(key);
                    if (current !== entry) { data.pendingRedraws.delete(key); dbg(`[Redraw Queue Drop] replaced at ${key}`); continue; }
                    if (entry.translationStatus === 'completed' && entry.translatedText) {
                        try {
                            if (windowDrawHelpers && typeof windowDrawHelpers.redrawTranslatedText === 'function') {
                                windowDrawHelpers.redrawTranslatedText(entry, data);
                            }
                        } catch (_) {}
                        if (data.pendingRedraws && data.pendingRedraws.get(key) === entry) {
                            data.pendingRedraws.delete(key);
                        }
                    } else {
                        // Not completed anymore (e.g., superseded); drop
                        data.pendingRedraws.delete(key); dbg(`[Redraw Queue Drop] not completed at ${key}`);
                    }
                }
            } catch (e) {
                logger.error('[Window_Base.update Hook Error]', e);
            }
            return res;
        };

    }

    // Apply pending GameMessage redraw once window becomes ready
    try {
        if (typeof Window_Message !== 'undefined') {
            const _origMsgUpdate = Window_Message.prototype.update;
            Window_Message.prototype.update = function() {
                const r = _origMsgUpdate.call(this);
                try {
                    if (this._trStreamLoopActive
                        && this._trStreamSessionId
                        && this._trStreamSessionId === this._trSessionId
                        && typeof this._trStreamText === 'string'
                        && this._trStreamText
                        && this.visible
                        && this.isOpen()
                        && this.contents) {
                        redrawGameMessageText(this, this._trStreamText, { streaming: true });
                    }
                    const pending = this._trPendingRedraw;
                    if (pending && this.visible && this.isOpen() && this.contents) {
                        if (this._trSessionId === pending.sessionId) {
                            redrawGameMessageText(this, pending.text, pending);
                        }
                        this._trPendingRedraw = null;
                    }
                } catch (e) { logger.warn('[Window_Message.update pending redraw error]', e); }
                return r;
            };
        }
    } catch (e) { logger.warn('[Init] Window_Message update hook error', e); }

    async function hydrateCache() {
        if (!diskCache.enabled) return;
        const records = await diskCache.loadAll();
        for (const rec of records) {
            if (rec && typeof rec.in === 'string' && typeof rec.out === 'string') {
                if (typeof translationCache.storeCompletedTranslation === 'function') {
                    translationCache.storeCompletedTranslation(rec.in, rec.out);
                } else {
                    translationCache.completed.set(rec.in.trim(), rec.out);
                }
            }
        }
        dbg(`[DiskCache] Loaded ${records.length} records`);
    }

    window.addEventListener('load', () => {
        hydrateCache()
            .catch((e) => logger.error('[DiskCache Hydrate Error]', e))
            .finally(() => scheduleInitialization(0));
    });
    
    // Also try immediate initialization in case window.load already fired
    if (document.readyState === 'complete') {
        hydrateCache()
            .catch((e) => logger.error('[DiskCache Hydrate Error]', e))
            .finally(() => scheduleInitialization(0));
    }

})();
