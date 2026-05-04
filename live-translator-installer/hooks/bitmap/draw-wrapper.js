// Bitmap hook draw-wrapper module.
//
// This is the only bitmap submodule that installs the low-level draw wrappers.
// It wraps Bitmap.drawText plus known drawText variants, decides which draws
// should be bypassed, captures eligible draws as fragments, and schedules the
// aggregation pipeline.
//
// The wrapper must be conservative. Higher-level hooks already handle message
// windows, normal Window_Base drawText paths, and some custom dedicated hooks.
// This layer should catch universal low-level bitmap text without double
// translating text that a more specific hook owns.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/bitmap/draw-wrapper.js.');
    }

    function installBitmapDrawWrappers(runtime) {
        const {
            DRAW_WRAPPER_TOKEN,
            SMALL_TEXT_WRAPPER_TOKEN,
            NORMAL_CHAR_WRAPPER_TOKEN,
            perf,
            logger,
            diag,
            diagHot,
            preview,
            REDRAW_SIGNATURE,
            stripRpgmEscapes,
            contentsOwners,
            captureBitmapDrawState,
            normalizeCanvasTextAlign,
            isSmallTextScratchBitmap,
            isSmallTextDrawActive,
            isNormalCharacterDrawActive,
            shouldCaptureBitmapCallSites,
            captureBitmapCallSite,
            shouldTraceBitmapDiagnostics,
            hasDedicatedOwnerHook,
            describeBitmap,
            ensureBitmapState,
            estimateWidth,
            computeFontSignature,
            scheduleFlush,
            installBitmapFrameFlushHooks = () => false,
            installSmallTextMarker,
            installNormalCharacterMarker,
            flushAggregatedLines,
            isBitmapFallbackCaptureEnabled = () => true,
        } = runtime;

        if (typeof Bitmap === 'undefined' || !Bitmap || !Bitmap.prototype) {
            diag('[bitmap/init] Bitmap unavailable; skipping bitmap hooks.');
            return {
                status: 'skipped',
                reason: 'Bitmap is unavailable.',
            };
        }

        if (Bitmap.prototype.drawText && Bitmap.prototype.drawText.__trBitmapWrapper === DRAW_WRAPPER_TOKEN) {
            diag('[bitmap/init] Bitmap draw hooks already installed.');
            return {
                status: 'installed',
                reason: 'Bitmap draw hooks were already installed.',
            };
        }

        perf.count('bitmap.hook.init');

        // Window draw hooks call this when their aggregation depth reaches zero.
        // It lets bitmap fragments queued during a window pipeline flush without
        // waiting for the timer.
        Bitmap.prototype._trFlushAggregatedLines = function() {
            flushAggregatedLines(this, 'bitmap.flush');
        };

        const normalizeSpriteTextRecordStatus = (result) => {
            if (!result) return 'ignored';
            if (result === true) return 'claimed';
            if (typeof result === 'string') return result;
            if (result && typeof result === 'object' && result.status) {
                return String(result.status || 'ignored');
            }
            return 'claimed';
        };

        // Core draw interception path. It normalizes arguments, applies bypass
        // rules, offers sprite-owned bitmaps to Sprite Text, then records the
        // original draw as a bitmap fallback fragment after the native draw succeeds.
        const processBitmapDrawInvocation = (methodName, originalFn, bitmap, args) => {
            const [inputText, rawX, rawY, maxWidth, lineHeight, align] = args;
            const textStr = String(inputText ?? '');
            const safeAlign = normalizeCanvasTextAlign(align);
            const callArgs = [textStr, rawX, rawY, maxWidth, lineHeight, safeAlign];
            perf.count('bitmap.draw.calls');
            perf.top('bitmap.draw.method', methodName);
            const invokeOriginalDraw = () => {
                perf.count('bitmap.draw.nativeCalls');
                const perfNativeStart = perf.isEnabled() ? perf.now() : 0;
                try {
                    return originalFn.apply(bitmap, callArgs);
                } finally {
                    if (perfNativeStart) {
                        perf.time('bitmap.draw.native.ms', perf.now() - perfNativeStart);
                    }
                }
            };

            if (textStr.startsWith(REDRAW_SIGNATURE)) {
                const cleanText = textStr.substring(REDRAW_SIGNATURE.length);
                diag(`[bitmap/bypass:${methodName}] Signed input "${preview(cleanText)}" at (${rawX},${rawY})`);
                callArgs[0] = cleanText;
                perf.count('bitmap.draw.bypass.signed');
                return invokeOriginalDraw();
            }

            if (bitmap && bitmap._trBitmapReplayDepth && bitmap._trBitmapReplayDepth > 0) {
                perf.count('bitmap.draw.bypass.replay');
                return invokeOriginalDraw();
            }

            if (!bitmap || (bitmap._trBitmapSkipDepth && bitmap._trBitmapSkipDepth > 0)) {
                perf.count('bitmap.draw.bypass.skipDepth');
                return invokeOriginalDraw();
            }

            if (bitmap._trPreferWindowPipeline && bitmap._trWindowPipelineDepth > 0) {
                perf.count('bitmap.draw.bypass.windowPipeline');
                return invokeOriginalDraw();
            }

            if (bitmap._trMessageContents) {
                perf.count('bitmap.draw.bypass.messageContents');
                return invokeOriginalDraw();
            }

            // Dedicated owner hooks produce better lifecycle information than
            // raw bitmap detection, so bitmap capture stands down when possible.
            const owner = contentsOwners && contentsOwners.get ? contentsOwners.get(bitmap) : null;
            const ownerType = owner && owner.constructor ? owner.constructor.name : (bitmap.constructor ? bitmap.constructor.name : 'Bitmap');
            const debugCallSite = shouldCaptureBitmapCallSites()
                ? captureBitmapCallSite(true)
                : '';
            const numericX = Number(rawX);
            const numericY = Number(rawY);
            const numericLineHeight = Number(lineHeight);
            const numericMaxWidth = Number(maxWidth);
            const safeX = Number.isFinite(numericX) ? numericX : 0;
            const safeY = Number.isFinite(numericY) ? numericY : 0;
            const safeLineHeight = Number.isFinite(numericLineHeight) && numericLineHeight > 0
                ? numericLineHeight
                : (bitmap.fontSize || 24);
            const tryRecordSpriteTextDraw = () => {
                const spriteTextHook = globalScope.LiveTranslatorSpriteTextHook;
                if (!spriteTextHook || typeof spriteTextHook.recordBitmapDrawText !== 'function') return 'ignored';
                try {
                    return normalizeSpriteTextRecordStatus(spriteTextHook.recordBitmapDrawText({
                        bitmap,
                        methodName,
                        text: textStr,
                        x: safeX,
                        y: safeY,
                        maxWidth: Number.isFinite(numericMaxWidth) ? numericMaxWidth : maxWidth,
                        lineHeight: safeLineHeight,
                        align: safeAlign,
                        owner,
                        ownerType,
                        drawState: captureBitmapDrawState(bitmap),
                        debugCallSite,
                    }));
                } catch (spriteTextError) {
                    logger.warn('[sprite-text/bitmap-record-error]', spriteTextError);
                    return 'ignored';
                }
            };
            const smallTextBypass = isSmallTextScratchBitmap(bitmap)
                || isSmallTextDrawActive(bitmap)
                || (debugCallSite && /\bBitmap\.drawSmallText\b/.test(debugCallSite));
            if (smallTextBypass) {
                const visiblePreview = preview(stripRpgmEscapes(textStr));
                diagHot(
                    `bitmap/bypass-small-text|${ownerType}|${bitmap.width || 0}x${bitmap.height || 0}|${visiblePreview}|${debugCallSite}`,
                    () => `[bitmap/bypass-small-text] ${describeBitmap(bitmap, owner)} text="${visiblePreview}"${debugCallSite ? ` site=${debugCallSite}` : ''}`
                );
                perf.count('bitmap.draw.bypass.smallText');
                perf.top('bitmap.owner', ownerType || 'Bitmap');
                return invokeOriginalDraw();
            }
            if (!owner
                && ownerType === 'Bitmap'
                && (isNormalCharacterDrawActive(bitmap) || (debugCallSite && /\bprocessNormalCharacter\b/.test(debugCallSite)))) {
                const spriteTextStatus = tryRecordSpriteTextDraw();
                if (spriteTextStatus === 'claimed') {
                    perf.count('bitmap.draw.bypass.spriteText.claimed');
                    perf.top('bitmap.owner', 'SpriteText');
                    return invokeOriginalDraw();
                }
                if (spriteTextStatus !== 'ignored') {
                    perf.count('bitmap.draw.bypass.spriteText.pending');
                    perf.top('bitmap.owner', 'SpriteText');
                    return invokeOriginalDraw();
                }
                const visiblePreview = preview(stripRpgmEscapes(textStr));
                diagHot(
                    `bitmap/bypass-normal-char|${ownerType}|${bitmap.width || 0}x${bitmap.height || 0}|${visiblePreview}|${debugCallSite}`,
                    () => `[bitmap/bypass-normal-char] ${describeBitmap(bitmap, owner)} text="${visiblePreview}"${debugCallSite ? ` site=${debugCallSite}` : ''}`
                );
                perf.count('bitmap.draw.bypass.normalCharacter');
                perf.top('bitmap.owner', ownerType || 'Bitmap');
                return invokeOriginalDraw();
            }
            if (hasDedicatedOwnerHook(owner) || bitmap._trHasDedicatedTextHook) {
                const visiblePreview = preview(stripRpgmEscapes(textStr));
                diagHot(
                    `bitmap/bypass-owner|${ownerType}|${bitmap.width || 0}x${bitmap.height || 0}|${visiblePreview}`,
                    () => `[bitmap/bypass-owner] ${describeBitmap(bitmap, owner)} text="${visiblePreview}"`
                );
                perf.count('bitmap.draw.bypass.dedicatedOwner');
                perf.top('bitmap.owner', ownerType || 'Bitmap');
                return invokeOriginalDraw();
            }

            const spriteTextStatus = tryRecordSpriteTextDraw();
            if (spriteTextStatus === 'claimed') {
                perf.count('bitmap.draw.bypass.spriteText.claimed');
                perf.top('bitmap.owner', 'SpriteText');
                return invokeOriginalDraw();
            }
            if (spriteTextStatus !== 'ignored') {
                perf.count('bitmap.draw.spriteText.pending');
                perf.top('bitmap.owner', 'SpriteText');
            }

            if (!isBitmapFallbackCaptureEnabled()) {
                perf.count('bitmap.draw.bypass.fallbackOff');
                return invokeOriginalDraw();
            }

            const widthEstimate = estimateWidth(bitmap, textStr, maxWidth);
            const drawState = captureBitmapDrawState(bitmap);
            const fragment = {
                bitmap,
                methodName,
                rawText: textStr,
                visibleText: stripRpgmEscapes(textStr || ''),
                x: safeX,
                y: safeY,
                maxWidth: Number.isFinite(numericMaxWidth) ? numericMaxWidth : widthEstimate,
                lineHeight: safeLineHeight,
                align: safeAlign,
                width: Math.max(0, widthEstimate),
                ownerType,
                drawState,
                fontSignature: computeFontSignature(drawState, bitmap),
                timestamp: Date.now(),
                debugCallSite,
            };

            if (shouldTraceBitmapDiagnostics()) {
                diag(`[bitmap/fragment:${methodName}] ${describeBitmap(bitmap, owner)} text="${preview(fragment.visibleText)}" @ (${safeX},${safeY}) width=${Math.round(fragment.width)} max=${Math.round(Number.isFinite(fragment.maxWidth) ? fragment.maxWidth : fragment.width)} line=${Math.round(fragment.lineHeight)}${debugCallSite ? ` site=${debugCallSite}` : ''}`);
            }

            perf.count('bitmap.fragment.candidate');
            perf.top('bitmap.owner', ownerType || 'Bitmap');
            const result = invokeOriginalDraw();

            try {
                const stateRef = ensureBitmapState(bitmap);
                if (!stateRef) return result;
                stateRef.fragments.push(fragment);
                perf.count('bitmap.fragment.queued');
                if (stateRef.fragments.length > 200) {
                    perf.count('bitmap.fragment.overflowFlush');
                    flushAggregatedLines(bitmap, 'overflow');
                } else {
                    scheduleFlush(bitmap);
                }
            } catch (fragmentError) {
                logger.warn('[bitmap/fragment-error]', fragmentError);
            }

            return result;
        };

        // Installs one draw wrapper while preserving the original method. The
        // token check makes repeated hook installation safe.
        const installBitmapDrawWrapper = (methodName) => {
            try {
                const current = Bitmap.prototype[methodName];
                if (typeof current !== 'function') {
                    diag(`[bitmap/hook] Bitmap.${methodName} not available (yet).`);
                    return false;
                }
                if (current && current.__trBitmapWrapper === DRAW_WRAPPER_TOKEN) {
                    return true;
                }
                const originalFn = current && current.__trOriginal ? current.__trOriginal : current;
                const wrapped = function(...args) {
                    return processBitmapDrawInvocation(methodName, originalFn, this, args);
                };
                wrapped.__trBitmapWrapper = DRAW_WRAPPER_TOKEN;
                wrapped.__trOriginal = originalFn;
                try { wrapped.name = `trWrapped_${methodName}`; } catch (_) {}
                Bitmap.prototype[methodName] = wrapped;
                perf.count('bitmap.draw.wrapperInstalled');
                perf.top('bitmap.draw.wrapperMethod', methodName);
                diag(`[bitmap/hook] Wrapped Bitmap.${methodName}`);
                return true;
            } catch (wrapError) {
                logger.error(`[bitmap/hook-error] Failed to wrap ${methodName}`, wrapError);
                return false;
            }
        };

        // Some RPG Maker plugins define drawText variants after this plugin has
        // initialized. Retry briefly so late methods still get wrapped.
        const hookRetryTimers = new Map();
        const scheduleBitmapHookRetry = (methodName) => {
            if (hookRetryTimers.has(methodName)) return;
            let attempts = 0;
            const maxAttempts = 20;
            const timer = setInterval(() => {
                attempts++;
                if (installBitmapDrawWrapper(methodName) || attempts >= maxAttempts) {
                    clearInterval(timer);
                    hookRetryTimers.delete(methodName);
                    if (attempts >= maxAttempts) {
                        diag(`[bitmap/hook] Gave up retrying Bitmap.${methodName}`);
                    }
                }
            }, 500);
            hookRetryTimers.set(methodName, timer);
        };

        const markerRetryTimers = new Map();
        const scheduleMarkerRetry = (key, installer) => {
            if (markerRetryTimers.has(key)) return;
            let attempts = 0;
            const maxAttempts = 20;
            const timer = setInterval(() => {
                attempts++;
                if (installer() || attempts >= maxAttempts) {
                    clearInterval(timer);
                    markerRetryTimers.delete(key);
                }
            }, 500);
            markerRetryTimers.set(key, timer);
        };

        if (!installSmallTextMarker(Bitmap.prototype, 'drawSmallText')) {
            scheduleMarkerRetry('Bitmap.prototype.drawSmallText', () => installSmallTextMarker(Bitmap.prototype, 'drawSmallText'));
        }
        if (!installSmallTextMarker(Bitmap, 'drawSmallText')) {
            scheduleMarkerRetry('Bitmap.drawSmallText', () => installSmallTextMarker(Bitmap, 'drawSmallText'));
        }
        if (!installNormalCharacterMarker()) {
            scheduleMarkerRetry('Window_Base.processNormalCharacter', installNormalCharacterMarker);
        }
        installBitmapFrameFlushHooks();

        // drawText is the required baseline. drawTextS/drawTextM are optional
        // variants seen in plugins and are retried if unavailable at install.
        const drawTextInstalled = installBitmapDrawWrapper('drawText');

        const extraDrawMethods = ['drawTextS', 'drawTextM'];
        extraDrawMethods.forEach((name) => {
            if (!installBitmapDrawWrapper(name)) {
                scheduleBitmapHookRetry(name);
            }
        });

        diag('[bitmap/init] Bitmap draw hooks installed.');
        return drawTextInstalled
            ? {
                status: 'installed',
                reason: 'Bitmap.drawText hooks installed.',
            }
            : {
                status: 'skipped',
                reason: 'Bitmap.drawText is unavailable.',
            };
    }

    defineRuntimeModule('hooks.bitmap.drawWrapper', {
        install: installBitmapDrawWrappers,
    });
})();
