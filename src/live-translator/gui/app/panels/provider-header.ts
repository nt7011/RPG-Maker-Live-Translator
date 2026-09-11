import { refs, state } from '../state.js';
import { readProviderStatusSnapshot } from '../runtime/provider-status.js';
import { renderPriorityLaneNotification } from './priority-lane.js';
export function createProviderHeaderModel(value: unknown, configuredKind = state.translatorProvider || state.provider || '') {
    const snapshot = readProviderStatusSnapshot(value);
    const provider = snapshot?.provider;
    const kind = (provider?.kind ?? '') || configuredKind;
    const active = snapshot?.active === true;
    const expired = !!provider && provider.expiresAt > 0 && snapshot.updatedAt >= provider.expiresAt;
    const ready = active && provider?.state === 'available' && !expired;
    const condition = !snapshot
        ? 'Waiting for status'
        : !active
            ? 'Stopped'
            : expired
                ? 'Checking state'
                : ready
                    ? 'Ready'
                    : provider?.code === 'model-loading'
                        ? 'Loading model'
                        : provider?.state === 'unavailable'
                            ? 'Unavailable'
                            : 'Checking';
    const concurrency = !active || !provider
        ? ''
        : provider.capacityVerified
            ? `${String(provider.capacity)} concurrent · ${String(provider.running)} running · ${String(provider.queued)} queued`
            : provider.state === 'available' && provider.dispatchLimit > 0
                ? `Capacity not reported · using ${String(provider.dispatchLimit)} request${provider.dispatchLimit === 1 ? '' : 's'} · ${String(provider.running)} running · ${String(provider.queued)} queued`
                : `Capacity pending · dispatch paused · ${String(provider.running)} running · ${String(provider.queued)} queued`;
    return {
        visible: kind === 'llamacpp' || kind === 'lmstudio' || kind === 'llamafile',
        busy: active &&
            !expired &&
            provider?.state === 'pending' &&
            ['artifact-downloading', 'artifact-verifying', 'starting', 'model-loading'].includes(provider.code),
        tone: ready ? 'ok' : provider?.state === 'unavailable' && active ? 'bad' : 'warn',
        connection: `${kind === 'llamacpp' ? 'llama.cpp' : kind === 'llamafile' ? 'llamafile' : 'LM Studio'} ${condition}`,
        model: (provider?.model ?? '') || (provider?.code === 'no-model-loaded' ? 'No model loaded' : 'Model pending'),
        concurrency,
        exception: active ? (provider?.message ?? '') : '',
    };
}
export function renderProviderHeader(): void {
    const model = createProviderHeaderModel(state.providerStatus);
    const header = refs['local-llm-status'];
    if (header) {
        header.hidden = !model.visible;
        header.className = `local-llm-status ${model.tone}${model.busy ? ' busy' : ''}`;
    }
    for (const field of ['connection', 'model', 'concurrency'] as const) {
        const element = refs[`local-llm-${field}`];
        if (element)
            element.textContent = model[field];
    }
    renderPriorityLaneNotification();
    const exception = refs['local-llm-complaint'];
    if (exception) {
        exception.textContent = model.exception;
        exception.hidden = !model.visible || !model.exception;
    }
}
