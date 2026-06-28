// Shared helpers for surface-ledger generated ids.
//
// Replay composition needs stable ordering across modules, so the parsing of
// ledger id ordinals lives here instead of in individual replay consumers.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.surfaceLedgerIds',
        factory() {
            function parseCopyEdgeOrder(edgeId) {
                return parseSurfaceLedgerOrdinal(edgeId, 'bme');
            }

            function parseReplayOpOrder(replayOpId) {
                return parseSurfaceLedgerOrdinal(replayOpId, 'bmr');
            }

            function compareOrderKeys(left, right) {
                const leftParts = normalizeOrderKey(left);
                const rightParts = normalizeOrderKey(right);
                const size = Math.max(leftParts.length, rightParts.length);
                for (let index = 0; index < size; index += 1) {
                    const delta = nonNegativeNumber(leftParts[index], 0) - nonNegativeNumber(rightParts[index], 0);
                    if (delta !== 0) return delta;
                }
                return 0;
            }

            function parseSurfaceLedgerOrdinal(id, prefix) {
                const escapedPrefix = stringify(prefix || '').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
                if (!escapedPrefix) return Number.MAX_SAFE_INTEGER;
                const match = stringify(id || '').match(new RegExp(`^${escapedPrefix}-([0-9a-z]+)$`, 'iu'));
                if (!match) return Number.MAX_SAFE_INTEGER;
                const value = parseInt(match[1], 36);
                return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
            }

            function normalizeOrderKey(value) {
                if (Array.isArray(value)) return value;
                return stringify(value || '').split('.');
            }

            function nonNegativeNumber(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                parseCopyEdgeOrder,
                parseReplayOpOrder,
                compareOrderKeys,
            });
        },
    });
})();
