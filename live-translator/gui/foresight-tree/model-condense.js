// Foresight tree message-condensing helpers.
// The model builder delegates messages-only filtering here so tree construction
// and UI condensation can evolve separately.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const registry = globalScope.LiveTranslatorForesightTreeViewerRegistry;
    if (!registry || typeof registry.registerPart !== 'function' || typeof registry.requirePart !== 'function') {
        throw new Error('[ForesightTreeViewer] parts registry must load before message condensing helpers.');
    }

    const { cloneValue, finiteNumber, nonEmptyString } = registry.requirePart('utils');

    function createCondenseHelpers(dependencies = {}) {
        const { isMessageAction, createBranchMergeGroups } = dependencies;

        function condenseNodesForMessages(nodes) {
                const output = [];
                let condensedActionCount = 0;

                (Array.isArray(nodes) ? nodes : []).forEach((node) => {
                    const filtered = filterNodeForMessages(node);
                    condensedActionCount += filtered.condensedActionCount;
                    if (filtered.keep) output.push(filtered.node);
                });

                return { nodes: output, condensedActionCount };
            }
        
        function filterNodeForMessages(node) {
                if (!node || node.condensed === true) {
                    return { keep: false, node: null, condensedActionCount: countHiddenActions(node) };
                }
        
                const filteredBranches = [];
                let condensedActionCount = 0;
                (Array.isArray(node.branches) ? node.branches : []).forEach((branch) => {
                    const filtered = condenseNodesForMessages(branch && branch.nodes);
                    condensedActionCount += filtered.condensedActionCount;
                    if (!containsVisibleMessagePath(filtered.nodes)) return;
                    filteredBranches.push(Object.assign({}, branch, {
                        nodes: filtered.nodes,
                        mergeGroups: [],
                    }));
                });
        
                const isMessage = isMessageAction(node.raw) && !!node.messageRecord;
                if (!isMessage && filteredBranches.length > 0) {
                    return {
                        keep: true,
                        node: createMessageOnlyJunctionNode(node, filteredBranches),
                        condensedActionCount: condensedActionCount + 1,
                    };
                }

                if (!isMessage) {
                    return { keep: false, node: null, condensedActionCount: condensedActionCount + 1 };
                }
        
                const nextNode = Object.assign({}, node, {
                    branches: filteredBranches,
                    mergeGroups: createBranchMergeGroups(filteredBranches),
                    isBranching: node.isBranching || filteredBranches.length > 0,
                });
                return { keep: true, node: nextNode, condensedActionCount };
            }

        function createMessageOnlyJunctionNode(node, branches) {
                const filteredBranches = Array.isArray(branches) ? branches : [];
                return {
                    messageOnlyJunction: true,
                    scrollKey: `message-junction:${nonEmptyString(node && node.scrollKey) || 'unknown'}`,
                    branchDepth: finiteNumber(node && node.branchDepth),
                    branchPath: cloneValue(node && node.branchPath, 0),
                    listContext: cloneValue(node && node.listContext, 0),
                    branches: filteredBranches,
                    mergeGroups: createBranchMergeGroups(filteredBranches),
                    ownerKey: nonEmptyString(node && node.ownerKey),
                    isBranching: true,
                };
            }
        
        function containsVisibleMessagePath(nodes) {
                return (Array.isArray(nodes) ? nodes : []).some((node) => node && node.condensed !== true);
            }

        function countHiddenActions(node) {
                if (!node) return 0;
                if (node.condensed === true) {
                    const count = finiteNumber(node.count);
                    return count === null ? 0 : Math.max(0, count);
                }
                return 1;
            }

        return { condenseNodesForMessages };
    }

    registry.registerPart('modelCondense', Object.freeze({ createCondenseHelpers }));
})();
