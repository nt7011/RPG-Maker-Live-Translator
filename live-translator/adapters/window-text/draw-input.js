// Window text adapter support: draw input classification.
//
// Raw RPG Maker draw arguments are ambiguous: an omitted text argument is not
// the same thing as the literal string "undefined", and invalid geometry is not
// proof that a cached translation should draw somewhere else. This module owns
// that boundary so later lifecycle and render code receives structured evidence
// instead of reinterpreting JavaScript values.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.drawInput',
        requires: {
            drawEligibilityModule: 'adapters.windowText.drawEligibility',
        },
        factory({ drawEligibilityModule }) {
    function createDrawInputController(context = {}) {
        const drawEligibility = drawEligibilityModule.create({
            facades: context.facades || {},
        });
        const { describeDrawableWindowTextGeometry, describeWindowTextDrawRole } = drawEligibility;

        function classifyDrawTextInput(input = {}) {
            const text = normalizeWindowTextArgument(input.text);
            const params = {
                maxWidth: input.maxWidth,
                align: input.align,
            };
            return classifyWindowDrawInput({
                methodName: 'drawText',
                entryType: 'drawText',
                windowInstance: input.windowInstance || null,
                text,
                x: input.x,
                y: input.y,
                params,
                nativeArgs: [text.nativeText, input.x, input.y, input.maxWidth, input.align],
                traceDetails: { maxWidth: input.maxWidth, align: input.align },
                stripEscapes: input.stripEscapes,
            });
        }

        function classifyDrawTextExInput(input = {}) {
            const drawArgs = normalizeDrawTextExArgs(input.originalArgs, input.text, input.x, input.y);
            const text = normalizeWindowTextArgument(drawArgs[0]);
            const x = drawArgs[1];
            const y = drawArgs[2];
            const nativeArgs = drawArgs.slice();
            nativeArgs[0] = text.nativeText;
            const params = createDrawTextExParams(input.windowInstance, x, nativeArgs);
            return classifyWindowDrawInput({
                methodName: 'drawTextEx',
                entryType: 'drawTextEx',
                windowInstance: input.windowInstance || null,
                text,
                x,
                y,
                params,
                nativeArgs,
                originalArgs: nativeArgs,
                traceDetails: { maxWidth: params.maxWidth, align: 'left' },
                convertText: input.convertText,
                stripEscapes: input.stripEscapes,
                evaluateRole: true,
            });
        }

        function classifySurfaceDrawInput(input = {}) {
            const text = normalizeWindowTextArgument(input.text);
            const entryType = input.entryType || normalizeSurfaceEntryType(input.methodName);
            const params = {
                maxWidth: input.maxWidth,
                lineHeight: input.lineHeight,
                align: input.align,
            };
            if (input.drawOrigin) params.drawOrigin = input.drawOrigin;
            return classifyWindowDrawInput({
                methodName: input.methodName || 'bitmap.drawText',
                entryType,
                windowInstance: input.windowInstance || null,
                text,
                x: input.x,
                y: input.y,
                params,
                nativeArgs: [text.nativeText, input.x, input.y, input.maxWidth, input.lineHeight, input.align],
                traceDetails: {
                    maxWidth: input.maxWidth,
                    lineHeight: input.lineHeight,
                    align: input.align,
                },
                stripEscapes: input.stripEscapes,
                evaluateRole: entryType === 'drawTextEx',
            });
        }

        function classifyWindowDrawInput(input) {
            const text = input.text || normalizeWindowTextArgument(undefined);
            const x = input.x;
            const y = input.y;
            const params = Object.assign({}, input.params || {});
            const rawText = text.rawText;
            const convertedText = normalizeConvertedText(input.convertText, input.windowInstance, rawText);
            const sourceText = firstNonEmptyString(convertedText, rawText);
            const visibleText = stripVisibleText(input.stripEscapes, sourceText || rawText);
            const normalizedText = String(sourceText || '').trim();
            const normalizedVisibleText = String(visibleText || '').trim();
            const textKind = text.missingTextArgument
                ? 'missing'
                : (normalizedText ? 'literal' : 'empty');
            const emptyReason = textKind === 'missing' ? 'missingTextArgument' : 'empty';
            const geometry = describeDrawableWindowTextGeometry(input.entryType, x, y, params);
            const drawRole = geometry.drawable && input.evaluateRole
                ? describeWindowTextDrawRole(input.windowInstance, input.entryType, x, y, params, sourceText || rawText)
                : null;
            const renderable = !!(geometry.drawable && (!drawRole || drawRole.renderable));
            const literal = textKind === 'literal';
            const observable = literal && renderable;
            const skipReason = selectSkipReason({
                textKind,
                emptyReason,
                geometry,
                drawRole,
            });

            return {
                methodName: input.methodName,
                entryType: input.entryType,
                nativeText: text.nativeText,
                rawText,
                sourceText,
                convertedText,
                visibleText,
                normalizedText,
                normalizedVisibleText,
                textKind,
                missingTextArgument: text.missingTextArgument,
                emptyReason,
                x,
                y,
                params,
                nativeArgs: Array.isArray(input.nativeArgs) ? input.nativeArgs.slice() : [],
                originalArgs: Array.isArray(input.originalArgs) ? input.originalArgs.slice() : undefined,
                traceDetails: Object.assign({}, input.traceDetails || {}),
                geometry,
                drawRole,
                renderable,
                observable,
                canRetireEmptySlot: !literal && geometry.drawable,
                canRetireNonRenderableSlot: literal && geometry.drawable && !!(drawRole && !drawRole.renderable),
                skipReason,
            };
        }

        return {
            classifyDrawTextInput,
            classifyDrawTextExInput,
            classifySurfaceDrawInput,
            normalizeWindowTextArgument,
            normalizeDrawTextExArgs,
            createDrawTextExParams,
            resolveDrawTextExMaxWidth,
        };
    }

    function normalizeWindowTextArgument(value) {
        if (value === undefined) {
            return {
                nativeText: '',
                rawText: '',
                missingTextArgument: true,
            };
        }
        return {
            nativeText: value,
            rawText: String(value),
            missingTextArgument: false,
        };
    }

    function normalizeConvertedText(convertText, windowInstance, rawText) {
        if (typeof convertText !== 'function') return rawText;
        try {
            const converted = convertText(windowInstance, rawText);
            return converted === undefined || converted === null ? '' : String(converted);
        } catch (_) {
            return rawText;
        }
    }

    function stripVisibleText(stripEscapes, text) {
        const value = String(text ?? '');
        if (typeof stripEscapes !== 'function') return value;
        try {
            return String(stripEscapes(value) ?? '');
        } catch (_) {
            return value;
        }
    }

    function firstNonEmptyString(...values) {
        for (const value of values) {
            if (value === undefined || value === null) continue;
            const text = String(value);
            if (text) return text;
        }
        return '';
    }

    function selectSkipReason({ textKind, emptyReason, geometry, drawRole }) {
        if (!geometry || !geometry.drawable) return geometry && geometry.reason || 'invalidDrawGeometry';
        if (textKind !== 'literal') return emptyReason || 'empty';
        if (drawRole && !drawRole.renderable) return drawRole.reason || 'nonRenderableDraw';
        return '';
    }

    function normalizeDrawTextExArgs(originalArgs, text, x, y) {
        const args = Array.isArray(originalArgs)
            ? originalArgs.slice()
            : Array.prototype.slice.call(originalArgs && typeof originalArgs.length === 'number' ? originalArgs : []);
        if (!args.length) args.push(text, x, y);
        if (args.length < 2) args[1] = x;
        if (args.length < 3) args[2] = y;
        return args;
    }

    function createDrawTextExParams(windowInstance, x, drawArgs) {
        const width = resolveDrawTextExMaxWidth(windowInstance, x, drawArgs && drawArgs.length > 3 ? drawArgs[3] : undefined);
        return {
            maxWidth: width.value,
            maxWidthInferred: width.inferred,
            align: 'left',
        };
    }

    function resolveDrawTextExMaxWidth(windowInstance, x, suppliedWidth) {
        const explicitWidth = Number(suppliedWidth);
        if (Number.isFinite(explicitWidth) && explicitWidth > 0) {
            return { value: explicitWidth, inferred: false };
        }
        const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
        const contentsWidth = Number(contents && contents.width);
        const drawX = Number(x);
        if (Number.isFinite(contentsWidth) && contentsWidth > 0 && Number.isFinite(drawX)) {
            return { value: Math.max(1, contentsWidth - drawX), inferred: true };
        }
        return { value: Infinity, inferred: true };
    }

    function normalizeSurfaceEntryType(methodName) {
        return String(methodName || '') === 'drawTextEx' ? 'drawTextEx' : 'drawText';
    }

            return { create: createDrawInputController };
        },
    });
})();
