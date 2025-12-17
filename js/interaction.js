
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { getY, updateStairVisuals } from './geometry.js';
import { nodeObjects, platformRegistry } from './data.js';
import { graph, calculateRoute } from './graph.js';
import { setStatus, showInfo, updateRouteInfo, updateLockStatus } from './ui.js';

let scene, camera, renderer, controls, raycaster, mouse;
let groupsRef;

let startNodeId = null;
let endNodeId = null;
let explosionOffset = 0;
let isDestinationLocked = false; // "Ziel fixiert" (from Find Track)
let isStartLocked = false;       // "Start fixiert" (Manual Lock)

// Replay State
let replayIndex = -1;
let currentReplayPath = [];
let currentDists = {};
// Store lines per step: index -> array of THREE.Line
let replayStepLines = {};

export function stepReplay(direction) {
    if (currentReplayPath.length === 0) return;

    // Direction: 1 (Next) or -1 (Prev)
    if (direction === 1) {
        if (replayIndex < currentReplayPath.length - 1) {
            replayIndex++;
            renderReplayStep(1);
        }
    } else if (direction === -1) {
        if (replayIndex > 0) {
            // Remove lines of the current step (going back)
            clearStepLines(replayIndex);
            replayIndex--;
            renderReplayStep(-1);
        }
    }
}

export function toggleStartLock() {
    if (!startNodeId) {
        setStatus("Bitte erst einen Startpunkt wählen.", CONFIG.colors.statusError);
        return;
    }
    isStartLocked = !isStartLocked;
    updateLockStatus(isStartLocked);
    setStatus(isStartLocked ? "Startpunkt fixiert. Klicks setzen nun das Ziel." : "Startpunkt gelöst.", CONFIG.colors.statusOk);
}

export function clearRoute() {
    startNodeId = null;
    endNodeId = null;
    isDestinationLocked = false;
    isStartLocked = false;
    updateLockStatus(false);
    updateRouteInfo(null, null);

    // Clear Visuals
    groupsRef.path.clear();
    stopReplay();

    setStatus("Route & Markierungen gelöscht.", CONFIG.colors.statusOk);
}

function stopReplay() {
    currentReplayPath = [];
    currentDists = {};
    replayIndex = -1;
    // Clear ALL replay lines
    Object.values(replayStepLines).forEach(lines => {
        lines.forEach(l => groupsRef.path.remove(l));
    });
    replayStepLines = {};
    import('./ui.js').then(module => module.showReplayControls(false));
}

function startReplay(path, dists) {
    currentReplayPath = path;
    currentDists = dists;
    replayIndex = 0; // Start at first step
    replayStepLines = {};

    // Show UI
    import('./ui.js').then(module => {
        module.showReplayControls(true);
        // Do not draw full route yet!
        renderReplayStep(1);
    });
}

function clearStepLines(index) {
    if (replayStepLines[index]) {
        replayStepLines[index].forEach(l => groupsRef.path.remove(l));
        delete replayStepLines[index];
    }
}

function renderReplayStep(direction) {
    // Import UI updater dynamically
    import('./ui.js').then(module => {

        const totalSteps = currentReplayPath.length; // Number of nodes involved? Or steps? Path length.
        const currentNodeId = currentReplayPath[replayIndex];
        if (!currentNodeId) return;

        const isLastStep = replayIndex === currentReplayPath.length - 1;

        // Update Status Text in Button Bar
        // Format: "1/10"
        module.updateReplayStatus(isLastStep ? "Ziel!" : `${replayIndex + 1}/${totalSteps}`);

        if (isLastStep) {
            setStatus("Ziel erreicht! Gesamtroute wird angezeigt.", CONFIG.colors.statusOk);
            // Draw the FULL pink route line now
            drawRoute(currentReplayPath, true);
            return;
        }

        // If we moved BACK (-1), we just updated the index and cleared the future lines.
        // We might want to re-display status for the 'new' current node.
        // But if we moved FORWARD (1), we need to generate lines.

        if (direction === 1) {
            if (replayStepLines[replayIndex]) {
                // Already rendered this step? (Shouldn't happen with simple index logic usually, but safety)
                return;
            }

            const currentNode = graph.nodes[currentNodeId];
            const nextNodeId = currentReplayPath[replayIndex + 1];

            // Color Cycling: Rainbow
            // Hue = (Step Index / Total Steps) * 0.8 (to avoid wrapping back to red if we stop before 1.0)
            // Or just cycle 0..1
            const hue = (replayIndex / totalSteps);
            const stepColor = new THREE.Color().setHSL(hue, 1.0, 0.5);

            const neighbors = currentNode.neighbors;
            const linesForThisStep = [];

            neighbors.forEach(nb => {
                const neighborNode = graph.nodes[nb.id];
                const isNext = nb.id === nextNodeId; // The "chosen" path

                // Visualization Size: Thicker lines? 
                // Three.js LineBasicMaterial linewidth doesn't work on Windows/WebGL usually (always 1).
                // To get thicker lines we would need TubeGeometry or specific Line library.
                // For now, let's stick to standard lines but maybe make them brighter?
                // User asked for "larger". We can use TubeGeometry for these too if needed?
                // Let's try TubeGeometry for better visibility as requested.

                const cy = getY(currentNode.level, explosionOffset);
                const ny = getY(neighborNode.level, explosionOffset);
                const startPos = new THREE.Vector3(currentNode.x, cy + 0.5, currentNode.z);
                const endPos = new THREE.Vector3(neighborNode.x, ny + 0.5, neighborNode.z);

                const curve = new THREE.LineCurve3(startPos, endPos);
                // Thicker lines using Tube
                // Radius 0.3 for visibility
                const tubeGeo = new THREE.TubeGeometry(curve, 1, 0.3, 4, false);

                // If it is the "correct" next step, maybe handle differently?
                // User said: "Show all generally stored paths... one color each step"
                // So all neighbors get the stepColor.

                const mat = new THREE.MeshBasicMaterial({ color: stepColor });
                const mesh = new THREE.Mesh(tubeGeo, mat);
                mesh.userData = { isReplay: true };

                groupsRef.path.add(mesh);
                linesForThisStep.push(mesh);
            });

            replayStepLines[replayIndex] = linesForThisStep;
        }

        // Update UI Status Text for Details
        const currentDist = currentDists[currentNodeId];
        let statusText = `[Schritt ${replayIndex + 1}/${totalSteps}] Distanz: ${Math.round(currentDist)}m.`;
        setStatus(statusText, CONFIG.colors.statusWait);
    });
}

export function initInteraction(scn, cam, ren, ctrl, grp) {
    scene = scn;
    camera = cam;
    renderer = ren;
    controls = ctrl;
    groupsRef = grp;

    raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 2;
    mouse = new THREE.Vector2();

    window.addEventListener('resize', onResize);
    window.addEventListener('click', onClick);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
}

// WASD State
const keys = { w: false, a: false, s: false, d: false };
const moveSpeed = 2.0; // Adjustable speed

function onKeyDown(e) {
    switch (e.key.toLowerCase()) {
        case 'w': keys.w = true; break;
        case 'a': keys.a = true; break;
        case 's': keys.s = true; break;
        case 'd': keys.d = true; break;
    }
}

function onKeyUp(e) {
    switch (e.key.toLowerCase()) {
        case 'w': keys.w = false; break;
        case 'a': keys.a = false; break;
        case 's': keys.s = false; break;
        case 'd': keys.d = false; break;
    }
}

export function updateMovement() {
    if (!camera || !controls) return;

    if (keys.w || keys.a || keys.s || keys.d) {
        // Get camera forward vector projected on XZ plane
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        const move = new THREE.Vector3();

        if (keys.w) move.add(forward);
        if (keys.s) move.sub(forward);
        if (keys.d) move.add(right);
        if (keys.a) move.sub(right);

        move.normalize().multiplyScalar(moveSpeed);

        camera.position.add(move);
        controls.target.add(move);
    }
}

export function setExplosionOffset(val) {
    explosionOffset = val;
    onSliderChange();
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onClick(event) {
    if (event.target.closest('.panel') || event.target.closest('button')) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Priorities: Nodes > Entrances > Info
    const nodesHit = raycaster.intersectObjects(groupsRef.nodes.children);
    if (nodesHit.length > 0) {
        const pointIndex = nodesHit[0].index;
        let count = 0;
        let targetNode = null;
        for (let n of nodeObjects) {
            if (!n.isEntrance) {
                if (count === pointIndex) { targetNode = n; break; }
                count++;
            }
        }
        if (targetNode) handleNodeClick(targetNode);
        return;
    }

    const entHit = raycaster.intersectObjects(groupsRef.entrances.children);
    if (entHit.length > 0) {
        const mesh = entHit[0].object;
        const n = nodeObjects.find(no => no.osmId === mesh.userData.osmId && no.level === mesh.userData.level);
        if (n) handleNodeClick(n);
        return;
    }

    // Info clicks
    const stairHit = raycaster.intersectObjects(groupsRef.stairs.children);
    if (stairHit.length > 0) { showInfo(stairHit[0].object.userData.osmId, "Treppe / Rolltreppe"); return; }

    const railHit = raycaster.intersectObjects(groupsRef.railways.children);
    if (railHit.length > 0) { showInfo(railHit[0].object.userData.osmId, "Gleis"); return; }

    const platHit = raycaster.intersectObjects(groupsRef.platforms.children);
    if (platHit.length > 0) { showInfo(platHit[0].object.userData.osmId, "Bahnsteig"); return; }

    const roomsHit = raycaster.intersectObjects(groupsRef.rooms.children);
    if (roomsHit.length > 0) {
        const hit = roomsHit.find(h => h.object.type === 'Mesh');
        if (hit) showInfo(hit.object.userData.osmId, "Raum / Gebäude");
    }
}

function handleNodeClick(node) {
    const typeLabel = node.isEntrance ? "Eingang / Tür" : "Routing Node";
    showInfo(node.osmId, `${typeLabel} (Level ${node.level})`);

    // PRIORITY 1: START LOCKED -> Always set End Node
    if (isStartLocked) {
        setEndNode(node);
        triggerRouteCalculation();
        setStatus("Ziel gewählt (Start fixiert).", CONFIG.colors.statusOk);
        return;
    }

    // PRIORITY 2: DESTINATION LOCKED (Trace Finding) -> Always set Start Node
    if (isDestinationLocked) {
        setStartNode(node);
        triggerRouteCalculation();
        setStatus("Startpunkt geändert. Ziel ist fixiert.", CONFIG.colors.statusOk);
        return;
    }

    // STANDARD LOGIC (Toggle)
    // SCENARIO 1: Reset if both set
    if (startNodeId && endNodeId) {
        // Instead of full reset, let's start fresh with this new node as Start
        resetRoute(); // Clear internal state
        setStartNode(node);
        setStatus("Neue Route gestartet.", CONFIG.colors.statusWait);
        return;
    }

    // SCENARIO 2: End is set (via search), user clicks Map -> Set Start & Calc
    if (endNodeId && !startNodeId) {
        setStartNode(node);
        triggerRouteCalculation();
        return;
    }

    // SCENARIO 3: Nothing set -> Set Start
    if (!startNodeId) {
        setStartNode(node);
        setStatus("Start gewählt. Suche Ziel oder klicke für Ziel.", CONFIG.colors.statusWait);
        return;
    }

    // SCENARIO 4: Start set, No End -> Set End & Calc
    if (startNodeId && !endNodeId) {
        // Check if user clicked the SAME node again? Maybe unselect?
        if (startNodeId === node.id) {
            // Optional: Unselect start?
            // startNodeId = null; ...
            return;
        }
        setEndNode(node);
        triggerRouteCalculation();
        setStatus("Route berechnet.", CONFIG.colors.statusOk);
        return;
    }
}

function setStartNode(node) {
    startNodeId = node.id;
    updateRouteInfo({ osmId: node.osmId }, endNodeId ? { osmId: graph.nodes[endNodeId].osmId } : null);
    highlight(node, CONFIG.colors.startNode, 'start');
}

function setEndNode(node) {
    endNodeId = node.id;
    updateRouteInfo(startNodeId ? { osmId: graph.nodes[startNodeId].osmId } : null, { osmId: node.osmId });
    highlight(node, CONFIG.colors.endNode, 'end');
}

export function forceSetEndNode(node) {
    setEndNode(node);
}

function resetRoute() {
    startNodeId = null;
    endNodeId = null;
    isDestinationLocked = false; // Reset lock too
    updateRouteInfo(null, null);
    groupsRef.path.clear();
    stopReplay();
}

export function getStartNodeId() { return startNodeId; }

function triggerRouteCalculation() {
    if (!startNodeId || !endNodeId) return;
    const result = calculateRoute(startNodeId, endNodeId);
    if (result && result.path) {
        drawRoute(result.path, false); // Do not show pink line yet
        // Start Replay Mode
        startReplay(result.path, result.dists);
    } else {
        setStatus("Kein Weg gefunden.", CONFIG.colors.statusError);
    }
}







// Find Track Logic
export function findTrackAndSetTarget(val) {
    if (!val) return;
    const found = Object.values(platformRegistry).find(p => {
        if (p.trackRef && p.trackRef.toLowerCase() === val) return true;
        if (p.localRef && p.localRef.toLowerCase() === val) return true;
        if (p.name && p.name.toLowerCase().includes(val)) return true;
        if (p.ref) {
            const refs = p.ref.split(/[;,]/).map(r => r.trim().toLowerCase());
            if (refs.includes(val)) return true;
        }
        return false;
    });

    if (found) {
        // Find nearest graph node
        let minDist = Infinity;
        let nearestNode = null;

        for (let key in graph.nodes) {
            const n = graph.nodes[key];
            if (Math.abs(n.level - found.level) < 0.5) {
                const dist = Math.sqrt((n.x - found.center.x) ** 2 + (n.z - found.center.z) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    nearestNode = n;
                }
            }
        }

        if (nearestNode) {
            const y = getY(nearestNode.level, explosionOffset);
            controls.target.set(nearestNode.x, y, nearestNode.z);
            camera.position.set(nearestNode.x + 20, y + 40, nearestNode.z + 20);

            // Set Target AND LOCK
            setEndNode(nearestNode);
            isDestinationLocked = true; // LOCK!

            const displayRef = found.trackRef || found.ref || found.name;
            if (startNodeId) {
                triggerRouteCalculation();
                setStatus(`Ziel fixiert: ${displayRef}. Route berechnet.`, CONFIG.colors.statusOk);
            } else {
                setStatus(`Ziel fixiert: ${displayRef}. Wähle Startpunkt.`, CONFIG.colors.statusWait);
            }
        } else {
            setStatus(`Ziel gefunden (Level ${found.level}), aber kein Wegpunkt in Nähe.`, CONFIG.colors.statusWait);
        }
    } else {
        setStatus(`Nr. '${val}' nicht gefunden.`, CONFIG.colors.statusError);
    }
}


// Visualization Helpers
function highlight(node, color, type) {
    // Remove existing marker of this type
    const toRemove = [];
    groupsRef.path.children.forEach(obj => {
        if (obj.userData.isMarker && obj.userData.markerType === type) {
            toRemove.push(obj);
        }
    });
    toRemove.forEach(o => groupsRef.path.remove(o));

    const geo = new THREE.SphereGeometry(1.2, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { level: node.level, isMarker: true, markerType: type };

    // Adjust Y based on current explosion offset
    mesh.position.set(node.x, getY(node.level, explosionOffset), node.z);
    groupsRef.path.add(mesh);
}



function drawRoute(pathIds, showFullRoute = false) {
    // Keep markers
    const markers = groupsRef.path.children.filter(c => c.userData.isMarker);
    const replayMeshes = groupsRef.path.children.filter(c => c.userData.isReplay);

    groupsRef.path.clear();
    markers.forEach(m => groupsRef.path.add(m));
    replayMeshes.forEach(m => groupsRef.path.add(m)); // Keep replay lines!

    if (showFullRoute) {
        const points = pathIds.map(id => { const n = graph.nodes[id]; return { x: n.x, z: n.z, level: n.level }; });
        const vectorPoints = points.map(p => new THREE.Vector3(p.x, getY(p.level, explosionOffset), p.z));
        const curve = new THREE.CatmullRomCurve3(vectorPoints);
        const geometry = new THREE.TubeGeometry(curve, points.length * 4, 0.6, 8, false); // Slightly thicker 0.6
        const material = new THREE.MeshBasicMaterial({ color: CONFIG.colors.route }); // Pink
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { isRoute: true, pathData: points };
        groupsRef.path.add(mesh);
    }
}

export function onSliderChange() {
    const updateY = (obj) => {
        if (obj.userData.level !== undefined) {
            let base = getY(obj.userData.level, explosionOffset);
            if (obj.userData.yOffset) base += obj.userData.yOffset;
            obj.position.y = base;
        }
    };

    groupsRef.rooms.children.forEach(updateY);
    groupsRef.railways.children.forEach(updateY);
    groupsRef.platforms.children.forEach(updateY);

    groupsRef.entrances.children.forEach(obj => {
        if (obj.userData.level !== undefined) {
            const n = nodeObjects.find(no => no.osmId === obj.userData.osmId && no.level === obj.userData.level);
            if (n) obj.position.set(n.x, getY(obj.userData.level, explosionOffset) + 2, n.z);
        }
    });

    // Update Stairs
    groupsRef.stairs.children.forEach(mesh => {
        if (mesh.userData.isStair) {
            updateStairVisuals(mesh, explosionOffset);
        }
    });

    // Update Graph Lines
    groupsRef.graph.children.forEach(line => {
        const ud = line.userData;
        const pos = line.geometry.attributes.position;
        pos.setY(0, getY(ud.level1, explosionOffset));
        pos.setY(1, getY(ud.level2, explosionOffset));
        pos.needsUpdate = true;
    });

    // Update Node Points
    if (groupsRef.nodes.children.length > 0) {
        const points = groupsRef.nodes.children[0];
        const posAttr = points.geometry.attributes.position;
        let pointIndex = 0;
        for (let i = 0; i < nodeObjects.length; i++) {
            if (!nodeObjects[i].isEntrance) {
                posAttr.setY(pointIndex, getY(nodeObjects[i].level, explosionOffset));
                pointIndex++;
            }
        }
        posAttr.needsUpdate = true;
    }

    updatePathVisuals();
}

function updatePathVisuals() {
    groupsRef.path.children.forEach(obj => {
        if (obj.userData.isMarker) { obj.position.y = getY(obj.userData.level, explosionOffset); }
        if (obj.userData.isRoute) {
            const points = obj.userData.pathData.map(p => new THREE.Vector3(p.x, getY(p.level, explosionOffset), p.z));
            const curve = new THREE.CatmullRomCurve3(points);
            const newGeo = new THREE.TubeGeometry(curve, points.length * 4, 0.5, 8, false);
            obj.geometry.dispose();
            obj.geometry = newGeo;
        }
    });
}
