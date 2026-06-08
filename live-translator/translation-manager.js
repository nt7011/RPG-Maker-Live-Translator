// Translation manager facade.
//
// The public runtime module still exports createTranslationManager and
// createTranslationService. Cache normalization, provider handles, queue
// scheduling, subscriber lifecycle, and compatibility-cache methods live in
// translation-manager/*.js so each file documents one responsibility.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) globalScope.LiveTranslatorModules = {};
    if (!globalScope.LiveTranslatorModules.runtime) globalScope.LiveTranslatorModules.runtime = {};

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translation-manager.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before translation-manager.js.');
    }

    const constants = requireRuntimeModule('runtime.translationManagerConstants');
    const common = requireRuntimeModule('runtime.translationManagerCommon');
    const cache = requireRuntimeModule('runtime.translationManagerCache');
    const handles = requireRuntimeModule('runtime.translationManagerHandles');
    const controllerFacadesModule = requireRuntimeModule('runtime.translationManagerControllerFacades');
    const schedulerPolicyModule = requireRuntimeModule('runtime.translationManagerSchedulerPolicy');
    const controllers = {
        eligibility: requireRuntimeModule('runtime.translationManagerEligibility'),
        jobs: requireRuntimeModule('runtime.translationManagerJobs'),
        subscribers: requireRuntimeModule('runtime.translationManagerSubscribers'),
        requests: requireRuntimeModule('runtime.translationManagerRequests'),
        queue: requireRuntimeModule('runtime.translationManagerQueue'),
        runner: requireRuntimeModule('runtime.translationManagerRunner'),
        api: requireRuntimeModule('runtime.translationManagerApi'),
    };
    const shared = Object.assign({}, constants, common, cache, handles);

    function createTranslationService(options = {}) {
        const logger = shared.bindLogger(options.logger);
        const telemetry = shared.ensureTelemetry(options.telemetry);
        const disk = options.diskCache && typeof options.diskCache === 'object'
            ? options.diskCache
            : { enabled: false };
        const settings = options.settings && typeof options.settings === 'object' ? options.settings : {};
        const preview = typeof options.preview === 'function' ? options.preview : shared.defaultPreview;
        const provider = options.provider || shared.createNoneProvider();
        const isCacheOnlyProvider = options.isCacheOnlyProvider === true || provider.kind === 'none';
        const getCacheEntryLimit = typeof options.getCacheEntryLimit === 'function' ? options.getCacheEntryLimit : () => 0;
        const pruneMapToLimit = typeof options.pruneMapToLimit === 'function' ? options.pruneMapToLimit : shared.noop;
        const precacheStore = options.precacheStore || shared.createPrecacheStore();
        const ignoreTranslationRegexRules = shared.compileIgnoreTranslationRegexRules(settings, logger);
        const overrideTranslationRegexRules = shared.compileOverrideTranslationRegexRules(settings, logger);
        const substitutePlaintextBeforeTranslationRules = shared.compileSubstitutePlaintextBeforeTranslationRules(settings, logger);

        const scope = Object.assign({}, shared, {
            globalScope,
            logger,
            telemetry,
            disk,
            settings,
            preview,
            provider,
            isCacheOnlyProvider,
            getCacheEntryLimit,
            pruneMapToLimit,
            precacheStore,
            ignoreTranslationRegexRules,
            overrideTranslationRegexRules,
            substitutePlaintextBeforeTranslationRules,
            forceAsyncTranslation: shared.isSnapshotForceAsyncTranslationEnabled(settings),
            forceAsyncTranslationDelayMs: 100,
            maxRetries: Math.max(0, Math.floor(shared.getPositiveSetting(settings, ['maxRetries', 'max_retries'], constants.DEFAULT_MAX_RETRIES))),
            retryBaseMs: Math.floor(shared.getPositiveSetting(settings, ['retryBaseMs', 'retry_base_ms'], constants.DEFAULT_RETRY_BASE_MS)),
            retryMaxMs: Math.floor(shared.getPositiveSetting(settings, ['retryMaxMs', 'retry_max_ms'], constants.DEFAULT_RETRY_MAX_MS)),
            capacityRefreshMs: Math.floor(shared.getPositiveSetting(settings, ['capacityRefreshMs', 'capacity_refresh_ms'], constants.DEFAULT_CAPACITY_REFRESH_MS)),
            requestTimeoutMs: Math.floor(shared.getPositiveSetting(settings, ['requestTimeoutMs', 'request_timeout_ms'], constants.DEFAULT_REQUEST_TIMEOUT_MS)),
            controllerFacades: null,
            schedulerPolicy: null,
            requestSequence: 0,
            subscriberSequence: 0,
            queueSequence: 0,
            activeCount: 0,
            providerCapacity: 1,
            providerCapacityVerified: false,
            capacityExpiresAt: 0,
            lastCapacityRefreshAt: 0,
            lastCapacityRefreshError: '',
            capacityPromise: null,
            pumpScheduled: false,
            pumpRunning: false,
            providerAvailability: {
                state: 'unknown',
                unavailableObserved: false,
                changedAt: 0,
                lastReason: '',
                lastMessage: '',
                sequence: 0,
            },
            providerAvailabilityListeners: new Set(),
            providerAvailabilityProbe: {
                timerId: null,
                startedAt: null,
                running: false,
                attempts: 0,
                lastDelayMs: 0,
            },
            jobsByKey: new Map(),
            queuedJobs: [],
            subscribersByRecordId: new Map(),
            completed: shared.createCompletedTranslationMap((key) => {
                const normalized = shared.normalizeCacheKey(key);
                return !!shared.findIgnoredTranslationRegexMatch(normalized, ignoreTranslationRegexRules);
            }),
            translationDiagnostics: null,
        });

        const methodControllers = {
            describeIgnoreTranslationRegex: 'eligibility',
            describeOverrideTranslationRegex: 'eligibility',
            describeSkip: 'eligibility',
            describeEligibility: 'eligibility',
            shouldSkip: 'eligibility',
            shouldIgnoreTranslation: 'eligibility',
            lookupOverrideTranslationRegex: 'eligibility',
            logTranslationEvent: 'eligibility',
            normalizeRequest: 'eligibility',
            requestContext: 'eligibility',
            storeCompletedTranslation: 'eligibility',
            forgetCompletedTranslation: 'eligibility',
            lookupCompleted: 'eligibility',
            finalizeProviderSuccess: 'eligibility',
            resolvePrecacheShortcut: 'eligibility',
            createJob: 'jobs',
            recomputeJobPriority: 'jobs',
            removeQueuedJob: 'jobs',
            forgetJobKey: 'jobs',
            getActiveSubscribers: 'jobs',
            hasActiveSubscribers: 'jobs',
            compareQueuedJobsForDispatch: 'jobs',
            getEnabledReservedPriorityLanes: 'jobs',
            subscriberMatchesReservedLane: 'jobs',
            jobMatchesReservedLane: 'jobs',
            jobMatchesAnyReservedLane: 'jobs',
            countReservedRunningJobs: 'jobs',
            countLaneRunningJobs: 'jobs',
            countLaneQueuedJobs: 'jobs',
            countReservedSlots: 'jobs',
            getNormalDispatchCapacity: 'jobs',
            countNormalRunningJobs: 'jobs',
            hasBlockingReservedLaneWork: 'jobs',
            getReservedLaneDispatchState: 'jobs',
            getNormalDispatchState: 'jobs',
            getQueueDispatchState: 'jobs',
            getReservedPriorityLaneSnapshot: 'jobs',
            unregisterSubscriber: 'subscribers',
            settleSubscriber: 'subscribers',
            cancelSubscriber: 'subscribers',
            setSubscriberPriority: 'subscribers',
            createSubscriber: 'subscribers',
            cancelByRecordId: 'subscribers',
            setPriorityByRecordId: 'subscribers',
            lookup: 'requests',
            request: 'requests',
            shouldStartStreamUpgradeJob: 'requests',
            refreshCapacityIfNeeded: 'queue',
            schedulePump: 'queue',
            pruneQueuedJobs: 'queue',
            takeNextQueuedJob: 'queue',
            dispatchReservedPriorityLaneJobs: 'queue',
            dispatchNormalJobs: 'queue',
            canDispatchQueuedWork: 'queue',
            pump: 'queue',
            createJobController: 'runner',
            notifyDelta: 'runner',
            startJob: 'runner',
            runProviderWithRetries: 'runner',
            shouldRetry: 'runner',
            computeRetryDelayMs: 'runner',
            waitForRetry: 'runner',
            getStats: 'api',
            createCompatibilityCache: 'api',
        };
        const instances = {};
        function getController(key) {
            if (!instances[key]) instances[key] = controllers[key].create(scope);
            return instances[key];
        }
        function callController(methodName, ...args) {
            const key = methodControllers[methodName];
            const controller = key ? getController(key) : null;
            const method = controller && controller[methodName];
            if (typeof method !== 'function') throw new Error('[TranslationService] Missing controller method: ' + methodName);
            return method(...args);
        }
        scope.controllerFacades = controllerFacadesModule.create({ callController });
        Object.keys(methodControllers).forEach((methodName) => {
            scope[methodName] = (...args) => callController(methodName, ...args);
        });
        scope.schedulerPolicy = schedulerPolicyModule.createSchedulerPolicy({
            settings,
            clampPriority: shared.clampPriority,
            getProviderCapacity: () => scope.providerCapacity,
            getActiveCount: () => scope.activeCount,
            getJobs: () => Array.from(scope.jobsByKey.values()),
            getQueuedJobs: () => scope.queuedJobs,
            getActiveSubscribers: (job) => scope.getActiveSubscribers(job),
            hasActiveSubscribers: (job) => scope.hasActiveSubscribers(job),
        });

        scope.getProviderAvailabilitySnapshot = getProviderAvailabilitySnapshot;
        scope.recordProviderAvailability = recordProviderAvailability;
        scope.subscribeProviderAvailability = subscribeProviderAvailability;

        scope.translationDiagnostics = shared.resolveTranslationDiagnosticsFactory()({
            globalScope,
            provider,
            isCacheOnlyProvider,
            settings,
            disk,
            precacheStore,
            preview,
            requestTimeoutMs: scope.requestTimeoutMs,
            capacityRefreshMs: scope.capacityRefreshMs,
            getState: () => ({
                activeCount: scope.activeCount,
                providerCapacity: scope.providerCapacity,
                providerCapacityVerified: scope.providerCapacityVerified === true,
                capacityExpiresAt: scope.capacityExpiresAt,
                lastCapacityRefreshAt: scope.lastCapacityRefreshAt,
                lastCapacityRefreshError: scope.lastCapacityRefreshError,
                capacityRefreshing: !!scope.capacityPromise,
                pumpScheduled: scope.pumpScheduled,
                pumpRunning: scope.pumpRunning,
                jobs: Array.from(scope.jobsByKey.values()),
                queuedJobs: scope.queuedJobs.slice(),
                completedSize: scope.completed.size,
                reservedPriorityLanes: scope.getReservedPriorityLaneSnapshot(),
            }),
        });
        scope.translationDiagnostics.publish();
        initializeProviderAvailabilityProbe();

        function isProviderAvailabilityTracked() {
            return !!(provider
                && provider.kind === 'local'
                && typeof provider.getStatus === 'function'
                && !isCacheOnlyProvider);
        }

        function initializeProviderAvailabilityProbe() {
            if (!isProviderAvailabilityTracked()) return false;
            const evaluation = recordProviderAvailability('startup-status');
            if (evaluation && evaluation.state === 'available') return false;
            return startProviderAvailabilityProbe('startup');
        }

        function getProviderStatusForAvailability() {
            if (!provider || typeof provider.getStatus !== 'function') return {};
            try {
                const status = provider.getStatus();
                return status && typeof status === 'object' ? status : {};
            } catch (error) {
                return {
                    error: formatProviderAvailabilityError(error),
                };
            }
        }

        function evaluateProviderAvailability(reason = '', error = null) {
            const tracked = isProviderAvailabilityTracked();
            const status = getProviderStatusForAvailability();
            if (!tracked) {
                return {
                    tracked: false,
                    state: 'ignored',
                    available: true,
                    reason: String(reason || ''),
                    message: '',
                    status,
                    retryOnProviderRestored: false,
                };
            }

            const errorMessage = formatProviderAvailabilityError(error);
            const ready = isProviderStatusReady(status);
            if (ready || String(reason || '') === 'provider-success') {
                return {
                    tracked: true,
                    state: 'available',
                    available: true,
                    reason: String(reason || 'provider-ready'),
                    message: '',
                    status,
                    retryOnProviderRestored: false,
                };
            }

            const unavailableMessage = getProviderUnavailableMessage(status, error);
            if (unavailableMessage) {
                return {
                    tracked: true,
                    state: 'unavailable',
                    available: false,
                    reason: String(reason || 'provider-unavailable'),
                    message: unavailableMessage,
                    status,
                    retryOnProviderRestored: true,
                };
            }

            return {
                tracked: true,
                state: 'unknown',
                available: false,
                reason: String(reason || ''),
                message: errorMessage,
                status,
                retryOnProviderRestored: false,
            };
        }

        function isProviderStatusReady(status = {}) {
            if (!status || typeof status !== 'object') return false;
            const statusCapacity = Number(status.capacity);
            const currentCapacity = Number(scope.providerCapacity);
            const hasCapacity = (Number.isFinite(statusCapacity) && statusCapacity > 0)
                || (Number.isFinite(currentCapacity) && currentCapacity > 0);
            return status.apiResponding === true
                && status.modelSelectionReady === true
                && hasCapacity;
        }

        function getProviderUnavailableMessage(status = {}, error = null) {
            const errorMessage = formatProviderAvailabilityError(error);
            if (errorMessage && isProviderAvailabilityError(error, errorMessage)) {
                return errorMessage;
            }

            const catalogError = typeof status.modelCatalogError === 'string' ? status.modelCatalogError.trim() : '';
            const selectionError = typeof status.modelSelectionError === 'string' ? status.modelSelectionError.trim() : '';
            const statusError = typeof status.error === 'string' ? status.error.trim() : '';
            if (status.apiResponding === false && (catalogError || statusError)) {
                return catalogError || statusError;
            }
            if (status.apiResponding === true && status.modelSelectionReady === false && selectionError) {
                return selectionError;
            }
            if (status.apiResponding === true
                && status.modelSelectionReady === false
                && Number(status.loadedLlmInstanceCount) === 0
                && Number(status.modelCatalogAt) > 0) {
                return 'No LM Studio model loaded.';
            }
            return '';
        }

        function isProviderAvailabilityError(error, message = '') {
            if (!error && !message) return false;
            const code = error && error.code ? String(error.code) : '';
            if (code === 'ABORT_ERR'
                || code === 'EMPTY_TRANSLATION_OUTPUT'
                || code === 'EMPTY_STREAM_OUTPUT'
                || code === 'UNCHANGED_TRANSLATION_OUTPUT') {
                return false;
            }
            const text = String(message || (error && error.message) || error || '');
            return /\b(Local LLM|LM Studio|model list|model selection|loaded LLM instance|not loaded|was not found|auto-loaded|model_instance_id|Failed to fetch|network|fetch|timeout|timed out|ETIMEDOUT|unavailable|ECONNRESET|ECONNREFUSED|no response|load failed|CORS|cross-origin)\b/i.test(text);
        }

        function formatProviderAvailabilityError(error) {
            if (!error) return '';
            return error && error.message ? String(error.message) : String(error);
        }

        function annotateProviderAvailabilityError(error, evaluation) {
            if (!error
                || typeof error !== 'object'
                || !evaluation
                || evaluation.retryOnProviderRestored !== true) {
                return error;
            }
            try { error.providerAvailability = 'unavailable'; } catch (_) {}
            try { error.providerAvailabilityReason = evaluation.reason || ''; } catch (_) {}
            try { error.providerAvailabilityMessage = evaluation.message || ''; } catch (_) {}
            try { error.retryOnProviderRestored = true; } catch (_) {}
            return error;
        }

        function recordProviderAvailability(reason = '', error = null) {
            const evaluation = evaluateProviderAvailability(reason, error);
            annotateProviderAvailabilityError(error, evaluation);
            if (!evaluation.tracked || evaluation.state === 'unknown') return evaluation;

            const current = scope.providerAvailability;
            const previousState = current.state;
            const changed = previousState !== evaluation.state;
            current.state = evaluation.state;
            current.changedAt = changed ? Date.now() : current.changedAt;
            current.lastReason = evaluation.reason || '';
            current.lastMessage = evaluation.message || '';

            if (evaluation.state === 'unavailable') {
                if (changed) {
                    current.unavailableObserved = true;
                    emitProviderAvailabilityEvent('provider.availability_lost', evaluation);
                }
                startProviderAvailabilityProbe(evaluation.reason || reason);
                return evaluation;
            }

            if (evaluation.state === 'available'
                && changed
                && previousState === 'unavailable'
                && current.unavailableObserved === true) {
                emitProviderAvailabilityEvent('provider.availability_restored', evaluation);
            }
            if (evaluation.state === 'available') stopProviderAvailabilityProbe();
            return evaluation;
        }

        function startProviderAvailabilityProbe(reason = '') {
            if (!isProviderAvailabilityTracked()) return false;
            const current = scope.providerAvailability || {};
            if (current.state === 'available') return false;
            const probe = scope.providerAvailabilityProbe;
            if (probe.startedAt === null || probe.startedAt === undefined) {
                probe.startedAt = Date.now();
                probe.attempts = 0;
                scope.translationDiagnostics.recordLazy('provider.availability_probe.started', () => ({
                    reason: String(reason || ''),
                }));
            }
            return scheduleProviderAvailabilityProbe();
        }

        function stopProviderAvailabilityProbe() {
            const probe = scope.providerAvailabilityProbe;
            if (probe.timerId) {
                const clearTimer = typeof globalScope.clearTimeout === 'function'
                    ? globalScope.clearTimeout.bind(globalScope)
                    : clearTimeout;
                try { clearTimer(probe.timerId); } catch (_) {}
            }
            probe.timerId = null;
            probe.startedAt = null;
            probe.running = false;
            probe.attempts = 0;
            probe.lastDelayMs = 0;
            return true;
        }

        function scheduleProviderAvailabilityProbe() {
            const probe = scope.providerAvailabilityProbe;
            if (probe.timerId || probe.running || !isProviderAvailabilityTracked()) return false;
            if (scope.providerAvailability && scope.providerAvailability.state === 'available') return false;
            const setTimer = typeof globalScope.setTimeout === 'function'
                ? globalScope.setTimeout.bind(globalScope)
                : setTimeout;
            const delayMs = getProviderAvailabilityProbeDelayMs();
            probe.lastDelayMs = delayMs;
            probe.timerId = setTimer(runProviderAvailabilityProbe, delayMs);
            if (probe.timerId && typeof probe.timerId.unref === 'function') {
                try { probe.timerId.unref(); } catch (_) {}
            }
            return true;
        }

        function getProviderAvailabilityProbeDelayMs() {
            const probe = scope.providerAvailabilityProbe || {};
            const numericStartedAt = Number(probe.startedAt);
            const startedAt = Number.isFinite(numericStartedAt) ? numericStartedAt : Date.now();
            const elapsedMs = Math.max(0, Date.now() - startedAt);
            if (elapsedMs >= 10 * 60 * 1000) return 10000;
            if (elapsedMs >= 60 * 1000) return 5000;
            return 2000;
        }

        function runProviderAvailabilityProbe() {
            const probe = scope.providerAvailabilityProbe;
            probe.timerId = null;
            if (!isProviderAvailabilityTracked()) {
                stopProviderAvailabilityProbe();
                return;
            }
            if (scope.providerAvailability && scope.providerAvailability.state === 'available') {
                stopProviderAvailabilityProbe();
                return;
            }
            probe.running = true;
            probe.attempts += 1;
            Promise.resolve()
                .then(() => scope.refreshCapacityIfNeeded(true))
                .catch((error) => {
                    recordProviderAvailability('availability-probe-failed', error);
                })
                .finally(() => {
                    probe.running = false;
                    if (isProviderAvailabilityTracked()
                        && scope.providerAvailability
                        && scope.providerAvailability.state !== 'available') {
                        scheduleProviderAvailabilityProbe();
                    }
                });
        }

        function emitProviderAvailabilityEvent(type, evaluation) {
            const event = {
                type,
                at: Date.now(),
                seq: ++scope.providerAvailability.sequence,
                providerKind: provider && provider.kind ? String(provider.kind) : '',
                state: evaluation.state,
                available: evaluation.available === true,
                reason: evaluation.reason || '',
                message: evaluation.message || '',
            };
            if (scope.translationDiagnostics && typeof scope.translationDiagnostics.recordLazy === 'function') {
                scope.translationDiagnostics.recordLazy(type, () => event);
            }
            Array.from(scope.providerAvailabilityListeners).forEach((listener) => {
                try { listener(Object.assign({}, event)); } catch (listenerError) {
                    logger.warn('[TranslationService] provider availability listener failed.', listenerError);
                }
            });
            return event;
        }

        function getProviderAvailabilitySnapshot() {
            const current = scope.providerAvailability || {};
            return {
                state: current.state || 'unknown',
                unavailableObserved: current.unavailableObserved === true,
                changedAt: current.changedAt || 0,
                lastReason: current.lastReason || '',
                lastMessage: current.lastMessage || '',
                sequence: current.sequence || 0,
                tracked: isProviderAvailabilityTracked(),
                probeRunning: scope.providerAvailabilityProbe.running === true,
                probeAttempts: scope.providerAvailabilityProbe.attempts || 0,
                probeStartedAt: scope.providerAvailabilityProbe.startedAt || 0,
                probeLastDelayMs: scope.providerAvailabilityProbe.lastDelayMs || 0,
                probeScheduled: !!scope.providerAvailabilityProbe.timerId,
            };
        }

        function subscribeProviderAvailability(listener) {
            if (typeof listener !== 'function') return () => {};
            scope.providerAvailabilityListeners.add(listener);
            return () => {
                try { scope.providerAvailabilityListeners.delete(listener); } catch (_) {}
            };
        }

        return {
            request: scope.request,
            lookup: scope.lookup,
            cancelByRecordId: scope.cancelByRecordId,
            setPriorityByRecordId: scope.setPriorityByRecordId,
            storeCompletedTranslation: scope.storeCompletedTranslation,
            forgetCompletedTranslation: scope.forgetCompletedTranslation,
            shouldSkip: scope.shouldSkip,
            describeSkip: scope.describeSkip,
            describeEligibility: scope.describeEligibility,
            shouldIgnoreTranslation: scope.shouldIgnoreTranslation,
            describeIgnoreTranslationRegex: scope.describeIgnoreTranslationRegex,
            describeOverrideTranslationRegex: scope.describeOverrideTranslationRegex,
            completed: scope.completed,
            jobs: scope.jobsByKey,
            isCacheOnlyProvider,
            forceAsyncTranslation: scope.forceAsyncTranslation === true,
            providerKind: provider && provider.kind ? String(provider.kind) : '',
            getStats: scope.getStats,
            getDiagnosticsSnapshot: scope.translationDiagnostics.getSnapshot,
            createCompatibilityCache: scope.createCompatibilityCache,
            refreshCapacity: () => scope.refreshCapacityIfNeeded(true),
            getProviderAvailabilitySnapshot: scope.getProviderAvailabilitySnapshot,
            subscribeProviderAvailability: scope.subscribeProviderAvailability,
        };
    }

    function createTranslationManager(options = {}) {
        const provider = options.provider
            || (options.textProcessor
                ? shared.createTextProcessorProvider(options.textProcessor, options.isLocalProvider === true)
                : shared.createNoneProvider());
        const precacheStore = shared.createPrecacheStore();
        const logger = shared.bindLogger(options.logger);

        try {
            if (precacheStore && precacheStore.active && typeof logger.info === 'function') {
                const stats = precacheStore.getStats();
                logger.info('[Precache] Loaded ' + stats.translatedRecords + '/' + stats.records + ' translated records (' + stats.exactKeys + ' keys).');
            }
        } catch (_) {}

        const translationService = createTranslationService(Object.assign({}, options, {
            provider,
            precacheStore,
            isCacheOnlyProvider: options.isCacheOnlyProvider === true || provider.kind === 'none',
        }));
        const translationCache = translationService.createCompatibilityCache();
        return {
            translationService,
            translationCache,
        };
    }

    defineRuntimeModule('runtime.translationManager', {
        createTranslationManager,
        createTranslationService,
        compileIgnoreTranslationRegexRules: shared.compileIgnoreTranslationRegexRules,
        compileOverrideTranslationRegexRules: shared.compileOverrideTranslationRegexRules,
        compileSubstitutePlaintextBeforeTranslationRules: shared.compileSubstitutePlaintextBeforeTranslationRules,
        deriveCacheKeyAliases: shared.deriveCacheKeyAliases,
        normalizeCacheKey: shared.normalizeCacheKey,
    });
})();
