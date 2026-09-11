import { createTranslationLineageOwnershipRegistry } from './lineage-ownership.js';
interface TranslationManagerLineagesScopeCandidate {
    readonly activeJobs: unknown;
    readonly jobsByKey: unknown;
    readonly lineagesByKey: unknown;
    lineageSequence: unknown;
}
export interface TranslationManagerLineagesController {
    registerJob(job: unknown): unknown;
    getRoutedJob(key: unknown): unknown;
    commitWithAuthority(job: unknown, commit: unknown): boolean;
    relinquishJob(job: unknown): boolean;
    finishJob(job: unknown, status: unknown): boolean;
    forgetJob(job: unknown): boolean;
    getActiveJobs(): unknown[];
}
export interface TranslationManagerLineagesModule {
    create(scope?: unknown): TranslationManagerLineagesController;
}
const createTranslationManagerLineagesController = function createController(scope: unknown = {}): TranslationManagerLineagesController {
    const source = scope as TranslationManagerLineagesScopeCandidate;
    const { activeJobs, jobsByKey, lineagesByKey } = source;
    let nextLineageSequence: number | null = null;
    function allocateLineageId(): string {
        if (nextLineageSequence === null) {
            const initialSequence = source.lineageSequence;
            if (!Number.isSafeInteger(initialSequence) || (initialSequence as number) < 0) {
                throw new Error('[TranslationService] Lineage sequence must be a nonnegative safe integer.');
            }
            nextLineageSequence = initialSequence as number;
        }
        const allocatedSequence = nextLineageSequence + 1;
        if (!Number.isSafeInteger(allocatedSequence)) {
            throw new Error('[TranslationService] Lineage sequence is exhausted.');
        }
        source.lineageSequence = allocatedSequence;
        nextLineageSequence = allocatedSequence;
        return `lineage:${String(allocatedSequence)}`;
    }
    const ownership = createTranslationLineageOwnershipRegistry({
        activeJobs,
        jobsByKey,
        lineagesByKey,
        allocateLineageId,
    });
    function registerJob(job: unknown): unknown {
        return ownership.registerJob(job);
    }
    function getRoutedJob(key: unknown): unknown {
        return ownership.getRoutedJob(key);
    }
    function commitWithAuthority(job: unknown, commit: unknown): boolean {
        return ownership.commitWithAuthority(job, commit);
    }
    function relinquishJob(job: unknown): boolean {
        return ownership.relinquishJob(job);
    }
    function finishJob(job: unknown, status: unknown): boolean {
        return ownership.finishJob(job, status);
    }
    function forgetJob(job: unknown): boolean {
        return ownership.forgetJob(job);
    }
    function getActiveJobs(): unknown[] {
        return ownership.getActiveJobs();
    }
    return {
        registerJob,
        getRoutedJob,
        commitWithAuthority,
        relinquishJob,
        finishJob,
        forgetJob,
        getActiveJobs,
    };
};
export function createTranslationManagerLineagesModule(): TranslationManagerLineagesModule {
    return { create: createTranslationManagerLineagesController };
}
