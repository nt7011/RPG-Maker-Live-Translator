// Shared copy-edge geometry.
//
// A copy edge is a physical bitmap transform from a source rectangle to a
// target rectangle. Keeping scale and projection math here prevents text
// lineage, copied non-text replay, and the ledger from drifting apart.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copyEdgeGeometry',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
        },
        factory({ rectGeometry }) {
            const cloneRect = rectGeometry.cloneRect;
            const intersectRects = rectGeometry.intersectRects;
            const normalizeRect = rectGeometry.normalizeRect;

            function getCopyEdgeGeometry(edge) {
                const sourceRect = cloneRect(edge && edge.sourceRect);
                const targetRect = cloneRect(edge && edge.targetRect);
                if (!sourceRect || !targetRect) return null;
                return freezeApi({
                    sourceRect,
                    targetRect,
                    scaleX: computeAxisScale(sourceRect.x1, sourceRect.x2, targetRect.x1, targetRect.x2, edge && edge.scaleX),
                    scaleY: computeAxisScale(sourceRect.y1, sourceRect.y2, targetRect.y1, targetRect.y2, edge && edge.scaleY),
                });
            }

            function projectCopyEdgeSourceRect(rect, edge) {
                const geometry = getCopyEdgeGeometry(edge);
                const source = cloneRect(rect);
                if (!geometry || !source) return null;
                return normalizeRect({
                    x1: mapCopyEdgeSourceNumber(source.x1, geometry, 'x'),
                    y1: mapCopyEdgeSourceNumber(source.y1, geometry, 'y'),
                    x2: mapCopyEdgeSourceNumber(source.x2, geometry, 'x'),
                    y2: mapCopyEdgeSourceNumber(source.y2, geometry, 'y'),
                });
            }

            function unprojectCopyEdgeTargetRect(rect, edge) {
                const geometry = getCopyEdgeGeometry(edge);
                if (!geometry) return null;
                const target = intersectRects(rect, geometry.targetRect);
                if (!target) return null;
                return normalizeRect({
                    x1: unmapCopyEdgeTargetNumber(target.x1, geometry, 'x'),
                    y1: unmapCopyEdgeTargetNumber(target.y1, geometry, 'y'),
                    x2: unmapCopyEdgeTargetNumber(target.x2, geometry, 'x'),
                    y2: unmapCopyEdgeTargetNumber(target.y2, geometry, 'y'),
                });
            }

            function mapCopyEdgeSourceNumber(value, edgeOrGeometry, axis = 'x') {
                const geometry = edgeOrGeometry && edgeOrGeometry.sourceRect && edgeOrGeometry.targetRect
                    ? edgeOrGeometry
                    : getCopyEdgeGeometry(edgeOrGeometry);
                if (!geometry) return finiteNumber(value, NaN);
                const sourceRect = geometry.sourceRect;
                const targetRect = geometry.targetRect;
                const scale = axisName(axis) === 'y' ? geometry.scaleY : geometry.scaleX;
                const sourceOrigin = axisName(axis) === 'y' ? sourceRect.y1 : sourceRect.x1;
                const targetOrigin = axisName(axis) === 'y' ? targetRect.y1 : targetRect.x1;
                const number = Number(value);
                if (![number, sourceOrigin, targetOrigin, scale].every(Number.isFinite)) return number;
                return targetOrigin + ((number - sourceOrigin) * scale);
            }

            function scaleCopyEdgeDimension(value, edgeOrGeometry, axis = 'x') {
                const geometry = edgeOrGeometry && edgeOrGeometry.sourceRect && edgeOrGeometry.targetRect
                    ? edgeOrGeometry
                    : getCopyEdgeGeometry(edgeOrGeometry);
                const number = Number(value);
                if (!Number.isFinite(number) || number <= 0 || value === Infinity) return value;
                if (!geometry) return number;
                const scale = axisName(axis) === 'y' ? geometry.scaleY : geometry.scaleX;
                return Number.isFinite(scale) ? number * scale : number;
            }

            function computeAxisScale(sourceStart, sourceEnd, targetStart, targetEnd, explicitScale) {
                const explicit = Number(explicitScale);
                if (Number.isFinite(explicit) && explicit >= 0) return explicit;
                const sourceSize = Math.max(0, Number(sourceEnd) - Number(sourceStart));
                const targetSize = Math.max(0, Number(targetEnd) - Number(targetStart));
                return sourceSize > 0 ? targetSize / sourceSize : 1;
            }

            function unmapCopyEdgeTargetNumber(value, geometry, axis) {
                const sourceRect = geometry.sourceRect;
                const targetRect = geometry.targetRect;
                const scale = axisName(axis) === 'y' ? geometry.scaleY : geometry.scaleX;
                const sourceOrigin = axisName(axis) === 'y' ? sourceRect.y1 : sourceRect.x1;
                const targetOrigin = axisName(axis) === 'y' ? targetRect.y1 : targetRect.x1;
                const number = Number(value);
                if (![number, sourceOrigin, targetOrigin, scale].every(Number.isFinite) || scale === 0) return number;
                return sourceOrigin + ((number - targetOrigin) / scale);
            }

            function axisName(value) {
                return String(value || 'x') === 'y' ? 'y' : 'x';
            }

            function finiteNumber(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) ? numeric : fallback;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                getCopyEdgeGeometry,
                projectCopyEdgeSourceRect,
                unprojectCopyEdgeTargetRect,
                mapCopyEdgeSourceNumber,
                scaleCopyEdgeDimension,
                computeAxisScale,
            });
        },
    });
})();
