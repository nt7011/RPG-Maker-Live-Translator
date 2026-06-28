// Shared conversion-branch helpers.
//
// Escape conversion often executes plugin code through a Window receiver. These
// helpers preserve read access to live state while redirecting writes, draws,
// and UI calls into disposable branches.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.conversionBranch',
        factory() {
            function createWindowBranch(windowInstance, options = {}) {
                if (!isObjectLike(windowInstance)) return windowInstance;
                const seen = new WeakMap();
                const branch = createWindowSink(windowInstance, seen, options);
                try { branch._trEvaluationOnly = true; } catch (_) {}
                if (options && options.gameMessageBranch) {
                    try { branch._gameMessage = options.gameMessageBranch; } catch (_) {}
                }
                installSubWindowBranch(windowInstance, branch, seen, options);
                return branch;
            }

            function createObjectBranch(source, options = {}) {
                if (!isObjectLike(source)) return {};
                const prototype = typeof Object.getPrototypeOf === 'function'
                    ? Object.getPrototypeOf(source)
                    : null;
                const branch = Object.create(prototype || null);
                copyBranchProperties(source, branch, new WeakMap(), Object.assign({ uiSinks: false }, options));
                return branch;
            }

            function copyBranchProperties(source, target, seen, options = {}) {
                if (!isObjectLike(source) || !isObjectLike(target)) return target;
                getOwnKeys(source).forEach((key) => {
                    try {
                        const descriptor = Object.getOwnPropertyDescriptor(source, key);
                        if (!descriptor) return;
                        const cloned = Object.assign({}, descriptor);
                        if (Object.prototype.hasOwnProperty.call(cloned, 'value')) {
                            cloned.value = createBranchValue(key, cloned.value, seen, options);
                        }
                        Object.defineProperty(target, key, cloned);
                    } catch (_) {
                        try { target[key] = createBranchValue(key, source[key], seen, options); } catch (_) {}
                    }
                });
                return target;
            }

            function createBranchValue(key, value, seen, options = {}) {
                const replacement = resolveReplacement(key, value, options);
                if (replacement.handled) return replacement.value;
                if (!isObjectLike(value)) return value;
                if (options.uiSinks === true && isWindowLikeValue(value)) {
                    return createWindowSink(value, seen, options);
                }
                if (options.uiSinks === true && isBitmapLikeValue(value)) {
                    return createBitmapSink(value, seen, options);
                }
                if (Array.isArray(value)) return cloneArray(value, seen, options);
                if (isPlainObject(value)) return clonePlainObject(value, seen, options);
                return value;
            }

            function resolveReplacement(key, value, options = {}) {
                if (typeof options.replaceValue === 'function') {
                    try {
                        const replacement = options.replaceValue(key, value);
                        if (replacement && replacement.handled === true) {
                            return { handled: true, value: replacement.value };
                        }
                    } catch (_) {}
                }
                if (options.gameMessageBranch && isLikelyGameMessageKey(key, value, options.globalGameMessage)) {
                    return { handled: true, value: options.gameMessageBranch };
                }
                return { handled: false, value };
            }

            function cloneArray(value, seen, options = {}) {
                if (!Array.isArray(value)) return value;
                if (seen.has(value)) return seen.get(value);
                const clone = [];
                seen.set(value, clone);
                value.forEach((item, index) => {
                    clone[index] = createBranchValue('', item, seen, options);
                });
                return clone;
            }

            function clonePlainObject(value, seen, options = {}) {
                if (!isObjectLike(value)) return value;
                if (seen.has(value)) return seen.get(value);
                const clone = Object.create(Object.getPrototypeOf(value) || null);
                seen.set(value, clone);
                return copyBranchProperties(value, clone, seen, options);
            }

            function createWindowSink(windowLike, seen = new WeakMap(), options = {}) {
                if (!isObjectLike(windowLike)) return windowLike;
                if (seen.has(windowLike)) return seen.get(windowLike);
                const sink = Object.create(windowLike);
                seen.set(windowLike, sink);
                registerBranchSink(windowLike, sink, options, 'window');
                copyBranchProperties(windowLike, sink, seen, Object.assign({}, options, { uiSinks: true }));
                defineDataProperty(sink, 'contents', createBitmapSink(windowLike.contents, seen, options));
                sink.setText = function(value) {
                    this._text = String(value || '');
                    this.text = this._text;
                    return this;
                };
                sink.refresh = function() { return ''; };
                sink.drawText = function() { return 0; };
                sink.drawTextEx = function() { return 0; };
                sink.drawTextEx2 = function() { return 0; };
                sink.createContents = function() {
                    if (!this.contents) {
                        defineDataProperty(this, 'contents', createBitmapSink(windowLike.contents, seen, options));
                    }
                    return this.contents;
                };
                sink.show = function() {
                    this.visible = true;
                    return this;
                };
                sink.hide = function() {
                    this.visible = false;
                    return this;
                };
                sink.open = function() {
                    this.openness = 255;
                    this._openness = 255;
                    return this;
                };
                sink.close = function() {
                    this.openness = 0;
                    this._openness = 0;
                    return this;
                };
                sink.activate = function() {
                    this.active = true;
                    return this;
                };
                sink.deactivate = function() {
                    this.active = false;
                    return this;
                };
                sink.update = function() { return undefined; };
                sink.setBackgroundType = function(value) {
                    this._background = value;
                    return this;
                };
                installSubWindowBranch(windowLike, sink, seen, options);
                return sink;
            }

            function installSubWindowBranch(windowLike, sink, seen, options = {}) {
                if (!windowLike || typeof windowLike.subWindows !== 'function' || !sink) return;
                const subWindowSinks = new WeakMap();
                sink.subWindows = function() {
                    try {
                        const subWindows = windowLike.subWindows.call(windowLike);
                        if (!Array.isArray(subWindows)) return subWindows;
                        return subWindows.map((subWindow) => {
                            if (!isObjectLike(subWindow)) return subWindow;
                            if (!subWindowSinks.has(subWindow)) {
                                subWindowSinks.set(subWindow, createWindowSink(subWindow, seen, options));
                            }
                            return subWindowSinks.get(subWindow);
                        });
                    } catch (_) {
                        return [];
                    }
                };
            }

            function createBitmapSink(bitmapLike, seen = new WeakMap(), options = {}) {
                if (!isObjectLike(bitmapLike)) {
                    return {
                        clear() {},
                        clearRect() {},
                        drawText() { return 0; },
                        blt() {},
                        measureTextWidth(value) { return String(value || '').length; },
                    };
                }
                if (seen.has(bitmapLike)) return seen.get(bitmapLike);
                const sink = Object.create(bitmapLike);
                seen.set(bitmapLike, sink);
                registerBranchSink(bitmapLike, sink, options, 'bitmap');
                copyBranchProperties(bitmapLike, sink, seen, Object.assign({}, options, { uiSinks: false }));
                sink.clear = function() { return undefined; };
                sink.clearRect = function() { return undefined; };
                sink.drawText = function() { return 0; };
                sink.blt = function() { return undefined; };
                sink.measureTextWidth = typeof bitmapLike.measureTextWidth === 'function'
                    ? function(value) {
                        try { return bitmapLike.measureTextWidth.call(bitmapLike, value); } catch (_) { return String(value || '').length; }
                    }
                    : function(value) { return String(value || '').length; };
                return sink;
            }

            function registerBranchSink(source, sink, options = {}, role = '') {
                const conversionScope = options && options.conversionScope;
                if (!conversionScope || typeof conversionScope.registerTarget !== 'function') return false;
                try {
                    if (options && options.conversionTransaction) {
                        return !!conversionScope.registerTarget(
                            options.conversionTransaction,
                            source,
                            sink,
                            { role: role || '' }
                        );
                    }
                    return !!conversionScope.registerTarget(source, sink, { role: role || '' });
                } catch (_) {
                    return false;
                }
            }

            function defineDataProperty(target, key, value) {
                try {
                    // MV exposes Window#contents through an accessor that mutates the
                    // live contents sprite. Shadow it on the branch so conversion never
                    // swaps the on-screen bitmap.
                    Object.defineProperty(target, key, {
                        value,
                        writable: true,
                        configurable: true,
                        enumerable: true,
                    });
                    return true;
                } catch (_) {
                    try { target[key] = value; } catch (_) {}
                    return false;
                }
            }

            function isLikelyGameMessageKey(key, value, globalGameMessage) {
                if (key === '_gameMessage' || key === 'gameMessage') return true;
                return !!(globalGameMessage && value === globalGameMessage);
            }

            function getOwnKeys(value) {
                const keys = Object.getOwnPropertyNames(value);
                if (typeof Object.getOwnPropertySymbols === 'function') {
                    return keys.concat(Object.getOwnPropertySymbols(value));
                }
                return keys;
            }

            function isObjectLike(value) {
                return !!value && (typeof value === 'object' || typeof value === 'function');
            }

            function isPlainObject(value) {
                if (!value || typeof value !== 'object') return false;
                const prototype = Object.getPrototypeOf(value);
                return prototype === Object.prototype || prototype === null;
            }

            function isWindowLikeValue(value) {
                return isObjectLike(value)
                    && (typeof value.open === 'function'
                        || typeof value.close === 'function'
                        || typeof value.activate === 'function'
                        || typeof value.deactivate === 'function'
                        || typeof value.drawText === 'function'
                        || typeof value.drawTextEx === 'function');
            }

            function isBitmapLikeValue(value) {
                return isObjectLike(value)
                    && (typeof value.clear === 'function'
                        || typeof value.clearRect === 'function'
                        || typeof value.drawText === 'function'
                        || typeof value.blt === 'function'
                        || typeof value.measureTextWidth === 'function');
            }

            return {
                createWindowBranch,
                createObjectBranch,
                copyBranchProperties,
                createWindowSink,
                createBitmapSink,
                defineDataProperty,
                registerBranchSink,
                isObjectLike,
                isPlainObject,
            };
        },
    });
})();
