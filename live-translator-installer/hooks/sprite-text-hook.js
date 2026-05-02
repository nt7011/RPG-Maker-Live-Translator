// Sprite text hook.
//
// This hook owns text that is rendered through Sprite-owned Bitmaps. It records
// bitmap drawing only as evidence for a Sprite surface, then translates and
// renders a sibling overlay without mutating game data or source bitmap content.
// It does not use timers: all grouping and invalidation happen at deterministic
// scene/render frame boundaries.
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
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/sprite-text-hook.js.');
    }

    function installSpriteTextHook(context = {}) {
        const {
            logger = console,
            diag = () => {},
            preview = (text) => String(text ?? ''),
            stripRpgmEscapes = (text) => String(text ?? ''),
            prepareTextForTranslation = (text) => ({ textForTranslation: String(text ?? '') }),
            restoreControlCodes = (translated) => translated,
            telemetry = null,
            textTracker = null,
            translationCache = null,
            settings = {},
            captureBitmapDrawState = () => null,
            applyBitmapDrawState = () => {},
            resolveTextScalePercent = null,
            scaleBitmapDrawState = null,
            contentsOwners = null,
            REDRAW_SIGNATURE = '',
            perf = null,
        } = context;

        const safePerf = perf || {
            count() {},
            top() {},
            time() {},
            isEnabled() { return false; },
            now() { return Date.now(); },
        };

        const TOKEN = 'liveTranslator.spriteTextHook';
        const MUTATION_TOKEN = 'liveTranslator.spriteTextBitmapMutation';
        const CHILD_TOKEN = 'liveTranslator.spriteTextChildObserver';
        const FRAME_TOKEN = 'liveTranslator.spriteTextFrameHook';
        const MAX_TEXT_OPS = 256;
        const MAX_PAINT_OPS = 256;
        const GAP_MIN = 6;
        const GAP_RATIO = 0.65;
        const GLYPH_BACKTRACK_RATIO = 0.35;
        const GLYPH_SPATIAL_VERTICAL_RATIO = 0.75;
        const GLYPH_VERTICAL_RATIO = 1.75;
        const textScaleOthers = typeof resolveTextScalePercent === 'function'
            ? resolveTextScalePercent(settings, 'textScaleOthers', 100)
            : 100;
        const shouldScaleTranslatedText = () => Number.isInteger(textScaleOthers)
            && textScaleOthers > 0
            && textScaleOthers < 100;
        const getScaledDrawState = (drawState) => {
            if (!shouldScaleTranslatedText() || !drawState) return drawState;
            if (typeof scaleBitmapDrawState === 'function') {
                return scaleBitmapDrawState(drawState, textScaleOthers);
            }
            const fontSize = Number(drawState.fontSize);
            if (!Number.isFinite(fontSize) || fontSize <= 0) return drawState;
            return Object.assign({}, drawState, {
                fontSize: Math.max(1, Math.round(fontSize * (textScaleOthers / 100))),
            });
        };
        const hasTextTracker = () => textTracker
            && typeof textTracker.upsert === 'function'
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

        if (globalScope.LiveTranslatorSpriteTextHook
            && globalScope.LiveTranslatorSpriteTextHook.__token === TOKEN) {
            return {
                status: 'installed',
                reason: 'Sprite text hook was already installed.',
            };
        }

        if (typeof Sprite === 'undefined' || !Sprite || !Sprite.prototype) {
            return {
                status: 'skipped',
                reason: 'Sprite is unavailable.',
            };
        }
        if (typeof Bitmap === 'undefined' || !Bitmap || !Bitmap.prototype) {
            return {
                status: 'skipped',
                reason: 'Bitmap is unavailable.',
            };
        }
        if (!translationCache || typeof translationCache.requestTranslation !== 'function') {
            return {
                status: 'skipped',
                reason: 'Translation cache is unavailable.',
            };
        }

        const bitmapStates = new WeakMap();
        const bitmapOwners = new WeakMap();
        const spriteStates = new WeakMap();
        const parentRunStates = new WeakMap();
        const dirtySprites = new Set();
        const dirtyParents = new Set();
        const activeSprites = new Set();
        const activeParents = new Set();
        const trackedSpriteStates = new Set();
        const trackedParentRuns = new Set();
        let nextBitmapId = 0;
        let nextSpriteId = 0;
        let nextEntryId = 0;
        let nextRunId = 0;
        let flushing = false;

        const normalizeCanvasTextAlign = (align) => {
            const value = String(align || '').toLowerCase();
            return ['left', 'right', 'center', 'start', 'end'].indexOf(value) >= 0 ? value : 'left';
        };

        const rectFromDimensions = (x, y, width, height) => {
            const xNum = Number(x);
            const yNum = Number(y);
            const wNum = Number(width);
            const hNum = Number(height);
            const x1 = Number.isFinite(xNum) ? xNum : 0;
            const y1 = Number.isFinite(yNum) ? yNum : 0;
            const x2 = x1 + (Number.isFinite(wNum) ? wNum : 0);
            const y2 = y1 + (Number.isFinite(hNum) ? hNum : 0);
            return {
                x1: Math.min(x1, x2),
                y1: Math.min(y1, y2),
                x2: Math.max(x1, x2),
                y2: Math.max(y1, y2),
            };
        };

        const isValidRect = (rect) => rect
            && Number.isFinite(rect.x1)
            && Number.isFinite(rect.y1)
            && Number.isFinite(rect.x2)
            && Number.isFinite(rect.y2)
            && rect.x2 >= rect.x1
            && rect.y2 >= rect.y1;

        const rectHasArea = (rect) => isValidRect(rect) && rect.x2 > rect.x1 && rect.y2 > rect.y1;

        const rectCenterY = (rect) => isValidRect(rect) ? (rect.y1 + rect.y2) / 2 : 0;

        const verticalOverlapAmount = (a, b) => {
            if (!isValidRect(a) || !isValidRect(b)) return 0;
            return Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
        };

        const rectanglesOverlap = (a, b) => {
            if (!isValidRect(a) || !isValidRect(b)) return true;
            return !(a.x2 <= b.x1 || a.x1 >= b.x2 || a.y2 <= b.y1 || a.y1 >= b.y2);
        };

        const formatRect = (rect) => {
            if (!isValidRect(rect)) return 'n/a';
            return `(${Math.round(rect.x1)},${Math.round(rect.y1)}) ${Math.round(rect.x2 - rect.x1)}x${Math.round(rect.y2 - rect.y1)}`;
        };

        const sanitizeVisibleText = (text) => stripRpgmEscapes(String(text ?? '')).replace(/\u2060/g, '').trim();

        const textUnitCount = (text) => {
            try {
                return Array.from(String(text || '')).length;
            } catch (_) {
                return String(text || '').length;
            }
        };

        const skipLikeCounter = (text) => {
            const trimmed = String(text || '').trim();
            if (!trimmed) return true;
            const nonSpace = trimmed.replace(/\s+/g, '');
            const cjkMatch = trimmed.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g);
            const cjkCount = cjkMatch ? cjkMatch.length : 0;
            const hasDigit = /\d/.test(trimmed);
            const onlyNumPunct = /^[0-9()\[\]\-+/*.,:;!?%]+$/u.test(nonSpace);
            const comboMatch = /\d+\s*[\u3040-\u30FF\u4E00-\u9FFF]\s*\(\d+\)/u.test(trimmed);
            return (hasDigit && cjkCount <= 1 && nonSpace.length <= 10) || onlyNumPunct || comboMatch;
        };

        const describeTranslationSkip = (text, fallbackReason = 'translationFilter') => {
            const normalized = String(text || '').trim();
            if (!normalized) {
                return {
                    skip: true,
                    reason: 'emptyNormalized',
                    details: {
                        reason: 'emptyNormalized',
                        length: 0,
                    },
                };
            }
            if (skipLikeCounter(normalized)) {
                return {
                    skip: true,
                    reason: 'counterLike',
                    details: {
                        reason: 'counterLike',
                        length: normalized.length,
                    },
                };
            }
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

        const computeFontSignature = (drawState, bitmap) => {
            const state = drawState || {};
            return [
                state.fontFace !== undefined ? state.fontFace : (bitmap && bitmap.fontFace),
                state.fontSize !== undefined ? state.fontSize : (bitmap && bitmap.fontSize),
                state.fontBold !== undefined ? state.fontBold : (bitmap && bitmap.fontBold),
                state.fontItalic !== undefined ? state.fontItalic : (bitmap && bitmap.fontItalic),
                state.textColor !== undefined ? state.textColor : (bitmap && bitmap.textColor),
                state.outlineColor !== undefined ? state.outlineColor : (bitmap && bitmap.outlineColor),
                state.outlineWidth !== undefined ? state.outlineWidth : (bitmap && bitmap.outlineWidth),
            ].join('|');
        };

        const measureTextWidth = (bitmap, text, maxWidth) => {
            const clean = String(text ?? '');
            let measured = 0;
            try {
                if (bitmap && typeof bitmap.measureTextWidth === 'function') {
                    const value = bitmap.measureTextWidth(clean);
                    if (Number.isFinite(value)) measured = Math.ceil(value);
                }
            } catch (_) {}
            if (!measured) {
                const fontSize = bitmap && Number.isFinite(Number(bitmap.fontSize)) ? Number(bitmap.fontSize) : 24;
                measured = Math.ceil(clean.length * Math.max(6, fontSize * 0.6));
            }
            if (Number.isFinite(Number(maxWidth)) && Number(maxWidth) > 0 && Number(maxWidth) !== Infinity) {
                return Math.max(1, Math.max(measured, Math.ceil(Number(maxWidth))));
            }
            return Math.max(1, measured);
        };

        const isWindowOwnedBitmap = (bitmap) => {
            if (!bitmap) return false;
            if (bitmap._trMessageContents) return true;
            try {
                return !!(contentsOwners && typeof contentsOwners.get === 'function' && contentsOwners.get(bitmap));
            } catch (_) {
                return false;
            }
        };

        const isOverlayBitmap = (bitmap) => !!(bitmap && bitmap._trSpriteTextOverlayBitmap);

        const getBitmapState = (bitmap) => {
            if (!bitmap) return null;
            try {
                return bitmapStates.get(bitmap) || null;
            } catch (_) {
                return null;
            }
        };

        const ensureBitmapState = (bitmap) => {
            if (!bitmap) return null;
            let state = bitmapStates.get(bitmap);
            if (!state) {
                state = {
                    id: `stb-${(++nextBitmapId).toString(36)}`,
                    revision: 0,
                    order: 0,
                    textOps: [],
                    paintOps: [],
                    unsupportedPaint: false,
                    destroyed: false,
                };
                bitmapStates.set(bitmap, state);
            }
            if (!Array.isArray(state.textOps)) state.textOps = [];
            if (!Array.isArray(state.paintOps)) state.paintOps = [];
            if (!Number.isFinite(state.revision)) state.revision = 0;
            if (!Number.isFinite(state.order)) state.order = 0;
            return state;
        };

        const ensureSpriteState = (sprite) => {
            if (!sprite) return null;
            let state = spriteStates.get(sprite);
            if (!state) {
                state = {
                    id: `sts-${(++nextSpriteId).toString(36)}`,
                    sprite,
                    bitmap: null,
                    entries: new Map(),
                    singleGlyphCandidate: null,
                    overlaySprite: null,
                    overlayBitmap: null,
                    hidden: false,
                    hiddenToken: '',
                    lastRevision: -1,
                    mode: 'sprite-bitmap',
                };
                spriteStates.set(sprite, state);
            }
            if (!state.entries || typeof state.entries.set !== 'function') {
                state.entries = new Map();
            }
            return state;
        };

        const getBitmapOwners = (bitmap) => {
            if (!bitmapOwners || !bitmap) return null;
            try {
                return bitmapOwners.get(bitmap) || null;
            } catch (_) {
                return null;
            }
        };

        const isBitmapOwned = (bitmap) => {
            const owners = getBitmapOwners(bitmap);
            if (!owners || !owners.size) return false;
            for (const sprite of owners) {
                if (sprite && !sprite._destroyed) return true;
            }
            return false;
        };

        const markParentDirty = (parent, reason = 'mutation') => {
            if (!parent || parent._trSpriteTextObserverBypass) return;
            dirtyParents.add(parent);
            safePerf.count('spriteText2.parent.dirty');
            safePerf.top('spriteText2.parent.reason', reason || 'unknown');
        };

        const markSpriteDirty = (sprite, reason = 'mutation') => {
            if (!sprite || sprite._trSpriteTextObserverBypass) return;
            dirtySprites.add(sprite);
            try {
                if (sprite.parent) markParentDirty(sprite.parent, reason);
            } catch (_) {}
            safePerf.count('spriteText2.sprite.dirty');
            safePerf.top('spriteText2.sprite.reason', reason || 'unknown');
        };

        const markBitmapOwnersDirty = (bitmap, reason = 'bitmap') => {
            const owners = getBitmapOwners(bitmap);
            if (!owners || !owners.size) return;
            for (const sprite of Array.from(owners)) {
                if (!sprite || sprite._destroyed) {
                    owners.delete(sprite);
                    continue;
                }
                markSpriteDirty(sprite, reason);
            }
        };

        const attachBitmapOwner = (sprite, bitmap) => {
            if (!sprite || !bitmap || isOverlayBitmap(bitmap) || isWindowOwnedBitmap(bitmap)) return;
            let owners = getBitmapOwners(bitmap);
            if (!owners) {
                owners = new Set();
                bitmapOwners.set(bitmap, owners);
            }
            owners.add(sprite);
            try { bitmap._trSpriteTextOwned = true; } catch (_) {}
            const state = ensureSpriteState(sprite);
            if (state) state.bitmap = bitmap;
            markSpriteDirty(sprite, 'bitmap-attach');
        };

        const detachBitmapOwner = (sprite, bitmap) => {
            if (!sprite || !bitmap) return;
            const owners = getBitmapOwners(bitmap);
            if (owners) {
                owners.delete(sprite);
                if (!owners.size) {
                    try { bitmapOwners.delete(bitmap); } catch (_) {}
                    try { bitmap._trSpriteTextOwned = false; } catch (_) {}
                }
            }
            markSpriteDirty(sprite, 'bitmap-detach');
        };

        const createTextOpFromPayload = (bitmap, payload, state) => {
            const text = String(payload && payload.text !== undefined ? payload.text : '');
            const rawX = payload ? payload.x : 0;
            const rawY = payload ? payload.y : 0;
            const rawMaxWidth = payload ? payload.maxWidth : 0;
            const rawLineHeight = payload ? payload.lineHeight : 0;
            const safeX = Number.isFinite(Number(rawX)) ? Number(rawX) : 0;
            const safeY = Number.isFinite(Number(rawY)) ? Number(rawY) : 0;
            const lineHeight = Number.isFinite(Number(rawLineHeight)) && Number(rawLineHeight) > 0
                ? Number(rawLineHeight)
                : (Number.isFinite(Number(bitmap.fontSize)) ? Number(bitmap.fontSize) : 24);
            const width = measureTextWidth(bitmap, text, rawMaxWidth);
            const maxWidth = Number.isFinite(Number(rawMaxWidth)) && Number(rawMaxWidth) > 0
                ? Number(rawMaxWidth)
                : width;
            const drawState = payload && payload.drawState ? payload.drawState : captureBitmapDrawState(bitmap);
            return {
                id: `op-${state.id}-${(++state.order).toString(36)}`,
                type: 'text',
                methodName: payload && payload.methodName ? String(payload.methodName) : 'drawText',
                rawText: text,
                visibleText: stripRpgmEscapes(text || ''),
                trimmedText: sanitizeVisibleText(text),
                x: safeX,
                y: safeY,
                maxWidth: Math.max(1, maxWidth),
                lineHeight: Math.max(1, lineHeight),
                align: normalizeCanvasTextAlign(payload && payload.align),
                width,
                bounds: rectFromDimensions(safeX, safeY, Math.max(1, width), Math.max(1, lineHeight)),
                drawState,
                fontSignature: computeFontSignature(drawState, bitmap),
                drawOrder: state.order,
                revision: state.revision,
                debugCallSite: payload && payload.debugCallSite ? String(payload.debugCallSite) : '',
            };
        };

        const getBitmapDrawRecordStatus = (bitmap, payload) => {
            if (!bitmap || isOverlayBitmap(bitmap)) return 'ignored';
            if (bitmap._trBitmapReplayDepth || bitmap._trBitmapSkipDepth || bitmap._trSpriteTextReplayDepth) return 'ignored';
            if (isWindowOwnedBitmap(bitmap)) return 'ignored';
            if (REDRAW_SIGNATURE && payload && payload.text && String(payload.text).startsWith(REDRAW_SIGNATURE)) return 'ignored';
            if (payload && payload.owner) return 'ignored';
            return isBitmapOwned(bitmap) ? 'claimed' : 'pending';
        };

        const recordBitmapDrawText = (payload = {}) => {
            const bitmap = payload.bitmap || null;
            const status = getBitmapDrawRecordStatus(bitmap, payload);
            if (status === 'ignored') return { status };
            const text = String(payload.text ?? '');
            if (!sanitizeVisibleText(text)) return { status: 'ignored' };
            const state = ensureBitmapState(bitmap);
            if (!state) return { status: 'ignored' };
            state.destroyed = false;
            state.revision += 1;
            const op = createTextOpFromPayload(bitmap, payload, state);
            op.revision = state.revision;
            state.textOps.push(op);
            if (state.textOps.length > MAX_TEXT_OPS) {
                state.textOps.splice(0, state.textOps.length - MAX_TEXT_OPS);
            }
            markBitmapOwnersDirty(bitmap, 'drawText');
            safePerf.count('spriteText2.bitmap.textOp');
            safePerf.top('spriteText2.bitmap.recordStatus', status);
            return { status };
        };

        const recordPaintOp = (bitmap, methodName, args, rect, options = {}) => {
            const state = getBitmapState(bitmap);
            if (!state) {
                markBitmapOwnersDirty(bitmap, methodName || 'mutation');
                return;
            }
            state.revision += 1;
            state.order += 1;
            const targetRect = rect && rectHasArea(rect) ? rect : rectFromDimensions(0, 0, bitmap.width || 0, bitmap.height || 0);
            if (options.reset === true) {
                state.textOps.length = 0;
                state.paintOps.length = 0;
                state.unsupportedPaint = false;
            } else if (options.removeText !== false && rectHasArea(targetRect)) {
                state.textOps = state.textOps.filter((op) => !op || !op.bounds || !rectanglesOverlap(targetRect, op.bounds));
            }
            if (options.unsupported === true) {
                state.unsupportedPaint = true;
            } else if (methodName) {
                state.paintOps.push({
                    methodName,
                    args: Array.isArray(args) ? args.slice() : [],
                    rect: targetRect,
                    drawOrder: state.order,
                });
                if (state.paintOps.length > MAX_PAINT_OPS) {
                    state.paintOps.splice(0, state.paintOps.length - MAX_PAINT_OPS);
                }
            }
            markBitmapOwnersDirty(bitmap, methodName || 'paint');
        };

        const deriveMutationRect = (bitmap, methodName, args) => {
            switch (methodName) {
            case 'clear':
            case 'fillAll':
            case 'resize':
            case 'destroy':
            case 'adjustTone':
            case 'rotateHue':
            case 'blur':
                return rectFromDimensions(0, 0, bitmap && bitmap.width, bitmap && bitmap.height);
            case 'clearRect':
            case 'fillRect':
            case 'gradientFillRect':
            case 'strokeRect':
                return rectFromDimensions(args[0], args[1], args[2], args[3]);
            case 'drawCircle':
                return rectFromDimensions(Number(args[0]) - Number(args[2]), Number(args[1]) - Number(args[2]), Number(args[2]) * 2, Number(args[2]) * 2);
            case 'blt':
            case 'bltImage': {
                const sw = Number(args[3]);
                const sh = Number(args[4]);
                const dx = Number(args[5]);
                const dy = Number(args[6]);
                const dw = Number.isFinite(Number(args[7])) ? Number(args[7]) : sw;
                const dh = Number.isFinite(Number(args[8])) ? Number(args[8]) : sh;
                return rectFromDimensions(dx, dy, dw, dh);
            }
            default:
                return null;
            }
        };

        const recordBitmapMutation = (bitmap, methodName, args = []) => {
            if (!bitmap || isOverlayBitmap(bitmap) || bitmap._trSpriteTextReplayDepth || bitmap._trBitmapReplayDepth) return;
            if (isWindowOwnedBitmap(bitmap)) return;
            const rect = deriveMutationRect(bitmap, methodName, args);
            if (methodName === 'destroy') {
                const owners = getBitmapOwners(bitmap);
                if (owners) {
                    Array.from(owners).forEach((sprite) => {
                        const spriteState = spriteStates.get(sprite);
                        if (spriteState) removeSpriteOverlay(spriteState, 'bitmap-destroyed');
                        markSpriteDirty(sprite, 'bitmap-destroyed');
                    });
                }
                const state = getBitmapState(bitmap);
                if (state) {
                    state.destroyed = true;
                    state.revision += 1;
                    state.textOps.length = 0;
                    state.paintOps.length = 0;
                }
                return;
            }
            if (methodName === 'clear' || methodName === 'resize') {
                recordPaintOp(bitmap, null, args, rect, { reset: true });
                return;
            }
            if (methodName === 'adjustTone' || methodName === 'rotateHue' || methodName === 'blur') {
                recordPaintOp(bitmap, methodName, args, rect, { unsupported: true, removeText: false });
                return;
            }
            const removeText = methodName !== 'strokeRect' && methodName !== 'drawCircle';
            recordPaintOp(bitmap, methodName, args, rect, { removeText });
        };

        const buildTextGroups = (textOps) => {
            const ops = (Array.isArray(textOps) ? textOps : [])
                .filter((op) => op && op.trimmedText && op.bounds && rectHasArea(op.bounds));
            if (!ops.length) return [];

            const lines = new Map();
            ops.forEach((op) => {
                const yKey = `${Math.round(op.y)}:${Math.round(op.lineHeight)}:${op.fontSignature || ''}`;
                if (!lines.has(yKey)) lines.set(yKey, []);
                lines.get(yKey).push(op);
            });

            const groups = [];
            lines.forEach((lineOps) => {
                lineOps.sort((a, b) => {
                    if (a.x !== b.x) return a.x - b.x;
                    return (a.drawOrder || 0) - (b.drawOrder || 0);
                });
                let current = [];
                let last = null;
                const pushCurrent = () => {
                    if (current.length) groups.push(current);
                    current = [];
                };
                for (const op of lineOps) {
                    if (!last) {
                        current.push(op);
                        last = op;
                        continue;
                    }
                    const gap = op.x - (last.x + last.width);
                    const gapLimit = Math.max(GAP_MIN, Math.ceil((op.lineHeight || last.lineHeight || 24) * GAP_RATIO));
                    if (gap > gapLimit || op.fontSignature !== last.fontSignature || op.align !== last.align) {
                        pushCurrent();
                    }
                    current.push(op);
                    last = op;
                }
                pushCurrent();
            });

            return groups.map((group) => {
                const bounds = group.reduce((acc, op) => ({
                    x1: Math.min(acc.x1, op.bounds.x1),
                    y1: Math.min(acc.y1, op.bounds.y1),
                    x2: Math.max(acc.x2, op.bounds.x2),
                    y2: Math.max(acc.y2, op.bounds.y2),
                }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
                if (!isValidRect(bounds)) return null;
                const rawText = group.map((op) => op.rawText).join('');
                const convertedText = stripRpgmEscapes(rawText || '');
                const trimmedText = sanitizeVisibleText(rawText);
                if (!trimmedText) return null;
                const dominant = group.reduce((best, op) => {
                    if (!best || (op.width || 0) > (best.width || 0)) return op;
                    return best;
                }, null) || group[0];
                const maxWidth = Math.max(bounds.x2 - bounds.x1, ...group.map((op) => Number(op.maxWidth) || 0), 1);
                const lineHeight = Math.max(...group.map((op) => Number(op.lineHeight) || 0), 1);
                return {
                    key: `${Math.round(bounds.x1)}:${Math.round(bounds.y1)}:${Math.round(maxWidth)}:${dominant.align}:${dominant.fontSignature}:${trimmedText}`,
                    ops: group,
                    rawText,
                    convertedText,
                    trimmedText,
                    bounds,
                    drawParams: {
                        x: group.length === 1 ? dominant.x : bounds.x1,
                        y: bounds.y1,
                        maxWidth,
                        lineHeight,
                        align: group.length === 1 ? dominant.align : 'left',
                    },
                    drawState: dominant.drawState,
                    methodName: dominant.methodName || 'drawText',
                    fontSignature: dominant.fontSignature,
                    drawOrder: Math.min(...group.map((op) => Number(op.drawOrder) || 0)),
                };
            }).filter(Boolean);
        };

        const shouldDeferSpriteEntryTracker = (group) => {
            if (!group || !Array.isArray(group.ops) || group.ops.length !== 1) return false;
            return textUnitCount(group.trimmedText) === 1;
        };

        const publishSpriteEntry = (entry) => {
            if (!entry || entry.deferTracker || entry.parentRunId) return;
            const spriteState = entry.spriteState;
            const group = entry.group;
            if (!spriteState || !group) return;
            if (telemetry && typeof telemetry.logTextDetected === 'function' && !entry._trTelemetryDetected) {
                telemetry.logTextDetected('sprite_text', entry.trimmedText, group.bounds.x1, group.bounds.y1, {
                    mode: 'sprite-bitmap',
                    ownerType: spriteState.sprite && spriteState.sprite.constructor ? spriteState.sprite.constructor.name : 'Sprite',
                });
                entry._trTelemetryDetected = true;
            }
            if (hasTextTracker() && entry._trTrackerVisible !== true) {
                textTracker.detect({
                    id: entry.recordId,
                    hook: 'sprite_text',
                    hookLabel: 'Sprite Text',
                    surfaceType: 'sprite',
                    status: entry.status || 'pending',
                    rawText: entry.rawText,
                    visibleText: entry.trimmedText,
                    original: entry.trimmedText,
                    translationSource: entry.translationSource,
                    normalizedSource: entry.normalizedSource,
                    x: Math.round(group.bounds.x1),
                    y: Math.round(group.bounds.y1),
                    bounds: group.bounds,
                    ownerType: spriteState.sprite && spriteState.sprite.constructor ? spriteState.sprite.constructor.name : 'Sprite',
                    metadata: {
                        mode: 'sprite-bitmap',
                        spriteId: spriteState.id,
                    },
                });
                entry._trTrackerVisible = true;
            }
        };

        const createOrUpdateEntry = (spriteState, group, bitmapState) => {
            const existing = spriteState.entries.get(group.key);
            if (existing && existing.rawText === group.rawText) {
                existing.group = group;
                existing.bitmapRevision = bitmapState.revision;
                existing.lastSeenAt = Date.now();
                existing.deferTracker = shouldDeferSpriteEntryTracker(group);
                if (existing.deferTracker && existing._trTrackerVisible !== true) existing._trTrackerVisible = false;
                trackedSpriteStates.add(spriteState);
                return existing;
            }
            if (existing) {
                staleEntry(existing, 'replaced');
            }
            const placeholderInfo = prepareTextForTranslation(group.rawText);
            const translationSource = placeholderInfo ? placeholderInfo.textForTranslation : group.rawText;
            const entry = {
                id: `ste-${(++nextEntryId).toString(36)}`,
                key: group.key,
                spriteState,
                group,
                rawText: group.rawText,
                trimmedText: group.trimmedText,
                placeholderInfo,
                translationSource,
                normalizedSource: String(translationSource || '').trim(),
                bitmapRevision: bitmapState.revision,
                status: 'pending',
                translatedText: '',
                createdAt: Date.now(),
                lastSeenAt: Date.now(),
                recordId: `sprite-text:${spriteState.id}:${group.key}`,
                deferTracker: shouldDeferSpriteEntryTracker(group),
                parentRunId: '',
            };
            spriteState.entries.set(group.key, entry);
            if (entry.deferTracker) entry._trTrackerVisible = false;
            publishSpriteEntry(entry);
            trackedSpriteStates.add(spriteState);
            safePerf.count('spriteText2.entry.created');
            diag(`[sprite-text/register] mode=sprite-bitmap sprite=${spriteState.id} text="${preview(entry.trimmedText)}" rect=${formatRect(group.bounds)}`);
            return entry;
        };

        const staleEntry = (entry, reason) => {
            if (!entry || entry.stale) return;
            entry.stale = true;
            entry.status = entry.status === 'completed' ? 'stale' : entry.status;
            entry.staleReason = reason || 'stale';
            if (hasTextTracker() && entry._trTrackerVisible !== false) {
                markRecordDisappeared(entry.recordId, reason || 'stale', {
                    mode: 'sprite-bitmap',
                    spriteId: entry.spriteState ? entry.spriteState.id : '',
                });
            }
        };

        const hideEntryLiveRecord = (entry, reason = 'sprite-invisible') => {
            if (!entry || entry.stale || !hasTextTracker() || entry._trTrackerVisible === false) return;
            markRecordDisappeared(entry.recordId, reason, {
                mode: 'sprite-bitmap',
                spriteId: entry.spriteState ? entry.spriteState.id : '',
            });
            entry._trTrackerVisible = false;
        };

        const updateEntryLiveRecord = (entry) => {
            if (!entry || entry.stale || !entry.group) return;
            if (!hasTextTracker()) return;
            if (entry.deferTracker || entry.parentRunId) {
                if (entry._trTrackerVisible === true) {
                    hideEntryLiveRecord(entry, entry.parentRunId ? 'sprite-run-grouped' : 'sprite-run-candidate');
                } else {
                    entry._trTrackerVisible = false;
                }
                return;
            }
            if (!isSpriteEntryScreenVisible(entry)) {
                hideEntryLiveRecord(entry, 'sprite-text-invisible');
                return;
            }
            publishSpriteEntry(entry);
            textTracker.upsert({
                id: entry.recordId,
                hook: 'sprite_text',
                hookLabel: 'Sprite Text',
                surfaceType: 'sprite',
                original: entry.trimmedText,
                rawText: entry.rawText,
                visibleText: entry.trimmedText,
                translation: entry.translatedText || '',
                status: entry.status || 'detected',
                translationSource: entry.translationSource || '',
                normalizedSource: entry.normalizedSource || '',
                x: Math.round(entry.group.bounds.x1),
                y: Math.round(entry.group.bounds.y1),
                bounds: entry.group.bounds,
                onScreen: true,
                screenState: 'visible',
                ownerType: entry.spriteState && entry.spriteState.sprite && entry.spriteState.sprite.constructor
                    ? entry.spriteState.sprite.constructor.name
                    : 'Sprite',
                metadata: {
                    mode: 'sprite-bitmap',
                    spriteId: entry.spriteState ? entry.spriteState.id : '',
                },
            });
            entry._trTrackerVisible = true;
        };

        const claimGlyphEntryForRun = (item, run) => {
            const entry = item && item.entry;
            if (!entry || !run) return;
            entry.parentRunId = run.id;
            entry.deferTracker = true;
            if (entry._trTrackerVisible === true) hideEntryLiveRecord(entry, 'sprite-run-grouped');
            else entry._trTrackerVisible = false;
            try { item.sprite._trSpriteTextGroupedRunId = run.id; } catch (_) {}
        };

        const claimGlyphGroupForRun = (group, run) => {
            if (!Array.isArray(group) || !run) return;
            group.forEach((item) => claimGlyphEntryForRun(item, run));
        };

        const activateEntry = (entry) => {
            if (!entry || entry.stale || entry.status !== 'pending') return;
            if (entry.deferTracker || entry.parentRunId) return;
            const skipInfo = describeTranslationSkip(entry.normalizedSource);
            if (skipInfo.skip) {
                entry.status = 'skipped';
                updateEntryLiveRecord(entry);
                if (hasTextTracker() && entry._trTrackerVisible !== false) {
                    textTracker.skip(entry.recordId, skipInfo.reason || 'translation filter', Object.assign({
                        mode: 'sprite-bitmap',
                    }, skipInfo.details || {}));
                }
                return;
            }
            try {
                if (translationCache.completed.has(entry.normalizedSource)) {
                    trackDecision(entry.recordId, 'translation.cache_hit', '', {
                        mode: 'sprite-bitmap',
                    });
                    completeEntry(entry, translationCache.completed.get(entry.normalizedSource), 'cache', entry.bitmapRevision);
                    return;
                }
            } catch (_) {}
            entry.status = 'translating';
            updateEntryLiveRecord(entry);
            const expectedRevision = entry.bitmapRevision;
            const expectedId = entry.id;
            safePerf.count('spriteText2.translation.request');
            translationCache.requestTranslation(entry.translationSource, {
                recordId: entry.recordId,
                hook: 'sprite_text',
            })
                .then((translated) => completeEntry(entry, translated, 'async', expectedRevision, expectedId))
                .catch((error) => {
                    if (entry.stale) return;
                    entry.status = 'error';
                    updateEntryLiveRecord(entry);
                    if (hasTextTracker() && entry._trTrackerVisible !== false) {
                        textTracker.fail(entry.recordId, error && error.message ? error.message : String(error || 'translation error'));
                    }
                    logger.warn('[sprite-text/translation-error]', error);
                });
        };

        const completeEntry = (entry, translated, source, expectedRevision, expectedId = null) => {
            if (!entry || entry.stale || (expectedId && entry.id !== expectedId)) return;
            const spriteState = entry.spriteState;
            const bitmap = spriteState && spriteState.bitmap;
            const bitmapState = bitmap ? bitmapStates.get(bitmap) : null;
            if (!spriteState || !bitmap || !bitmapState) {
                markRecordDisappeared(entry.recordId, 'sprite-source-gone', {
                    mode: 'sprite-bitmap',
                });
                return;
            }
            if (bitmapState.revision !== expectedRevision || bitmapState.revision !== entry.bitmapRevision) {
                entry.status = 'pending';
                markSpriteDirty(spriteState.sprite, 'translation-revision-mismatch');
                updateEntryLiveRecord(entry);
                trackDecision(entry.recordId, 'sprite.revision_mismatch', '', {
                    expectedRevision,
                    currentRevision: bitmapState.revision,
                });
                return;
            }
            if (spriteState.entries.get(entry.key) !== entry) {
                markRecordDisappeared(entry.recordId, 'sprite-entry-replaced', {
                    mode: 'sprite-bitmap',
                    spriteId: spriteState.id,
                });
                return;
            }
            let restored = translated;
            try {
                if (entry.placeholderInfo) {
                    restored = restoreControlCodes(translated, entry.placeholderInfo, entry.rawText);
                }
            } catch (restoreError) {
                logger.warn('[sprite-text/restore-error]', restoreError);
            }
            if (typeof restored !== 'string') restored = entry.rawText;
            const restoredTrimmed = sanitizeVisibleText(restored);
            if (!restoredTrimmed || restoredTrimmed === entry.trimmedText) {
                entry.status = 'skipped';
                updateEntryLiveRecord(entry);
                if (hasTextTracker() && entry._trTrackerVisible !== false) textTracker.skip(entry.recordId, 'translated text matched original');
                return;
            }
            entry.status = 'completed';
            entry.translatedText = restored;
            entry.translationReceived = translated;
            entry.translationSourceKind = source || 'unknown';
            updateEntryLiveRecord(entry);
            if (hasTextTracker() && entry._trTrackerVisible !== false) {
                textTracker.complete(entry.recordId, restored, {
                    source: source || 'unknown',
                    mode: 'sprite-bitmap',
                    translationReceived: translated,
                });
            }
            safePerf.count('spriteText2.translation.completed');
            renderSpriteOverlay(spriteState, source || 'translation');
        };

        const drawTextToBitmap = (targetBitmap, group, text, options = {}) => {
            if (!targetBitmap || !group || !text) return;
            const drawState = options && options.scaleText
                ? getScaledDrawState(group.drawState)
                : group.drawState;
            try { applyBitmapDrawState(targetBitmap, drawState); } catch (_) {}
            targetBitmap._trSpriteTextReplayDepth = (targetBitmap._trSpriteTextReplayDepth || 0) + 1;
            targetBitmap._trBitmapSkipDepth = (targetBitmap._trBitmapSkipDepth || 0) + 1;
            try {
                const methodName = group.methodName && typeof targetBitmap[group.methodName] === 'function'
                    ? group.methodName
                    : 'drawText';
                const drawFn = targetBitmap[methodName] || targetBitmap.drawText;
                if (typeof drawFn === 'function') {
                    drawFn.call(
                        targetBitmap,
                        text,
                        group.drawParams.x,
                        group.drawParams.y,
                        group.drawParams.maxWidth,
                        group.drawParams.lineHeight,
                        group.drawParams.align
                    );
                }
            } finally {
                targetBitmap._trBitmapSkipDepth = Math.max(0, (targetBitmap._trBitmapSkipDepth || 1) - 1);
                targetBitmap._trSpriteTextReplayDepth = Math.max(0, (targetBitmap._trSpriteTextReplayDepth || 1) - 1);
            }
        };

        const replayPaintOp = (targetBitmap, op) => {
            if (!targetBitmap || !op || !op.methodName) return;
            targetBitmap._trSpriteTextReplayDepth = (targetBitmap._trSpriteTextReplayDepth || 0) + 1;
            targetBitmap._trBitmapSkipDepth = (targetBitmap._trBitmapSkipDepth || 0) + 1;
            try {
                switch (op.methodName) {
                case 'clearRect':
                    if (typeof targetBitmap.clearRect === 'function') targetBitmap.clearRect(...op.args);
                    break;
                case 'fillRect':
                    if (typeof targetBitmap.fillRect === 'function') targetBitmap.fillRect(...op.args);
                    break;
                case 'fillAll':
                    if (typeof targetBitmap.fillAll === 'function') targetBitmap.fillAll(...op.args);
                    break;
                case 'gradientFillRect':
                    if (typeof targetBitmap.gradientFillRect === 'function') targetBitmap.gradientFillRect(...op.args);
                    break;
                case 'strokeRect':
                    if (typeof targetBitmap.strokeRect === 'function') targetBitmap.strokeRect(...op.args);
                    break;
                case 'drawCircle':
                    if (typeof targetBitmap.drawCircle === 'function') targetBitmap.drawCircle(...op.args);
                    break;
                case 'blt':
                    if (op.args && op.args[0] !== targetBitmap && typeof targetBitmap.blt === 'function') targetBitmap.blt(...op.args);
                    break;
                case 'bltImage':
                    if (op.args && op.args[0] !== targetBitmap && typeof targetBitmap.bltImage === 'function') targetBitmap.bltImage(...op.args);
                    break;
                default:
                    break;
                }
            } catch (_) {
                // Paint replay is best-effort. Unsupported content causes the
                // next rebuild to stand down rather than damage the source.
            } finally {
                targetBitmap._trBitmapSkipDepth = Math.max(0, (targetBitmap._trBitmapSkipDepth || 1) - 1);
                targetBitmap._trSpriteTextReplayDepth = Math.max(0, (targetBitmap._trSpriteTextReplayDepth || 1) - 1);
            }
        };

        const isPositiveAlpha = (displayObject) => {
            if (!displayObject) return false;
            const alpha = Number(displayObject.alpha);
            if (Number.isFinite(alpha) && alpha <= 0) return false;
            const opacity = Number(displayObject.opacity);
            if (Number.isFinite(opacity) && opacity <= 0) {
                const contentsOpacity = Number(displayObject.contentsOpacity);
                if (!Number.isFinite(contentsOpacity) || contentsOpacity <= 0) return false;
            }
            return true;
        };

        const hasVisibleFrame = (sprite) => {
            if (!sprite || !sprite._frame) return true;
            const width = Number(sprite._frame.width);
            const height = Number(sprite._frame.height);
            return !(Number.isFinite(width) && Number.isFinite(height) && (width <= 0 || height <= 0));
        };

        const isDisplayObjectOpen = (displayObject) => {
            if (!displayObject) return false;
            if (displayObject._destroyed) return false;
            if (displayObject.visible === false || displayObject._hidden === true) return false;
            if (!isPositiveAlpha(displayObject)) return false;
            const openness = Number(displayObject.openness);
            if (displayObject._isWindow && Number.isFinite(openness) && openness <= 0) return false;
            return true;
        };

        const isChildInParent = (child, parent) => {
            if (!child || !parent) return false;
            if (child.parent !== parent) return false;
            const children = Array.isArray(parent.children) ? parent.children : null;
            return children ? children.indexOf(child) >= 0 : true;
        };

        const areAncestorsOpen = (displayObject) => {
            let child = displayObject || null;
            let cursor = child ? child.parent : null;
            while (cursor) {
                if (!isChildInParent(child, cursor)) return false;
                if (!isDisplayObjectOpen(cursor)) return false;
                if (cursor.renderable === false) return false;
                child = cursor;
                cursor = cursor.parent || null;
            }
            return true;
        };

        const isSpriteSourceRenderableNow = (sprite, expectedParent) => {
            if (!sprite || sprite._destroyed || !sprite.parent) return false;
            if (expectedParent && sprite.parent !== expectedParent) return false;
            if (!isDisplayObjectOpen(sprite)) return false;
            if (sprite.renderable === false) return false;
            if (!hasVisibleFrame(sprite)) return false;
            return areAncestorsOpen(sprite);
        };

        const shouldRenderSpriteOverlay = (spriteState) => {
            if (!spriteState || !spriteState.sprite || !spriteState.overlaySprite) return false;
            return isSpriteSourceRenderableNow(
                spriteState.sprite,
                spriteState.overlaySprite.parent
            );
        };

        const shouldRenderParentRunOverlay = (run) => {
            if (!run || run.stale || !run.overlaySprite || !run.parent || run.parent._destroyed) return false;
            if (!isDisplayObjectOpen(run.parent) || run.parent.renderable === false || !areAncestorsOpen(run.parent)) return false;
            if (!Array.isArray(run.group) || !run.group.length) return false;
            return run.group.every((item) => {
                const sprite = item && item.sprite;
                return isSpriteSourceRenderableNow(sprite, run.parent);
            });
        };

        const isSpriteEntryScreenVisible = (entry) => {
            if (!entry || entry.stale || !entry.spriteState || !entry.spriteState.sprite) return false;
            const spriteState = entry.spriteState;
            if (spriteState.overlaySprite) {
                return shouldRenderSpriteOverlay(spriteState);
            }
            const sprite = spriteState.sprite;
            return isSpriteSourceRenderableNow(sprite, sprite ? sprite.parent : null);
        };

        const isParentRunScreenVisible = (run) => {
            if (!run || run.stale || !run.parent || run.parent._destroyed) return false;
            if (run.overlaySprite) return shouldRenderParentRunOverlay(run);
            if (!isDisplayObjectOpen(run.parent) || run.parent.renderable === false || !areAncestorsOpen(run.parent)) return false;
            if (!Array.isArray(run.group) || !run.group.length) return false;
            return run.group.every((item) => isSpriteSourceRenderableNow(item && item.sprite, run.parent));
        };

        const installOverlayRenderGuard = (overlay) => {
            if (!overlay || overlay._trSpriteTextRenderGuard === TOKEN) return;
            ['render', 'renderWebGL', 'renderCanvas'].forEach((methodName) => {
                const current = overlay[methodName];
                if (typeof current !== 'function') return;
                const original = current.__trOriginal || current;
                const wrapped = function(...args) {
                    try {
                        if (typeof this._trSpriteTextShouldRender === 'function'
                            && !this._trSpriteTextShouldRender()) {
                            return undefined;
                        }
                    } catch (_) {
                        return undefined;
                    }
                    return original.apply(this, args);
                };
                wrapped.__trOriginal = original;
                overlay[methodName] = wrapped;
            });
            overlay._trSpriteTextRenderGuard = TOKEN;
        };

        const installSourceRenderGuard = (sprite) => {
            if (!sprite || sprite._trSpriteTextSourceRenderGuard === TOKEN) return;
            ['render', 'renderWebGL', 'renderCanvas'].forEach((methodName) => {
                const current = sprite[methodName];
                if (typeof current !== 'function') return;
                const original = current.__trOriginal || current;
                const wrapped = function(...args) {
                    try {
                        const guards = Array.isArray(this._trSpriteTextRenderSkipGuards)
                            ? this._trSpriteTextRenderSkipGuards
                            : [];
                        for (const guard of guards) {
                            if (typeof guard === 'function' && guard()) {
                                return undefined;
                            }
                        }
                    } catch (_) {}
                    return original.apply(this, args);
                };
                wrapped.__trOriginal = original;
                sprite[methodName] = wrapped;
            });
            sprite._trSpriteTextSourceRenderGuard = TOKEN;
        };

        const addSourceRenderSkipGuard = (sprite, key, guard) => {
            if (!sprite || !key || typeof guard !== 'function') return;
            installSourceRenderGuard(sprite);
            if (!Array.isArray(sprite._trSpriteTextRenderSkipGuards)) {
                sprite._trSpriteTextRenderSkipGuards = [];
            }
            if (!sprite._trSpriteTextRenderSkipGuardKeys) {
                sprite._trSpriteTextRenderSkipGuardKeys = Object.create(null);
            }
            const existing = sprite._trSpriteTextRenderSkipGuardKeys[key];
            if (existing) {
                const index = sprite._trSpriteTextRenderSkipGuards.indexOf(existing);
                if (index >= 0) sprite._trSpriteTextRenderSkipGuards.splice(index, 1);
            }
            sprite._trSpriteTextRenderSkipGuardKeys[key] = guard;
            sprite._trSpriteTextRenderSkipGuards.push(guard);
        };

        const removeSourceRenderSkipGuard = (sprite, key) => {
            if (!sprite || !key || !sprite._trSpriteTextRenderSkipGuardKeys) return;
            const guard = sprite._trSpriteTextRenderSkipGuardKeys[key];
            delete sprite._trSpriteTextRenderSkipGuardKeys[key];
            if (guard && Array.isArray(sprite._trSpriteTextRenderSkipGuards)) {
                const index = sprite._trSpriteTextRenderSkipGuards.indexOf(guard);
                if (index >= 0) sprite._trSpriteTextRenderSkipGuards.splice(index, 1);
            }
        };

        const createOverlaySprite = () => {
            try {
                const overlay = new Sprite();
                overlay._trSpriteTextObserverBypass = true;
                installOverlayRenderGuard(overlay);
                return overlay;
            } catch (_) {
                return null;
            }
        };

        const restoreSpriteSource = (spriteState) => {
            if (!spriteState || !spriteState.sprite || !spriteState.hidden) return;
            const sprite = spriteState.sprite;
            try {
                removeSourceRenderSkipGuard(sprite, spriteState.hiddenToken);
                if (sprite._trSpriteTextHiddenToken === spriteState.hiddenToken) delete sprite._trSpriteTextHiddenToken;
                delete sprite._trSpriteTextRunPreviousRenderable;
            } catch (_) {}
            spriteState.hidden = false;
            spriteState.hiddenToken = '';
        };

        const hideSpriteSource = (spriteState) => {
            if (!spriteState || !spriteState.sprite) return;
            const sprite = spriteState.sprite;
            const token = `${spriteState.id}:overlay`;
            try {
                addSourceRenderSkipGuard(sprite, token, () => shouldRenderSpriteOverlay(spriteState));
                sprite._trSpriteTextHiddenToken = token;
                spriteState.hidden = true;
                spriteState.hiddenToken = token;
            } catch (_) {}
        };

        const removeSpriteOverlay = (spriteState, reason = 'remove') => {
            if (!spriteState) return;
            const overlay = spriteState.overlaySprite;
            if (overlay && overlay.parent && typeof overlay.parent.removeChild === 'function') {
                try { overlay.parent.removeChild(overlay); } catch (_) {}
            }
            spriteState.overlaySprite = null;
            spriteState.overlayBitmap = null;
            restoreSpriteSource(spriteState);
            activeSprites.delete(spriteState.sprite);
            safePerf.top('spriteText2.overlay.removeReason', reason || 'unknown');
        };

        const copySpriteVisualState = (source, overlay) => {
            if (!source || !overlay) return;
            try {
                overlay.x = source.x || 0;
                overlay.y = source.y || 0;
                if (Number.isFinite(Number(source.opacity))) overlay.opacity = source.opacity;
                if (Number.isFinite(Number(source.alpha))) overlay.alpha = source.alpha;
                if (source.blendMode !== undefined) overlay.blendMode = source.blendMode;
                if (source.tint !== undefined) overlay.tint = source.tint;
                if (Number.isFinite(Number(source.rotation))) overlay.rotation = source.rotation;
                if (source.z !== undefined) overlay.z = source.z;
                if (source.zIndex !== undefined) overlay.zIndex = source.zIndex;
                if (overlay.scale && source.scale) {
                    overlay.scale.x = Number.isFinite(Number(source.scale.x)) ? source.scale.x : overlay.scale.x;
                    overlay.scale.y = Number.isFinite(Number(source.scale.y)) ? source.scale.y : overlay.scale.y;
                }
                if (overlay.anchor && source.anchor) {
                    overlay.anchor.x = Number.isFinite(Number(source.anchor.x)) ? source.anchor.x : 0;
                    overlay.anchor.y = Number.isFinite(Number(source.anchor.y)) ? source.anchor.y : 0;
                }
                overlay.visible = source.visible !== false;
                overlay.renderable = true;
                if (typeof overlay.setFrame === 'function' && source._frame) {
                    overlay.setFrame(source._frame.x || 0, source._frame.y || 0, source._frame.width || 0, source._frame.height || 0);
                }
            } catch (_) {}
        };

        const attachOverlayAfterSource = (source, overlay) => {
            if (!source || !overlay || !source.parent || source.parent._destroyed) return false;
            const parent = source.parent;
            if (overlay.parent !== parent && overlay.parent && typeof overlay.parent.removeChild === 'function') {
                try { overlay.parent.removeChild(overlay); } catch (_) {}
            }
            try {
                const children = Array.isArray(parent.children) ? parent.children : null;
                const sourceIndex = children ? children.indexOf(source) : -1;
                if (children && sourceIndex < 0) return false;
                const overlayIndex = children ? children.indexOf(overlay) : -1;
                const targetIndex = sourceIndex >= 0 ? Math.min(children.length, sourceIndex + 1) : -1;
                if (targetIndex >= 0 && typeof parent.addChildAt === 'function') {
                    if (overlay.parent !== parent || overlayIndex !== targetIndex) {
                        parent.addChildAt(overlay, targetIndex);
                    }
                } else if (typeof parent.addChild === 'function' && overlay.parent !== parent) {
                    parent.addChild(overlay);
                }
                return overlay.parent === parent;
            } catch (error) {
                logger.warn('[sprite-text/overlay-attach-error]', error);
                return false;
            }
        };

        const syncSpriteOverlay = (spriteState) => {
            if (!spriteState || !spriteState.sprite || !spriteState.overlaySprite) return false;
            const sprite = spriteState.sprite;
            if (sprite._destroyed || !sprite.parent || !isChildInParent(sprite, sprite.parent) || spriteState.overlaySprite._destroyed) {
                removeSpriteOverlay(spriteState, 'source-gone');
                return false;
            }
            copySpriteVisualState(sprite, spriteState.overlaySprite);
            const renderable = shouldRenderSpriteOverlay(spriteState);
            spriteState.overlaySprite.renderable = renderable;
            Array.from(spriteState.entries.values()).forEach((entry) => {
                if (!entry || entry.stale) return;
                if (renderable) updateEntryLiveRecord(entry);
                else hideEntryLiveRecord(entry, 'sprite-text-invisible');
            });
            if (!attachOverlayAfterSource(sprite, spriteState.overlaySprite)) {
                removeSpriteOverlay(spriteState, 'attach-failed');
                return false;
            }
            return true;
        };

        const renderSpriteOverlay = (spriteState, source = 'translation') => {
            if (!spriteState || !spriteState.sprite || !spriteState.bitmap) return;
            const sprite = spriteState.sprite;
            const bitmap = spriteState.bitmap;
            const bitmapState = bitmapStates.get(bitmap);
            if (!bitmapState || bitmapState.destroyed || bitmapState.unsupportedPaint) {
                removeSpriteOverlay(spriteState, bitmapState && bitmapState.unsupportedPaint ? 'unsupported-paint' : 'no-bitmap-state');
                return;
            }
            const entries = Array.from(spriteState.entries.values()).filter((entry) => entry && !entry.stale);
            const hasCompletedReplacement = entries.some((entry) => entry.status === 'completed' && entry.translatedText);
            if (!hasCompletedReplacement) {
                removeSpriteOverlay(spriteState, 'no-completed-entry');
                return;
            }
            const width = Math.max(1, Math.ceil(Number(bitmap.width) || 1));
            const height = Math.max(1, Math.ceil(Number(bitmap.height) || 1));
            let overlayBitmap = null;
            try {
                overlayBitmap = new Bitmap(width, height);
                overlayBitmap._trSpriteTextOverlayBitmap = true;
            } catch (_) {
                return;
            }

            const paintOps = Array.isArray(bitmapState.paintOps) ? bitmapState.paintOps.slice() : [];
            paintOps.sort((a, b) => (a.drawOrder || 0) - (b.drawOrder || 0));
            paintOps.forEach((op) => replayPaintOp(overlayBitmap, op));

            entries
                .slice()
                .sort((a, b) => ((a.group && a.group.drawOrder) || 0) - ((b.group && b.group.drawOrder) || 0))
                .forEach((entry) => {
                    const drawText = entry.status === 'completed' && entry.translatedText
                        ? entry.translatedText
                        : entry.rawText;
                    drawTextToBitmap(overlayBitmap, entry.group, drawText, {
                        scaleText: entry.status === 'completed' && !!entry.translatedText,
                    });
                });

            let overlay = spriteState.overlaySprite;
            if (!overlay || overlay._destroyed) {
                overlay = createOverlaySprite();
                if (!overlay) return;
                spriteState.overlaySprite = overlay;
            }
            try {
                overlay._trSpriteTextObserverBypass = true;
                overlay._trSpriteTextShouldRender = () => shouldRenderSpriteOverlay(spriteState);
                overlay.bitmap = overlayBitmap;
                spriteState.overlayBitmap = overlayBitmap;
                copySpriteVisualState(sprite, overlay);
                overlay.renderable = shouldRenderSpriteOverlay(spriteState);
                if (!attachOverlayAfterSource(sprite, overlay)) {
                    removeSpriteOverlay(spriteState, 'attach-failed');
                    return;
                }
                overlay.renderable = shouldRenderSpriteOverlay(spriteState);
                hideSpriteSource(spriteState);
                activeSprites.add(sprite);
                safePerf.count('spriteText2.overlay.render');
                if (telemetry && typeof telemetry.logDraw === 'function') {
                    telemetry.logDraw('sprite_text_redraw', source, 0, 0, {
                        mode: 'sprite-bitmap',
                        spriteId: spriteState.id,
                    });
                }
                entries.forEach((entry) => {
                    if (entry && entry.recordId && hasTextTracker()) {
                        updateEntryLiveRecord(entry);
                        if (entry._trTrackerVisible !== false) {
                            textTracker.draw(entry.recordId, 'overlay', {
                                mode: 'sprite-bitmap',
                                spriteId: spriteState.id,
                                source,
                                translationDrawn: entry.translatedText || '',
                            });
                        }
                    }
                });
            } catch (error) {
                logger.warn('[sprite-text/overlay-render-error]', error);
                removeSpriteOverlay(spriteState, 'render-error');
            }
        };

        const processSpriteSurface = (sprite, reason = 'frame') => {
            if (!sprite || sprite._destroyed || sprite._trSpriteTextObserverBypass) return;
            const spriteState = ensureSpriteState(sprite);
            if (!sprite.parent) {
                Array.from(spriteState.entries.values()).forEach((entry) => staleEntry(entry, 'not-attached'));
                spriteState.entries.clear();
                spriteState.singleGlyphCandidate = null;
                removeSpriteOverlay(spriteState, 'not-attached');
                return;
            }
            let bitmap = null;
            try { bitmap = sprite.bitmap; } catch (_) { bitmap = null; }
            spriteState.bitmap = bitmap;
            spriteState.singleGlyphCandidate = null;

            if (!bitmap || isWindowOwnedBitmap(bitmap) || isOverlayBitmap(bitmap)) {
                Array.from(spriteState.entries.values()).forEach((entry) => staleEntry(entry, 'bitmap-missing'));
                spriteState.entries.clear();
                removeSpriteOverlay(spriteState, 'bitmap-missing');
                return;
            }

            const bitmapState = bitmapStates.get(bitmap);
            if (!bitmapState || bitmapState.destroyed || !Array.isArray(bitmapState.textOps) || !bitmapState.textOps.length) {
                Array.from(spriteState.entries.values()).forEach((entry) => staleEntry(entry, 'no-text'));
                spriteState.entries.clear();
                removeSpriteOverlay(spriteState, 'no-text');
                return;
            }
            if (bitmapState.unsupportedPaint) {
                Array.from(spriteState.entries.values()).forEach((entry) => staleEntry(entry, 'unsupported-paint'));
                spriteState.entries.clear();
                removeSpriteOverlay(spriteState, 'unsupported-paint');
                return;
            }

            const groups = buildTextGroups(bitmapState.textOps);
            const nextKeys = new Set();
            groups.forEach((group) => {
                const entry = createOrUpdateEntry(spriteState, group, bitmapState);
                nextKeys.add(entry.key);
                updateEntryLiveRecord(entry);
            });
            Array.from(spriteState.entries.entries()).forEach(([key, entry]) => {
                if (!nextKeys.has(key)) {
                    staleEntry(entry, 'not-seen');
                    spriteState.entries.delete(key);
                }
            });

            const liveEntries = Array.from(spriteState.entries.values()).filter((entry) => entry && !entry.stale);
            if (liveEntries.length === 1 && textUnitCount(liveEntries[0].trimmedText) === 1) {
                spriteState.singleGlyphCandidate = createGlyphCandidate(spriteState, liveEntries[0]);
                removeSpriteOverlay(spriteState, 'single-glyph-parent-owned');
                markParentDirty(sprite.parent, 'single-glyph');
                return;
            }

            if (sprite._trSpriteTextGroupedRunId) {
                removeSpriteOverlay(spriteState, 'parent-run-active');
                return;
            }

            liveEntries.forEach(activateEntry);
            if (liveEntries.some((entry) => entry.status === 'completed' && entry.translatedText)) {
                renderSpriteOverlay(spriteState, reason);
            }
        };

        const createGlyphCandidate = (spriteState, entry) => {
            if (!spriteState || !entry || !entry.group || !spriteState.sprite || !spriteState.bitmap) return null;
            const sprite = spriteState.sprite;
            const bitmap = spriteState.bitmap;
            const group = entry.group;
            const anchorX = sprite.anchor && Number.isFinite(Number(sprite.anchor.x)) ? Number(sprite.anchor.x) : 0;
            const anchorY = sprite.anchor && Number.isFinite(Number(sprite.anchor.y)) ? Number(sprite.anchor.y) : 0;
            const bitmapWidth = Number.isFinite(Number(bitmap.width)) ? Number(bitmap.width) : 0;
            const bitmapHeight = Number.isFinite(Number(bitmap.height)) ? Number(bitmap.height) : 0;
            const x = (Number.isFinite(Number(sprite.x)) ? Number(sprite.x) : 0) - anchorX * bitmapWidth + group.bounds.x1;
            const y = (Number.isFinite(Number(sprite.y)) ? Number(sprite.y) : 0) - anchorY * bitmapHeight + group.bounds.y1;
            const width = Math.max(1, group.bounds.x2 - group.bounds.x1);
            const height = Math.max(1, group.bounds.y2 - group.bounds.y1);
            return {
                sprite,
                spriteState,
                entry,
                rawText: entry.rawText,
                trimmedText: entry.trimmedText,
                drawState: group.drawState,
                fontSignature: group.fontSignature,
                x,
                y,
                width,
                height,
                bounds: rectFromDimensions(x, y, width, height),
                lineHeight: group.drawParams.lineHeight,
            };
        };

        const getParentRunMap = (parent) => {
            if (!parent) return null;
            let state = parentRunStates.get(parent);
            if (!state) {
                state = {
                    runs: new Map(),
                };
                parentRunStates.set(parent, state);
            }
            if (!state.runs || typeof state.runs.set !== 'function') state.runs = new Map();
            return state.runs;
        };

        const collectGlyphCandidates = (parent) => {
            const children = parent && Array.isArray(parent.children) ? parent.children : [];
            const candidates = [];
            children.forEach((child, childIndex) => {
                if (!child || child._destroyed || child._trSpriteTextObserverBypass) return;
                const state = spriteStates.get(child);
                const candidate = state && state.singleGlyphCandidate ? createGlyphCandidate(state, state.singleGlyphCandidate.entry) : null;
                if (!candidate || !candidate.trimmedText || textUnitCount(candidate.trimmedText) !== 1) return;
                candidate.childIndex = childIndex;
                candidates.push(candidate);
            });
            return candidates;
        };

        const glyphBounds = (item) => {
            if (item && item.bounds && rectHasArea(item.bounds)) return item.bounds;
            return rectFromDimensions(
                item ? item.x : 0,
                item ? item.y : 0,
                item ? item.width : 0,
                item ? item.height : 0
            );
        };

        const glyphVerticalLimit = (a, b, ratio) => {
            const aHeight = Math.max(1, Number(a && (a.lineHeight || a.height)) || 24);
            const bHeight = Math.max(1, Number(b && (b.lineHeight || b.height)) || 24);
            return Math.max(4, Math.ceil(Math.max(aHeight, bHeight) * ratio));
        };

        const glyphsVerticallyCompatible = (a, b, ratio) => {
            const aBounds = glyphBounds(a);
            const bBounds = glyphBounds(b);
            if (verticalOverlapAmount(aBounds, bBounds) > 0) return true;
            return Math.abs(rectCenterY(aBounds) - rectCenterY(bBounds)) <= glyphVerticalLimit(a, b, ratio);
        };

        const canContinueGlyphRun = (last, item, verticalRatio) => {
            if (!last || !item) return false;
            if (item.fontSignature !== last.fontSignature) return false;
            const lineHeight = Math.max(1, Number(item.lineHeight || last.lineHeight || item.height || last.height) || 24);
            const gapLimit = Math.max(GAP_MIN, Math.ceil(lineHeight * GAP_RATIO));
            const backtrackLimit = Math.max(2, Math.ceil(lineHeight * GLYPH_BACKTRACK_RATIO));
            const gap = item.x - (last.x + last.width);
            if (gap > gapLimit) return false;
            if (item.x < last.x - backtrackLimit) return false;
            return glyphsVerticallyCompatible(last, item, verticalRatio);
        };

        const buildGlyphGroupsByChildOrder = (candidates) => {
            const ordered = candidates.slice().sort((a, b) => {
                const aIndex = Number.isFinite(Number(a.childIndex)) ? Number(a.childIndex) : 0;
                const bIndex = Number.isFinite(Number(b.childIndex)) ? Number(b.childIndex) : 0;
                if (aIndex !== bIndex) return aIndex - bIndex;
                return a.x - b.x;
            });
            const groups = [];
            let current = [];
            let last = null;
            const pushCurrent = () => {
                if (current.length >= 2) groups.push(current);
                current = [];
            };
            for (const item of ordered) {
                if (!last) {
                    current.push(item);
                    last = item;
                    continue;
                }
                if (!canContinueGlyphRun(last, item, GLYPH_VERTICAL_RATIO)) {
                    pushCurrent();
                }
                current.push(item);
                last = item;
            }
            pushCurrent();
            return groups;
        };

        const buildGlyphGroupsBySpatialLines = (candidates) => {
            const lines = [];
            candidates
                .slice()
                .sort((a, b) => {
                    if (a.fontSignature !== b.fontSignature) {
                        return String(a.fontSignature || '').localeCompare(String(b.fontSignature || ''));
                    }
                    if (a.y !== b.y) return a.y - b.y;
                    return a.x - b.x;
                })
                .forEach((candidate) => {
                    let bestLine = null;
                    let bestDistance = Infinity;
                    for (const line of lines) {
                        if (!line || line.fontSignature !== candidate.fontSignature || !line.items.length) continue;
                        const reference = line.items[0];
                        if (!glyphsVerticallyCompatible(reference, candidate, GLYPH_SPATIAL_VERTICAL_RATIO)) continue;
                        const distance = Math.abs(rectCenterY(glyphBounds(reference)) - rectCenterY(glyphBounds(candidate)));
                        if (distance < bestDistance) {
                            bestLine = line;
                            bestDistance = distance;
                        }
                    }
                    if (!bestLine) {
                        bestLine = {
                            fontSignature: candidate.fontSignature,
                            items: [],
                        };
                        lines.push(bestLine);
                    }
                    bestLine.items.push(candidate);
                });

            const groups = [];
            lines.forEach((line) => {
                const sorted = line.items.slice().sort((a, b) => {
                    if (a.x !== b.x) return a.x - b.x;
                    const aIndex = Number.isFinite(Number(a.childIndex)) ? Number(a.childIndex) : 0;
                    const bIndex = Number.isFinite(Number(b.childIndex)) ? Number(b.childIndex) : 0;
                    return aIndex - bIndex;
                });
                let current = [];
                let last = null;
                const pushCurrent = () => {
                    if (current.length >= 2) groups.push(current);
                    current = [];
                };
                for (const item of sorted) {
                    if (!last) {
                        current.push(item);
                        last = item;
                        continue;
                    }
                    if (!canContinueGlyphRun(last, item, GLYPH_SPATIAL_VERTICAL_RATIO)) {
                        pushCurrent();
                    }
                    current.push(item);
                    last = item;
                }
                pushCurrent();
            });
            return groups;
        };

        const buildGlyphGroups = (candidates) => {
            const valid = (Array.isArray(candidates) ? candidates : [])
                .filter((candidate) => candidate && candidate.trimmedText && textUnitCount(candidate.trimmedText) === 1);
            if (valid.length < 2) return [];

            const groups = [];
            const used = new Set();
            buildGlyphGroupsByChildOrder(valid).forEach((group) => {
                groups.push(group);
                group.forEach((item) => used.add(item));
            });

            const remaining = valid.filter((candidate) => !used.has(candidate));
            buildGlyphGroupsBySpatialLines(remaining).forEach((group) => {
                groups.push(group);
            });
            return groups;
        };

        const createOrUpdateParentRun = (parent, group, runMap) => {
            const rawText = group.map((item) => item.rawText).join('');
            const trimmedText = sanitizeVisibleText(rawText);
            if (!trimmedText || skipLikeCounter(trimmedText)) return null;
            const key = group.map((item) => item.spriteState.id).join('|');
            const existing = runMap.get(key);
            const bounds = group.reduce((acc, item) => ({
                x1: Math.min(acc.x1, item.x),
                y1: Math.min(acc.y1, item.y),
                x2: Math.max(acc.x2, item.x + item.width),
                y2: Math.max(acc.y2, item.y + item.height),
            }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
            if (!isValidRect(bounds)) return null;
            if (existing && existing.rawText === rawText) {
                existing.group = group;
                existing.bounds = bounds;
                existing.lastSeenAt = Date.now();
                claimGlyphGroupForRun(group, existing);
                trackedParentRuns.add(existing);
                return existing;
            }
            if (existing) removeParentRun(existing, 'replaced');
            const placeholderInfo = prepareTextForTranslation(rawText);
            const translationSource = placeholderInfo ? placeholderInfo.textForTranslation : rawText;
            const run = {
                id: `str-${(++nextRunId).toString(36)}`,
                key,
                parent,
                group,
                rawText,
                trimmedText,
                placeholderInfo,
                translationSource,
                normalizedSource: String(translationSource || '').trim(),
                bounds,
                drawState: group[0] ? group[0].drawState : null,
                lineHeight: Math.max(...group.map((item) => Number(item.lineHeight) || 0), 1),
                status: 'pending',
                translatedText: '',
                overlaySprite: null,
                overlayBitmap: null,
                recordId: `sprite-run:${key}:${trimmedText}`,
                createdAt: Date.now(),
                lastSeenAt: Date.now(),
            };
            runMap.set(key, run);
            claimGlyphGroupForRun(group, run);
            if (telemetry && typeof telemetry.logTextDetected === 'function') {
                telemetry.logTextDetected('sprite_text', run.trimmedText, bounds.x1, bounds.y1, {
                    mode: 'sprite-run',
                    glyphs: group.length,
                });
            }
            if (hasTextTracker()) {
                textTracker.detect({
                    id: run.recordId,
                    hook: 'sprite_text',
                    hookLabel: 'Sprite Text',
                    surfaceType: 'sprite',
                    status: 'pending',
                    rawText: run.rawText,
                    visibleText: run.trimmedText,
                    original: run.trimmedText,
                    translationSource: run.translationSource,
                    normalizedSource: run.normalizedSource,
                    x: Math.round(bounds.x1),
                    y: Math.round(bounds.y1),
                    bounds,
                    ownerType: parent && parent.constructor ? parent.constructor.name : 'Sprite',
                    metadata: {
                        mode: 'sprite-run',
                        glyphs: group.length,
                    },
                });
                run._trTrackerVisible = true;
            }
            trackedParentRuns.add(run);
            diag(`[sprite-text/register] mode=sprite-run id=${run.id} text="${preview(run.trimmedText)}" glyphs=${group.length} rect=${formatRect(bounds)}`);
            return run;
        };

        const hideRunLiveRecord = (run, reason = 'sprite-run-invisible') => {
            if (!run || run.stale || !hasTextTracker() || run._trTrackerVisible === false) return;
            markRecordDisappeared(run.recordId, reason, {
                mode: 'sprite-run',
                glyphs: run.group ? run.group.length : 0,
            });
            run._trTrackerVisible = false;
        };

        const updateRunLiveRecord = (run) => {
            if (!run || run.stale) return;
            if (!hasTextTracker()) return;
            if (!isParentRunScreenVisible(run)) {
                hideRunLiveRecord(run, 'sprite-run-invisible');
                return;
            }
            textTracker.upsert({
                id: run.recordId,
                hook: 'sprite_text',
                hookLabel: 'Sprite Text',
                surfaceType: 'sprite',
                original: run.trimmedText,
                rawText: run.rawText,
                visibleText: run.trimmedText,
                translation: run.translatedText || '',
                status: run.status || 'detected',
                translationSource: run.translationSource || '',
                normalizedSource: run.normalizedSource || '',
                x: Math.round(run.bounds ? run.bounds.x1 : 0),
                y: Math.round(run.bounds ? run.bounds.y1 : 0),
                bounds: run.bounds || null,
                onScreen: true,
                screenState: 'visible',
                ownerType: run.parent && run.parent.constructor ? run.parent.constructor.name : 'Sprite',
                metadata: {
                    mode: 'sprite-run',
                    glyphs: run.group ? run.group.length : 0,
                },
            });
            run._trTrackerVisible = true;
        };

        const activateParentRun = (run) => {
            if (!run || run.stale || run.status !== 'pending') return;
            const skipInfo = describeTranslationSkip(run.normalizedSource);
            if (skipInfo.skip) {
                run.status = 'skipped';
                updateRunLiveRecord(run);
                if (hasTextTracker() && run._trTrackerVisible !== false) {
                    textTracker.skip(run.recordId, skipInfo.reason || 'translation filter', Object.assign({
                        mode: 'sprite-run',
                        glyphs: run.group ? run.group.length : 0,
                    }, skipInfo.details || {}));
                }
                return;
            }
            try {
                if (translationCache.completed.has(run.normalizedSource)) {
                    trackDecision(run.recordId, 'translation.cache_hit', '', {
                        mode: 'sprite-run',
                        glyphs: run.group ? run.group.length : 0,
                    });
                    completeParentRun(run, translationCache.completed.get(run.normalizedSource), 'cache', run.id);
                    return;
                }
            } catch (_) {}
            run.status = 'translating';
            updateRunLiveRecord(run);
            const expectedId = run.id;
            safePerf.count('spriteText2.run.translation.request');
            translationCache.requestTranslation(run.translationSource, {
                recordId: run.recordId,
                hook: 'sprite_text',
            })
                .then((translated) => completeParentRun(run, translated, 'async', expectedId))
                .catch((error) => {
                    if (run.stale) return;
                    run.status = 'error';
                    updateRunLiveRecord(run);
                    if (hasTextTracker() && run._trTrackerVisible !== false) {
                        textTracker.fail(run.recordId, error && error.message ? error.message : String(error || 'translation error'));
                    }
                    logger.warn('[sprite-text/run-translation-error]', error);
                });
        };

        const completeParentRun = (run, translated, source, expectedId) => {
            if (!run || run.stale || run.id !== expectedId) return;
            if (!run.parent || run.parent._destroyed || !run.group || !run.group.every((item) => item.sprite && isChildInParent(item.sprite, run.parent))) {
                removeParentRun(run, 'source-gone');
                return;
            }
            const staleGlyph = run.group.some((item) => {
                const entry = item && item.entry;
                const spriteState = item && item.spriteState;
                const bitmapState = spriteState && spriteState.bitmap ? bitmapStates.get(spriteState.bitmap) : null;
                return !entry || entry.stale || !bitmapState || bitmapState.revision !== entry.bitmapRevision;
            });
            if (staleGlyph) {
                run.status = 'pending';
                markParentDirty(run.parent, 'run-revision-mismatch');
                updateRunLiveRecord(run);
                trackDecision(run.recordId, 'sprite.run_revision_mismatch');
                return;
            }
            let restored = translated;
            try {
                if (run.placeholderInfo) {
                    restored = restoreControlCodes(translated, run.placeholderInfo, run.rawText);
                }
            } catch (restoreError) {
                logger.warn('[sprite-text/run-restore-error]', restoreError);
            }
            if (typeof restored !== 'string') restored = run.rawText;
            const restoredTrimmed = sanitizeVisibleText(restored);
            if (!restoredTrimmed || restoredTrimmed === run.trimmedText) {
                run.status = 'skipped';
                updateRunLiveRecord(run);
                if (hasTextTracker() && run._trTrackerVisible !== false) textTracker.skip(run.recordId, 'translated text matched original');
                return;
            }
            run.status = 'completed';
            run.translatedText = restored;
            run.translationReceived = translated;
            run.translationSourceKind = source || 'unknown';
            updateRunLiveRecord(run);
            if (hasTextTracker() && run._trTrackerVisible !== false) {
                textTracker.complete(run.recordId, restored, {
                    source: source || 'unknown',
                    mode: 'sprite-run',
                    translationReceived: translated,
                });
            }
            renderParentRunOverlay(run, source || 'translation');
        };

        const hideRunSources = (run) => {
            if (!run || !Array.isArray(run.group)) return;
            run.group.forEach((item) => {
                const sprite = item && item.sprite;
                if (!sprite) return;
                try {
                    addSourceRenderSkipGuard(sprite, run.id, () => shouldRenderParentRunOverlay(run));
                    sprite._trSpriteTextRunHiddenBy = run.id;
                } catch (_) {}
            });
        };

        const restoreRunSources = (run) => {
            if (!run || !Array.isArray(run.group)) return;
            run.group.forEach((item) => {
                const sprite = item && item.sprite;
                if (!sprite) return;
                try {
                    if (sprite._trSpriteTextRunHiddenBy === run.id) {
                        removeSourceRenderSkipGuard(sprite, run.id);
                        delete sprite._trSpriteTextRunHiddenBy;
                        delete sprite._trSpriteTextRunPreviousRenderable;
                    }
                    if (sprite._trSpriteTextGroupedRunId === run.id) {
                        delete sprite._trSpriteTextGroupedRunId;
                    }
                } catch (_) {}
            });
        };

        const removeParentRun = (run, reason = 'remove') => {
            if (!run || run.stale) return;
            run.stale = true;
            trackedParentRuns.delete(run);
            const overlay = run.overlaySprite;
            if (overlay && overlay.parent && typeof overlay.parent.removeChild === 'function') {
                try { overlay.parent.removeChild(overlay); } catch (_) {}
            }
            restoreRunSources(run);
            if (hasTextTracker() && run._trTrackerVisible !== false) {
                markRecordDisappeared(run.recordId, reason || 'remove', {
                    mode: 'sprite-run',
                    glyphs: run.group ? run.group.length : 0,
                });
            }
            activeParents.delete(run.parent);
            safePerf.top('spriteText2.run.removeReason', reason || 'unknown');
        };

        const renderParentRunOverlay = (run, source = 'translation') => {
            if (!run || run.stale || run.status !== 'completed' || !run.translatedText || !run.parent) return;
            const measured = measureTextWidth(null, sanitizeVisibleText(run.translatedText), 0);
            const outline = run.drawState && Number.isFinite(Number(run.drawState.outlineWidth))
                ? Math.max(2, Number(run.drawState.outlineWidth) + 2)
                : 3;
            const width = Math.max(1, Math.ceil(run.bounds.x2 - run.bounds.x1), measured + outline * 2);
            const height = Math.max(1, Math.ceil(run.bounds.y2 - run.bounds.y1), Math.ceil(run.lineHeight || 24));
            let bitmap = null;
            try {
                bitmap = new Bitmap(width, height);
                bitmap._trSpriteTextOverlayBitmap = true;
                const group = {
                    drawState: run.drawState,
                    methodName: 'drawText',
                    drawParams: {
                        x: outline,
                        y: 0,
                        maxWidth: Math.max(1, width - outline * 2),
                        lineHeight: height,
                        align: 'left',
                    },
                };
                drawTextToBitmap(bitmap, group, run.translatedText, { scaleText: true });
            } catch (_) {
                return;
            }

            let overlay = run.overlaySprite;
            if (!overlay || overlay._destroyed) {
                overlay = createOverlaySprite();
                if (!overlay) return;
                run.overlaySprite = overlay;
            }
            try {
                overlay._trSpriteTextObserverBypass = true;
                overlay._trSpriteTextShouldRender = () => shouldRenderParentRunOverlay(run);
                overlay.bitmap = bitmap;
                run.overlayBitmap = bitmap;
                overlay.x = Math.floor(run.bounds.x1 - outline);
                overlay.y = Math.floor(run.bounds.y1);
                const reference = run.group && run.group[0] ? run.group[0].sprite : null;
                if (reference) {
                    if (Number.isFinite(Number(reference.opacity))) overlay.opacity = reference.opacity;
                    if (Number.isFinite(Number(reference.alpha))) overlay.alpha = reference.alpha;
                    if (reference.blendMode !== undefined) overlay.blendMode = reference.blendMode;
                    if (reference.tint !== undefined) overlay.tint = reference.tint;
                    if (Number.isFinite(Number(reference.rotation))) overlay.rotation = reference.rotation;
                    if (overlay.scale && reference.scale) {
                        overlay.scale.x = Number.isFinite(Number(reference.scale.x)) ? reference.scale.x : overlay.scale.x;
                        overlay.scale.y = Number.isFinite(Number(reference.scale.y)) ? reference.scale.y : overlay.scale.y;
                    }
                    if (overlay.anchor) {
                        overlay.anchor.x = 0;
                        overlay.anchor.y = 0;
                    }
                    overlay.visible = reference.visible !== false;
                }
                if (overlay.parent !== run.parent) {
                    if (overlay.parent && typeof overlay.parent.removeChild === 'function') {
                        try { overlay.parent.removeChild(overlay); } catch (_) {}
                    }
                    if (typeof run.parent.addChild === 'function') run.parent.addChild(overlay);
                }
                overlay.renderable = shouldRenderParentRunOverlay(run);
                hideRunSources(run);
                activeParents.add(run.parent);
                safePerf.count('spriteText2.run.overlay.render');
                if (telemetry && typeof telemetry.logDraw === 'function') {
                    telemetry.logDraw('sprite_text_redraw', sanitizeVisibleText(run.translatedText), run.bounds.x1, run.bounds.y1, {
                        mode: 'sprite-run',
                        source,
                        glyphs: run.group ? run.group.length : 0,
                    });
                }
                if (hasTextTracker()) {
                    updateRunLiveRecord(run);
                    if (run._trTrackerVisible !== false) {
                        textTracker.draw(run.recordId, 'overlay', {
                            mode: 'sprite-run',
                            source,
                            glyphs: run.group ? run.group.length : 0,
                            translationDrawn: run.translatedText || '',
                        });
                    }
                }
            } catch (error) {
                logger.warn('[sprite-text/run-overlay-error]', error);
                removeParentRun(run, 'render-error');
            }
        };

        const syncParentRun = (run) => {
            if (!run || run.stale || !run.overlaySprite || !run.parent || run.parent._destroyed) return false;
            if (!run.group || !run.group.every((item) => item.sprite && isChildInParent(item.sprite, run.parent) && !item.sprite._destroyed)) {
                removeParentRun(run, 'source-gone');
                return false;
            }
            const refreshed = run.group.map((item) => createGlyphCandidate(item.spriteState, item.entry)).filter(Boolean);
            if (refreshed.length !== run.group.length) {
                removeParentRun(run, 'candidate-gone');
                return false;
            }
            run.group = refreshed;
            run.bounds = refreshed.reduce((acc, item) => ({
                x1: Math.min(acc.x1, item.x),
                y1: Math.min(acc.y1, item.y),
                x2: Math.max(acc.x2, item.x + item.width),
                y2: Math.max(acc.y2, item.y + item.height),
            }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
            if (!isValidRect(run.bounds)) {
                removeParentRun(run, 'layout-invalid');
                return false;
            }
            const outline = run.drawState && Number.isFinite(Number(run.drawState.outlineWidth))
                ? Math.max(2, Number(run.drawState.outlineWidth) + 2)
                : 3;
            try {
                run.overlaySprite.x = Math.floor(run.bounds.x1 - outline);
                run.overlaySprite.y = Math.floor(run.bounds.y1);
                const reference = refreshed[0] ? refreshed[0].sprite : null;
                if (reference) run.overlaySprite.visible = reference.visible !== false;
                const renderable = shouldRenderParentRunOverlay(run);
                run.overlaySprite.renderable = renderable;
                if (renderable) updateRunLiveRecord(run);
                else hideRunLiveRecord(run, 'sprite-run-invisible');
            } catch (_) {}
            return true;
        };

        const processParentGlyphRuns = (parent) => {
            if (!parent || parent._destroyed) return;
            const candidates = collectGlyphCandidates(parent);
            const groups = buildGlyphGroups(candidates);
            const runMap = getParentRunMap(parent);
            if (!runMap) return;
            const nextKeys = new Set();
            groups.forEach((group) => {
                const run = createOrUpdateParentRun(parent, group, runMap);
                if (!run) return;
                nextKeys.add(run.key);
                updateRunLiveRecord(run);
                activateParentRun(run);
                if (run.status === 'completed' && run.translatedText) {
                    renderParentRunOverlay(run, 'frame');
                }
            });
            Array.from(runMap.entries()).forEach(([key, run]) => {
                if (!nextKeys.has(key)) {
                    removeParentRun(run, 'not-seen');
                    runMap.delete(key);
                }
            });
        };

        const sweepTrackedSpriteTextVisibility = () => {
            Array.from(trackedSpriteStates).forEach((spriteState) => {
                if (!spriteState || !spriteState.sprite || spriteState.sprite._destroyed) {
                    trackedSpriteStates.delete(spriteState);
                    return;
                }
                const entries = spriteState.entries && typeof spriteState.entries.values === 'function'
                    ? Array.from(spriteState.entries.values()).filter((entry) => entry && !entry.stale)
                    : [];
                if (!entries.length) {
                    trackedSpriteStates.delete(spriteState);
                    return;
                }
                entries.forEach((entry) => {
                    if (isSpriteEntryScreenVisible(entry)) updateEntryLiveRecord(entry);
                    else hideEntryLiveRecord(entry, 'sprite-text-invisible');
                });
            });
            Array.from(trackedParentRuns).forEach((run) => {
                if (!run || run.stale) {
                    trackedParentRuns.delete(run);
                    return;
                }
                if (isParentRunScreenVisible(run)) updateRunLiveRecord(run);
                else hideRunLiveRecord(run, 'sprite-run-invisible');
            });
        };

        const flushFrame = (reason = 'frame') => {
            if (flushing) return;
            flushing = true;
            const start = safePerf.isEnabled() ? safePerf.now() : 0;
            try {
                sweepTrackedSpriteTextVisibility();
                Array.from(activeSprites).forEach((sprite) => {
                    const state = spriteStates.get(sprite);
                    if (!syncSpriteOverlay(state)) activeSprites.delete(sprite);
                });
                Array.from(activeParents).forEach((parent) => {
                    const runMap = parentRunStates.get(parent);
                    if (!runMap || !runMap.runs) {
                        activeParents.delete(parent);
                        return;
                    }
                    let anyAlive = false;
                    runMap.runs.forEach((run) => {
                        if (syncParentRun(run)) anyAlive = true;
                    });
                    if (!anyAlive) activeParents.delete(parent);
                });

                const sprites = Array.from(dirtySprites);
                dirtySprites.clear();
                sprites.forEach((sprite) => processSpriteSurface(sprite, reason));
                sprites.forEach((sprite) => {
                    try {
                        if (sprite && sprite.parent) dirtyParents.add(sprite.parent);
                    } catch (_) {}
                });

                const parents = Array.from(dirtyParents);
                dirtyParents.clear();
                parents.forEach(processParentGlyphRuns);
                try {
                    if (typeof globalScope.LiveTranslatorFlushBitmapFallback === 'function') {
                        globalScope.LiveTranslatorFlushBitmapFallback('after-sprite-text');
                    }
                } catch (_) {}
                safePerf.count('spriteText2.frame.flush');
                safePerf.count('spriteText2.frame.sprites', sprites.length);
                safePerf.count('spriteText2.frame.parents', parents.length);
            } catch (error) {
                logger.warn('[sprite-text/frame-error]', error);
            } finally {
                flushing = false;
                if (start) safePerf.time('spriteText2.frame.ms', safePerf.now() - start);
            }
        };

        const findPropertyDescriptor = (proto, prop) => {
            let cursor = proto;
            while (cursor && cursor !== Object.prototype) {
                const descriptor = Object.getOwnPropertyDescriptor(cursor, prop);
                if (descriptor) return { owner: cursor, descriptor };
                cursor = Object.getPrototypeOf(cursor);
            }
            return null;
        };

        const installSpriteBitmapObserver = () => {
            const found = findPropertyDescriptor(Sprite.prototype, 'bitmap');
            if (!found || !found.descriptor || typeof found.descriptor.set !== 'function') return false;
            if (found.descriptor.set.__trSpriteTextBitmapObserver === TOKEN) return true;
            const originalGet = typeof found.descriptor.get === 'function'
                ? found.descriptor.get
                : function() { return this._bitmap; };
            const originalSet = found.descriptor.set;
            const wrappedSet = function(value) {
                let oldBitmap = null;
                try { oldBitmap = originalGet.call(this); } catch (_) { oldBitmap = this ? this._bitmap : null; }
                const result = originalSet.call(this, value);
                let newBitmap = null;
                try { newBitmap = originalGet.call(this); } catch (_) { newBitmap = value; }
                if (oldBitmap !== newBitmap) {
                    detachBitmapOwner(this, oldBitmap);
                    attachBitmapOwner(this, newBitmap);
                    const spriteState = ensureSpriteState(this);
                    if (spriteState) {
                        spriteState.bitmap = newBitmap;
                        removeSpriteOverlay(spriteState, 'bitmap-replaced');
                    }
                    markSpriteDirty(this, 'bitmap-set');
                }
                return result;
            };
            wrappedSet.__trSpriteTextBitmapObserver = TOKEN;
            Object.defineProperty(found.owner, 'bitmap', {
                configurable: true,
                enumerable: found.descriptor.enumerable,
                get: originalGet,
                set: wrappedSet,
            });
            diag('[sprite-text/hook] Wrapped Sprite.bitmap');
            return true;
        };

        const observeChildAdded = (parent, child) => {
            if (!parent || !child || child._trSpriteTextObserverBypass) return;
            try {
                if (child.bitmap) attachBitmapOwner(child, child.bitmap);
            } catch (_) {}
            markParentDirty(parent, 'addChild');
            markSpriteDirty(child, 'addChild');
        };

        const visitDisplayTree = (node, visitor) => {
            if (!node || typeof visitor !== 'function') return;
            visitor(node);
            const children = Array.isArray(node.children) ? node.children.slice() : [];
            children.forEach((child) => visitDisplayTree(child, visitor));
        };

        const observeChildRemoved = (parent, child) => {
            if (!parent || !child || child._trSpriteTextObserverBypass) return;
            visitDisplayTree(child, (removedNode) => {
                const childState = spriteStates.get(removedNode);
                if (childState) {
                    Array.from(childState.entries.values()).forEach((entry) => staleEntry(entry, 'removed'));
                    childState.entries.clear();
                    childState.singleGlyphCandidate = null;
                    removeSpriteOverlay(childState, 'removed');
                }
                try {
                    if (removedNode && removedNode.bitmap) detachBitmapOwner(removedNode, removedNode.bitmap);
                } catch (_) {}
                try {
                    const runMapState = parentRunStates.get(removedNode);
                    if (runMapState && runMapState.runs) {
                        Array.from(runMapState.runs.values()).forEach((run) => removeParentRun(run, 'source-removed'));
                    }
                } catch (_) {}
                markSpriteDirty(removedNode, 'removeChild');
            });
            markParentDirty(parent, 'removeChild');
            try {
                const runId = child._trSpriteTextGroupedRunId || child._trSpriteTextRunHiddenBy;
                if (runId) {
                    const runMapState = parentRunStates.get(parent);
                    const runs = runMapState && runMapState.runs ? Array.from(runMapState.runs.values()) : [];
                    runs.forEach((run) => {
                        if (run && run.id === runId) removeParentRun(run, 'source-removed');
                    });
                }
            } catch (_) {}
        };

        const installChildObserverOn = (target, label) => {
            if (!target) return false;
            let installed = false;
            if (typeof target.addChild === 'function' && target.addChild.__trSpriteTextChildObserver !== CHILD_TOKEN) {
                const original = target.addChild.__trOriginal || target.addChild;
                const wrapped = function(...children) {
                    const result = original.apply(this, children);
                    try { children.forEach((child) => observeChildAdded(this, child)); } catch (_) {}
                    return result;
                };
                wrapped.__trSpriteTextChildObserver = CHILD_TOKEN;
                wrapped.__trOriginal = original;
                target.addChild = wrapped;
                installed = true;
            }
            if (typeof target.addChildAt === 'function' && target.addChildAt.__trSpriteTextChildObserver !== CHILD_TOKEN) {
                const original = target.addChildAt.__trOriginal || target.addChildAt;
                const wrapped = function(child, index) {
                    const result = original.apply(this, arguments);
                    try { observeChildAdded(this, child); } catch (_) {}
                    return result;
                };
                wrapped.__trSpriteTextChildObserver = CHILD_TOKEN;
                wrapped.__trOriginal = original;
                target.addChildAt = wrapped;
                installed = true;
            }
            if (typeof target.removeChild === 'function' && target.removeChild.__trSpriteTextChildObserver !== CHILD_TOKEN) {
                const original = target.removeChild.__trOriginal || target.removeChild;
                const wrapped = function(...children) {
                    const result = original.apply(this, children);
                    try { children.forEach((child) => observeChildRemoved(this, child)); } catch (_) {}
                    return result;
                };
                wrapped.__trSpriteTextChildObserver = CHILD_TOKEN;
                wrapped.__trOriginal = original;
                target.removeChild = wrapped;
                installed = true;
            }
            if (typeof target.removeChildAt === 'function' && target.removeChildAt.__trSpriteTextChildObserver !== CHILD_TOKEN) {
                const original = target.removeChildAt.__trOriginal || target.removeChildAt;
                const wrapped = function(index) {
                    let child = null;
                    try {
                        if (this.children && this.children[index]) child = this.children[index];
                    } catch (_) {}
                    const result = original.apply(this, arguments);
                    try { observeChildRemoved(this, child || result); } catch (_) {}
                    return result;
                };
                wrapped.__trSpriteTextChildObserver = CHILD_TOKEN;
                wrapped.__trOriginal = original;
                target.removeChildAt = wrapped;
                installed = true;
            }
            if (typeof target.removeChildren === 'function' && target.removeChildren.__trSpriteTextChildObserver !== CHILD_TOKEN) {
                const original = target.removeChildren.__trOriginal || target.removeChildren;
                const wrapped = function(...args) {
                    let children = [];
                    try {
                        const begin = Number.isFinite(Number(args[0])) ? Number(args[0]) : 0;
                        const end = Number.isFinite(Number(args[1])) ? Number(args[1]) : (this.children ? this.children.length : 0);
                        children = Array.isArray(this.children) ? this.children.slice(begin, end) : [];
                    } catch (_) {
                        children = [];
                    }
                    const result = original.apply(this, args);
                    try {
                        const removed = Array.isArray(result) && result.length ? result : children;
                        removed.forEach((child) => observeChildRemoved(this, child));
                        markParentDirty(this, 'removeChildren');
                    } catch (_) {}
                    return result;
                };
                wrapped.__trSpriteTextChildObserver = CHILD_TOKEN;
                wrapped.__trOriginal = original;
                target.removeChildren = wrapped;
                installed = true;
            }
            if (installed) diag(`[sprite-text/hook] Wrapped child observer on ${label}`);
            return installed;
        };

        const installChildObservers = () => {
            const targets = [];
            try {
                if (typeof PIXI !== 'undefined' && PIXI && PIXI.Container && PIXI.Container.prototype) {
                    targets.push({ target: PIXI.Container.prototype, label: 'PIXI.Container' });
                }
            } catch (_) {}
            try {
                if (typeof PIXI !== 'undefined' && PIXI && PIXI.DisplayObjectContainer && PIXI.DisplayObjectContainer.prototype) {
                    targets.push({ target: PIXI.DisplayObjectContainer.prototype, label: 'PIXI.DisplayObjectContainer' });
                }
            } catch (_) {}
            try {
                if (Sprite && Sprite.prototype && Object.prototype.hasOwnProperty.call(Sprite.prototype, 'addChild')) {
                    targets.push({ target: Sprite.prototype, label: 'Sprite' });
                }
            } catch (_) {}
            const seen = [];
            let installedAny = false;
            targets.forEach((item) => {
                if (!item || !item.target || seen.indexOf(item.target) >= 0) return;
                seen.push(item.target);
                installedAny = installChildObserverOn(item.target, item.label) || installedAny;
            });
            return installedAny;
        };

        const installBitmapMutationHook = (methodName) => {
            const current = Bitmap.prototype[methodName];
            if (typeof current !== 'function') return false;
            if (current.__trSpriteTextMutationWrapper === MUTATION_TOKEN) return true;
            const original = current.__trOriginal || current;
            const wrapped = function(...args) {
                const result = original.apply(this, args);
                try { recordBitmapMutation(this, methodName, args); } catch (error) {
                    logger.warn('[sprite-text/mutation-error]', error);
                }
                return result;
            };
            wrapped.__trSpriteTextMutationWrapper = MUTATION_TOKEN;
            wrapped.__trOriginal = original;
            Bitmap.prototype[methodName] = wrapped;
            return true;
        };

        const installBitmapMutationHooks = () => {
            try {
                const observer = globalScope.LiveTranslatorBitmapMutationObserver;
                if (observer && typeof observer.subscribe === 'function') {
                    observer.subscribe((bitmap, methodName, args) => {
                        try { recordBitmapMutation(bitmap, methodName, args); } catch (error) {
                            logger.warn('[sprite-text/mutation-error]', error);
                        }
                    });
                    diag('[sprite-text/hook] Subscribed to shared Bitmap mutation observer');
                    return;
                }
            } catch (_) {}
            [
                'clear',
                'clearRect',
                'resize',
                'fillRect',
                'fillAll',
                'gradientFillRect',
                'strokeRect',
                'drawCircle',
                'blt',
                'bltImage',
                'adjustTone',
                'rotateHue',
                'blur',
                'destroy',
            ].forEach(installBitmapMutationHook);
            diag('[sprite-text/hook] Bitmap mutation observers installed');
        };

        const installFrameHook = (target, methodName, label, flushBefore) => {
            if (!target || typeof target[methodName] !== 'function') return false;
            if (target[methodName].__trSpriteTextFrameHook === FRAME_TOKEN) return true;
            const original = target[methodName].__trOriginal || target[methodName];
            const wrapped = function(...args) {
                if (flushBefore) flushFrame(label);
                const result = original.apply(this, args);
                if (!flushBefore) flushFrame(label);
                return result;
            };
            wrapped.__trSpriteTextFrameHook = FRAME_TOKEN;
            wrapped.__trOriginal = original;
            target[methodName] = wrapped;
            diag(`[sprite-text/hook] Wrapped ${label}`);
            return true;
        };

        const installFrameHooks = () => {
            let installedAny = false;
            try {
                if (typeof SceneManager !== 'undefined' && SceneManager) {
                    installedAny = installFrameHook(SceneManager, 'updateScene', 'SceneManager.updateScene', false) || installedAny;
                    installedAny = installFrameHook(SceneManager, 'renderScene', 'SceneManager.renderScene', true) || installedAny;
                }
            } catch (_) {}
            try {
                if (typeof Graphics !== 'undefined' && Graphics) {
                    installedAny = installFrameHook(Graphics, 'render', 'Graphics.render', true) || installedAny;
                }
            } catch (_) {}
            return installedAny;
        };

        const api = {
            __token: TOKEN,
            recordBitmapDrawText,
            recordBitmapMutation,
            isBitmapOwned,
            markSpriteDirty,
            flushFrame,
            hasFrameHook: false,
        };

        globalScope.LiveTranslatorSpriteTextHook = api;
        installSpriteBitmapObserver();
        installChildObservers();
        installBitmapMutationHooks();
        const frameInstalled = installFrameHooks();
        api.hasFrameHook = !!frameInstalled;
        diag('[sprite-text/init] Sprite text hook installed.');

        return {
            status: frameInstalled ? 'installed' : 'installed',
            reason: frameInstalled
                ? 'Sprite text hook installed with frame-boundary flushing.'
                : 'Sprite text hook installed; frame hook target was unavailable at install time.',
        };
    }

    defineRuntimeModule('hooks.spriteText', {
        install: installSpriteTextHook,
    });
})();
