import type {} from '../../../types/esnext-iterator.js';
import { formatNumber } from '../core.js';
import { normalizeHookClass, normalizeTranslationDiagnosticsStatusClass, normalizeStatusClass } from '../formatters.js';
import { getTextRecordRuntimePolicy } from '../runtime/records.js';
import { state } from '../state.js';
import { hasFailedSemanticAssociation, diagnosticTranslatorExchange } from '../text-records/model.js';
import type { GuiTranslationDiagnosticsJob, GuiTextPolicy, GuiTextRecord, UnknownRecord } from '../types.js';
import { falsyFallback, isUnknownRecord, stringValue } from '../types.js';
export type TranslationRailState = 'translating' | 'queued' | 'completed' | 'failed' | 'noop' | 'skipped' | 'neutral';
export interface GuiTranslationDiagnosticsDisplayJob extends GuiTranslationDiagnosticsJob {
    displayMode: 'running' | 'queued' | 'past';
}
export interface TextRecordRequestDetails {
    priority: number | null;
    stream: boolean;
}
export interface TextRecordTranslationRailInfo {
    state: TranslationRailState | 'questionable' | 'complaint';
    label: string;
    title: string;
    priority: number | null;
    stream: boolean;
    policy: GuiTextPolicy;
    job: GuiTranslationDiagnosticsDisplayJob | null;
}
export function formatPriority(job: GuiTranslationDiagnosticsJob | null | undefined): string {
    const priority = Number(job?.effectivePriority);
    const label = Number.isFinite(priority) ? formatNumber(priority) : '-';
    return job?.priorityBucket ? `${label} (${job.priorityBucket})` : label;
}
export function formatStreamState(job: GuiTranslationDiagnosticsJob | null | undefined): string {
    if (!job?.stream)
        return 'no';
    const parts = ['yes'];
    if (job.deltaCount)
        parts.push(`${formatNumber(job.deltaCount)} deltas`);
    if (job.lastDeltaAt)
        parts.push(`${formatElapsedSinceValue(job.lastDeltaAt)} ago`);
    return parts.join(' / ');
}
function formatElapsedSinceValue(value: unknown): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0)
        return '-';
    const seconds = Math.max(0, Math.floor((Date.now() - numeric) / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return minutes > 0 ? `${String(minutes)}m ${String(remainder)}s` : `${String(remainder)}s`;
}
export function getAllTranslationDiagnosticsJobs(): GuiTranslationDiagnosticsDisplayJob[] {
    const jobs = state.translationDiagnostics?.jobs;
    if (!jobs)
        return [];
    return Iterator.concat<GuiTranslationDiagnosticsDisplayJob>(jobs.running.values().map((job) => ({ ...job, displayMode: 'running' as const })), jobs.queued.values().map((job) => ({ ...job, displayMode: 'queued' as const })), jobs.past.values().map((job) => ({ ...job, displayMode: 'past' as const }))).toArray();
}
export function getMatchedTranslationDiagnosticsJobs(item: GuiTextRecord | null | undefined): GuiTranslationDiagnosticsDisplayJob[] {
    if (!item)
        return [];
    return getAllTranslationDiagnosticsJobs()
        .filter((job) => isTranslationDiagnosticsJobForTextRecord(job, item))
        .sort((left, right) => compareMatchedTranslationDiagnosticsJobs(left, right, item));
}
export function getTextRecordPrimaryTranslationDiagnosticsJob(item: GuiTextRecord | null | undefined): GuiTranslationDiagnosticsDisplayJob | null {
    return getMatchedTranslationDiagnosticsJobs(item)[0] ?? null;
}
export function isTranslationDiagnosticsJobForTextRecord(job: GuiTranslationDiagnosticsJob, item: GuiTextRecord): boolean {
    const recordId = item.id ? item.id : '';
    const jobRecordIds = getTranslationDiagnosticsJobRecordIds(job);
    if (recordId && jobRecordIds.length > 0)
        return jobRecordIds.includes(recordId);
    return doesTranslationDiagnosticsJobTextMatchRecord(job, item);
}
export function getTranslationDiagnosticsJobRecordIds(job: GuiTranslationDiagnosticsJob): string[] {
    const ids = new Set<string>();
    for (const subscriber of job.subscriberRecords) {
        if (subscriber.recordId)
            ids.add(subscriber.recordId);
    }
    for (const event of job.history) {
        if (event.recordId)
            ids.add(event.recordId);
        const detailRecordId = event.details['recordId'];
        if (detailRecordId)
            ids.add(stringValue(detailRecordId));
    }
    return Array.from(ids);
}
export function doesTranslationDiagnosticsJobTextMatchRecord(job: GuiTranslationDiagnosticsJob, item: GuiTextRecord): boolean {
    const preview = normalizeComparableText(job.textPreview);
    if (!preview || preview.length < 8)
        return false;
    const jobHook = normalizeHookClass(job.hook);
    const itemHook = normalizeHookClass(item.hookKey || item.hook || item.methodName || item.surfaceType);
    if (jobHook !== 'unknown' && itemHook !== 'unknown' && jobHook !== itemHook)
        return false;
    return getTextRecordComparableTexts(item).some((candidate) => {
        if (!candidate)
            return false;
        if (candidate === preview)
            return true;
        if (preview.endsWith('...')) {
            const prefix = preview.slice(0, -3);
            return prefix.length >= 8 && candidate.startsWith(prefix);
        }
        return false;
    });
}
export function getTextRecordComparableTexts(item: GuiTextRecord): string[] {
    return [
        item.normalizedSource,
        item.translationSource,
        item.original,
        item.visibleText,
        item.convertedText,
        item.rawText,
    ]
        .map(normalizeComparableText)
        .filter(Boolean);
}
export function normalizeComparableText(value: unknown): string {
    return stringValue(falsyFallback(value, '')).replace(/\s+/gu, ' ').trim();
}
export function compareMatchedTranslationDiagnosticsJobs(left: GuiTranslationDiagnosticsDisplayJob, right: GuiTranslationDiagnosticsDisplayJob, item: GuiTextRecord): number {
    const rankDifference = getTranslationDiagnosticsJobDisplayRank(left, item) - getTranslationDiagnosticsJobDisplayRank(right, item);
    if (rankDifference)
        return rankDifference;
    return getTranslationDiagnosticsJobActivityAt(right) - getTranslationDiagnosticsJobActivityAt(left);
}
export function getTranslationDiagnosticsJobDisplayRank(job: GuiTranslationDiagnosticsDisplayJob, item: GuiTextRecord): number {
    const status = normalizeTranslationDiagnosticsStatusClass(job.status || job.displayMode);
    const itemStatus = normalizeStatusClass(item.status);
    if (status === 'running')
        return 0;
    if (status === 'queued')
        return 1;
    if (itemStatus === 'failed' && status === 'failed')
        return 2;
    if (itemStatus === 'completed' && status === 'completed')
        return 2;
    if (status === 'failed')
        return 3;
    if (status === 'completed')
        return 4;
    return 5;
}
export function getTranslationDiagnosticsJobActivityAt(job: GuiTranslationDiagnosticsJob): number {
    const activity = falsyFallback(job.terminalAt, falsyFallback(job.lastDeltaAt, falsyFallback(job.startedAt, falsyFallback(job.queuedAt, job.createdAt))));
    return falsyFallback(Number(activity), 0);
}
export function getTextRecordTranslationRailInfo(item: GuiTextRecord): TextRecordTranslationRailInfo {
    const job = getTextRecordPrimaryTranslationDiagnosticsJob(item);
    const fallback = getTextRecordRequestDetails(item);
    const priority = job ? normalizeOptionalPriority(job.effectivePriority) : fallback.priority;
    const stream = job ? job.stream : fallback.stream;
    const railState = getTextRecordTranslationRailState(item, job);
    const policy = getTextRecordRuntimePolicy(item);
    const associationFailed = hasFailedSemanticAssociation({ diagnostics: item });
    const translatorComplaint = diagnosticTranslatorExchange(item)?.markerMismatch === true;
    return {
        state: translatorComplaint ? 'complaint' : associationFailed ? 'questionable' : railState,
        label: getTranslationRailLabel(railState, priority, stream) +
            (associationFailed ? 'Q' : '') +
            (translatorComplaint ? 'T' : ''),
        title: getTranslationRailTitle(railState, priority, stream, job, policy) +
            (associationFailed ? ' — Semantic association failed' : '') +
            (translatorComplaint ? ' — Translator marker count differs' : ''),
        priority,
        stream,
        policy,
        job,
    };
}
export function getTextRecordTranslationRailState(item: GuiTextRecord, job: GuiTranslationDiagnosticsDisplayJob | null): TranslationRailState {
    const jobRailState = getTranslationRailState(falsyFallback(job?.status, job?.displayMode));
    if (jobRailState === 'translating' || jobRailState === 'queued')
        return jobRailState;
    const recordOutcome = getTextRecordTranslationOutcome(item);
    if (recordOutcome !== 'neutral')
        return recordOutcome;
    if (jobRailState === 'completed' || jobRailState === 'failed' || jobRailState === 'skipped')
        return jobRailState;
    if (isTerminalTextLifecycleStatus(item.status))
        return 'skipped';
    return getTranslationRailState(item.status);
}
export function getTextRecordTranslationOutcome(item: GuiTextRecord): TranslationRailState {
    if (getTranslationRailState(item.status) === 'noop')
        return 'noop';
    const status = normalizeStatusClass(item.status);
    if (status === 'failed')
        return 'failed';
    if (status === 'completed')
        return 'completed';
    if (hasTextRecordTranslation(item))
        return 'completed';
    if (status === 'skipped')
        return 'skipped';
    return 'neutral';
}
export function isTerminalTextLifecycleStatus(status: unknown): boolean {
    const value = normalizeStatusClass(status);
    return value === 'disappeared' || value === 'removed' || value === 'stale';
}
export function hasTextRecordTranslation(item: GuiTextRecord): boolean {
    return [item.translation, item.translationDrawn, item.translationReceived].some((value) => typeof value === 'string' && value.trim().length > 0);
}
export function getTextRecordRequestDetails(item: GuiTextRecord): TextRecordRequestDetails {
    const result: TextRecordRequestDetails = { priority: null, stream: false };
    const metadata = isUnknownRecord(item.metadata) ? item.metadata : {};
    result.priority ??= normalizeOptionalPriority(item.priority);
    result.priority ??= normalizeOptionalPriority(metadata['effectivePriority'] !== undefined ? metadata['effectivePriority'] : metadata['priority']);
    if (!result.stream && (metadata['stream'] === true || metadata['mode'] === 'stream'))
        result.stream = true;
    return result;
}
export function normalizeOptionalPriority(value: unknown): number | null {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === ''))
        return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : null;
}
export function getTranslationRailState(status: unknown): TranslationRailState {
    const value = stringValue(falsyFallback(status, '')).toLowerCase();
    if (value === 'running' || value === 'translating')
        return 'translating';
    if (value === 'queued' || value === 'pending')
        return 'queued';
    if (value === 'completed')
        return 'completed';
    if (value === 'failed' || value === 'error')
        return 'failed';
    if (value === 'noop')
        return 'noop';
    if (value === 'skip' || value === 'skipped' || value === 'canceled')
        return 'skipped';
    return 'neutral';
}
export function getTranslationRailLabel(railState: TranslationRailState, priority: number | null, stream: boolean): string {
    if (railState === 'noop')
        return 'NOOP';
    if (railState === 'failed')
        return 'FAIL';
    if (priority !== null && Number.isFinite(priority))
        return `${String(priority)}${stream ? 'S' : ''}`;
    if (railState === 'completed')
        return '';
    if (railState === 'queued')
        return 'QUEUE';
    if (railState === 'translating')
        return 'RUN';
    if (railState === 'skipped')
        return 'SKIP';
    return 'WAIT';
}
export function getTranslationRailTitle(railState: TranslationRailState, priority: number | null, stream: boolean, job: GuiTranslationDiagnosticsDisplayJob | null, policy: GuiTextPolicy | null = null): string {
    const parts = [formatTranslationRailState(railState)];
    if (priority !== null && Number.isFinite(priority)) {
        parts.push(`${stream ? 'streaming request' : 'request'} priority ${String(priority)}`);
    }
    else if (stream) {
        parts.push('streaming request');
    }
    const policyTitle = formatPolicyRailTitle(policy);
    if (policyTitle)
        parts.push(policyTitle);
    if (job?.id)
        parts.push(job.id);
    return parts.join(' - ');
}
export function formatPolicyRailTitle(policy: GuiTextPolicy | null): string {
    const source = policy ?? {};
    const priority = source.priority ?? {};
    const lifecycle = source.lifecycle ?? {};
    const parts: string[] = [];
    if (priority['action'] || priority['reason']) {
        parts.push(`priority policy ${[priority['action'], priority['reason']].filter(Boolean).join(': ')}`);
    }
    if (lifecycle['kind'] || lifecycle['priorityAction']) {
        parts.push(`lifecycle policy ${[lifecycle['kind'], lifecycle['priorityAction']].filter(Boolean).join(': ')}`);
    }
    return parts.join(' / ');
}
export function formatTranslationRailState(railState: TranslationRailState): string {
    if (railState === 'translating')
        return 'translating';
    if (railState === 'queued')
        return 'queued';
    if (railState === 'completed')
        return 'translated';
    if (railState === 'failed')
        return 'failed';
    if (railState === 'noop')
        return 'not translated by policy';
    if (railState === 'skipped')
        return 'skipped';
    return 'not requested';
}
export function createTranslationDiagnosticsJobKeySource(job: GuiTranslationDiagnosticsJob): UnknownRecord {
    return {
        id: job.id,
        status: job.status,
        hook: job.hook,
        priority: formatPriority(job),
    };
}
