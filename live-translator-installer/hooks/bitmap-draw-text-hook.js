// Bitmap drawText hook installer facade. Implementation lives in hooks/bitmap/*.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.hooks) {
        globalScope.LiveTranslatorModules.hooks = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function' || typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/bitmap-draw-text-hook.js.');
    }

    function requireBitmapModule(name, loadHint) {
        const module = requireRuntimeModule(`hooks.bitmap.${name}`);
        if (module && (typeof module.attach === 'function' || typeof module.createRuntime === 'function' || typeof module.install === 'function')) {
            return module;
        }
        throw new Error(`[LiveTranslator] hooks/bitmap/${loadHint} module missing; ensure it loads before bitmap-draw-text-hook.js.`);
    }

    function installBitmapDrawTextHook(context = {}) {
        const logger = context.logger || console;
        const diag = typeof context.diag === 'function' ? context.diag : () => {};
        try {
            if (typeof Bitmap === 'undefined' || !Bitmap || !Bitmap.prototype) {
                diag('[bitmap/init] Bitmap unavailable; skipping bitmap hooks.');
                return {
                    status: 'skipped',
                    reason: 'Bitmap is unavailable.',
                };
            }

            if (Bitmap.prototype.drawText
                && Bitmap.prototype.drawText.__trBitmapWrapper === 'liveTranslator.bitmapDrawWrapper') {
                diag('[bitmap/init] Bitmap draw hooks already installed.');
                return {
                    status: 'installed',
                    reason: 'Bitmap draw hooks were already installed.',
                };
            }

            const common = requireBitmapModule('common', 'common.js');
            const runtime = common.createRuntime(context);
            requireBitmapModule('state', 'state.js').attach(runtime);
            requireBitmapModule('replay', 'replay.js').attach(runtime);
            requireBitmapModule('translation', 'translation.js').attach(runtime);
            requireBitmapModule('aggregation', 'aggregation.js').attach(runtime);
            requireBitmapModule('invalidation', 'invalidation.js').attach(runtime);
            return requireBitmapModule('drawWrapper', 'draw-wrapper.js').install(runtime);
        } catch (error) {
            logger.error('[bitmap/init-error]', error);
            return {
                status: 'failed',
                reason: error && error.message ? error.message : String(error || 'bitmap hook error'),
            };
        }
    }

    defineRuntimeModule('hooks.bitmapDrawText', {
        install: installBitmapDrawTextHook,
    });
})();
