// Bitmap hook translation module.
//
// This module owns the lifecycle of aggregated bitmap text entries after they
// have been grouped from raw drawText fragments. It decides whether an entry is
// translatable, prepares control-code-safe translation input, requests or reads
// translations from cache, and applies translated text with replay protection.
//
// Entry lifecycle:
// pending -> translating -> completed
// pending -> skipped for counters/cache skips/empty normalized text
// any active state -> stale when invalidation or replacement makes it unsafe
//
// Async translation is guarded by entry.instanceId and _trStale so old results
// cannot redraw text after the bitmap content has changed.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/bitmap/translation.js.');
    }

    function attachBitmapTranslation(runtime) {
        const {
            bitmapStates,
            translationCache,
            perf,
            logger,
            prepareTextForTranslation,
            restoreControlCodes,
            stripRpgmEscapes,
            telemetry,
            textTracker,
            preview,
            diag,
            nextInstanceId,
            skipLikeCounter,
            markEntryStale,
            deriveEntryRect,
            describeBitmap,
            describeEntry,
            recordNativeBitmapTextOp,
            removeNativeTextOpByKey,
            nextDrawOrder,
            sanitizeBitmapDrawText,
            sanitizePerChar,
            calculateClearRect,
            rectFromDimensions,
            collectReplayItems,
            shouldTraceBitmapDiagnostics,
            formatRect,
            summarizeReplayItems,
            withBitmapReplay,
            replayBitmapItems,
            drawBitmapTextValue,
            getBitmapFallbackMode = () => 'redraw',
            isBitmapFallbackRedrawEnabled = () => true,
        } = runtime;

        const hasTextTracker = () => textTracker
            && typeof textTracker.detect === 'function'
            && (typeof textTracker.isEnabled !== 'function' || textTracker.isEnabled());
        const markRecordDisappeared = (recordId, reason, details = null) => {
            if (!textTracker || !recordId) return;
            if (typeof textTracker.disappear === 'function') {
                textTracker.disappear(recordId, reason, details);
            } else if (typeof textTracker.stale === 'function') {
                textTracker.stale(recordId, reason, details);
            }
        };
        const trackDecision = (recordId, type, message = '', details = null) => {
            if (textTracker && typeof textTracker.decision === 'function' && recordId) {
                textTracker.decision(recordId, type, message, details);
            }
        };

        const describeTranslationSkip = (text, fallbackReason = 'cacheSkip') => {
            const normalized = String(text || '').trim();
            try {
                if (translationCache && typeof translationCache.describeSkip === 'function') {
                    const info = translationCache.describeSkip(normalized) || {};
                    return {
                        skip: info.skip === true,
                        reason: info.reason || fallbackReason,
                        details: Object.assign({ reason: info.reason || fallbackReason }, info),
                    };
                }
            } catch (_) {}
            let skip = false;
            try {
                skip = !!(translationCache && typeof translationCache.shouldSkip === 'function' && translationCache.shouldSkip(normalized));
            } catch (_) {
                skip = false;
            }
            return {
                skip,
                reason: skip ? fallbackReason : 'translatable',
                details: {
                    reason: skip ? fallbackReason : 'translatable',
                    length: normalized.length,
                },
            };
        };

        const ensureBitmapRecordId = (entry) => {
            if (!entry) return '';
            if (!entry.recordId) {
                const bitmapState = bitmapStates.get(entry.bitmap);
                const bitmapId = bitmapState && bitmapState.id ? bitmapState.id : 'bitmap';
                entry.recordId = `bitmap:${bitmapId}:${entry.key || entry.instanceId || Date.now()}`;
            }
            return entry.recordId;
        };

        const trackBitmapEntry = (entry, status, decision = null) => {
            if (!hasTextTracker() || !entry) return;
            const recordId = ensureBitmapRecordId(entry);
            if (!recordId) return;
            textTracker.upsert({
                id: recordId,
                hook: 'bitmap',
                hookLabel: 'Bitmap',
                surfaceType: 'bitmap',
                status: status || entry.translationStatus || 'detected',
                rawText: entry.rawText || '',
                convertedText: entry.convertedText || '',
                visibleText: entry.trimmedText || entry.visibleText || '',
                original: entry.trimmedText || entry.visibleText || entry.rawText || '',
                translationSource: entry.translationSource || '',
                normalizedSource: entry.normalizedSource || '',
                translation: entry.translatedText || '',
                ...(entry.translationReceived ? { translationReceived: entry.translationReceived } : {}),
                x: entry.drawParams ? entry.drawParams.x : (entry.position && entry.position.x),
                y: entry.drawParams ? entry.drawParams.y : (entry.position && entry.position.y),
                bounds: deriveEntryRect(entry),
                ownerType: entry.ownerType || 'Bitmap',
                methodName: entry.methodName || 'drawText',
                metadata: {
                    fragments: Array.isArray(entry.fragments) ? entry.fragments.length : 0,
                    instanceId: entry.instanceId || '',
                    drawOrder: entry.drawOrder || 0,
                },
            }, decision);
        };

        // Start translation for a registered entry. Cache hits apply
        // immediately; async responses carry the expected instance id so they
        // can be rejected if the entry was replaced while the request ran.
        const activateBitmapEntryTranslation = (entry) => {
            if (!entry) return;
            if (entry._trStale) {
                trackDecision(entry.recordId, 'bitmap.activation_skipped', 'entry stale');
                return;
            }
            if (!entry.isTranslatable) {
                trackDecision(entry.recordId, 'bitmap.activation_skipped', 'not translatable');
                return;
            }
            if (entry.translationStatus === 'completed' || entry.translationStatus === 'translating') {
                trackDecision(entry.recordId, 'bitmap.activation_skipped', entry.translationStatus || '');
                return;
            }
            if (!isBitmapFallbackRedrawEnabled()) {
                entry.translationStatus = getBitmapFallbackMode() === 'detect' ? 'detected' : 'skipped';
                trackBitmapEntry(entry, entry.translationStatus, {
                    type: 'bitmap.redraw_disabled',
                    details: { mode: getBitmapFallbackMode() },
                });
                return;
            }
            const state = bitmapStates.get(entry.bitmap);
            if (!state || state.entries.get(entry.key) !== entry) {
                markRecordDisappeared(ensureBitmapRecordId(entry), 'bitmap-entry-not-current', {
                    ownerType: entry.ownerType || 'Bitmap',
                    instanceId: entry.instanceId || '',
                });
                return;
            }

            try {
                if (translationCache.completed.has(entry.normalizedSource)) {
                    const translated = translationCache.completed.get(entry.normalizedSource);
                    perf.count('bitmap.translation.cacheHit');
                    trackDecision(ensureBitmapRecordId(entry), 'translation.cache_hit', '', {
                        ownerType: entry.ownerType || 'Bitmap',
                    });
                    applyBitmapTranslation(entry, translated, 'cache', entry.instanceId);
                    return;
                }
            } catch (cacheErr) {
                logger.warn('[bitmap/cache-error]', cacheErr);
            }

            entry.translationStatus = 'translating';
            trackBitmapEntry(entry, 'translating', { type: 'translation.request' });
            const targetInstanceId = entry.instanceId;
            perf.count('bitmap.translation.request');
            entry.translationPromise = translationCache.requestTranslation(entry.translationSource, {
                recordId: ensureBitmapRecordId(entry),
                hook: 'bitmap',
            })
                .then(translated => applyBitmapTranslation(entry, translated, 'async', targetInstanceId))
                .catch(error => {
                    entry.translationStatus = 'error';
                    if (hasTextTracker()) {
                        textTracker.fail(ensureBitmapRecordId(entry), error && error.message ? error.message : String(error || 'translation error'));
                    }
                    if (!entry._trStale) {
                        logger.warn('[bitmap/translation-error]', error);
                    }
                });
        };

        // Register a new aggregated text entry or refresh an existing one.
        // Skipped text is still recorded as native replay history so translated
        // neighbors can clear and redraw without damaging the original layout.
        const registerBitmapEntry = (entry, activationQueue = null) => {
            const { bitmap, key } = entry;
            const state = bitmapStates.get(bitmap);
            if (!state) return;
            perf.count('bitmap.entry.registerAttempt');
            perf.top('bitmap.owner', entry.ownerType || 'Bitmap');

            const normalized = entry.trimmedText;
            const looksLikeCounter = skipLikeCounter(normalized);
            const skipInfo = normalized && !looksLikeCounter
                ? describeTranslationSkip(normalized)
                : { skip: false, reason: '', details: {} };
            const shouldSkipText = !!normalized && !looksLikeCounter && skipInfo.skip;
            if (!normalized || looksLikeCounter || shouldSkipText) {
                const reason = !normalized ? 'empty' : (looksLikeCounter ? 'counterLike' : (skipInfo.reason || 'cacheSkip'));
                const skipDetails = Object.assign(
                    { reason },
                    shouldSkipText ? (skipInfo.details || {}) : {}
                );
                removeNativeTextOpByKey(state, key);
                const existing = state.entries.get(key);
                if (existing && existing.trimmedText === entry.trimmedText && existing.isTranslatable === false) {
                    existing.detectedAt = Date.now();
                    existing.rawText = entry.rawText;
                    existing.visibleText = entry.visibleText;
                    existing.convertedText = entry.convertedText;
                    existing.trimmedText = entry.trimmedText;
                    existing.drawParams = entry.drawParams;
                    existing.bounds = entry.bounds;
                    existing.drawState = entry.drawState;
                    existing.fragments = entry.fragments;
                    existing.position = entry.position;
                    existing.methodName = entry.methodName;
                    existing.debugCallSite = entry.debugCallSite;
                    existing.drawOrder = nextDrawOrder(state);
                    trackBitmapEntry(existing, 'skipped', {
                        type: 'detected.refresh',
                        message: reason,
                        details: skipDetails,
                    });
                    return existing;
                }
                if (existing) {
                    markEntryStale(state, existing, 'native-replace', { rect: deriveEntryRect(existing) });
                }
                entry.drawOrder = nextDrawOrder(state);
                entry.instanceId = nextInstanceId();
                entry.createdAt = Date.now();
                entry.isTranslatable = false;
                entry.translationStatus = 'skipped';
                entry.translationSource = '';
                entry.normalizedSource = '';
                state.entries.set(key, entry);
                trackBitmapEntry(entry, 'skipped', {
                    type: 'translation.skipped',
                    message: reason,
                    details: skipDetails,
                });
                perf.count('bitmap.entry.skipped');
                perf.top('bitmap.entry.skipReason', reason);
                diag(`[bitmap/skip] ${describeBitmap(bitmap)} ${describeEntry(entry)} reason=${reason} replay=entry#${entry.drawOrder || 0} text="${preview(normalized)}"${entry.debugCallSite ? ` site=${entry.debugCallSite}` : ''}`);
                return entry;
            }

            removeNativeTextOpByKey(state, key);
            const existing = state.entries.get(key);
            const fallbackMode = getBitmapFallbackMode();
            // Same key and same text means the game redrew the same entry.
            // Refresh geometry/state but keep any pending or completed
            // translation lifecycle already attached to the entry.
            if (existing && existing.trimmedText === entry.trimmedText) {
                perf.count('bitmap.entry.updatedExisting');
                existing.detectedAt = Date.now();
                existing.rawText = entry.rawText;
                existing.visibleText = entry.visibleText;
                existing.convertedText = entry.convertedText;
                existing.drawParams = entry.drawParams;
                existing.bounds = entry.bounds;
                existing.drawState = entry.drawState;
                existing.fragments = entry.fragments;
                existing.position = entry.position;
                existing.methodName = entry.methodName;
                existing.debugCallSite = entry.debugCallSite;
                existing.drawOrder = nextDrawOrder(state);
                diag(`[bitmap/entry-skip] ${describeBitmap(bitmap)} ${describeEntry(existing)} text="${preview(entry.trimmedText)}"${existing.debugCallSite ? ` site=${existing.debugCallSite}` : ''}`);
                if (!isBitmapFallbackRedrawEnabled()) {
                    existing.translationStatus = fallbackMode === 'detect' ? 'detected' : 'skipped';
                    trackBitmapEntry(existing, existing.translationStatus, {
                        type: 'bitmap.redraw_disabled',
                        details: { mode: fallbackMode },
                    });
                    perf.count('bitmap.entry.detectOnly');
                    return existing;
                }
                if (activationQueue && existing.translationStatus === 'pending') {
                    activationQueue.push(existing);
                } else if (!activationQueue) {
                    activateBitmapEntryTranslation(existing);
                }
                return existing;
            }
            if (existing) {
                perf.count('bitmap.entry.replaced');
                markEntryStale(state, existing, 'replace', { rect: deriveEntryRect(existing) });
            }

            entry.drawOrder = nextDrawOrder(state);
            entry.isTranslatable = true;
            entry.translationStatus = 'pending';
            state.entries.set(key, entry);
            entry.placeholderInfo = prepareTextForTranslation(entry.rawText);
            entry.translationSource = entry.placeholderInfo
                ? entry.placeholderInfo.textForTranslation
                : entry.rawText;
            entry.normalizedSource = String(entry.translationSource || '').trim();
            // Empty after control-code preparation means there is no model input
            // worth translating, but the native draw still matters for replay.
            if (!entry.normalizedSource) {
                entry.isTranslatable = false;
                entry.translationStatus = 'skipped';
                trackBitmapEntry(entry, 'skipped', {
                    type: 'translation.skipped',
                    message: 'emptyNormalized',
                    details: { reason: 'emptyNormalized' },
                });
                perf.count('bitmap.entry.skipped');
                perf.top('bitmap.entry.skipReason', 'emptyNormalized');
                diag(`[bitmap/skip] ${describeBitmap(bitmap)} ${describeEntry(entry)} reason=emptyNormalized replay=entry#${entry.drawOrder || 0} text="${preview(entry.trimmedText)}"`);
                return entry;
            }

            const now = Date.now();
            entry.instanceId = nextInstanceId();
            entry.createdAt = now;
            perf.count('bitmap.entry.created');

            telemetry.logTextDetected('bitmap', normalized, entry.drawParams.x, entry.drawParams.y, {
                ownerType: entry.ownerType,
                fragments: entry.fragments.length,
            });
            trackBitmapEntry(entry, 'pending', { type: 'detected' });
            diag(`[bitmap/register] ${describeBitmap(bitmap)} ${describeEntry(entry)} text="${preview(normalized)}" fragments=${entry.fragments.length}${entry.debugCallSite ? ` site=${entry.debugCallSite}` : ''}`);
            if (!isBitmapFallbackRedrawEnabled()) {
                entry.translationStatus = fallbackMode === 'detect' ? 'detected' : 'skipped';
                trackBitmapEntry(entry, entry.translationStatus, {
                    type: 'bitmap.redraw_disabled',
                    details: { mode: fallbackMode },
                });
                perf.count('bitmap.entry.detectOnly');
                return entry;
            }
            if (activationQueue) {
                activationQueue.push(entry);
            } else {
                activateBitmapEntryTranslation(entry);
            }
            return entry;
        };

        // Replace the original bitmap text with a translation. The active entry
        // marker lets invalidation hooks recognize our own clearRect and avoid
        // canceling the entry being redrawn.
        const applyBitmapTranslation = (entry, translated, source, expectedInstanceId = null) => {
            if (!entry || entry._trStale) return;
            if (expectedInstanceId && entry.instanceId !== expectedInstanceId) {
                diag(`[bitmap/skip-uuid] ${describeBitmap(entry.bitmap)} ${describeEntry(entry)} expected=${expectedInstanceId} text="${preview(entry.trimmedText)}"`);
                trackDecision(ensureBitmapRecordId(entry), 'bitmap.instance_mismatch', '', {
                    expectedInstanceId,
                    currentInstanceId: entry.instanceId || '',
                    source: source || 'unknown',
                });
                return;
            }
            const state = bitmapStates.get(entry.bitmap);
            if (!state || state.entries.get(entry.key) !== entry) {
                markRecordDisappeared(ensureBitmapRecordId(entry), 'bitmap-entry-not-current', {
                    ownerType: entry.ownerType || 'Bitmap',
                    instanceId: entry.instanceId || '',
                    source: source || 'unknown',
                });
                return;
            }

            let restored = translated;
            try {
                if (entry.placeholderInfo) {
                    restored = restoreControlCodes(translated, entry.placeholderInfo, entry.rawText);
                }
            } catch (restoreError) {
                logger.warn('[bitmap/restore-error]', restoreError);
            }
            restored = sanitizeBitmapDrawText(restored, entry.methodName);
            if (typeof restored !== 'string') restored = entry.rawText;
            entry.translationReceived = typeof translated === 'string' ? translated : '';
            const restoredTrimmed = sanitizePerChar(stripRpgmEscapes(restored || '')).trim();
            if (!restoredTrimmed || restoredTrimmed === entry.trimmedText) {
                perf.count('bitmap.translation.skipSame');
                diag(`[bitmap/skip-same] ${describeBitmap(entry.bitmap)} ${describeEntry(entry)} text="${preview(entry.trimmedText)}"`);
                entry.translationStatus = 'skipped';
                trackBitmapEntry(entry, 'skipped', {
                    type: 'translation.skipped',
                    message: 'translated text matched original',
                });
                return;
            }

            const bitmap = entry.bitmap;
            if (!bitmap) {
                markRecordDisappeared(ensureBitmapRecordId(entry), 'bitmap-missing', {
                    ownerType: entry.ownerType || 'Bitmap',
                    instanceId: entry.instanceId || '',
                });
                return;
            }
            perf.count('bitmap.translation.apply');
            perf.top('bitmap.translation.source', source || 'unknown');
            perf.top('bitmap.owner', entry.ownerType || 'Bitmap');

            const prevActiveEntry = bitmap._trActiveRedrawEntry || null;
            bitmap._trActiveRedrawEntry = entry;
            const perfRedrawStart = perf.isEnabled() ? perf.now() : 0;
            try {
                const outlinePadding = entry.drawState && Number.isFinite(entry.drawState.outlineWidth)
                    ? Math.max(1, entry.drawState.outlineWidth + 1)
                    : 2;
                const clearRect = calculateClearRect(bitmap, entry, outlinePadding);
                const guardRect = clearRect && clearRect.width > 0 && clearRect.height > 0
                    ? rectFromDimensions(clearRect.x, clearRect.y, clearRect.width, clearRect.height)
                    : null;
                const currentOrder = entry.drawOrder || 0;
                const replayBefore = guardRect
                    ? collectReplayItems(state, guardRect, entry, order => order < currentOrder)
                    : [];
                const replayAfter = guardRect
                    ? collectReplayItems(state, guardRect, entry, order => order > currentOrder)
                    : [];
                trackDecision(ensureBitmapRecordId(entry), 'bitmap.redraw_plan', '', {
                    source: source || 'unknown',
                    clearRect: clearRect || null,
                    replayBefore: replayBefore.length,
                    replayAfter: replayAfter.length,
                    drawOrder: currentOrder,
                });
                // Redraw order is: clear old text, replay prior overlapping
                // paint, draw translation, then replay later overlapping paint.
                // This approximates the original canvas stacking order.
                perf.count('bitmap.redraw.calls');
                perf.count('bitmap.redraw.replayBefore', replayBefore.length);
                perf.count('bitmap.redraw.replayAfter', replayAfter.length);
                diag(`[bitmap/redraw] ${describeBitmap(bitmap)} src=${source} method=${entry.methodName || 'drawText'} ${describeEntry(entry)} "${preview(entry.trimmedText)}" -> "${preview(restoredTrimmed)}"`);
                if (shouldTraceBitmapDiagnostics()) {
                    diag(`[bitmap/redraw-plan] ${describeBitmap(bitmap)} clear=${guardRect ? formatRect(guardRect) : 'n/a'} before=${replayBefore.length} [${summarizeReplayItems(replayBefore)}] after=${replayAfter.length} [${summarizeReplayItems(replayAfter)}]${entry.debugCallSite ? ` site=${entry.debugCallSite}` : ''}`);
                }
                telemetry.logDraw('bitmap_redraw', restoredTrimmed, entry.drawParams.x, entry.drawParams.y, {
                    ownerType: entry.ownerType,
                    source,
                    method: entry.methodName || 'drawText',
                });
                withBitmapReplay(bitmap, () => {
                    if (clearRect && clearRect.width > 0 && clearRect.height > 0) {
                        try { bitmap.clearRect(clearRect.x, clearRect.y, clearRect.width, clearRect.height); } catch (_) {}
                    }
                    replayBitmapItems(bitmap, replayBefore);
                    drawBitmapTextValue(bitmap, entry, restored);
                    replayBitmapItems(bitmap, replayAfter);
                });
            } finally {
                bitmap._trActiveRedrawEntry = prevActiveEntry;
                if (perfRedrawStart) {
                    perf.time('bitmap.redraw.ms', perf.now() - perfRedrawStart);
                }
            }

            entry.translationStatus = 'completed';
            entry.translatedText = restored;
            entry.completedAt = Date.now();
            trackBitmapEntry(entry, 'completed', {
                type: 'translation.applied',
                details: { source: source || 'unknown' },
            });
            if (hasTextTracker()) {
                textTracker.draw(ensureBitmapRecordId(entry), 'redraw', {
                    source: source || 'unknown',
                    ownerType: entry.ownerType || 'Bitmap',
                    instanceId: entry.instanceId || '',
                    translationDrawn: restored,
                });
            }
        };


        Object.assign(runtime, {
            activateBitmapEntryTranslation,
            registerBitmapEntry,
            applyBitmapTranslation,
        });

        return runtime;
    }

    defineRuntimeModule('hooks.bitmap.translation', {
        attach: attachBitmapTranslation,
    });
})();
