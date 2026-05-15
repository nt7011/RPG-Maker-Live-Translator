// Local LM Studio provider implementation.
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
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translator/providers/local-provider.js.');
    }

    function requireModule(moduleName) {
        if (typeof requireRuntimeModule === 'function') {
            return requireRuntimeModule(moduleName);
        }
        const modules = globalScope.LiveTranslatorModules || {};
        if (modules[moduleName]) return modules[moduleName];
        return String(moduleName || '').split('.').reduce((current, part) => {
            return current && current[part] ? current[part] : null;
        }, modules);
    }

    const utils = requireModule('runtime.translationProviderUtils');
    const protocol = requireModule('runtime.translationLocalProtocol');
    const {
        bindLogger,
        coerceFetchError,
        createLinkedAbort,
        getFetch,
        getGlobalSettings,
        getGlobalTranslatorConfig,
        getLocalApiBaseUrl,
        markHttpError,
        normalizeLocalConfig,
        positiveInteger,
    } = utils;
    const {
        assertLocalChatResponseMatchesSelection,
        buildLocalChatBody,
        createSseParser,
        createThinkBlockStripper,
        extractMessageContentFromV1,
        parseLocalTextOutput,
        selectLocalChatModel,
    } = protocol;

    function createLocalProvider(options = {}) {
        const cfg = normalizeLocalConfig(options.translatorConfig || getGlobalTranslatorConfig(), options.settings || getGlobalSettings());
        const fetchImpl = getFetch(options);
        const logger = bindLogger(options.logger);
        let selectionCache = null;
        let selectionExpiresAt = 0;
        let selectionPromise = null;

        async function requestLocalModelCatalog(requestOptions = {}) {
            const linked = createLinkedAbort({
                signal: requestOptions.signal,
                timeoutMs: requestOptions.timeoutMs || cfg.model_catalog_timeout_ms,
            });
            const url = `${getLocalApiBaseUrl(cfg)}/api/v1/models`;
            try {
                const response = await fetchImpl(url, { method: 'GET', signal: linked.signal });
                if (!response || !response.ok) {
                    const status = response ? response.status : 0;
                    const statusText = response ? response.statusText : 'no response';
                    throw markHttpError(new Error(`Local LLM model list error: ${status} ${statusText}`), status);
                }
                const data = await response.json();
                if (!data || !Array.isArray(data.models)) {
                    throw new Error('Local LLM models response missing required "models" array.');
                }
                return data.models;
            } catch (error) {
                const converted = coerceFetchError(error, linked, 'Local LLM model list request failed');
                throw converted;
            } finally {
                linked.cleanup();
            }
        }

        async function resolveLocalChatModelSelection(requestOptions = {}) {
            const now = Date.now();
            if (selectionCache && now < selectionExpiresAt) {
                return selectionCache;
            }
            if (selectionPromise) {
                return selectionPromise;
            }

            selectionPromise = requestLocalModelCatalog(requestOptions)
                .then((models) => {
                    const selection = selectLocalChatModel(models, cfg);
                    selectionCache = selection;
                    selectionExpiresAt = Date.now() + cfg.model_catalog_ttl_ms;
                    logger.debug(`[Local LLM] Selected ${selection.requestedModel}; parallel capacity ${selection.capacity}.`);
                    return selection;
                })
                .finally(() => {
                    selectionPromise = null;
                });
            return selectionPromise;
        }

        function invalidateModelSelection() {
            selectionCache = null;
            selectionExpiresAt = 0;
        }

        async function requestLocalChat(body, requestOptions = {}) {
            const selection = await resolveLocalChatModelSelection(requestOptions);
            const linked = createLinkedAbort({
                signal: requestOptions.signal,
                timeoutMs: requestOptions.timeoutMs || cfg.request_timeout_ms,
            });
            const url = `${getLocalApiBaseUrl(cfg)}/api/v1/chat`;
            const requestBody = { ...body, model: selection.requestedModel };
            try {
                const response = await fetchImpl(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: linked.signal,
                });
                if (!response || !response.ok) {
                    const status = response ? response.status : 0;
                    const statusText = response ? response.statusText : 'no response';
                    throw markHttpError(new Error(`Local LLM error: ${status} ${statusText}`), status);
                }
                const data = await response.json();
                assertLocalChatResponseMatchesSelection(data, selection);
                return data;
            } catch (error) {
                const converted = coerceFetchError(error, linked, 'Local LLM request failed');
                if (/model|instance|loaded/i.test(converted && converted.message ? converted.message : '')) {
                    invalidateModelSelection();
                }
                throw converted;
            } finally {
                linked.cleanup();
            }
        }

        async function requestLocalChatStream(body, requestOptions = {}) {
            const selection = await resolveLocalChatModelSelection(requestOptions);
            const linked = createLinkedAbort({
                signal: requestOptions.signal,
                timeoutMs: requestOptions.timeoutMs || cfg.request_timeout_ms,
            });
            const url = `${getLocalApiBaseUrl(cfg)}/api/v1/chat`;
            const requestBody = { ...body, model: selection.requestedModel };
            const onDelta = typeof requestOptions.onDelta === 'function' ? requestOptions.onDelta : null;
            let reader = null;

            try {
                const response = await fetchImpl(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: linked.signal,
                });
                if (!response || !response.ok) {
                    const status = response ? response.status : 0;
                    const statusText = response ? response.statusText : 'no response';
                    throw markHttpError(new Error(`Local LLM error: ${status} ${statusText}`), status);
                }
                if (!response.body || typeof response.body.getReader !== 'function') {
                    throw new Error('Local LLM streaming unavailable: response body missing.');
                }

                const decoder = new TextDecoder('utf-8');
                const sse = createSseParser();
                const thinkStripper = createThinkBlockStripper();
                let accumulatedMessage = '';
                let finalMessage = '';
                let lastPartial = '';
                reader = response.body.getReader();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const events = sse.feed(decoder.decode(value, { stream: true }));
                    for (const event of events) {
                        if (!event) continue;
                        if (event.type === 'model_load.start') {
                            const instanceId = typeof event.model_instance_id === 'string' && event.model_instance_id.trim()
                                ? event.model_instance_id.trim()
                                : selection.expectedInstanceId;
                            invalidateModelSelection();
                            throw new Error(
                                `Local LLM auto-loaded "${instanceId}" unexpectedly. The configured model must already be loaded in LM Studio.`
                            );
                        }
                        if (event.type === 'chat.start' && typeof event.model_instance_id === 'string' && event.model_instance_id.trim()) {
                            const responseInstanceId = event.model_instance_id.trim();
                            if (responseInstanceId !== selection.expectedInstanceId) {
                                invalidateModelSelection();
                                throw new Error(
                                    `Local LLM stream started with instance "${responseInstanceId}", but "${selection.expectedInstanceId}" was required.`
                                );
                            }
                        } else if (event.type === 'message.delta' && typeof event.content === 'string') {
                            const cleaned = thinkStripper.feed(event.content);
                            if (cleaned) {
                                accumulatedMessage += cleaned;
                                if (onDelta && accumulatedMessage !== lastPartial) {
                                    lastPartial = accumulatedMessage;
                                    onDelta(accumulatedMessage);
                                }
                            }
                        } else if (event.type === 'chat.end' && event.result) {
                            assertLocalChatResponseMatchesSelection(event.result, selection);
                            finalMessage = extractMessageContentFromV1(event.result);
                        } else if (event.type === 'error') {
                            const message = event.message || event.error || 'Local LLM stream error.';
                            const error = new Error(String(message));
                            try { error.retryable = true; } catch (_) {}
                            throw error;
                        }
                    }
                }

                return { accumulatedMessage, finalMessage };
            } catch (error) {
                const converted = coerceFetchError(error, linked, 'Local LLM stream request failed');
                if (/model|instance|loaded/i.test(converted && converted.message ? converted.message : '')) {
                    invalidateModelSelection();
                }
                throw converted;
            } finally {
                if (reader) {
                    try { reader.releaseLock(); } catch (_) {}
                }
                linked.cleanup();
            }
        }

        async function translateOneLocal(text, requestOptions = {}) {
            const sourceText = String(text ?? '');
            const data = await requestLocalChat(buildLocalChatBody(sourceText, cfg, false), requestOptions);
            return parseLocalTextOutput(extractMessageContentFromV1(data));
        }

        async function translateOneLocalStream(text, requestOptions = {}) {
            const sourceText = String(text ?? '');
            const streamResult = await requestLocalChatStream(buildLocalChatBody(sourceText, cfg, true), requestOptions);
            const messageContent = streamResult && streamResult.finalMessage
                ? streamResult.finalMessage
                : streamResult && streamResult.accumulatedMessage
                    ? streamResult.accumulatedMessage
                    : '';
            const parsed = parseLocalTextOutput(messageContent);
            if (!parsed) {
                const error = new Error('Local LLM stream returned no usable text.');
                try { error.code = 'EMPTY_STREAM_OUTPUT'; } catch (_) {}
                try { error.retryable = true; } catch (_) {}
                throw error;
            }
            return parsed;
        }

        return {
            kind: 'local',
            config: cfg,
            async getCapacity(requestOptions = {}) {
                const selection = await resolveLocalChatModelSelection(requestOptions);
                return positiveInteger(selection.capacity, 1);
            },
            async translate(request = {}) {
                const text = String(request.text ?? '');
                if (request.stream) {
                    return translateOneLocalStream(text, request);
                }
                return translateOneLocal(text, request);
            },
            invalidateModelSelection,
            requestLocalModelCatalog,
            resolveLocalChatModelSelection,
        };
    }


    defineRuntimeModule('runtime.translationLocalProvider', {
        createLocalProvider,
    });
})();
