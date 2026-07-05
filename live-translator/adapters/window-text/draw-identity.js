// Window text adapter support: draw identity policy.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.drawIdentity',
        factory() {

    function createDrawIdentityController(context = {}) {
        const facades = context.facades || {};
        const textMetrics = facades.textMetrics || {};
        const createSlotKey = requireFunction(textMetrics.createSlotKey, 'textMetrics.createSlotKey');
        const createCanonicalSlotKey = typeof textMetrics.createCanonicalSlotKey === 'function'
            ? textMetrics.createCanonicalSlotKey
            : createSlotKey;
        const canonicalizeSlotKey = typeof textMetrics.canonicalizeSlotKey === 'function'
            ? textMetrics.canonicalizeSlotKey
            : (slotKey) => String(slotKey || '');
        const slotKeysReferToSameDraw = typeof textMetrics.slotKeysReferToSameDraw === 'function'
            ? textMetrics.slotKeysReferToSameDraw
            : (left, right) => strictSlotKey(left) === strictSlotKey(right);

        function createDrawSlotIdentity(type, x, y, params = null) {
            return {
                type: String(type || ''),
                x,
                y,
                params,
                slotKey: strictSlotKey(createSlotKey(type, x, y, params)),
                canonicalSlotKey: strictSlotKey(createCanonicalSlotKey(type, x, y, params)),
            };
        }

        function isExactDrawSlot(left, right) {
            const leftKey = strictSlotKey(left);
            const rightKey = strictSlotKey(right);
            return !!(leftKey && rightKey && leftKey === rightKey);
        }

        function isSameLogicalDrawSlot(left, right) {
            const leftKey = strictSlotKey(left);
            const rightKey = strictSlotKey(right);
            if (!leftKey || !rightKey) return false;
            if (leftKey === rightKey) return true;
            if (slotKeysReferToSameDraw(leftKey, rightKey)) return true;
            const leftCanonical = strictSlotKey(canonicalizeSlotKey(leftKey));
            const rightCanonical = strictSlotKey(canonicalizeSlotKey(rightKey));
            return !!(leftCanonical && rightCanonical && leftCanonical === rightCanonical);
        }

        function entryMatchesDrawSlot(entry, drawSlot, options = null) {
            const entrySlotKey = getEntrySlotKey(entry);
            const slot = normalizeDrawSlot(drawSlot);
            if (!entrySlotKey || !slot.slotKey) return false;
            if (isExactDrawSlot(entrySlotKey, slot.slotKey)) return true;
            if (options && options.replacementDraw === true) {
                if (isSameLogicalDrawSlot(entrySlotKey, slot.canonicalSlotKey || slot.slotKey)) return true;
                return isSameReplacementAnchor(entry, slot);
            }
            return false;
        }

        function entriesShareLogicalDrawSlot(leftEntry, rightEntry) {
            return isSameLogicalDrawSlot(getEntrySlotKey(leftEntry), getEntrySlotKey(rightEntry));
        }

        function getEntrySlotKey(entry) {
            if (!entry) return '';
            return strictSlotKey(
                entry.slotKey
                || createSlotKey(
                    entry.type,
                    entry.position && entry.position.x,
                    entry.position && entry.position.y,
                    entry.originalParams
                )
            );
        }

        function normalizeDrawSlot(value) {
            if (!value || typeof value !== 'object') {
                return {
                    type: '',
                    x: undefined,
                    y: undefined,
                    params: null,
                    slotKey: strictSlotKey(value),
                    canonicalSlotKey: strictSlotKey(canonicalizeSlotKey(value)),
                };
            }
            return {
                type: String(value.type || ''),
                x: value.x,
                y: value.y,
                params: value.params || null,
                slotKey: strictSlotKey(value.slotKey),
                canonicalSlotKey: strictSlotKey(value.canonicalSlotKey || canonicalizeSlotKey(value.slotKey)),
            };
        }

        // Replacement is stronger than a mere slot lookup: a visible source draw
        // may recompute width, but it must keep method, anchor, and alignment.
        function isSameReplacementAnchor(entry, drawSlot) {
            if (!entry || !isWindowOriginEntry(entry) || !isWindowOriginParams(drawSlot.params)) return false;
            if (String(entry.type || '') !== String(drawSlot.type || '')) return false;
            if (!sameReplacementCoordinate(entry.position && entry.position.x, drawSlot.x)) return false;
            if (!sameReplacementCoordinate(entry.position && entry.position.y, drawSlot.y)) return false;
            return normalizeReplacementAlign(entry.originalParams) === normalizeReplacementAlign(drawSlot.params);
        }

        function isWindowOriginEntry(entry) {
            const origin = entry && entry.drawOrigin && typeof entry.drawOrigin === 'object'
                ? entry.drawOrigin
                : null;
            return !origin || !origin.type || origin.type === 'window';
        }

        function isWindowOriginParams(params) {
            const origin = params && params.drawOrigin && typeof params.drawOrigin === 'object'
                ? params.drawOrigin
                : null;
            return !origin || !origin.type || origin.type === 'window';
        }

        function sameReplacementCoordinate(left, right) {
            const leftNumber = Number(left);
            const rightNumber = Number(right);
            if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return strictSlotKey(left) === strictSlotKey(right);
            return Math.round(leftNumber * 1000) === Math.round(rightNumber * 1000);
        }

        function normalizeReplacementAlign(params) {
            const align = params && Object.prototype.hasOwnProperty.call(params, 'align')
                ? String(params.align || '').trim().toLowerCase()
                : '';
            return align || 'left';
        }

        function strictSlotKey(value) {
            return String(value || '');
        }

        return Object.freeze({
            createDrawSlotIdentity,
            entriesShareLogicalDrawSlot,
            entryMatchesDrawSlot,
            getEntrySlotKey,
            isExactDrawSlot,
            isSameLogicalDrawSlot,
        });
    }

    function requireFunction(value, label) {
        if (typeof value !== 'function') {
            throw new Error(`[WindowTextDrawIdentity] Missing ${label}.`);
        }
        return value;
    }

    return Object.freeze({ create: createDrawIdentityController });
        },
    });
})();
