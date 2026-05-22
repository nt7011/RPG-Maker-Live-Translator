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
            reservedPriorityLanePolicies: shared.createReservedPriorityLanePolicies(settings),
            requestSequence: 0,
            subscriberSequence: 0,
            queueSequence: 0,
            activeCount: 0,
            providerCapacity: 1,
            capacityExpiresAt: 0,
            lastCapacityRefreshAt: 0,
            lastCapacityRefreshError: '',
            capacityPromise: null,
            pumpScheduled: false,
            pumpRunning: false,
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
        Object.keys(methodControllers).forEach((methodName) => {
            scope[methodName] = (...args) => callController(methodName, ...args);
        });

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
