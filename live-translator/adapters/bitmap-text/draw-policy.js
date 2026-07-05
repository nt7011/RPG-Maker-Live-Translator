// Bitmap text adapter support: draw policy.
// The install controller owns hook wiring; this controller owns bitmap draw
// classification decisions used by that hook.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.drawPolicy',
        requires: {
            sourceObservationContract: 'runtime.bitmap.sourceObservation',
        },
        factory({ sourceObservationContract }) {

    function createController(scope = {}) {
        const { isSmallTextScratchBitmap, isSmallTextDrawActive, isNormalCharacterDrawActive } = scope.controllerFacades.frameMarkers;
        const {
            readBitmapOwner,
            hasDedicatedOwnerHook,
            describeBitmapContentsOwnership,
            describeOwnerType,
            normalizeCanvasTextAlign,
            sanitizeVisibleText,
            stringify,
            finiteNumber,
            positiveNumber,
        } = scope.controllerFacades.textUtils;

        function describeBitmapDrawSourceObservation(bitmap) {
            if (!bitmap) return sourceObservationContract.createSourceObservation('ignored', 'missingBitmap');
            const sourcePolicy = scope.bitmapServices.getSourceObservationPolicy(bitmap);
            if (sourcePolicy && sourcePolicy.suppressSourceObservation) {
                return sourceObservationContract.createSourceObservation(
                    'suppressed',
                    sourcePolicy.intelReason || sourcePolicy.reason || 'source-observation-suppressed'
                );
            }
            const contentsReason = describeBitmapContentsBypassReason(bitmap);
            if (contentsReason) return sourceObservationContract.createSourceObservation('ignored', contentsReason);
            if (isSmallTextScratchBitmap(bitmap)) return sourceObservationContract.createSourceObservation('ignored', 'smallTextScratchBitmap');
            if (isSmallTextDrawActive(bitmap)) return sourceObservationContract.createSourceObservation('ignored', 'smallTextDrawActive');
            if (shouldBypassNormalCharacterDraw(bitmap)) return sourceObservationContract.createSourceObservation('ignored', 'normalCharacter');
            return sourceObservationContract.createSourceObservation('observed', '');
        }

        function shouldBypassDedicatedOwnerDraw(bitmap, owner) {
            return hasDedicatedOwnerHook(owner) || isDedicatedTextContents(bitmap);
        }

        function describeBitmapDrawOwner(bitmap) {
            const owner = readBitmapOwner(bitmap);
            return {
                owner,
                ownerType: describeOwnerType(owner, bitmap),
            };
        }

        function createBitmapDrawRoutingDecision(bitmap, input = {}) {
            const source = input && typeof input === 'object' ? input : {};
            let ownerInfo = source.requireOwner === true ? describeBitmapDrawOwner(bitmap) : null;
            const sourceObservation = source.earlyBypassReason
                ? sourceObservationContract.createSourceObservation('ignored', source.earlyBypassReason)
                : describeBitmapDrawSourceObservation(bitmap);
            if (sourceObservation.status !== 'observed') {
                return createBitmapDrawRoutingResult(ownerInfo, sourceObservation.reason, sourceObservation);
            }

            ownerInfo = ownerInfo || describeBitmapDrawOwner(bitmap);
            const owner = ownerInfo.owner || null;
            if (shouldBypassDedicatedOwnerDraw(bitmap, owner)) {
                return createBitmapDrawRoutingResult(
                    ownerInfo,
                    'dedicatedOwnerHook',
                    sourceObservationContract.createSourceObservation('ignored', 'dedicatedOwnerHook')
                );
            }
            return createBitmapDrawRoutingResult(ownerInfo, '', sourceObservation);
        }

        function createBitmapDrawRoutingResult(ownerInfo, bypassReason, sourceObservation) {
            const source = ownerInfo && typeof ownerInfo === 'object' ? ownerInfo : {};
            const observation = sourceObservationContract.normalizeSourceObservation(
                sourceObservation,
                bypassReason ? 'ignored' : 'observed',
                bypassReason
            );
            return {
                owner: source.owner || null,
                ownerType: source.ownerType || '',
                bypassReason: observation.status === 'observed' ? '' : observation.reason,
                sourceObservation: observation,
                sourceObservationStatus: observation.status,
                sourceObservationReason: observation.reason,
            };
        }

        function isWindowOwnedBitmapSurface(bitmap, owner) {
            const ownership = describeBitmapContentsOwnership(bitmap);
            if (ownership && ownership.windowOwned === true) return true;
            return !!(owner && owner.contents === bitmap);
        }

        function shouldDeferWindowOwnedGlyphSurfaceDraw(methodName, visibleText, normalCharacterDrawActive) {
            if (normalCharacterDrawActive) return false;
            const method = stringify(methodName || 'drawText');
            if (method !== 'drawText' && method !== 'drawTextS' && method !== 'drawTextM') return false;
            const glyphs = Array.from(stringify(visibleText).trim()).filter((char) => !/\s/u.test(char));
            // Custom window renderers often emit one Bitmap.drawText per glyph
            // without using Window_Base.processNormalCharacter. Let the draw
            // run assembler decide whether adjacent glyphs form one source.
            return glyphs.length === 1;
        }

        function lookupInlineBitmapReplacement(bitmap, input = {}) {
            const services = scope.bitmapServices;
            if (!bitmap || !services || typeof services.lookupInlineReplacement !== 'function') return null;
            const generation = getBitmapLedgerGeneration(bitmap);
            try {
                return normalizeSurfaceDrawDecision(services.lookupInlineReplacement({
                    surface: bitmap,
                    slotKey: createBitmapDrawSlotKey(input),
                    generation,
                    methodName: input.methodName,
                    x: input.x,
                    y: input.y,
                    maxWidth: input.maxWidth,
                    lineHeight: input.lineHeight,
                    align: input.align,
                }), input);
            } catch (_) {
                return null;
            }
        }

        function getBitmapLedgerGeneration(bitmap) {
            const services = scope.bitmapServices;
            if (!bitmap || !services || typeof services.getSurfaceLedgerIdentity !== 'function') return 0;
            try {
                const identity = services.getSurfaceLedgerIdentity(bitmap);
                return finiteNumber(identity && identity.revision, 0);
            } catch (_) {
                return 0;
            }
        }

        function resolveInlineBitmapReplacement(bitmap, input = {}) {
            const source = input && typeof input === 'object' ? input : {};
            const context = source.drawContext && typeof source.drawContext === 'object'
                ? source.drawContext
                : source;
            const recordability = source.recordability && typeof source.recordability === 'object'
                ? source.recordability
                : source;
            const text = context.text !== undefined ? context.text : source.text;
            const visibleText = recordability.visibleText !== undefined
                ? stringify(recordability.visibleText)
                : sanitizeVisibleText(text);
            const methodName = context.methodName || source.methodName;
            const normalCharacterDrawActive = recordability.normalCharacterDrawActive !== undefined
                ? recordability.normalCharacterDrawActive === true
                : isNormalCharacterDrawActive(bitmap);
            if (!bitmap || !visibleText || normalCharacterDrawActive) return null;
            const sourcePolicy = scope.bitmapServices.getSourceObservationPolicy(bitmap);
            if (sourcePolicy && sourcePolicy.suppressInlineReplacement) return null;
            if (!isWindowOwnedBitmapSurface(bitmap, source.owner || null)) return null;
            if (shouldDeferWindowOwnedGlyphSurfaceDraw(methodName, visibleText, false)) return null;
            return lookupInlineBitmapReplacement(bitmap, {
                methodName,
                x: context.x,
                y: context.y,
                maxWidth: context.maxWidth,
                lineHeight: context.lineHeight,
                align: context.align,
            });
        }

        function describeBitmapContentsBypassReason(bitmap) {
            const ownership = describeBitmapContentsOwnership(bitmap);
            if (!ownership) return '';
            if (ownership.bypassBitmapDrawReason) return ownership.bypassBitmapDrawReason;
            return ownership.dedicatedTextHook ? 'dedicatedOwnerHook' : '';
        }

        function isDedicatedTextContents(bitmap) {
            const ownership = describeBitmapContentsOwnership(bitmap);
            return !!(ownership && ownership.dedicatedTextHook);
        }

        function shouldBypassNormalCharacterDraw(bitmap) {
            if (!bitmap || !isNormalCharacterDrawActive(bitmap)) return false;
            const owner = readBitmapOwner(bitmap);
            const ownership = describeBitmapContentsOwnership(bitmap);
            return !owner && !ownership;
        }

        function createBitmapDrawSlotKey(drawRecord) {
            if (!drawRecord) return '';
            return [
                drawRecord.methodName || 'drawText',
                drawRecord.x,
                drawRecord.y,
                drawRecord.maxWidth,
                drawRecord.lineHeight,
                drawRecord.align || 'left',
            ].map((value) => stringify(value)).join(':');
        }

        function normalizeSurfaceDrawDecision(decision, fallback = {}) {
            if (!decision || typeof decision !== 'object') return null;
            const action = normalizeSurfaceDrawAction(decision.action);
            if (!action || action === 'draw-original') return action ? { action } : null;
            const text = decision.text !== undefined && decision.text !== null
                ? stringify(decision.text)
                : '';
            if (action === 'replace-native-draw' && !text) return null;
            const normalized = {
                action,
                text,
                x: Number.isFinite(Number(decision.x)) ? Number(decision.x) : finiteNumber(fallback.x, 0),
                y: Number.isFinite(Number(decision.y)) ? Number(decision.y) : finiteNumber(fallback.y, 0),
                maxWidth: Number.isFinite(Number(decision.maxWidth)) ? Number(decision.maxWidth) : finiteNumber(fallback.maxWidth, 0),
                lineHeight: positiveNumber(decision.lineHeight, fallback.lineHeight, 24),
                align: normalizeCanvasTextAlign(decision.align || fallback.align),
                reason: decision.reason ? stringify(decision.reason) : '',
            };
            normalized.nativeArgs = action === 'replace-native-draw'
                ? [
                    normalized.text,
                    normalized.x,
                    normalized.y,
                    normalized.maxWidth,
                    normalized.lineHeight,
                    normalized.align,
                ]
                : [];
            return normalized;
        }

        function normalizeSurfaceDrawAction(action) {
            const value = stringify(action).replace(/_/g, '-').toLowerCase();
            if (value === 'replace-native-draw' || value === 'replace-native' || value === 'replace') {
                return 'replace-native-draw';
            }
            if (value === 'suppress-native-draw' || value === 'skip-native' || value === 'suppress') {
                return 'suppress-native-draw';
            }
            if (value === 'draw-original' || value === 'native' || value === 'original') {
                return 'draw-original';
            }
            return '';
        }

        return {
            createBitmapDrawRoutingDecision,
            resolveInlineBitmapReplacement,
        };
    }

            return { create: createController };
        },
    });
})();
