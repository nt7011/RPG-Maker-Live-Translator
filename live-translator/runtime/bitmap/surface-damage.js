// Shared bitmap surface damage timeline.
//
// Copy replay must distinguish pixels that still existed when the engine copied
// a source from pixels overwritten by later native work. This module turns
// ledger draw units and bitmap mutations into one ordered stream of pixel damage
// events so every consumer applies the same proof.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.surfaceDamage',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
        },
        factory({ rectGeometry }) {
            const cloneRect = rectGeometry.cloneRect;
            const rectsOverlap = rectGeometry.rectsOverlap;

            function collectSurfaceDamage(surface, options = {}) {
                const source = surface && typeof surface === 'object' ? surface : {};
                const sinceRevision = nonNegativeInteger(options.sinceRevision, NaN);
                if (!Number.isFinite(sinceRevision)) {
                    return [createDamageEvent({
                        kind: 'unknown',
                        reason: 'unknown-baseline',
                        revision: NaN,
                        unknown: true,
                    })];
                }

                const untilRevision = normalizeOptionalRevision(options.untilRevision);
                const protectedRect = cloneRect(options.protectedRect || options.rect || null);
                const events = [];
                collectDrawDamage(source, {
                    sinceRevision,
                    untilRevision,
                    protectedRect,
                    ignoredDrawUnitId: stringify(options.ignoredDrawUnitId || ''),
                }, events);
                collectMutationDamage(source, {
                    sinceRevision,
                    untilRevision,
                    protectedRect,
                    ignoredMutationId: stringify(options.ignoredMutationId || ''),
                }, events);
                return events.sort(compareSurfaceDamageEvents);
            }

            function findSurfaceDamage(surface, options = {}) {
                const events = collectSurfaceDamage(surface, options);
                return events.length ? events[0] : null;
            }

            function collectDrawDamage(surface, options, events) {
                const units = Array.isArray(surface.drawUnits) ? surface.drawUnits : [];
                units.forEach((unit) => {
                    const revision = nonNegativeInteger(unit && unit.revision, NaN);
                    if (!revisionInRange(revision, options.sinceRevision, options.untilRevision)) return;
                    const drawUnitId = stringify(unit && unit.unitId || '');
                    if (options.ignoredDrawUnitId && drawUnitId === options.ignoredDrawUnitId) return;
                    const rect = cloneRect(unit && unit.geometry && unit.geometry.rect || null);
                    if (!surfaceDamageTouchesRect(rect, options.protectedRect)) return;
                    events.push(createDamageEvent({
                        kind: 'draw',
                        reason: rect ? 'draw-overlap' : 'draw-unknown',
                        revision,
                        rect,
                        unknown: !rect,
                        drawUnitId,
                        textRunId: stringify(unit && unit.textRunId || ''),
                        methodName: stringify(unit && unit.methodName || 'drawText') || 'drawText',
                    }));
                });
            }

            function collectMutationDamage(surface, options, events) {
                const mutations = Array.isArray(surface.mutationHistory) ? surface.mutationHistory : [];
                mutations.forEach((mutation) => {
                    const revision = nonNegativeInteger(mutation && mutation.afterRevision, NaN);
                    if (!revisionInRange(revision, options.sinceRevision, options.untilRevision)) return;
                    const mutationId = stringify(mutation && mutation.mutationId || '');
                    if (options.ignoredMutationId && mutationId === options.ignoredMutationId) return;
                    const full = mutation && mutation.full === true;
                    const rect = cloneRect(mutation && (mutation.targetRectAfterCopy || mutation.targetRect) || null);
                    if (!full && !surfaceDamageTouchesRect(rect, options.protectedRect)) return;
                    events.push(createDamageEvent({
                        kind: 'mutation',
                        reason: full ? 'mutation-full' : (rect ? 'mutation-overlap' : 'mutation-unknown'),
                        revision,
                        rect,
                        full,
                        unknown: !full && !rect,
                        mutationId,
                        methodName: stringify(mutation && mutation.methodName || ''),
                    }));
                });
            }

            function createDamageEvent(input = {}) {
                return {
                    kind: stringify(input.kind || ''),
                    reason: stringify(input.reason || ''),
                    revision: normalizeOptionalRevision(input.revision),
                    rect: cloneRect(input.rect || null),
                    full: input.full === true,
                    unknown: input.unknown === true,
                    mutationId: stringify(input.mutationId || ''),
                    drawUnitId: stringify(input.drawUnitId || ''),
                    textRunId: stringify(input.textRunId || ''),
                    methodName: stringify(input.methodName || ''),
                };
            }

            function compareSurfaceDamageEvents(left, right) {
                const revisionDelta = nonNegativeInteger(left && left.revision, Number.MAX_SAFE_INTEGER)
                    - nonNegativeInteger(right && right.revision, Number.MAX_SAFE_INTEGER);
                if (revisionDelta !== 0) return revisionDelta;
                const kindDelta = damageKindOrder(left && left.kind) - damageKindOrder(right && right.kind);
                if (kindDelta !== 0) return kindDelta;
                return damageEventId(left).localeCompare(damageEventId(right));
            }

            function revisionInRange(revision, sinceRevision, untilRevision) {
                if (!Number.isFinite(revision) || revision <= sinceRevision) return false;
                return untilRevision === undefined || revision <= untilRevision;
            }

            function surfaceDamageTouchesRect(damageRect, protectedRect) {
                const protectedArea = cloneRect(protectedRect);
                if (!protectedArea) return true;
                const damageArea = cloneRect(damageRect);
                if (!damageArea) return true;
                return rectsOverlap(damageArea, protectedArea);
            }

            function damageKindOrder(kind) {
                const value = stringify(kind || '');
                if (value === 'draw') return 1;
                if (value === 'mutation') return 2;
                return 0;
            }

            function damageEventId(event) {
                return [
                    stringify(event && event.mutationId || ''),
                    stringify(event && event.drawUnitId || ''),
                    stringify(event && event.textRunId || ''),
                    stringify(event && event.methodName || ''),
                    stringify(event && event.reason || ''),
                ].join('|');
            }

            function normalizeOptionalRevision(value) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : undefined;
            }

            function nonNegativeInteger(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : fallback;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                collectSurfaceDamage,
                findSurfaceDamage,
                compareSurfaceDamageEvents,
            });
        },
    });
})();
