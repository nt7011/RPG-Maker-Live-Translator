(() => {
    'use strict';

    const SUPPORT_SCRIPTS = [
        'translator.js',
        'window-helpers.js',
        'control-code-helpers.js',
        'hooks.js',
        'disk-cache.js',
        'window-draw-hooks.js',
        'translation-manager.js',
        'text-replacement-addon.js',
    ];
    const SUPPORT_FILES = ['translator.json', 'settings.json'];
    const MIN_NW_VERSION = '0.105.0';
    const DIAGNOSTICS_FILE = 'diagnostics.log';

    function resolveDiagnosticsPath() {
        try {
            const req = (typeof require === 'function')
                ? require
                : (typeof window !== 'undefined' && typeof window.require === 'function' ? window.require : null);
            if (!req || typeof process === 'undefined') return null;
            const fs = req('fs');
            const path = req('path');
            const cwd = typeof process.cwd === 'function' ? process.cwd() : null;
            if (!cwd || typeof cwd !== 'string') return null;
            const full = path.join(cwd, DIAGNOSTICS_FILE);
            return { fs, full };
        } catch (_) {
            return null;
        }
    }

    const earlyDiag = (() => {
        const resolved = resolveDiagnosticsPath();
        if (!resolved) return { log: () => {}, init: () => {} };
        const { fs, full } = resolved;
        const enqueue = (line) => {
            try {
                if (fs && fs.promises && typeof fs.promises.appendFile === 'function') {
                    fs.promises.appendFile(full, line, 'utf8').catch(() => {});
                } else if (fs && typeof fs.appendFile === 'function') {
                    fs.appendFile(full, line, 'utf8', () => {});
                }
            } catch (_) {}
        };
        return {
            init: () => {
                try {
                    if (fs && typeof fs.writeFileSync === 'function') {
                        fs.writeFileSync(full, '', { flag: 'w' });
                        return;
                    }
                } catch (_) {}
            },
            log: (level, message, err) => {
                try {
                    const ts = new Date().toISOString();
                    const parts = [ts, level, message];
                    if (err && err.stack) parts.push(err.stack);
                    else if (err) parts.push(String(err));
                    enqueue(parts.join(' | ') + '\n');
                } catch (_) {}
            }
        };
    })();

    function makeFallbackLogger() {
        const consoleRef = typeof console !== 'undefined' ? console : {};
        const safe = (method, fallback) => {
            const fn = consoleRef[method];
            if (typeof fn === 'function') return fn.bind(consoleRef);
            return fallback;
        };
        return {
            info: safe('info', () => {}),
            warn: safe('warn', safe('log', () => {})),
            error: safe('error', safe('warn', () => {})),
            debug: safe('debug', safe('log', () => {})),
        };
    }

    function resolveSupportDir(loaderScript) {
        try {
            const base = new URL(loaderScript.src, window.location.href);
            return new URL('./live-translator/', base).href;
        } catch (err) {
            console.error('[LiveTranslatorLoader] Could not resolve support directory:', err);
            return null;
        }
    }

    function injectScript(url) {
        return new Promise((resolve, reject) => {
            const tag = document.createElement('script');
            tag.src = url;
            tag.async = false;
            tag.onload = resolve;
            tag.onerror = () => reject(new Error(`Failed to load ${url}`));
            document.head.appendChild(tag);
        });
    }

    async function loadSupportFiles(supportDir, logger) {
        const assets = {};
        await Promise.all(
            SUPPORT_FILES.map(async (file) => {
                const url = new URL(file, supportDir).href;
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const err = new Error(`HTTP ${response.status} ${response.statusText}`);
                        err.code = 'HTTP';
                        throw err;
                    }
                    const text = await response.text();
                    const lower = file.toLowerCase();
                    if (lower.endsWith('.json')) {
                        try {
                            assets[file] = {
                                raw: text,
                                json: JSON.parse(text)
                            };
                        } catch (parseErr) {
                            const msg = `[LiveTranslatorLoader][Fatal] ${file} is present but invalid JSON. Re-copy the plugin files.`;
                            logger.error(msg, parseErr);
                            throw new Error(msg);
                        }
                    } else {
                        assets[file] = { raw: text };
                    }
                    logger.debug(`[LiveTranslatorLoader] Loaded asset ${file}`);
                } catch (err) {
                    const msg = `[LiveTranslatorLoader][Fatal] Missing or unreadable asset ${file} (expected in live-translator folder next to live-translator-loader.js).`;
                    logger.error(msg, err);
                    throw err;
                }
            })
        );
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

    function detectNwVersion(logger) {
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

            const cmp = compareVersions(nwVersion, MIN_NW_VERSION);
            if (cmp < 0) {
                logger.warn(`[LiveTranslator][Compat] Detected NW.js version ${nwVersion}; below minimum ${MIN_NW_VERSION}. Update NW.js to avoid syntax errors and translation issues.`);
            } else {
                logger.debug(`[LiveTranslator] Detected NW.js version ${nwVersion}.`);
            }
        } catch (err) {
            logger.warn('[LiveTranslator] Failed to check NW.js version:', err);
        }
    }

    function validateDeepLConfig(deepl, isActiveProvider, logger) {
        if (!deepl || typeof deepl !== 'object') {
            const msg = '[LiveTranslator][Config] translator.json missing "settings.deepl" object for DeepL provider.';
            if (isActiveProvider) throw new Error(msg);
            logger.warn(msg);
            return;
        }
        const apiKeyRaw = typeof deepl.apiKey === 'string' ? deepl.apiKey : '';
        const apiKey = apiKeyRaw.trim();

        const msgMissing = '[LiveTranslator][Config] translator.json missing "settings.deepl.apiKey"; DeepL requests will fail.';
        const msgWhitespace = '[LiveTranslator][Config] settings.deepl.apiKey contains whitespace; check copy/paste and remove spaces.';
        const msgUnderscore = '[LiveTranslator][Config] settings.deepl.apiKey contains underscore; DeepL keys typically use hyphens. Verify the key.';

        if (!apiKey) {
            if (isActiveProvider) {
                logger.error(msgMissing);
                throw new Error(msgMissing);
            }
            logger.warn(msgMissing);
            return;
        }
        if (/\s/.test(apiKeyRaw)) {
            if (isActiveProvider) {
                const err = new Error(msgWhitespace);
                logger.error(msgWhitespace);
                throw err;
            }
            logger.warn(msgWhitespace);
        }
        if (/_/.test(apiKeyRaw)) {
            if (isActiveProvider) {
                const err = new Error(msgUnderscore);
                logger.error(msgUnderscore);
                throw err;
            }
            logger.warn(msgUnderscore);
        }
    }

    function validateGameMessageSettings(settings, logger) {
        if (!settings || typeof settings !== 'object') return;
        const gameMessage = settings.gameMessage;
        if (!gameMessage || typeof gameMessage !== 'object') return;

        const raw = gameMessage.textScale;
        if (raw === undefined || raw === null || raw === '') return;

        const numeric = Number(raw);
        if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) {
            logger.warn('[LiveTranslator][Config] settings.json "gameMessage.textScale" should be an integer from 1 to 100. Falling back to 100.');
        }
    }

    function validateTranslationSettings(settings, logger) {
        if (!settings || typeof settings !== 'object') return;
        const translation = settings.translation;
        if (!translation || typeof translation !== 'object') return;

        const raw = Object.prototype.hasOwnProperty.call(translation, 'maxOutputTokens')
            ? translation.maxOutputTokens
            : translation.max_output_tokens;
        if (raw === undefined || raw === null || raw === '') return;

        const numeric = Number(raw);
        if (!Number.isInteger(numeric) || numeric <= 0) {
            logger.warn('[LiveTranslator][Config] settings.json "translation.maxOutputTokens" should be a positive integer. Falling back to 512.');
        }
    }

    function validateJsonSanity(assets, logger) {
        const cfg = assets['translator.json'] && assets['translator.json'].json;
        if (!cfg || typeof cfg !== 'object') {
            throw new Error('[LiveTranslator][Config] translator.json missing or invalid.');
        }

        const provider = (cfg.provider || '').toString().trim().toLowerCase();
        if (!provider) {
            throw new Error('[LiveTranslator][Config] translator.json missing required "provider" string (deepl/local/none).');
        }
        if (!cfg.settings || typeof cfg.settings !== 'object') {
            throw new Error('[LiveTranslator][Config] translator.json missing required "settings" object.');
        }

        if (provider === 'deepl') {
            validateDeepLConfig(cfg.settings.deepl, true, logger);
        } else if (provider === 'local') {
            validateDeepLConfig(cfg.settings.deepl, false, logger);
            const local = cfg.settings.local;
            if (!local || typeof local !== 'object') {
                throw new Error('[LiveTranslator][Config] translator.json missing "settings.local" object for local provider.');
            } else if (!local.model || typeof local.model !== 'string' || !local.model.trim()) {
                logger.warn('[LiveTranslator][Config] translator.json missing "settings.local.model"; local LLM requests will fail.');
            }
        } else if (provider === 'none') {
            // Cache-only mode intentionally skips external provider validation.
        } else {
            throw new Error(`[LiveTranslator][Config] translator.json contains unsupported provider "${cfg.provider}".`);
        }

        const settings = assets['settings.json'] && assets['settings.json'].json;
        if (!settings || typeof settings !== 'object') {
            throw new Error('[LiveTranslator][Config] settings.json missing or invalid.');
        }
        validateGameMessageSettings(settings, logger);
        validateTranslationSettings(settings, logger);
    }

    async function bootstrap() {
        if (typeof document === 'undefined') {
            console.error('[LiveTranslatorLoader] No document context available.');
            return;
        }

        const loaderScript = document.currentScript;
        if (!loaderScript || !loaderScript.src) {
            console.error('[LiveTranslatorLoader] document.currentScript unavailable.');
            return;
        }

        if (typeof window === 'undefined') return;
        if (window.LiveTranslatorLoaderBootstrapped) {
            console.log('[LiveTranslatorLoader] Bootstrap already completed, skipping.');
            return;
        }
        window.LiveTranslatorLoaderBootstrapped = true;

        const fallbackLogger = makeFallbackLogger();
        const diagLogger = {
            error: (msg, err) => { earlyDiag.log('ERROR', msg, err); fallbackLogger.error(msg, err); },
            warn: (msg, err) => { earlyDiag.log('WARN', msg, err); fallbackLogger.warn(msg, err); },
            info: (msg, err) => { earlyDiag.log('INFO', msg, err); fallbackLogger.info(msg, err); },
            debug: (msg, err) => { fallbackLogger.debug(msg, err); },
        };

        try { if (typeof earlyDiag.init === 'function') earlyDiag.init(); } catch (_) {}

        const supportDir = resolveSupportDir(loaderScript);
        if (!supportDir) return;
        if (!window.LiveTranslatorAssets) window.LiveTranslatorAssets = {};

        let logger = diagLogger;

        try {
            const loggerUrl = new URL('logger.js', supportDir).href;
            await injectScript(loggerUrl);
            if (globalThis.LiveTranslatorModules && typeof globalThis.LiveTranslatorModules.createLoggerBundle === 'function') {
                const bundle = globalThis.LiveTranslatorModules.createLoggerBundle({
                    settings: window.LiveTranslatorSettings || {},
                    maxLogsPerFrame: 1000,
                });
                if (bundle && bundle.logger) {
                    logger = bundle.logger;
                }
            }
        } catch (err) {
            diagLogger.error('[LiveTranslatorLoader] Failed to load logger.js:', err);
        }

        detectNwVersion(logger);

        try {
            const assets = await loadSupportFiles(supportDir, logger);
            Object.assign(window.LiveTranslatorAssets, assets);
            if (assets['translator.json'] && assets['translator.json'].json) {
                window.LiveTranslatorConfig = assets['translator.json'].json;
            }
            if (assets['settings.json'] && assets['settings.json'].json) {
                window.LiveTranslatorSettings = assets['settings.json'].json;
            }
            validateJsonSanity(assets, logger);
        } catch (err) {
            logger.error('[LiveTranslatorLoader] Failed while loading support assets:', err);
            throw err;
        }

        try {
            for (const script of SUPPORT_SCRIPTS) {
                const url = new URL(script, supportDir).href;
                await injectScript(url);
                logger.debug(`[LiveTranslatorLoader] Loaded script ${script}`);
                if (script === 'translator.js'
                    && window.LiveTranslatorConfig
                    && String(window.LiveTranslatorConfig.provider || '').trim().toLowerCase() === 'local'
                    && window.TextProcessor
                    && typeof window.TextProcessor.validateConfiguredLocalModel === 'function') {
                    await window.TextProcessor.validateConfiguredLocalModel();
                    logger.debug('[LiveTranslatorLoader] Validated configured local model selection.');
                }
            }
            logger.info('[LiveTranslatorLoader] All scripts loaded.');
            try { earlyDiag.log('INFO', '[LiveTranslatorLoader] Bootstrap completed successfully'); } catch (_) {}
        } catch (err) {
            logger.error('[LiveTranslatorLoader] Failed while loading support scripts:', err);
            throw err;
        }
    }

    bootstrap().catch((err) => {
        try {
            earlyDiag.log('FATAL', '[LiveTranslatorLoader] Unhandled error during bootstrap', err);
        } catch (_) {}
        try {
            setTimeout(() => { throw err; }, 0);
        } catch (_) {
            throw err;
        }
    });
})();
