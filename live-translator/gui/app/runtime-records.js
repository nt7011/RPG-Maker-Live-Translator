// Translator monitor runtime records helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
'use strict';

function summarizeHookResults(results) {
    const summary = {
        installed: 0,
        skipped: 0,
        failed: 0,
        total: Array.isArray(results) ? results.length : 0,
    };
    for (const result of results || []) {
        if (!result || typeof result.status !== 'string') continue;
        if (Object.prototype.hasOwnProperty.call(summary, result.status)) {
            summary[result.status] += 1;
        }
    }
    return summary;
}

function normalizeHookFeedResult(result) {
    const source = result && typeof result === 'object' ? result : {};
    return {
        name: source.name ? String(source.name) : '-',
        displayName: source.displayName ? String(source.displayName) : (source.name ? String(source.name) : '-'),
        category: source.category ? String(source.category) : '',
        module: source.module ? String(source.module) : '',
        status: source.status ? String(source.status) : 'unknown',
        reason: source.reason ? String(source.reason) : '',
        timestamp: source.timestamp || null,
    };
}

function readTextOrchestratorSnapshot(gameWindow, options = null) {
    if (!gameWindow) return null;
    const hasOptions = options && typeof options === 'object' && Object.keys(options).length > 0;
    if (!hasOptions) {
        const published = gameWindow.LiveTranslatorTextOrchestratorSnapshot;
        if (published && typeof published === 'object') return published;
    }
    const orchestrator = gameWindow.LiveTranslatorTextOrchestrator;
    if (orchestrator && typeof orchestrator.getSnapshot === 'function') {
        return hasOptions ? orchestrator.getSnapshot(options) : orchestrator.getSnapshot();
    }
    if (orchestrator && typeof orchestrator.snapshot === 'function') {
        return hasOptions ? orchestrator.snapshot(options) : orchestrator.snapshot();
    }
    const published = gameWindow.LiveTranslatorTextOrchestratorSnapshot;
    if (published && typeof published === 'object') return published;
    return null;
}

function normalizeTextOrchestratorSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
        return {
            active: [],
            detached: [],
            archived: [],
            summary: null,
            updatedAt: null,
        };
    }

    const active = normalizeOrchestratorItemList(snapshot.active, 'active');
    const detached = normalizeOrchestratorItemList(snapshot.detached, 'detached');
    const archived = normalizeOrchestratorItemList(snapshot.archived, 'archived');
    const summary = summarizeOrchestratorTextRecords(active, detached, archived);

    return {
        active: active
            .map((record) => withDisplayLifecycle(record, 'active')),
        detached: detached
            .map((record) => withDisplayLifecycle(record, 'detached')),
        archived: archived
            .map((record) => withDisplayLifecycle(record, 'archived')),
        summary: snapshot.summary && typeof snapshot.summary === 'object'
            ? Object.assign({}, snapshot.summary, summary)
            : summary,
        updatedAt: snapshot.updatedAt || null,
    };
}

function normalizeOrchestratorItemList(items, lifecycle) {
    const list = Array.isArray(items) ? items : [];
    return list.map((item) => normalizeOrchestratorTextRecord(item, lifecycle));
}

function normalizeOrchestratorTextRecord(record, lifecycle) {
    const source = record && typeof record === 'object' ? record : {};
    const metadata = source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
    const adapter = source.sourceAdapter ? String(source.sourceAdapter) : '';
    const hook = source.hook ? String(source.hook) : '';
    const methodName = firstNonEmptyString(metadata.methodName, metadata.method, hook);
    const history = normalizeRecordHistory(source.history);
    const policy = normalizeTextRecordPolicy(source, history);
    const normalized = normalizeActiveTextRecord(Object.assign({}, source, {
        hookLabel: formatTextRecordHookLabel(adapter, hook),
        hook,
        methodName,
        windowType: firstNonEmptyString(metadata.windowType),
        ownerType: firstNonEmptyString(metadata.ownerType, adapter),
        x: metadata.x,
        y: metadata.y,
        onScreen: source.visible !== false,
        screenState: source.screenState || (source.visible === false ? 'hidden' : 'visible'),
        lifecycleState: lifecycle,
        policy,
        history,
    }));
    normalized.sourceAdapter = adapter;
    normalized.priority = source.priority;
    normalized.backgrounded = source.backgrounded === true;
    normalized.active = source.active === true;
    normalized.policy = policy;
    normalized.lifecycleState = lifecycle;
    normalized.displayLifecycle = lifecycle;
    return normalized;
}

function summarizeOrchestratorTextRecords(active, detached, archived) {
    const records = active.concat(detached, archived);
    const summary = {
        active: active.length,
        detached: detached.length,
        archived: archived.length,
    };
    records.forEach((record) => {
        const status = normalizeStatusClass(record && record.status);
        summary[status] = (summary[status] || 0) + 1;
    });
    return summary;
}

function formatTextRecordHookLabel(adapter, hook) {
    const adapterLabel = formatAdapterLabel(adapter);
    const hookLabel = hook ? String(hook) : '';
    if (adapterLabel && hookLabel && adapterLabel.toLowerCase() !== hookLabel.toLowerCase()) {
        return `${adapterLabel} ${hookLabel}`;
    }
    return adapterLabel || hookLabel || '-';
}

function formatAdapterLabel(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.toLowerCase() === 'pixi') return 'PIXI';
    return text
        .replace(/[_-]+/gu, ' ')
        .replace(/\b\w/gu, (match) => match.toUpperCase());
}

function firstNonEmptyString(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value) return value;
        if (value !== undefined && value !== null && typeof value !== 'object') {
            const text = String(value);
            if (text) return text;
        }
    }
    return '';
}

function normalizeActiveTextRecord(record) {
    const source = record && typeof record === 'object' ? record : {};
    const history = normalizeRecordHistory(source.history);
    return {
        id: source.id ? String(source.id) : '',
        hook: source.hookLabel ? String(source.hookLabel) : (source.hook ? String(source.hook) : '-'),
        hookKey: source.hook ? String(source.hook) : '',
        surfaceType: source.surfaceType ? String(source.surfaceType) : '',
        original: source.original ? String(source.original) : (source.visibleText ? String(source.visibleText) : ''),
        rawText: source.rawText ? String(source.rawText) : '',
        convertedText: source.convertedText ? String(source.convertedText) : '',
        visibleText: source.visibleText ? String(source.visibleText) : '',
        translationSource: source.translationSource ? String(source.translationSource) : '',
        normalizedSource: source.normalizedSource ? String(source.normalizedSource) : '',
        status: source.status ? String(source.status) : 'detected',
        translation: source.translation ? String(source.translation) : (source.translatedText ? String(source.translatedText) : ''),
        translationReceived: source.translationReceived ? String(source.translationReceived) : '',
        translationDrawn: source.translationDrawn ? String(source.translationDrawn) : '',
        firstSeenAt: source.firstSeenAt || source.seenAt || source.lastSeenAt || source.timestamp || null,
        seenAt: source.lastSeenAt || source.seenAt || source.timestamp || null,
        updatedAt: source.updatedAt || source.lastSeenAt || source.seenAt || source.timestamp || null,
        windowType: source.windowType ? String(source.windowType) : '',
        ownerType: source.ownerType ? String(source.ownerType) : '',
        methodName: source.methodName ? String(source.methodName) : '',
        x: source.x,
        y: source.y,
        bounds: source.bounds && typeof source.bounds === 'object' ? Object.assign({}, source.bounds) : null,
        onScreen: source.onScreen !== undefined ? Boolean(source.onScreen) : true,
        screenState: source.screenState ? String(source.screenState) : '',
        disappearedAt: source.disappearedAt || null,
        deactivatedAt: source.deactivatedAt || source.disappearedAt || null,
        lifecycleState: source.lifecycleState ? String(source.lifecycleState) : '',
        priority: source.priority,
        backgrounded: source.backgrounded === true,
        active: source.active === true,
        policy: normalizeTextRecordPolicy(source, history),
        metadata: source.metadata && typeof source.metadata === 'object' ? Object.assign({}, source.metadata) : {},
        history,
    };
}

function normalizeTextRecordPolicy(source, history = null) {
    const record = source && typeof source === 'object' ? source : {};
    const policy = clonePolicyObject(record.policy);
    const events = collectTextRecordPolicyEvents(Array.isArray(history) ? history : normalizeRecordHistory(record.history));
    if (events.length) {
        policy.events = events.slice(-8);
        const latest = events[events.length - 1] || {};
        if (!policy.last) policy.last = Object.assign({}, latest.policy || {}, {
            type: latest.type || '',
            message: latest.message || '',
        });
        for (let index = events.length - 1; index >= 0; index -= 1) {
            const eventPolicy = events[index].policy || {};
            if (!policy.lifecycle && (eventPolicy.lifecycleIntent || eventPolicy.translationAction)) {
                policy.lifecycle = {
                    intent: eventPolicy.lifecycleIntent || '',
                    translationAction: eventPolicy.translationAction || '',
                    priorityAction: eventPolicy.priorityAction || '',
                    priority: eventPolicy.priority,
                    reason: eventPolicy.reason || events[index].message || '',
                };
            }
            if (!policy.priority && (eventPolicy.priorityAction || eventPolicy.priority !== undefined)) {
                policy.priority = {
                    action: eventPolicy.priorityAction || '',
                    priority: eventPolicy.priority,
                    reason: eventPolicy.reason || events[index].message || '',
                    source: eventPolicy.source || '',
                };
            }
            if (policy.lifecycle && policy.priority) break;
        }
    }
    return Object.keys(policy).length ? policy : {};
}

function getTextRecordPolicyDiagnostics(item) {
    if (!item || typeof item !== 'object') return {};
    if (item.policy && typeof item.policy === 'object' && Object.keys(item.policy).length) {
        return clonePolicyObject(item.policy);
    }
    return normalizeTextRecordPolicy(item);
}

function clonePolicyObject(value) {
    if (!value || typeof value !== 'object') return {};
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        return Object.assign({}, value);
    }
}

function collectTextRecordPolicyEvents(history) {
    return (Array.isArray(history) ? history : [])
        .map((entry) => {
            const details = entry && entry.details && typeof entry.details === 'object' ? entry.details : {};
            const policy = extractTextRecordEventPolicy(entry, details);
            if (!policy || !Object.keys(policy).length) return null;
            return {
                at: entry.at || null,
                seq: entry.seq || null,
                type: entry.type || 'event',
                message: entry.message || '',
                policy,
            };
        })
        .filter(Boolean);
}

function extractTextRecordEventPolicy(entry, details) {
    if (details.policy && typeof details.policy === 'object') return Object.assign({}, details.policy);
    if (details.lifecyclePolicy && typeof details.lifecyclePolicy === 'object') return Object.assign({}, details.lifecyclePolicy);
    if (details.priorityPolicy && typeof details.priorityPolicy === 'object') return Object.assign({}, details.priorityPolicy);
    const policy = {};
    if (details.lifecycleIntent) policy.lifecycleIntent = details.lifecycleIntent;
    if (details.priority !== undefined && String(entry && entry.type || '') === 'item.priority_changed') {
        policy.priorityAction = Number(details.priority) <= 100 ? 'demote' : 'set';
        policy.priority = details.priority;
        policy.reason = entry && entry.message ? entry.message : '';
    }
    return policy;
}

function normalizeHistoryEvent(record) {
    const source = record && typeof record === 'object' ? record : {};
    const nestedRecord = source.record && typeof source.record === 'object' ? source.record : {};
    return {
        at: source.at || source.timestamp || null,
        seq: source.seq || null,
        id: source.id
            ? String(source.id)
            : (source.itemId
                ? String(source.itemId)
                : (nestedRecord.id ? String(nestedRecord.id) : '')),
        surfaceId: source.surfaceId ? String(source.surfaceId) : '',
        adapterId: source.adapterId ? String(source.adapterId) : '',
        type: source.type ? String(source.type) : 'event',
        status: source.status ? String(source.status) : (nestedRecord.status ? String(nestedRecord.status) : ''),
        message: source.message ? String(source.message) : '',
        details: source.details && typeof source.details === 'object' ? Object.assign({}, source.details) : {},
        record: nestedRecord && nestedRecord.id ? normalizeActiveTextRecord(nestedRecord) : null,
    };
}

function normalizeRecordHistory(source) {
    const seen = new Set();
    return (Array.isArray(source) ? source : [])
        .map(normalizeHistoryEvent)
        .filter((entry) => {
            if (!entry) return false;
            const seq = entry.seq !== undefined && entry.seq !== null
                ? entry.seq
                : (entry.details && entry.details.seq !== undefined ? entry.details.seq : '');
            const key = `${entry.at || ''}|${seq}|${entry.id || ''}|${entry.type || ''}|${entry.message || ''}|${formatDetails(entry.details)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
}
