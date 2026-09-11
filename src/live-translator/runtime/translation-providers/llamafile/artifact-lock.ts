import type * as Net from 'node:net';
export const ARTIFACT_LOCK_PORT = 43197;
const HOST = '127.0.0.1';
const GREETING = 'RMLT llamafile preparation v1\n';
const HANDSHAKE_TIMEOUT_MS = 2000;
export async function acquireArtifactLock(net: typeof Net, port: number, signal: AbortSignal): Promise<() => Promise<void>> {
    for (;;) {
        signal.throwIfAborted();
        const peers = new Set<Net.Socket>();
        const server = net.createServer((socket) => {
            peers.add(socket);
            socket.on('error', () => undefined);
            socket.once('close', () => peers.delete(socket));
            socket.write(GREETING);
        });
        try {
            await new Promise<void>((resolve, reject) => {
                server.once('error', reject);
                server.listen({ port, host: HOST, exclusive: true }, resolve);
            });
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE')
                throw error;
            await waitForOwner(net, port, signal);
            continue;
        }
        const release = (): Promise<void> => new Promise((resolve, reject) => {
            server.close((error) => {
                if (error)
                    reject(error);
                else
                    resolve();
            });
            for (const socket of peers)
                socket.destroy();
        });
        if (signal.aborted) {
            await release();
            signal.throwIfAborted();
        }
        return release;
    }
}
function waitForOwner(net: typeof Net, port: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        signal.throwIfAborted();
        const socket = net.createConnection({ port, host: HOST });
        let failure: Error | null = null;
        let greeting = '';
        let identified = false;
        const conflict = (): Error => {
            failure = Object.assign(new Error(`The shared llamafile preparation port ${String(port)} is occupied by an unrelated or unresponsive service.`), { code: 'LLAMAFILE_LOCK_CONFLICT' });
            socket.destroy();
            return failure;
        };
        const handshakeTimeout = setTimeout(conflict, HANDSHAKE_TIMEOUT_MS);
        socket.on('data', (chunk: Buffer) => {
            if (identified)
                return;
            greeting += chunk.toString();
            if (!GREETING.startsWith(greeting))
                conflict();
            else if (greeting === GREETING) {
                identified = true;
                clearTimeout(handshakeTimeout);
            }
        });
        const abort = (): void => {
            socket.destroy();
        };
        signal.addEventListener('abort', abort, { once: true });
        socket.on('error', (error: NodeJS.ErrnoException) => {
            if (error.code !== 'ECONNREFUSED' && error.code !== 'ECONNRESET')
                failure = error;
            else
                identified = true;
        });
        socket.once('close', () => {
            clearTimeout(handshakeTimeout);
            signal.removeEventListener('abort', abort);
            if (signal.aborted)
                reject(signal.reason);
            else if (failure)
                reject(failure);
            else if (!identified)
                reject(conflict());
            else
                resolve();
        });
        if (signal.aborted)
            abort();
    });
}
