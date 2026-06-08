// Window lifecycle hooks for open, close, contents replacement, and pending redraws.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/window-lifecycle-hooks.js.');
    }

    // Public lifecycle installer. Support modules own Window_Base wrappers and shared hook utilities.
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before hooks/window-lifecycle-hooks.js.');
    }
    const windowBaseLifecycleHooks = requireRuntimeModule('hooks.windowBaseLifecycleHooks');
    const { hasHookInChain } = requireRuntimeModule('hooks.windowLifecycleHelpers');
    
    function installWindowLifecycleHooks(options = {}) {
            const {
                logger,
                dbg = () => {},
                windowLifecycle = null,
                windowRegistry,
                addWindowToRegistry,
                registerWindowLifecyclePrototypeInstaller = null,
                unregisterWindow,
                getWindowTextHelpers = null,
                getWindowDrawHelpers = null,
                getGameMessageHelpers = null,
            } = options;
    
            if (!logger
                || !windowRegistry
                || typeof addWindowToRegistry !== 'function'
                || typeof unregisterWindow !== 'function') {
                throw new Error('[WindowLifecycleHooks] Missing required dependencies.');
            }
            if (typeof Window_Base === 'undefined' || !Window_Base || !Window_Base.prototype) {
                return {
                    status: 'skipped',
                    reason: 'Window_Base is unavailable.',
                };
            }
    
            windowBaseLifecycleHooks.install({
                logger,
                dbg,
                windowLifecycle,
                windowRegistry,
                addWindowToRegistry,
                registerWindowLifecyclePrototypeInstaller,
                unregisterWindow,
                getWindowTextHelpers,
                getWindowDrawHelpers,
            });
            installMessagePendingRedrawHook({ logger, getGameMessageHelpers });
            return {
                status: 'installed',
                reason: 'Window_Base lifecycle hooks installed.',
            };
        }
    
    function installMessagePendingRedrawHook(context) {
            const {
                logger,
                getGameMessageHelpers,
            } = context;
    
            const resolveGameMessageHelpers = () => {
                if (typeof getGameMessageHelpers !== 'function') return null;
                try {
                    return getGameMessageHelpers() || null;
                } catch (_) {
                    return null;
                }
            };
            const resolveApplyPendingMessageRedraw = () => {
                const helpers = resolveGameMessageHelpers();
                return helpers && typeof helpers.applyPendingMessageRedraw === 'function'
                    ? helpers.applyPendingMessageRedraw
                    : null;
            };
            if (typeof getGameMessageHelpers !== 'function') return;
    
            try {
                if (typeof Window_Message === 'undefined'
                    || !Window_Message
                    || !Window_Message.prototype
                    || typeof Window_Message.prototype.update !== 'function'
                    || hasHookInChain(Window_Message.prototype.update, '__trMessageRenderSessionUpdateWrapped', true)) {
                    return;
                }
    
                const originalMessageUpdate = Window_Message.prototype.update;
                Window_Message.prototype.update = function(...args) {
                    const result = originalMessageUpdate.apply(this, args);
                    try {
                        const applyPending = resolveApplyPendingMessageRedraw();
                        if (applyPending && this.visible && this.isOpen() && this.contents) applyPending(this);
                    } catch (error) {
                        logger.warn('[Window_Message.update pending redraw error]', error);
                    }
                    return result;
                };
                Window_Message.prototype.update.__trMessageRenderSessionUpdateWrapped = true;
                Window_Message.prototype.update.__trOriginal = originalMessageUpdate;
            } catch (error) {
                logger.warn('[Init] Window_Message update hook error', error);
            }
        }
    
    defineRuntimeModule('hooks.windowLifecycle', {
        install: installWindowLifecycleHooks,
    });

})();
