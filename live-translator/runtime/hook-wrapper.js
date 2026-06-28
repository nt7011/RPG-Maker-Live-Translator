// Shared hook-wrapper helpers.
//
// This module intentionally stays small: it only standardizes chain detection
// and method marker installation. Hook-specific behavior still lives with the
// adapter that owns the hook.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.hookWrapper',
        factory() {
            function hasHookInChain(fn, property, token) {
                const seen = [];
                let current = typeof fn === 'function' ? fn : null;
                while (current && seen.indexOf(current) < 0) {
                    if (current[property] === token) return true;
                    seen.push(current);
                    current = typeof current.__trOriginal === 'function' ? current.__trOriginal : null;
                }
                return false;
            }

            function markWrappedFunction(wrapped, original, property, token) {
                if (typeof wrapped !== 'function') return wrapped;
                try { wrapped.__trOriginal = original; } catch (_) {}
                if (property) {
                    try { wrapped[property] = token; } catch (_) {}
                }
                return wrapped;
            }

            function installMethodWrapper(target, methodName, options = {}) {
                if (!target || !methodName || typeof target[methodName] !== 'function') return false;
                const property = String(options.property || options.marker || '');
                const token = Object.prototype.hasOwnProperty.call(options, 'token') ? options.token : true;
                const current = target[methodName];
                if (property && hasHookInChain(current, property, token)) return true;
                if (typeof options.createWrapper !== 'function') return false;
                const wrapped = options.createWrapper(current, {
                    target,
                    methodName,
                    property,
                    token,
                });
                if (typeof wrapped !== 'function') return false;
                target[methodName] = markWrappedFunction(wrapped, current, property, token);
                return true;
            }

            return {
                hasHookInChain,
                installMethodWrapper,
                markWrappedFunction,
            };
        },
    });
})();
