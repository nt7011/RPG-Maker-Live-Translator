// Bitmap rectangle geometry helpers.
//
// Bitmap restore and copy-projection code must agree on basic rectangle math:
// overlap, intersection, coverage subtraction, and dimension normalization.
// This module is data-only; callers own policy and rendering decisions.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.rectGeometry',
        factory() {
            function cloneRect(rect) {
                if (!rect || typeof rect !== 'object') return null;
                const x1 = finiteNumber(rect.x1, NaN);
                const y1 = finiteNumber(rect.y1, NaN);
                const x2 = finiteNumber(rect.x2, NaN);
                const y2 = finiteNumber(rect.y2, NaN);
                if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
                return { x1, y1, x2, y2 };
            }

            function normalizeRect(rect) {
                const source = cloneRect(rect);
                if (!source) return null;
                return {
                    x1: Math.min(source.x1, source.x2),
                    y1: Math.min(source.y1, source.y2),
                    x2: Math.max(source.x1, source.x2),
                    y2: Math.max(source.y1, source.y2),
                };
            }

            function rectFromDimensions(x, y, width, height) {
                const x1 = finiteNumber(x, NaN);
                const y1 = finiteNumber(y, NaN);
                const w = Number(width);
                const h = Number(height);
                if (![x1, y1, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
                return { x1, y1, x2: x1 + w, y2: y1 + h };
            }

            function rectHasArea(rect) {
                const source = cloneRect(rect);
                return !!(source && source.x2 > source.x1 && source.y2 > source.y1);
            }

            function rectsOverlap(left, right) {
                const a = cloneRect(left);
                const b = cloneRect(right);
                if (!a || !b) return false;
                return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
            }

            function sameRect(left, right) {
                const a = cloneRect(left);
                const b = cloneRect(right);
                if (!a || !b) return false;
                return Number(a.x1) === Number(b.x1)
                    && Number(a.y1) === Number(b.y1)
                    && Number(a.x2) === Number(b.x2)
                    && Number(a.y2) === Number(b.y2);
            }

            function intersectRects(left, right) {
                const a = cloneRect(left);
                const b = cloneRect(right);
                if (!a || !b) return null;
                const rect = {
                    x1: Math.max(a.x1, b.x1),
                    y1: Math.max(a.y1, b.y1),
                    x2: Math.min(a.x2, b.x2),
                    y2: Math.min(a.y2, b.y2),
                };
                return rect.x1 < rect.x2 && rect.y1 < rect.y2 ? rect : null;
            }

            function expandRect(rect, amount) {
                const source = cloneRect(rect);
                if (!source) return null;
                const pad = Math.max(0, Number(amount) || 0);
                return {
                    x1: source.x1 - pad,
                    y1: source.y1 - pad,
                    x2: source.x2 + pad,
                    y2: source.y2 + pad,
                };
            }

            function subtractRect(rect, cover) {
                const source = cloneRect(rect);
                const damage = cloneRect(cover);
                if (!source) return [];
                if (!damage) return [source];
                const ix1 = Math.max(source.x1, damage.x1);
                const iy1 = Math.max(source.y1, damage.y1);
                const ix2 = Math.min(source.x2, damage.x2);
                const iy2 = Math.min(source.y2, damage.y2);
                if (ix1 >= ix2 || iy1 >= iy2) return [source];
                const pieces = [];
                pushRect(pieces, source.x1, source.y1, source.x2, iy1);
                pushRect(pieces, source.x1, iy2, source.x2, source.y2);
                pushRect(pieces, source.x1, iy1, ix1, iy2);
                pushRect(pieces, ix2, iy1, source.x2, iy2);
                return pieces;
            }

            function coverageContainsRect(target, coverageRects, options = {}) {
                const targetRect = cloneRect(target);
                const coverage = Array.isArray(coverageRects) ? coverageRects : [];
                if (!rectHasArea(targetRect) || !coverage.length) return false;
                const coverageEpsilon = Number.isFinite(Number(options.coverageEpsilon))
                    ? Math.max(0, Number(options.coverageEpsilon))
                    : 0;
                let remaining = [targetRect];
                for (const rect of coverage) {
                    const cover = expandRect(rect, coverageEpsilon);
                    const next = [];
                    remaining.forEach((piece) => {
                        subtractRect(piece, cover).forEach((remainingPiece) => next.push(remainingPiece));
                    });
                    remaining = next;
                    if (!remaining.length) return true;
                }
                return false;
            }

            function pushRect(list, x1, y1, x2, y2) {
                if (Number(x2) > Number(x1) && Number(y2) > Number(y1)) {
                    list.push({ x1, y1, x2, y2 });
                }
            }

            function finiteNumber(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) ? numeric : fallback;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                cloneRect,
                normalizeRect,
                rectFromDimensions,
                rectHasArea,
                rectsOverlap,
                sameRect,
                intersectRects,
                expandRect,
                subtractRect,
                coverageContainsRect,
            });
        },
    });
})();
