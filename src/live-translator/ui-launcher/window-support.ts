import { captureLogRedactor } from '../runtime/log-redaction-port.js';
import { createNoThrowLoggerSinks } from '../runtime/logger/no-throw-sinks.js';
type PropertyBag = Record<PropertyKey, unknown>;
interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
interface WindowGeometry {
    x: number | null;
    y: number | null;
    width: number;
    height: number;
    position: 'center' | null;
}
interface WindowSizePolicy {
    maxAvailableWidthRatio?: unknown;
    anchor?: unknown;
}
export interface UiWindowConfig {
    id: string;
    title: string;
    file: string;
    supportUrl?: string;
    width: number;
    height: number;
    errorPrefix: string;
    closeWithGame: boolean;
    defaultOpen: boolean;
    query?: Readonly<Record<string, unknown>>;
    sizePolicy?: WindowSizePolicy;
    matchHotkey?: (event: KeyboardEvent) => boolean;
    onOpened?: (openedWindow: unknown) => void;
    onClosed?: (openedWindow: unknown) => void;
}
export interface UiWindowContext {
    supportUrl?: string;
    supportPath?: string;
    runtimePaths?: PropertyBag;
    guiState?: PropertyBag | null;
    openCallbackTimeoutMs?: unknown;
    setTranslatorOpen?: (open: boolean) => void;
}
interface UiWindowOpenOptions {
    focus?: boolean;
}
interface UiWindowOpenAttempt {
    readonly id: number;
    timeout: ReturnType<typeof setTimeout> | null;
}
export interface UiWindowController {
    readonly id: string;
    readonly url: string;
    readonly defaultOpen: boolean;
    readonly closeWithGame: boolean;
    readonly matchHotkey: ((event: KeyboardEvent) => boolean) | undefined;
    isOpen(): boolean;
    open(options?: UiWindowOpenOptions): void;
    close(): void;
}
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertyBag(value) ? value[key] : undefined;
}
function stringValue(value: unknown): string {
    try {
        const converted: unknown = Reflect.apply(String, undefined, [value]);
        return typeof converted === 'string' ? converted : '';
    }
    catch {
        return '';
    }
}
function finiteNumber(value: unknown): number | null {
    try {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
    }
    catch {
        return null;
    }
}
function createUiUrl(config: UiWindowConfig, context: UiWindowContext): string {
    const supportUrl = config.supportUrl ?? context.supportUrl ?? '';
    const supportPath = context.supportPath ?? '';
    const runtimePaths = context.runtimePaths ?? {};
    if (!supportUrl)
        return '';
    const url = new URL(config.file, supportUrl);
    if (supportPath)
        url.searchParams.set('supportPath', supportPath);
    const gameRoot = runtimePaths['gameRoot'];
    const translationCacheFile = runtimePaths['translationCacheFile'];
    if (gameRoot)
        url.searchParams.set('gameRoot', stringValue(gameRoot));
    if (translationCacheFile) {
        url.searchParams.set('translationCacheFile', stringValue(translationCacheFile));
    }
    for (const [key, value] of Object.entries(config.query ?? {})) {
        url.searchParams.set(key, stringValue(value));
    }
    return url.href;
}
export function createUiWindow(config: UiWindowConfig, context: UiWindowContext = {}): UiWindowController {
    const uiUrl = createUiUrl(config, context);
    const openCallbackTimeoutMs = normalizePositiveInteger(context.openCallbackTimeoutMs, 4000);
    const markTranslatorOpen = context.setTranslatorOpen ?? (() => undefined);
    const guiState = context.guiState ?? null;
    let openedWindow: unknown = null;
    let nextOpenAttemptId = 1;
    let activeOpenAttempt: UiWindowOpenAttempt | null = null;
    function markOpen(open: boolean): void {
        if (config.id === 'translator')
            markTranslatorOpen(open);
    }
    function notifyOpened(opened: unknown): void {
        try {
            config.onOpened?.(opened);
        }
        catch {
        }
    }
    function forgetOpenedWindow(opened: unknown): void {
        if (!opened || openedWindow !== opened)
            return;
        openedWindow = null;
        markOpen(false);
        try {
            config.onClosed?.(opened);
        }
        catch {
        }
    }
    function isKnownOpenFromGuiState(): boolean {
        return config.id === 'translator' && guiState !== null && propertyValue(guiState, 'translatorOpen') === true;
    }
    function isActiveAttempt(attempt: UiWindowOpenAttempt): boolean {
        return activeOpenAttempt === attempt;
    }
    function clearOpeningTimeout(attempt: UiWindowOpenAttempt): void {
        if (attempt.timeout === null)
            return;
        try {
            clearTimeout(attempt.timeout);
        }
        catch {
        }
        attempt.timeout = null;
    }
    function beginOpenAttempt(): UiWindowOpenAttempt {
        const attempt: UiWindowOpenAttempt = {
            id: nextOpenAttemptId,
            timeout: null,
        };
        nextOpenAttemptId += 1;
        activeOpenAttempt = attempt;
        attempt.timeout = setTimeout(() => {
            attempt.timeout = null;
            if (!isActiveAttempt(attempt))
                return;
            activeOpenAttempt = null;
            markOpen(false);
            try {
                createNoThrowLoggerSinks(captureLogRedactor(globalThis)).warn([
                    `${config.errorPrefix} Window open attempt ${stringValue(attempt.id)} timed out.`,
                ]);
            }
            catch {
            }
        }, openCallbackTimeoutMs);
        return attempt;
    }
    function closeSupersededWindow(opened: unknown): void {
        if (!opened || opened === openedWindow || isClosedWindow(opened))
            return;
        try {
            const closeWindow = propertyValue(opened, 'close');
            if (typeof closeWindow === 'function')
                Reflect.apply(closeWindow, opened, [true]);
        }
        catch {
        }
    }
    function isKnownClosedFromGuiState(): boolean {
        return (config.id === 'translator' &&
            Boolean(openedWindow) &&
            guiState !== null &&
            propertyValue(guiState, 'translatorOpen') === false);
    }
    function focusExistingWindow(): boolean {
        try {
            if (!openedWindow) {
                markOpen(false);
                return false;
            }
            if (isClosedWindow(openedWindow) || isKnownClosedFromGuiState()) {
                forgetOpenedWindow(openedWindow);
                return false;
            }
            markOpen(true);
            applyWindowGeometry(openedWindow, resolveWindowGeometry(config));
            const focus = propertyValue(openedWindow, 'focus');
            if (typeof focus === 'function')
                Reflect.apply(focus, openedWindow, []);
            return true;
        }
        catch {
            markOpen(true);
            return true;
        }
    }
    function rememberOpenedWindow(attempt: UiWindowOpenAttempt, opened: unknown, focusOnLoad?: boolean): void {
        if (!isActiveAttempt(attempt)) {
            closeSupersededWindow(opened);
            return;
        }
        clearOpeningTimeout(attempt);
        activeOpenAttempt = null;
        openedWindow = opened ?? null;
        applyWindowGeometry(openedWindow, resolveWindowGeometry(config));
        const openedSuccessfully = !isClosedWindow(openedWindow);
        markOpen(openedSuccessfully);
        const on = propertyValue(openedWindow, 'on');
        if (typeof on === 'function') {
            Reflect.apply(on, openedWindow, [
                'closed',
                () => {
                    forgetOpenedWindow(opened);
                },
            ]);
            if (focusOnLoad !== undefined) {
                const once = propertyValue(opened, 'once');
                if (typeof once === 'function') {
                    Reflect.apply(once, opened, [
                        'loaded',
                        () => {
                            if (openedWindow !== opened || isClosedWindow(opened))
                                return;
                            const show = propertyValue(opened, 'show');
                            if (typeof show === 'function')
                                Reflect.apply(show, opened, []);
                            const focus = propertyValue(opened, 'focus');
                            if (focusOnLoad && typeof focus === 'function')
                                Reflect.apply(focus, opened, []);
                        },
                    ]);
                }
            }
        }
        else {
            try {
                const childWindow = propertyValue(openedWindow, 'window');
                const eventTarget = isPropertyBag(childWindow) ? childWindow : openedWindow;
                const addEventListener = propertyValue(eventTarget, 'addEventListener');
                if (typeof addEventListener === 'function') {
                    const forgetBrowserWindow = (): void => {
                        forgetOpenedWindow(opened);
                    };
                    Reflect.apply(addEventListener, eventTarget, ['pagehide', forgetBrowserWindow, { once: true }]);
                    Reflect.apply(addEventListener, eventTarget, ['beforeunload', forgetBrowserWindow, { once: true }]);
                }
            }
            catch {
            }
        }
        if (openedSuccessfully && opened && openedWindow === opened)
            notifyOpened(opened);
    }
    function open(options: UiWindowOpenOptions = {}): void {
        if (!uiUrl) {
            throw new Error(`${config.errorPrefix} Unable to resolve UI URL.`);
        }
        if (focusExistingWindow() || activeOpenAttempt !== null)
            return;
        const attempt = beginOpenAttempt();
        const shouldFocus = options.focus !== false;
        const geometry = resolveWindowGeometry(config);
        const windowOptions: Record<string, unknown> = {
            width: geometry.width,
            height: geometry.height,
            focus: shouldFocus,
        };
        if (geometry.position)
            windowOptions['position'] = geometry.position;
        const nwWindow = propertyValue(propertyValue(globalThis, 'nw'), 'Window');
        const nwOpen = propertyValue(nwWindow, 'open');
        if (typeof nwOpen === 'function') {
            windowOptions['show'] = false;
            try {
                const opened: unknown = Reflect.apply(nwOpen, nwWindow, [
                    uiUrl,
                    windowOptions,
                    (callbackWindow: unknown) => {
                        rememberOpenedWindow(attempt, callbackWindow, shouldFocus);
                    },
                ]);
                if (opened)
                    rememberOpenedWindow(attempt, opened, shouldFocus);
            }
            catch (error) {
                if (isActiveAttempt(attempt)) {
                    clearOpeningTimeout(attempt);
                    activeOpenAttempt = null;
                    markOpen(false);
                }
                throw error;
            }
            return;
        }
        if (typeof window === 'undefined' || typeof window.open !== 'function') {
            clearOpeningTimeout(attempt);
            activeOpenAttempt = null;
            markOpen(false);
            throw new Error(`${config.errorPrefix} No browser window API is available.`);
        }
        rememberOpenedWindow(attempt, window.open(uiUrl, config.title, buildWindowFeatures(geometry)));
    }
    function close(): void {
        const win = openedWindow;
        const attempt = activeOpenAttempt;
        activeOpenAttempt = null;
        if (attempt !== null)
            clearOpeningTimeout(attempt);
        if (!win) {
            markOpen(false);
            return;
        }
        if (isClosedWindow(win)) {
            forgetOpenedWindow(win);
            return;
        }
        try {
            const closeWindow = propertyValue(win, 'close');
            if (typeof closeWindow === 'function')
                Reflect.apply(closeWindow, win, [true]);
            if (isClosedWindow(win))
                forgetOpenedWindow(win);
        }
        catch {
        }
    }
    function isOpen(): boolean {
        if (!openedWindow && isKnownOpenFromGuiState()) {
            return true;
        }
        if (isKnownClosedFromGuiState()) {
            forgetOpenedWindow(openedWindow);
            return false;
        }
        if (isClosedWindow(openedWindow)) {
            forgetOpenedWindow(openedWindow);
            return false;
        }
        markOpen(true);
        return true;
    }
    return {
        id: config.id,
        url: uiUrl,
        defaultOpen: config.defaultOpen,
        closeWithGame: config.closeWithGame,
        matchHotkey: config.matchHotkey,
        isOpen,
        open,
        close,
    };
}
function isClosedWindow(win: unknown): boolean {
    try {
        return (!win ||
            propertyValue(win, 'closed') === true ||
            propertyValue(propertyValue(win, 'window'), 'closed') === true);
    }
    catch (error) {
        if (isWindowClosedAccessBlocked(error))
            return false;
        return true;
    }
}
function isWindowClosedAccessBlocked(error: unknown): boolean {
    const name = stringValue(propertyValue(error, 'name'));
    const message = stringValue(propertyValue(error, 'message'));
    return (name === 'SecurityError' || /Cross-Origin-Opener-Policy/iu.test(message) || /Permission denied/iu.test(message));
}
function resolveWindowGeometry(config: UiWindowConfig): WindowGeometry {
    const fallbackWidth = normalizePositiveInteger(config.width, 800);
    const fallbackHeight = normalizePositiveInteger(config.height, 600);
    const geometry: WindowGeometry = {
        width: fallbackWidth,
        height: fallbackHeight,
        x: null,
        y: null,
        position: 'center',
    };
    const sizePolicy = config.sizePolicy;
    if (!sizePolicy)
        return geometry;
    const workArea = getCurrentScreenWorkArea();
    if (!workArea)
        return geometry;
    const constrained = resolveConstrainedWindowSize(fallbackWidth, fallbackHeight, workArea, sizePolicy);
    geometry.width = constrained.width;
    geometry.height = constrained.height;
    const anchoredPosition = resolveAnchoredPosition(workArea, geometry, sizePolicy.anchor);
    if (anchoredPosition) {
        geometry.x = anchoredPosition.x;
        geometry.y = anchoredPosition.y;
        geometry.position = null;
    }
    return geometry;
}
function resolveConstrainedWindowSize(defaultWidth: number, defaultHeight: number, workArea: Rect, sizePolicy: WindowSizePolicy): Pick<Rect, 'width' | 'height'> {
    const availableWidth = normalizePositiveInteger(workArea.width, 0);
    const availableHeight = normalizePositiveInteger(workArea.height, 0);
    if (availableWidth <= 0 || availableHeight <= 0) {
        return { width: defaultWidth, height: defaultHeight };
    }
    return {
        width: Math.max(1, Math.min(defaultWidth, resolveAvailableWidthLimit(availableWidth, sizePolicy.maxAvailableWidthRatio))),
        height: Math.max(1, Math.min(defaultHeight, availableHeight)),
    };
}
function resolveAvailableWidthLimit(availableWidth: number, maxAvailableWidthRatio: unknown): number {
    const ratio = finiteNumber(maxAvailableWidthRatio);
    if (ratio === null || ratio <= 0)
        return availableWidth;
    return Math.max(1, Math.min(availableWidth, Math.round(availableWidth * Math.min(ratio, 1))));
}
function resolveAnchoredPosition(workArea: Rect, geometry: WindowGeometry, anchor: unknown): Pick<Rect, 'x' | 'y'> | null {
    const normalizedAnchor = stringValue(anchor).toLowerCase();
    if (normalizedAnchor === 'top-right') {
        return {
            x: workArea.x + Math.max(0, workArea.width - geometry.width),
            y: workArea.y,
        };
    }
    if (normalizedAnchor === 'top-left')
        return { x: workArea.x, y: workArea.y };
    return null;
}
function getCurrentScreenWorkArea(): Rect | null {
    return getCurrentNwScreenWorkArea() ?? getBrowserScreenWorkArea();
}
function getCurrentNwScreenWorkArea(): Rect | null {
    try {
        const nwScreen = propertyValue(propertyValue(globalThis, 'nw'), 'Screen');
        const initialize = propertyValue(nwScreen, 'Init');
        if (typeof initialize !== 'function')
            return null;
        Reflect.apply(initialize, nwScreen, []);
        const screensValue = propertyValue(nwScreen, 'screens');
        const screens = Array.isArray(screensValue) ? screensValue : [];
        if (screens.length === 0)
            return null;
        const currentBounds = getCurrentWindowBounds();
        const screen: unknown = findScreenForBounds(screens, currentBounds) ?? screens[0];
        return normalizeWorkArea(propertyValue(screen, 'work_area') ?? propertyValue(screen, 'bounds'));
    }
    catch {
        return null;
    }
}
function getCurrentWindowBounds(): Rect {
    const x = firstFiniteNumber(propertyValue(globalThis, 'screenX'), propertyValue(globalThis, 'screenLeft'), 0);
    const y = firstFiniteNumber(propertyValue(globalThis, 'screenY'), propertyValue(globalThis, 'screenTop'), 0);
    const width = firstFiniteNumber(propertyValue(globalThis, 'outerWidth'), propertyValue(globalThis, 'innerWidth'), 1);
    const height = firstFiniteNumber(propertyValue(globalThis, 'outerHeight'), propertyValue(globalThis, 'innerHeight'), 1);
    return { x, y, width, height };
}
function findScreenForBounds(screens: readonly unknown[], bounds: Rect): unknown {
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const containing = screens.find((screen) => pointInRect(centerX, centerY, propertyValue(screen, 'work_area') ?? propertyValue(screen, 'bounds')));
    if (containing)
        return containing;
    const best = screens
        .map((screen) => ({
        screen,
        overlap: getRectOverlap(bounds, propertyValue(screen, 'work_area') ?? propertyValue(screen, 'bounds')),
    }))
        .sort((left, right) => right.overlap - left.overlap)[0];
    return best?.screen ?? null;
}
function pointInRect(x: number, y: number, rect: unknown): boolean {
    const area = normalizeWorkArea(rect);
    return Boolean(area && x >= area.x && y >= area.y && x < area.x + area.width && y < area.y + area.height);
}
function getRectOverlap(leftArea: Rect, rightArea: unknown): number {
    const area = normalizeWorkArea(rightArea);
    if (!area)
        return 0;
    const left = Math.max(leftArea.x, area.x);
    const top = Math.max(leftArea.y, area.y);
    const right = Math.min(leftArea.x + leftArea.width, area.x + area.width);
    const bottom = Math.min(leftArea.y + leftArea.height, area.y + area.height);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
}
function normalizeWorkArea(area: unknown): Rect | null {
    if (!isPropertyBag(area))
        return null;
    const x = firstFiniteNumber(area['x'], area['left'], 0);
    const y = firstFiniteNumber(area['y'], area['top'], 0);
    const width = firstFiniteNumber(area['width'], area['w'], 0);
    const height = firstFiniteNumber(area['height'], area['h'], 0);
    if (width <= 0 || height <= 0)
        return null;
    return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
    };
}
function getBrowserScreenWorkArea(): Rect | null {
    try {
        const screenRef = propertyValue(globalThis, 'screen');
        const width = firstFiniteNumber(propertyValue(screenRef, 'availWidth'), propertyValue(screenRef, 'width'), 0);
        const height = firstFiniteNumber(propertyValue(screenRef, 'availHeight'), propertyValue(screenRef, 'height'), 0);
        if (width <= 0 || height <= 0)
            return null;
        return {
            x: Math.round(firstFiniteNumber(propertyValue(screenRef, 'availLeft'), propertyValue(screenRef, 'left'), 0)),
            y: Math.round(firstFiniteNumber(propertyValue(screenRef, 'availTop'), propertyValue(screenRef, 'top'), 0)),
            width: Math.round(width),
            height: Math.round(height),
        };
    }
    catch {
        return null;
    }
}
function firstFiniteNumber(...values: unknown[]): number {
    for (const value of values) {
        const number = finiteNumber(value);
        if (number !== null)
            return number;
    }
    return 0;
}
export function normalizePositiveInteger(value: unknown, fallback: number): number {
    const numeric = finiteNumber(value);
    return numeric !== null && numeric > 0 ? Math.round(numeric) : fallback;
}
function applyWindowGeometry(win: unknown, geometry: WindowGeometry): void {
    if (!win)
        return;
    try {
        const resizeTo = propertyValue(win, 'resizeTo');
        if (typeof resizeTo === 'function')
            Reflect.apply(resizeTo, win, [geometry.width, geometry.height]);
    }
    catch {
    }
    try {
        const moveTo = propertyValue(win, 'moveTo');
        if (isFiniteCoordinate(geometry.x) && isFiniteCoordinate(geometry.y) && typeof moveTo === 'function') {
            Reflect.apply(moveTo, win, [Math.round(geometry.x), Math.round(geometry.y)]);
        }
    }
    catch {
    }
}
function buildWindowFeatures(geometry: WindowGeometry): string {
    const features = [`width=${String(geometry.width)}`, `height=${String(geometry.height)}`];
    if (isFiniteCoordinate(geometry.x) && isFiniteCoordinate(geometry.y)) {
        const x = Math.round(geometry.x);
        const y = Math.round(geometry.y);
        features.push(`left=${String(x)}`, `top=${String(y)}`, `screenX=${String(x)}`, `screenY=${String(y)}`);
    }
    return features.join(',');
}
function isFiniteCoordinate(value: number | null): value is number {
    return value !== null && Number.isFinite(value);
}
export function isEditableTarget(target: unknown): boolean {
    if (!target)
        return false;
    const tag = stringValue(propertyValue(target, 'tagName')).toLowerCase();
    return (Boolean(propertyValue(target, 'isContentEditable')) || tag === 'input' || tag === 'textarea' || tag === 'select');
}
