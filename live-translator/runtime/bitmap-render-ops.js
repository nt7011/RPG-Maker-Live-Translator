// Shared classification for Bitmap render and mutation methods.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/bitmap-render-ops.js.');
    }

    const METHOD_TRAITS = Object.freeze({
        clear: {
            clearsArea: true,
            clearsAll: true,
            replayable: false,
            invalidates: 'all',
            windowSurfaceMutation: true,
        },
        clearRect: {
            clearsArea: true,
            replayable: false,
            invalidates: 'area',
            windowSurfaceMutation: true,
        },
        resize: {
            clearsArea: true,
            clearsAll: true,
            changesDimensions: true,
            replayable: false,
            invalidates: 'dimensions',
            windowSurfaceMutation: true,
        },
        destroy: {
            clearsArea: true,
            clearsAll: true,
            changesDimensions: true,
            replayable: false,
            invalidates: 'dimensions',
            windowSurfaceMutation: true,
        },
        fillAll: {
            paintsArea: true,
            coversArea: true,
            replayable: true,
            invalidates: 'paint',
            windowSurfaceMutation: true,
        },
        fillRect: {
            paintsArea: true,
            coversArea: true,
            replayable: true,
            invalidates: 'paint',
            windowSurfaceMutation: true,
        },
        gradientFillRect: {
            paintsArea: true,
            coversArea: true,
            replayable: true,
            invalidates: 'paint',
            windowSurfaceMutation: true,
        },
        strokeRect: {
            paintsArea: true,
            replayable: true,
            invalidates: 'paint',
            windowSurfaceMutation: true,
        },
        drawCircle: {
            paintsArea: true,
            replayable: true,
            invalidates: 'paint',
            windowSurfaceMutation: true,
        },
        blt: {
            paintsArea: true,
            coversArea: true,
            copiesBitmap: true,
            replayable: true,
            invalidates: 'paint',
            windowSurfaceMutation: true,
        },
        bltImage: {
            paintsArea: true,
            coversArea: true,
            copiesBitmap: true,
            replayable: true,
            invalidates: 'paint',
            windowSurfaceMutation: true,
        },
        adjustTone: {
            paintsArea: true,
            coversArea: true,
            unsupported: true,
            replayable: false,
            invalidates: 'paint',
        },
        rotateHue: {
            paintsArea: true,
            coversArea: true,
            unsupported: true,
            replayable: false,
            invalidates: 'paint',
        },
        blur: {
            paintsArea: true,
            coversArea: true,
            unsupported: true,
            replayable: false,
            invalidates: 'paint',
        },
    });

    function normalizeMethodName(methodName) {
        return String(methodName || '');
    }

    function getMethodTraits(methodName) {
        const method = normalizeMethodName(methodName);
        const base = METHOD_TRAITS[method] || null;
        const nativeText = isNativeTextReplayMethod(method);
        return normalizeTraits(Object.assign({
            methodName: method,
            paintsArea: nativeText,
            clearsArea: false,
            coversArea: false,
            copiesBitmap: false,
            copiesSelf: false,
            copiesExternal: false,
            changesDimensions: false,
            unsupported: !base && !nativeText,
            nativeText,
            replayable: nativeText,
            invalidates: nativeText ? 'paint' : 'unknown',
            windowSurfaceMutation: false,
        }, base || {}));
    }

    function classifyRenderOp(methodName, options = {}) {
        const args = Array.isArray(options.args) ? options.args : [];
        const base = options.traits && typeof options.traits === 'object'
            ? normalizeTraits(Object.assign({}, getMethodTraits(methodName), options.traits))
            : getMethodTraits(methodName);
        const sourceBitmap = options.sourceBitmap !== undefined ? options.sourceBitmap : (base.sourceBitmap || args[0]);
        const targetBitmap = options.targetBitmap || null;
        const copiesBitmap = base.copiesBitmap === true;
        const copiesSelf = copiesBitmap && !!(sourceBitmap && targetBitmap && sourceBitmap === targetBitmap);
        const copiesExternal = copiesBitmap && !!(sourceBitmap && (!targetBitmap || sourceBitmap !== targetBitmap));
        const replayable = base.replayable === true
            && base.changesDimensions !== true
            && base.unsupported !== true
            && !copiesSelf;
        return normalizeTraits(Object.assign({}, base, {
            sourceBitmap: sourceBitmap || null,
            copiesSelf,
            copiesExternal,
            replayable,
        }));
    }

    function classifyMutation(methodName, options = {}) {
        return classifyRenderOp(methodName, options);
    }

    function normalizeTraits(source = {}) {
        const methodName = normalizeMethodName(source.methodName);
        const changesDimensions = source.changesDimensions === true;
        const clearsArea = source.clearsArea === true;
        const paintsArea = source.paintsArea === true;
        const unsupported = source.unsupported === true;
        const invalidates = source.invalidates
            ? String(source.invalidates)
            : describeInvalidation({ changesDimensions, clearsArea, paintsArea });
        return {
            methodName,
            paintsArea,
            clearsArea,
            clearsAll: source.clearsAll === true,
            coversArea: source.coversArea === true,
            copiesBitmap: source.copiesBitmap === true,
            sourceBitmap: source.sourceBitmap || null,
            copiesSelf: source.copiesSelf === true,
            copiesExternal: source.copiesExternal === true,
            changesDimensions,
            unsupported,
            nativeText: source.nativeText === true,
            replayable: source.replayable === true && !changesDimensions && !unsupported && source.copiesSelf !== true,
            invalidates,
            windowSurfaceMutation: source.windowSurfaceMutation === true,
        };
    }

    function isWindowSurfaceReplayMutation(methodName) {
        return getMethodTraits(methodName).windowSurfaceMutation === true;
    }

    function isBackdropReplayMethod(methodName) {
        const traits = getMethodTraits(methodName);
        return traits.paintsArea === true && traits.nativeText !== true && traits.replayable === true;
    }

    function isAreaCoveringBackdropMethod(methodName) {
        const traits = getMethodTraits(methodName);
        return traits.coversArea === true && traits.nativeText !== true && traits.replayable === true;
    }

    function isSelfCopyMethod(methodName) {
        return getMethodTraits(methodName).copiesBitmap === true;
    }

    function isNativeTextReplayMethod(methodName) {
        return /^(drawText|drawTextS|drawTextM)$/u.test(normalizeMethodName(methodName));
    }

    function describeInvalidation(traits) {
        if (traits.changesDimensions) return 'dimensions';
        if (traits.clearsArea) return 'area';
        if (traits.paintsArea) return 'paint';
        return 'none';
    }

    defineRuntimeModule('runtime.bitmapRenderOps', {
        getMethodTraits,
        classifyRenderOp,
        classifyMutation,
        normalizeTraits,
        isWindowSurfaceReplayMutation,
        isBackdropReplayMethod,
        isAreaCoveringBackdropMethod,
        isSelfCopyMethod,
        isNativeTextReplayMethod,
    });
})();
