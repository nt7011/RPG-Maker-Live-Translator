// Window lifecycle hooks for open, close, contents replacement, and pending redraws.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'hooks.window.lifecycle',
        requires: {
            windowBaseLifecycleHooks: 'hooks.window.baseLifecycle',
            lifecycleHelpers: 'hooks.window.lifecycleHelpers',
        },
        factory({ windowBaseLifecycleHooks, lifecycleHelpers }, { scope }) {
            const { hasHookInChain } = lifecycleHelpers;

            // Public lifecycle installer. Support modules own Window_Base wrappers and shared hook utilities.
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
                const WindowBase = scope && scope.Window_Base;
                if (!WindowBase || !WindowBase.prototype) {
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
                    const WindowMessage = scope && scope.Window_Message;
                    if (!WindowMessage
                        || !WindowMessage.prototype
                        || typeof WindowMessage.prototype.update !== 'function'
                        || hasHookInChain(WindowMessage.prototype.update, '__trMessageRenderSessionUpdateWrapped', true)) {
                        return;
                    }

                    const originalMessageUpdate = WindowMessage.prototype.update;
                    WindowMessage.prototype.update = function(...args) {
                        const result = originalMessageUpdate.apply(this, args);
                        try {
                            const applyPending = resolveApplyPendingMessageRedraw();
                            if (applyPending && this.visible && this.isOpen() && this.contents) applyPending(this);
                        } catch (error) {
                            logger.warn('[Window_Message.update pending redraw error]', error);
                        }
                        return result;
                    };
                    WindowMessage.prototype.update.__trMessageRenderSessionUpdateWrapped = true;
                    WindowMessage.prototype.update.__trOriginal = originalMessageUpdate;
                } catch (error) {
                    logger.warn('[Init] Window_Message update hook error', error);
                }
            }

            return {
                install: installWindowLifecycleHooks,
            };
        },
    });

})();
