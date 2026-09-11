import type { RuntimeBitmapTextRejectionFact, RuntimeDiagnosticsIngress } from './diagnostics-ingress.js';
interface Capture {
    readonly valid: boolean;
    readonly state: {
        readonly id: number;
        readonly epoch: number;
    };
    readonly commands: readonly {
        readonly text: string;
    }[];
    readonly bounds: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    } | null;
}
export function observeBitmapCaptureAbort<T extends Capture>(accept: RuntimeDiagnosticsIngress['acceptBitmapTextRejection'], generation: number, abort: (capture: T) => void): (capture: T) => void {
    if (accept === undefined)
        return abort;
    return (capture) => {
        let fact: RuntimeBitmapTextRejectionFact | null = null;
        try {
            if (capture.valid && capture.commands.length > 0) {
                let sourceText = '', sourceTruncated = false;
                for (let index = 0; index < capture.commands.length; index++) {
                    const text = capture.commands[index]?.text ?? '';
                    const room = 256 - sourceText.length;
                    sourceText += text.slice(0, room);
                    if (text.length > room || (sourceText.length === 256 && index + 1 < capture.commands.length)) {
                        sourceTruncated = true;
                        break;
                    }
                }
                const bounds = capture.bounds;
                fact = {
                    stage: 'physical',
                    reason: 'capture-aborted',
                    sourceText,
                    sourceTruncated,
                    fields: [
                        { name: 'coreGeneration', value: generation },
                        { name: 'physicalTextId', value: capture.state.id },
                        { name: 'physicalRevision', value: capture.state.epoch },
                        { name: 'commandCount', value: capture.commands.length },
                        ...(bounds === null
                            ? []
                            : [
                                { name: 'x', value: bounds.x },
                                { name: 'y', value: bounds.y },
                                { name: 'width', value: bounds.width },
                                { name: 'height', value: bounds.height },
                            ]),
                    ],
                };
            }
        }
        catch {
        }
        try {
            abort(capture);
        }
        finally {
            try {
                if (fact !== null && !capture.valid)
                    accept(fact);
            }
            catch {
            }
        }
    };
}
