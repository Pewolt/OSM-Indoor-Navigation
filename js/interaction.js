import * as THREE from 'three';
import { CONFIG } from './config.js';
import { getY, updateStairVisuals } from './geometry.js';
import { nodeObjects, platformRegistry } from './data.js';
import { graph, calculateRoute } from './graph.js';
import { setStatus, showInfo, updateRouteInfo, updateLockStatus } from './ui.js';

console.log("[DEBUG] interaction.js loaded");

let scene, camera, renderer, controls, raycaster, mouse;
let groupsRef;

let startNodeId = null;
let endNodeId = null;
let explosionOffset = 0;
let isDestinationLocked = false; 
let isStartLocked = false;       

// --- Replay & FPV State ---
let replayIndex = -1;
let currentReplayPath = [];
let currentDists = {};
let replayStepLines = {};

export let isFPVMode = false;
export let isAutoPlaying = false;
let fpvCurve = null;
let fpvProgress = 0.0;
let fpvTotalLength = 0;
let nodeUValues = []; 
let preFpvState = { position: new THREE.Vector3(), target: new THREE.Vector3(), explosion: 0 };

// HILFSFUNKTION: Filtert Punkte heraus, die zu nah aneinander liegen (Verhindert Abstürze bei Kurvenberechnung)
function getUniquePoints(pointsArray) {
    if (!pointsArray || pointsArray.length === 0) return [];
    const unique = [pointsArray[0]];
    for (let i = 1; i < pointsArray.length; i++) {
        if (pointsArray[i].distanceTo(unique[unique.length - 1]) > 0.05) { // 5cm Toleranz
            unique.push(pointsArray[i]);
        }
    }
    return unique;
}

export function togglePlayPause() {
    if (!currentReplayPath || currentReplayPath.length < 2) return;

    if (!isFPVMode) {
        enterFPVMode();
    }

    isAutoPlaying = !isAutoPlaying;
    import('./ui.js').then(ui => ui.updatePlayPauseIcon(isAutoPlaying));
    
    if(isAutoPlaying) {
        setStatus("Automatische FPV-Route gestartet.", CONFIG.colors.statusOk);
    } else {
        setStatus("FPV-Route pausiert.", CONFIG.colors.statusWait);
    }
}

export function enterFPVMode() {
    if (isFPVMode) return;
    isFPVMode = true;

    drawRoute(currentReplayPath, true);

    preFpvState.position.copy(camera.position);
    preFpvState.target.copy(controls.target);
    preFpvState.explosion = explosionOffset;

    setExplosionOffset(0);

    import('./ui.js').then(ui => {
        if (ui.ELEMENTS.slider) {
            ui.ELEMENTS.slider.disabled = true;
            ui.ELEMENTS.slider.value = 0;
        }
        ui.toggleFPVUI(true);
    });

    const points = currentReplayPath.map(id => {
        const n = graph.nodes[id];
        return new THREE.Vector3(n.x, n.level * CONFIG.floorHeight, n.z);
    });
    
    // Vermeide 0-Längen Vektoren, die das Skript zum Absturz bringen
    const uniquePoints = getUniquePoints(points);
    
    fpvCurve = new THREE.CurvePath();
    if (uniquePoints.length > 1) {
        for (let i = 0; i < uniquePoints.length - 1; i++) {
            fpvCurve.add(new THREE.LineCurve3(uniquePoints[i], uniquePoints[i + 1]));
        }
    }
    
    fpvTotalLength = fpvCurve.getLength(); 

    nodeUValues = [0];
    let accDist = 0;
    for (let i = 0; i < uniquePoints.length - 1; i++) {
        accDist += uniquePoints[i].distanceTo(uniquePoints[i + 1]);
        nodeUValues.push(accDist / fpvTotalLength);
    }

    controls.enabled = false; 

    if (replayIndex >= 0 && replayIndex < nodeUValues.length) {
        fpvProgress = nodeUValues[replayIndex];
    } else {
        fpvProgress = 0.0;
        replayIndex = 0;
    }
}

export function exitFPVMode() {
    if (!isFPVMode) return;
    isFPVMode = false;
    isAutoPlaying = false;
    controls.enabled = true; 

    setExplosionOffset(preFpvState.explosion);
    camera.position.copy(preFpvState.position);
    controls.target.copy(preFpvState.target);

    import('./ui.js').then(ui => {
        if (ui.ELEMENTS.slider) {
            ui.ELEMENTS.slider.disabled = false;
            ui.ELEMENTS.slider.value = preFpvState.explosion;
        }
        ui.updatePlayPauseIcon(false);
        ui.toggleFPVUI(false);
    });
    
    setStatus("FPV-Modus beendet.", CONFIG.colors.statusOk);
}

export function updateFPVCamera(deltaTime) {
    if (!isFPVMode || !fpvCurve || fpvTotalLength === 0) return;

    if (isAutoPlaying) {
        const speedMetersPerSec = 4.5; 
        fpvProgress += (speedMetersPerSec / fpvTotalLength) * deltaTime;
        
        if (fpvProgress >= 1.0) {
            fpvProgress = 1.0;
            isAutoPlaying = false;
            import('./ui.js').then(ui => ui.updatePlayPauseIcon(false));
            setStatus("Ziel erreicht!", CONFIG.colors.statusOk);
        }
    }

    const currentPos = fpvCurve.getPointAt(fpvProgress);
    camera.position.set(currentPos.x, currentPos.y + 1.6, currentPos.z);

    let lookProgress = Math.min(1.0, fpvProgress + 0.001);
    const tangent = fpvCurve.getTangentAt(lookProgress).normalize();
    
    const lookAtPos = new THREE.Vector3().copy(camera.position).add(tangent);
    camera.lookAt(lookAtPos);

    let newIndex = 0;
    for (let i = 0; i < nodeUValues.length; i++) {
        if (fpvProgress >= nodeUValues[i] - 0.01) newIndex = i;
    }

    if (newIndex !== replayIndex) {
        replayIndex = newIndex;
        import('./ui.js').then(ui => {
            ui.updateReplayStatus(`${replayIndex + 1}/${currentReplayPath.length}`);
        });
    }
}

export function stepReplay(direction) {
    if (currentReplayPath.length === 0) return;

    if (isFPVMode) {
        let targetIndex = replayIndex + direction;
        if (targetIndex >= 0 && targetIndex < nodeUValues.length) {
            fpvProgress = nodeUValues[targetIndex];
        }
        return;
    }

    if (direction === 1) {
        if (replayIndex < currentReplayPath.length - 1) {
            replayIndex++;
            renderReplayStep(1);
        }
    } else if (direction === -1) {
        if (replayIndex > 0) {
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
    if (isFPVMode) exitFPVMode(); 
    
    startNodeId = null;
    endNodeId = null;
    isDestinationLocked = false;
    isStartLocked = false;
    updateLockStatus(false);
    updateRouteInfo(null, null);

    groupsRef.path.clear();
    stopReplay();

    setStatus("Route & Markierungen gelöscht.", CONFIG.colors.statusOk);
}

function stopReplay() {
    if (isFPVMode) exitFPVMode();
    currentReplayPath = [];
    currentDists = {};
    replayIndex = -1;
    Object.values(replayStepLines).forEach(lines => {
        lines.forEach(l => groupsRef.path.remove(l));
    });
    replayStepLines = {};
    import('./ui.js').then(module => module.showReplayControls(false));
}

function startReplay(path, dists) {
    currentReplayPath = path;
    currentDists = dists;
    replayIndex = 0; 
    replayStepLines = {};

    import('./ui.js').then(module => {
        module.showReplayControls(true);
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
    import('./ui.js').then(module => {
        const totalSteps = currentReplayPath.length; 
        const currentNodeId = currentReplayPath[replayIndex];
        if (!currentNodeId) return;

        const isLastStep = replayIndex === currentReplayPath.length - 1;
        module.updateReplayStatus(isLastStep ? "Ziel!" : `${replayIndex + 1}/${totalSteps}`);

        if (isLastStep) {
            setStatus("Ziel erreicht! Gesamtroute wird angezeigt.", CONFIG.colors.statusOk);
            drawRoute(currentReplayPath, true);
            return;
        }

        if (direction === 1) {
            if (replayStepLines[replayIndex]) return;

            const currentNode = graph.nodes[currentNodeId];
            const nextNodeId = currentReplayPath[replayIndex + 1];

            const hue = (replayIndex / totalSteps);
            const stepColor = new THREE.Color().setHSL(hue, 1.0, 0.5);

            const neighbors = currentNode.neighbors;
            const linesForThisStep = [];

            neighbors.forEach(nb => {
                const neighborNode = graph.nodes[nb.id];
                const cy = getY(currentNode.level, explosionOffset);
                const ny = getY(neighborNode.level, explosionOffset);
                const startPos = new THREE.Vector3(currentNode.x, cy + 0.5, currentNode.z);
                const endPos = new THREE.Vector3(neighborNode.x, ny + 0.5, neighborNode.z);

                const curve = new THREE.LineCurve3(startPos, endPos);
                const tubeGeo = new THREE.TubeGeometry(curve, 1, 0.3, 4, false);

                const mat = new THREE.MeshBasicMaterial({ color: stepColor });
                const mesh = new THREE.Mesh(tubeGeo, mat);
                mesh.userData = { isReplay: true };

                groupsRef.path.add(mesh);
                linesForThisStep.push(mesh);
            });

            replayStepLines[replayIndex] = linesForThisStep;
        }

        const currentDist = currentDists[currentNodeId];
        let statusText = `[Schritt ${replayIndex + 1}/${totalSteps}] Distanz: ${Math.round(currentDist)}m.`;
        setStatus(statusText, CONFIG.colors.statusWait);
    });
}

function togglePanMode() {
    if (!controls) return;
    const btn = document.getElementById('btn-cam-pan-toggle');

    if (controls.mouseButtons.LEFT === THREE.MOUSE.ROTATE) {
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        if (btn) btn.classList.add('active');
        setStatus("Modus: Verschieben (Pan)", CONFIG.colors.statusOk);
    } else {
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        if (btn) btn.classList.remove('active');
        setStatus("Modus: Drehen (Rotate)", CONFIG.colors.statusOk);
    }
    controls.update();
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

    const setupBtn = (id, key) => {
        const btn = document.getElementById(id);
        if (btn) {
            const start = (e) => {
                e.preventDefault();
                e.stopPropagation();
                buttonStates[key] = true;
            };
            const end = (e) => {
                e.preventDefault();
                e.stopPropagation();
                buttonStates[key] = false;
            };

            btn.addEventListener('pointerdown', start);
            btn.addEventListener('pointerup', end);
            btn.addEventListener('pointerleave', end);
            btn.addEventListener('contextmenu', (e) => e.preventDefault()); 
        }
    };

    setupBtn('btn-cam-forward', 'w');
    setupBtn('btn-cam-back', 's');
    setupBtn('btn-cam-left', 'a');
    setupBtn('btn-cam-right', 'd');
    setupBtn('btn-cam-zoom-in', 'zin');
    setupBtn('btn-cam-zoom-out', 'zout');

    const btnPan = document.getElementById('btn-cam-pan-toggle');
    if (btnPan) btnPan.addEventListener('click', togglePanMode);
}

const keys = { w: false, a: false, s: false, d: false };
const buttonStates = { w: false, a: false, s: false, d: false, zin: false, zout: false };
const moveSpeed = 2.0; 
const zoomSpeed = 1.0;

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
    if (!camera || !controls || isFPVMode) return; 

    if (keys.w || keys.a || keys.s || keys.d || buttonStates.w || buttonStates.a || buttonStates.s || buttonStates.d || buttonStates.zin || buttonStates.zout) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        const move = new THREE.Vector3();

        if (keys.w || buttonStates.w) move.add(forward);
        if (keys.s || buttonStates.s) move.sub(forward);
        if (keys.d || buttonStates.d) move.add(right);
        if (keys.a || buttonStates.a) move.sub(right);

        move.normalize().multiplyScalar(moveSpeed);

        camera.position.add(move);
        controls.target.add(move);

        if (buttonStates.zin || buttonStates.zout) {
            const zoomDir = new THREE.Vector3();
            camera.getWorldDirection(zoomDir);

            const dist = camera.position.distanceTo(controls.target);

            if (buttonStates.zin) {
                if (dist > 5) camera.position.addScaledVector(zoomDir, zoomSpeed);
            }
            if (buttonStates.zout) {
                camera.position.addScaledVector(zoomDir, -zoomSpeed);
            }
        }
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

    if (isStartLocked) {
        setEndNode(node);
        triggerRouteCalculation();
        setStatus("Ziel gewählt (Start fixiert).", CONFIG.colors.statusOk);
        return;
    }

    if (isDestinationLocked) {
        setStartNode(node);
        triggerRouteCalculation();
        setStatus("Startpunkt geändert. Ziel ist fixiert.", CONFIG.colors.statusOk);
        return;
    }

    if (startNodeId && endNodeId) {
        resetRoute(); 
        setStartNode(node);
        setStatus("Neue Route gestartet.", CONFIG.colors.statusWait);
        return;
    }

    if (endNodeId && !startNodeId) {
        setStartNode(node);
        triggerRouteCalculation();
        return;
    }

    if (!startNodeId) {
        setStartNode(node);
        setStatus("Start gewählt. Suche Ziel oder klicke für Ziel.", CONFIG.colors.statusWait);
        return;
    }

    if (startNodeId && !endNodeId) {
        if (startNodeId === node.id) return;
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
    isDestinationLocked = false; 
    updateRouteInfo(null, null);
    groupsRef.path.clear();
    stopReplay();
}

export function getStartNodeId() { return startNodeId; }

function triggerRouteCalculation() {
    if (!startNodeId || !endNodeId) return;
    const result = calculateRoute(startNodeId, endNodeId);
    if (result && result.path) {
        drawRoute(result.path, false); 
        startReplay(result.path, result.dists);
    } else {
        setStatus("Kein Weg gefunden.", CONFIG.colors.statusError);
    }
}

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

            setEndNode(nearestNode);
            isDestinationLocked = true; 

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

function highlight(node, color, type) {
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

    mesh.position.set(node.x, getY(node.level, explosionOffset), node.z);
    groupsRef.path.add(mesh);
}

function drawRoute(pathIds, showFullRoute = false) {
    const markers = groupsRef.path.children.filter(c => c.userData.isMarker);
    const replayMeshes = groupsRef.path.children.filter(c => c.userData.isReplay);

    groupsRef.path.clear();
    markers.forEach(m => groupsRef.path.add(m));
    replayMeshes.forEach(m => groupsRef.path.add(m)); 

    if (showFullRoute) {
        const points = pathIds.map(id => { const n = graph.nodes[id]; return { x: n.x, z: n.z, level: n.level }; });
        const vectorPoints = points.map(p => new THREE.Vector3(p.x, getY(p.level, explosionOffset), p.z));
        
        // Filter duplizierte Punkte (z.B. gleiche Koordinaten)
        const uniquePts = getUniquePoints(vectorPoints);
        
        if (uniquePts.length > 1) {
            const curve = new THREE.CatmullRomCurve3(uniquePts);
            const geometry = new THREE.TubeGeometry(curve, uniquePts.length * 4, 0.6, 8, false); 
            const material = new THREE.MeshBasicMaterial({ color: CONFIG.colors.route }); 
            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData = { isRoute: true, pathData: uniquePts }; // Nutze uniquePts
            groupsRef.path.add(mesh);
        }
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

    groupsRef.stairs.children.forEach(mesh => {
        if (mesh.userData.isStair) {
            updateStairVisuals(mesh, explosionOffset);
        }
    });

    // ARCHITEKTUR-FIX: Stelle sicher, dass Graph-Linien von SSAO ignoriert werden
    groupsRef.graph.children.forEach(line => {
        if(line.material) line.material.depthWrite = false; 
        
        const ud = line.userData;
        const pos = line.geometry.attributes.position;
        pos.setY(0, getY(ud.level1, explosionOffset));
        pos.setY(1, getY(ud.level2, explosionOffset));
        pos.needsUpdate = true;
    });

    // ARCHITEKTUR-FIX: Stelle sicher, dass Knotenpunkte von SSAO ignoriert werden
    if (groupsRef.nodes.children.length > 0) {
        if(groupsRef.nodes.children[0].material) {
            groupsRef.nodes.children[0].material.depthWrite = false;
        }
        
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
            // Generiere Punkte mit aktuellem Offset
            const points = obj.userData.pathData.map(p => new THREE.Vector3(p.x, getY(p.level || 0, explosionOffset), p.z));
            const uniquePts = getUniquePoints(points);
            
            if (uniquePts.length > 1) {
                const curve = new THREE.CatmullRomCurve3(uniquePts);
                const newGeo = new THREE.TubeGeometry(curve, uniquePts.length * 4, 0.5, 8, false);
                obj.geometry.dispose();
                obj.geometry = newGeo;
            }
        }
    });
}