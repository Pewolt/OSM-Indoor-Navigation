import * as THREE from 'three';
import { createMeshFromShape, createPolygonMesh, createPlatformLine, createRailwayLine, createStairMesh, createEntranceMesh, createLine } from './geometry.js';
import { addGraphEdge, graph } from './graph.js';

export let osmCache = {};
export let platformRegistry = {};
export let nodeObjects = [];

export function clearData() {
    osmCache = {};
    platformRegistry = {};
    nodeObjects.length = 0;
}

export function processData(data, centerLat, centerLon, projectFn, groups, onReady) {
    const nodes = {};
    let localNodeObjects = [];

    // 1. Process Nodes
    data.elements.forEach(el => {
        osmCache[el.id] = el.tags || {};
        if (el.type === 'node') {
            const p = projectFn(el.lat, el.lon);
            nodes[el.id] = { ...p, id: el.id };
        }
    });

    const wayMap = {};
    data.elements.filter(el => el.type === 'way').forEach(w => wayMap[w.id] = w);

    // 2. Process Relations (Multipolygons & Buildings)
    data.elements.filter(el => el.type === 'relation').forEach(rel => {
        osmCache[rel.id] = rel.tags || {};
        if (rel.tags.type === 'multipolygon' || rel.tags.building || rel.tags.public_transport === 'platform' || rel.tags.railway === 'platform' || rel.tags.indoor === 'corridor' || rel.tags.indoor === 'level') {
            const shapes = assembleMultipolygon(rel, wayMap, nodes);
            if (shapes && shapes.length > 0) {

                // ARCHITEKTUR-FIX: Trennung von Hülle und Innenraum
                const isBuilding = (rel.tags.building && rel.tags.building !== 'no') || rel.tags['building:part'];
                const isRoom = rel.tags.indoor === 'room' || rel.tags.indoor === 'corridor' || rel.tags.indoor === 'level';

                let levelsToRender = parseLevels(rel.tags);

                // Gebäudehüllen werden als EIN massiver Block am niedrigsten Level gerendert
                if (isBuilding && !isRoom) {
                    let minLvl = parseFloat(rel.tags['building:min_level']) || 0;
                    levelsToRender = [minLvl];
                }

                shapes.forEach(shape => {
                    levelsToRender.forEach(level => {
                        let tags = { ...rel.tags };
                        if (tags.public_transport === 'platform' || tags.railway === 'platform') tags.type = 'platform';
                        createMeshFromShape(groups, shape, level, tags, rel.id);

                        if (tags.type === 'platform') {
                            const points = shape.extractPoints().shape.map(p => ({ x: p.x, z: p.y }));
                            registerPlatform(rel.id, tags, points, level);
                        }
                    });
                });
            }
        }
    });

    // 3. Process Ways
    data.elements.filter(el => el.type === 'way').forEach(way => {
        if (!way.nodes || way.nodes.length < 2) return;
        osmCache[way.id] = way.tags || {};
        const tags = way.tags || {};

        const pts = way.nodes.map(nid => nodes[nid]).filter(n => n);
        if (pts.length < 2) return;

        // Steps
        if (tags.highway === 'steps') {
            processSteps(groups, pts, tags, way.id);
            return;
        }

        const levels = parseLevels(tags);

        // Graph Edges
        const isPath = tags.highway || tags.indoor === 'corridor';
        if (isPath) {
            levels.forEach(lvl => {
                for (let i = 0; i < pts.length - 1; i++) {
                    addGraphEdge(groups, pts[i], pts[i + 1], lvl, tags.oneway === 'yes');
                }
            });
        }

        // Railways / Platforms
        if (tags.railway || tags.public_transport === 'platform') {
            if (!tags.level && !tags['building:levels'] && tags.layer) {
                const l = parseFloat(tags.layer);
                if (!isNaN(l)) { levels.length = 0; levels.push(l); }
            }

            levels.forEach(lvl => {
                if (tags.railway === 'platform' || tags.public_transport === 'platform') {
                    registerPlatform(way.id, tags, pts, lvl);
                    const isClosed = (pts[0].id === pts[pts.length - 1].id);
                    if (isClosed) createPolygonMesh(groups, pts, lvl, { ...tags, type: 'platform' }, way.id);
                    else createPlatformLine(groups, pts, lvl, tags, way.id);
                }
                else if (tags.railway && tags.railway !== 'platform') {
                    createRailwayLine(groups, pts, lvl, tags, way.id);
                    if (tags['railway:track_ref'] || tags.ref) registerPlatform(way.id, tags, pts, lvl);
                }
            });
        }

        // Rooms / Walls / Buildings (Flächen)
        const isBuilding = (tags.building && tags.building !== 'no') || tags['building:part'] || tags.wall;
        const isRoom = tags.indoor === 'room' || tags.indoor === 'corridor' || tags.indoor === 'level';
        const isArea = isBuilding || isRoom;

        if (isArea && tags.railway !== 'platform' && tags.public_transport !== 'platform' && pts.length > 2) {
            let levelsToRender = parseLevels(tags);

            // Auch hier: Gebäudehülle zu einem Block verschmelzen
            if (isBuilding && !isRoom) {
                let minLvl = parseFloat(tags['building:min_level']) || 0;
                levelsToRender = [minLvl];
            }

            levelsToRender.forEach(lvl => {
                createPolygonMesh(groups, pts, lvl, tags, way.id);
            });
        }
    });

    // 4. Elevators
    data.elements.filter(el => el.type === 'node' && el.tags && el.tags.highway === 'elevator').forEach(node => {
        const levelsStr = node.tags.level || "";
        const lvls = levelsStr.split(/[;,]/).map(l => parseFloat(l)).filter(l => !isNaN(l));
        lvls.sort((a, b) => a - b);
        const n = nodes[node.id];
        if (n && lvls.length > 1) {
            for (let i = 0; i < lvls.length - 1; i++) {
                const idA = `${node.id}_${lvls[i]}`;
                const idB = `${node.id}_${lvls[i + 1]}`;

                if (!graph.nodes[idA]) graph.nodes[idA] = { id: idA, x: n.x, z: n.z, level: lvls[i], osmId: node.id, neighbors: [] };
                if (!graph.nodes[idB]) graph.nodes[idB] = { id: idB, x: n.x, z: n.z, level: lvls[i + 1], osmId: node.id, neighbors: [] };

                graph.nodes[idA].neighbors.push({ id: idB, weight: 10 });
                graph.nodes[idB].neighbors.push({ id: idA, weight: 10 });

                createLine(groups, { x: n.x, z: n.z, level: lvls[i] }, { x: n.x, z: n.z, level: lvls[i + 1] }, 0xffff00, true);
            }
        }
    });

    // 5. Entrances
    data.elements.filter(el => el.type === 'node' && el.tags && (el.tags.entrance || el.tags.door)).forEach(node => {
        const n = nodes[node.id]; if (!n) return;
        let level = parseFloat(node.tags.level || "0"); if (isNaN(level)) level = 0;
        createEntranceMesh(groups, n, level, node.tags, node.id);
        localNodeObjects.push({ x: n.x, z: n.z, level: level, id: `${node.id}_${level}`, osmId: node.id, isEntrance: true });
    });

    nodeObjects.push(...localNodeObjects);

    const uniqueLevels = new Set();
    Object.values(groups).forEach(g => {
        g.children.forEach(c => {
            if (c.userData && c.userData.level !== undefined) {
                uniqueLevels.add(c.userData.level);
            }
        });
    });

    if (onReady) onReady(Array.from(uniqueLevels));
}

function processSteps(groups, pts, tags, osmId) {
    let rangeLevels = [];
    if (tags.level) {
        const matches = tags.level.match(/-?\d+(\.\d+)?/g);
        if (matches) rangeLevels = matches.map(parseFloat).sort((a, b) => a - b);
    }
    if (rangeLevels.length > 1) {
        const minLvl = rangeLevels[0]; const maxLvl = rangeLevels[rangeLevels.length - 1];
        let startLvl = minLvl, endLvl = maxLvl;
        if (tags.incline === 'down') { startLvl = maxLvl; endLvl = minLvl; }

        const startNode = pts[0]; const endNode = pts[pts.length - 1];
        const id1 = `${startNode.id}_${startLvl}`; const id2 = `${endNode.id}_${endLvl}`;

        if (!graph.nodes[id1]) graph.nodes[id1] = { id: id1, x: startNode.x, z: startNode.z, level: startLvl, osmId: startNode.id, neighbors: [] };
        if (!graph.nodes[id2]) graph.nodes[id2] = { id: id2, x: endNode.x, z: endNode.z, level: endLvl, osmId: endNode.id, neighbors: [] };

        const dist = Math.sqrt((startNode.x - endNode.x) ** 2 + (startNode.z - endNode.z) ** 2) * 2.0;
        const isOneway = tags.oneway === 'yes' || tags.conveying === 'yes';

        graph.nodes[id1].neighbors.push({ id: id2, weight: dist });
        if (!isOneway) graph.nodes[id2].neighbors.push({ id: id1, weight: dist });

        createStairMesh(groups, pts, startLvl, endLvl, tags, osmId);
    }
}

function registerPlatform(osmId, tags, points, level) {
    const trackRef = tags['railway:track_ref'];
    const localRef = tags['local_ref'];

    if (tags.ref || tags.name || trackRef) {
        let x = 0, z = 0;
        points.forEach(p => { x += p.x; z += p.z; });
        const center = { x: x / points.length, z: z / points.length };

        const entry = {
            center: center,
            level: level,
            ref: tags.ref,
            trackRef: trackRef,
            localRef: localRef,
            name: tags.name,
            osmId: osmId,
            type: (tags.railway === 'rail' || tags.railway === 'light_rail') ? 'track' : 'platform'
        };
        if (osmId) platformRegistry[osmId] = entry;
    }
}

function assembleMultipolygon(rel, wayMap, nodes) {
    const outers = []; const inners = [];
    rel.members.forEach(m => {
        if (m.type !== 'way') return;
        const w = wayMap[m.ref];
        if (!w || !w.nodes || w.nodes.length < 2) return;
        const pts = w.nodes.map(nid => nodes[nid]).filter(n => n).map(n => new THREE.Vector2(n.x, n.z));
        if (pts.length < 2) return;
        if (m.role === 'inner') inners.push(pts); else outers.push(pts);
    });
    const outerRings = stitchSegments(outers); const innerRings = stitchSegments(inners);
    const shapes = [];
    outerRings.forEach(ringPts => {
        const shape = new THREE.Shape(ringPts);
        innerRings.forEach(holePts => { const path = new THREE.Path(holePts); shape.holes.push(path); });
        shapes.push(shape);
    });
    return shapes;
}

function stitchSegments(segments) {
    if (segments.length === 0) return [];
    let pool = segments.map(s => [...s]);
    const rings = []; const epsilon = 0.01;
    while (pool.length > 0) {
        let current = pool.pop(); let closed = false; let changed = true;
        while (changed && !closed) {
            changed = false;
            const head = current[0]; const tail = current[current.length - 1];
            if (head.distanceTo(tail) < epsilon) { closed = true; break; }
            for (let i = 0; i < pool.length; i++) {
                const seg = pool[i]; const sHead = seg[0]; const sTail = seg[seg.length - 1];
                if (tail.distanceTo(sHead) < epsilon) { current = current.concat(seg.slice(1)); pool.splice(i, 1); changed = true; break; }
                else if (tail.distanceTo(sTail) < epsilon) { current = current.concat(seg.reverse().slice(1)); pool.splice(i, 1); changed = true; break; }
                else if (head.distanceTo(sTail) < epsilon) { current = seg.concat(current.slice(1)); pool.splice(i, 1); changed = true; break; }
                else if (head.distanceTo(sHead) < epsilon) { current = seg.reverse().concat(current.slice(1)); pool.splice(i, 1); changed = true; break; }
            }
        }
        if (closed || current.length > 2) rings.push(current);
    }
    return rings;
}

function parseLevels(tags) {
    const levels = new Set();
    if (tags.level) {
        const parts = tags.level.split(';');
        parts.forEach(part => {
            const rangeMatch = part.match(/^(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)$/);
            if (rangeMatch) {
                const start = parseFloat(rangeMatch[1]);
                const end = parseFloat(rangeMatch[2]);
                if (!isNaN(start) && !isNaN(end)) {
                    const min = Math.min(start, end);
                    const max = Math.max(start, end);
                    for (let i = Math.floor(min); i <= Math.floor(max); i++) levels.add(i);
                }
            } else {
                const num = parseFloat(part);
                if (!isNaN(num)) levels.add(num);
            }
        });
    } else if (tags['building:levels']) {
        const count = parseFloat(tags['building:levels']);
        if (!isNaN(count)) {
            let min = parseFloat(tags['building:min_level']) || 0;
            for (let i = 0; i < count; i++) levels.add(min + i);
        }
    }
    if (levels.size === 0) levels.add(0);
    return Array.from(levels).sort((a, b) => a - b);
}