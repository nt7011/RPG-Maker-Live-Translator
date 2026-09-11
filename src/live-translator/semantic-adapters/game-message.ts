import type { NativeTextObservation, SemanticClue, SemanticAdapter } from './contract.js';
import { captureNativeText } from './shared/native-text.js';
import { captureMessageAllocation } from './game-message/native-allocation.js';
import { nativeSourceSpans } from './shared/source.js';
function observe(observation: NativeTextObservation): readonly SemanticClue[] {
    if (observation.family !== 'game-message')
        return [];
    if (observation.kind === 'source') {
        const spans = nativeSourceSpans(observation.text);
        return spans !== null && spans.length > 0 ? [{ kind: 'normalized-source', spans, complete: true }] : [];
    }
    const members = observation.draws.flatMap((item) => item.range === null ? [] : [{ draw: item.draw, range: item.range }]);
    members.sort((a, b) => a.range.start - b.range.start);
    const clues: SemanticClue[] = members.length > 0 ? [{ kind: 'ordered-members', members }] : [];
    if (observation.allocation !== null)
        clues.push({ kind: 'safe-area', rect: observation.allocation });
    return clues;
}
export function gameMessageAdapter(): SemanticAdapter {
    return { observe, captures: [captureNativeText, captureMessageAllocation] };
}
