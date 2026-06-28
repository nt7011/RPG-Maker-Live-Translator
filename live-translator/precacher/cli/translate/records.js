'use strict';

// Record helpers find untranslated precache entries, de-duplicate repeated raw text, and apply completed translations.

const { buildBatchSystemPrompt, countControlMarkers, createCodedRaw, estimateTokens } = require('./batch-request');

function getRecordCodedRaw(record) {
    if (!record || typeof record !== 'object') return '';
    if (typeof record.codedRaw === 'string' && record.codedRaw.trim()) {
        return record.codedRaw.trim();
    }
    if (typeof record.raw === 'string') {
        return createCodedRaw(record.raw);
    }
    if (typeof record.humanized === 'string') {
        return record.humanized.trim();
    }
    return '';
}

function getRecordCodedTranslation(record) {
    if (!record || typeof record !== 'object') return '';
    if (typeof record.codedTranslation === 'string' && record.codedTranslation.trim()) {
        return record.codedTranslation;
    }
    const codedRaw = getRecordCodedRaw(record);
    const legacyTranslation = typeof record.translation === 'string' ? record.translation : '';
    if (legacyTranslation.trim() && countControlMarkers(legacyTranslation) === countControlMarkers(codedRaw)) {
        return legacyTranslation;
    }
    return '';
}

function collectTranslationJobs(records, options = {}) {
    const knownByCodedRaw = new Map();
    let reused = 0;

    if (!options.overwrite) {
        records.forEach((record) => {
            if (!record || typeof record !== 'object') return;
            const text = getRecordCodedRaw(record);
            const translation = getRecordCodedTranslation(record);
            if (text && translation.trim() && !knownByCodedRaw.has(text)) {
                knownByCodedRaw.set(text, translation);
            }
        });

        records.forEach((record) => {
            if (!record || typeof record !== 'object') return;
            const text = getRecordCodedRaw(record);
            const translation = getRecordCodedTranslation(record);
            if (!text || translation.trim() || !knownByCodedRaw.has(text)) return;
            record.codedRaw = text;
            record.codedTranslation = knownByCodedRaw.get(text);
            reused += 1;
        });
    }

    const byText = new Map();
    records.forEach((record, index) => {
        if (!record || typeof record !== 'object') return;
        const text = getRecordCodedRaw(record);
        if (!text) return;
        record.codedRaw = text;
        const existingTranslation = getRecordCodedTranslation(record);
        if (existingTranslation && record.codedTranslation !== existingTranslation) {
            record.codedTranslation = existingTranslation;
        }
        if (!options.overwrite && existingTranslation.trim()) return;

        if (!byText.has(text)) {
            byText.set(text, { id: byText.size + 1, text, recordIndexes: [] });
        }
        byText.get(text).recordIndexes.push(index);
    });

    return {
        jobs: Array.from(byText.values()),
        reused,
    };
}

function buildBatches(jobs, inputTokenBudget, cfg) {
    const batches = [];
    let current = [];
    let currentTokens = estimateTokens(buildBatchSystemPrompt(cfg));

    for (const job of jobs) {
        const itemTokens = estimateTokens(JSON.stringify({ id: job.id, text: job.text })) + 1;
        if (current.length && currentTokens + itemTokens > inputTokenBudget) {
            batches.push(current);
            current = [];
            currentTokens = estimateTokens(buildBatchSystemPrompt(cfg));
        }
        current.push(job);
        currentTokens += itemTokens;
    }

    if (current.length) batches.push(current);
    return batches;
}

function applyTranslations(records, jobsById, translations) {
    let updatedRecords = 0;
    for (const [id, translation] of translations.entries()) {
        const job = jobsById.get(id);
        if (!job) continue;
        for (const recordIndex of job.recordIndexes) {
            if (!records[recordIndex] || typeof records[recordIndex] !== 'object') continue;
            records[recordIndex].codedTranslation = translation;
            updatedRecords += 1;
        }
    }
    return updatedRecords;
}

function sumJobTokens(items) {
    let total = 0;
    for (const item of Array.isArray(items) ? items : []) {
        if (!item) continue;
        total += estimateTokens(item.text);
    }
    return total;
}

function sumTranslatedTokens(translations, jobsById) {
    let total = 0;
    for (const id of translations.keys()) {
        const job = jobsById.get(id);
        if (job) total += estimateTokens(job.text);
    }
    return total;
}

module.exports = {
    applyTranslations,
    buildBatches,
    collectTranslationJobs,
    getRecordCodedRaw,
    getRecordCodedTranslation,
    sumJobTokens,
    sumTranslatedTokens,
};
