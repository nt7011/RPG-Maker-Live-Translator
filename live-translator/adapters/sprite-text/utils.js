// Sprite text adapter support: utils.
// Keeps Sprite-owned bitmap text responsibilities small enough to audit in isolation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/sprite-text/utils.js.');
    }

    function createController(scope = {}) {
        const callScope = (name) => (...args) => scope[name](...args);
        /**
         * Find a property descriptor through the prototype chain.
         */
        function findPropertyDescriptor(proto, prop) {
            let cursor = proto;
            while (cursor && cursor !== Object.prototype) {
                const descriptor = Object.getOwnPropertyDescriptor(cursor, prop);
                if (descriptor) return { owner: cursor, descriptor };
                cursor = Object.getPrototypeOf(cursor);
            }
            return null;
        }
        
        /**
         * Measure text width using Bitmap measurement when available.
         */
        function measureTextWidth(bitmap, text, maxWidth) {
            const clean = String(text ?? '');
            let measured = 0;
            try {
                if (bitmap && typeof bitmap.measureTextWidth === 'function') {
                    const value = bitmap.measureTextWidth(clean);
                    if (Number.isFinite(Number(value))) measured = Math.ceil(Number(value));
                }
            } catch (_) {}
            if (!measured) {
                const fontSize = bitmap && Number.isFinite(Number(bitmap.fontSize)) ? Number(bitmap.fontSize) : 24;
                measured = Math.ceil(clean.length * Math.max(6, fontSize * 0.6));
            }
            const limit = Number(maxWidth);
            if (Number.isFinite(limit) && limit > 0 && limit !== Infinity) return Math.max(1, Math.max(measured, Math.ceil(limit)));
            return Math.max(1, measured);
        }
        
        /**
         * Compute a draw-state signature for grouping.
         */
        function computeFontSignature(drawState, bitmap) {
            const source = drawState || bitmap || {};
            return [
                source.fontFace,
                source.fontSize,
                source.fontBold,
                source.fontItalic,
                source.textColor,
                source.outlineColor,
                source.outlineWidth,
            ].join('|');
        }
        
        /**
         * Strip RPG Maker escapes and adapter sentinel characters.
         */
        function sanitizeVisibleText(text) {
            return scope.stripControls(String(text ?? '')).replace(/\u2060/g, '').trim();
        }
        
        /**
         * Count user-visible text units defensively.
         */
        function textUnitCount(text) {
            try { return Array.from(String(text || '')).length; } catch (_) { return String(text || '').length; }
        }
        
        /**
         * Normalize canvas text alignment.
         */
        function normalizeCanvasTextAlign(align) {
            const value = String(align || '').toLowerCase();
            return ['left', 'right', 'center', 'start', 'end'].indexOf(value) >= 0 ? value : 'left';
        }
        
        /**
         * Return the center y coordinate for a rectangle.
         */
        function rectCenterY(rect) {
            return isValidRect(rect) ? (Number(rect.y1) + Number(rect.y2)) / 2 : 0;
        }
        
        /**
         * Return vertical overlap amount between two rectangles.
         */
        function verticalOverlapAmount(a, b) {
            if (!isValidRect(a) || !isValidRect(b)) return 0;
            return Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
        }
        
        /**
         * Return a glyph candidate's bounds.
         */
        function glyphBounds(item) {
            if (item && item.bounds && rectHasArea(item.bounds)) return item.bounds;
            return rectFromDimensions(item ? item.x : 0, item ? item.y : 0, item ? item.width : 0, item ? item.height : 0);
        }
        
        /**
         * Normalize x/y/width/height into x1/y1/x2/y2.
         */
        function rectFromDimensions(x, y, width, height) {
            const x1 = finiteNumber(x, 0);
            const y1 = finiteNumber(y, 0);
            const x2 = x1 + finiteNumber(width, 0);
            const y2 = y1 + finiteNumber(height, 0);
            return {
                x1: Math.min(x1, x2),
                y1: Math.min(y1, y2),
                x2: Math.max(x1, x2),
                y2: Math.max(y1, y2),
            };
        }
        
        /**
         * Validate a rectangle shape.
         */
        function isValidRect(rect) {
            return !!(rect
                && Number.isFinite(Number(rect.x1))
                && Number.isFinite(Number(rect.y1))
                && Number.isFinite(Number(rect.x2))
                && Number.isFinite(Number(rect.y2))
                && Number(rect.x2) >= Number(rect.x1)
                && Number(rect.y2) >= Number(rect.y1));
        }
        
        /**
         * Return true when a rectangle has positive area.
         */
        function rectHasArea(rect) {
            return isValidRect(rect) && Number(rect.x2) > Number(rect.x1) && Number(rect.y2) > Number(rect.y1);
        }
        
        /**
         * Test rectangle overlap.
         */
        function rectanglesOverlap(a, b) {
            if (!isValidRect(a) || !isValidRect(b)) return false;
            return Number(a.x1) < Number(b.x2)
                && Number(a.x2) > Number(b.x1)
                && Number(a.y1) < Number(b.y2)
                && Number(a.y2) > Number(b.y1);
        }
        
        /**
         * Bucket a coordinate for stable slot keys.
         */
        function bucket(value, size) {
            const safeSize = Math.max(1, Number(size) || 1);
            return Math.round(finiteNumber(value, 0) / safeSize);
        }
        
        /**
         * Bucket profiler volume counts without exploding top-label cardinality.
         */
        function bucketCount(value) {
            const count = Math.max(0, Math.floor(Number(value) || 0));
            if (count <= 0) return '0';
            if (count <= 1) return '1';
            if (count <= 2) return '2';
            if (count <= 4) return '3-4';
            if (count <= 8) return '5-8';
            if (count <= 16) return '9-16';
            if (count <= 32) return '17-32';
            if (count <= 64) return '33-64';
            if (count <= 128) return '65-128';
            if (count <= 256) return '129-256';
            if (count <= 512) return '257-512';
            if (count <= 1024) return '513-1024';
            return '>1024';
        }
        
        /**
         * Return a stable id for parent containers used in surface ids.
         */
        function getParentId(parent) {
            if (!parent) return 'unknown';
            if (!parent._trSpriteTextParentId) {
                try { parent._trSpriteTextParentId = `sprp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; } catch (_) {}
            }
            return parent._trSpriteTextParentId || 'unknown';
        }
        
        /**
         * Parse a finite number with fallback.
         */
        function finiteNumber(value, fallback) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : fallback;
        }
        
        /**
         * Return the first positive numeric value.
         */
        function positiveNumber(...values) {
            for (const value of values) {
                const numeric = Number(value);
                if (Number.isFinite(numeric) && numeric > 0) return numeric;
            }
            return 1;
        }
        
        /**
         * Trim an array to a bounded history length.
         */
        function pruneArray(values, limit) {
            if (!Array.isArray(values) || values.length <= limit) return;
            values.splice(0, values.length - limit);
        }
        
        /**
         * Convert arbitrary values to strings defensively.
         */
        function stringify(value) {
            try { return String(value ?? ''); } catch (_) { return ''; }
        }
        
        /**
         * Run a non-critical callback safely.
         */
        function safeCall(callback) {
            try { return typeof callback === 'function' ? callback() : null; } catch (_) { return null; }
        }
        
        function isAdapterContractFailure(error) {
            return !!(scope.adapterContract
                && typeof scope.adapterContract.isContractError === 'function'
                && scope.adapterContract.isContractError(error));
        }
        
        /**
         * Normalize errors to displayable messages.
         */
        function errorMessage(error) {
            return error && error.message ? error.message : String(error || 'translation error');
        }
        
        /**
         * Log warnings through the configured scope.logger.
         */
        function warn(message, error) {
            if (scope.logger && typeof scope.logger.warn === 'function') {
                try { scope.logger.warn(message, error); } catch (_) {}
            }
        }

        return { findPropertyDescriptor, measureTextWidth, computeFontSignature, sanitizeVisibleText, textUnitCount, normalizeCanvasTextAlign, rectCenterY, verticalOverlapAmount, glyphBounds, rectFromDimensions, isValidRect, rectHasArea, rectanglesOverlap, bucket, bucketCount, getParentId, finiteNumber, positiveNumber, pruneArray, stringify, safeCall, isAdapterContractFailure, errorMessage, warn };
    }

    defineRuntimeModule('adapters.spriteText.utils', { createController });
})();
