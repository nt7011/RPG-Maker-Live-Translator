import type { Image, PixelBounds, PixelDrawing, PixelTextCandidate, PixelTextEvidence, PixelTextGroup, PixelProofFailure, FailureTrace, } from './bitmap-pixel-types.js';
import type { PixelCaptures } from './bitmap-pixel-captures.js';
import type { PixelProofOperations } from './bitmap-pixel-proofs.js';
import type { PixelDisplayOverlay } from './bitmap-pixel-display.js';
import { intersection, compactRegionStrips } from './bitmap-pixel-geometry.js';
import { vertex, selectionFragment, commitFragment, overlayFragment } from './bitmap-pixel-shaders.js';
export function createPixelRows(drawing: PixelDrawing, proof: PixelProofOperations, options: {
    readonly proofDiagnostics?: boolean | undefined;
    readonly getEffect: PixelCaptures['getEffect'];
    readonly sourceId: (source: HTMLCanvasElement) => object;
    readonly selectEffects: PixelCaptures['selectEffects'];
    readonly ownership: WebGLProgram;
    readonly collision: WebGLProgram;
    readonly reduction: WebGLProgram;
    readonly textCanvas: HTMLCanvasElement;
    readonly textContext: CanvasRenderingContext2D;
    readonly resizeWork: (canvas: HTMLCanvasElement, width: number, height: number) => void;
    readonly drawTextGroup: (context: CanvasRenderingContext2D, group: PixelTextCandidate) => void;
}) {
    const { gl, allocate, release, target, texture, uniform, program, upload, copy, flag } = drawing;
    const { reverseEffects, intersectFlag, validateTargetRegions, validateTiles, rejectPredicate } = proof;
    const { getEffect, sourceId, selectEffects, ownership, collision, reduction, textCanvas, textContext, resizeWork, drawTextGroup, } = options;
    let selection: WebGLProgram | undefined, commit: WebGLProgram | undefined, overlay: WebGLProgram | undefined;
    function prepareRows(source: HTMLCanvasElement, groups: readonly PixelTextGroup[], preserve: readonly PixelTextEvidence[], own: (image: Image) => Image, shared?: {
        valid: Image;
        trace: FailureTrace | null;
        memberIndex: number;
    }) {
        const selected = selectEffects(source, groups);
        if (selected === null)
            return null;
        const memberIndex = shared?.memberIndex ?? 0;
        const original = own(allocate(source.width, source.height));
        upload(original, source);
        const candidate = own(allocate(source.width, source.height));
        let background = original;
        const rows = groups.map((group, groupIndex) => ({
            group,
            groupIndex,
            effects: [] as NonNullable<ReturnType<typeof selectEffects>>,
            sequence: 0,
            valid: own(flag(1)),
            trace: shared?.trace ??
                (options.proofDiagnostics ? { image: own(flag(0)), checks: [] as PixelProofFailure[] } : null),
            choices: (group.fallback == null ? [group] : [group, group.fallback]).map((value, index) => ({
                candidate: value,
                valid: own(flag(1)),
                trace: options.proofDiagnostics && index === 0
                    ? { image: own(flag(0)), checks: [] as PixelProofFailure[] }
                    : null,
                regions: [] as PixelBounds[],
            })),
            key: [] as number[],
            ambiguous: false,
        }));
        for (const entry of selected) {
            const row = rows[entry.groupIndex];
            if (row === undefined)
                throw new Error('Missing source field.');
            row.effects.push(entry);
            row.sequence = entry.effect.sequence;
        }
        function repaint(entry: NonNullable<typeof selected>[number]) {
            const row = rows[entry.groupIndex];
            if (row === undefined)
                throw new Error('Missing source field.');
            return row.choices.map((choice) => {
                const regions: PixelBounds[] = [];
                for (const area of entry.regions)
                    for (const target of choice.candidate.targetRegions) {
                        const required = intersection(target, area);
                        if (required !== null)
                            regions.push(required);
                    }
                compactRegionStrips(regions);
                for (const region of regions)
                    choice.regions.push(region);
                return { regions, valid: choice.valid, trace: choice.trace };
            });
        }
        if (shared !== undefined) {
            copy(original, candidate);
            reverseEffects(selected, candidate, shared.valid, shared.trace, memberIndex, repaint);
            background = candidate;
        }
        for (const row of rows) {
            const bounds = row.group.sourceRegions.length > 0
                ? row.group.sourceRegions.map((region) => region.bounds)
                : row.effects.map((entry) => entry.effect.damage);
            const sorted = [...bounds].sort((a, b) => a.y - b.y || a.x - b.x || a.height - b.height || a.width - b.width);
            row.key = sorted.flatMap((area) => [area.y, area.x, area.height, area.width]);
            row.key.push(...row.group.draws.flatMap((draw) => [
                draw.layout.placement.y,
                draw.layout.placement.x,
                draw.layout.placement.lineHeight,
                draw.layout.placement.maxWidth,
            ]));
        }
        function compareKeys(a: (typeof rows)[number], b: (typeof rows)[number]): number {
            for (let i = 0; i < Math.min(a.key.length, b.key.length); i++) {
                const difference = (a.key[i] ?? 0) - (b.key[i] ?? 0);
                if (difference !== 0)
                    return difference;
            }
            return a.key.length - b.key.length;
        }
        const drawing = rows.filter((row) => row.group.draws.length > 0).sort(compareKeys);
        for (let i = 1; i < drawing.length; i++) {
            const before = drawing[i - 1], after = drawing[i];
            if (before !== undefined && after !== undefined && compareKeys(before, after) === 0)
                before.ambiguous = after.ambiguous = true;
        }
        const ordered = [
            ...rows.filter((row) => row.group.draws.length === 0).sort((a, b) => b.sequence - a.sequence),
            ...drawing,
        ];
        const surfaceBounds = { x: 0, y: 0, width: source.width, height: source.height };
        const soleField = groups.length === 1 &&
            preserve.every((field) => field.effects.length === 0 && field.sourceRegions.length === 0);
        const owners = drawing.length === 0 || soleField ? null : own(allocate(source.width, source.height));
        const raster = drawing.length === 0 ? null : own(allocate(source.width, source.height));
        function merge(before: Image, after: Image, area: PixelBounds, imageOrigin: PixelBounds, owner: number, mode: number, valid?: Image): void {
            if (owners === null)
                return;
            const patch = allocate(area.width, area.height);
            try {
                target(patch);
                gl.useProgram(ownership);
                texture(ownership, 'owners', owners, 0);
                texture(ownership, 'beforeImage', before, 1);
                texture(ownership, 'afterImage', after, 2);
                texture(ownership, 'validFlag', valid ?? owners, 3);
                gl.uniform1i(uniform(ownership, 'guarded'), valid === undefined ? 0 : 1);
                gl.uniform2i(uniform(ownership, 'origin'), area.x, area.y);
                gl.uniform2i(uniform(ownership, 'imageOrigin'), imageOrigin.x, imageOrigin.y);
                gl.uniform1i(uniform(ownership, 'mode'), mode);
                gl.uniform1i(uniform(ownership, 'owner'), owner);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                copy(patch, owners, area.x, area.y);
            }
            finally {
                release(patch);
            }
        }
        if (owners !== null) {
            target(owners);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            for (const [index, field] of [...groups, ...preserve].entries()) {
                for (const handle of field.effects) {
                    const effect = getEffect(handle);
                    if (effect?.source !== sourceId(source) ||
                        effect.width !== source.width ||
                        effect.height !== source.height)
                        return null;
                    merge(effect.before, effect.after, effect.damage, effect.evidence, index + 1, 0);
                }
                for (const region of field.sourceRegions) {
                    if (region.effect !== null)
                        continue;
                    const area = intersection(region.bounds, surfaceBounds);
                    if (area !== null)
                        merge(owners, owners, area, surfaceBounds, index + 1, 2);
                }
            }
        }
        if (raster !== null)
            resizeWork(textCanvas, source.width, source.height);
        function paint(value: PixelTextCandidate): void {
            if (raster === null)
                return;
            textContext.clearRect(0, 0, source.width, source.height);
            drawTextGroup(textContext, value);
            upload(raster, textCanvas);
        }
        function collide(value: PixelTextCandidate, row: (typeof rows)[number], valid: Image, trace: FailureTrace | null): void {
            if (owners === null || raster === null || value.draws.length === 0)
                return;
            paint(value);
            for (const region of value.targetRegions) {
                const area = intersection(region, surfaceBounds);
                if (area === null)
                    continue;
                validateTiles(area.width, area.height, valid, () => {
                    gl.useProgram(collision);
                    texture(collision, 'owners', owners, 0);
                    texture(collision, 'textImage', raster, 1);
                    gl.uniform2i(uniform(collision, 'origin'), area.x, area.y);
                    gl.uniform2i(uniform(collision, 'extent'), area.width, area.height);
                    gl.uniform1i(uniform(collision, 'owner'), row.groupIndex + 1);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                }, trace === null
                    ? undefined
                    : {
                        trace,
                        memberIndex,
                        groupIndex: row.groupIndex,
                        effectSequence: null,
                        stage: 'target',
                    }, 'neighbor-collision', 'neighbor-collision');
            }
        }
        for (const row of ordered) {
            if (shared === undefined) {
                copy(background, candidate);
                reverseEffects(row.effects, candidate, row.valid, row.trace, memberIndex, repaint);
            }
            else
                copy(shared.valid, row.valid);
            for (const [index, choice] of row.choices.entries()) {
                const { candidate: value, valid, trace } = choice;
                intersectFlag(row.valid, valid);
                if (!validateTargetRegions(candidate, value, choice.regions, valid, trace, memberIndex, row.groupIndex))
                    return null;
                collide(value, row, valid, trace);
                if (row.ambiguous)
                    rejectPredicate(valid, trace === null
                        ? undefined
                        : {
                            trace,
                            memberIndex,
                            groupIndex: row.groupIndex,
                            effectSequence: null,
                            stage: 'target',
                        }, 'neighbor-collision');
                const first = row.choices[0];
                if (index > 0 && first !== undefined) {
                    selection ??= program(vertex, selectionFragment);
                    target(valid);
                    gl.useProgram(selection);
                    texture(selection, 'firstFlag', first.valid, 0);
                    texture(selection, 'secondFlag', first.valid, 1);
                    gl.uniform1i(uniform(selection, 'suppress'), 1);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                }
                if (raster !== null && value.draws.length > 0)
                    for (const region of value.targetRegions) {
                        const area = intersection(region, surfaceBounds);
                        if (area !== null)
                            merge(raster, raster, area, surfaceBounds, row.groupIndex + 1, 1, valid);
                    }
            }
            const first = row.choices[0], second = row.choices[1];
            if (first === undefined)
                throw new Error('Missing layout candidate.');
            const selectedValid = second === undefined ? first.valid : own(flag(0));
            if (second !== undefined) {
                selection ??= program(vertex, selectionFragment);
                target(selectedValid);
                gl.useProgram(selection);
                texture(selection, 'firstFlag', first.valid, 0);
                texture(selection, 'secondFlag', second.valid, 1);
                gl.uniform1i(uniform(selection, 'suppress'), 0);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }
            if (row.trace !== null && first.trace !== null) {
                const rejected = own(flag(1));
                copy(row.valid, rejected);
                selection ??= program(vertex, selectionFragment);
                target(rejected);
                gl.useProgram(selection);
                texture(selection, 'firstFlag', selectedValid, 0);
                texture(selection, 'secondFlag', selectedValid, 1);
                gl.uniform1i(uniform(selection, 'suppress'), 1);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                const offset = row.trace.checks.length;
                row.trace.checks.push(...first.trace.checks);
                target(row.trace.image);
                gl.useProgram(reduction);
                texture(reduction, 'inputImage', first.trace.image, 0);
                texture(reduction, 'priorValid', rejected, 1);
                gl.uniform1i(uniform(reduction, 'finalPass'), 3);
                gl.uniform1i(uniform(reduction, 'diagnosticIndex'), offset);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }
            copy(selectedValid, row.valid);
            if (shared === undefined) {
                commit ??= program(vertex, commitFragment);
                target(background);
                gl.useProgram(commit);
                texture(commit, 'candidateImage', candidate, 0);
                texture(commit, 'validFlag', row.valid, 1);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }
            else
                copy(row.valid, shared.valid);
        }
        let finalOverlay: PixelDisplayOverlay | null = null;
        if (raster !== null) {
            const choices = rows.flatMap((row) => row.choices).filter((choice) => choice.candidate.draws.length > 0);
            let scratch: Image | null = null;
            for (const choice of choices) {
                paint(choice.candidate);
                if (choice === choices.at(-1)) {
                    finalOverlay = { image: raster, valid: choice.valid };
                    continue;
                }
                overlay ??= program(vertex, overlayFragment);
                scratch ??= shared === undefined ? candidate : (owners ?? own(allocate(source.width, source.height)));
                target(scratch);
                gl.useProgram(overlay);
                texture(overlay, 'candidateImage', background, 0);
                texture(overlay, 'textImage', raster, 1);
                texture(overlay, 'validFlag', choice.valid, 2);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                [background, scratch] = [scratch, background];
            }
        }
        return { original, candidate: background, overlay: finalOverlay, predicates: rows };
    }
    return prepareRows;
}
