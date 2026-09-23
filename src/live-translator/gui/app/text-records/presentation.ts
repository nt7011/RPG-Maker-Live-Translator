import type { SemanticControl } from '../../../runtime/text-record-types.js';
export type RecordResult = 'pending' | 'success' | 'miss' | 'noop' | 'fail' | 'unknown';
export interface RecordPresentation {
    readonly result: RecordResult;
    readonly label: string;
    readonly explanation: string;
    readonly semanticControl: SemanticControl | null;
    readonly warnings: readonly {
        readonly label: string;
        readonly text: string;
        readonly tone: 'warning' | 'error';
    }[];
    readonly sections: readonly {
        readonly title: string;
        readonly text: string;
        readonly group?: string;
    }[];
}
export function isSemanticControl(value: unknown): value is SemanticControl {
    return (value === 'window' ||
        value === 'sprite' ||
        value === 'game-message' ||
        value === 'none' ||
        value === 'invalidated');
}
export function controlLabel(value: SemanticControl | null): string {
    switch (value) {
        case 'window':
            return 'Window semantic control';
        case 'sprite':
            return 'Sprite semantic control';
        case 'game-message':
            return 'GameMessage semantic control';
        case 'none':
            return 'No semantic control';
        case 'invalidated':
            return 'Semantic control invalidated';
        default:
            return 'Semantic control unavailable';
    }
}
export function basicPresentation(state: string | null, semanticControl: SemanticControl | null): RecordPresentation {
    const result: RecordResult = state === 'available'
        ? 'success'
        : state === 'no-translation'
            ? 'noop'
            : state === 'failed'
                ? 'fail'
                : state === 'observed' || state === 'translating'
                    ? 'pending'
                    : 'unknown';
    const label = result === 'success'
        ? 'Translation accepted'
        : result === 'noop'
            ? 'Skipped'
            : result === 'fail'
                ? 'Translation failed'
                : result === 'pending'
                    ? 'Pending translation'
                    : 'Result unknown';
    return { result, label, explanation: label, semanticControl, warnings: [], sections: [] };
}
export function readRecordPresentation(value: unknown): RecordPresentation | null {
    const own = (input: unknown, name: PropertyKey): unknown => {
        if (input === null || typeof input !== 'object')
            return undefined;
        const descriptor = Object.getOwnPropertyDescriptor(input, name);
        return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
    };
    const result = own(value, 'result'), label = own(value, 'label'), explanation = own(value, 'explanation'), semanticControl = own(value, 'semanticControl');
    if (typeof result !== 'string' ||
        !['pending', 'success', 'miss', 'noop', 'fail', 'unknown'].includes(result) ||
        typeof label !== 'string' ||
        typeof explanation !== 'string' ||
        (semanticControl !== null && !isSemanticControl(semanticControl)))
        return null;
    const sections: {
        title: string;
        text: string;
        group?: string;
    }[] = [], warnings: {
        label: string;
        text: string;
        tone: 'warning' | 'error';
    }[] = [];
    const rows = own(value, 'sections'), badges = own(value, 'warnings');
    const rowCount = own(rows, 'length'), badgeCount = own(badges, 'length');
    if (!Array.isArray(rows) ||
        !Array.isArray(badges) ||
        typeof rowCount !== 'number' ||
        !Number.isSafeInteger(rowCount) ||
        rowCount < 0 ||
        rowCount > 64 ||
        typeof badgeCount !== 'number' ||
        !Number.isSafeInteger(badgeCount) ||
        badgeCount < 0 ||
        badgeCount > 8)
        return null;
    for (let index = 0; index < rowCount; index++) {
        const row = own(rows, index), title = own(row, 'title'), text = own(row, 'text'), group = own(row, 'group');
        if (typeof title !== 'string' || typeof text !== 'string' || (group !== undefined && typeof group !== 'string'))
            return null;
        sections.push({ title, text, ...(group === undefined ? {} : { group }) });
    }
    for (let index = 0; index < badgeCount; index++) {
        const badge = own(badges, index), label = own(badge, 'label'), text = own(badge, 'text'), tone = own(badge, 'tone');
        if (typeof label !== 'string' || typeof text !== 'string' || (tone !== 'warning' && tone !== 'error'))
            return null;
        warnings.push({ label, text, tone });
    }
    return { result: result as RecordResult, label, explanation, semanticControl, sections, warnings };
}
