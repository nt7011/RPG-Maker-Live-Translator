import { nodeModules } from './state.js';
import type { UnknownRecord } from './types.js';
import { isUnknownRecord, propertyValue } from './types.js';
export type NodeEventHandler = (...args: unknown[]) => void;
type NodeRequire = (moduleName: string) => unknown;
function callMethod(receiver: unknown, name: PropertyKey, args: unknown[]): unknown {
    const method = propertyValue(receiver, name);
    if (typeof method !== 'function')
        throw new Error(`NW.js API method is unavailable: ${String(name)}`);
    return Reflect.apply(method, receiver, args);
}
export function getNodeRequire(): NodeRequire | null {
    const directRequire = propertyValue(globalThis, 'require');
    if (typeof directRequire === 'function') {
        return (moduleName) => {
            const loaded: unknown = Reflect.apply(directRequire, globalThis, [moduleName]);
            return loaded;
        };
    }
    const nw = propertyValue(globalThis, 'nw');
    const nwRequire = propertyValue(nw, 'require');
    if (typeof nwRequire !== 'function')
        return null;
    return (moduleName) => {
        const loaded: unknown = Reflect.apply(nwRequire, nw, [moduleName]);
        return loaded;
    };
}
export function initializeNodeModules(): boolean {
    const requireModule = getNodeRequire();
    if (!requireModule)
        return false;
    nodeModules.fs = requireModule('fs');
    nodeModules.path = requireModule('path');
    nodeModules.https = requireModule('https');
    return true;
}
export function hasHttpsModule(): boolean {
    return typeof propertyValue(nodeModules.https, 'request') === 'function';
}
export function requestHttps(url: URL, options: UnknownRecord, callback: (response: unknown) => void): unknown {
    return callMethod(nodeModules.https, 'request', [url, options, callback]);
}
export function onNodeEvent(target: unknown, eventName: string, handler: NodeEventHandler): void {
    callMethod(target, 'on', [eventName, handler]);
}
export function callNodeMethod(target: unknown, methodName: string, ...args: unknown[]): unknown {
    return callMethod(target, methodName, args);
}
export function readNodeHeader(response: unknown, name: string): unknown {
    return propertyValue(propertyValue(response, 'headers'), name);
}
export function readNodeStatusCode(response: unknown): number {
    return Number(propertyValue(response, 'statusCode')) || 0;
}
export function isFile(filePath: string): boolean {
    if (!filePath || typeof propertyValue(nodeModules.fs, 'statSync') !== 'function')
        return false;
    try {
        const stats = callMethod(nodeModules.fs, 'statSync', [filePath]);
        return callMethod(stats, 'isFile', []) === true;
    }
    catch {
        return false;
    }
}
export function isDirectory(directoryPath: string): boolean {
    if (!directoryPath || typeof propertyValue(nodeModules.fs, 'statSync') !== 'function')
        return false;
    try {
        const stats = callMethod(nodeModules.fs, 'statSync', [directoryPath]);
        return callMethod(stats, 'isDirectory', []) === true;
    }
    catch {
        return false;
    }
}
export function readTextFile(filePath: string): string {
    const value = callMethod(nodeModules.fs, 'readFileSync', [filePath, 'utf8']);
    if (typeof value !== 'string')
        throw new Error(`NW.js fs.readFileSync returned non-text data: ${filePath}`);
    return value;
}
export function joinPath(basePath: string, childPath: string): string {
    const value = callMethod(nodeModules.path, 'join', [basePath, childPath]);
    if (typeof value !== 'string')
        throw new Error('NW.js path.join returned a non-string path.');
    return value;
}
export function hasFileSystemSupport(): boolean {
    return (typeof propertyValue(nodeModules.fs, 'readFileSync') === 'function' &&
        typeof propertyValue(nodeModules.path, 'join') === 'function');
}
export function getProcessCwd(): string {
    try {
        const processValue = propertyValue(globalThis, 'process');
        const cwd = propertyValue(processValue, 'cwd');
        if (typeof cwd !== 'function')
            return '';
        const value: unknown = Reflect.apply(cwd, processValue, []);
        return typeof value === 'string' ? value : '';
    }
    catch {
        return '';
    }
}
export function closeNwWindow(): boolean {
    try {
        const nw = propertyValue(globalThis, 'nw');
        const windowApi = propertyValue(nw, 'Window');
        const getWindow = propertyValue(windowApi, 'get');
        if (typeof getWindow !== 'function')
            return false;
        const currentWindow: unknown = Reflect.apply(getWindow, windowApi, []);
        callMethod(currentWindow, 'close', [true]);
        return true;
    }
    catch {
        return false;
    }
}
export interface BrowserShell {
    openExternal(url: string): void;
}
function normalizeBrowserShell(value: unknown): BrowserShell | null {
    const openExternal = propertyValue(value, 'openExternal');
    if (typeof openExternal !== 'function')
        return null;
    return {
        openExternal(url) {
            Reflect.apply(openExternal, value, [url]);
        },
    };
}
export function getBrowserShell(): BrowserShell | null {
    const nw = propertyValue(globalThis, 'nw');
    const globalShell = normalizeBrowserShell(propertyValue(nw, 'Shell'));
    if (globalShell)
        return globalShell;
    const requireModule = getNodeRequire();
    if (!requireModule)
        return null;
    try {
        const gui = requireModule('nw.gui');
        return normalizeBrowserShell(propertyValue(gui, 'Shell'));
    }
    catch {
        return null;
    }
}
export function getUtf8ByteLength(value: string): number {
    const buffer = propertyValue(globalThis, 'Buffer');
    const byteLength = propertyValue(buffer, 'byteLength');
    if (typeof byteLength !== 'function')
        return value.length;
    const result: unknown = Reflect.apply(byteLength, buffer, [value, 'utf8']);
    return typeof result === 'number' && Number.isFinite(result) ? result : value.length;
}
export function unknownRecord(value: unknown): UnknownRecord | null {
    return isUnknownRecord(value) ? value : null;
}
