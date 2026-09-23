import { own } from '../../foresight/commands.js';
import type { ForesightLocation, ForesightProjection, ForesightPreparation, ForesightViewStats, } from '../../foresight/view.js';
interface State {
    readonly episode: number;
    readonly textId: number;
    readonly index: number;
    readonly phase: 'scanning' | 'projecting' | 'preparing' | 'complete';
    readonly prepared: number;
    readonly failed: number;
    readonly outstanding: boolean;
    readonly scan: (ForesightViewStats & {
        readonly callFrames: number;
        readonly externalCommands: number;
        readonly stateCommands: number;
    }) | null;
    readonly projection: ForesightProjection | null;
}
interface Request {
    readonly episode: number;
    readonly requestId: number;
    readonly location: ForesightLocation | null;
    readonly units: number;
    readonly state: ForesightPreparation;
    readonly immediate: boolean;
}
function address(value: ForesightLocation | null) {
    return value === null
        ? null
        : {
            commonEvent: value.commonEvent,
            index: value.index,
            via: value.via.map((step) => ({
                commonEvent: step.commonEvent,
                index: step.index,
                childCommonEvent: step.childCommonEvent,
            })),
        };
}
export function createForesightLog(logger: unknown) {
    const emit = own(logger, 'emit');
    function write(level: 'info' | 'debug', value: object): void {
        if (typeof emit !== 'function')
            return;
        try {
            Reflect.apply(emit, logger, [level, '[Foresight] ' + JSON.stringify(value)]);
        }
        catch {
        }
    }
    return Object.freeze({
        state(event: 'start' | 'phase' | 'retire' | 'work', value: State): void {
            const scan = value.scan, projection = value.projection, stop = scan?.lastStop;
            write(event === 'work' ? 'debug' : 'info', {
                event,
                episode: value.episode,
                textId: value.textId,
                index: value.index,
                phase: value.phase,
                prepared: value.prepared,
                failed: value.failed,
                outstanding: value.outstanding,
                scan: scan === null
                    ? null
                    : {
                        reads: scan.reads,
                        nodes: scan.nodes,
                        candidates: scan.candidates,
                        units: scan.units,
                        callFrames: scan.callFrames,
                        externalCommands: scan.externalCommands,
                        stateCommands: scan.stateCommands,
                        stop: stop == null
                            ? null
                            : { reason: stop.reason, code: stop.code, location: address(stop.location) },
                    },
                projection: projection === null
                    ? null
                    : {
                        state: projection.state,
                        work: projection.work,
                        reachable: projection.reachable,
                        collapsed: projection.collapsed,
                        hiddenStops: projection.hiddenStops,
                        projected: projection.projected,
                        omittedNodes: projection.omittedNodes,
                    },
            });
        },
        request(event: 'admission' | 'settled', value: Request): void {
            write('debug', {
                event,
                episode: value.episode,
                requestId: value.requestId,
                location: address(value.location),
                units: value.units,
                state: value.state,
                immediate: value.immediate,
            });
        },
    });
}
