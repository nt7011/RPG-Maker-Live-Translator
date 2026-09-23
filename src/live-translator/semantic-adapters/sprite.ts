import type { NativeTextObservation, SemanticAdapter, SemanticClue } from './contract.js';
import { captureNativeText } from './shared/native-text.js';
import { isLiteralSource } from './shared/source.js';
function observe(observation: NativeTextObservation): readonly SemanticClue[] {
    if (observation.family !== 'sprite')
        return [];
    if (observation.kind === 'source')
        return !isLiteralSource(observation.text)
            ? []
            : [
                {
                    kind: 'normalized-source',
                    spans: [{ kind: 'text', start: 0, end: observation.text.length }],
                    complete: false,
                },
            ];
    const members = observation.draws.flatMap(({ draw, range }) => (range === null ? [] : [{ draw, range }]));
    if (members.length === 0)
        return [];
    const clues: SemanticClue[] = [{ kind: 'ordered-members', members }];
    if (observation.allocation !== null)
        clues.push({ kind: 'safe-area', area: observation.allocation });
    return clues;
}
export function spriteAdapter(): SemanticAdapter {
    return { family: 'sprite', observe, captures: [captureNativeText] };
}
