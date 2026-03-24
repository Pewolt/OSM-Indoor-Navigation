import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- NEU: POST-PROCESSING IMPORTS FÜR PAKET 4 ---
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { CONFIG } from './config.js';
import { loadData, onSearchInput } from './api.js';
import { processData, clearData, nodeObjects } from './data.js';
import { getY } from './geometry.js';
import { getGraphNodesData, clearGraph } from './graph.js';
import { initInteraction, setExplosionOffset, findTrackAndSetTarget, onSliderChange, updateMovement, stepReplay, toggleStartLock, clearRoute } from './interaction.js?v=3';

import { ELEMENTS, setStatus, initMobileMenu } from './ui.js';

// --- GLOBALS ---
let scene, camera, renderer, controls, composer;

console.log("[DEBUG] main.js loaded");

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

    // Renderer (Schatten aktiviert)
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Weiche Schatten
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // --- BELEUCHTUNG ---
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const sun = new THREE.DirectionalLight(CONFIG.colors.sunLight, 1.2);
    sun.position.set(200, 400, 100);
    sun.castShadow = true;

    // Schatten-Kamera groß genug machen, um einen Bahnhof abzudecken
    const d = 400;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 1500;
    sun.shadow.bias = -0.0005; // Verhindert "Shadow Acne" (Streifen auf Flächen)
    sun.shadow.mapSize.width = 2048; // Hohe Auflösung
    sun.shadow.mapSize.height = 2048;
    scene.add(sun);

    // Grid (sollte Schatten empfangen)
    const grid = new THREE.GridHelper(500, 50, CONFIG.colors.grid1, CONFIG.colors.grid2);
    grid.position.y = -0.1;
    scene.add(grid);

    // Unsichtbare Bodenplatte, um Schattenwurf auf dem Boden aufzufangen
    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.5 }); // Nur Schatten sichtbar
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.15;
    ground.receiveShadow = true;
    scene.add(ground);

    // Add Groups to Scene
    Object.values(groups).forEach(g => scene.add(g));

    // --- POST-PROCESSING (SSAO) ---
    composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // SSAO Pass für Architektur-Tiefe
    const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ssaoPass.kernelRadius = 12; // Radius der Kontaktschatten
    ssaoPass.minDistance = 0.002;
    ssaoPass.maxDistance = 0.1;
    composer.addPass(ssaoPass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);


    // Initialize Interaction
    initInteraction(scene, camera, renderer, controls, groups);

    // --- EVENT BINDING ---
    if (ELEMENTS.btnLoad) ELEMENTS.btnLoad.addEventListener('click', onBtnLoadClick);
    if (ELEMENTS.slider) ELEMENTS.slider.addEventListener('input', (e) => setExplosionOffset(parseFloat(e.target.value)));
    if (ELEMENTS.btnCloseInfo) ELEMENTS.btnCloseInfo.addEventListener('click', () => ELEMENTS.infoPanel.style.display = 'none');

    if (ELEMENTS.search) {
        ELEMENTS.search.addEventListener('input', (e) => onSearchInput(e, ELEMENTS, () => {
            setStatus("Ort gefunden. Lade Gebäudedaten...", CONFIG.colors.statusWait);
            onBtnLoadClick();
        }));
    }

    if (ELEMENTS.btnGeolocation) {
        ELEMENTS.btnGeolocation.addEventListener('click', () => {
            if ("geolocation" in navigator) {
                setStatus("Suche GPS Standort...", CONFIG.colors.statusWait);
                navigator.geolocation.getCurrentPosition((position) => {
                    ELEMENTS.lat.value = position.coords.latitude;
                    ELEMENTS.lon.value = position.coords.longitude;
                    ELEMENTS.search.value = "Mein Standort";
                    setStatus("Standort gefunden. Lade Daten...", CONFIG.colors.statusWait);
                    onBtnLoadClick();
                }, (error) => {
                    setStatus("GPS Fehler: " + error.message, CONFIG.colors.statusError);
                });
            } else {
                setStatus("Geolokalisierung wird nicht unterstützt.", CONFIG.colors.statusError);
            }
        });
    }

    if (ELEMENTS.btnFindTrack) {
        ELEMENTS.btnFindTrack.addEventListener('click', () => {
            const val = ELEMENTS.inTrack.value;
            if (val) import('./interaction.js').then(m => m.findTrackAndSetTarget(val));
        });
    }

    if (ELEMENTS.btnReplayNext) ELEMENTS.btnReplayNext.addEventListener('click', () => stepReplay(1));
    if (ELEMENTS.btnReplayPrev) ELEMENTS.btnReplayPrev.addEventListener('click', () => stepReplay(-1));
    if (ELEMENTS.btnLockStart) ELEMENTS.btnLockStart.addEventListener('click', toggleStartLock);
    if (ELEMENTS.btnClearRoute) ELEMENTS.btnClearRoute.addEventListener('click', clearRoute);

    if (ELEMENTS.levelSelect) {
        ELEMENTS.levelSelect.addEventListener('change', (e) => updateLevelVisibility(e.target.value));
    }

    document.addEventListener('click', (e) => {
        if (ELEMENTS.results && !e.target.closest('.search-container')) {
            ELEMENTS.results.style.display = 'none';
        }
    });

    window.addEventListener('resize', onWindowResize, false);

    initMobileMenu();
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight); // WICHTIG FÜR POST-PROCESSING
}

function onBtnLoadClick() {
    if (ELEMENTS.btnLoad) ELEMENTS.btnLoad.disabled = true;
    if (ELEMENTS.btnFindTrack) ELEMENTS.btnFindTrack.disabled = true;

    const lat = parseFloat(ELEMENTS.lat.value);
    const lon = parseFloat(ELEMENTS.lon.value);
    const rad = parseFloat(ELEMENTS.rad.value);

    loadData(lat, lon, rad,
        (data) => {
            setStatus("Verarbeite Geometrie...", CONFIG.colors.statusWait);
            setTimeout(() => {
                handleDataLoaded(data, lat, lon);
                setStatus("Bereit. Wähle Start oder Suche Ziel.", CONFIG.colors.statusOk);
                if (ELEMENTS.btnFindTrack) ELEMENTS.btnFindTrack.disabled = false;
                if (ELEMENTS.btnLoad) ELEMENTS.btnLoad.disabled = false;
            }, 50);
        },
        (errorMsg) => {
            setStatus(errorMsg, CONFIG.colors.statusError);
            if (ELEMENTS.btnLoad) ELEMENTS.btnLoad.disabled = false;
        },
        (statusMsg, color) => setStatus(statusMsg, color)
    );
}

function handleDataLoaded(data, centerLat, centerLon) {
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

    const projectFn = (lat, lon) => {
        const x = (lon - centerLon) * 111320 * Math.cos(centerLat * Math.PI / 180);
        const z = (lat - centerLat) * 111320 * -1;
        return { x, z };
    };

    processData(data, centerLat, centerLon, projectFn, groups, (uniqueLevels) => {
        renderGraphNodes();
        onSliderChange();

        if (ELEMENTS.levelSelect && uniqueLevels) {
            import('./ui.js').then(module => {
                module.populateLevelSelect(uniqueLevels);
                ELEMENTS.levelSelect.value = 'all';
            });
        }

        import('./data.js').then(dataMod => {
            import('./ui.js').then(uiMod => {
                uiMod.populateTrackDropdown(dataMod.platformRegistry);
            });
        });
    });
}

function updateLevelVisibility(targetLevel) {
    const isAll = targetLevel === 'all';
    const lvl = parseFloat(targetLevel);

    Object.values(groups).forEach(g => {
        g.children.forEach(obj => {
            if (obj.userData && obj.userData.level !== undefined) {
                const myLevel = obj.userData.level;
                let visible = isAll || (myLevel === lvl);

                if (obj.userData.isStair) {
                    visible = isAll || (obj.userData.startLvl === lvl || obj.userData.endLvl === lvl);
                }

                obj.visible = visible;
            }
        });
    });
}

function renderGraphNodes() {
    const { positions, nodeObjList } = getGraphNodesData();

    nodeObjList.forEach(obj => nodeObjects.push(obj));

    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const pointMat = new THREE.PointsMaterial({
        color: CONFIG.colors.graphNode,
        size: 2,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.4
    });
    const points = new THREE.Points(pointGeo, pointMat);
    points.userData = { isNodes: true };
    groups.nodes.add(points);
}

function animate() {
    requestAnimationFrame(animate);

    if (groups.stairs) {
        groups.stairs.children.forEach(mesh => {
            if (mesh.userData.isEscalator && mesh.material && mesh.material.map) {
                const speed = 0.01;
                const direction = mesh.userData.animDirection || 1;
                mesh.material.map.offset.y -= speed * direction;
            }
        });
    }

    if (camera && controls) {
        const dist = camera.position.distanceTo(controls.target);
        const fadeStart = 250;
        const fadeEnd = 100;

        groups.buildings.children.forEach(mesh => {
            if (mesh.material) {
                let newOpacity = 0.95;

                if (dist < fadeEnd) {
                    newOpacity = 0.08;
                } else if (dist < fadeStart) {
                    const ratio = (dist - fadeEnd) / (fadeStart - fadeEnd);
                    newOpacity = 0.08 + (0.95 - 0.08) * ratio;
                }

                mesh.material.opacity = newOpacity;
            }
        });
    }

    updateMovement();
    controls.update();

    // ANSTATT renderer.render(scene, camera); NUTZEN WIR JETZT DEN COMPOSER!
    composer.render();
}

init();