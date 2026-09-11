import { state } from '../state.js';
import { renderProviderHeader } from '../panels/provider-header.js';
import { readProviderStatusSnapshot } from './provider-status.js';
export function createGuiStatusPushReceiver(repaint: () => void) {
    let repaintPending = false;
    return Object.freeze({
        accept(value: unknown): void {
            const next = readProviderStatusSnapshot(value);
            const previous = state.providerStatus;
            if (!next ||
                (previous &&
                    (next.generation < previous.generation ||
                        (next.generation === previous.generation && next.sequence <= previous.sequence))))
                return;
            state.providerStatus = next;
            if (repaintPending)
                return;
            repaintPending = true;
            try {
                requestAnimationFrame(() => {
                    repaintPending = false;
                    try {
                        repaint();
                    }
                    catch {
                    }
                });
            }
            catch {
                repaintPending = false;
            }
        },
    });
}
export function publishGuiStatusSink(scope: object = globalThis, repaint = renderProviderHeader) {
    const sink = createGuiStatusPushReceiver(repaint);
    Object.defineProperty(scope, 'LiveTranslatorGuiStatusSink', { configurable: true, value: sink });
    return sink;
}
