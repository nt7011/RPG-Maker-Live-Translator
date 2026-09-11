import { state, refs } from '../state.js';
import { readProviderStatusSnapshot } from '../runtime/provider-status.js';
export function getPriorityLaneNotification(value: unknown): string {
    const snapshot = readProviderStatusSnapshot(value);
    if (!snapshot?.active)
        return '';
    const provider = snapshot.provider;
    if (provider.kind !== 'llamacpp' && provider.kind !== 'lmstudio' && provider.kind !== 'llamafile')
        return '';
    if (provider.priorityLane)
        return '';
    if (!provider.capacityVerified)
        return 'Priority lane unavailable · concurrency not verified.';
    if (provider.capacity < 3)
        return 'Priority lane unavailable · requires at least 3 concurrent requests.';
    return 'Priority lane unavailable.';
}
export function renderPriorityLaneNotification(): void {
    const element = refs['priority-lane-notification'];
    if (!element)
        return;
    const message = getPriorityLaneNotification(state.providerStatus);
    element.textContent = message;
    element.hidden = !message;
}
