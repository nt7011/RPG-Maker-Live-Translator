import { createUiWindow, isEditableTarget, normalizePositiveInteger, type UiWindowController, } from './window-support.js';
import { createGuiWindowAttachment } from './window-feeds.js';
import { captureLogRedactor } from '../runtime/log-redaction-port.js';
import { createNoThrowLoggerSinks } from '../runtime/logger/no-throw-sinks.js';
type PropertyBag = Record<PropertyKey, unknown>;
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isNonNullObject(value: unknown): value is PropertyBag {
    return typeof value === 'object' && value !== null;
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
function getGlobalScope(): PropertyBag {
    const scope: unknown = globalThis;
    if (!isPropertyBag(scope))
        throw new Error('[LiveTranslatorUiLauncher] Global scope is unavailable.');
    return scope;
}
function currentScriptUrl(): string {
    if (typeof document === 'undefined')
        return '';
    return stringValue(propertyValue(document.currentScript, 'src'));
}
export function launchUi(guiWindow = createGuiWindowAttachment(getGlobalScope())): void {
    const globalScope = getGlobalScope();
    const runtimePathsValue = globalScope['LiveTranslatorPaths'];
    const runtimePaths = isNonNullObject(runtimePathsValue) ? runtimePathsValue : {};
    const scriptUrl = currentScriptUrl();
    const supportUrlValue = runtimePaths['supportUrl'];
    const supportPathValue = runtimePaths['supportPath'];
    const supportUrl = supportUrlValue ? stringValue(supportUrlValue) : scriptUrl ? new URL('.', scriptUrl).href : '';
    const supportPath = supportPathValue ? stringValue(supportPathValue) : '';
    const existingGuiState = globalScope['LiveTranslatorGuiState'];
    const guiState = isNonNullObject(existingGuiState)
        ? existingGuiState
        : { translatorOpen: false, updatedAt: Date.now() };
    globalScope['LiveTranslatorGuiState'] = guiState;
    const testOptionsValue = globalScope['__LiveTranslatorUiLauncherTestOptions'];
    const testOptions = isNonNullObject(testOptionsValue) ? testOptionsValue : {};
    const openCallbackTimeoutMs = normalizePositiveInteger(testOptions['openCallbackTimeoutMs'], 4000);
    function setTranslatorOpen(open: boolean): void {
        guiState['translatorOpen'] = open;
        guiState['updatedAt'] = Date.now();
    }
    const windowContext = {
        supportUrl,
        supportPath,
        runtimePaths,
        guiState,
        openCallbackTimeoutMs,
        setTranslatorOpen,
    };
    const windows = {
        translator: createUiWindow({
            id: 'translator',
            title: 'LiveTranslatorGui',
            file: 'gui/index.html',
            width: 1440,
            height: 2160,
            sizePolicy: {
                maxAvailableWidthRatio: 0.5,
                anchor: 'top-right',
            },
            errorPrefix: '[LiveTranslatorGui]',
            closeWithGame: true,
            defaultOpen: true,
            query: { closeWithGame: '1' },
            matchHotkey: (event) => {
                const key = stringValue(event.key).toLowerCase();
                const code = stringValue(event.code).toLowerCase();
                return key === 'enter' || code === 'enter' || code === 'numpadenter';
            },
            onOpened: guiWindow.opened,
            onClosed: guiWindow.closed,
        }, windowContext),
    };
    function windowEntries(): UiWindowController[] {
        return Object.values(windows);
    }
    function installHotkeys(): void {
        if (typeof document === 'undefined' || typeof document.addEventListener !== 'function')
            return;
        document.addEventListener('keydown', (event) => {
            if (!event.ctrlKey || !event.shiftKey || isEditableTarget(event.target))
                return;
            for (const entry of windowEntries()) {
                if (!entry.matchHotkey?.(event))
                    continue;
                event.preventDefault();
                entry.open({ focus: true });
                return;
            }
        }, true);
    }
    function closeGameScopedWindows(): void {
        for (const entry of windowEntries()) {
            if (entry.closeWithGame)
                entry.close();
        }
    }
    function installLifecycleCloseHandlers(): void {
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('pagehide', closeGameScopedWindows);
            window.addEventListener('beforeunload', closeGameScopedWindows);
            window.addEventListener('unload', closeGameScopedWindows);
        }
        try {
            const nwWindow = propertyValue(propertyValue(globalScope, 'nw'), 'Window');
            const getWindow = propertyValue(nwWindow, 'get');
            if (typeof getWindow !== 'function')
                return;
            const gameWindow: unknown = Reflect.apply(getWindow, nwWindow, []);
            const on = propertyValue(gameWindow, 'on');
            if (typeof on === 'function')
                Reflect.apply(on, gameWindow, ['closed', closeGameScopedWindows]);
        }
        catch {
        }
    }
    function launchDefaultWindows(): void {
        const defaultEntries = windowEntries().filter((entry) => entry.defaultOpen);
        const launch = (): void => {
            for (const entry of defaultEntries) {
                try {
                    entry.open({ focus: false });
                }
                catch (error) {
                    try {
                        createNoThrowLoggerSinks(captureLogRedactor(globalScope)).warn([
                            `[LiveTranslatorUiLauncher] Default ${entry.id} launch failed:`,
                            error,
                        ]);
                    }
                    catch {
                    }
                }
            }
        };
        if (typeof document !== 'undefined' && document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(launch, 0), { once: true });
            return;
        }
        setTimeout(launch, 0);
    }
    globalScope['LiveTranslatorGui'] = {
        open: (options: {
            focus?: boolean;
        } = {}) => {
            windows.translator.open(options);
        },
        close: () => {
            windows.translator.close();
        },
        isOpen: () => windows.translator.isOpen(),
        url: windows.translator.url,
    };
    globalScope['LiveTranslatorUiLauncher'] = {
        openTranslator: (options: {
            focus?: boolean;
        } = {}) => {
            windows.translator.open(options);
        },
        closeTranslator: () => {
            windows.translator.close();
        },
        isTranslatorOpen: () => windows.translator.isOpen(),
        urls: { translator: windows.translator.url },
    };
    installLifecycleCloseHandlers();
    installHotkeys();
    launchDefaultWindows();
}
