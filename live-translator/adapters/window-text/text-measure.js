// Window text adapter support: text measure.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/text-measure.js.');
    }

    function createTextMeasureController(context = {}) {
    const { perf, textCodec, stripControls, createTextSource, restoreText, ADAPTER_ID } = context;
    const { lifecycle: lifecycleService, surface: surfaceService } = context.services;
    const { entryRecords } = context.facades;
    const { getEntryStatus } = entryRecords;

    const WINDOW_TEXT_PERF_DOMAIN = 'translator-render.windowText';

    function isPerfEnabled() {
                if (!perf) return false;
                if (typeof perf.isEnabled === 'function') {
                    try { return perf.isEnabled() === true; } catch (_) { return false; }
                }
                return typeof perf.count === 'function' || typeof perf.time === 'function' || typeof perf.top === 'function';
            }

    function perfNow() {
                try {
                    if (perf && typeof perf.now === 'function') return Number(perf.now()) || 0;
                } catch (_) {}
                try {
                    if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
                        return performance.now();
                    }
                } catch (_) {}
                return Date.now();
            }

    function perfStart() {
                return isPerfEnabled() ? perfNow() : null;
            }

    function perfCount(name, amount = 1, domain = WINDOW_TEXT_PERF_DOMAIN) {
                if (!perf || typeof perf.count !== 'function') return;
                try { perf.count(name, amount, { domain }); } catch (_) {}
            }

    function perfElapsed(name, start, domain = WINDOW_TEXT_PERF_DOMAIN) {
                if (!perf || typeof perf.time !== 'function') return;
                if (start === null || start === undefined) return;
                const value = Number(start);
                if (!Number.isFinite(value)) return;
                try { perf.time(name, Math.max(0, perfNow() - value), { domain }); } catch (_) {}
            }

    function perfTop(group, label, amount = 1, domain = WINDOW_TEXT_PERF_DOMAIN) {
                if (!perf || typeof perf.top !== 'function') return;
                try { perf.top(group, label, amount, { domain }); } catch (_) {}
            }
    
    function estimateEntryBounds(windowInstance, type, text, x, y, convertedText, originalParams = null) {
                const measureStart = perfStart();
                perfCount('windowText.measure.estimateEntryBounds.calls');
                perfTop('windowText.measure.estimateEntryBounds.type', type || 'unknown');
                try {
                    const drawX = normalizeDrawableCoordinate(x);
                    const drawY = normalizeDrawableCoordinate(y);
                    if (drawX === null || drawY === null) return null;

                    const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                    const lineHeight = type === 'drawTextEx'
                        ? getDrawTextExBaseLineHeight(windowInstance, contents, originalParams)
                        : getLineHeight(windowInstance, contents, originalParams);
                    const richText = String(convertedText || text || '');
                    const visible = stripControls(richText);
                    let width = 0;
                    let height = lineHeight;
    
                    try {
                        if (type === 'drawTextEx' && windowInstance && typeof windowInstance.textSizeEx === 'function') {
                            const textSizeStart = perfStart();
                            perfCount('windowText.measure.textSizeEx.calls');
                            perfTop('windowText.measure.textSizeEx.type', type || 'unknown');
                            let size = null;
                            try {
                                size = windowInstance.textSizeEx(richText);
                            } finally {
                                perfElapsed('windowText.measure.textSizeEx.ms', textSizeStart);
                            }
                            width = Math.max(
                                Math.ceil(Number(size && size.width) || 0),
                                estimateDrawTextExFallbackWidth(windowInstance, contents, richText, visible, lineHeight)
                            );
                            if (size && Number.isFinite(Number(size.height))) {
                                height = Math.max(height, Math.ceil(Number(size.height)));
                            }
                        } else if (type === 'drawTextEx') {
                            width = estimateDrawTextExFallbackWidth(windowInstance, contents, richText, visible, lineHeight);
                        } else {
                            width = measurePlainTextWidth(windowInstance, contents, visible, lineHeight);
                        }
                    } catch (_) {}
    
                    if (!width || !Number.isFinite(width)) {
                        width = type === 'drawTextEx'
                            ? estimateDrawTextExFallbackWidth(windowInstance, contents, richText, visible, lineHeight)
                            : measurePlainTextWidth(windowInstance, contents, visible, lineHeight);
                    }
                    if (!height || !Number.isFinite(height)) height = lineHeight;
                    if (type === 'drawTextEx') {
                        height = Math.max(height, estimateDrawTextExFallbackHeight(richText, lineHeight));
                        height = Math.max(height, measureDrawTextExHeight(windowInstance, text, drawX, drawY, originalParams, lineHeight));
                    }
    
                    let x1 = drawX;
                    const y1 = drawY;
                    let drawWidth = Math.max(0, width);
                    if (type === 'drawText' && originalParams) {
                        const maxWidth = Number(originalParams.maxWidth);
                        if (Number.isFinite(maxWidth) && maxWidth > 0) {
                            drawWidth = Math.min(drawWidth, maxWidth);
                            const align = normalizeDrawTextAlignValue(originalParams.align);
                            if (align === 'right') {
                                x1 += maxWidth - drawWidth;
                            } else if (align === 'center') {
                                x1 += (maxWidth - drawWidth) / 2;
                            }
                        }
                    }
                    return {
                        x1,
                        y1,
                        x2: x1 + drawWidth,
                        y2: y1 + Math.max(0, height),
                    };
                } catch (_) {
                    return null;
                } finally {
                    perfElapsed('windowText.measure.estimateEntryBounds.ms', measureStart);
                }
            }
    
    function measurePlainTextWidth(windowInstance, contents, text, fallbackLineHeight) {
                const widthStart = perfStart();
                perfCount('windowText.measure.plainTextWidth.calls');
                const value = String(text || '');
                try {
                    if (!value) return 0;
                    try {
                        if (contents && typeof contents.measureTextWidth === 'function') {
                            const measured = Number(contents.measureTextWidth(value));
                            if (Number.isFinite(measured) && measured > 0) return Math.ceil(measured);
                        }
                    } catch (_) {}
                    try {
                        if (windowInstance && typeof windowInstance.textWidth === 'function') {
                            const measured = Number(windowInstance.textWidth(value));
                            if (Number.isFinite(measured) && measured > 0) return Math.ceil(measured);
                        }
                    } catch (_) {}
                    try {
                        if (contents && typeof contents.textWidth === 'function') {
                            const measured = Number(contents.textWidth(value));
                            if (Number.isFinite(measured) && measured > 0) return Math.ceil(measured);
                        }
                    } catch (_) {}
                    const fontSize = contents && typeof contents.fontSize === 'number' ? contents.fontSize : fallbackLineHeight;
                    return Math.ceil(value.length * Math.max(6, fontSize * 0.6));
                } finally {
                    perfElapsed('windowText.measure.plainTextWidth.ms', widthStart);
                }
            }
    
    function estimateDrawTextExFallbackWidth(windowInstance, contents, richText, visibleText, fallbackLineHeight) {
                const visibleWidth = measurePlainTextWidth(windowInstance, contents, visibleText, fallbackLineHeight);
                const iconCount = countDrawTextExIcons(richText);
                return iconCount ? visibleWidth + iconCount * (getWindowIconWidth() + 4) : visibleWidth;
            }
    
    function measureDrawTextExHeight(windowInstance, text, x, y, originalParams, fallbackLineHeight) {
                try {
                    if (!windowInstance || typeof windowInstance.calcTextHeight !== 'function') {
                        return fallbackLineHeight;
                    }
                    const textState = createDrawTextExMeasureState(windowInstance, text, x, y, originalParams, fallbackLineHeight);
                    if (!textState) return fallbackLineHeight;
                    const measured = Number(windowInstance.calcTextHeight(textState, true));
                    return Number.isFinite(measured) && measured > 0 ? Math.ceil(measured) : fallbackLineHeight;
                } catch (_) {
                    return fallbackLineHeight;
                }
            }

    function createDrawTextExMeasureState(windowInstance, text, x, y, originalParams, fallbackLineHeight) {
                const drawX = normalizeDrawableCoordinate(x);
                const drawY = normalizeDrawableCoordinate(y);
                if (drawX === null || drawY === null) return null;
                const maxWidth = Number(originalParams && originalParams.maxWidth);
                if (windowInstance && typeof windowInstance.createTextState === 'function') {
                    try {
                        return windowInstance.createTextState(
                            String(text || ''),
                            drawX,
                            drawY,
                            Number.isFinite(maxWidth) && maxWidth > 0 ? maxWidth : 0
                        );
                    } catch (_) {}
                }
                return {
                    index: 0,
                    text: String(text || ''),
                    x: drawX,
                    y: drawY,
                    left: drawX,
                    startX: drawX,
                    startY: drawY,
                    height: Math.max(1, fallbackLineHeight),
                };
            }

    function estimateDrawTextExFallbackHeight(text, fallbackLineHeight) {
                return Math.max(1, getDrawTextExLineCount(text)) * Math.max(1, fallbackLineHeight);
            }
    
    function estimateMaxDrawTextExFallbackHeight(fallbackLineHeight, ...texts) {
                return texts.reduce((maxHeight, value) => {
                    return Math.max(maxHeight, estimateDrawTextExFallbackHeight(value, fallbackLineHeight));
                }, Math.max(1, fallbackLineHeight));
            }
    
    function getDrawTextExLineCount(text) {
                const value = String(text || '');
                if (!value) return 1;
                return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').length;
            }
    
    function getDrawTextExBaseLineHeight(windowInstance, contents, originalParams) {
                const requestedLineHeight = Number(originalParams && originalParams.lineHeight);
                if (Number.isFinite(requestedLineHeight) && requestedLineHeight > 0) {
                    return Math.max(1, Math.ceil(requestedLineHeight));
                }
                if (windowInstance && typeof windowInstance.calcTextHeight === 'function'
                    && contents && typeof contents.fontSize === 'number') {
                    const fontSize = Number(contents.fontSize);
                    if (Number.isFinite(fontSize) && fontSize > 0) {
                        return Math.max(1, Math.ceil(fontSize));
                    }
                }
                return getLineHeight(windowInstance, contents, originalParams);
            }

    function getLineHeight(windowInstance, contents, originalParams = null) {
                const requestedLineHeight = Number(originalParams && originalParams.lineHeight);
                if (Number.isFinite(requestedLineHeight) && requestedLineHeight > 0) {
                    return Math.max(1, Math.ceil(requestedLineHeight));
                }
                try {
                    if (windowInstance && typeof windowInstance.lineHeight === 'function') {
                        return Math.max(1, Math.ceil(Number(windowInstance.lineHeight()) || 0));
                    }
                } catch (_) {}
                if (contents && typeof contents.fontSize === 'number') {
                    return Math.max(1, Math.ceil(contents.fontSize));
                }
                return 24;
            }
    
    function getWindowIconWidth() {
                try {
                    if (typeof Window_Base !== 'undefined'
                        && Number.isFinite(Number(Window_Base._iconWidth))
                        && Number(Window_Base._iconWidth) > 0) {
                        return Number(Window_Base._iconWidth);
                    }
                } catch (_) {}
                try {
                    if (typeof ImageManager !== 'undefined'
                        && Number.isFinite(Number(ImageManager.iconWidth))
                        && Number(ImageManager.iconWidth) > 0) {
                        return Number(ImageManager.iconWidth);
                    }
                } catch (_) {}
                return 32;
            }
    
    function countDrawTextExIcons(text) {
                return textCodec.countIconEscapes(text);
            }
    
    function prepareTranslationSource(text) {
                try {
                    return createTextSource(String(text ?? ''), { surfaceType: 'window' });
                } catch (_) {
                    return textCodec.createPlainTextSource(text, { surfaceType: 'window' });
                }
            }
    
    function restoreTranslatedWindowText(entry, translated) {
                let restored = translated;
                try {
                    restored = entry.codecState
                        ? restoreText(translated, entry.codecState)
                        : translated;
                } catch (_) {
                    restored = translated;
                }
                return sanitizeDrawTextOutput(restored, entry.type);
            }
    
    function sanitizeDrawTextOutput(text, type) {
                if (typeof text !== 'string') return '';
                return textCodec.sanitizeDrawTextOutput(text, { methodName: type || 'drawText' });
            }
    
    function convertWindowText(windowInstance, text) {
                try {
                    if (windowInstance && typeof windowInstance.convertEscapeCharacters === 'function') {
                        const receiver = createConversionWindowBranch(windowInstance);
                        return windowInstance.convertEscapeCharacters.call(receiver || windowInstance, text);
                    }
                } catch (_) {}
                return text;
            }

    /**
     * Escape conversion may run plugin code. Observe through a disposable
     * receiver so reads still see window state, while writes and UI calls do
     * not mutate live contents before the native draw is observed.
     */
    function createConversionWindowBranch(windowInstance) {
                if (!isObjectLike(windowInstance)) return windowInstance;
                const seen = new WeakMap();
                const branch = createConversionWindowSink(windowInstance, seen);
                try { branch._trEvaluationOnly = true; } catch (_) {}
                return branch;
            }

    function copyConversionProperties(source, target, seen, options = {}) {
                if (!isObjectLike(source) || !isObjectLike(target)) return target;
                getOwnKeys(source).forEach((key) => {
                    try {
                        const descriptor = Object.getOwnPropertyDescriptor(source, key);
                        if (!descriptor) return;
                        const cloned = Object.assign({}, descriptor);
                        if (Object.prototype.hasOwnProperty.call(cloned, 'value')) {
                            cloned.value = createConversionValue(cloned.value, seen, options);
                        }
                        Object.defineProperty(target, key, cloned);
                    } catch (_) {
                        try { target[key] = createConversionValue(source[key], seen, options); } catch (_) {}
                    }
                });
                return target;
            }

    function createConversionValue(value, seen, options = {}) {
                if (!isObjectLike(value)) return value;
                if (options.uiSinks === true && isWindowLikeValue(value)) return createConversionWindowSink(value, seen);
                if (options.uiSinks === true && isBitmapLikeValue(value)) return createConversionBitmapSink(value, seen);
                if (Array.isArray(value)) return cloneConversionArray(value, seen, options);
                if (isPlainObject(value)) return cloneConversionPlainObject(value, seen, options);
                return value;
            }

    function cloneConversionArray(value, seen, options = {}) {
                if (!Array.isArray(value)) return value;
                if (seen.has(value)) return seen.get(value);
                const clone = [];
                seen.set(value, clone);
                value.forEach((item, index) => {
                    clone[index] = createConversionValue(item, seen, options);
                });
                return clone;
            }

    function cloneConversionPlainObject(value, seen, options = {}) {
                if (!isObjectLike(value)) return value;
                if (seen.has(value)) return seen.get(value);
                const clone = Object.create(Object.getPrototypeOf(value) || null);
                seen.set(value, clone);
                return copyConversionProperties(value, clone, seen, options);
            }

    function createConversionWindowSink(windowLike, seen = new WeakMap()) {
                if (!isObjectLike(windowLike)) return windowLike;
                if (seen.has(windowLike)) return seen.get(windowLike);
                const sink = Object.create(windowLike);
                seen.set(windowLike, sink);
                copyConversionProperties(windowLike, sink, seen, { uiSinks: true });
                defineConversionDataProperty(sink, 'contents', createConversionBitmapSink(windowLike.contents, seen));
                sink.setText = function(value) {
                    this._text = String(value || '');
                    this.text = this._text;
                    return this;
                };
                sink.refresh = function() { return undefined; };
                sink.drawText = function() { return 0; };
                sink.drawTextEx = function() { return 0; };
                sink.drawTextEx2 = function() { return 0; };
                sink.createContents = function() {
                    if (!this.contents) this.contents = createConversionBitmapSink(windowLike.contents, seen);
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
                return sink;
            }

    function defineConversionDataProperty(target, key, value) {
                try {
                    // RPG Maker MV exposes Window#contents through an accessor
                    // that writes _windowContentsSprite.bitmap. Shadow it on
                    // the branch so conversion sinks never replace live ink.
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

    function createConversionBitmapSink(bitmapLike, seen = new WeakMap()) {
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
                copyConversionProperties(bitmapLike, sink, seen, { uiSinks: false });
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
                    && (typeof value.clearRect === 'function'
                        || typeof value.drawText === 'function'
                        || typeof value.blt === 'function'
                        || typeof value.measureTextWidth === 'function');
            }
    
    function describeWindowTextEligibility(rawText, visibleText, methodName) {
                return lifecycleService.describeTextEligibility({
                    sourceAdapter: ADAPTER_ID,
                    hook: methodName || 'window',
                    rawText,
                    visibleText,
                    original: visibleText,
                });
            }
    
    function describeEntryEligibility(entry) {
                if (!entry) {
                    return { eligible: true, skip: false, category: 'eligible', reason: '' };
                }
                return lifecycleService.describeTextEligibility({
                    sourceAdapter: ADAPTER_ID,
                    hook: entry.type || 'window',
                    rawText: entry.rawText,
                    visibleText: entry.visibleText || entry.convertedText,
                    original: entry.visibleText || entry.convertedText,
                    translationSource: entry.translationSource,
                    normalizedSource: entry.normalizedSource,
                    status: getEntryStatus(entry),
                    skipReason: entry.skipReason,
                    isTranslatable: entry.isTranslatable !== false,
                });
            }
    
    function isDedicatedMessageWindow(windowInstance) {
                if (!windowInstance) return false;
                if (surfaceService && typeof surfaceService.isDedicatedTextOwner === 'function'
                    && surfaceService.isDedicatedTextOwner(windowInstance)) {
                    return true;
                }
                const ctor = windowInstance.constructor;
                try {
                    if (typeof Window_Message !== 'undefined'
                        && Window_Message
                        && Window_Message.prototype
                        && Window_Message.prototype.isPrototypeOf(windowInstance)) {
                        return true;
                    }
                } catch (_) {}
                const name = ctor && ctor.name ? String(ctor.name) : '';
                return /^Window_Message(?:$|_)/.test(name);
            }
    
    function getSurfaceId(windowData) {
                const windowId = windowData && windowData.windowId
                    ? windowData.windowId
                    : (windowData && windowData.windowType ? windowData.windowType : 'window');
                return `window:${windowId}`;
            }

    function getIdentitySurfaceId(windowInstance, windowData) {
                const physicalSurfaceId = getSurfaceId(windowData);
                const stableSurfaceId = createReusableWindowSurfaceId(windowInstance, windowData);
                if (!stableSurfaceId) return physicalSurfaceId;
                if (isSurfaceIdentityInUse(stableSurfaceId, windowInstance)) return physicalSurfaceId;
                try {
                    if (windowData) windowData.identitySurfaceId = stableSurfaceId;
                } catch (_) {}
                return stableSurfaceId;
            }

    function createReusableWindowSurfaceId(windowInstance, windowData) {
                const windowType = getWindowTypeName(windowInstance, windowData) || 'Window_Base';
                if (!usesReusableWindowSurfaceIdentity(windowInstance, windowType)) return '';
                const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                const geometry = [
                    normalizeSurfaceNumber(firstFiniteNumber(windowInstance && windowInstance.x, windowInstance && windowInstance._x, 0)),
                    normalizeSurfaceNumber(firstFiniteNumber(windowInstance && windowInstance.y, windowInstance && windowInstance._y, 0)),
                    normalizeSurfaceNumber(firstFiniteNumber(windowInstance && windowInstance.width, windowInstance && windowInstance._width, contents && contents.width, 0)),
                    normalizeSurfaceNumber(firstFiniteNumber(windowInstance && windowInstance.height, windowInstance && windowInstance._height, contents && contents.height, 0)),
                    normalizeSurfaceNumber(firstFiniteNumber(contents && contents.width, 0)),
                    normalizeSurfaceNumber(firstFiniteNumber(contents && contents.height, 0)),
                ].join('_');
                const parent = getWindowParentIdentitySegment(windowInstance);
                const signature = [windowType, geometry, parent].join('|');
                return [
                    'window',
                    'logical',
                    safeRecordIdPart(windowType),
                    safeRecordIdPart(geometry),
                    hashTextForRecordId(signature),
                ].join(':');
            }

    function usesReusableWindowSurfaceIdentity(windowInstance, windowType) {
                if (!windowInstance) return false;
                if (!windowType || windowType === 'Window_Base') return true;
                try {
                    return typeof Window_Base !== 'undefined'
                        && Window_Base
                        && windowInstance.constructor === Window_Base;
                } catch (_) {
                    return false;
                }
            }

    function isSurfaceIdentityInUse(surfaceId, currentWindow) {
                if (!surfaceId) return false;
                let inUse = false;
                try {
                    surfaceService.forEachRegisteredWindow((candidate) => {
                        if (inUse || !candidate || candidate === currentWindow) return;
                        const data = surfaceService.getWindowData(candidate);
                        if (!data || data._trUnregistered) return;
                        if (candidate._destroyed || candidate.destroyed) return;
                        if (data.identitySurfaceId === surfaceId) inUse = true;
                    });
                } catch (_) {}
                return inUse;
            }

    function getWindowParentIdentitySegment(windowInstance) {
                const parent = windowInstance && windowInstance.parent ? windowInstance.parent : null;
                if (!parent) return 'root';
                const parentType = parent && parent.constructor && parent.constructor.name
                    ? String(parent.constructor.name)
                    : 'parent';
                let index = 'unattached';
                try {
                    if (Array.isArray(parent.children)) {
                        const childIndex = parent.children.indexOf(windowInstance);
                        if (childIndex >= 0) index = String(childIndex);
                    }
                } catch (_) {}
                return `${parentType}:${index}`;
            }

    function firstFiniteNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric)) return numeric;
                }
                return 0;
            }

    function normalizeSurfaceNumber(value) {
                const numeric = Number(value);
                if (!Number.isFinite(numeric)) return '0';
                return String(Math.round(numeric * 1000) / 1000);
            }
    
    function createSlotKey(type, x, y, params = null) {
                const parts = [
                    type || 'text',
                    normalizeSlotNumber(x),
                    normalizeSlotNumber(y),
                ];
                const signature = createDrawParameterSlotSignature(params);
                if (signature) parts.push(signature);
                return parts.join(':');
            }

    function createDrawParameterSlotSignature(params) {
                if (!params || typeof params !== 'object') return '';
                const parts = [];
                if (hasOwn(params, 'maxWidth')) {
                    const maxWidth = normalizeOptionalSlotNumber(params.maxWidth);
                    if (maxWidth) parts.push(`w=${maxWidth}`);
                }
                if (hasOwn(params, 'lineHeight')) {
                    const lineHeight = normalizeOptionalSlotNumber(params.lineHeight);
                    if (lineHeight) parts.push(`lh=${lineHeight}`);
                }
                if (hasOwn(params, 'align')) {
                    const align = normalizeDrawTextAlignValue(params.align);
                    // Left alignment is the engine default. Keeping it implicit
                    // preserves the older compact key while still separating
                    // right/center overlays that share x/y with a left label.
                    if (align && align !== 'left') parts.push(`a=${align}`);
                }
                return parts.join(':');
            }

    function hasOwn(source, key) {
                return !!(source && Object.prototype.hasOwnProperty.call(source, key));
            }

    function normalizeOptionalSlotNumber(value) {
                const numeric = normalizeDrawableCoordinate(value);
                if (numeric === null) return '';
                return normalizeSlotNumber(numeric);
            }
    
    function createWindowTextRecordId(surfaceId, slotKey, sourceText) {
                return [
                    ADAPTER_ID,
                    safeRecordIdPart(surfaceId),
                    safeRecordIdPart(slotKey),
                    hashTextForRecordId(sourceText),
                ].join(':');
            }
    
    function safeRecordIdPart(value) {
                const text = String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
                return (text || 'item').slice(0, 80);
            }
    
    function hashTextForRecordId(value) {
                const text = String(value || '');
                let hash = 0;
                for (let index = 0; index < text.length; index += 1) {
                    hash = ((hash << 5) - hash) + text.charCodeAt(index);
                    hash |= 0;
                }
                return Math.abs(hash).toString(36) || '0';
            }
    
    function normalizeSlotNumber(value) {
                const numeric = normalizeDrawableCoordinate(value);
                return numeric === null ? 'invalid' : String(Math.round(numeric * 1000) / 1000);
            }

    function normalizeDrawableCoordinate(value) {
                if (value === null || value === undefined) return null;
                if (typeof value === 'number') return Number.isFinite(value) ? value : null;
                if (typeof value === 'string') {
                    if (!value.trim()) return null;
                    const numeric = Number(value);
                    return Number.isFinite(numeric) ? numeric : null;
                }
                return null;
            }
    
    function getWindowTypeName(windowInstance, windowData) {
                return (windowData && windowData.windowType)
                    || getWindowCtorName(windowInstance)
                    || '';
            }
    
    function getWindowCtorName(windowInstance) {
                return windowInstance && windowInstance.constructor && windowInstance.constructor.name
                    ? String(windowInstance.constructor.name)
                    : '';
            }
    
    function normalizeDrawTextAlignValue(align) {
                const value = String(align || '').toLowerCase();
                if (value === 'right' || value === 'end') return 'right';
                if (value === 'center' || value === 'centre' || value === 'middle') return 'center';
                return 'left';
            }
    
        return { estimateEntryBounds, measurePlainTextWidth, estimateDrawTextExFallbackWidth, estimateDrawTextExFallbackHeight, estimateMaxDrawTextExFallbackHeight, getDrawTextExLineCount, getLineHeight, getWindowIconWidth, countDrawTextExIcons, prepareTranslationSource, restoreTranslatedWindowText, sanitizeDrawTextOutput, convertWindowText, describeWindowTextEligibility, describeEntryEligibility, isDedicatedMessageWindow, getSurfaceId, getIdentitySurfaceId, createSlotKey, createWindowTextRecordId, safeRecordIdPart, hashTextForRecordId, normalizeSlotNumber, getWindowTypeName, getWindowCtorName, normalizeDrawTextAlignValue };
    }
    
    defineRuntimeModule('adapters.windowTextTextMeasure', { create: createTextMeasureController });

})();
