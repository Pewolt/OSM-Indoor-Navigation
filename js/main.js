
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from './config.js';
import { loadData, onSearchInput } from './api.js';
import { processData, clearData, nodeObjects } from './data.js';
import { getY } from './geometry.js';
import { getGraphNodesData, clearGraph } from './graph.js';
import { initInteraction, setExplosionOffset, findTrackAndSetTarget, onSliderChange, updateMovement, stepReplay, toggleStartLock, clearRoute } from './interaction.js';
import { ELEMENTS, setStatus } from './ui.js';

// --- GLOBALS ---
let scene, camera, renderer, controls;

// Groups
const groups = {
    buildings: new THREE.Group(),
    rooms: new THREE.Group(),
    graph: new THREE.Group(),
    railways: new THREE.Group(),
    platforms: new THREE.Group(),
    stairs: new THREE.Group(),
    nodes: new THREE.Group(),
    entrances: new THREE.Group(),
    path: new THREE.Group()
};

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.background);
    scene.fog = new THREE.FogExp2(CONFIG.colors.fog, 0.002);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(100, 150, 100);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const ambient = new THREE.AmbientLight(CONFIG.colors.ambientLight, 0.5);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(CONFIG.colors.sunLight, 1);
    sun.position.set(100, 200, 50);
    scene.add(sun);

    // Add Groups to Scene
    Object.values(groups).forEach(g => scene.add(g));

    // Grid
    const grid = new THREE.GridHelper(500, 50, CONFIG.colors.grid1, CONFIG.colors.grid2);
    grid.position.y = -0.1;
    scene.add(grid);

    // Initialize Interaction
    initInteraction(scene, camera, renderer, controls, groups);

    // Event Listeners
    ELEMENTS.btnLoad.addEventListener('click', onBtnLoadClick);
    ELEMENTS.slider.addEventListener('input', (e) => setExplosionOffset(parseFloat(e.target.value)));
    ELEMENTS.btnCloseInfo.addEventListener('click', () => ELEMENTS.infoPanel.style.display = 'none');
    ELEMENTS.search.addEventListener('input', (e) => onSearchInput(e, ELEMENTS));
    ELEMENTS.btnFindTrack.addEventListener('click', () => findTrackAndSetTarget(ELEMENTS.inTrack.value.trim().toLowerCase()));

    // Replay Listeners
    ELEMENTS.btnReplayNext.addEventListener('click', () => stepReplay(1));
    ELEMENTS.btnReplayPrev.addEventListener('click', () => stepReplay(-1));

    // Tools Listeners
    if (ELEMENTS.btnLockStart) ELEMENTS.btnLockStart.addEventListener('click', toggleStartLock);
    if (ELEMENTS.btnClearRoute) ELEMENTS.btnClearRoute.addEventListener('click', clearRoute);


    // Search close on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            ELEMENTS.results.style.display = 'none';
        }
    });

    animate();
}

function onBtnLoadClick() {
    ELEMENTS.btnLoad.disabled = true;
    ELEMENTS.btnFindTrack.disabled = true;

    const lat = parseFloat(ELEMENTS.lat.value);
    const lon = parseFloat(ELEMENTS.lon.value);
    const rad = parseFloat(ELEMENTS.rad.value);

    loadData(lat, lon, rad,
        (data) => {
            setStatus("Verarbeite Geometrie...", CONFIG.colors.statusWait);
            setTimeout(() => {
                handleDataLoaded(data, lat, lon);
                setStatus("Bereit. Wähle Start oder Suche Ziel.", CONFIG.colors.statusOk);
                ELEMENTS.btnFindTrack.disabled = false;
                ELEMENTS.btnLoad.disabled = false;
            }, 50);
        },
        (errorMsg) => {
            setStatus(errorMsg, CONFIG.colors.statusError);
            ELEMENTS.btnLoad.disabled = false;
        },
        (statusMsg, color) => setStatus(statusMsg, color)
    );
}

function handleDataLoaded(data, centerLat, centerLon) {
    // Clear old data
    Object.values(groups).forEach(g => {
        while (g.children.length > 0) {
            const obj = g.children[0];
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
            g.remove(obj);
        }
    });

    clearData();
    clearGraph();
    // Reset route logic inside interaction is missing explicit clear call but clearing groups.path handles visuals
    // State reset (startNodeId/endNodeId) should ideally happen here or users manually reset.
    // We can rely on user clicking new points.

    const projectFn = (lat, lon) => {
        const x = (lon - centerLon) * 111320 * Math.cos(centerLat * Math.PI / 180);
        const z = (lat - centerLat) * 111320 * -1;
        return { x, z };
    };

    processData(data, centerLat, centerLon, projectFn, groups, () => {
        renderGraphNodes();
        onSliderChange(); // Initial visual update
    });
}

function renderGraphNodes() {
    const { positions, nodeObjList } = getGraphNodesData();

    // We need to sync with data.js's nodeObjects for interaction
    // The processData function already populates nodeObjects partly (entrances), 
    // but graph nodes are separate. We should ADD graph nodes to nodeObjects.

    // Actually, processData does NOT populate graph nodes into nodeObjects.
    // We do it here.
    nodeObjList.forEach(obj => nodeObjects.push(obj));

    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    // Make nodes smaller and semi-transparent to reduce clutter
    const pointMat = new THREE.PointsMaterial({
        color: CONFIG.colors.graphNode,
        size: 2, // Smaller
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.4 // Less obtrusive
    });
    const points = new THREE.Points(pointGeo, pointMat);
    points.userData = { isNodes: true };
    groups.nodes.add(points);
}

function animate() {
    requestAnimationFrame(animate);

    // Animate Escalators
    if (groups.stairs) {
        const time = Date.now() * 0.001;
        groups.stairs.children.forEach(mesh => {
            if (mesh.userData.isEscalator && mesh.material && mesh.material.map) {
                // Determine direction: Forward along curve
                // Our texture arrows point UP in texture space (V)
                // If isUp (Green), we want them to move "Start->End" (along V)
                // If isDown (Red), we want them to move "Start->End" (along V)
                // Wait, if arrows point UP on texture, scrolling V offsets them.

                // Let's just scroll offset.y
                const speed = 0.5;
                // We want arrows to flow FROM start TO end.
                // If texture mapping is standard tube, V wraps around? U goes along?
                // TubeGeometry: "U coordinates are defined along the tube length" -> NO.
                // Docs: "u stretches around the circumference... v stretches along the length". 
                // So V is along the path.
                // To move Start->End, we DECREASE offset.y (if texture V 0=start, 1=end)
                // Correction: V usually 0 @ start, 1 @ end. 
                // To animate "flow" towards end, we shift texture "backwards" so it looks like it's sliding forward?
                // Visual check needed. Let's try offset.y -= delta.

                mesh.material.map.offset.y -= 0.01;
            }
        });
    }

    updateMovement();
    controls.update();
    renderer.render(scene, camera);
}

init();
