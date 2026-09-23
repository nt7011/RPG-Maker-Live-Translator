import { repaintCoversTargets } from './bitmap-pixel-geometry.js';
import type { Effect, Image, PixelBounds, PixelDrawing, PixelTextCandidate, PixelProofFailure, TraceCheck, FailureTrace, SelectedEffect, } from './bitmap-pixel-types.js';
export function createPixelProofs(drawing: PixelDrawing, programs: Readonly<Record<'imageProgram' | 'reduction' | 'compare' | 'regionEvidence' | 'vacant' | 'reverse', WebGLProgram>>, options: {
    readonly proofDiagnostics?: boolean | undefined;
}) {
    const { gl, allocate, release, target, texture, uniform, copy, flag } = drawing;
    const { imageProgram, reduction, compare, regionEvidence, vacant, reverse } = programs;
    function intersectFlag(input: Image, output: Image): void {
        target(output);
        gl.useProgram(imageProgram);
        texture(imageProgram, 'inputImage', input, 0);
        gl.uniform2i(uniform(imageProgram, 'drawOrigin'), 0, 0);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.MIN);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.BLEND);
    }
    function traceReduction(input: Image, priorValid: Image, { trace, ...check }: TraceCheck, emptyReason: PixelProofFailure['reason'], mismatchReason: PixelProofFailure['reason']): void {
        const index = trace.checks.length + 1;
        trace.checks.push({ ...check, reason: emptyReason }, { ...check, reason: mismatchReason });
        target(trace.image);
        gl.useProgram(reduction);
        texture(reduction, 'inputImage', input, 0);
        texture(reduction, 'priorValid', priorValid, 1);
        gl.uniform1i(uniform(reduction, 'finalPass'), 2);
        gl.uniform1i(uniform(reduction, 'diagnosticIndex'), index);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function validateTiles(width: number, height: number, outputFlag: Image, render: () => void, diagnostic?: TraceCheck, emptyReason: PixelProofFailure['reason'] = 'text-effect-empty', mismatchReason: PixelProofFailure['reason'] = 'text-effect-mismatch'): void {
        let current = allocate(Math.ceil(width / 8), Math.ceil(height / 8));
        try {
            target(current);
            render();
            while (current.width > 8 || current.height > 8) {
                const next = allocate(Math.max(1, Math.ceil(current.width / 8)), Math.max(1, Math.ceil(current.height / 8)));
                try {
                    target(next);
                    gl.useProgram(reduction);
                    texture(reduction, 'inputImage', current, 0);
                    if (options.proofDiagnostics)
                        texture(reduction, 'priorValid', current, 1);
                    gl.uniform1i(uniform(reduction, 'finalPass'), 0);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                }
                catch (error) {
                    release(next);
                    throw error;
                }
                release(current);
                current = next;
            }
            if (diagnostic !== undefined)
                traceReduction(current, outputFlag, diagnostic, emptyReason, mismatchReason);
            target(outputFlag);
            gl.useProgram(reduction);
            texture(reduction, 'inputImage', current, 0);
            if (options.proofDiagnostics)
                texture(reduction, 'priorValid', current, 1);
            gl.uniform1i(uniform(reduction, 'finalPass'), 1);
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.MIN);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.disable(gl.BLEND);
        }
        finally {
            release(current);
        }
    }
    function rejectPredicate(valid: Image, diagnostic: TraceCheck | undefined, reason: PixelProofFailure['reason']): void {
        const rejected = flag(0);
        try {
            if (diagnostic !== undefined)
                traceReduction(rejected, valid, diagnostic, reason, reason);
            copy(rejected, valid);
        }
        finally {
            release(rejected);
        }
    }
    function validateEffect(effect: Effect, candidate: Image, outputFlag: Image, comparison: 0 | 1 | 2 = 0, diagnostic?: TraceCheck): void {
        validateTiles(effect.damage.width, effect.damage.height, outputFlag, () => {
            gl.useProgram(compare);
            texture(compare, 'beforeImage', effect.before, 0);
            texture(compare, 'afterImage', effect.after, 1);
            texture(compare, 'candidateImage', candidate, 2);
            gl.uniform1i(uniform(compare, 'compareAll'), comparison);
            gl.uniform2i(uniform(compare, 'origin'), effect.damage.x, effect.damage.y);
            gl.uniform2i(uniform(compare, 'damageExtent'), effect.damage.width, effect.damage.height);
            gl.uniform2i(uniform(compare, 'evidenceOffset'), effect.damage.x - effect.evidence.x, effect.damage.y - effect.evidence.y);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }, diagnostic);
    }
    function validateRegionEvidence(effect: Effect, candidate: Image, area: PixelBounds, valid: Image, diagnostic?: TraceCheck): void {
        const reason = 'background-mismatch';
        validateTiles(area.width, area.height, valid, () => {
            gl.useProgram(regionEvidence);
            texture(regionEvidence, 'afterImage', effect.after, 1);
            texture(regionEvidence, 'candidateImage', candidate, 2);
            gl.uniform2i(uniform(regionEvidence, 'origin'), area.x, area.y);
            gl.uniform2i(uniform(regionEvidence, 'extent'), area.width, area.height);
            gl.uniform2i(uniform(regionEvidence, 'effectOrigin'), effect.evidence.x, effect.evidence.y);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }, diagnostic, reason, reason);
    }
    function validateVacantArea(candidate: Image, permission: Image, area: PixelBounds, outputFlag: Image, diagnostic?: TraceCheck): void {
        validateTiles(area.width, area.height, outputFlag, () => {
            gl.useProgram(vacant);
            texture(vacant, 'candidateImage', candidate, 0);
            texture(vacant, 'permissionImage', permission, 1);
            gl.uniform1i(uniform(vacant, 'allowBackground'), 1);
            gl.uniform2i(uniform(vacant, 'origin'), area.x, area.y);
            gl.uniform2i(uniform(vacant, 'extent'), area.width, area.height);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }, diagnostic, 'expansion-occupied', 'expansion-occupied');
    }
    function validateTargetRegions(candidate: Image, group: PixelTextCandidate, regions: readonly PixelBounds[], valid: Image, trace: FailureTrace | null, memberIndex: number, groupIndex: number): boolean {
        if (group.targetRegions.length === 0)
            return true;
        const targets: PixelBounds[] = [];
        for (const area of group.targetRegions) {
            if (!Number.isFinite(area.x) ||
                !Number.isFinite(area.y) ||
                !Number.isFinite(area.width) ||
                !Number.isFinite(area.height) ||
                area.width <= 0 ||
                area.height <= 0)
                return false;
            const x = Math.floor(area.x), y = Math.floor(area.y);
            const right = Math.ceil(area.x + area.width), bottom = Math.ceil(area.y + area.height);
            if (x < 0 || y < 0 || right <= x || bottom <= y || right > candidate.width || bottom > candidate.height)
                return false;
            targets.push({ x, y, width: right - x, height: bottom - y });
        }
        if (repaintCoversTargets(targets, regions))
            return true;
        const permission = allocate(candidate.width, candidate.height);
        try {
            target(permission);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.enable(gl.SCISSOR_TEST);
            try {
                gl.clearColor(1, 1, 1, 1);
                for (const area of regions) {
                    gl.scissor(area.x, area.y, area.width, area.height);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                }
            }
            finally {
                gl.disable(gl.SCISSOR_TEST);
            }
            for (const area of targets)
                validateVacantArea(candidate, permission, area, valid, trace === null
                    ? undefined
                    : { trace, memberIndex, groupIndex, effectSequence: null, stage: 'source' });
            return true;
        }
        finally {
            release(permission);
        }
    }
    function reverseEffects(selected: SelectedEffect[], candidate: Image, valid: Image, trace: FailureTrace | null, memberIndex: number, repaint?: (entry: SelectedEffect[][number]) => readonly {
        regions: readonly PixelBounds[];
        valid: Image;
        trace: FailureTrace | null;
    }[]): void {
        for (let index = selected.length - 1; index >= 0; index--) {
            const entry = selected[index];
            if (entry === undefined)
                continue;
            const { effect, groupIndex } = entry;
            if (!entry.complete)
                rejectPredicate(valid, trace === null
                    ? undefined
                    : {
                        trace,
                        memberIndex,
                        groupIndex,
                        effectSequence: effect.sequence,
                        stage: 'source',
                    }, 'repaint-evidence-unavailable');
            validateEffect(effect, candidate, valid, 0, trace === null
                ? undefined
                : {
                    trace,
                    memberIndex,
                    groupIndex,
                    effectSequence: effect.sequence,
                    stage: 'source',
                });
            for (const check of repaint?.(entry) ?? [{ regions: entry.regions, valid, trace }])
                for (const area of check.regions)
                    validateRegionEvidence(effect, candidate, area, check.valid, check.trace === null
                        ? undefined
                        : {
                            trace: check.trace,
                            memberIndex,
                            groupIndex,
                            effectSequence: effect.sequence,
                            stage: 'source',
                        });
            const patch = allocate(effect.damage.width, effect.damage.height);
            try {
                target(patch);
                gl.useProgram(reverse);
                texture(reverse, 'beforeImage', effect.before, 0);
                texture(reverse, 'afterImage', effect.after, 1);
                texture(reverse, 'candidateImage', candidate, 2);
                gl.uniform2i(uniform(reverse, 'origin'), effect.damage.x, effect.damage.y);
                gl.uniform2i(uniform(reverse, 'evidenceOffset'), effect.damage.x - effect.evidence.x, effect.damage.y - effect.evidence.y);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                copy(patch, candidate, effect.damage.x, effect.damage.y);
            }
            finally {
                release(patch);
            }
        }
    }
    return { intersectFlag, validateTiles, rejectPredicate, validateEffect, validateTargetRegions, reverseEffects };
}
export type PixelProofOperations = ReturnType<typeof createPixelProofs>;
