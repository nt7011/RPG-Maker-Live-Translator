// Shared draw graph for bitmap/window replay planning.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.drawGraph',
        requires: {
            bitmapRenderOps: 'runtime.bitmapRenderOps',
            entryLifecycle: 'runtime.entryLifecycle',
        },
        factory({ bitmapRenderOps, entryLifecycle }) {
            const COVERAGE_EPSILON = 0.5;

            function createDrawGraph(items, options = {}) {
                const list = Array.isArray(items) ? items : [];
                const getItemRect = typeof options.getItemRect === 'function' ? options.getItemRect : defaultGetItemRect;
                const targetBitmap = options.targetBitmap || null;
                const nodes = list
                    .map((item, index) => createNode(item, index, { getItemRect, targetBitmap }))
                    .filter(Boolean)
                    .sort(compareNodesByOrder);
                return {
                    nodes,
                    items: nodes.map((node) => node.item),
                    surfaces: collectSurfaces(nodes),
                };
            }

            function createNode(item, index, options = {}) {
                if (!item) return null;
                if (item.type === 'renderOp') {
                    return createRenderOpNode(item, index, options);
                }
                if (item.type === 'windowText' || item.type === 'text') {
                    return createTextNode(item, index, options);
                }
                return createUnknownNode(item, index, options);
            }

            function createRenderOpNode(item, index, options) {
                const op = item.op || {};
                const methodName = String(op.methodName || '');
                const args = Array.isArray(op.args) ? op.args : [];
                const targetBitmap = options.targetBitmap || null;
                const traits = bitmapRenderOps.classifyRenderOp(methodName, {
                    args,
                    targetBitmap,
                    sourceBitmap: op.sourceBitmap,
                    traits: op.traits || null,
                });
                const rect = normalizeRect((options.getItemRect || defaultGetItemRect)(item));
                return {
                    id: createNodeId(item, index),
                    item,
                    index,
                    type: 'renderOp',
                    surfaceId: String(item.surfaceId || op.surfaceId || ''),
                    kind: traits.nativeText ? 'textDraw' : 'mutation',
                    drawOrder: finiteNumber(item.drawOrder, op.drawOrder, index),
                    rect,
                    methodName,
                    paintsArea: traits.paintsArea,
                    clearsArea: traits.clearsArea,
                    coversArea: traits.coversArea,
                    copiesSelf: traits.copiesSelf,
                    copiesExternal: traits.copiesExternal,
                    changesDimensions: traits.changesDimensions,
                    nativeText: traits.nativeText,
                    replayable: traits.replayable,
                    unsupported: traits.unsupported,
                    invalidates: traits.invalidates,
                };
            }

            function createTextNode(item, index, options) {
                const entry = item.entry || {};
                return {
                    id: createNodeId(item, index),
                    item,
                    index,
                    type: item.type,
                    surfaceId: String(item.surfaceId || entry.surfaceId || ''),
                    kind: 'textDraw',
                    drawOrder: finiteNumber(item.drawOrder, entry.drawOrder, index),
                    rect: normalizeRect((options.getItemRect || defaultGetItemRect)(item)),
                    methodName: String(entry.type || entry.methodName || 'text'),
                    paintsArea: true,
                    clearsArea: false,
                    coversArea: false,
                    copiesSelf: false,
                    copiesExternal: false,
                    changesDimensions: false,
                    nativeText: false,
                    replayable: !entryLifecycle.isStale(entry),
                    unsupported: false,
                    invalidates: 'none',
                };
            }

            function createUnknownNode(item, index, options) {
                return {
                    id: createNodeId(item, index),
                    item,
                    index,
                    type: String(item.type || 'unknown'),
                    surfaceId: String(item.surfaceId || ''),
                    kind: 'unknown',
                    drawOrder: finiteNumber(item.drawOrder, index),
                    rect: normalizeRect((options.getItemRect || defaultGetItemRect)(item)),
                    methodName: '',
                    paintsArea: false,
                    clearsArea: false,
                    coversArea: false,
                    copiesSelf: false,
                    copiesExternal: false,
                    changesDimensions: false,
                    nativeText: false,
                    replayable: false,
                    unsupported: true,
                    invalidates: 'unknown',
                };
            }

            function toReplayItems(graphOrNodes) {
                const nodes = Array.isArray(graphOrNodes)
                    ? graphOrNodes
                    : (graphOrNodes && Array.isArray(graphOrNodes.nodes) ? graphOrNodes.nodes : []);
                return nodes
                    .filter((node) => !node || node.replayable !== false)
                    .map((node) => node && node.item)
                    .filter(Boolean);
            }

            function coverageContainsRect(nodes, targetRect, options = {}) {
                const target = normalizeRect(targetRect);
                if (!target) return false;
                const epsilon = Number.isFinite(Number(options.coverageEpsilon))
                    ? Math.max(0, Number(options.coverageEpsilon))
                    : COVERAGE_EPSILON;
                const coverageRects = (Array.isArray(nodes) ? nodes : [])
                    .filter((node) => node && node.coversArea && node.replayable && node.rect)
                    .map((node) => node.rect);
                return rectCoverageContainsRect(target, coverageRects, epsilon);
            }

            function summarize(graphOrNodes, limit = 8) {
                const nodes = Array.isArray(graphOrNodes)
                    ? graphOrNodes
                    : (graphOrNodes && Array.isArray(graphOrNodes.nodes) ? graphOrNodes.nodes : []);
                const methods = {};
                let minOrder = null;
                let maxOrder = null;
                nodes.forEach((node) => {
                    const order = Number(node && node.drawOrder);
                    if (Number.isFinite(order)) {
                        minOrder = minOrder === null ? order : Math.min(minOrder, order);
                        maxOrder = maxOrder === null ? order : Math.max(maxOrder, order);
                    }
                    const key = summarizeNodeKey(node);
                    methods[key] = (methods[key] || 0) + 1;
                });
                return {
                    count: nodes.length,
                    omitted: Math.max(0, nodes.length - Math.max(0, Number(limit) || 0)),
                    orderMin: minOrder,
                    orderMax: maxOrder,
                    methods,
                };
            }

            function summarizeNodeKey(node) {
                if (!node) return 'unknown';
                if (node.type === 'renderOp' && node.methodName) return `op:${node.methodName}`;
                if (node.type === 'windowText' && node.methodName) return `window:${node.methodName}`;
                return node.type || 'unknown';
            }

            function compareNodesByOrder(a, b) {
                const orderDelta = (Number(a && a.drawOrder) || 0) - (Number(b && b.drawOrder) || 0);
                if (orderDelta) return orderDelta;
                return (Number(a && a.index) || 0) - (Number(b && b.index) || 0);
            }

            function collectSurfaces(nodes) {
                const seen = {};
                const surfaces = [];
                nodes.forEach((node) => {
                    const surfaceId = String(node && node.surfaceId || '');
                    if (!surfaceId || seen[surfaceId]) return;
                    seen[surfaceId] = true;
                    surfaces.push(surfaceId);
                });
                return surfaces;
            }

            function createNodeId(item, index) {
                const type = String(item && item.type || 'unknown');
                const order = finiteNumber(item && item.drawOrder, item && item.op && item.op.drawOrder, index);
                return `${type}:${order}:${index}`;
            }

            function defaultGetItemRect(item) {
                if (item && item.type === 'renderOp' && item.op) return item.op.rect || null;
                if (item && (item.type === 'windowText' || item.type === 'text') && item.entry) {
                    return item.entry.renderedBounds || item.entry.bounds || null;
                }
                return null;
            }

            function normalizeRect(rect) {
                if (!rect) return null;
                const x1 = Number(rect.x1);
                const y1 = Number(rect.y1);
                const x2 = Number(rect.x2);
                const y2 = Number(rect.y2);
                if (![x1, y1, x2, y2].every(Number.isFinite) || x2 <= x1 || y2 <= y1) return null;
                return { x1, y1, x2, y2 };
            }

            function rectCoverageContainsRect(target, coverageRects, epsilon) {
                if (!target || !Array.isArray(coverageRects) || !coverageRects.length) return false;
                let remaining = [target];
                for (const rect of coverageRects) {
                    const cover = expandRect(rect, epsilon);
                    const next = [];
                    remaining.forEach((piece) => {
                        next.push(...subtractRect(piece, cover));
                    });
                    remaining = next;
                    if (!remaining.length) return true;
                }
                return false;
            }

            function expandRect(rect, amount) {
                const pad = Math.max(0, Number(amount) || 0);
                return {
                    x1: Number(rect.x1) - pad,
                    y1: Number(rect.y1) - pad,
                    x2: Number(rect.x2) + pad,
                    y2: Number(rect.y2) + pad,
                };
            }

            function subtractRect(rect, cover) {
                const ix1 = Math.max(Number(rect.x1), Number(cover.x1));
                const iy1 = Math.max(Number(rect.y1), Number(cover.y1));
                const ix2 = Math.min(Number(rect.x2), Number(cover.x2));
                const iy2 = Math.min(Number(rect.y2), Number(cover.y2));
                if (ix1 >= ix2 || iy1 >= iy2) return [rect];
                const pieces = [];
                pushRect(pieces, rect.x1, rect.y1, rect.x2, iy1);
                pushRect(pieces, rect.x1, iy2, rect.x2, rect.y2);
                pushRect(pieces, rect.x1, iy1, ix1, iy2);
                pushRect(pieces, ix2, iy1, rect.x2, iy2);
                return pieces;
            }

            function pushRect(list, x1, y1, x2, y2) {
                if (Number(x2) > Number(x1) && Number(y2) > Number(y1)) {
                    list.push({ x1, y1, x2, y2 });
                }
            }

            function finiteNumber(...values) {
                for (let index = 0; index < values.length; index += 1) {
                    const number = Number(values[index]);
                    if (Number.isFinite(number)) return number;
                }
                return 0;
            }

            return {
                createDrawGraph,
                toReplayItems,
                coverageContainsRect,
                summarize,
            };
        },
    });
})();
