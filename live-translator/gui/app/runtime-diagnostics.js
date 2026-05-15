// Translator monitor runtime diagnostics helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
'use strict';

function normalizeDiagnosticsSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const source = snapshot;
    const jobs = source.jobs && typeof source.jobs === 'object' ? source.jobs : {};
    return {
        updatedAt: source.updatedAt || null,
        provider: normalizeDiagnosticProvider(source.provider),
        summary: normalizeDiagnosticSummary(source.summary),
        cache: normalizeDiagnosticCache(source.cache),
        jobs: {
            running: Array.isArray(jobs.running) ? jobs.running.map(normalizeDiagnosticJob) : [],
            queued: Array.isArray(jobs.queued) ? jobs.queued.map(normalizeDiagnosticJob) : [],
            past: Array.isArray(jobs.past) ? jobs.past.map(normalizeDiagnosticJob) : [],
        },
        priorityBuckets: Array.isArray(source.priorityBuckets)
            ? source.priorityBuckets.map(normalizeBreakdownRow)
            : [],
        hooks: Array.isArray(source.hooks)
            ? source.hooks.map(normalizeBreakdownRow)
            : [],
        counters: source.counters && typeof source.counters === 'object' ? Object.assign({}, source.counters) : {},
        events: Array.isArray(source.events) ? source.events.map(normalizeDiagnosticEvent) : [],
        detailView: source.detailView === true,
    };
}

function normalizeDrawCaptureTraceSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    return {
        updatedAt: snapshot.updatedAt || null,
        enabled: snapshot.enabled !== false,
        limit: normalizeInteger(snapshot.limit),
        size: normalizeInteger(snapshot.size),
        sequence: normalizeInteger(snapshot.sequence),
        filters: snapshot.filters && typeof snapshot.filters === 'object' ? Object.assign({}, snapshot.filters) : {},
        summary: snapshot.summary && typeof snapshot.summary === 'object' ? Object.assign({}, snapshot.summary) : {},
        events: Array.isArray(snapshot.events) ? snapshot.events.map(normalizeDrawCaptureTraceEvent) : [],
    };
}

function normalizeDrawCaptureTraceEvent(event) {
    const source = event && typeof event === 'object' ? event : {};
    return {
        seq: source.seq || null,
        at: source.at || null,
        stage: source.stage ? String(source.stage) : 'draw',
        adapter: source.adapter ? String(source.adapter) : '',
        methodName: source.methodName ? String(source.methodName) : '',
        rawText: source.rawText ? String(source.rawText) : '',
        visibleText: source.visibleText ? String(source.visibleText) : '',
        normalizedText: source.normalizedText ? String(source.normalizedText) : '',
        reason: source.reason ? String(source.reason) : '',
        category: source.category ? String(source.category) : '',
        status: source.status ? String(source.status) : '',
        windowType: source.windowType ? String(source.windowType) : '',
        ownerType: source.ownerType ? String(source.ownerType) : '',
        recordId: source.recordId ? String(source.recordId) : '',
        slotKey: source.slotKey ? String(source.slotKey) : '',
        x: source.x,
        y: source.y,
        maxWidth: source.maxWidth,
        lineHeight: source.lineHeight,
        align: source.align ? String(source.align) : '',
        bounds: source.bounds && typeof source.bounds === 'object' ? Object.assign({}, source.bounds) : null,
        details: Object.assign({}, source),
    };
}

function normalizeForesightSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    return {
        updatedAt: snapshot.updatedAt || null,
        summary: snapshot.summary && typeof snapshot.summary === 'object'
            ? Object.assign({}, snapshot.summary)
            : null,
        recent: Array.isArray(snapshot.recent)
            ? snapshot.recent.map(normalizeForesightScan)
            : [],
        detailView: snapshot.detailView === true,
    };
}

function normalizeForesightScan(scan) {
    const source = scan && typeof scan === 'object' ? scan : {};
    return {
        at: source.at || null,
        interpreterId: source.interpreterId ? String(source.interpreterId) : '',
        status: source.status ? String(source.status) : 'scanned',
        matchedCurrentMessage: source.matchedCurrentMessage === true,
        startIndex: normalizeNullableInteger(source.startIndex),
        stopIndex: normalizeNullableInteger(source.stopIndex),
        stopReason: source.stopReason ? String(source.stopReason) : '',
        stopReasonLabel: source.stopReasonLabel ? String(source.stopReasonLabel) : '',
        barrierCode: normalizeNullableInteger(source.barrierCode),
        barrierLabel: source.barrierLabel ? String(source.barrierLabel) : '',
        budget: cloneForesightValue(source.budget, 0),
        scannedCommands: normalizeInteger(source.scannedCommands),
        advancedCommands: normalizeInteger(source.advancedCommands),
        staleRiskCommands: normalizeInteger(source.staleRiskCommands),
        staleRiskCommandCounts: clonePlainObject(source.staleRiskCommandCounts),
        staleRiskCommandLabels: clonePlainObject(source.staleRiskCommandLabels),
        blocks: normalizeInteger(source.blocks),
        routeCommands: normalizeInteger(source.routeCommands),
        routeBarriers: normalizeInteger(source.routeBarriers),
        routeBarrierCode: normalizeNullableInteger(source.routeBarrierCode),
        routeBarrierLabel: source.routeBarrierLabel ? String(source.routeBarrierLabel) : '',
        routeBarrierReason: source.routeBarrierReason ? String(source.routeBarrierReason) : '',
        transparentCommands: clonePlainObject(source.transparentCommands),
        transparentCommandLabels: clonePlainObject(source.transparentCommandLabels),
        pathStops: cloneForesightList(source.pathStops),
        commandActionLimit: normalizeInteger(source.commandActionLimit),
        commandActionsTruncated: normalizeInteger(source.commandActionsTruncated),
        commandActions: Array.isArray(source.commandActions)
            ? source.commandActions.map(normalizeForesightCommandAction)
            : [],
    };
}

function normalizeForesightCommandAction(action) {
    const source = action && typeof action === 'object' ? action : {};
    return {
        index: normalizeNullableInteger(source.index),
        code: normalizeNullableInteger(source.code),
        label: source.label ? String(source.label) : '',
        classification: source.classification ? String(source.classification) : '',
        native: source.native === true,
        category: source.category ? String(source.category) : '',
        scanBehavior: source.scanBehavior ? String(source.scanBehavior) : '',
        action: source.action ? String(source.action) : '',
        stalenessRisk: source.stalenessRisk ? String(source.stalenessRisk) : '',
        stopReason: source.stopReason ? String(source.stopReason) : '',
        stopReasonLabel: source.stopReasonLabel ? String(source.stopReasonLabel) : '',
        summary: source.summary ? String(source.summary) : '',
        priorityDistance: normalizeNullableInteger(source.priorityDistance),
        branchDepth: normalizeInteger(source.branchDepth),
        branchPath: Array.isArray(source.branchPath)
            ? source.branchPath.map(normalizeNullableInteger).filter((value) => value !== null)
            : [],
        listContext: cloneForesightValue(source.listContext, 0),
        nestedList: cloneForesightValue(source.nestedList, 0),
        budget: cloneForesightValue(source.budget, 0),
        consumedCommands: cloneForesightList(source.consumedCommands),
        routeCommandActions: cloneForesightList(source.routeCommandActions),
        controlFlowTarget: cloneForesightValue(source.controlFlowTarget, 0),
        branches: Array.isArray(source.branches) ? cloneForesightList(source.branches) : [],
    };
}

function cloneForesightList(value) {
    return Array.isArray(value) ? value.map((entry) => cloneForesightValue(entry, 0)) : [];
}

function cloneForesightValue(value, depth) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (depth >= 4) return '[Object]';
    if (Array.isArray(value)) return value.slice(0, 32).map((entry) => cloneForesightValue(entry, depth + 1));
    if (typeof value !== 'object') return String(value);
    const result = {};
    Object.keys(value).slice(0, 32).forEach((key) => {
        result[key] = cloneForesightValue(value[key], depth + 1);
    });
    return result;
}

function clonePlainObject(value) {
    const result = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    Object.keys(value).forEach((key) => {
        const entry = value[key];
        if (entry === null || entry === undefined) return;
        result[key] = typeof entry === 'object' ? cloneForesightValue(entry, 0) : entry;
    });
    return result;
}

function normalizeNullableInteger(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function normalizeDiagnosticProvider(provider) {
    const source = provider && typeof provider === 'object' ? provider : {};
    return {
        kind: source.kind ? String(source.kind) : '',
        cacheOnly: source.cacheOnly === true,
        capacity: normalizeInteger(source.capacity),
        running: normalizeInteger(source.running),
        available: normalizeInteger(source.available),
        refreshingCapacity: source.refreshingCapacity === true,
        capacityExpiresAt: source.capacityExpiresAt || null,
        capacityRefreshMs: normalizeInteger(source.capacityRefreshMs),
        lastCapacityRefreshAt: source.lastCapacityRefreshAt || null,
        lastCapacityRefreshError: source.lastCapacityRefreshError ? String(source.lastCapacityRefreshError) : '',
    };
}

function normalizeDiagnosticSummary(summary) {
    const source = summary && typeof summary === 'object' ? summary : {};
    return {
        queued: normalizeInteger(source.queued),
        running: normalizeInteger(source.running),
        jobs: normalizeInteger(source.jobs),
        pastJobs: normalizeInteger(source.pastJobs),
        activeSubscribers: normalizeInteger(source.activeSubscribers),
        subscribers: normalizeInteger(source.subscribers),
        streamJobs: normalizeInteger(source.streamJobs),
        streamRunning: normalizeInteger(source.streamRunning),
        completedCacheEntries: normalizeInteger(source.completedCacheEntries),
        pumpScheduled: source.pumpScheduled === true,
        pumpRunning: source.pumpRunning === true,
    };
}

function normalizeDiagnosticCache(cache) {
    const source = cache && typeof cache === 'object' ? cache : {};
    const precache = source.precache && typeof source.precache === 'object' ? source.precache : {};
    return {
        completed: normalizeInteger(source.completed),
        diskEnabled: source.diskEnabled === true,
        precache: {
            active: precache.active === true,
            records: normalizeInteger(precache.records),
            translatedRecords: normalizeInteger(precache.translatedRecords),
            exactKeys: normalizeInteger(precache.exactKeys),
            error: precache.error ? String(precache.error) : '',
        },
    };
}

function normalizeDiagnosticJob(job) {
    const source = job && typeof job === 'object' ? job : {};
    return {
        id: source.id ? String(source.id) : '',
        status: source.status ? String(source.status) : '',
        hook: source.hook ? String(source.hook) : '',
        source: source.source ? String(source.source) : '',
        textPreview: source.textPreview ? String(source.textPreview) : '',
        textLength: normalizeInteger(source.textLength),
        createdAt: source.createdAt || null,
        queuedAt: source.queuedAt || source.createdAt || null,
        startedAt: source.startedAt || null,
        queuePosition: source.queuePosition === null || source.queuePosition === undefined
            ? null
            : normalizeInteger(source.queuePosition),
        effectivePriority: normalizeInteger(source.effectivePriority),
        priorityBucket: source.priorityBucket ? String(source.priorityBucket) : '',
        stream: source.stream === true,
        timeoutMs: normalizeInteger(source.timeoutMs),
        attempt: normalizeInteger(source.attempt),
        retryCount: normalizeInteger(source.retryCount),
        lastRetryAt: source.lastRetryAt || null,
        nextRetryDelayMs: normalizeInteger(source.nextRetryDelayMs),
        lastDeltaAt: source.lastDeltaAt || null,
        deltaCount: normalizeInteger(source.deltaCount),
        lastPartialLength: normalizeInteger(source.lastPartialLength),
        lastError: source.lastError ? String(source.lastError) : '',
        subscribers: normalizeInteger(source.subscribers),
        totalSubscribers: normalizeInteger(source.totalSubscribers),
        subscriberRecords: Array.isArray(source.subscriberRecords)
            ? source.subscriberRecords.map(normalizeDiagnosticSubscriberRecord)
            : [],
        terminalAt: source.terminalAt || null,
        terminalReason: source.terminalReason ? String(source.terminalReason) : '',
        history: Array.isArray(source.history) ? source.history.map(normalizeDiagnosticEvent) : [],
    };
}

function normalizeDiagnosticSubscriberRecord(record) {
    const source = record && typeof record === 'object' ? record : {};
    return {
        id: source.id ? String(source.id) : '',
        status: source.status ? String(source.status) : '',
        recordId: source.recordId ? String(source.recordId) : '',
        hook: source.hook ? String(source.hook) : '',
        source: source.source ? String(source.source) : '',
        priority: normalizeInteger(source.priority),
        stream: source.stream === true,
        createdAt: source.createdAt || null,
        lastPriorityChangedAt: source.lastPriorityChangedAt || null,
        lastPriorityReason: source.lastPriorityReason ? String(source.lastPriorityReason) : '',
    };
}

function normalizeBreakdownRow(row) {
    const source = row && typeof row === 'object' ? row : {};
    return {
        name: source.name ? String(source.name) : 'unknown',
        queued: normalizeInteger(source.queued),
        running: normalizeInteger(source.running),
        stream: normalizeInteger(source.stream),
        subscribers: normalizeInteger(source.subscribers),
    };
}

function normalizeDiagnosticEvent(event) {
    const source = event && typeof event === 'object' ? event : {};
    return {
        id: source.id ? String(source.id) : '',
        at: source.at || null,
        type: source.type ? String(source.type) : 'event',
        hook: source.hook ? String(source.hook) : '',
        jobId: source.jobId ? String(source.jobId) : '',
        subscriberId: source.subscriberId ? String(source.subscriberId) : '',
        recordId: source.recordId ? String(source.recordId) : '',
        priority: source.priority,
        effectivePriority: source.effectivePriority,
        reason: source.reason ? String(source.reason) : '',
        error: source.error ? String(source.error) : '',
        textPreview: source.textPreview ? String(source.textPreview) : '',
        details: Object.assign({}, source),
    };
}

function normalizeInteger(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}
