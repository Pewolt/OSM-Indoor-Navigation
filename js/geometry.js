import * as THREE from 'three';
import { CONFIG } from './config.js';

let railTexture = null;

export function getRailTexture() {
    if (!railTexture) railTexture = createStripedTexture();
    return railTexture;
}

export function getY(level, explosionOffset = 0) {
    return (level * CONFIG.floorHeight) + (level * explosionOffset);
}

function createStripedTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#111111'; ctx.fillRect(0, 0, 32, 16);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    return tex;
}

// --- CREATION FUNCTIONS ---

export function createMeshFromShape(groups, shape, level, tags, osmId) {
    let height = CONFIG.roomHeight;
    let color = CONFIG.colors.room;
    let opacity = 0.8;
    let depthWrite = true;
    let borderColor = CONFIG.colors.roomBorder;
    let isPlatform = false;

    const isBuilding = (tags.building && tags.building !== 'no') || tags['building:part'];
    const isRoom = tags.indoor === 'room' || tags.indoor === 'corridor' || tags.indoor === 'level' || tags.wall;

    if (tags.type === 'platform') {
        color = CONFIG.colors.platform;
        opacity = 1.0;
        height = 0.6;
        borderColor = CONFIG.colors.platformBorder;
        isPlatform = true;
    } else if (isBuilding && !isRoom) {
        color = CONFIG.colors.building;
        opacity = 0.95;
        depthWrite = true;

        let levelsCount = parseFloat(tags['building:levels']) || 1;
        height = parseFloat(tags.height) || (levelsCount * CONFIG.floorHeight);
    } else {
        color = CONFIG.colors.room;
        opacity = 0.4;
        depthWrite = false;
        height = CONFIG.roomHeight;
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, height, 0);

    let mat;
    if (isPlatform) {
        mat = new THREE.MeshStandardMaterial({
            color: color,
            transparent: false,
            opacity: 1.0,
            side: THREE.DoubleSide,
            depthWrite: true,
            roughness: 0.7,
            metalness: 0.1
        });
    } else if (isBuilding && !isRoom) {
        mat = new THREE.MeshStandardMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            depthWrite: true,
            roughness: 0.9,
            metalness: 0.0
        });
    } else {
        const matWalls = new THREE.MeshStandardMaterial({
            color: color,
            transparent: true,
            opacity: opacity * 0.4,
            side: THREE.DoubleSide,
            depthWrite: false,
            roughness: 0.1
        });
        const matCaps = new THREE.MeshStandardMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            roughness: 0.8
        });
        mat = [matCaps, matWalls];
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { level: level, isRoom: isRoom, isBuilding: (isBuilding && !isRoom), osmId: osmId };

    // SCHATTEN AKTIVIEREN
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (isPlatform) groups.platforms.add(mesh);
    else if (isBuilding && !isRoom) groups.buildings.add(mesh);
    else groups.rooms.add(mesh);

    if (isPlatform) {
        const edges = new THREE.EdgesGeometry(geo);
        const lineMat = new THREE.LineBasicMaterial({
            color: borderColor,
            opacity: 0.5,
            transparent: true
        });
        const line = new THREE.LineSegments(edges, lineMat);
        line.userData = { level: level };
        groups.platforms.add(line);
    }
}

export function createPolygonMesh(groups, points, level, tags, osmId) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].z);
    createMeshFromShape(groups, shape, level, tags, osmId);
}

export function createPlatformLine(groups, points, level, tags, osmId) {
    const pts = points.map(p => new THREE.Vector3(p.x, 0, p.z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, pts.length * 2, 1.5, 4, false);
    geo.scale(1, 0.1, 1);
    const mat = new THREE.MeshStandardMaterial({
        color: CONFIG.colors.platform,
        opacity: 0.8,
        transparent: true,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { level: level, osmId: osmId };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    groups.platforms.add(mesh);
}

export function createRailwayLine(groups, points, level, tags, osmId) {
    const pts = points.map(p => new THREE.Vector3(p.x, 0, p.z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, pts.length * 3, 1.0, 6, false);

    const texture = getRailTexture().clone();
    texture.repeat.set(pts.length * 4, 1);
    texture.needsUpdate = true;

    const mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.8,
        metalness: 0.2,
        color: CONFIG.colors.railway
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { level: level, osmId: osmId };
    mesh.receiveShadow = true;
    groups.railways.add(mesh);
}

// --- TEXTURE HELPER FOR ESCALATORS ---
function createArrowTexture(arrowColorHex, isFlipped = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f97316';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = arrowColorHex;

    const fX = (x) => isFlipped ? 64 - x : x;

    ctx.beginPath();
    ctx.moveTo(fX(5), 22);
    ctx.lineTo(fX(35), 22);
    ctx.lineTo(fX(35), 8);
    ctx.lineTo(fX(58), 32);
    ctx.lineTo(fX(35), 56);
    ctx.lineTo(fX(35), 42);
    ctx.lineTo(fX(5), 42);
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;

    return tex;
}

const texGreen = createArrowTexture('#22c55e', false);
const texRed = createArrowTexture('#ef4444', true);

// --- UPDATE VISUALS ---

export function updateStairVisuals(mesh, explosionOffset) {
    const data = mesh.userData;
    if (!data.points || data.points.length < 2) return;

    let totalLen = 0;
    const dists = [0];
    for (let i = 0; i < data.points.length - 1; i++) {
        const d = Math.hypot(data.points[i + 1].x - data.points[i].x, data.points[i + 1].z - data.points[i].z);
        totalLen += d;
        dists.push(totalLen);
    }

    const startY = getY(data.startLvl, explosionOffset);
    const endY = getY(data.endLvl, explosionOffset);
    const yDiff = endY - startY;

    const pts3d = data.points.map((p, i) => {
        const progress = totalLen > 0 ? dists[i] / totalLen : 0;
        const y = startY + (progress * yDiff);
        return new THREE.Vector3(p.x, y, p.z);
    });

    const curve = new THREE.CatmullRomCurve3(pts3d);

    if (mesh.geometry) mesh.geometry.dispose();

    if (data.isEscalator) {
        const tube = new THREE.TubeGeometry(curve, 20, 0.8, 8, false);
        mesh.geometry = tube;

        let isForward = true;
        if (data.conveying === 'backward') isForward = false;

        const baseTex = isForward ? texGreen : texRed;
        if (mesh.material.map) mesh.material.map.dispose();

        const tex = baseTex.clone();
        tex.needsUpdate = true;

        mesh.material.map = tex;
        mesh.material.color.setHex(0xffffff);
        mesh.material.emissive.setHex(0xffffff);
        mesh.material.emissiveMap = tex;
        mesh.material.emissiveIntensity = 1.0;
        mesh.material.transparent = false;

        const segments = Math.max(1, Math.round(totalLen));
        tex.repeat.set(6, segments);
        mesh.userData.animDirection = isForward ? 1 : -1;

    } else {
        const stepHeight = 0.2;
        const stepsCount = Math.max(2, Math.floor(Math.abs(yDiff) / stepHeight));

        const width = 1.2;
        const vertices = [];
        const indices = [];
        const addQuad = (v1, v2, v3, v4) => {
            const base = vertices.length / 3;
            vertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z, v4.x, v4.y, v4.z);
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        };

        for (let i = 0; i < stepsCount; i++) {
            const tA = i / stepsCount;
            const tB = (i + 1) / stepsCount;

            const pA = curve.getPoint(tA);
            const pB = curve.getPoint(tB);
            const tan = curve.getTangent(tA);

            const up = new THREE.Vector3(0, 1, 0);
            const side = new THREE.Vector3().crossVectors(tan, up).normalize().multiplyScalar(width / 2);

            const t1 = new THREE.Vector3().copy(pA).add(side);
            const t2 = new THREE.Vector3().copy(pA).sub(side);

            const pB_flat = new THREE.Vector3(pB.x, pA.y, pB.z);
            const t3 = new THREE.Vector3().copy(pB_flat).sub(side);
            const t4 = new THREE.Vector3().copy(pB_flat).add(side);

            const r1 = t4;
            const r2 = t3;
            const r3 = new THREE.Vector3().copy(pB).sub(side);
            const r4 = new THREE.Vector3().copy(pB).add(side);

            addQuad(t1, t2, t3, t4);
            addQuad(r1, r2, r3, r4);
        }

        const bufferGeo = new THREE.BufferGeometry();
        bufferGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        bufferGeo.setIndex(indices);
        bufferGeo.computeVertexNormals();
        mesh.geometry = bufferGeo;
        mesh.material.map = null;
        mesh.material.color.setHex(CONFIG.colors.stairs);
    }
}

export function createStairMesh(groups, points, startLvl, endLvl, tags, osmId) {
    const isEscalator = tags.conveying && tags.conveying !== 'no';

    const geo = new THREE.BufferGeometry();
    const mat = new THREE.MeshStandardMaterial({
        color: isEscalator ? 0xffffff : CONFIG.colors.stairs,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geo, mat);

    mesh.userData = {
        isStair: true,
        isConveying: isEscalator,
        conveying: tags.conveying,
        isEscalator: isEscalator,
        points: points,
        startLvl,
        endLvl,
        osmId
    };

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    groups.stairs.add(mesh);
}

export function createEntranceMesh(groups, pos, level, tags, osmId) {
    const size = CONFIG.nodeSize * 2;
    const geo = new THREE.BoxGeometry(size, size * 2, size);
    const mat = new THREE.MeshStandardMaterial({
        color: CONFIG.colors.entrance,
        emissive: CONFIG.colors.entranceEmissive,
        emissiveIntensity: 0.4
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { level: level, osmId: osmId };
    mesh.castShadow = true;
    groups.entrances.add(mesh);
}

export function createLine(groups, p1, p2, color, isElevator) {
    const pts = [new THREE.Vector3(p1.x, 0, p1.z), new THREE.Vector3(p2.x, 0, p2.z)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: color, opacity: 0.3, transparent: true });
    const line = new THREE.Line(geo, mat);

    line.userData = { level1: p1.level, level2: p2.level, isElevator: isElevator };
    groups.graph.add(line);
}