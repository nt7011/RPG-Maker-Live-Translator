// Foresight tree message-condensing helpers.
// The model builder delegates messages-only filtering here so tree construction
// and UI condensation can evolve separately.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightTreeViewerParts || {};
    globalScope.LiveTranslatorForesightTreeViewerParts = parts;

    const { cloneValue, finiteNumber, nonEmptyString } = parts.utils;
    const MESSAGE_ONLY_BRANCH_TEXT = '|------|';

    function createCondenseHelpers(dependencies = {}) {
        const { isMessageAction, createBranchMergeGroups } = dependencies;

        function condenseNodesForMessages(nodes) {
                const output = [];
                let pending = [];
                let condensedActionCount = 0;
        
                function flushPending() {
                    if (!pending.length) return;
                    output.push(createCondensedNode(pending));
                    condensedActionCount += pending.length;
                    pending = [];
                }
        
                (Array.isArray(nodes) ? nodes : []).forEach((node) => {
                    const filtered = filterNodeForMessages(node);
                    condensedActionCount += filtered.condensedActionCount;
                    if (!filtered.keep) {
                        pending = pending.concat(collectCondensedActionEntries(node));
                        return;
                    }
                    flushPending();
                    output.push(filtered.node);
                });
                flushPending();
        
                return { nodes: output, condensedActionCount };
            }
        
        function filterNodeForMessages(node) {
                if (!node || node.condensed === true) {
                    return { keep: false, node: null, condensedActionCount: 0 };
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
        
                const isMessage = isMessageAction(node.raw);
                if (!isMessage && filteredBranches.length > 0) {
                    return {
                        keep: true,
                        node: createMessageOnlyBranchNode(node, filteredBranches),
                        condensedActionCount: condensedActionCount + 1,
                    };
                }

                if (!isMessage) {
                    return { keep: false, node: null, condensedActionCount: 0 };
                }
        
                const nextNode = Object.assign({}, node, {
                    branches: filteredBranches,
                    mergeGroups: createBranchMergeGroups(filteredBranches),
                    isBranching: node.isBranching || filteredBranches.length > 0,
                });
                return { keep: true, node: nextNode, condensedActionCount };
            }

        function createMessageOnlyBranchNode(node, branches) {
                const filteredBranches = (Array.isArray(branches) ? branches : []).map((branch) => Object.assign({}, branch, {
                    label: MESSAGE_ONLY_BRANCH_TEXT,
                }));
                return {
                    messageOnlyBranch: true,
                    scrollKey: `message-branch:${nonEmptyString(node && node.scrollKey) || 'unknown'}`,
                    text: MESSAGE_ONLY_BRANCH_TEXT,
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
        
        function collectCondensedActionEntries(node, entries = []) {
                if (!node || node.condensed === true) return entries;
                entries.push(createCondensedActionEntry(node));
                (Array.isArray(node.branches) ? node.branches : []).forEach((branch) => {
                    (Array.isArray(branch && branch.nodes) ? branch.nodes : []).forEach((child) => {
                        collectCondensedActionEntries(child, entries);
                    });
                });
                return entries;
            }
        
        function createCondensedActionEntry(node) {
                const raw = node && node.raw && typeof node.raw === 'object' ? node.raw : {};
                return {
                    index: finiteNumber(node && node.index),
                    code: finiteNumber(node && node.code),
                    label: nonEmptyString(node && node.label) || nonEmptyString(raw.label),
                };
            }
        
        function createCondensedNode(entries) {
                const actions = (Array.isArray(entries) ? entries : []).map((entry) => ({
                    index: finiteNumber(entry && entry.index),
                    code: finiteNumber(entry && entry.code),
                    label: nonEmptyString(entry && entry.label),
                }));
                const tokens = actions.map(formatCondensedActionToken);
                return {
                    condensed: true,
                    actions,
                    tokens,
                    text: MESSAGE_ONLY_BRANCH_TEXT,
                    count: actions.length,
                    scrollKey: `condensed:${tokens[0] || 'empty'}:${tokens[tokens.length - 1] || 'empty'}:${actions.length}`,
                };
            }
        
        function formatCondensedActionToken(action) {
                const index = finiteNumber(action && action.index);
                if (index !== null) return String(index);
                const code = finiteNumber(action && action.code);
                return code === null ? '?' : `code:${code}`;
            }

        return { condenseNodesForMessages };
    }

    parts.modelCondense = Object.freeze({ createCondenseHelpers });
})();
