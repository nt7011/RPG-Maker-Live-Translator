#!/usr/bin/env node

'use strict';

// Orchestrates precache translation by combining CLI options, model requests, checkpointing, and progress reporting.

const {
    BENCHMARK_INTERVAL_MS,
    DEFAULT_BATCH_SYSTEM_PROMPT,
    DEFAULT_RETRIES,
    TPS_WINDOW_MS,
} = require('./pretranslator/constants');
const { parseArgs, usage } = require('./pretranslator/cli');
const { assertNotAborted, createAbortController, isAbortError } = require('./pretranslator/abort');
const { createCheckpointWriter, readJsonFile, writeJsonAtomicWithRetry } = require('./pretranslator/file-io');
const {
    getLoadedLlmInstances,
    normalizeLocalConfig,
    requestLocalModelCatalog,
    resolveLocalChatModelSelection,
} = require('./pretranslator/local-model');
const {
    buildBatchInput,
    buildBatchSystemPrompt,
    getMaxOutputTokensForBatch,
    parseBatchTranslations,
    requestLocalBatch,
    estimateTokens,
} = require('./pretranslator/batch-request');
const {
    applyTranslations,
    buildBatches,
    collectTranslationJobs,
    sumJobTokens,
    sumTranslatedTokens,
} = require('./pretranslator/records');
const { formatError, formatEta, formatNumber, log } = require('./pretranslator/formatting');

function pruneTokenSamples(samples, now, windowMs = TPS_WINDOW_MS) {
    if (!Array.isArray(samples)) return [];
    const cutoff = now - windowMs;
    while (samples.length && samples[0].at < cutoff) {
        samples.shift();
    }
    return samples;
}

function recordSuccessfulTokens(stats, tokenCount, now = Date.now()) {
    const tokens = Number(tokenCount);
    if (!stats || !Number.isFinite(tokens) || tokens <= 0) return;
    stats.successfulTokens += tokens;
    if (!Array.isArray(stats.tokenSamples)) stats.tokenSamples = [];
    stats.tokenSamples.push({ at: now, tokens });
    pruneTokenSamples(stats.tokenSamples, now, stats.tpsWindowMs);
}

function getRecentTokenCount(stats, now = Date.now()) {
    if (!stats || !Array.isArray(stats.tokenSamples)) return 0;
    const samples = pruneTokenSamples(stats.tokenSamples, now, stats.tpsWindowMs);
    return samples.reduce((total, sample) => total + sample.tokens, 0);
}

function getRecentTokensPerSecond(stats, now = Date.now()) {
    if (!stats) return 0;
    const windowMs = Number.isFinite(stats.tpsWindowMs) && stats.tpsWindowMs > 0
        ? stats.tpsWindowMs
        : TPS_WINDOW_MS;
    const startedAt = Number.isFinite(stats.startedAt) ? stats.startedAt : now;
    const elapsedMs = Math.max(1, now - startedAt);
    const divisorSeconds = Math.max(0.001, Math.min(windowMs, elapsedMs) / 1000);
    return getRecentTokenCount(stats, now) / divisorSeconds;
}

function getRemainingTokenCount(stats) {
    if (!stats) return 0;
    const total = Number.isFinite(stats.totalTokens) ? stats.totalTokens : 0;
    const successful = Number.isFinite(stats.successfulTokens) ? stats.successfulTokens : 0;
    const failed = Number.isFinite(stats.failedTokens) ? stats.failedTokens : 0;
    return Math.max(0, total - successful - failed);
}

function getEtaSeconds(stats, tokensPerSecond) {
    const remainingTokens = getRemainingTokenCount(stats);
    if (remainingTokens <= 0) return 0;
    const rate = Number(tokensPerSecond);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return Math.ceil(remainingTokens / rate);
}

function createProgressSnapshot(stats, event, extra = {}) {
    const now = Date.now();
    const tokensPerSecond = getRecentTokensPerSecond(stats, now);
    const remainingTokens = getRemainingTokenCount(stats);
    return {
        event,
        totalTokens: stats.totalTokens,
        successfulTokens: stats.successfulTokens,
        failedTokens: stats.failedTokens,
        remainingTokens,
        recentTokens: getRecentTokenCount(stats, now),
        tokensPerSecond,
        etaSeconds: getEtaSeconds(stats, tokensPerSecond),
        tpsWindowSeconds: Math.round((stats.tpsWindowMs || TPS_WINDOW_MS) / 1000),
        completedBatches: stats.completedBatches,
        translatedJobs: stats.translatedJobs,
        updatedRecords: stats.updatedRecords,
        splitBatches: stats.splitBatches,
        activeWorkers: stats.activeBatches,
        queueLength: stats.getQueueLength(),
        failed: stats.getFailedCount(),
        totalBatches: stats.totalBatches,
        pendingJobs: stats.pendingJobs,
        ...extra,
    };
}

function emitProgress(stats, options, event, extra = {}) {
    if (!options || typeof options.onProgress !== 'function') return;
    try {
        options.onProgress(createProgressSnapshot(stats, event, extra));
    } catch (_) {}
}

function createBenchmarkReporter(stats, options = {}) {
    const intervalMs = Number.isInteger(options.intervalMs) && options.intervalMs > 0
        ? options.intervalMs
        : BENCHMARK_INTERVAL_MS;
    let timer = null;

    const snapshot = () => {
        const progress = createProgressSnapshot(stats, 'benchmark');
        const percent = stats.totalTokens > 0
            ? (stats.successfulTokens / stats.totalTokens) * 100
            : 100;

        log(
            `Benchmark: ${formatNumber(stats.successfulTokens)}/${formatNumber(stats.totalTokens)} est source tokens `
            + `translated (${percent.toFixed(1)}%) | ${progress.tokensPerSecond.toFixed(1)} tok/s last `
            + `${progress.tpsWindowSeconds}s | ETA ${formatEta(progress.etaSeconds)} | `
            + `${stats.completedBatches} batch(es) saved | active ${stats.activeBatches} | queue ${stats.getQueueLength()} | `
            + `failed ${stats.getFailedCount()}`
        );
        emitProgress(stats, options, 'benchmark');
    };

    timer = setInterval(snapshot, intervalMs);
    if (timer && typeof timer.unref === 'function') timer.unref();

    return {
        snapshot,
        stop() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        },
    };
}

function splitBatch(items) {
    const midpoint = Math.max(1, Math.floor(items.length / 2));
    return [items.slice(0, midpoint), items.slice(midpoint)].filter((part) => part.length);
}

async function translateWithRetries(items, cfg, selection, options = {}) {
    const retries = Number.isInteger(options.retries) && options.retries >= 0 ? options.retries : DEFAULT_RETRIES;
    let lastError = null;
    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
        assertNotAborted(options.signal);
        try {
            const output = await requestLocalBatch(items, cfg, selection, options);
            return parseBatchTranslations(output, items);
        } catch (err) {
            if (isAbortError(err)) throw err;
            lastError = err;
            if (attempt <= retries) {
                log(`Batch of ${items.length} failed attempt ${attempt}/${retries + 1}: ${formatError(err)}`);
            }
        }
    }
    throw lastError;
}

async function translatePrecache(options = {}) {
    assertNotAborted(options.signal);
    const records = readJsonFile(options.in);
    if (!Array.isArray(records)) {
        throw new Error(`${options.in} must contain a JSON array.`);
    }

    const cfg = normalizeLocalConfig(readJsonFile(options.config));
    if (typeof options.systemPrompt === 'string' && options.systemPrompt.trim()) {
        cfg.batch_system_prompt = options.systemPrompt.trim();
    }
    const collected = collectTranslationJobs(records, options);
    const checkpointWriter = createCheckpointWriter(options.in, records, options);
    if (collected.reused > 0 && !options.dryRun) {
        await checkpointWriter.save();
    }

    const batches = buildBatches(collected.jobs, options.inputTokenBudget, cfg);
    const totalTokens = sumJobTokens(collected.jobs);
    log(`Loaded ${records.length} records.`);
    if (collected.reused > 0) {
        log(`Reused ${collected.reused} translations from duplicate coded raw text.`);
    }
    log(`Pending unique texts: ${collected.jobs.length}.`);
    log(`Built ${batches.length} batch(es) with approx input token budget ${options.inputTokenBudget}.`);

    if (options.dryRun || collected.jobs.length === 0) {
        return {
            records,
            totalRecords: records.length,
            pendingJobs: collected.jobs.length,
            batches: batches.length,
            totalTokens,
            successfulTokens: 0,
            translatedJobs: 0,
            failedJobs: [],
            dryRun: !!options.dryRun,
        };
    }

    const selection = await resolveLocalChatModelSelection(cfg, options);
    log(`Using loaded model instance: ${selection.expectedInstanceId}`);
    log(`Concurrency: ${options.concurrency}. Output token cap: 2x estimated request input tokens.`);

    const jobsById = new Map(collected.jobs.map((job) => [job.id, job]));
    const queue = batches.map((items, index) => ({ items, label: String(index + 1) }));
    const failedJobs = [];
    const stats = {
        startedAt: Date.now(),
        totalTokens,
        totalBatches: batches.length,
        pendingJobs: collected.jobs.length,
        successfulTokens: 0,
        failedTokens: 0,
        tokenSamples: [],
        tpsWindowMs: TPS_WINDOW_MS,
        completedBatches: 0,
        translatedJobs: 0,
        updatedRecords: 0,
        splitBatches: 0,
        activeBatches: 0,
        getQueueLength: () => queue.length,
        getFailedCount: () => failedJobs.length,
    };
    emitProgress(stats, options, 'started');
    const benchmark = createBenchmarkReporter(stats, options);

    async function worker(workerId) {
        while (queue.length) {
            assertNotAborted(options.signal);
            const batch = queue.shift();
            if (!batch || !batch.items.length) continue;

            let translations = null;
            let progressEvent = 'batch_finished';
            try {
                stats.activeBatches += 1;
                emitProgress(stats, options, 'batch_started', { batch: batch.label });
                log(`Worker ${workerId}: translating batch ${batch.label} (${batch.items.length} text(s))`);
                translations = await translateWithRetries(batch.items, cfg, selection, options);
            } catch (err) {
                if (isAbortError(err)) throw err;
                if (batch.items.length > 1) {
                    const parts = splitBatch(batch.items);
                    stats.splitBatches += 1;
                    progressEvent = 'batch_split';
                    log(`Worker ${workerId}: splitting batch ${batch.label} after failure: ${formatError(err)}`);
                    for (let i = parts.length - 1; i >= 0; i -= 1) {
                        queue.unshift({ items: parts[i], label: `${batch.label}.${i + 1}` });
                    }
                } else {
                    const item = batch.items[0];
                    failedJobs.push({
                        id: item.id,
                        text: item.text,
                        error: formatError(err),
                    });
                    stats.failedTokens += estimateTokens(item.text);
                    progressEvent = 'job_failed';
                    log(`Worker ${workerId}: failed id ${item.id}: ${formatError(err)}`);
                }
                continue;
            } finally {
                stats.activeBatches = Math.max(0, stats.activeBatches - 1);
                emitProgress(stats, options, progressEvent, { batch: batch.label });
            }

            const updated = applyTranslations(records, jobsById, translations);
            const translatedTokenCount = sumTranslatedTokens(translations, jobsById);
            try {
                await checkpointWriter.save();
            } catch (err) {
                throw new Error(`Checkpoint write failed after batch ${batch.label}: ${formatError(err)}`);
            }
            stats.completedBatches += 1;
            stats.translatedJobs += translations.size;
            stats.updatedRecords += updated;
            recordSuccessfulTokens(stats, translatedTokenCount);
            log(`Worker ${workerId}: saved batch ${batch.label} (${translations.size} text(s), ${updated} record(s))`);
            emitProgress(stats, options, 'batch_saved', { batch: batch.label });
        }
    }

    const workerCount = Math.max(1, Math.min(options.concurrency, Math.max(1, batches.length)));
    try {
        await Promise.all(Array.from({ length: workerCount }, (_, idx) => worker(idx + 1)));
        await checkpointWriter.drain();
    } finally {
        benchmark.stop();
        benchmark.snapshot();
        emitProgress(stats, options, 'finished');
    }

    return {
        records,
        totalRecords: records.length,
        pendingJobs: collected.jobs.length,
        batches: batches.length,
        translatedJobs: stats.translatedJobs,
        updatedRecords: stats.updatedRecords,
        successfulTokens: stats.successfulTokens,
        failedTokens: stats.failedTokens,
        splitBatches: stats.splitBatches,
        failedJobs,
        dryRun: false,
    };
}

async function runCli(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.help) {
        console.log(usage());
        return 0;
    }

    const result = await translatePrecache(options);
    if (result.dryRun) {
        log('Dry run complete; no model requests were sent.');
    } else {
        log(`Translated ${result.translatedJobs} unique text(s), updated ${result.updatedRecords || 0} record(s).`);
    }
    if (result.failedJobs && result.failedJobs.length) {
        log(`Failed ${result.failedJobs.length} unique text(s). Rerun after fixing the cause to resume.`);
        return 1;
    }
    return 0;
}

if (require.main === module) {
    runCli(process.argv.slice(2))
        .then((code) => { process.exitCode = code; })
        .catch((err) => {
            console.error(`[PrecacheTranslator] ${formatError(err)}`);
            process.exitCode = 1;
        });
}

module.exports = {
    buildBatchInput,
    buildBatchSystemPrompt,
    buildBatches,
    collectTranslationJobs,
    createAbortController,
    createCheckpointWriter,
    DEFAULT_BATCH_SYSTEM_PROMPT,
    estimateTokens,
    getEtaSeconds,
    getRecentTokensPerSecond,
    getMaxOutputTokensForBatch,
    getLoadedLlmInstances,
    normalizeLocalConfig,
    parseArgs,
    parseBatchTranslations,
    requestLocalModelCatalog,
    resolveLocalChatModelSelection,
    translatePrecache,
    writeJsonAtomicWithRetry,
};
