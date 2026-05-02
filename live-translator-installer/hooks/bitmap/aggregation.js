// Bitmap hook aggregation module.
//
// Bitmap.drawText can be called once per full string, once per word, or once
// per character depending on RPG Maker and plugins. This module buffers raw
// draw fragments briefly, groups fragments that belong to the same visual line,
// and creates bitmap text entries for the translation lifecycle.
//
// Aggregation is geometry based. Fragments merge only when their y/lineHeight,
// font signature, align value, and horizontal gap look compatible. This keeps
// unrelated UI labels from being translated as one sentence.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.hooks) {
        globalScope.LiveTranslatorModules.hooks = {};
    }
    if (!globalScope.LiveTranslatorModules.hooks.bitmap) {
        globalScope.LiveTranslatorModules.hooks.bitmap = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/bitmap/aggregation.js.');
    }

    function attachBitmapAggregation(runtime) {
        const {
            bitmapStates,
            FLUSH_DELAY_MS,
            GAP_MIN,
            GAP_RATIO,
            perf,
            logger,
            diag,
            stripRpgmEscapes,
            sanitizePerChar,
            describeBitmap,
            preview,
            isValidRect,
            rectanglesOverlap,
            fragmentRect,
            registerBitmapEntry,
            activateBitmapEntryTranslation,
        } = runtime;
        const FRAME_FLUSH_TOKEN = 'liveTranslator.bitmapFrameFlush';
        const pendingFlushBitmaps = new Set();
        let fallbackFlushTimer = null;
        let frameFlushInstalled = false;

        const isSpriteTextOwnedBitmap = (bitmap) => {
            const spriteTextHook = globalScope.LiveTranslatorSpriteTextHook;
            if (!spriteTextHook || typeof spriteTextHook.isBitmapOwned !== 'function') return false;
            try {
                return !!spriteTextHook.isBitmapOwned(bitmap);
            } catch (_) {
                return false;
            }
        };

        const shouldDeferFrameFlushToSpriteText = (reason) => {
            if (reason === 'after-sprite-text') return false;
            if (!/^(SceneManager|Graphics)\./.test(String(reason || ''))) return false;
            const spriteTextHook = globalScope.LiveTranslatorSpriteTextHook;
            return !!(spriteTextHook && spriteTextHook.hasFrameHook === true && typeof spriteTextHook.flushFrame === 'function');
        };

        // Flush queued fragments into logical text entries. targetRect is used
        // before invalidation so only fragments overlapping a clear/fill area
        // are forced through aggregation.
        const flushAggregatedLines = (bitmap, reason = 'manual', targetRect = null) => {
            const state = bitmapStates.get(bitmap);
            if (!state || !Array.isArray(state.fragments) || state.fragments.length === 0) {
                if (state && !targetRect) {
                    state.flushQueued = false;
                    pendingFlushBitmaps.delete(bitmap);
                }
                return;
            }
            if (!targetRect) {
                state.flushQueued = false;
                pendingFlushBitmaps.delete(bitmap);
            }
            const perfFlushStart = perf.isEnabled() ? perf.now() : 0;
            let fragments;
            if (targetRect && isValidRect(targetRect)) {
                const remaining = [];
                const selected = [];
                for (const fragment of state.fragments) {
                    const fragRect = fragmentRect(fragment);
                    if (fragRect && rectanglesOverlap(fragRect, targetRect)) {
                        selected.push(fragment);
                    } else {
                        remaining.push(fragment);
                    }
                }
                if (!selected.length) return;
                fragments = selected;
                state.fragments = remaining;
                if (!state.fragments.length) {
                    state.flushQueued = false;
                    pendingFlushBitmaps.delete(bitmap);
                }
                diag(`[bitmap/flush] reason=${reason} fragments=${fragments.length} (targeted)`);
            } else {
                fragments = state.fragments.splice(0, state.fragments.length);
                diag(`[bitmap/flush] reason=${reason} fragments=${fragments.length}`);
            }
            const beforeSpriteTextFilter = fragments.length;
            fragments = fragments.filter((fragment) => fragment && !isSpriteTextOwnedBitmap(fragment.bitmap));
            if (beforeSpriteTextFilter !== fragments.length) {
                perf.count('bitmap.flush.skippedSpriteTextOwned', beforeSpriteTextFilter - fragments.length);
            }
            if (!fragments.length) return;
            perf.count('bitmap.flush.calls');
            perf.count('bitmap.flush.fragments', fragments.length);
            perf.top('bitmap.flush.reason', reason || 'unknown');

            const lines = new Map();
            for (const fragment of fragments) {
                const yKey = `${Math.round(fragment.y)}:${Math.round(fragment.lineHeight)}`;
                if (!lines.has(yKey)) lines.set(yKey, []);
                lines.get(yKey).push(fragment);
            }
            perf.count('bitmap.flush.lines', lines.size);

            const now = Date.now();
            const entries = [];
            lines.forEach((lineFragments) => {
                lineFragments.sort((a, b) => a.x - b.x);
                let currentBlock = [];
                let lastFragment = null;
                const groupList = [];
                // Split each visual line into blocks. Large gaps or style
                // changes indicate separate labels rather than a single string.
                for (const frag of lineFragments) {
                    if (!lastFragment) {
                        currentBlock = [frag];
                        groupList.push(currentBlock);
                        lastFragment = frag;
                        continue;
                    }
                    const gap = frag.x - (lastFragment.x + lastFragment.width);
                    const gapLimit = Math.max(GAP_MIN, Math.ceil((frag.lineHeight || lastFragment.lineHeight || 24) * GAP_RATIO));
                    const sameFont = lastFragment.fontSignature === frag.fontSignature;
                    const sameAlign = lastFragment.align === frag.align;
                    if (gap > gapLimit || !sameFont || !sameAlign) {
                        currentBlock = [frag];
                        groupList.push(currentBlock);
                    } else {
                        currentBlock.push(frag);
                    }
                    lastFragment = frag;
                }

                for (const block of groupList) {
                    if (!block.length) continue;
                    const bounds = block.reduce((acc, frag) => {
                        const minX = Math.min(acc.x1, frag.x);
                        const minY = Math.min(acc.y1, frag.y);
                        const maxX = Math.max(acc.x2, frag.x + frag.width);
                        const maxY = Math.max(acc.y2, frag.y + frag.lineHeight);
                        return {
                            x1: minX,
                            y1: minY,
                            x2: maxX,
                            y2: maxY,
                        };
                    }, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
                    if (!Number.isFinite(bounds.x1) || !Number.isFinite(bounds.y1)) continue;

                    const combinedRaw = block.map(f => f.rawText).join('');
                    const combinedVisible = sanitizePerChar(block.map(f => f.visibleText).join(''));
                    const converted = stripRpgmEscapes(combinedRaw || '');
                    const trimmed = sanitizePerChar(converted).trim();
                    if (!trimmed) {
                        diag(`[bitmap/skip] ${describeBitmap(bitmap)} empty trimmed text after combination.`);
                        continue;
                    }
                    const ownerType = block[0].ownerType;
                    const align = block.length === 1 ? block[0].align : 'left';
                    const drawX = block.length === 1 ? block[0].x : bounds.x1;
                    const maxWidth = Math.max(bounds.x2 - bounds.x1, block.reduce((m, f) => Math.max(m, f.maxWidth || 0), 0));
                    const lineHeight = Math.max(...block.map(f => f.lineHeight || 0), 1);
                    const preferredFragment = block.reduce((best, frag) => {
                        if (!frag) return best;
                        const widthScore = Math.max(1, Number.isFinite(frag.width) ? frag.width : frag.maxWidth || 0);
                        const textLen = sanitizePerChar(frag.visibleText || frag.rawText || '').length;
                        if (!best) {
                            return { frag, score: widthScore, len: textLen };
                        }
                        if (widthScore > best.score) {
                            return { frag, score: widthScore, len: textLen };
                        }
                        if (widthScore === best.score && textLen > best.len) {
                            return { frag, score: widthScore, len: textLen };
                        }
                        return best;
                    }, null);
                    // The dominant fragment supplies draw state/method. This is
                    // usually the widest fragment, which tends to carry the most
                    // representative font and method data for the grouped text.
                    const dominantFragment = preferredFragment && preferredFragment.frag ? preferredFragment.frag : block[block.length - 1];
                    const drawState = dominantFragment && dominantFragment.drawState ? dominantFragment.drawState : block[0].drawState;
                    const methodName = dominantFragment && dominantFragment.methodName
                        ? dominantFragment.methodName
                        : (block[0] && block[0].methodName ? block[0].methodName : 'drawText');

                    const entry = {
                        bitmap,
                        key: `${state.id}:${Math.round(drawX)}:${Math.round(bounds.y1)}:${Math.round(maxWidth)}:${align}:${ownerType}`,
                        detectedAt: now,
                        ownerType,
                        rawText: combinedRaw,
                        visibleText: combinedVisible,
                        convertedText: converted,
                        trimmedText: trimmed,
                        drawParams: {
                            x: drawX,
                            y: bounds.y1,
                            maxWidth: Math.max(1, maxWidth),
                            lineHeight: Math.max(1, lineHeight),
                            align,
                        },
                        bounds,
                        drawState,
                        translationStatus: 'pending',
                        fragments: block,
                        position: { x: drawX, y: bounds.y1 },
                        methodName,
                        debugCallSite: dominantFragment && dominantFragment.debugCallSite
                            ? dominantFragment.debugCallSite
                            : (block[0] && block[0].debugCallSite ? block[0].debugCallSite : ''),
                    };
                    entries.push(entry);
                }
            });

            const activationQueue = [];
            perf.count('bitmap.flush.entries', entries.length);
            // Register all entries before starting async work. This avoids a
            // cache-hit redraw mutating state while the rest of the flush still
            // needs to register entries from the same frame.
            for (const entry of entries) {
                registerBitmapEntry(entry, activationQueue);
            }
            for (const entry of activationQueue) {
                activateBitmapEntryTranslation(entry);
            }
            if (perfFlushStart) {
                perf.time('bitmap.flush.ms', perf.now() - perfFlushStart);
            }
        };

        const flushQueuedBitmaps = (reason = 'frame') => {
            if (!pendingFlushBitmaps.size) return;
            if (shouldDeferFrameFlushToSpriteText(reason)) return;
            const bitmaps = Array.from(pendingFlushBitmaps);
            pendingFlushBitmaps.clear();
            for (const bitmap of bitmaps) {
                const state = bitmapStates.get(bitmap);
                if (state) state.flushQueued = false;
                try { flushAggregatedLines(bitmap, reason); } catch (err) {
                    logger.warn('[bitmap/flush-error]', err);
                }
            }
        };

        const scheduleFallbackFlush = () => {
            if (frameFlushInstalled || fallbackFlushTimer) return;
            fallbackFlushTimer = setTimeout(() => {
                fallbackFlushTimer = null;
                flushQueuedBitmaps('fallback-timer');
            }, FLUSH_DELAY_MS);
        };

        // Frame flushing lets a burst of per-character drawText calls aggregate
        // without scheduling one timer per bitmap.
        const scheduleFlush = (bitmap) => {
            const state = bitmapStates.get(bitmap);
            if (!state) return;
            if (state.flushQueued) return;
            perf.count('bitmap.flush.scheduled');
            state.flushQueued = true;
            pendingFlushBitmaps.add(bitmap);
            scheduleFallbackFlush();
        };

        const installBitmapFrameFlushHook = (target, methodName, label, flushBefore) => {
            if (!target || typeof target[methodName] !== 'function') return false;
            if (target[methodName].__trBitmapFrameFlush === FRAME_FLUSH_TOKEN) return true;
            const original = target[methodName];
            const wrapped = function(...args) {
                if (flushBefore) flushQueuedBitmaps(label);
                const result = original.apply(this, args);
                if (!flushBefore) flushQueuedBitmaps(label);
                return result;
            };
            wrapped.__trBitmapFrameFlush = FRAME_FLUSH_TOKEN;
            wrapped.__trOriginal = original;
            target[methodName] = wrapped;
            diag(`[bitmap/hook] Wrapped ${label} for frame flush`);
            return true;
        };

        const installBitmapFrameFlushHooks = () => {
            let installedAny = false;
            try {
                if (typeof SceneManager !== 'undefined' && SceneManager) {
                    installedAny = installBitmapFrameFlushHook(SceneManager, 'updateScene', 'SceneManager.updateScene', false) || installedAny;
                    installedAny = installBitmapFrameFlushHook(SceneManager, 'renderScene', 'SceneManager.renderScene', true) || installedAny;
                }
            } catch (_) {}
            try {
                if (typeof Graphics !== 'undefined' && Graphics) {
                    installedAny = installBitmapFrameFlushHook(Graphics, 'render', 'Graphics.render', true) || installedAny;
                }
            } catch (_) {}
            frameFlushInstalled = installedAny;
            if (frameFlushInstalled && fallbackFlushTimer) {
                try { clearTimeout(fallbackFlushTimer); } catch (_) {}
                fallbackFlushTimer = null;
            }
            return installedAny;
        };

        Object.assign(runtime, {
            flushAggregatedLines,
            flushQueuedBitmaps,
            scheduleFlush,
            installBitmapFrameFlushHooks,
        });
        try { globalScope.LiveTranslatorFlushBitmapFallback = flushQueuedBitmaps; } catch (_) {}

        return runtime;
    }

    defineRuntimeModule('hooks.bitmap.aggregation', {
        attach: attachBitmapAggregation,
    });
})();
