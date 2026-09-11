import type { RecordView } from './model.js';
import { hasFailedPresentation, hasFailedSemanticAssociation } from './model.js';
import { getSemanticFamilyClass } from './semantic-family.js';
import { formatRecordOutcome } from '../formatters.js';
import { getTextRecordTranslationRailInfo, getTranslationRailLabel } from '../translation-diagnostics/job-model.js';
export interface TextPillRail {
    state: string;
    label: string;
    title: string;
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
export const recordStates = Object.freeze({
    observed: { status: 'detected', rail: 'neutral', label: 'WAIT' },
    translating: { status: 'pending', rail: 'pending', label: 'WAIT' },
    available: { status: 'completed', rail: 'completed', label: '' },
    'no-translation': { status: 'skipped', rail: 'skipped', label: 'NOOP' },
    failed: { status: 'failed', rail: 'failed', label: 'FAIL' },
});
function projectTextRecordPill(input: RecordView) {
    const state = hasFailedPresentation(input) ? 'failed' : input.state;
    const status = state === null ? { status: 'detected', rail: 'neutral', label: '?' } : recordStates[state];
    const translatorComplaint = input.translator?.markerMismatch === true;
    const associationFailed = hasFailedSemanticAssociation(input);
    const requestRail = input.diagnostics === null ? null : getTextRecordTranslationRailInfo(input.diagnostics);
    const request = input.request ??
        (requestRail?.priority != null ? { priority: requestRail.priority, stream: requestRail.stream } : null);
    const label = state === 'failed' || state === 'no-translation' || request === null
        ? status.label
        : getTranslationRailLabel(state === 'available' ? 'completed' : 'queued', request.priority, request.stream);
    return {
        key: input.key,
        status: status.status,
        sourceText: input.sourceText,
        translation: input.translation,
        hookClass: getSemanticFamilyClass(input.diagnostics),
        rail: {
            state: translatorComplaint ? 'complaint' : associationFailed ? 'questionable' : status.rail,
            label: label + (associationFailed ? 'Q' : '') + (translatorComplaint ? 'T' : ''),
            title: formatRecordOutcome(input) +
                (associationFailed ? ' — Semantic association failed' : '') +
                (translatorComplaint ? ' — Translator marker count differs' : ''),
        },
    };
}
export function createTextTranslationRail(info: TextPillRail): HTMLElement {
    const rail = document.createElement('span');
    rail.className = `text-translation-rail text-translation-rail-${info.state}`;
    rail.title = info.title;
    const label = document.createElement('span');
    label.className = 'text-translation-rail-label';
    label.textContent = info.label;
    rail.appendChild(label);
    return rail;
}
function setText(element: HTMLElement, value: string): void {
    if (element.textContent !== value)
        element.textContent = value;
}
export function createTextRecordPill(input: RecordView, options: TextRecordPillOptions = {}) {
    const element = document.createElement('article');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-bubble';
    const content = document.createElement('span');
    content.className = 'text-bubble-content';
    const source = document.createElement('span');
    source.className = 'text-line source';
    const translation = document.createElement('span');
    translation.className = 'text-line translation';
    content.appendChild(source);
    content.appendChild(translation);
    const rail = createTextTranslationRail(projectTextRecordPill(input).rail);
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
            `text-hook-${model.hookClass}`,
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
        setText(source, model.sourceText);
        setText(translation, model.translation ?? '');
        translation.hidden = model.translation === null;
        rail.className = `text-translation-rail text-translation-rail-${model.rail.state}`;
        rail.title = model.rail.title;
        setText(rail.firstElementChild as HTMLElement, model.rail.label);
    }
    update(input, options);
    return { element, update };
}
export function createTextRecordDetailShell(recordKey: string, options: {
    detailKey?: string;
    domKey?: string;
    statusClass: string;
    hookClass: string;
    inactive?: boolean;
}): HTMLElement {
    const expanded = document.createElement('div');
    expanded.className = `text-expanded text-detail-row text-status-${options.statusClass} text-hook-${options.hookClass}`;
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
