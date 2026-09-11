import type { NativeTextObservation, SemanticClue, SemanticAdapter } from './contract.js';
import { captureNativeText } from './shared/native-text.js';
import { captureWindowAllocation } from './window/native-allocation.js';
import { captureHelpAllocation } from './window/help-allocation.js';
import { nativeSourceSpans } from './shared/source.js';
function observe(observation: NativeTextObservation): readonly SemanticClue[] {
    if (observation.kind === 'source') {
        const spans = nativeSourceSpans(observation.text);
        return spans !== null && spans.length > 0 ? [{ kind: 'normalized-source', spans, complete: false }] : [];
    }
    const clues: SemanticClue[] = [];
    const members = observation.draws.flatMap((item) => item.range === null ? [] : [{ draw: item.draw, range: item.range }]);
    members.sort((a, b) => a.range.start - b.range.start);
    if (members.length > 0)
        clues.push({ kind: 'ordered-members', members });
    if (observation.allocation !== null)
        clues.push({ kind: 'safe-area', rect: observation.allocation });
    return clues;
}
export function windowAdapter(): SemanticAdapter {
    return { observe, captures: [captureNativeText, captureWindowAllocation, captureHelpAllocation] };
}
