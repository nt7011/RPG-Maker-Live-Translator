import type { RecordView } from './model.js';
import { controlLabel, type RecordPresentation } from './presentation.js';
export interface TextPillRail {
    state: RecordPresentation['result'];
    label: string;
    title: string;
    priority: number | null;
    stream: boolean;
    warnings: RecordPresentation['warnings'];
}
export interface TextRecordPillOptions {
    detailKey?: string;
    domKey?: string;
    inactive?: boolean;
    active?: boolean;
    censored?: boolean;
    onToggle?: () => void;
    onCopy?: (target: HTMLElement) => void;
}
export function projectTextRecordPill(input: RecordView) {
    const view = input.presentation;
    return {
        key: input.key,
        status: view.result,
        sourceText: input.sourceText,
        translation: input.translation,
        control: view.semanticControl ?? 'unknown',
        controlLabel: controlLabel(view.semanticControl),
        rail: {
            state: view.result,
            label: view.label,
            title: view.explanation,
            priority: input.request?.priority ?? null,
            stream: input.request?.stream === true,
            warnings: view.warnings,
        },
    };
}
function updateRail(rail: HTMLElement, info: TextPillRail): void {
    rail.className = `text-translation-rail text-translation-rail-${info.state}`;
    const label = rail.children[0] as HTMLElement, result = label.children[0] as HTMLElement, request = label.children[1] as HTMLElement, warnings = label.children[2] as HTMLElement;
    const terminal = info.state === 'miss' || info.state === 'fail' || info.state === 'noop';
    const hasRequest = info.priority !== null;
    setText(result, terminal
        ? info.state.toUpperCase()
        : hasRequest || info.state === 'success'
            ? ''
            : info.state === 'pending'
                ? 'WAIT'
                : '?');
    setText(request, hasRequest && !terminal ? `${String(info.priority)}${info.stream ? 'S' : ''}` : '');
    request.hidden = terminal || !hasRequest;
    request.title =
        info.priority === null
            ? 'Streaming request'
            : `Request priority ${String(info.priority)}${info.stream ? ' · streaming' : ''}`;
    const warningText = info.warnings.map((warning) => warning.label).join('');
    setText(warnings, warningText);
    warnings.hidden = warningText.length === 0;
    warnings.title = info.warnings.map((warning) => warning.text).join('\n');
    warnings.setAttribute('aria-label', warnings.title);
    if (info.warnings.some((warning) => warning.label === 'T'))
        rail.className += ' text-translation-rail-complaint';
    else if (info.warnings.some((warning) => warning.label === 'Q'))
        rail.className += ' text-translation-rail-questionable';
    const description = [info.title, hasRequest || info.stream ? request.title : '', warnings.title]
        .filter(Boolean)
        .join(' — ');
    rail.title = description;
    rail.setAttribute('aria-label', `${info.label}. ${description}`);
}
export function createTextTranslationRail(info: TextPillRail, doc: Document = document): HTMLElement {
    const rail = doc.createElement('span');
    const label = doc.createElement('span');
    label.className = 'text-translation-rail-label';
    for (const name of ['result', 'request', 'warnings']) {
        const element = doc.createElement('span');
        element.className = `text-translation-rail-${name}`;
        label.appendChild(element);
    }
    rail.appendChild(label);
    updateRail(rail, info);
    return rail;
}
function setText(element: HTMLElement, value: string): void {
    if (element.textContent !== value)
        element.textContent = value;
}
export function createTextPillContent(doc: Document, input: {
    sourceText: string;
    translation: string | null;
    rail: TextPillRail;
}) {
    const content = doc.createElement('span');
    content.className = 'text-bubble-content';
    const source = doc.createElement('span');
    source.className = 'text-line source';
    const translation = doc.createElement('span');
    translation.className = 'text-line translation';
    content.appendChild(source);
    content.appendChild(translation);
    const rail = createTextTranslationRail(input.rail, doc);
    function update(next: typeof input): void {
        setText(source, next.sourceText);
        setText(translation, next.translation ?? '');
        translation.hidden = next.translation === null;
        updateRail(rail, next.rail);
    }
    update(input);
    return { content, rail, update };
}
export function createTextRecordPill(input: RecordView, options: TextRecordPillOptions = {}) {
    const element = document.createElement('article');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-bubble';
    const body = createTextPillContent(document, projectTextRecordPill(input));
    const { content, rail } = body;
    button.appendChild(content);
    button.appendChild(rail);
    element.appendChild(button);
    let currentOptions = options;
    button.addEventListener('click', () => {
        if (!currentOptions.censored)
            currentOptions.onToggle?.();
    });
    element.addEventListener('contextmenu', (event) => {
        if (currentOptions.censored || !currentOptions.onCopy)
            return;
        event.preventDefault();
        currentOptions.onCopy(element);
    });
    function update(next: RecordView, nextOptions: TextRecordPillOptions = {}): void {
        currentOptions = nextOptions;
        const model = projectTextRecordPill(next);
        const { active, inactive, censored, onToggle } = nextOptions;
        element.className = [
            'text-record',
            `text-status-${model.status}`,
            `text-control-${model.control}`,
            `text-translation-${model.rail.state}`,
            active ? 'text-record-active' : '',
            inactive ? 'text-record-inactive' : '',
            censored ? 'text-record-spoiler-censored' : '',
        ]
            .filter(Boolean)
            .join(' ');
        element.dataset['recordKey'] = model.key;
        element.dataset['detailKey'] = nextOptions.detailKey ?? model.key;
        if (nextOptions.domKey)
            element.dataset['domKey'] = nextOptions.domKey;
        else
            delete element.dataset['domKey'];
        button.dataset['semanticControl'] = model.control;
        button.setAttribute('aria-description', model.controlLabel);
        button.disabled = censored === true;
        button.setAttribute('aria-expanded', onToggle && active && !censored ? 'true' : 'false');
        button.title = censored
            ? 'Foresight spoiler hidden'
            : onToggle
                ? active
                    ? 'Hide text record details'
                    : 'Show text record details'
                : 'Detail view disabled in settings.jsonc';
        if (censored || !onToggle) {
            button.setAttribute('aria-label', censored ? 'Foresight spoiler hidden' : 'Detail view disabled');
            button.setAttribute('aria-disabled', 'true');
        }
        else {
            button.removeAttribute('aria-label');
            button.removeAttribute('aria-disabled');
        }
        if (censored)
            content.setAttribute('aria-hidden', 'true');
        else
            content.removeAttribute('aria-hidden');
        body.update(model);
    }
    update(input, options);
    return { element, update };
}
export function createTextRecordDetailShell(recordKey: string, options: {
    detailKey?: string;
    domKey?: string;
    statusClass: string;
    control: string;
    inactive?: boolean;
}): HTMLElement {
    const expanded = document.createElement('div');
    expanded.className = `text-expanded text-detail-row text-status-${options.statusClass} text-control-${options.control}`;
    if (options.inactive)
        expanded.className += ' text-record-inactive';
    if (recordKey)
        expanded.dataset['recordKey'] = recordKey;
    if (options.detailKey)
        expanded.dataset['detailKey'] = options.detailKey;
    if (options.domKey)
        expanded.dataset['domKey'] = options.domKey;
    return expanded;
}
