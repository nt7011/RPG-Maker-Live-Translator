import type { ForesightView, ForesightViewNode, ForesightPreparation } from '../../foresight/view.js';
import { TIMELINE } from './layout.js';
import { mountTreeViewport, type TreeCard } from './viewport.js';
import { PREPARATION_LABELS, describeLocation, gameMessagePaths, nodeNotes } from './model.js';
import { createTextPillContent, type TextPillRail } from '../app/text-records/pill.js';
import { basicPresentation } from '../app/text-records/presentation.js';
import type { RuntimeTextRecordSnapshot } from '../../runtime/text-record-types.js';
const rendered = new WeakMap<HTMLElement, {
    key: string;
    scroll: HTMLElement;
    dispose: (() => void) | null;
}>();
export function clear(container: HTMLElement): void {
    rendered.get(container)?.dispose?.();
    rendered.delete(container);
}
const LABELS = {
    root: 'Current message',
    message: 'Possible message',
    choice: 'Choices',
    condition: 'Conditional',
    branch: 'Choice branch',
    merge: 'Shared continuation',
    battle: 'Battle outcomes',
};
function label(node: ForesightViewNode): string {
    if (node.outcome != null)
        return { win: 'Win', escape: 'Escape', lose: 'Lose' }[node.outcome];
    if (node.kind === 'branch' && node.arm !== null)
        return node.arm === -2 ? 'Cancel' : `Choice ${String(node.arm + 1)}`;
    return LABELS[node.kind];
}
function element(doc: Document, tag: string, className: string, text = ''): HTMLElement {
    const result = doc.createElement(tag);
    result.className = className;
    result.textContent = text;
    return result;
}
const PILL_STATE: Readonly<Record<ForesightPreparation, TextPillRail['state']>> = {
    unrequested: 'unknown',
    pending: 'pending',
    ready: 'success',
    skipped: 'noop',
    failed: 'fail',
};
function messagePill(doc: Document, source: string, translation: string | null, rail: TextPillRail, censored = false): HTMLElement {
    const pill = element(doc, 'div', `text-record foresight-pill text-status-${rail.state}`);
    const bubble = element(doc, 'div', 'text-bubble');
    const body = createTextPillContent(doc, { sourceText: source, translation, rail });
    if (censored) {
        pill.classList.add('text-record-spoiler-censored');
        body.content.setAttribute('aria-hidden', 'true');
        bubble.setAttribute('aria-label', 'Future text hidden');
    }
    bubble.appendChild(body.content);
    bubble.appendChild(body.rail);
    pill.appendChild(bubble);
    return pill;
}
function futureRail(preparation: ForesightPreparation): TextPillRail {
    const label = PREPARATION_LABELS[preparation];
    return { state: PILL_STATE[preparation], label, title: label, priority: null, stream: false, warnings: [] };
}
export function render(container: HTMLElement, view: ForesightView | null, showText: boolean, generation: number, messagesOnly = false, current: RuntimeTextRecordSnapshot | null = null): void {
    const key = JSON.stringify([generation, view?.revision, showText, messagesOnly, current]);
    const previous = rendered.get(container);
    if (previous?.key === key && previous.scroll.parentNode === container)
        return;
    clear(container);
    let dispose: (() => void) | null = null;
    const doc = container.ownerDocument;
    const scroll = previous?.scroll ?? element(doc, 'div', 'foresight-scroll');
    const sameAnchor = container.dataset['foresightAnchor'] === `${String(generation)}:${String(view?.anchor?.id)}`;
    const top = sameAnchor ? scroll.scrollTop : 0, left = sameAnchor ? scroll.scrollLeft : 0;
    container.dataset['foresightAnchor'] = `${String(generation)}:${String(view?.anchor?.id)}`;
    scroll.setAttribute('tabindex', '0');
    scroll.setAttribute('aria-label', 'Possible future messages and branches');
    scroll.replaceChildren();
    scroll.style.height = '96px';
    if (view === null || view.graph.nodes.length === 0) {
        const text = view?.state === 'unavailable'
            ? 'This message system does not provide a supported native origin.'
            : view === null
                ? 'Foresight is off, its required adapters are off, or its current view is unavailable.'
                : view.waiting === 'origin-unavailable'
                    ? 'A GameMessage was submitted, but its current native event origin could not be verified.'
                    : 'Waiting for a GameMessage text submission.';
        scroll.appendChild(element(doc, 'p', 'empty', text));
    }
    else {
        const nodes = (messagesOnly ? gameMessagePaths(view.graph, view.limits.edges) : view.graph).nodes;
        const canvas = element(doc, 'div', 'foresight-canvas');
        const cards = new Map<number, TreeCard>();
        for (const node of nodes) {
            const card = element(doc, 'article', `foresight-node foresight-node-${node.kind}`);
            const notes = nodeNotes(node);
            card.dataset['nodeId'] = String(node.id);
            card.style.width = `${String(TIMELINE.width)}px`;
            if (!messagesOnly) {
                const index = node.kind === 'root' ? (view.anchor?.index ?? node.index) : node.index;
                card.appendChild(element(doc, 'h3', 'foresight-node-title', label(node)));
                card.appendChild(element(doc, 'span', 'foresight-node-index', node.location == null || node.kind === 'root'
                    ? `Command ${String(index)} · #${String(node.id)}`
                    : describeLocation(node.location)));
            }
            if (node.location != null && node.location.via.length > 0)
                card.title = node.location.via
                    .map((step) => `${step.commonEvent === null ? 'Current event list' : `Common event ${String(step.commonEvent)}`} command ${String(step.index)} → common event ${String(step.childCommonEvent)}`)
                    .join('\n');
            const content = element(doc, 'div', 'foresight-node-content');
            if (node.kind === 'root') {
                const presentation = basicPresentation(current?.state ?? null, current?.semanticControl ?? null);
                content.appendChild(messagePill(doc, current?.sourceText ?? 'Current text unavailable', current?.translation ?? null, {
                    state: presentation.result,
                    label: presentation.label,
                    title: presentation.explanation,
                    priority: current?.request?.priority ?? null,
                    stream: current?.request?.stream === true,
                    warnings: [],
                }));
            }
            else if (node.texts.length === 0) {
                content.appendChild(node.kind === 'message'
                    ? messagePill(doc, 'Text unavailable', null, futureRail('unrequested'), !showText)
                    : element(doc, 'div', 'foresight-junction', node.kind === 'condition'
                        ? 'Possible outcomes; condition is not evaluated.'
                        : node.kind === 'merge'
                            ? 'Incoming paths share this continuation.'
                            : 'Possible path'));
            }
            for (const text of node.texts) {
                const rail = futureRail(text.preparation);
                if (text.choice !== null)
                    rail.title = `Choice ${String(text.choice + 1)} · ${rail.title}`;
                content.appendChild(messagePill(doc, text.preview + (text.truncated ? '…' : ''), text.translation !== null ? text.translation + (text.translationTruncated ? '…' : '') : null, rail, !showText));
            }
            card.appendChild(content);
            if (notes.length > 0)
                card.appendChild(element(doc, 'span', 'foresight-node-stop', notes.join(' · ')));
            canvas.appendChild(card);
            cards.set(node.id, { element: card, content });
        }
        scroll.appendChild(canvas);
        container.replaceChildren(scroll);
        dispose = mountTreeViewport(scroll, canvas, nodes, cards, messagesOnly);
    }
    if (scroll.parentNode !== container)
        container.replaceChildren(scroll);
    scroll.scrollTop = top;
    scroll.scrollLeft = sameAnchor ? left : 0;
    rendered.set(container, { key, scroll, dispose });
}
