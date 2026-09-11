import { hasWholeGraphemeStyles, sameTextPaint, type TextTranslation } from './styled-text.js';
import type { BitmapTextAssociation } from './bitmap-text-associations.js';
import type { SemanticTextRevisionHandle, SemanticTranslationAttempt, SemanticTranslationSettlement, } from './semantic-text-store.js';
export interface BitmapGrowingText {
    readonly textId: number;
    active: boolean;
    latest: {
        readonly handle: SemanticTextRevisionHandle;
        readonly attempt: number;
        readonly translation: TextTranslation;
    } | null;
}
export function supportsBitmapGrowingText(row: BitmapTextAssociation): boolean {
    return row.clue === undefined && row.groups.length === 1 && row.source.runs.length === 1;
}
export function continuesBitmapGrowingText(before: BitmapTextAssociation, after: BitmapTextAssociation): boolean {
    const priorPaint = before.source.runs[0]?.paint, nextPaint = after.source.runs[0]?.paint;
    return (supportsBitmapGrowingText(before) &&
        supportsBitmapGrowingText(after) &&
        after.reading.length >= before.reading.length &&
        before.reading.every((atom, index) => atom === after.reading[index]) &&
        after.source.text.startsWith(before.source.text) &&
        priorPaint !== undefined &&
        nextPaint !== undefined &&
        sameTextPaint(priorPaint, nextPaint) &&
        before.frame.x === after.frame.x &&
        before.frame.alignment === after.frame.alignment &&
        before.frame.y === after.frame.y &&
        before.frame.lineHeight === after.frame.lineHeight &&
        hasWholeGraphemeStyles({
            text: after.source.text,
            runs: [{ end: before.source.text.length }, { end: after.source.text.length }],
        }));
}
export function acceptBitmapGrowingText(state: BitmapGrowingText, attempt: SemanticTranslationAttempt, settlement: SemanticTranslationSettlement): boolean {
    if (!state.active || attempt.handle.textId !== state.textId || settlement.kind !== 'available')
        return false;
    const latest = state.latest;
    if (latest !== null &&
        (attempt.handle.semanticRevision < latest.handle.semanticRevision ||
            (attempt.handle.semanticRevision === latest.handle.semanticRevision && attempt.sequence <= latest.attempt)))
        return false;
    state.latest = { handle: attempt.handle, attempt: attempt.sequence, translation: settlement.translation };
    return true;
}
export function closeBitmapGrowingText(state: BitmapGrowingText | null): void {
    if (state === null)
        return;
    state.active = false;
    state.latest = null;
}
