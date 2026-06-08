// Foresight panel timeline layout.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const registry = globalScope.LiveTranslatorForesightTreeViewerRegistry;
    if (!registry || typeof registry.registerPart !== 'function') {
        throw new Error('[ForesightTreeViewer] parts registry must load before layout helpers.');
    }

    // The model keeps the scanner's ownership tree. The layout turns that tree
    // into a packed panel timeline: root actions stay on row 0, branch rows take
    // the lowest available row below their parent, and finished rows are reused
    // by later branches.
    function createTimelineLayout(model) {
        const source = model && typeof model === 'object' ? model : {};
        const layout = {
            messagesOnly: source.messagesOnly === true,
            currentMessageRecord: source.currentMessageRecord || null,
            rows: [],
            columnCount: 0,
        };
        const allocator = createLaneAllocator();
        placeSequence(Array.isArray(source.nodes) ? source.nodes : [], {
            allocator,
            layout,
            lane: 0,
            startColumn: 0,
            branchLabel: '',
            branchPath: [],
        });
        layout.rows = compactRows(layout.rows);
        layout.columnCount = Math.max(1, layout.columnCount);
        return layout;
    }

    function placeSequence(nodes, context) {
        const sourceNodes = Array.isArray(nodes) ? nodes : [];
        let column = Math.max(0, Math.floor(Number(context.startColumn) || 0));
        let pendingBranchLabel = context.branchLabel || '';

        sourceNodes.forEach((node) => {
            if (!node) return;

            if (node.messageOnlyJunction === true) {
                const branches = Array.isArray(node.branches) ? node.branches : [];
                if (branches.length === 1) {
                    // A single visible path is not a branch in the messages-only timeline.
                    // Keep the path label, but do not spend a separate row on the hidden command.
                    column = placeInlineBranch(branches[0], {
                        allocator: context.allocator,
                        layout: context.layout,
                        lane: context.lane,
                        startColumn: column,
                        branchLabel: pendingBranchLabel,
                        branchPath: context.branchPath,
                    });
                } else {
                    placeBranches(branches, {
                        allocator: context.allocator,
                        layout: context.layout,
                        parentLane: context.lane,
                        startColumn: column,
                    });
                    column += 1;
                }
                pendingBranchLabel = '';
                return;
            }

            addLayoutItem(context.layout, context.lane, column, {
                kind: node.condensed === true ? 'condensed' : 'node',
                node,
                branchLabel: pendingBranchLabel,
                branchPath: normalizeBranchPath(node.branchPath, context.branchPath),
            });
            pendingBranchLabel = '';

            if (Array.isArray(node.branches) && node.branches.length) {
                placeBranches(node.branches, {
                    allocator: context.allocator,
                    layout: context.layout,
                    parentLane: context.lane,
                    startColumn: column + 1,
                });
            }
            column += 1;
        });

        return column;
    }

    function placeInlineBranch(branch, context) {
        const source = branch && typeof branch === 'object' ? branch : {};
        const branchLabel = combineBranchLabels(context.branchLabel, normalizeBranchLabel(source));
        const branchPath = normalizeBranchPath(source.branchPath, context.branchPath);
        const nodes = Array.isArray(source.nodes) ? source.nodes : [];
        let endColumn = context.startColumn;

        if (nodes.length) {
            endColumn = placeSequence(nodes, {
                allocator: context.allocator,
                layout: context.layout,
                lane: context.lane,
                startColumn: context.startColumn,
                branchLabel,
                branchPath,
            });
        }

        endColumn = placeBranchTail(source, {
            layout: context.layout,
            lane: context.lane,
            startColumn: endColumn,
            branchPath,
        });
        context.allocator.reserve(context.lane, Math.max(context.startColumn, endColumn - 1));
        return endColumn;
    }

    function placeBranches(branches, context) {
        const sourceBranches = Array.isArray(branches) ? branches : [];
        let maxEndColumn = context.startColumn;

        sourceBranches.forEach((branch) => {
            const branchLane = context.allocator.allocate(context.startColumn, context.parentLane + 1);
            let endColumn = context.startColumn;
            const branchLabel = normalizeBranchLabel(branch);
            const branchPath = normalizeBranchPath(branch && branch.branchPath, []);
            const nodes = Array.isArray(branch && branch.nodes) ? branch.nodes : [];

            if (nodes.length) {
                endColumn = placeSequence(nodes, {
                    allocator: context.allocator,
                    layout: context.layout,
                    lane: branchLane,
                    startColumn: context.startColumn,
                    branchLabel,
                    branchPath,
                });
            } else {
                addLayoutItem(context.layout, branchLane, context.startColumn, {
                    kind: 'placeholder',
                    branch,
                    branchLabel,
                    branchPath,
                });
                endColumn = context.startColumn + 1;
            }

            endColumn = placeBranchTail(branch, {
                layout: context.layout,
                lane: branchLane,
                startColumn: endColumn,
                branchPath,
            });

            context.allocator.reserve(branchLane, Math.max(context.startColumn, endColumn - 1));
            maxEndColumn = Math.max(maxEndColumn, endColumn);
        });

        return maxEndColumn;
    }

    function placeBranchTail(branch, context) {
        let column = context.startColumn;
        const stops = Array.isArray(branch && branch.stops) ? branch.stops : [];
        if (stops.length) {
            addLayoutItem(context.layout, context.lane, column, {
                kind: 'stop',
                branch,
                stops,
                branchPath: context.branchPath,
            });
            column += 1;
        }

        const hiddenCount = Math.max(0, Number(branch && branch.actionsTruncated) || 0);
        if (hiddenCount > 0) {
            addLayoutItem(context.layout, context.lane, column, {
                kind: 'truncated',
                branch,
                count: hiddenCount,
                branchPath: context.branchPath,
            });
            column += 1;
        }
        return column;
    }

    function addLayoutItem(layout, lane, column, item) {
        const row = ensureLayoutRow(layout, lane);
        const nextItem = Object.assign({}, item, {
            lane,
            column,
        });
        row.items.push(nextItem);
        layout.columnCount = Math.max(layout.columnCount, column + 1);
        return nextItem;
    }

    function ensureLayoutRow(layout, lane) {
        const safeLane = Math.max(0, Math.floor(Number(lane) || 0));
        if (!layout.rows[safeLane]) {
            layout.rows[safeLane] = {
                lane: safeLane,
                items: [],
            };
        }
        return layout.rows[safeLane];
    }

    function compactRows(rows) {
        return (Array.isArray(rows) ? rows : [])
            .filter((row) => row && Array.isArray(row.items) && row.items.length)
            .map((row, rowIndex) => ({
                lane: row.lane,
                rowIndex,
                items: row.items
                    .slice()
                    .sort((left, right) => left.column - right.column)
                    .map((item) => Object.assign({}, item, { rowIndex })),
            }));
    }

    function createLaneAllocator() {
        const busyUntilByLane = new Map();
        return {
            allocate(startColumn, minLane) {
                let lane = Math.max(0, Math.floor(Number(minLane) || 0));
                while ((busyUntilByLane.get(lane) ?? -1) >= startColumn) {
                    lane += 1;
                }
                return lane;
            },
            reserve(lane, endColumn) {
                const safeLane = Math.max(0, Math.floor(Number(lane) || 0));
                const safeEnd = Math.max(0, Math.floor(Number(endColumn) || 0));
                busyUntilByLane.set(safeLane, Math.max(busyUntilByLane.get(safeLane) ?? -1, safeEnd));
            },
        };
    }

    function normalizeBranchLabel(branch) {
        const source = branch && typeof branch === 'object' ? branch : {};
        const label = typeof source.label === 'string' && source.label.trim()
            ? source.label.trim()
            : '';
        if (label) return label;
        const index = Number(source.branchIndex);
        return Number.isFinite(index) ? `Branch ${Math.floor(index) + 1}` : 'Branch';
    }

    function combineBranchLabels(parent, child) {
        const parentLabel = typeof parent === 'string' && parent.trim() ? parent.trim() : '';
        const childLabel = typeof child === 'string' && child.trim() ? child.trim() : '';
        if (!parentLabel) return childLabel;
        if (!childLabel || childLabel === parentLabel) return parentLabel;
        return `${parentLabel} / ${childLabel}`;
    }

    function normalizeBranchPath(value, fallback) {
        if (Array.isArray(value)) {
            return value
                .map((entry) => Number(entry))
                .filter((entry) => Number.isFinite(entry))
                .map((entry) => Math.max(0, Math.floor(entry)));
        }
        return Array.isArray(fallback) ? fallback.slice() : [];
    }

    registry.registerPart('layout', Object.freeze({ createTimelineLayout }));
})();
