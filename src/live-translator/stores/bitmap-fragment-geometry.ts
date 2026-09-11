import { bitmapLineFrame, bitmapLineTextX, type BitmapSourceGeometry } from './bitmap-line-geometry.js';
import { bitmapTextBaseline } from './bitmap-text-layout.js';
import type { PixelBounds } from '../gpu/bitmap-pixel-device.js';
import type { BitmapRenderUse } from '../presentation/bitmap-render-host.js';
import { textOrigin, type BitmapContent } from './bitmap-content.js';
import { validTextMetrics, supportsBitmapCharacterText, type BitmapTextDraw, type BitmapTextMeasure, type BitmapTextMetrics, } from './bitmap-text-layout.js';
import { characters, hasWholeGraphemeStyles, sameTextPaint, type StyledText } from './styled-text.js';
export interface BitmapFragment {
    readonly use: BitmapRenderUse;
    readonly content: BitmapContent;
}
export type BitmapPlacement = readonly [
    number,
    number,
    number,
    number,
    number,
    number
];
export interface BitmapFragmentMember {
    readonly reference: BitmapPlacement;
    readonly sourceText: string;
}
export function fragmentPlacement({ use, content }: BitmapFragment): BitmapPlacement | null {
    const { frame, vertices: v } = use, root = textOrigin(content);
    if (frame.x !== 0 || frame.y !== 0 || frame.width !== content.width || frame.height !== content.height)
        return null;
    if (v.length !== 8 || !v.every(Number.isFinite))
        return null;
    const [x0, y0, x1, y1, x2, y2, x3, y3] = v as readonly [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number
    ];
    const a = (x1 - x0) / root.width, b = (y1 - y0) / root.width;
    const c = (x3 - x0) / root.height, d = (y3 - y0) / root.height;
    if (Math.abs(a * d - b * c) < 1e-10 || Math.abs(x2 - x1 - x3 + x0) > 1e-3 || Math.abs(y2 - y1 - y3 + y0) > 1e-3)
        return null;
    return [a, b, c, d, x0, y0];
}
function local(matrix: BitmapPlacement, x: number, y: number): readonly [
    number,
    number
] {
    const [a, b, c, d, tx, ty] = matrix, determinant = a * d - b * c;
    return [(d * (x - tx) - c * (y - ty)) / determinant, (-b * (x - tx) + a * (y - ty)) / determinant];
}
function point(matrix: BitmapPlacement, x: number, y: number): readonly [
    number,
    number
] {
    return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}
function projectSource(geometry: BitmapSourceGeometry, placement: BitmapPlacement, reference: BitmapPlacement): BitmapSourceGeometry {
    const middle = geometry.y + geometry.lineHeight / 2;
    const project = (x: number) => local(reference, ...point(placement, x, middle));
    const left = project(geometry.left);
    const bottom = local(reference, ...point(placement, geometry.left, middle + geometry.lineHeight));
    const lineHeight = bottom[1] - left[1];
    return {
        left: left[0],
        right: project(geometry.right)[0],
        textLeft: project(geometry.textLeft)[0],
        textRight: project(geometry.textRight)[0],
        y: left[1] - lineHeight / 2,
        lineHeight,
        alignment: geometry.alignment,
    };
}
function fragmentLanes(fragments: readonly BitmapFragment[]) {
    const lanes: {
        reference: BitmapPlacement;
        middle: number;
        lineHeight: number;
        fragments: {
            fragment: BitmapFragment;
            left: number;
            right: number;
            textLeft: number;
            textRight: number;
        }[];
    }[] = [];
    for (const fragment of fragments) {
        const placement = fragmentPlacement(fragment);
        if (placement?.[1] !== 0)
            continue;
        const root = textOrigin(fragment.content);
        const first = root.placements[0];
        if (first === undefined || !hasWholeGraphemeStyles(root.source))
            continue;
        const middle = root.frame.y + root.frame.lineHeight / 2;
        const p = point(placement, first.left, middle);
        let lane = lanes.find((lane) => {
            const q = local(lane.reference, ...p);
            const projected = projectSource(first, placement, lane.reference);
            return (Math.abs(q[1] - lane.middle) < 1e-3 &&
                Math.abs(projected.lineHeight - lane.lineHeight) < 1e-3 &&
                placement.slice(0, 4).every((v, i) => Math.abs(v - (lane.reference[i] ?? NaN)) < 1e-5));
        });
        if (lane === undefined) {
            lane = { reference: placement, middle, lineHeight: root.frame.lineHeight, fragments: [] };
            lanes.push(lane);
        }
        const projected = root.placements.map((geometry) => projectSource(geometry, placement, lane.reference));
        let left = Infinity, right = -Infinity, textLeft = Infinity, textRight = -Infinity;
        for (const geometry of projected) {
            left = Math.min(left, geometry.left);
            right = Math.max(right, geometry.right);
            textLeft = Math.min(textLeft, geometry.textLeft);
            textRight = Math.max(textRight, geometry.textRight);
        }
        lane.fragments.push({ fragment, left, right, textLeft, textRight });
    }
    return lanes;
}
export function supportsBitmapFragmentOrder(fragments: readonly BitmapFragment[]): boolean {
    const lanes = fragmentLanes(fragments), lane = lanes[0];
    if (lanes.length !== 1 || lane?.fragments.length !== fragments.length)
        return false;
    const ordered = lane.fragments.toSorted((a, b) => a.textLeft - b.textLeft);
    if (ordered.some((entry, index) => entry.fragment !== fragments[index]))
        return false;
    for (let index = 1; index < ordered.length; index++) {
        const a = ordered[index - 1], b = ordered[index];
        if (a === undefined || b === undefined || a.textLeft >= b.textLeft || b.textLeft < a.textRight - 1e-3)
            return false;
    }
    const source = fragments.map((fragment) => textOrigin(fragment.content).source.text);
    return characters(source.join('')).length === source.reduce((n, text) => n + characters(text).length, 0);
}
export function groupBitmapFragments(fragments: readonly BitmapFragment[]): readonly BitmapFragment[][] {
    const lanes = fragmentLanes(fragments);
    const result: BitmapFragment[][] = [];
    for (const lane of lanes) {
        const sorted = lane.fragments.sort((a, b) => a.textLeft - b.textLeft);
        let group: typeof sorted = [], right = -Infinity;
        function emit() {
            if (group.length < 2)
                return;
            let direction = 0;
            for (let i = 1; i < group.length; i++) {
                const a = group[i - 1], b = group[i];
                if (a === undefined || b === undefined)
                    return;
                const step = Math.sign(textOrigin(b.fragment.content).sequence - textOrigin(a.fragment.content).sequence);
                if (a.textLeft >= b.textLeft ||
                    b.textLeft < a.textRight - 1e-3 ||
                    step === 0 ||
                    (direction !== 0 && step !== direction))
                    return;
                direction = step;
            }
            const source = group.map((item) => textOrigin(item.fragment.content).source.text);
            if (characters(source.join('')).length !== source.reduce((n, text) => n + characters(text).length, 0))
                return;
            result.push(group.map((item) => item.fragment));
        }
        for (const item of sorted) {
            if (item.left > right) {
                emit();
                group = [];
                right = -Infinity;
            }
            group.push(item);
            right = Math.max(right, item.right);
        }
        emit();
    }
    return result;
}
export interface BitmapCharacterRaster {
    readonly draws: readonly BitmapTextDraw[];
    readonly bounds: PixelBounds;
}
export function layoutBitmapCharacters(members: readonly BitmapFragmentMember[], contents: readonly BitmapContent[], translation: StyledText, measure: BitmapTextMeasure, sourcePositions?: readonly number[], targetPositions?: readonly number[]): readonly BitmapCharacterRaster[] | null {
    const first = members[0], firstContent = contents[0];
    if (first === undefined ||
        firstContent === undefined ||
        members.length !== contents.length ||
        !hasWholeGraphemeStyles(translation))
        return null;
    const roots = contents.map(textOrigin);
    if (roots.some((root) => !hasWholeGraphemeStyles(root.source)))
        return null;
    if (sourcePositions !== undefined &&
        (sourcePositions.length !== members.length ||
            sourcePositions.some((count) => !Number.isSafeInteger(count) || count < 0)))
        return null;
    const drivers = members.flatMap((member, index) => Array.from({ length: sourcePositions?.[index] ?? characters(member.sourceText).length }, () => index));
    if (drivers.length === 0)
        return null;
    const target = characters(translation.text);
    if (targetPositions !== undefined &&
        (targetPositions.length < target.length ||
            target.some((_, index) => {
                const position = targetPositions[index];
                return (position === undefined ||
                    !Number.isSafeInteger(position) ||
                    position < 0 ||
                    position >= drivers.length);
            })))
        return null;
    if (!supportsBitmapCharacterText(translation.text))
        return null;
    let offset = 0, styleIndex = 0;
    const letters = target.map((text) => {
        while ((translation.runs[styleIndex]?.end ?? Infinity) <= offset)
            styleIndex++;
        const style = translation.runs[styleIndex];
        if (style === undefined)
            throw new Error('Missing target style.');
        offset += text.length;
        return { text, paint: style.paint, metrics: measure(text, style.paint) };
    });
    if (letters.some((letter) => !validTextMetrics(letter.metrics)))
        return null;
    const frame = bitmapLineFrame(roots.flatMap((root, index) => {
        const member = members[index];
        if (member === undefined)
            throw new Error('Missing character driver.');
        return root.placements.map((geometry) => projectSource(geometry, member.reference, first.reference));
    }));
    let x = bitmapLineTextX(frame, letters.reduce((advance, letter) => advance + letter.metrics.width, 0));
    const assigned: (BitmapTextDraw & {
        readonly metrics: BitmapTextMetrics | null;
    })[][] = members.map(() => []);
    for (const [index, letter] of letters.entries()) {
        const driver = drivers[targetPositions?.[index] ?? Math.min(index, drivers.length - 1)];
        if (driver === undefined)
            return null;
        const member = members[driver], root = roots[driver], draws = assigned[driver];
        if (member === undefined || root === undefined || draws === undefined)
            return null;
        const position = local(member.reference, ...point(first.reference, x, frame.y + frame.lineHeight / 2));
        const previous = draws.at(-1);
        if (previous !== undefined && sameTextPaint(previous.layout.paint, letter.paint)) {
            draws[draws.length - 1] = {
                text: previous.text + letter.text,
                metrics: null,
                layout: {
                    ...previous.layout,
                    placement: {
                        ...previous.layout.placement,
                        maxWidth: previous.layout.placement.maxWidth + letter.metrics.width,
                    },
                },
            };
        }
        else
            draws.push({
                text: letter.text,
                metrics: letter.metrics,
                layout: {
                    paint: letter.paint,
                    alignment: 'left',
                    placement: {
                        x: position[0],
                        y: position[1] - root.frame.lineHeight / 2,
                        lineHeight: root.frame.lineHeight,
                        maxWidth: letter.metrics.width,
                    },
                },
            });
        x += letter.metrics.width;
    }
    const result: BitmapCharacterRaster[] = [];
    for (const [index, draws] of assigned.entries()) {
        const root = roots[index], content = contents[index];
        if (root === undefined || content === undefined)
            throw new Error('Missing character driver.');
        let left = 0, top = 0, right = root.width, bottom = root.height;
        for (const draw of draws) {
            const { placement, paint } = draw.layout;
            const metrics = draw.metrics ?? measure(draw.text, paint);
            if (!validTextMetrics(metrics))
                return null;
            const baseline = bitmapTextBaseline(placement, paint);
            left = Math.min(left, Math.floor(placement.x - metrics.left - paint.outlineWidth));
            right = Math.max(right, Math.ceil(placement.x + Math.max(metrics.right, placement.maxWidth) + paint.outlineWidth));
            top = Math.min(top, Math.floor(baseline) - Math.ceil(metrics.ascent + paint.outlineWidth));
            bottom = Math.max(bottom, Math.ceil(baseline) + Math.ceil(metrics.descent + paint.outlineWidth));
        }
        const sx = content.width / root.width, sy = content.height / root.height;
        const bx = Math.floor(left * sx), by = Math.floor(top * sy);
        result.push({
            draws: draws.map(({ text, layout }) => ({
                text,
                layout: layout.placement.maxWidth > 0
                    ? layout
                    : { ...layout, placement: { ...layout.placement, maxWidth: 1 } },
            })),
            bounds: { x: bx, y: by, width: Math.ceil(right * sx) - bx, height: Math.ceil(bottom * sy) - by },
        });
    }
    return result;
}
export function fragmentVertices(fragment: BitmapFragment, bounds: PixelBounds): readonly number[] | null {
    const matrix = fragmentPlacement(fragment);
    if (matrix === null)
        return null;
    const root = textOrigin(fragment.content), sx = root.width / fragment.content.width, sy = root.height / fragment.content.height;
    return ([
        [bounds.x, bounds.y],
        [bounds.x + bounds.width, bounds.y],
        [bounds.x + bounds.width, bounds.y + bounds.height],
        [bounds.x, bounds.y + bounds.height],
    ] as const).flatMap(([x, y]) => point(matrix, x * sx, y * sy));
}
