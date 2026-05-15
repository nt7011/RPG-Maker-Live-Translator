// RPG Maker loads this file from js/plugins as the plugin entry point.
// It locates the live-translator support folder, reads the install manifest, loads loader helpers, then runs the declared runtime phases.
(() => {
    'use strict';

    const INSTALL_MANIFEST_FILE = 'install-manifest.json';

    function getGlobalScope() {
        return typeof window !== 'undefined'
            ? window
            : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    }

    function resolveSupportDir(loaderScript) {
        const base = new URL(loaderScript.src, window.location.href);
        return new URL('./', base).href;
    }

    function injectBootstrapScript(url) {
        return new Promise((resolve, reject) => {
            const parent = document.head || document.documentElement;
            if (!parent || typeof parent.appendChild !== 'function') {
                reject(new Error('[LiveTranslatorLoader] Document has no script insertion point.'));
                return;
            }
            const tag = document.createElement('script');
            tag.src = url;
            tag.async = false;
            tag.onload = resolve;
            tag.onerror = () => reject(new Error(`Failed to load ${url}`));
            parent.appendChild(tag);
        });
    }

    function installLoaderModuleRegistry() {
        const scope = getGlobalScope();
        const modules = Object.create(null);
        scope.LiveTranslatorLoaderModules = modules;
        scope.LiveTranslatorLoaderDefine = function defineLoaderModule(name, value) {
            if (!name || typeof name !== 'string') {
                throw new Error('[LiveTranslatorLoader] Invalid loader module name.');
            }
            if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
                throw new Error(`[LiveTranslatorLoader] Invalid loader module: ${name}`);
            }
            if (Object.prototype.hasOwnProperty.call(modules, name)) {
                throw new Error(`[LiveTranslatorLoader] Duplicate loader module: ${name}`);
            }
            modules[name] = typeof Object.freeze === 'function' ? Object.freeze(value) : value;
            return modules[name];
        };
        scope.LiveTranslatorLoaderRequire = function requireLoaderModule(name) {
            if (!Object.prototype.hasOwnProperty.call(modules, name)) {
                throw new Error(`[LiveTranslatorLoader] Missing loader module: ${name}`);
            }
            return modules[name];
        };
    }

    function installRuntimeModuleRegistry() {
        const scope = getGlobalScope();
        const modules = scope.LiveTranslatorModules && typeof scope.LiveTranslatorModules === 'object'
            ? scope.LiveTranslatorModules
            : Object.create(null);
        scope.LiveTranslatorModules = modules;

        const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
        const MODULE_NAMESPACE_KEY = '__liveTranslatorRuntimeNamespace';
        const MODULE_EXPORT_KEY = '__liveTranslatorRuntimeExport';
        const parseName = (name) => {
            if (!name || typeof name !== 'string') {
                throw new Error('[LiveTranslator] Invalid runtime module name.');
            }
            const parts = name.split('.').map((part) => part.trim()).filter(Boolean);
            if (!parts.length || parts.join('.') !== name) {
                throw new Error(`[LiveTranslator] Invalid runtime module path: ${name}`);
            }
            return parts;
        };
        const freezeExport = (value) => (typeof Object.freeze === 'function' ? Object.freeze(value) : value);
        const hasModuleExport = (node) => !!(node
            && typeof node === 'object'
            && hasOwn(node, MODULE_EXPORT_KEY));
        const isNamespaceNode = (node) => !!(node
            && typeof node === 'object'
            && node[MODULE_NAMESPACE_KEY] === true);
        const markNamespaceNode = (node) => {
            if (!node || typeof node !== 'object' || isNamespaceNode(node)) return node;
            Object.defineProperty(node, MODULE_NAMESPACE_KEY, {
                value: true,
                enumerable: false,
                configurable: false,
                writable: false,
            });
            return node;
        };
        const createNamespaceNode = (moduleExport) => {
            const node = markNamespaceNode(Object.create(null));
            if (moduleExport !== undefined) {
                Object.defineProperty(node, MODULE_EXPORT_KEY, {
                    value: moduleExport,
                    enumerable: false,
                    configurable: false,
                    writable: false,
                });
            }
            return node;
        };
        const assignModuleExport = (node, name, value) => {
            if (!isNamespaceNode(node)) {
                throw new Error(`[LiveTranslator] Duplicate runtime module: ${name}`);
            }
            if (hasModuleExport(node)) {
                throw new Error(`[LiveTranslator] Duplicate runtime module: ${name}`);
            }
            Object.defineProperty(node, MODULE_EXPORT_KEY, {
                value,
                enumerable: false,
                configurable: false,
                writable: false,
            });
            return value;
        };
        const ensureNamespaceChild = (cursor, part, namespaceName) => {
            if (!hasOwn(cursor, part)) {
                cursor[part] = createNamespaceNode();
                return cursor[part];
            }

            const current = cursor[part];
            if (isNamespaceNode(current)) return current;
            if (current && (typeof current === 'object' || typeof current === 'function')) {
                cursor[part] = createNamespaceNode(current);
                return cursor[part];
            }
            throw new Error(`[LiveTranslator] Runtime module namespace conflict: ${namespaceName}`);
        };
        markNamespaceNode(modules);

        scope.LiveTranslatorDefine = function defineRuntimeModule(name, value) {
            if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
                throw new Error(`[LiveTranslator] Invalid runtime module export: ${name}`);
            }

            const parts = parseName(name);
            const moduleExport = freezeExport(value);
            let cursor = modules;
            for (let i = 0; i < parts.length - 1; i += 1) {
                const part = parts[i];
                cursor = ensureNamespaceChild(cursor, part, parts.slice(0, i + 1).join('.'));
            }

            const leaf = parts[parts.length - 1];
            if (hasOwn(cursor, leaf)) {
                return assignModuleExport(cursor[leaf], name, moduleExport);
            }

            cursor[leaf] = moduleExport;
            return moduleExport;
        };

        scope.LiveTranslatorRequire = function requireRuntimeModule(name) {
            const parts = parseName(name);
            let cursor = modules;
            for (const part of parts) {
                if (!cursor || typeof cursor !== 'object' || !hasOwn(cursor, part)) {
                    throw new Error(`[LiveTranslator] Missing runtime module: ${name}`);
                }
                cursor = cursor[part];
            }
            return hasModuleExport(cursor) ? cursor[MODULE_EXPORT_KEY] : cursor;
        };
    }

    function cloneList(list) {
        return Array.isArray(list) ? list.slice() : [];
    }

    function normalizeRuntimeManifest(manifest) {
        if (!manifest || typeof manifest !== 'object' || !manifest.runtime || typeof manifest.runtime !== 'object') {
            throw new Error('[LiveTranslatorLoader] install-manifest.json is invalid.');
        }
        const runtime = manifest.runtime;
        return {
            minNwVersion: runtime.minNwVersion || '',
            loaderHelpers: cloneList(runtime.loaderHelpers),
            requiredAssets: cloneList(runtime.requiredAssets),
            optionalAssets: cloneList(runtime.optionalAssets),
            scriptLoadOrder: cloneList(runtime.scriptLoadOrder),
        };
    }

    async function loadRuntimeManifest(supportDir) {
        const url = new URL(INSTALL_MANIFEST_FILE, supportDir).href;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`[LiveTranslatorLoader] Failed to load ${INSTALL_MANIFEST_FILE}: HTTP ${response.status} ${response.statusText}`);
        }
        return normalizeRuntimeManifest(await response.json());
    }

    async function loadLoaderHelpers(supportDir, manifest) {
        const loaderHelpers = Array.isArray(manifest.loaderHelpers) ? manifest.loaderHelpers : [];
        for (const script of loaderHelpers) {
            await injectBootstrapScript(new URL(script, supportDir).href);
        }
    }

    function getLoaderModule(name) {
        const requireModule = getGlobalScope().LiveTranslatorLoaderRequire;
        if (typeof requireModule !== 'function') {
            throw new Error('[LiveTranslatorLoader] Loader module registry is unavailable.');
        }
        return requireModule(name);
    }

    function getConfigModule() {
        const requireModule = getGlobalScope().LiveTranslatorRequire;
        if (typeof requireModule === 'function') {
            const configModule = requireModule('config');
            if (configModule && typeof configModule.applyAssets === 'function') return configModule;
        }
        throw new Error('[LiveTranslatorLoader] config.js did not expose runtime module config.');
    }

    function createConfiguredLogger(settings) {
        const scope = getGlobalScope();
        const requireModule = scope.LiveTranslatorRequire;
        if (typeof requireModule === 'function') {
            const createLoggerBundle = requireModule('createLoggerBundle');
            const bundle = createLoggerBundle({
                settings: settings || {},
                paths: scope.LiveTranslatorPaths || {},
                maxLogsPerFrame: 1000,
            });
            if (bundle && bundle.logger) return bundle.logger;
        }
        throw new Error('[LiveTranslatorLoader] logger.js did not expose runtime module createLoggerBundle.');
    }

    function logAssetEvent(logger, level, ...args) {
        const fn = logger && typeof logger[level] === 'function' ? logger[level] : null;
        if (fn) fn(...args);
    }

    async function loadSupportFile(options = {}) {
        const {
            supportDir,
            file,
            logger,
            required = true,
        } = options;
        const url = new URL(file, supportDir).href;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                const err = new Error(`HTTP ${response.status} ${response.statusText}`);
                err.code = 'HTTP';
                throw err;
            }

            const text = await response.text();
            const lower = String(file || '').toLowerCase();
            const asset = lower.endsWith('.json')
                ? { raw: text, json: JSON.parse(text) }
                : { raw: text };
            logAssetEvent(logger, 'debug', `[LiveTranslatorLoader] Loaded asset ${file}`);
            return { file, asset };
        } catch (err) {
            if (!required) {
                logAssetEvent(logger, 'debug', `[LiveTranslatorLoader] Optional asset ${file} unavailable.`);
                return null;
            }
            const msg = `[LiveTranslatorLoader][Fatal] Missing, unreadable, or invalid asset ${file} (expected in live-translator folder next to live-translator-loader.js).`;
            logAssetEvent(logger, 'error', msg, err);
            throw err;
        }
    }

    async function loadSupportFiles(options = {}) {
        const {
            supportDir,
            logger,
            manifest = {},
        } = options;
        const assets = {};
        const requiredFiles = Array.isArray(manifest.requiredAssets)
            ? manifest.requiredAssets
            : [];
        const optionalFiles = Array.isArray(manifest.optionalAssets)
            ? manifest.optionalAssets
            : [];

        const requiredEntries = await Promise.all(
            requiredFiles.map((file) => loadSupportFile({
                supportDir,
                file,
                logger,
                required: true,
            }))
        );
        const optionalEntries = await Promise.all(
            optionalFiles.map((file) => loadSupportFile({
                supportDir,
                file,
                logger,
                required: false,
            }))
        );
        for (const entry of requiredEntries.concat(optionalEntries)) {
            if (entry && entry.file && entry.asset) {
                assets[entry.file] = entry.asset;
            }
        }
        return assets;
    }

    function compareVersions(a, b) {
        const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
        const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i += 1) {
            const da = pa[i] || 0;
            const db = pb[i] || 0;
            if (da > db) return 1;
            if (da < db) return -1;
        }
        return 0;
    }

    function detectNwVersion(logger, minNwVersion) {
        if (!minNwVersion) return;
        try {
            const nwVersion = (typeof globalThis !== 'undefined'
                && globalThis.process
                && globalThis.process.versions
                && globalThis.process.versions.nw)
                ? String(globalThis.process.versions.nw)
                : null;

            if (!nwVersion) {
                logger.warn('[LiveTranslator] NW.js version could not be detected.');
                return;
            }

            const cmp = compareVersions(nwVersion, minNwVersion);
            if (cmp < 0) {
                logger.warn(`[LiveTranslator][Compat] Detected NW.js version ${nwVersion}; below minimum ${minNwVersion}. Update NW.js to avoid syntax errors and translation issues.`);
            } else {
                logger.debug(`[LiveTranslator] Detected NW.js version ${nwVersion}.`);
            }
        } catch (err) {
            logger.warn('[LiveTranslator] Failed to check NW.js version:', err);
        }
    }

    function beginBootstrapState() {
        const scope = getGlobalScope();
        const existing = scope.LiveTranslatorLoaderState;
        if (scope.LiveTranslatorLoaderBootstrapped
            || (existing && (existing.status === 'loading' || existing.status === 'ready'))) {
            return null;
        }
        scope.LiveTranslatorLoaderState = {
            status: 'loading',
            startedAt: Date.now(),
            error: null,
        };
        return scope.LiveTranslatorLoaderState;
    }

    function createRuntimeScriptPlan(manifest) {
        const scriptLoadOrder = Array.isArray(manifest.scriptLoadOrder)
            ? manifest.scriptLoadOrder.slice()
            : [];
        if (scriptLoadOrder[0] !== 'logger.js' || scriptLoadOrder[1] !== 'config.js') {
            throw new Error('[LiveTranslatorLoader] runtime.scriptLoadOrder must begin with logger.js and config.js.');
        }
        return {
            preAssetScripts: scriptLoadOrder.slice(0, 2),
            postAssetScripts: scriptLoadOrder.slice(2),
        };
    }

    async function loadPreAssetScripts(scriptInjector, scriptPlan) {
        const preAssetScripts = scriptPlan.preAssetScripts;
        await scriptInjector.injectSupportScript(preAssetScripts[0]);
        const configuredLogger = createConfiguredLogger({});
        scriptInjector.setLogger(configuredLogger);

        for (const script of preAssetScripts.slice(1)) {
            await scriptInjector.injectSupportScript(script);
        }
        return configuredLogger;
    }

    async function bootstrap() {
        // Phase 0: confirm RPG Maker provided a browser document and the current plugin script.
        if (typeof document === 'undefined') {
            throw new Error('[LiveTranslatorLoader] No document context available.');
        }

        const loaderScript = document.currentScript;
        if (!loaderScript || !loaderScript.src) {
            throw new Error('[LiveTranslatorLoader] document.currentScript unavailable.');
        }

        if (typeof window === 'undefined') return;

        // Phase 1: claim bootstrap ownership so duplicate plugin loads do not race each other.
        const state = beginBootstrapState();
        if (!state) {
            console.log('[LiveTranslatorLoader] Bootstrap already completed or in progress, skipping.');
            return;
        }
        installLoaderModuleRegistry();
        installRuntimeModuleRegistry();

        let logger = null;
        try {
            // Phase 2: resolve the support folder next to live-translator-loader.js.
            const supportDir = resolveSupportDir(loaderScript);

            // Phase 3: load the install manifest, then the remaining manifest-declared loader helpers.
            const manifest = await loadRuntimeManifest(supportDir);
            const scriptPlan = createRuntimeScriptPlan(manifest);
            await loadLoaderHelpers(supportDir, manifest);
            const pathResolver = getLoaderModule('pathResolver');
            const scriptInjectorModule = getLoaderModule('scriptInjector');

            // Phase 4: create the ordered support-script injector.
            const scriptInjector = scriptInjectorModule.createScriptInjector({
                supportDir,
                document,
            });

            // Phase 5: publish runtime paths before logger/config/runtime modules read them.
            window.LiveTranslatorPaths = pathResolver.createRuntimePaths({
                loaderScript,
                supportDir,
            });

            // Phase 6: load the pre-asset scripts so logging and config asset application are available.
            logger = await loadPreAssetScripts(scriptInjector, scriptPlan);
            detectNwVersion(logger, manifest.minNwVersion);

            // Phase 7: fetch translator/settings/precache assets and apply them to runtime globals.
            const assets = await loadSupportFiles({
                supportDir,
                logger,
                manifest,
            });
            getConfigModule().applyAssets(assets, { scope: window, logger });
            logger = createConfiguredLogger(window.LiveTranslatorSettings);
            scriptInjector.setLogger(logger);

            // Phase 8: load the remaining runtime scripts in manifest order.
            await scriptInjector.injectSupportScripts(scriptPlan.postAssetScripts);

            // Phase 9: mark the loader ready only after every declared phase has completed.
            state.status = 'ready';
            state.readyAt = Date.now();
            window.LiveTranslatorLoaderBootstrapped = true;
            logger.info('[LiveTranslatorLoader] All scripts loaded.');
        } catch (err) {
            state.status = 'failed';
            state.failedAt = Date.now();
            state.error = err && err.message ? err.message : String(err);
            if (logger && typeof logger.error === 'function') {
                logger.error('[LiveTranslatorLoader] Failed during bootstrap:', err);
            }
            throw err;
        }
    }

    bootstrap().catch((err) => {
        try {
            setTimeout(() => { throw err; }, 0);
        } catch (_) {
            throw err;
        }
    });
})();
