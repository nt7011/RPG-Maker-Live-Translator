import { propertyValue } from '../types.js';
export function clearDrawCaptureTrace(gameWindow: unknown): boolean {
    try {
        const service = propertyValue(gameWindow, 'LiveTranslatorDiagnostics');
        const clear = propertyValue(service, 'clearBitmapTextRejections');
        if (typeof clear !== 'function')
            return false;
        Reflect.apply(clear as (this: unknown) => unknown, service, []);
        return true;
    }
    catch {
        return false;
    }
}
