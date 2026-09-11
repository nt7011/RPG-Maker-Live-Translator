type PropertySource = Record<PropertyKey, unknown>;
type RuntimeFunction = (this: unknown, ...argumentsList: unknown[]) => unknown;
export type PixiCanvasTextPresentationPreparation = Readonly<{
    readonly status: 'prepared';
    readonly handle: object;
}> | Readonly<{
    readonly status: 'rejected';
    readonly reason: string;
}>;
export type PixiCanvasTextPaintResult = Readonly<{
    readonly status: 'painted';
    readonly value: unknown;
}> | Readonly<{
    readonly status: 'deferred';
    readonly reason: string;
}> | Readonly<{
    readonly status: 'rejected';
    readonly reason: string;
}> | Readonly<{
    readonly status: 'failed';
    readonly reason: string;
    readonly error: unknown;
}>;
export interface PixiCanvasTextPresenterOptions {
    readonly containerConstructor: unknown;
    readonly textConstructor: unknown;
}
export interface PixiCanvasTextPresenter {
    describeSource(source: unknown): PixiCanvasTextSourceSupport;
    prepare(source: unknown, target: unknown): PixiCanvasTextPresentationPreparation;
    paint(handle: unknown, methodName: unknown, argumentsList?: readonly unknown[]): PixiCanvasTextPaintResult;
    release(handle: unknown): boolean;
    isTranslatorOwned(value: unknown): boolean;
}
export type PixiCanvasTextSourceSupport = Readonly<{
    readonly supported: true;
    readonly reason: '';
}> | Readonly<{
    readonly supported: false;
    readonly reason: string;
}>;
export interface PixiCanvasTextPresenterModule {
    create(options: PixiCanvasTextPresenterOptions): PixiCanvasTextPresenter;
}
interface StyleProjection {
    readonly entries: readonly Readonly<{
        readonly key: string;
        readonly value: unknown;
    }>[];
    readonly options: PropertySource;
}
interface PresentationAuthority {
    readonly handle: object;
    readonly source: object;
    readonly target: string;
    root: object;
    output: object;
    style: StyleProjection;
    released: boolean;
}
interface OwnedPresentationObjects {
    readonly root: object;
    readonly output: object;
}
type SupportResult = Readonly<{
    readonly supported: true;
}> | Readonly<{
    readonly supported: false;
    readonly reason: string;
}>;
type StyleCaptureResult = Readonly<{
    readonly ok: true;
    readonly projection: StyleProjection;
}> | Readonly<{
    readonly ok: false;
    readonly reason: string;
}>;
const STYLE_PROPERTIES = Object.freeze([
    'align',
    'breakWords',
    'dropShadow',
    'dropShadowAlpha',
    'dropShadowAngle',
    'dropShadowBlur',
    'dropShadowColor',
    'dropShadowDistance',
    'fill',
    'fillGradientStops',
    'fillGradientType',
    'fontFamily',
    'fontSize',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'leading',
    'letterSpacing',
    'lineHeight',
    'lineJoin',
    'miterLimit',
    'padding',
    'stroke',
    'strokeThickness',
    'textBaseline',
    'trim',
    'whiteSpace',
    'wordWrap',
    'wordWrapWidth',
] as const);
const OWNED_SCALAR_PROPERTIES = Object.freeze(['blendMode', 'resolution', 'roundPixels', 'tint'] as const);
const presenterFreeze = Object.freeze;
const presenterReflectApply = Reflect.apply;
const presenterReflectGet = Reflect.get;
const presenterReflectSet = Reflect.set;
const presenterNumberIsFinite = Number.isFinite;
const MAX_STYLE_ARRAY_LENGTH = 128;
function isPropertySource(value: unknown): value is PropertySource {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function readProperty(value: unknown, key: PropertyKey): unknown {
    return isPropertySource(value) ? presenterReflectGet(value, key, value) : undefined;
}
function writeOwnedProperty(value: object, key: PropertyKey, next: unknown): boolean {
    try {
        return presenterReflectSet(value, key, next, value);
    }
    catch {
        return false;
    }
}
function freezeResult<Result extends object>(result: Result): Readonly<Result> {
    presenterFreeze(result);
    return result;
}
function cloneStyleValue(value: unknown): Readonly<{
    ok: true;
    value: unknown;
}> | Readonly<{
    ok: false;
}> {
    if (value === undefined ||
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && presenterNumberIsFinite(value))) {
        return freezeResult({ ok: true, value });
    }
    if (!Array.isArray(value) || value.length > MAX_STYLE_ARRAY_LENGTH)
        return freezeResult({ ok: false });
    const clone: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index))
            return freezeResult({ ok: false });
        const entry = readProperty(value, index);
        if (entry !== null &&
            typeof entry !== 'string' &&
            typeof entry !== 'boolean' &&
            !(typeof entry === 'number' && presenterNumberIsFinite(entry))) {
            return freezeResult({ ok: false });
        }
        clone[clone.length] = entry;
    }
    presenterFreeze(clone);
    return freezeResult({ ok: true, value: clone });
}
function captureStyle(source: object): StyleCaptureResult {
    let style: unknown;
    try {
        style = readProperty(source, 'style');
    }
    catch {
        return freezeResult({ ok: false, reason: 'pixi-canvas-style-read-failed' });
    }
    if (!isPropertySource(style))
        return freezeResult({ ok: false, reason: 'pixi-canvas-style-unavailable' });
    const entries: Readonly<{
        readonly key: string;
        readonly value: unknown;
    }>[] = [];
    const options: PropertySource = {};
    for (const key of STYLE_PROPERTIES) {
        let value: unknown;
        try {
            value = readProperty(style, key);
        }
        catch {
            return freezeResult({ ok: false, reason: 'pixi-canvas-style-read-failed' });
        }
        const cloned = cloneStyleValue(value);
        if (!cloned.ok)
            return freezeResult({ ok: false, reason: `pixi-canvas-style-${key}-unsupported` });
        if (cloned.value === undefined)
            continue;
        const entry = freezeResult({ key, value: cloned.value });
        entries[entries.length] = entry;
        options[key] = Array.isArray(cloned.value) ? Array.from(cloned.value) : cloned.value;
    }
    presenterFreeze(entries);
    return freezeResult({ ok: true, projection: freezeResult({ entries, options }) });
}
function styleProjectionsEqual(left: StyleProjection, right: StyleProjection): boolean {
    if (left.entries.length !== right.entries.length)
        return false;
    for (let index = 0; index < left.entries.length; index += 1) {
        const leftEntry = left.entries[index];
        const rightEntry = right.entries[index];
        if (!leftEntry || !rightEntry)
            return false;
        if (leftEntry.key !== rightEntry.key)
            return false;
        const leftValue = leftEntry.value;
        const rightValue = rightEntry.value;
        if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
            if (!Array.isArray(leftValue) || !Array.isArray(rightValue) || leftValue.length !== rightValue.length) {
                return false;
            }
            for (let valueIndex = 0; valueIndex < leftValue.length; valueIndex += 1) {
                if (!Object.is(leftValue[valueIndex], rightValue[valueIndex]))
                    return false;
            }
        }
        else if (!Object.is(leftValue, rightValue))
            return false;
    }
    return true;
}
function sourceSupport(source: unknown): SupportResult {
    if (!isPropertySource(source))
        return freezeResult({ supported: false, reason: 'pixi-canvas-source-unavailable' });
    try {
        const children = readProperty(source, 'children');
        if (!Array.isArray(children) || children.length !== 0) {
            return freezeResult({ supported: false, reason: 'pixi-canvas-source-not-leaf' });
        }
        const mask = readProperty(source, 'mask');
        if (mask !== undefined && mask !== null) {
            return freezeResult({ supported: false, reason: 'pixi-canvas-source-mask-unsupported' });
        }
        const filters = readProperty(source, 'filters');
        if (filters !== undefined && filters !== null && (!Array.isArray(filters) || filters.length !== 0)) {
            return freezeResult({ supported: false, reason: 'pixi-canvas-source-filters-unsupported' });
        }
        if (readProperty(source, 'cacheAsBitmap') === true) {
            return freezeResult({ supported: false, reason: 'pixi-canvas-source-cache-unsupported' });
        }
    }
    catch {
        return freezeResult({ supported: false, reason: 'pixi-canvas-source-capability-read-failed' });
    }
    return freezeResult({ supported: true });
}
function copyAnchor(source: object, output: object): boolean {
    let sourceAnchor: unknown;
    let outputAnchor: unknown;
    try {
        sourceAnchor = readProperty(source, 'anchor');
        outputAnchor = readProperty(output, 'anchor');
    }
    catch {
        return false;
    }
    if (sourceAnchor === undefined || sourceAnchor === null)
        return true;
    if (!isPropertySource(sourceAnchor) || !isPropertySource(outputAnchor))
        return false;
    for (const key of ['x', 'y'] as const) {
        let component: unknown;
        try {
            component = readProperty(sourceAnchor, key);
        }
        catch {
            return false;
        }
        if (typeof component !== 'number' || !presenterNumberIsFinite(component))
            return false;
        if (!writeOwnedProperty(outputAnchor, key, component))
            return false;
    }
    return true;
}
function sourceIsPaintEligible(source: object): boolean {
    try {
        if (readProperty(source, 'visible') === false || readProperty(source, 'renderable') === false)
            return false;
        const worldAlpha = readProperty(source, 'worldAlpha');
        return typeof worldAlpha === 'number' && presenterNumberIsFinite(worldAlpha) && worldAlpha > 0;
    }
    catch {
        return false;
    }
}
function projectPublicPaintState(source: object, root: object, output: object): boolean {
    let sourceMatrix: unknown;
    let outputTransform: unknown;
    let worldAlpha: unknown;
    try {
        sourceMatrix = readProperty(source, 'worldTransform');
        outputTransform = readProperty(output, 'transform');
        worldAlpha = readProperty(source, 'worldAlpha');
    }
    catch {
        return false;
    }
    if (!isPropertySource(sourceMatrix) || !isPropertySource(outputTransform))
        return false;
    if (typeof worldAlpha !== 'number' || !presenterNumberIsFinite(worldAlpha))
        return false;
    let setFromMatrix: unknown;
    let updateTransform: unknown;
    try {
        setFromMatrix = readProperty(outputTransform, 'setFromMatrix');
        updateTransform = readProperty(output, 'updateTransform');
    }
    catch {
        return false;
    }
    if (typeof setFromMatrix !== 'function' || typeof updateTransform !== 'function')
        return false;
    try {
        presenterReflectApply(setFromMatrix as RuntimeFunction, outputTransform, [sourceMatrix]);
    }
    catch {
        return false;
    }
    if (!writeOwnedProperty(root, 'worldAlpha', 1) ||
        !writeOwnedProperty(output, 'alpha', worldAlpha) ||
        !writeOwnedProperty(output, 'visible', true) ||
        !writeOwnedProperty(output, 'renderable', true) ||
        !copyAnchor(source, output)) {
        return false;
    }
    for (const key of OWNED_SCALAR_PROPERTIES) {
        let value: unknown;
        try {
            value = readProperty(source, key);
        }
        catch {
            return false;
        }
        if (value === undefined)
            continue;
        if (typeof value !== 'string' && typeof value !== 'boolean' && typeof value !== 'number')
            return false;
        if (typeof value === 'number' && !presenterNumberIsFinite(value))
            return false;
        if (!writeOwnedProperty(output, key, value))
            return false;
    }
    try {
        presenterReflectApply(updateTransform as RuntimeFunction, output, []);
    }
    catch {
        return false;
    }
    return true;
}
export function createPixiCanvasTextPresenterModule(): PixiCanvasTextPresenterModule {
    function create(optionsValue: PixiCanvasTextPresenterOptions): PixiCanvasTextPresenter {
        const candidate: unknown = optionsValue;
        if (!isPropertySource(candidate))
            throw new TypeError('[PIXI Text] Canvas presenter options are required.');
        const textConstructor = readProperty(candidate, 'textConstructor');
        const containerConstructor = readProperty(candidate, 'containerConstructor');
        if (typeof containerConstructor !== 'function') {
            throw new TypeError('[PIXI Text] Canvas presenter requires the public Container constructor.');
        }
        if (typeof textConstructor !== 'function') {
            throw new TypeError('[PIXI Text] Canvas presenter requires the public Text constructor.');
        }
        const constructContainer = containerConstructor as new () => unknown;
        const constructText = textConstructor as new (text: string, style: unknown) => unknown;
        const authorities = new WeakMap<object, PresentationAuthority>();
        const ownedOutputs = new WeakSet<object>();
        function describeSource(sourceValue: unknown): PixiCanvasTextSourceSupport {
            const supported = sourceSupport(sourceValue);
            if (!supported.supported)
                return freezeResult({ supported: false, reason: supported.reason });
            if (!isPropertySource(sourceValue)) {
                return freezeResult({ supported: false, reason: 'pixi-canvas-source-unavailable' });
            }
            const style = captureStyle(sourceValue);
            return style.ok
                ? freezeResult({ supported: true, reason: '' })
                : freezeResult({ supported: false, reason: style.reason });
        }
        function destroyOwnedObject(value: object): void {
            ownedOutputs.delete(value);
            try {
                const destroy = readProperty(value, 'destroy');
                if (typeof destroy === 'function')
                    presenterReflectApply(destroy as RuntimeFunction, value, []);
            }
            catch {
            }
        }
        function constructOutput(target: string, style: StyleProjection): OwnedPresentationObjects | null {
            let root: unknown = null;
            let output: unknown = null;
            try {
                root = new constructContainer();
                output = new constructText(target, style.options);
                if (!isPropertySource(root) || !isPropertySource(output)) {
                    throw new TypeError('PIXI constructors did not return display objects.');
                }
                const addChild = readProperty(root, 'addChild');
                if (typeof addChild !== 'function')
                    throw new TypeError('PIXI Container.addChild is unavailable.');
                presenterReflectApply(addChild as RuntimeFunction, root, [output]);
                ownedOutputs.add(root);
                ownedOutputs.add(output);
                return { root, output };
            }
            catch {
                if (isPropertySource(output))
                    destroyOwnedObject(output);
                if (isPropertySource(root))
                    destroyOwnedObject(root);
                return null;
            }
        }
        function destroyOutput(root: object, output: object): void {
            try {
                const removeChild = readProperty(root, 'removeChild');
                if (typeof removeChild === 'function')
                    presenterReflectApply(removeChild as RuntimeFunction, root, [output]);
            }
            catch {
            }
            destroyOwnedObject(output);
            destroyOwnedObject(root);
        }
        function prepare(sourceValue: unknown, targetValue: unknown): PixiCanvasTextPresentationPreparation {
            if (!isPropertySource(sourceValue)) {
                return freezeResult({ status: 'rejected', reason: 'pixi-canvas-source-unavailable' });
            }
            if (typeof targetValue !== 'string') {
                return freezeResult({ status: 'rejected', reason: 'pixi-canvas-target-not-string' });
            }
            const supported = describeSource(sourceValue);
            if (!supported.supported)
                return freezeResult({ status: 'rejected', reason: supported.reason });
            const style = captureStyle(sourceValue);
            if (!style.ok)
                return freezeResult({ status: 'rejected', reason: style.reason });
            const presentation = constructOutput(targetValue, style.projection);
            if (!presentation) {
                return freezeResult({ status: 'rejected', reason: 'pixi-canvas-output-construction-failed' });
            }
            const handle = presenterFreeze({});
            authorities.set(handle, {
                handle,
                source: sourceValue,
                target: targetValue,
                root: presentation.root,
                output: presentation.output,
                style: style.projection,
                released: false,
            });
            return freezeResult({ status: 'prepared', handle });
        }
        function paint(handleValue: unknown, methodNameValue: unknown, argumentsList: readonly unknown[] = []): PixiCanvasTextPaintResult {
            if (!isPropertySource(handleValue)) {
                return freezeResult({ status: 'rejected', reason: 'pixi-canvas-presentation-handle-invalid' });
            }
            const authority = authorities.get(handleValue);
            if (!authority) {
                return freezeResult({ status: 'rejected', reason: 'pixi-canvas-presentation-not-active' });
            }
            if (authority.handle !== handleValue || authority.released) {
                return freezeResult({ status: 'rejected', reason: 'pixi-canvas-presentation-not-active' });
            }
            if (typeof methodNameValue !== 'string' && typeof methodNameValue !== 'symbol') {
                return freezeResult({ status: 'rejected', reason: 'pixi-canvas-render-method-invalid' });
            }
            const supported = sourceSupport(authority.source);
            if (!supported.supported)
                return freezeResult({ status: 'rejected', reason: supported.reason });
            if (!sourceIsPaintEligible(authority.source)) {
                return freezeResult({ status: 'deferred', reason: 'pixi-canvas-source-not-painting' });
            }
            const style = captureStyle(authority.source);
            if (!style.ok)
                return freezeResult({ status: 'rejected', reason: style.reason });
            if (!styleProjectionsEqual(authority.style, style.projection)) {
                const replacement = constructOutput(authority.target, style.projection);
                if (!replacement) {
                    return freezeResult({ status: 'rejected', reason: 'pixi-canvas-output-rebuild-failed' });
                }
                const retiredRoot = authority.root;
                const retiredOutput = authority.output;
                authority.root = replacement.root;
                authority.output = replacement.output;
                authority.style = style.projection;
                destroyOutput(retiredRoot, retiredOutput);
            }
            if (!projectPublicPaintState(authority.source, authority.root, authority.output)) {
                return freezeResult({ status: 'rejected', reason: 'pixi-canvas-paint-state-unsupported' });
            }
            let render: unknown;
            try {
                render = readProperty(authority.output, methodNameValue);
            }
            catch {
                return freezeResult({ status: 'rejected', reason: 'pixi-canvas-output-render-unavailable' });
            }
            if (typeof render !== 'function') {
                return freezeResult({ status: 'rejected', reason: 'pixi-canvas-output-render-unavailable' });
            }
            try {
                const value = presenterReflectApply(render as RuntimeFunction, authority.output, argumentsList);
                return freezeResult({ status: 'painted', value });
            }
            catch (error) {
                return freezeResult({ status: 'failed', reason: 'pixi-canvas-output-render-failed', error });
            }
        }
        function release(handleValue: unknown): boolean {
            if (!isPropertySource(handleValue))
                return false;
            const authority = authorities.get(handleValue);
            if (!authority)
                return false;
            if (authority.handle !== handleValue)
                return false;
            if (authority.released)
                return true;
            authority.released = true;
            authorities.delete(handleValue);
            destroyOutput(authority.root, authority.output);
            return true;
        }
        function isTranslatorOwned(value: unknown): boolean {
            return isPropertySource(value) && ownedOutputs.has(value);
        }
        return presenterFreeze({ describeSource, prepare, paint, release, isTranslatorOwned });
    }
    return presenterFreeze({ create });
}
