import type { PixiCanvasTextPresenter } from './canvas-text-presenter.js';
import type { PixiTextRuntimeCapabilities } from './runtime-capabilities.js';
type PropertySource = Record<PropertyKey, unknown>;
type RuntimeFunction = (this: unknown, ...argumentsList: unknown[]) => unknown;
export interface PixiTextPresentationRequest {
    readonly commandId: string;
    readonly sourceId: string;
    readonly source: object;
    readonly sourceText: string;
    readonly revision: number;
    readonly target: string;
}
export type PixiTextPresentationAdmission = Readonly<{
    readonly status: 'prepared';
    readonly request: PixiTextPresentationRequest;
}> | Readonly<{
    readonly status: 'rejected';
    readonly reason: string;
}>;
export interface PixiTextPresentationEvent {
    readonly request: PixiTextPresentationRequest;
    readonly reason: string;
    readonly firstPaint: boolean;
    readonly error?: unknown;
}
export interface PixiTextPresentationAuthorityOptions {
    readonly capabilities: PixiTextRuntimeCapabilities;
    readonly canvasPresenter: PixiCanvasTextPresenter;
    readonly onPainted?: (event: PixiTextPresentationEvent) => unknown;
    readonly onRejected?: (event: PixiTextPresentationEvent) => unknown;
    readonly onError?: (error: unknown) => unknown;
}
export interface PixiTextPresentationAuthority {
    prepare(request: unknown): PixiTextPresentationAdmission;
    render(source: unknown, methodName: unknown, argumentsList: readonly unknown[], nativeRender: RuntimeFunction): unknown;
    withdraw(source: unknown, reason?: unknown): boolean;
    dispose(reason?: unknown): number;
    hasPresentation(source: unknown): boolean;
}
export interface PixiTextPresentationAuthorityModule {
    create(options: PixiTextPresentationAuthorityOptions): PixiTextPresentationAuthority;
}
interface PresentationBinding {
    readonly request: PixiTextPresentationRequest;
    readonly handle: object;
    painted: boolean;
    active: boolean;
}
const authorityFreeze = Object.freeze;
const authorityReflectApply = Reflect.apply;
function isPropertySource(value: unknown): value is PropertySource {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function nonemptyString(value: unknown): string {
    return typeof value === 'string' && value ? value : '';
}
function positiveRevision(value: unknown): number {
    return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : 0;
}
function freezeResult<Result extends object>(result: Result): Readonly<Result> {
    authorityFreeze(result);
    return result;
}
function normalizeRequest(value: unknown): PixiTextPresentationRequest | null {
    if (!isPropertySource(value))
        return null;
    const source = value['source'];
    const commandId = nonemptyString(value['commandId']);
    const sourceId = nonemptyString(value['sourceId']);
    const sourceText = typeof value['sourceText'] === 'string' ? value['sourceText'] : null;
    const target = typeof value['target'] === 'string' ? value['target'] : null;
    const revision = positiveRevision(value['revision']);
    if (!isPropertySource(source) || !commandId || !sourceId || sourceText === null || target === null || !revision) {
        return null;
    }
    return freezeResult({ commandId, sourceId, source, sourceText, revision, target });
}
export function createPixiTextPresentationAuthorityModule(): PixiTextPresentationAuthorityModule {
    function create(optionsValue: PixiTextPresentationAuthorityOptions): PixiTextPresentationAuthority {
        const candidate: unknown = optionsValue;
        if (!isPropertySource(candidate)) {
            throw new TypeError('[PIXI Text] Presentation authority options are required.');
        }
        const capabilitiesCandidate = candidate['capabilities'] as PixiTextRuntimeCapabilities | undefined;
        const canvasPresenterCandidate = candidate['canvasPresenter'] as PixiCanvasTextPresenter | undefined;
        if (!capabilitiesCandidate || typeof capabilitiesCandidate.readText !== 'function') {
            throw new TypeError('[PIXI Text] Presentation authority requires public text reads.');
        }
        if (!canvasPresenterCandidate ||
            typeof canvasPresenterCandidate.prepare !== 'function' ||
            typeof canvasPresenterCandidate.paint !== 'function') {
            throw new TypeError('[PIXI Text] Presentation authority requires a canvas presenter.');
        }
        const capabilities: PixiTextRuntimeCapabilities = capabilitiesCandidate;
        const canvasPresenter: PixiCanvasTextPresenter = canvasPresenterCandidate;
        const onPainted = typeof candidate['onPainted'] === 'function' ? (candidate['onPainted'] as RuntimeFunction) : null;
        const onRejected = typeof candidate['onRejected'] === 'function' ? (candidate['onRejected'] as RuntimeFunction) : null;
        const onError = typeof candidate['onError'] === 'function' ? (candidate['onError'] as RuntimeFunction) : null;
        const bindings = new WeakMap<object, PresentationBinding>();
        const activeBindings = new Set<PresentationBinding>();
        function reportCallbackError(error: unknown): void {
            if (!onError)
                return;
            try {
                authorityReflectApply(onError, undefined, [error]);
            }
            catch {
            }
        }
        function publish(callback: RuntimeFunction | null, event: PixiTextPresentationEvent): void {
            if (!callback)
                return;
            try {
                authorityReflectApply(callback, undefined, [event]);
            }
            catch (error) {
                reportCallbackError(error);
            }
        }
        function retireBinding(binding: PresentationBinding, reason: string, error?: unknown): void {
            if (!binding.active)
                return;
            binding.active = false;
            bindings.delete(binding.request.source);
            activeBindings.delete(binding);
            try {
                canvasPresenter.release(binding.handle);
            }
            catch (releaseError) {
                reportCallbackError(releaseError);
            }
            const event: PixiTextPresentationEvent = {
                request: binding.request,
                reason,
                firstPaint: !binding.painted,
                ...(error === undefined ? {} : { error }),
            };
            authorityFreeze(event);
            publish(onRejected, event);
        }
        function prepare(requestValue: unknown): PixiTextPresentationAdmission {
            const request = normalizeRequest(requestValue);
            if (!request)
                return freezeResult({ status: 'rejected', reason: 'pixi-presentation-request-invalid' });
            let kind: ReturnType<PixiTextRuntimeCapabilities['classifyDisplayObject']>;
            try {
                kind = capabilities.classifyDisplayObject(request.source);
            }
            catch {
                return freezeResult({ status: 'rejected', reason: 'pixi-presentation-kind-read-failed' });
            }
            if (kind !== 'canvas-text') {
                return freezeResult({ status: 'rejected', reason: 'pixi-presentation-kind-unsupported' });
            }
            let currentText: ReturnType<PixiTextRuntimeCapabilities['readText']>;
            try {
                currentText = capabilities.readText(request.source);
            }
            catch {
                return freezeResult({ status: 'rejected', reason: 'pixi-presentation-source-read-failed' });
            }
            if (!currentText.ok || currentText.text !== request.sourceText) {
                return freezeResult({ status: 'rejected', reason: 'pixi-presentation-source-stale' });
            }
            let prepared: ReturnType<PixiCanvasTextPresenter['prepare']>;
            try {
                prepared = canvasPresenter.prepare(request.source, request.target);
            }
            catch {
                return freezeResult({ status: 'rejected', reason: 'pixi-presentation-prepare-failed' });
            }
            if (prepared.status !== 'prepared')
                return freezeResult({ status: 'rejected', reason: prepared.reason });
            const previous = bindings.get(request.source);
            const binding: PresentationBinding = {
                request,
                handle: prepared.handle,
                painted: false,
                active: true,
            };
            if (previous)
                retireBinding(previous, 'pixi-presentation-superseded');
            bindings.set(request.source, binding);
            activeBindings.add(binding);
            return freezeResult({ status: 'prepared', request });
        }
        function invokeNative(nativeRender: RuntimeFunction, source: unknown, argumentsList: readonly unknown[]): unknown {
            return authorityReflectApply(nativeRender, source, argumentsList);
        }
        function render(sourceValue: unknown, methodName: unknown, argumentsList: readonly unknown[], nativeRender: RuntimeFunction): unknown {
            if (typeof nativeRender !== 'function') {
                throw new TypeError('[PIXI Text] Native render capability is required.');
            }
            if (!isPropertySource(sourceValue))
                return invokeNative(nativeRender, sourceValue, argumentsList);
            const binding = bindings.get(sourceValue);
            if (!binding)
                return invokeNative(nativeRender, sourceValue, argumentsList);
            if (!binding.active)
                return invokeNative(nativeRender, sourceValue, argumentsList);
            let currentText: ReturnType<PixiTextRuntimeCapabilities['readText']>;
            try {
                currentText = capabilities.readText(sourceValue);
            }
            catch {
                retireBinding(binding, 'pixi-presentation-source-read-failed');
                return invokeNative(nativeRender, sourceValue, argumentsList);
            }
            if (!currentText.ok || currentText.text !== binding.request.sourceText) {
                retireBinding(binding, 'pixi-presentation-source-changed');
                return invokeNative(nativeRender, sourceValue, argumentsList);
            }
            let painted: ReturnType<PixiCanvasTextPresenter['paint']>;
            try {
                painted = canvasPresenter.paint(binding.handle, methodName, argumentsList);
            }
            catch (error) {
                retireBinding(binding, 'pixi-canvas-output-render-failed', error);
                return invokeNative(nativeRender, sourceValue, argumentsList);
            }
            if (painted.status === 'deferred') {
                return invokeNative(nativeRender, sourceValue, argumentsList);
            }
            if (painted.status === 'painted') {
                if (!binding.painted) {
                    binding.painted = true;
                    const event = freezeResult({
                        request: binding.request,
                        reason: 'pixi-presentation-painted',
                        firstPaint: true,
                    });
                    publish(onPainted, event);
                }
                return painted.value;
            }
            retireBinding(binding, painted.reason, painted.status === 'failed' ? painted.error : undefined);
            return invokeNative(nativeRender, sourceValue, argumentsList);
        }
        function withdraw(sourceValue: unknown, reasonValue: unknown = 'pixi-presentation-withdrawn'): boolean {
            if (!isPropertySource(sourceValue))
                return false;
            const binding = bindings.get(sourceValue);
            if (!binding)
                return false;
            if (!binding.active)
                return false;
            retireBinding(binding, nonemptyString(reasonValue) || 'pixi-presentation-withdrawn');
            return true;
        }
        function dispose(reasonValue: unknown = 'pixi-presentation-disposed'): number {
            const reason = nonemptyString(reasonValue) || 'pixi-presentation-disposed';
            const retiring = Array.from(activeBindings);
            for (const binding of retiring)
                retireBinding(binding, reason);
            return retiring.length;
        }
        function hasPresentation(sourceValue: unknown): boolean {
            return isPropertySource(sourceValue) && bindings.get(sourceValue)?.active === true;
        }
        return authorityFreeze({ prepare, render, withdraw, dispose, hasPresentation });
    }
    return authorityFreeze({ create });
}
