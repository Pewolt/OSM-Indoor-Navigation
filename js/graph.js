
import * as THREE from 'three';
import { createLine } from './geometry.js';

export let graph = { nodes: {}, edges: [] };

export function clearGraph() {
    graph = { nodes: {}, edges: [] };
}

export function addGraphEdge(groups, n1, n2, level, isOneway) {
    const id1 = `${n1.id}_${level}`;
    const id2 = `${n2.id}_${level}`;

    if (!graph.nodes[id1]) graph.nodes[id1] = { id: id1, x: n1.x, z: n1.z, level: level, osmId: n1.id, neighbors: [] };
    if (!graph.nodes[id2]) graph.nodes[id2] = { id: id2, x: n2.x, z: n2.z, level: level, osmId: n2.id, neighbors: [] };

    const dist = Math.sqrt((n1.x - n2.x) ** 2 + (n1.z - n2.z) ** 2);
    graph.nodes[id1].neighbors.push({ id: id2, weight: dist });
    if (!isOneway) graph.nodes[id2].neighbors.push({ id: id1, weight: dist });

    createLine(groups, { x: n1.x, z: n1.z, level }, { x: n2.x, z: n2.z, level }, 0xffffff, false);
}

export function calculateRoute(startNodeId, endNodeId) {
    if (!startNodeId || !endNodeId) return null;

    const dists = {};
    const prev = {};
    const pq = new Set();

    if (!graph.nodes[startNodeId]) return null;

    for (let id in graph.nodes) {
        dists[id] = Infinity;
        prev[id] = null;
        pq.add(id);
    }
    dists[startNodeId] = 0;

    while (pq.size > 0) {
        let u = null;
        for (const node of pq) { if (u === null || dists[node] < dists[u]) u = node; }

        if (u === endNodeId || dists[u] === Infinity) break;

        pq.delete(u);
        const neighbors = graph.nodes[u].neighbors;
        for (const v of neighbors) {
            if (pq.has(v.id)) {
                const alt = dists[u] + v.weight;
                if (alt < dists[v.id]) {
                    dists[v.id] = alt;
                    prev[v.id] = u;
                }
            }
        }
    }

    const path = [];
    let curr = endNodeId;
    if (prev[curr] !== null || curr === startNodeId) {
        while (curr !== null) {
            path.unshift(curr);
            curr = prev[curr];
        }
    }

    if (path.length > 1) return { path, dists };
    return null;
}

export function getGraphNodesData() {
    // Return array of node data for visualization points
    const positions = [];
    const nodeObjList = [];
    Object.values(graph.nodes).forEach(node => {
        positions.push(node.x, 0, node.z); // Y is set later
        nodeObjList.push({ x: node.x, z: node.z, level: node.level, id: node.id, osmId: node.osmId });
    });
    return { positions, nodeObjList };
}
