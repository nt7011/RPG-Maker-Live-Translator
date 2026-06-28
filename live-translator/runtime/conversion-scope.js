// Conversion scope transaction boundary.
//
// Escape conversion may execute plugin code that redraws windows, mutates
// bitmaps, or pokes message state. This module makes that work read-only from
// the live UI's point of view: callers register the live objects they branched,
// and hook-owned routers send conversion-time UI calls to disposable sinks.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.conversionScope',
        factory() {
            const ROUTER_TOKEN = 'liveTranslator.conversionScope.router';
            const WINDOW_SNAPSHOT_FIELDS = [
                '_text',
                'text',
                '_lastNameText',
                'visible',
                'active',
                'openness',
                '_openness',
                'contentsOpacity',
                'x',
                'y',
                'width',
                'height',
                'contents',
            ];
            const BITMAP_SNAPSHOT_FIELDS = [
                '_canvas',
                '_context',
                '_baseTexture',
                '_dirty',
                'width',
                'height',
                'fontFace',
                'fontSize',
                'fontBold',
                'fontItalic',
                'textColor',
                'outlineColor',
                'outlineWidth',
                'paintOpacity',
            ];

            const transactionStack = [];
            let nextTransactionId = 0;

            function createTransaction(options = {}) {
                const transaction = {
                    __trConversionScopeTransaction: true,
                    id: ++nextTransactionId,
                    reason: stringify(options.reason || 'conversion'),
                    rootWindow: options.rootWindow || null,
                    gameMessage: options.gameMessage || null,
                    targets: new WeakMap(),
                    targetRecords: [],
                    snapshotTargets: new WeakMap(),
                    snapshots: [],
                    suppressedSideEffects: [],
                    active: false,
                };
                if (isObjectLike(transaction.gameMessage)) {
                    snapshotTarget(transaction, transaction.gameMessage, { role: 'gameMessage' });
                }
                return transaction;
            }

            function run(options, callback) {
                const transaction = isTransaction(options)
                    ? options
                    : createTransaction(options && typeof options === 'object' ? options : {});
                const runner = typeof callback === 'function'
                    ? callback
                    : (typeof options === 'function' ? options : null);
                if (typeof runner !== 'function') return undefined;

                transaction.active = true;
                transactionStack.push(transaction);
                try {
                    return runner();
                } finally {
                    transactionStack.pop();
                    restoreSnapshots(transaction);
                    transaction.active = false;
                }
            }

            function current() {
                return transactionStack.length ? transactionStack[transactionStack.length - 1] : null;
            }

            function isActive() {
                return !!current();
            }

            function registerTarget(transactionOrSource, sourceMaybe, sinkMaybe, detailsMaybe) {
                const resolved = resolveRegisterArguments(transactionOrSource, sourceMaybe, sinkMaybe, detailsMaybe);
                const transaction = resolved.transaction;
                const source = resolved.source;
                if (!isTransaction(transaction) || !isObjectLike(source)) return null;

                const details = resolved.details || {};
                const sink = isObjectLike(resolved.sink) ? resolved.sink : null;
                const role = normalizeRole(details.role || classifyTargetRole(source));
                let record = null;
                try { record = transaction.targets.get(source) || null; } catch (_) { record = null; }
                if (!record) {
                    record = {
                        source,
                        sink,
                        role,
                        details,
                    };
                    try { transaction.targets.set(source, record); } catch (_) {}
                    try { transaction.targetRecords.push(record); } catch (_) {}
                    snapshotTarget(transaction, source, { role, details });
                } else if (sink) {
                    record.sink = sink;
                }
                return record;
            }

            function getSink(source) {
                const record = findTargetRecord(source);
                return record && record.sink || null;
            }

            function getWindowSink(liveWindow) {
                return getSink(liveWindow);
            }

            function getBitmapSink(liveBitmap) {
                return getSink(liveBitmap);
            }

            function routeMutation(receiver, methodName, args = []) {
                const transaction = current();
                if (!transaction) return { handled: false, result: undefined };

                const name = stringify(methodName);
                const record = findTargetRecord(receiver);
                if (!record && !shouldSuppressUnregisteredReceiver(receiver)) {
                    return { handled: false, result: undefined };
                }
                if (record && record.sink && typeof record.sink[name] === 'function') {
                    try {
                        const result = record.sink[name].apply(record.sink, arrayFrom(args));
                        recordSuppressedSideEffect({
                            methodName: name,
                            role: record.role,
                            routed: true,
                            suppressed: false,
                        });
                        return { handled: true, result, routed: true, record };
                    } catch (error) {
                        recordSuppressedSideEffect({
                            methodName: name,
                            role: record.role,
                            routed: true,
                            suppressed: true,
                            error,
                        });
                        return { handled: true, result: defaultMutationResult(name, receiver), routed: true, record };
                    }
                }

                recordSuppressedSideEffect({
                    methodName: name,
                    role: record && record.role || classifyTargetRole(receiver),
                    routed: false,
                    suppressed: true,
                });
                return { handled: true, result: defaultMutationResult(name, receiver), routed: false, record };
            }

            function tryRouteMutation(receiver, methodName, args = []) {
                if (!isActive()) return null;
                const routed = routeMutation(receiver, methodName, args);
                return routed && routed.handled ? routed : null;
            }

            function createMutationRouter(methodName, original) {
                const name = stringify(methodName);
                if (!name || typeof original !== 'function') return original;
                if (hasRouterInChain(original)) return original;
                const wrapped = function(...args) {
                    const routed = tryRouteMutation(this, name, args);
                    if (routed) return routed.result;
                    return original.apply(this, args);
                };
                wrapped.__trConversionScopeRouter = ROUTER_TOKEN;
                wrapped.__trOriginal = original;
                return wrapped;
            }

            function recordSuppressedSideEffect(details = {}) {
                const transaction = current();
                if (!transaction) return null;
                const record = Object.assign({
                    reason: transaction.reason,
                    timestamp: Date.now(),
                }, details || {});
                try { transaction.suppressedSideEffects.push(record); } catch (_) {}
                return record;
            }

            function describeCurrent() {
                const transaction = current();
                if (!transaction) return null;
                return {
                    id: transaction.id,
                    reason: transaction.reason,
                    targetCount: transaction.targetRecords.length,
                    suppressedSideEffectCount: transaction.suppressedSideEffects.length,
                };
            }

            function resolveRegisterArguments(transactionOrSource, sourceMaybe, sinkMaybe, detailsMaybe) {
                if (isTransaction(transactionOrSource)) {
                    return {
                        transaction: transactionOrSource,
                        source: sourceMaybe,
                        sink: sinkMaybe,
                        details: detailsMaybe || {},
                    };
                }
                return {
                    transaction: current(),
                    source: transactionOrSource,
                    sink: sourceMaybe,
                    details: sinkMaybe || {},
                };
            }

            function findTargetRecord(source) {
                if (!isObjectLike(source)) return null;
                for (let index = transactionStack.length - 1; index >= 0; index -= 1) {
                    const transaction = transactionStack[index];
                    try {
                        const record = transaction.targets.get(source);
                        if (record) return record;
                    } catch (_) {}
                }
                return null;
            }

            function snapshotTarget(transaction, target, details = {}) {
                if (!isTransaction(transaction) || !isObjectLike(target)) return null;
                try {
                    if (transaction.snapshotTargets.has(target)) return null;
                    transaction.snapshotTargets.set(target, true);
                } catch (_) {}
                const snapshot = captureSnapshot(target, details);
                if (snapshot) {
                    try { transaction.snapshots.push(snapshot); } catch (_) {}
                }
                return snapshot;
            }

            function captureSnapshot(target, details = {}) {
                const keys = snapshotKeysForTarget(target, details && details.role);
                const descriptors = [];
                keys.forEach((key) => {
                    try {
                        const descriptor = Object.getOwnPropertyDescriptor(target, key);
                        if (!descriptor) {
                            const value = target[key];
                            descriptors.push({
                                key,
                                descriptor: null,
                                hadOwn: false,
                                value,
                                arrayItems: Array.isArray(value) ? value.slice() : null,
                            });
                            return;
                        }
                        descriptors.push({
                            key,
                            hadOwn: true,
                            descriptor: cloneDescriptor(descriptor),
                            arrayItems: Object.prototype.hasOwnProperty.call(descriptor, 'value') && Array.isArray(descriptor.value)
                                ? descriptor.value.slice()
                                : null,
                        });
                    } catch (_) {}
                });
                return {
                    target,
                    role: details && details.role || '',
                    keys,
                    descriptors,
                };
            }

            function snapshotKeysForTarget(target, role) {
                const normalizedRole = normalizeRole(role || classifyTargetRole(target));
                if (normalizedRole === 'window') {
                    return uniqueKeys(getOwnKeys(target).concat(
                        WINDOW_SNAPSHOT_FIELDS.filter((key) => hasOwnProperty(target, key) || canReadProperty(target, key))
                    ));
                }
                if (normalizedRole === 'bitmap') {
                    return BITMAP_SNAPSHOT_FIELDS.filter((key) => hasOwnProperty(target, key) || canReadProperty(target, key));
                }
                return getOwnKeys(target);
            }

            function restoreSnapshots(transaction) {
                if (!transaction || !Array.isArray(transaction.snapshots)) return;
                for (let index = transaction.snapshots.length - 1; index >= 0; index -= 1) {
                    restoreSnapshot(transaction.snapshots[index]);
                }
            }

            function restoreSnapshot(snapshot) {
                const target = snapshot && snapshot.target;
                if (!isObjectLike(target)) return;
                const shouldDeleteExtraKeys = snapshot.role === 'gameMessage' || snapshot.role === 'window';
                if (shouldDeleteExtraKeys) {
                    const expectedKeys = new Set(snapshot.keys || []);
                    getOwnKeys(target).forEach((key) => {
                        if (expectedKeys.has(key)) return;
                        try { delete target[key]; } catch (_) {}
                    });
                }
                (snapshot.descriptors || []).forEach((record) => {
                    if (!record) return;
                    if (!record.descriptor) {
                        restoreSnapshotValue(target, record);
                        return;
                    }
                    const descriptor = cloneDescriptor(record.descriptor);
                    try {
                        Object.defineProperty(target, record.key, descriptor);
                    } catch (_) {
                        if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
                            try { target[record.key] = descriptor.value; } catch (_) {}
                        }
                    }
                    if (record.arrayItems && Object.prototype.hasOwnProperty.call(descriptor, 'value') && Array.isArray(descriptor.value)) {
                        restoreArray(descriptor.value, record.arrayItems);
                    }
                });
            }

            function restoreSnapshotValue(target, record) {
                try {
                    if (!record.hadOwn) delete target[record.key];
                } catch (_) {}
                try {
                    target[record.key] = record.value;
                } catch (_) {}
                if (record.arrayItems && Array.isArray(record.value)) {
                    restoreArray(record.value, record.arrayItems);
                }
            }

            function cloneDescriptor(descriptor) {
                const clone = {
                    configurable: descriptor.configurable === true,
                    enumerable: descriptor.enumerable === true,
                };
                if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
                    clone.value = descriptor.value;
                    clone.writable = descriptor.writable === true;
                } else {
                    clone.get = descriptor.get;
                    clone.set = descriptor.set;
                }
                return clone;
            }

            function restoreArray(target, items) {
                if (!Array.isArray(target) || !Array.isArray(items)) return;
                try {
                    target.length = 0;
                    items.forEach((item, index) => {
                        target[index] = item;
                    });
                } catch (_) {}
            }

            function hasRouterInChain(fn) {
                let currentFn = fn;
                let depth = 0;
                while (typeof currentFn === 'function' && depth < 20) {
                    if (currentFn.__trConversionScopeRouter === ROUTER_TOKEN) return true;
                    currentFn = currentFn.__trOriginal;
                    depth += 1;
                }
                return false;
            }

            function shouldSuppressUnregisteredReceiver(receiver) {
                const role = classifyTargetRole(receiver);
                return role === 'window' || role === 'bitmap';
            }

            function classifyTargetRole(source) {
                if (isWindowLikeValue(source)) return 'window';
                if (isBitmapLikeValue(source)) return 'bitmap';
                return 'object';
            }

            function normalizeRole(role) {
                const value = stringify(role || '').toLowerCase();
                if (value === 'bitmap' || value === 'bitmap-sink') return 'bitmap';
                if (value === 'window' || value === 'window-sink') return 'window';
                if (value === 'gamemessage' || value === 'game-message') return 'gameMessage';
                return value || 'object';
            }

            function defaultMutationResult(methodName, receiver) {
                if (methodName === 'drawText' || methodName === 'drawTextEx' || methodName === 'drawTextEx2') return 0;
                if (methodName === 'refresh') return '';
                if (methodName === 'setText'
                    || methodName === 'show'
                    || methodName === 'hide'
                    || methodName === 'open'
                    || methodName === 'close'
                    || methodName === 'activate'
                    || methodName === 'deactivate'
                    || methodName === 'setBackgroundType') {
                    return receiver;
                }
                return undefined;
            }

            function getOwnKeys(value) {
                const keys = Object.getOwnPropertyNames(value);
                if (typeof Object.getOwnPropertySymbols === 'function') {
                    return keys.concat(Object.getOwnPropertySymbols(value));
                }
                return keys;
            }

            function uniqueKeys(keys) {
                const result = [];
                const seen = [];
                (Array.isArray(keys) ? keys : []).forEach((key) => {
                    if (seen.indexOf(key) >= 0) return;
                    seen.push(key);
                    result.push(key);
                });
                return result;
            }

            function hasOwnProperty(target, key) {
                try { return Object.prototype.hasOwnProperty.call(target, key); } catch (_) { return false; }
            }

            function canReadProperty(target, key) {
                try { return target[key] !== undefined; } catch (_) { return false; }
            }

            function arrayFrom(value) {
                return Array.isArray(value)
                    ? value
                    : Array.prototype.slice.call(value && typeof value.length === 'number' ? value : []);
            }

            function stringify(value) {
                return String(value ?? '');
            }

            function isTransaction(value) {
                return !!(value && value.__trConversionScopeTransaction === true);
            }

            function isObjectLike(value) {
                return !!value && (typeof value === 'object' || typeof value === 'function');
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
                createTransaction,
                run,
                current,
                isActive,
                registerTarget,
                getSink,
                getWindowSink,
                getBitmapSink,
                routeMutation,
                tryRouteMutation,
                createMutationRouter,
                recordSuppressedSideEffect,
                describeCurrent,
            };
        },
    });
})();
