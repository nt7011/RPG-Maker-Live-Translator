// Bitmap dirty marker.
//
// Rendering adapters and bitmap replay code need one shared way to publish
// bitmap pixel changes to RPG Maker/NW.js texture plumbing. This module owns
// that low-level upload signal: call Bitmap._setDirty when present, set the
// common dirty flags, and update every exposed base texture exactly once.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.bitmapDirtyMarker',
        factory() {
            function createBitmapDirtyMarker(deps = {}) {
                const reportError = typeof deps.reportError === 'function'
                    ? deps.reportError
                    : () => {};

                function markBitmapPixelsDirty(bitmap, input = {}) {
                    const source = input && typeof input === 'object' ? input : {};
                    const result = {
                        handled: !!bitmap,
                        marked: false,
                        setDirty: false,
                        dirtyFlags: [],
                        baseTextureUpdates: 0,
                        bitmapWidth: readBitmapDimension(bitmap, 'width'),
                        bitmapHeight: readBitmapDimension(bitmap, 'height'),
                        reason: stringify(source.reason || source.source || 'bitmap-pixels-dirty'),
                        errors: 0,
                    };
                    if (!bitmap) return result;

                    if (typeof bitmap._setDirty === 'function') {
                        try {
                            bitmap._setDirty();
                            result.setDirty = true;
                            result.marked = true;
                        } catch (error) {
                            result.errors += 1;
                            reportError('markBitmapPixelsDirty.setDirty', error, {
                                reason: result.reason,
                            });
                        }
                    }

                    markBitmapDirtyFlag(bitmap, '_dirty', result);
                    markBitmapDirtyFlag(bitmap, 'dirty', result);
                    markBitmapDirtyFlag(bitmap, '_needsUpdate', result);
                    result.baseTextureUpdates = markBitmapBaseTexturesDirty(bitmap, result);
                    if (result.baseTextureUpdates > 0) result.marked = true;
                    return result;
                }

                function markBitmapDirtyFlag(bitmap, propertyName, result) {
                    try {
                        bitmap[propertyName] = true;
                        result.dirtyFlags.push(propertyName);
                        result.marked = true;
                    } catch (error) {
                        result.errors += 1;
                        reportError(`markBitmapPixelsDirty.${propertyName}`, error, {
                            reason: stringify(result && result.reason || ''),
                        });
                    }
                }

                function markBitmapBaseTexturesDirty(bitmap, result) {
                    const baseTextures = [
                        bitmap && bitmap._baseTexture,
                        bitmap && bitmap.baseTexture,
                        bitmap && bitmap._texture && bitmap._texture.baseTexture,
                    ];
                    const seen = new Set();
                    let updates = 0;
                    baseTextures.forEach((baseTexture) => {
                        if (!baseTexture || typeof baseTexture.update !== 'function') return;
                        if (seen.has(baseTexture)) return;
                        seen.add(baseTexture);
                        try {
                            baseTexture.update();
                            updates += 1;
                        } catch (error) {
                            result.errors += 1;
                            reportError('markBitmapPixelsDirty.baseTexture', error, {
                                reason: stringify(result && result.reason || ''),
                            });
                        }
                    });
                    return updates;
                }

                return freezeApi({
                    markBitmapPixelsDirty,
                });
            }

            function readBitmapDimension(bitmap, propertyName) {
                if (!bitmap) return 0;
                return readPositiveInteger(
                    bitmap[propertyName],
                    readPositiveInteger(
                        bitmap._canvas && bitmap._canvas[propertyName],
                        readPositiveInteger(bitmap._image && bitmap._image[propertyName], 0)
                    )
                );
            }

            function readPositiveInteger(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createBitmapDirtyMarker,
            });
        },
    });
})();
