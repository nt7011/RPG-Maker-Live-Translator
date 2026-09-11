import { characters, type TextTemplate, type TextTranslation } from './styled-text.js';
import type { BitmapSourceCharacterIndex } from './bitmap-text-layout.js';
export interface BitmapTextReveal {
    readonly targetEnds: readonly number[];
    readonly sourceEnds: readonly number[];
    readonly sourcePositions: readonly number[];
}
export function createBitmapTextReveal(template: TextTemplate, translation: TextTranslation, source: BitmapSourceCharacterIndex): BitmapTextReveal {
    const pauses = template.controls?.filter(({ kind }) => kind === 'pause').map(({ offset }) => offset) ?? [];
    const targetPauses = translation.pauseEnds ?? [];
    if (pauses.length !== targetPauses.length)
        throw new Error('Missing translated pause boundaries.');
    const targetEnds: number[] = [], sourceEnds: number[] = [], sourcePositions: number[] = [];
    let sourceFrom = 0, sourceTo = 0, targetStart = 0;
    for (const [section, sourceEnd] of [...pauses, template.sourceText.length].entries()) {
        while ((source.drawableEnds[sourceTo] ?? Infinity) <= sourceEnd)
            sourceTo++;
        const targetEnd = targetPauses[section] ?? translation.text.length;
        let offset = targetStart, position = 0;
        for (const character of characters(translation.text.slice(targetStart, targetEnd))) {
            offset += character.length;
            const printable = character === '\t' || !/^[\p{Cc}\p{Cf}\u2028\u2029]+$/u.test(character);
            const local = printable ? position++ : Math.max(0, position - 1);
            const driver = sourceTo > sourceFrom
                ? sourceFrom + Math.min(local, sourceTo - sourceFrom - 1)
                : Math.max(0, sourceFrom - 1);
            targetEnds.push(offset);
            sourcePositions.push(driver);
            sourceEnds.push(source.drawableEnds[driver] ?? 0);
        }
        sourceFrom = sourceTo;
        targetStart = targetEnd;
    }
    return Object.freeze({
        targetEnds: Object.freeze(targetEnds),
        sourceEnds: Object.freeze(sourceEnds),
        sourcePositions: Object.freeze(sourcePositions),
    });
}
export function bitmapTextRevealEnd(reveal: BitmapTextReveal, sourceEnd: number): number {
    let lo = 0, hi = reveal.sourceEnds.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if ((reveal.sourceEnds[mid] ?? Infinity) <= sourceEnd)
            lo = mid + 1;
        else
            hi = mid;
    }
    return reveal.targetEnds[lo - 1] ?? 0;
}
