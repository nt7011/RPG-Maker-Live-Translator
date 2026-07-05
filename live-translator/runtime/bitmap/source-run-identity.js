// Source run identity helpers.
//
// Bitmap copied-target recovery crosses adapter boundaries. Keep source-run
// slot matching exact by default, while allowing producers to publish explicit
// alias keys when two draw pipelines describe the same source run differently.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.sourceRunIdentity',
        factory() {

            function getSourceRunId(value) {
                return stringify(value && (
                    value.sourceRunId
                    || value.runId
                    || value.textRunId
                ) || '');
            }

            function collectIdentityAliases(values) {
                const aliases = [];
                addIdentityAlias(aliases, values);
                return aliases;
            }

            function collectSourceRunIds(value) {
                const ids = [];
                addIdentity(ids, value && value.sourceRunId);
                addIdentity(ids, value && value.runId);
                addIdentity(ids, value && value.textRunId);
                addIdentityList(ids, value && value.sourceRunIds);
                addIdentityList(ids, value && value.runIds);
                addIdentityList(ids, value && value.textRunIds);
                addIdentityList(ids, value && value.sourceRunAliases);
                return ids;
            }

            function collectSourceSlotKeys(value) {
                const keys = [];
                addIdentity(keys, value && value.sourceSlotKey);
                addIdentity(keys, value && value.slotKey);
                addIdentityList(keys, value && value.sourceSlotKeys);
                addIdentityList(keys, value && value.slotKeys);
                addIdentityList(keys, value && value.slotAliases);
                addIdentityList(keys, value && value.sourceSlotAliases);
                return keys;
            }

            function collectSourceSlotKeyAliases(values, options = {}) {
                const aliases = [];
                const canonicalizeSlotKey = options && typeof options.canonicalizeSlotKey === 'function'
                    ? options.canonicalizeSlotKey
                    : null;
                addSourceSlotAlias(aliases, values, canonicalizeSlotKey);
                return aliases;
            }

            function sourceRunIdentitiesMatch(candidate, lookup) {
                const candidateRunIds = collectSourceRunIds(candidate);
                const lookupRunIds = collectSourceRunIds(lookup);
                if (candidateRunIds.length && lookupRunIds.length) {
                    return identitiesIntersect(candidateRunIds, lookupRunIds);
                }
                return sourceSlotIdentitiesMatch(candidate, lookup);
            }

            function sourceSlotIdentitiesMatch(left, right) {
                const leftKeys = collectSourceSlotKeys(left);
                const rightKeys = collectSourceSlotKeys(right);
                if (!leftKeys.length || !rightKeys.length) return false;
                return identitiesIntersect(leftKeys, rightKeys);
            }

            function identitiesIntersect(left, right) {
                for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
                    if (right.indexOf(left[leftIndex]) >= 0) return true;
                }
                return false;
            }

            function addIdentityList(keys, values) {
                if (!Array.isArray(values)) return;
                values.forEach((value) => addIdentity(keys, value));
            }

            function addIdentityAlias(keys, value) {
                if (Array.isArray(value)) {
                    value.forEach((item) => addIdentityAlias(keys, item));
                    return;
                }
                addIdentity(keys, value);
            }

            function addSourceSlotAlias(keys, value, canonicalizeSlotKey) {
                if (Array.isArray(value)) {
                    value.forEach((item) => addSourceSlotAlias(keys, item, canonicalizeSlotKey));
                    return;
                }
                const text = stringify(value);
                if (!text) return;
                addIdentity(keys, text);
                if (canonicalizeSlotKey) addIdentity(keys, canonicalizeSlotKey(text));
            }

            function addIdentity(keys, value) {
                const text = stringify(value);
                if (text && keys.indexOf(text) < 0) keys.push(text);
            }

            function stringify(value) {
                return value === undefined || value === null ? '' : String(value);
            }

            return Object.freeze({
                collectIdentityAliases,
                collectSourceRunIds,
                collectSourceSlotKeyAliases,
                collectSourceSlotKeys,
                getSourceRunId,
                sourceRunIdentitiesMatch,
                sourceSlotIdentitiesMatch,
            });
        },
    });
})();
