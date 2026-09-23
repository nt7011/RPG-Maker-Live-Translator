import type { Image, PixelDrawing, PixelProof, PixelProofFailure, PixelGroupProof, ProofQueries, PublicationPredicate, } from './bitmap-pixel-types.js';
export function createPixelQueries(drawing: PixelDrawing, options: {
    readonly proofProgram: WebGLProgram;
    readonly proofDiagnostics?: boolean | undefined;
    readonly capacityChanged: () => void;
}) {
    const { gl, texture, uniform } = drawing;
    const { proofProgram } = options;
    const proofs = new Map<PixelProof, readonly ProofQueries[]>();
    function requireQuery(query: WebGLQuery | null): WebGLQuery {
        if (query === null)
            throw new Error('WebGL2 allocation failed.');
        return query;
    }
    function queryFlag(image: Image, diagnosticBit = -1): WebGLQuery {
        const query = requireQuery(gl.createQuery());
        let started = false;
        try {
            gl.useProgram(proofProgram);
            texture(proofProgram, 'validFlag', image, 0);
            if (options.proofDiagnostics)
                gl.uniform1i(uniform(proofProgram, 'diagnosticBit'), diagnosticBit);
            gl.colorMask(false, false, false, false);
            gl.viewport(0, 0, 1, 1);
            gl.beginQuery(gl.ANY_SAMPLES_PASSED, query);
            started = true;
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.endQuery(gl.ANY_SAMPLES_PASSED);
            started = false;
            return query;
        }
        catch (error) {
            if (started)
                gl.endQuery(gl.ANY_SAMPLES_PASSED);
            gl.deleteQuery(query);
            throw error;
        }
        finally {
            gl.colorMask(true, true, true, true);
        }
    }
    function releaseQueries(entries: readonly ProofQueries[]): void {
        for (const entry of entries) {
            gl.deleteQuery(entry.query);
            if (entry.diagnostic !== null)
                for (const query of entry.diagnostic.bits)
                    gl.deleteQuery(query);
        }
    }
    function queryPredicate({ valid, trace, groupIndex }: PublicationPredicate): ProofQueries {
        const bits: WebGLQuery[] | null = trace === null ? null : [];
        try {
            if (trace !== null && bits !== null)
                for (let bit = 0; bit < Math.ceil(Math.log2(trace.checks.length + 1)); bit++)
                    bits.push(queryFlag(trace.image, bit));
            const query = queryFlag(valid);
            return {
                query,
                groupIndex,
                diagnostic: trace === null || bits === null
                    ? null
                    : {
                        bits,
                        checks: trace.checks,
                    },
            };
        }
        catch (error) {
            if (bits !== null)
                for (const bit of bits)
                    gl.deleteQuery(bit);
            throw error;
        }
    }
    function poll(): readonly {
        proof: PixelProof;
        visible: boolean;
        failure?: PixelProofFailure | null;
        groups?: readonly PixelGroupProof[];
    }[] {
        const results: ReturnType<typeof poll>[number][] = [];
        for (const [proof, queries] of proofs) {
            const last = queries.at(-1);
            if (last === undefined || !gl.getQueryParameter(last.query, gl.QUERY_RESULT_AVAILABLE))
                break;
            proofs.delete(proof);
            options.capacityChanged();
            const groups = queries.map(({ query, diagnostic, groupIndex }) => {
                const visible = Boolean(gl.getQueryParameter(query, gl.QUERY_RESULT));
                let index = 0;
                if (!visible && diagnostic !== null)
                    for (const [bit, query] of diagnostic.bits.entries())
                        if (gl.getQueryParameter(query, gl.QUERY_RESULT))
                            index += 2 ** bit;
                const result: PixelGroupProof = {
                    groupIndex: groupIndex ?? 0,
                    visible,
                    ...(diagnostic === null
                        ? {}
                        : { failure: visible ? null : (diagnostic.checks[index - 1] ?? null) }),
                };
                return result;
            });
            const result: ReturnType<typeof poll>[number] = { proof, visible: groups.every((group) => group.visible) };
            if (last.groupIndex !== null)
                result.groups = groups;
            else if (groups[0]?.failure !== undefined)
                result.failure = groups[0].failure;
            results.push(result);
            releaseQueries(queries);
        }
        return results;
    }
    function release(proof: PixelProof): void {
        const queries = proofs.get(proof);
        if (queries === undefined)
            return;
        proofs.delete(proof);
        releaseQueries(queries);
    }
    function dispose(): void {
        const entries = [...proofs.values()];
        proofs.clear();
        for (const queries of entries)
            releaseQueries(queries);
    }
    return {
        queryPredicate,
        releaseQueries,
        poll,
        release,
        dispose,
        publish: (proof: PixelProof, queries: readonly ProofQueries[]) => {
            proofs.set(proof, queries);
        },
        count: () => proofs.size,
    };
}
export type PixelQueries = ReturnType<typeof createPixelQueries>;
