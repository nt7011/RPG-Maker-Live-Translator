import { finiteNumber, nonEmptyString } from './utils.js';
import type { BranchMergeGroup, ForesightBranch, ForesightNode } from './model-types.js';
interface CondenseDependencies {
    isMessageAction: (value: unknown) => boolean;
    createBranchMergeGroups: (branches: ForesightBranch[]) => BranchMergeGroup[];
}
interface CondenseResult {
    nodes: ForesightNode[];
    condensedActionCount: number;
}
type FilterResult = {
    keep: false;
    node: null;
    condensedActionCount: number;
} | {
    keep: true;
    node: ForesightNode;
    condensedActionCount: number;
};
export interface CondenseHelpers {
    condenseNodesForMessages(nodes: ForesightNode[]): CondenseResult;
}
export function createCondenseHelpers(dependencies: CondenseDependencies): CondenseHelpers {
    const { isMessageAction, createBranchMergeGroups } = dependencies;
    function condenseNodesForMessages(nodes: ForesightNode[]): CondenseResult {
        const output: ForesightNode[] = [];
        let condensedActionCount = 0;
        for (const node of nodes) {
            const filtered = filterNodeForMessages(node);
            condensedActionCount += filtered.condensedActionCount;
            if (filtered.keep)
                output.push(filtered.node);
        }
        return { nodes: output, condensedActionCount };
    }
    function filterNodeForMessages(node: ForesightNode | null | undefined): FilterResult {
        if (!node || node.condensed === true) {
            return { keep: false, node: null, condensedActionCount: countHiddenActions(node) };
        }
        const filteredBranches: ForesightBranch[] = [];
        let condensedActionCount = 0;
        for (const branch of node.branches ?? []) {
            const filtered = condenseNodesForMessages(branch.nodes ?? []);
            condensedActionCount += filtered.condensedActionCount;
            if (!containsVisibleMessagePath(filtered.nodes))
                continue;
            filteredBranches.push({ ...branch, nodes: filtered.nodes, mergeGroups: [] });
        }
        const isMessage = isMessageAction(node.raw) && Boolean(node.messageRecord);
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
        return {
            keep: true,
            node: {
                ...node,
                branches: filteredBranches,
                mergeGroups: createBranchMergeGroups(filteredBranches),
                isBranching: node.isBranching === true || filteredBranches.length > 0,
            },
            condensedActionCount,
        };
    }
    function createMessageOnlyJunctionNode(node: ForesightNode, branches: ForesightBranch[]): ForesightNode {
        const candidateScrollKey = nonEmptyString(node.scrollKey);
        let scrollKey = 'unknown';
        if (candidateScrollKey)
            scrollKey = candidateScrollKey;
        return {
            messageOnlyJunction: true,
            scrollKey: `message-junction:${scrollKey}`,
            branchDepth: finiteNumber(node.branchDepth),
            branchPath: node.branchPath,
            listContext: node.listContext,
            branches,
            mergeGroups: createBranchMergeGroups(branches),
            ownerKey: nonEmptyString(node.ownerKey),
            isBranching: true,
        };
    }
    function containsVisibleMessagePath(nodes: ForesightNode[]): boolean {
        return nodes.some((node) => node.condensed !== true);
    }
    function countHiddenActions(node: ForesightNode | null | undefined): number {
        if (!node)
            return 0;
        if (node.condensed === true) {
            const count = finiteNumber(node.count);
            return count === null ? 0 : Math.max(0, count);
        }
        return 1;
    }
    return { condenseNodesForMessages };
}
