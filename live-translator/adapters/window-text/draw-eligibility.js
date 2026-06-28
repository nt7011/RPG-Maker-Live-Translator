// Window text adapter support: drawable geometry and observation roles.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.drawEligibility',
        factory() {

    function createDrawEligibilityController(context = {}) {
        const facades = context.facades || {};
        const { bitmapReplay = {}, textMetrics = {} } = facades;
        const { isValidRect } = bitmapReplay;
        const { estimateEntryBounds } = textMetrics;
        requireFunction(isValidRect, 'bitmapReplay.isValidRect');
        requireFunction(estimateEntryBounds, 'textMetrics.estimateEntryBounds');

        function describeDrawableWindowTextGeometry(type, x, y, params = {}) {
            const invalid = [];
            const drawX = normalizeDrawableNumber(x);
            const drawY = normalizeDrawableNumber(y);
            if (drawX === null) invalid.push('x');
            if (drawY === null) invalid.push('y');
            if (type !== 'drawTextEx') {
                const maxWidth = normalizeDrawableNumber(params && params.maxWidth);
                if (maxWidth === null || maxWidth <= 0) invalid.push('maxWidth');
            }
            if (!invalid.length) {
                return {
                    drawable: true,
                    reason: '',
                    details: {
                        x: drawX,
                        y: drawY,
                    },
                };
            }
            return {
                drawable: false,
                reason: 'invalidDrawGeometry',
                details: {
                    invalid,
                    x: describeDrawNumber(x),
                    y: describeDrawNumber(y),
                    maxWidth: describeDrawNumber(params && params.maxWidth),
                },
            };
        }

        function describeWindowTextDrawRole(windowInstance, type, x, y, params = {}, textForMeasure = '') {
            const geometry = describeDrawableWindowTextGeometry(type, x, y, params);
            if (!geometry.drawable) {
                return {
                    role: 'invalid',
                    renderable: false,
                    reason: geometry.reason || 'invalidDrawGeometry',
                    bounds: null,
                    contentsSize: null,
                };
            }

            const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
            const contentsWidth = normalizePositiveDimension(contents && contents.width);
            const contentsHeight = normalizePositiveDimension(contents && contents.height);
            if (contentsWidth === null || contentsHeight === null) {
                return {
                    role: 'visible',
                    renderable: true,
                    reason: '',
                    bounds: null,
                    contentsSize: null,
                };
            }

            let bounds = null;
            try {
                bounds = estimateEntryBounds(
                    windowInstance,
                    type,
                    textForMeasure,
                    x,
                    y,
                    textForMeasure,
                    params
                );
            } catch (_) {
                bounds = null;
            }
            if (!isValidRect(bounds)) {
                return {
                    role: 'visible',
                    renderable: true,
                    reason: '',
                    bounds: null,
                    contentsSize: {
                        width: contentsWidth,
                        height: contentsHeight,
                    },
                };
            }

            const intersects = Number(bounds.x2) > 0
                && Number(bounds.y2) > 0
                && Number(bounds.x1) < contentsWidth
                && Number(bounds.y1) < contentsHeight;
            if (intersects) {
                return {
                    role: 'visible',
                    renderable: true,
                    reason: '',
                    bounds,
                    contentsSize: {
                        width: contentsWidth,
                        height: contentsHeight,
                    },
                };
            }

            const role = type === 'drawTextEx' ? 'layout-measurement' : 'offscreen-draw';
            return {
                role,
                renderable: false,
                reason: role,
                bounds,
                contentsSize: {
                    width: contentsWidth,
                    height: contentsHeight,
                },
            };
        }

        function normalizePositiveDimension(value) {
            const numeric = Number(value);
            return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
        }

        function normalizeDrawableNumber(value) {
            if (value === null || value === undefined) return null;
            if (typeof value === 'number') return Number.isFinite(value) ? value : null;
            if (typeof value === 'string') {
                if (!value.trim()) return null;
                const numeric = Number(value);
                return Number.isFinite(numeric) ? numeric : null;
            }
            return null;
        }

        function describeDrawNumber(value) {
            const numeric = normalizeDrawableNumber(value);
            return numeric === null ? null : numeric;
        }

        return {
            describeDrawableWindowTextGeometry,
            describeWindowTextDrawRole,
        };
    }

    function requireFunction(value, name) {
        if (typeof value !== 'function') {
            throw new Error(`[WindowText] draw eligibility support requires ${name}.`);
        }
        return value;
    }
            return { create: createDrawEligibilityController };
        },
    });
})();
