// Central text lifecycle tracker for all live-translator hooks.
// Hooks own rendering mechanics; this module owns active text records, status, decisions, and history.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.runtime) {
        globalScope.LiveTranslatorModules.runtime = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-tracker.js.');
    }

    const DEFAULT_FORMER_LIMIT = 100;
    const DEFAULT_UNTRACKABLE_LIMIT = 100;
    const DEFAULT_HISTORY_LIMIT = 800;
    const DEFAULT_DECISION_LIMIT = 80;

    const STATUS_ALIASES = {
        detected: 'detected',
        pending: 'pending',
        translating: 'translating',
        completed: 'completed',
        skipped: 'skipped',
        skip: 'skipped',
        failed: 'failed',
        error: 'failed',
        stale: 'stale',
        removed: 'removed',
        disappeared: 'disappeared',
        disappear: 'disappeared',
        hidden: 'disappeared',
        invisible: 'disappeared',
    };

    const INACTIVE_STATUSES = {
        stale: true,
        removed: true,
        disappeared: true,
    };

    const HOOK_LABELS = {
        bitmap: 'Bitmap',
        sprite_text: 'Sprite Text',
        help_window: 'Help Window',
        drawText: 'Window Draw',
        drawTextEx: 'Window Draw',
        message: 'Game Message',
        pixi: 'PIXI',
    };

    const TRACKABLE_HOOK_CLASSES = {
        help: true,
        message: true,
        pixi: true,
        sprite: true,
        window: true,
    };

    function createTextTracker(options = {}) {
        const {
            settings = {},
            logger = {},
            preview = defaultPreview,
        } = options || {};

        const trackerSettings = settings && settings.textTracker && typeof settings.textTracker === 'object'
            ? settings.textTracker
            : {};
        const formerLimit = normalizePositiveInteger(trackerSettings.formerLimit || trackerSettings.pastLimit, DEFAULT_FORMER_LIMIT);
        const untrackableLimit = normalizePositiveInteger(trackerSettings.untrackableLimit, DEFAULT_UNTRACKABLE_LIMIT);
        const historyLimit = normalizePositiveInteger(trackerSettings.historyLimit, DEFAULT_HISTORY_LIMIT);
        const decisionLimit = normalizePositiveInteger(trackerSettings.decisionLimit, DEFAULT_DECISION_LIMIT);
        const activeRecords = new Map();
        const formerRecords = new Map();
        const untrackableRecords = new Map();
        const history = [];
        let sequence = 0;
        let orderSequence = 0;
        let publishQueued = false;
        let lastSnapshot = null;
        let guiActive = readGuiActiveState();

        function createId(prefix = 'text') {
            const normalizedPrefix = String(prefix || 'text').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'text';
            sequence += 1;
            return `${normalizedPrefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
        }

        function normalizeStatus(status, fallback = 'detected') {
            return normalizeTrackerStatus(status, fallback);
        }

        function hookLabelForSource(source) {
            const normalized = String(source || '').trim();
            if (HOOK_LABELS[normalized]) return HOOK_LABELS[normalized];
            if (!normalized) return 'Unknown';
            return normalized
                .replace(/[_-]+/g, ' ')
                .replace(/\b\w/g, (match) => match.toUpperCase());
        }

        function getRecordId(input, fallbackPrefix = 'text') {
            if (input && typeof input === 'object') {
                const explicit = input.id || input.recordId;
                if (explicit) return String(explicit);
                if (input.hook) return createId(input.hook);
            }
            if (typeof input === 'string' && input) return input;
            return createId(fallbackPrefix);
        }

        function getProvidedRecordId(input) {
            if (input && typeof input === 'object') {
                const explicit = input.id || input.recordId;
                return explicit ? String(explicit) : '';
            }
            return typeof input === 'string' && input ? input : '';
        }

        function normalizeRecordInput(input = {}) {
            const source = input && typeof input === 'object' ? input : {};
            const hook = source.hook || source.source || 'unknown';
            const original = firstString(
                source.original,
                source.visibleText,
                source.convertedText,
                source.rawText,
                source.text
            );
            const normalizedSource = firstString(source.normalizedSource, source.translationSource);
            const hasTranslationReceived = Object.prototype.hasOwnProperty.call(source, 'translationReceived')
                || Object.prototype.hasOwnProperty.call(source, 'receivedTranslation');
            const hasTranslationDrawn = Object.prototype.hasOwnProperty.call(source, 'translationDrawn')
                || Object.prototype.hasOwnProperty.call(source, 'drawnTranslation')
                || Object.prototype.hasOwnProperty.call(source, 'drawnText');
            return {
                hook: String(hook || 'unknown'),
                hookLabel: firstString(source.hookLabel, source.hookName) || hookLabelForSource(hook),
                surfaceType: firstString(source.surfaceType, source.mode),
                windowType: firstString(source.windowType),
                ownerType: firstString(source.ownerType),
                methodName: firstString(source.methodName),
                rawText: firstString(source.rawText),
                convertedText: firstString(source.convertedText),
                visibleText: firstString(source.visibleText, source.original, source.text),
                original,
                translationSource: firstString(source.translationSource),
                normalizedSource,
                translation: firstString(source.translation, source.translatedText),
                translationReceived: hasTranslationReceived
                    ? firstString(source.translationReceived, source.receivedTranslation)
                    : undefined,
                translationDrawn: hasTranslationDrawn
                    ? firstString(source.translationDrawn, source.drawnTranslation, source.drawnText)
                    : undefined,
                status: normalizeStatus(source.status || source.translationStatus, 'detected'),
                x: normalizeFiniteNumber(source.x),
                y: normalizeFiniteNumber(source.y),
                bounds: normalizeBounds(source.bounds),
                onScreen: normalizeOptionalBoolean(source.onScreen !== undefined ? source.onScreen : source.visible),
                screenState: firstString(source.screenState),
                disappearedAt: normalizeFiniteNumber(source.disappearedAt),
                deactivatedAt: normalizeFiniteNumber(source.deactivatedAt),
                trackable: normalizeOptionalBoolean(source.trackable),
                trackerState: firstString(source.trackerState, source.lifecycle),
                metadata: pickPrimitiveObject(source.metadata || source.extraInfo || {}),
            };
        }

        function upsert(input = {}, decision = null) {
            if (!isEnabled()) return null;
            const id = getRecordId(input, input && input.hook ? input.hook : 'text');
            const now = Date.now();
            const normalized = normalizeRecordInput(input);
            let record = findRecord(id);
            if (!record) {
                const order = nextRecordOrder();
                record = {
                    id,
                    hook: normalized.hook,
                    hookLabel: normalized.hookLabel,
                    surfaceType: normalized.surfaceType,
                    status: normalized.status || 'detected',
                    original: normalized.original,
                    rawText: normalized.rawText,
                    convertedText: normalized.convertedText,
                    visibleText: normalized.visibleText,
                    translationSource: normalized.translationSource,
                    normalizedSource: normalized.normalizedSource,
                    translation: normalized.translation,
                    translationReceived: normalized.translationReceived,
                    translationDrawn: normalized.translationDrawn,
                    x: normalized.x,
                    y: normalized.y,
                    bounds: normalized.bounds,
                    onScreen: normalized.onScreen !== undefined ? normalized.onScreen : !INACTIVE_STATUSES[normalized.status],
                    screenState: normalized.screenState || (INACTIVE_STATUSES[normalized.status] ? normalized.status : 'visible'),
                    disappearedAt: normalized.disappearedAt,
                    deactivatedAt: normalized.deactivatedAt,
                    trackerState: normalized.trackerState,
                    trackable: normalized.trackable,
                    windowType: normalized.windowType,
                    ownerType: normalized.ownerType,
                    methodName: normalized.methodName,
                    metadata: normalized.metadata,
                    firstSeenAt: now,
                    seenAt: now,
                    updatedAt: now,
                    order,
                    decisions: [],
                };
            } else {
                assignDefined(record, normalized);
                record.seenAt = now;
                record.updatedAt = now;
                record.order = nextRecordOrder();
            }
            if (record.disappearedAt && !record.deactivatedAt) record.deactivatedAt = record.disappearedAt;
            if (decision) {
                addDecision(record, decision.type || 'update', decision.message || '', decision.details || null);
            }
            placeRecord(record);
            schedulePublish();
            return record;
        }

        function detect(input = {}) {
            if (!isEnabled()) return getProvidedRecordId(input);
            const record = upsert(
                Object.assign({}, input, { status: input.status || input.translationStatus || 'detected' }),
                {
                    type: 'detected',
                    message: input.message || '',
                    details: input.details || null,
                }
            );
            return record.id;
        }

        function update(id, patch = {}, decision = null) {
            if (!isEnabled()) return null;
            if (!id) return null;
            const key = String(id);
            const existing = findRecord(key);
            if (!existing) {
                addMissingUpdateHistory(key, patch, decision);
                schedulePublish();
                return null;
            }
            const terminalStatus = formerRecords.has(key) && INACTIVE_STATUSES[normalizeStatus(existing.status)]
                ? normalizeStatus(existing.status)
                : '';
            const terminalScreenState = terminalStatus ? (existing.screenState || terminalStatus) : '';
            const terminalDeactivatedAt = terminalStatus ? (existing.deactivatedAt || existing.disappearedAt || existing.updatedAt || Date.now()) : null;
            const normalized = normalizeRecordInput(Object.assign({}, existing, patch));
            assignDefined(existing, normalized);
            if (terminalStatus) {
                existing.status = terminalStatus;
                existing.onScreen = false;
                existing.screenState = terminalScreenState;
                existing.deactivatedAt = terminalDeactivatedAt;
                if (!existing.disappearedAt && terminalStatus === 'disappeared') existing.disappearedAt = terminalDeactivatedAt;
            }
            existing.updatedAt = Date.now();
            existing.seenAt = patch && Object.prototype.hasOwnProperty.call(patch, 'seenAt')
                ? patch.seenAt
                : existing.seenAt;
            existing.order = nextRecordOrder();
            if (decision) {
                addDecision(existing, decision.type || 'update', decision.message || '', decision.details || null);
            }
            placeRecord(existing);
            schedulePublish();
            return existing;
        }

        function setStatus(id, status, details = null) {
            return update(id, { status: normalizeStatus(status) }, {
                type: `status.${normalizeStatus(status)}`,
                details,
            });
        }

        function decision(id, type, message = '', details = null) {
            if (!isEnabled()) return null;
            const record = findRecord(String(id || ''));
            if (!record) {
                addHistory({
                    id: String(id || ''),
                    type: String(type || 'decision'),
                    status: 'missing',
                    message: String(message || ''),
                    details: pickPrimitiveObject(Object.assign({ missingActiveRecord: true }, details || {})),
                });
                schedulePublish();
                return null;
            }
            addDecision(record, type || 'decision', message || '', details || null);
            schedulePublish();
            return record;
        }

        function request(id, details = null) {
            return setStatus(id, 'pending', details);
        }

        function translating(id, details = null) {
            return setStatus(id, 'translating', details);
        }

        function complete(id, translation, details = null) {
            const existing = findRecord(String(id || ''));
            const translated = typeof translation === 'string' ? translation : '';
            const detailSource = details && typeof details === 'object' ? details : {};
            const received = firstString(detailSource.translationReceived, detailSource.receivedTranslation);
            const patch = {
                status: 'completed',
                translation: translated,
            };
            if (received) {
                patch.translationReceived = received;
            } else if (translated && (!existing || !existing.translationReceived)) {
                patch.translationReceived = translated;
            }
            return update(id, patch, {
                type: 'translation.completed',
                details,
            });
        }

        function skip(id, reason = '', details = null) {
            return update(id, { status: 'skipped' }, {
                type: 'translation.skipped',
                message: reason || '',
                details,
            });
        }

        function fail(id, reason = '', details = null) {
            return update(id, { status: 'failed' }, {
                type: 'translation.failed',
                message: reason || '',
                details,
            });
        }

        function stale(id, reason = '', details = null) {
            return archiveAndDelete(id, 'stale', reason, details);
        }

        function disappear(id, reason = '', details = null) {
            return archiveAndDelete(id, 'disappeared', reason, details);
        }

        function remove(id, reason = '', details = null) {
            return archiveAndDelete(id, 'removed', reason, details);
        }

        function draw(id, event = 'draw', details = null) {
            const drawDetails = details && typeof details === 'object' ? details : {};
            const drawnText = firstString(
                drawDetails.translationDrawn,
                drawDetails.drawnTranslation,
                drawDetails.drawnText,
                drawDetails.text
            );
            const receivedText = firstString(
                drawDetails.translationReceived,
                drawDetails.receivedTranslation
            );
            if (drawnText || receivedText) {
                const patch = {};
                if (receivedText) patch.translationReceived = receivedText;
                if (drawnText) {
                    patch.translation = drawnText;
                    patch.translationDrawn = drawnText;
                }
                return update(id, patch, {
                    type: `draw.${event || 'event'}`,
                    details,
                });
            }
            return decision(id, `draw.${event || 'event'}`, '', details);
        }

        function translationEvent(event, text, result = null, context = {}) {
            if (!isEnabled()) return null;
            const id = context && context.recordId ? String(context.recordId) : '';
            if (!id) return null;
            const normalizedText = String(text ?? '').trim();
            const translated = typeof result === 'string' ? result : '';
            const receivedEvent = event === 'cache_hit' || event === 'precache_hit' || event === 'completed';
            const rawDetails = Object.assign({}, context, {
                text: normalizedText,
                resultPreview: translated ? preview(translated) : '',
            });
            if (receivedEvent && translated) rawDetails.translationReceived = translated;
            const details = pickPrimitiveObject(rawDetails);

            switch (event) {
                case 'request':
                    return updateFromTranslationEvent(id, 'pending', 'translation.request', '', normalizedText, translated, context, details);
                case 'cache_miss':
                    return updateFromTranslationEvent(id, 'translating', 'translation.cache_miss', '', normalizedText, translated, context, Object.assign({}, details, { source: 'provider' }));
                case 'cache_hit':
                    return updateFromTranslationEvent(id, 'completed', 'translation.completed', '', normalizedText, translated, context, Object.assign({}, details, { source: 'cache' }));
                case 'precache_hit':
                    return updateFromTranslationEvent(id, 'completed', 'translation.completed', '', normalizedText, translated, context, Object.assign({}, details, { source: 'precache' }));
                case 'completed':
                    return updateFromTranslationEvent(id, 'completed', 'translation.completed', '', normalizedText, translated, context, Object.assign({}, details, { source: context.source || 'provider' }));
                case 'skip':
                    return updateFromTranslationEvent(id, 'skipped', 'translation.skipped', translated || 'skipped', normalizedText, translated, context, details);
                case 'aborted':
                case 'error':
                    return updateFromTranslationEvent(id, 'failed', 'translation.failed', translated || 'translation failed', normalizedText, translated, context, details);
                default:
                    return decision(id, `translation.${event || 'event'}`, '', details);
            }
        }

        function get(id) {
            if (!isEnabled()) return null;
            const record = findRecord(String(id || ''));
            return record ? cloneRecord(record) : null;
        }

        function has(id) {
            if (!isEnabled()) return false;
            return Boolean(findRecord(String(id || '')));
        }

        function snapshot() {
            if (!isEnabled()) return createEmptySnapshot();
            const active = sortActiveRecords(activeRecords).map(cloneRecord);
            const former = sortFormerRecords(formerRecords).map(cloneRecord);
            const untrackable = sortUntrackableRecords(untrackableRecords).map(cloneRecord);
            return {
                active,
                former,
                untrackable,
                history: history.slice(),
                summary: summarize(active, former, untrackable),
                updatedAt: Date.now(),
            };
        }

        function publishNow() {
            publishQueued = false;
            lastSnapshot = isEnabled() ? snapshot() : createEmptySnapshot();
            try { globalScope.LiveTranslatorTextSnapshot = lastSnapshot; } catch (_) {}
            return lastSnapshot;
        }

        function schedulePublish() {
            if (!isEnabled()) return;
            if (publishQueued) return;
            publishQueued = true;
            const schedule = typeof globalScope.setTimeout === 'function'
                ? globalScope.setTimeout.bind(globalScope)
                : setTimeout;
            schedule(publishNow, 0);
        }

        function archiveAndDelete(id, status, reason, details) {
            if (!isEnabled()) return null;
            const key = String(id || '');
            const record = findRecord(key);
            if (!record) {
                addHistory({
                    id: key,
                    type: `record.${normalizeStatus(status)}`,
                    status: normalizeStatus(status),
                    message: reason || '',
                    details: pickPrimitiveObject(Object.assign({ missingActiveRecord: true }, details || {})),
                });
                schedulePublish();
                return null;
            }
            const now = Date.now();
            const order = nextRecordOrder();
            record.status = normalizeStatus(status);
            record.updatedAt = now;
            record.seenAt = record.updatedAt;
            record.order = order;
            record.deactivatedOrder = order;
            record.onScreen = false;
            record.screenState = record.status;
            record.deactivatedAt = now;
            if (record.status === 'disappeared') {
                record.disappearedAt = now;
            }
            addDecision(record, `record.${record.status}`, reason || '', details || null);
            activeRecords.delete(key);
            if (isLifecycleTrackable(record)) {
                untrackableRecords.delete(key);
                record.trackerState = 'former';
                formerRecords.set(key, record);
                pruneFormerRecords();
            } else {
                formerRecords.delete(key);
                record.trackerState = 'untrackable';
                untrackableRecords.set(key, record);
                pruneUntrackableRecords();
            }
            schedulePublish();
            return cloneRecord(record);
        }

        function addDecision(record, type, message = '', details = null) {
            if (!record) return;
            const event = {
                at: Date.now(),
                id: record.id,
                hook: record.hook,
                hookLabel: record.hookLabel,
                status: record.status,
                type: String(type || 'decision'),
                message: String(message || ''),
                details: pickPrimitiveObject(details || {}),
            };
            record.decisions.push(event);
            while (record.decisions.length > decisionLimit) {
                record.decisions.shift();
            }
            addHistory(event);
        }

        function addMissingUpdateHistory(id, patch = {}, decision = null) {
            const normalizedPatch = normalizeRecordInput(patch || {});
            const details = Object.assign(
                {},
                decision && decision.details && typeof decision.details === 'object' ? decision.details : {},
                {
                    missingActiveRecord: true,
                    patchHook: normalizedPatch.hook || '',
                    patchOriginalPreview: preview(normalizedPatch.original || normalizedPatch.visibleText || normalizedPatch.normalizedSource || ''),
                    patchTranslationPreview: preview(normalizedPatch.translation || ''),
                }
            );
            addHistory({
                id,
                type: decision && decision.type ? String(decision.type) : 'record.missing_update',
                status: normalizedPatch.status || '',
                message: decision && decision.message ? String(decision.message) : 'active record missing',
                details: pickPrimitiveObject(details),
            });
        }

        function updateFromTranslationEvent(id, status, type, message, normalizedText, translated, context, details) {
            return update(id, buildTranslationEventPatch(status, normalizedText, translated, context), {
                type,
                message,
                details,
            });
        }

        function buildTranslationEventPatch(status, normalizedText, translated, context = {}) {
            const source = context && typeof context === 'object' ? context : {};
            const hook = source.hook ? String(source.hook) : '';
            const text = firstString(source.normalizedSource, normalizedText);
            const patch = {
                status: normalizeStatus(status),
                translationSource: text,
                normalizedSource: text,
            };
            if (text) {
                patch.original = text;
                patch.visibleText = text;
            }
            if (translated) {
                patch.translation = translated;
                if (normalizeStatus(status) === 'completed') {
                    patch.translationReceived = translated;
                }
            }
            if (hook) {
                patch.hook = hook;
                patch.hookLabel = hookLabelForSource(hook);
                patch.methodName = hook;
                patch.surfaceType = inferSurfaceTypeForHook(hook);
            }
            return patch;
        }

        function inferSurfaceTypeForHook(hook) {
            const value = String(hook || '').toLowerCase();
            if (value.includes('drawtext') || value.includes('window')) return 'window';
            if (value.includes('sprite')) return 'sprite';
            if (value.includes('pixi')) return 'pixi';
            if (value.includes('bitmap')) return 'bitmap';
            if (value.includes('message')) return 'window';
            if (value.includes('help')) return 'window';
            return '';
        }

        function addHistory(event) {
            history.push(Object.assign({ at: Date.now() }, event || {}));
            while (history.length > historyLimit) {
                history.shift();
            }
        }

        function isEnabled() {
            syncGuiActiveState();
            return guiActive;
        }

        function setGuiActive(active) {
            const wasActive = guiActive;
            writeGuiActiveState(!!active);
            syncGuiActiveState();
            if (guiActive && guiActive !== wasActive) publishNow();
            return guiActive;
        }

        function syncGuiActiveState() {
            const active = readGuiActiveState();
            if (active === guiActive) return;
            guiActive = active;
            if (!guiActive) {
                clearTrackerState();
                publishNow();
            }
        }

        function clearTrackerState() {
            activeRecords.clear();
            formerRecords.clear();
            untrackableRecords.clear();
            history.length = 0;
            publishQueued = false;
        }

        function createEmptySnapshot() {
            return {
                active: [],
                former: [],
                untrackable: [],
                history: [],
                summary: {
                    active: 0,
                    former: 0,
                    untrackable: 0,
                    detected: 0,
                    pending: 0,
                    translating: 0,
                    completed: 0,
                    skipped: 0,
                    failed: 0,
                    stale: 0,
                    removed: 0,
                    disappeared: 0,
                    history: 0,
                    enabled: false,
                },
                updatedAt: Date.now(),
            };
        }

        function nextRecordOrder() {
            orderSequence += 1;
            return orderSequence;
        }

        function findRecord(id) {
            const key = String(id || '');
            return activeRecords.get(key) || untrackableRecords.get(key) || formerRecords.get(key) || null;
        }

        function placeRecord(record) {
            if (!record || !record.id) return;
            const key = String(record.id);
            const inactive = INACTIVE_STATUSES[normalizeStatus(record.status)];
            activeRecords.delete(key);
            formerRecords.delete(key);
            untrackableRecords.delete(key);

            if (isLifecycleTrackable(record) && !inactive) {
                record.trackerState = 'active';
                record.trackable = true;
                record.onScreen = true;
                record.deactivatedAt = null;
                record.disappearedAt = null;
                record.deactivatedOrder = 0;
                if (!record.screenState || INACTIVE_STATUSES[normalizeStatus(record.screenState, '')]) {
                    record.screenState = 'visible';
                }
                activeRecords.set(key, record);
                return;
            }

            if (isLifecycleTrackable(record) && inactive) {
                record.trackerState = 'former';
                record.trackable = true;
                record.onScreen = false;
                record.screenState = record.screenState || normalizeStatus(record.status);
                record.deactivatedAt = record.deactivatedAt || record.disappearedAt || record.updatedAt || Date.now();
                formerRecords.set(key, record);
                pruneFormerRecords();
                return;
            }

            record.trackerState = 'untrackable';
            record.trackable = false;
            if (inactive) {
                record.onScreen = false;
                record.screenState = record.screenState || normalizeStatus(record.status);
                record.deactivatedAt = record.deactivatedAt || record.disappearedAt || record.updatedAt || Date.now();
            } else {
                record.deactivatedAt = null;
                record.disappearedAt = null;
                record.deactivatedOrder = 0;
                if (!record.screenState || INACTIVE_STATUSES[normalizeStatus(record.screenState, '')]) {
                    record.screenState = 'observed';
                }
            }
            untrackableRecords.set(key, record);
            pruneUntrackableRecords();
        }

        function pruneFormerRecords() {
            pruneMapToLimit(formerRecords, formerLimit, getRecordDeactivatedAt, getRecordDeactivatedOrder);
        }

        function pruneUntrackableRecords() {
            pruneMapToLimit(untrackableRecords, untrackableLimit, getRecordActivityAt);
        }

        function pruneMapToLimit(map, limit, score, order = getRecordOrder) {
            if (!map || map.size <= limit) return;
            const rows = Array.from(map.entries()).sort((a, b) => {
                const scoreDiff = score(a[1]) - score(b[1]);
                if (scoreDiff) return scoreDiff;
                return order(a[1]) - order(b[1]);
            });
            while (rows.length && map.size > limit) {
                const [id] = rows.shift();
                if (id) map.delete(id);
            }
        }

        function sortActiveRecords(map) {
            return Array.from(map.values())
                .sort((a, b) => compareRecordsDescending(a, b, getRecordActivityAt));
        }

        function sortFormerRecords(map) {
            return Array.from(map.values())
                .sort((a, b) => compareRecordsDescending(a, b, getRecordDeactivatedAt, getRecordDeactivatedOrder));
        }

        function sortUntrackableRecords(map) {
            return Array.from(map.values())
                .sort((a, b) => compareRecordsDescending(a, b, getRecordActivityAt));
        }

        function compareRecordsDescending(a, b, score, order = getRecordOrder) {
            const scoreDiff = score(b) - score(a);
            if (scoreDiff) return scoreDiff;
            return order(b) - order(a);
        }

        function getRecordActivityAt(record) {
            return Number(record && (record.updatedAt || record.seenAt || record.firstSeenAt || 0)) || 0;
        }

        function getRecordDeactivatedAt(record) {
            return Number(record && (record.deactivatedAt || record.disappearedAt || record.updatedAt || record.seenAt || 0)) || 0;
        }

        function getRecordOrder(record) {
            return Number(record && record.order) || 0;
        }

        function getRecordDeactivatedOrder(record) {
            return Number(record && (record.deactivatedOrder || record.order || 0)) || 0;
        }

        function isLifecycleTrackable(record) {
            if (!record) return false;
            if (record.trackable === false) return false;
            if (record.trackable === true) return true;
            const hookClass = normalizeHookClass(record.hook || record.hookLabel || record.methodName);
            if (hookClass === 'bitmap') return false;
            if (TRACKABLE_HOOK_CLASSES[hookClass]) return true;
            const surfaceClass = normalizeHookClass(record.surfaceType || record.windowType || record.ownerType);
            return !!TRACKABLE_HOOK_CLASSES[surfaceClass];
        }

        function summarize(activeRecords, formerRecordsList, untrackableRecordsList) {
            const counts = {
                active: activeRecords.length,
                former: formerRecordsList.length,
                untrackable: untrackableRecordsList.length,
                detected: 0,
                pending: 0,
                translating: 0,
                completed: 0,
                skipped: 0,
                failed: 0,
                stale: 0,
                removed: 0,
                disappeared: 0,
            };
            activeRecords.forEach((record) => {
                const status = normalizeStatus(record && record.status, 'detected');
                if (!Object.prototype.hasOwnProperty.call(counts, status)) counts[status] = 0;
                counts[status] += 1;
            });
            counts.history = history.length;
            counts.enabled = true;
            return counts;
        }

        const api = {
            __trTextTrackerApi: true,
            isEnabled,
            setGuiActive,
            createId,
            detect,
            upsert,
            update,
            setStatus,
            decision,
            request,
            translating,
            complete,
            skip,
            fail,
            stale,
            disappear,
            remove,
            draw,
            translationEvent,
            get,
            has,
            snapshot,
            publish: publishNow,
        };

        try { globalScope.LiveTranslatorTextTracker = api; } catch (_) {}
        publishNow();
        if (logger && typeof logger.debug === 'function') {
            logger.debug('[TextTracker] Central text tracker initialized.');
        }
        return api;
    }

    function assignDefined(target, source) {
        Object.keys(source || {}).forEach((key) => {
            const value = source[key];
            if (value !== undefined && value !== null) {
                target[key] = value;
            }
        });
    }

    function cloneRecord(record) {
        if (!record) return null;
        return {
            id: record.id,
            hook: record.hook,
            hookLabel: record.hookLabel,
            surfaceType: record.surfaceType,
            status: record.status,
            original: record.original || record.visibleText || record.convertedText || record.rawText || '',
            rawText: record.rawText || '',
            convertedText: record.convertedText || '',
            visibleText: record.visibleText || '',
            translationSource: record.translationSource || '',
            normalizedSource: record.normalizedSource || '',
            translation: record.translation || '',
            translationReceived: record.translationReceived || '',
            translationDrawn: record.translationDrawn || '',
            x: record.x,
            y: record.y,
            bounds: record.bounds ? Object.assign({}, record.bounds) : null,
            onScreen: record.onScreen !== undefined ? !!record.onScreen : !INACTIVE_STATUSES[normalizeTrackerStatus(record.status)],
            screenState: record.screenState || (INACTIVE_STATUSES[normalizeTrackerStatus(record.status)] ? normalizeTrackerStatus(record.status) : 'visible'),
            disappearedAt: record.disappearedAt || null,
            deactivatedAt: record.deactivatedAt || null,
            trackerState: record.trackerState || '',
            trackable: record.trackable === undefined ? undefined : !!record.trackable,
            windowType: record.windowType || '',
            ownerType: record.ownerType || '',
            methodName: record.methodName || '',
            metadata: pickPrimitiveObject(record.metadata || {}),
            firstSeenAt: record.firstSeenAt || null,
            seenAt: record.seenAt || null,
            updatedAt: record.updatedAt || null,
            decisions: Array.isArray(record.decisions)
                ? record.decisions.map((item) => Object.assign({}, item, {
                    details: pickPrimitiveObject(item && item.details ? item.details : {}),
                }))
                : [],
        };
    }

    function firstString(...values) {
        for (const value of values) {
            if (typeof value === 'string') return value;
            if (value !== undefined && value !== null && typeof value !== 'object') return String(value);
        }
        return '';
    }

    function normalizePositiveInteger(value, fallback) {
        const numeric = Number(value);
        return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
    }

    function normalizeTrackerStatus(status, fallback = 'detected') {
        const value = String(status || fallback || 'detected').trim();
        return STATUS_ALIASES[value] || value || fallback;
    }

    function readGuiActiveState() {
        try {
            const state = globalScope.LiveTranslatorGuiState;
            if (state && typeof state === 'object' && state.translatorOpen !== undefined) {
                return state.translatorOpen === true;
            }
        } catch (_) {}
        try {
            const gui = globalScope.LiveTranslatorGui;
            if (gui && typeof gui.isOpen === 'function') return gui.isOpen() === true;
        } catch (_) {}
        return false;
    }

    function writeGuiActiveState(active) {
        try {
            const state = globalScope.LiveTranslatorGuiState && typeof globalScope.LiveTranslatorGuiState === 'object'
                ? globalScope.LiveTranslatorGuiState
                : {};
            state.translatorOpen = active === true;
            state.updatedAt = Date.now();
            globalScope.LiveTranslatorGuiState = state;
        } catch (_) {}
    }

    function normalizeHookClass(hook) {
        const value = String(hook || '').toLowerCase();
        if (value.includes('bitmap')) return 'bitmap';
        if (value.includes('sprite')) return 'sprite';
        if (value.includes('help')) return 'help';
        if (value.includes('message')) return 'message';
        if (value.includes('pixi')) return 'pixi';
        if (value.includes('draw') || value.includes('window')) return 'window';
        return 'unknown';
    }

    function normalizeFiniteNumber(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : undefined;
    }

    function normalizeOptionalBoolean(value) {
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        const normalized = String(value).trim().toLowerCase();
        if (!normalized) return undefined;
        if (['true', '1', 'yes', 'y', 'visible', 'on', 'onscreen'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n', 'hidden', 'off', 'offscreen', 'disappeared'].includes(normalized)) return false;
        return undefined;
    }

    function normalizeBounds(bounds) {
        if (!bounds || typeof bounds !== 'object') return null;
        const x1 = Number(bounds.x1);
        const y1 = Number(bounds.y1);
        const x2 = Number(bounds.x2);
        const y2 = Number(bounds.y2);
        if ([x1, y1, x2, y2].every(Number.isFinite)) {
            return { x1, y1, x2, y2 };
        }
        const x = Number(bounds.x);
        const y = Number(bounds.y);
        const w = Number(bounds.w !== undefined ? bounds.w : bounds.width);
        const h = Number(bounds.h !== undefined ? bounds.h : bounds.height);
        if ([x, y, w, h].every(Number.isFinite)) {
            return { x1: x, y1: y, x2: x + w, y2: y + h };
        }
        return null;
    }

    function pickPrimitiveObject(value) {
        const output = {};
        if (!value || typeof value !== 'object') return output;
        Object.keys(value).forEach((key) => {
            const picked = pickSerializableValue(value[key], 2);
            if (picked !== undefined) {
                output[key] = picked;
            }
        });
        return output;
    }

    function pickSerializableValue(value, depth) {
        if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
        if (depth <= 0) return String(value);
        if (Array.isArray(value)) {
            return value.slice(0, 12).map((item) => pickSerializableValue(item, depth - 1));
        }
        if (typeof value === 'object') {
            const output = {};
            Object.keys(value).slice(0, 24).forEach((key) => {
                const picked = pickSerializableValue(value[key], depth - 1);
                if (picked !== undefined) output[key] = picked;
            });
            return output;
        }
        return undefined;
    }

    function defaultPreview(text, max = 48) {
        const s = String(text ?? '').replace(/\s+/g, ' ').trim();
        if (s.length <= max) return s;
        return s.slice(0, Math.max(0, max - 1)) + '...';
    }

    defineRuntimeModule('runtime.textTracker', {
        createTextTracker,
    });
})();
