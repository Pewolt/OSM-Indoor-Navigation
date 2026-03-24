
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

// Textur Helper
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

    if (tags.type === 'platform') {
        color = CONFIG.colors.platform;
        opacity = 1.0;
        height = 0.6;
        borderColor = CONFIG.colors.platformBorder;
        isPlatform = true;
    } else if (tags.building || tags.indoor === 'room' || tags.indoor === 'corridor' || tags.indoor === 'level') {
        color = 0x334155; // Lighter than background
        opacity = 0.8; // Make walls transparent
        depthWrite = false;
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: -height, bevelEnabled: false });
    geo.rotateX(Math.PI / 2); // Rotate to lay flat

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
    } else {
        // Multi-material for Buildings/Rooms
        // Index 0: Side walls
        // Index 1: Top/Bottom caps (Floors/Ceilings)

        const matWalls = new THREE.MeshStandardMaterial({
            color: color,
            transparent: true,
            opacity: opacity * 0.3, // Walls are more transparent than floors
            side: THREE.DoubleSide,
            depthWrite: false,
            roughness: 0.1,
            metalness: 0.1
        });

        const matCaps = new THREE.MeshStandardMaterial({
            color: color, // Same color
            transparent: true,
            opacity: opacity, // Use the opacity set above (0.8 from user edit)
            side: THREE.DoubleSide,
            depthWrite: false,
            roughness: 0.8,
            metalness: 0.0
        });

        mat = [matCaps, matWalls]; // ExtrudeGeometry uses [Cap, Side] order? No, usually [Side, Cap] or [Front, Back, Side...]
        // Actually ExtrudeGeometry groups: 0 = Side, 1 = Top/Bottom Cap.
        // Wait, three.js docs say: "When using an array of materials... The first material is used for the faces of the extrusion, the second material for the front and back faces (caps)."
        // So: [Side, Cap]
        mat = [matWalls, matCaps];
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { level: level, isRoom: true, osmId: osmId };

    if (tags.type === 'platform') groups.platforms.add(mesh);
    else groups.rooms.add(mesh);

    // Edges - only for platforms or specific needs to reduce clutter
    if (tags.type === 'platform') {
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
        metalness: 0.2, // Improved metalness
        color: CONFIG.colors.railway
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { level: level, osmId: osmId };
    groups.railways.add(mesh);
}

// --- TEXTURE HELPER FOR ESCALATORS ---
function createArrowTexture(arrowColorHex, isFlipped = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Hintergrund (Orange)
    ctx.fillStyle = '#cfd51b';
    ctx.fillRect(0, 0, 64, 64);

    ctx.fillStyle = arrowColorHex;

    // Hilfsfunktion zum Spiegeln der X-Koordinate
    // Wenn isFlipped true ist, wird 5 zu (64-5) = 59
    const fX = (x) => isFlipped ? 64 - x : x;

    ctx.beginPath();
    ctx.moveTo(fX(5), 22);
    ctx.lineTo(fX(35), 22);
    ctx.lineTo(fX(35), 8);
    ctx.lineTo(fX(58), 32); // Spitze
    ctx.lineTo(fX(35), 56);
    ctx.lineTo(fX(35), 42);
    ctx.lineTo(fX(5), 42);
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;

    // Scharfe Darstellung
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;

    return tex;
}

// texGreen zeigt nach vorne (oben), texRed zeigt nach hinten (unten)
const texGreen = createArrowTexture('#22c55e', false);
const texRed = createArrowTexture('#ef4444', true);

// --- UPDATE VISUALS ---

export function updateStairVisuals(mesh, explosionOffset) {
    const data = mesh.userData;
    if (!data.points || data.points.length < 2) return;

    // --- 1. GEOMETRIE-BERECHNUNG ---
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

    // --- 2. ROLLTREPPEN (ESCALATOR) ---
    if (data.isEscalator) {
        mesh.geometry = new THREE.TubeGeometry(curve, 20, 0.6, 8, false);

        const drivesForward = (data.conveying !== 'backward'); 
        const geoIsRising = endY > startY;
        const isUpward = (drivesForward && geoIsRising) || (!drivesForward && !geoIsRising);

        const baseTex = isUpward ? texGreen : texRed;
        const tex = baseTex.clone(); 
        const segments = Math.max(1, Math.round(totalLen / 2));
        
        // BASIS-RICHTUNG DER TEXTUR
        // Wir fangen mit der Logik an, die für Grün (isUpward) funktioniert
        let finalRepeatX = drivesForward ? segments : -segments;
        let finalAnimDir = 1;

        // DER FIX FÜR ROT (Downward):
        // Wenn es eine rote Treppe ist, drehen wir den Pfeil um 180 Grad um (-1)
        // Damit die Animation aber nicht auch umkippt, müssen wir animDirection ebenfalls umdrehen.
        if (!isUpward) {
            finalRepeatX *= -1; // Pfeil um 180 Grad drehen
            finalAnimDir *= -1; // Animations-Vorzeichen anpassen, damit die Flussrichtung bleibt
        }

        tex.repeat.set(finalRepeatX, 2);
        mesh.userData.animDirection = finalAnimDir;

        tex.needsUpdate = true;
        mesh.material.map = tex;
        mesh.material.emissiveMap = tex;
        mesh.material.emissiveIntensity = 1.0;
        mesh.material.emissive.setHex(0xffffff);
        mesh.material.color.setHex(0xffffff);

    } else {
        // --- 3. TREPPEN (STAIRS - BLEIBT UNVERÄNDERT) ---
        const stepHeight = 0.2;
        const stepsCount = Math.max(2, Math.floor(Math.abs(yDiff) / stepHeight));
        const vertices = [];
        const indices = [];
        const width = 1.2;

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
            const r3 = new THREE.Vector3().copy(pB).sub(side);
            const r4 = new THREE.Vector3().copy(pB).add(side);

            addQuad(t1, t2, t3, t4); 
            addQuad(t4, t3, r3, r4); 
        }

        const bufferGeo = new THREE.BufferGeometry();
        bufferGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        bufferGeo.setIndex(indices);
        bufferGeo.computeVertexNormals();
        mesh.geometry = bufferGeo;
        mesh.material.map = null;
        mesh.material.emissive.setHex(0x000000);
        mesh.material.color.setHex(0xffa500);
    }
}

export function createStairMesh(groups, points, startLvl, endLvl, tags, osmId) {
    const isEscalator = tags.conveying && tags.conveying !== 'no';

    // We create a dummy mesh first. Geometry will be filled by updateStairVisuals.
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.MeshStandardMaterial({
        color: isEscalator ? 0xffffff : CONFIG.colors.stairs,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geo, mat);

    // userData stores mostly raw data
    mesh.userData = {
        isStair: true,
        isConveying: isEscalator,
        conveying: tags.conveying, // Store exact value provided by user
        isEscalator: isEscalator, // alias
        points: points, // Whole path
        startLvl,
        endLvl,
        osmId
    };

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
    groups.entrances.add(mesh);
}

export function createLine(groups, p1, p2, color, isElevator) {
    const pts = [new THREE.Vector3(p1.x, 0, p1.z), new THREE.Vector3(p2.x, 0, p2.z)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: color, opacity: 0.3, transparent: true });
    const line = new THREE.Line(geo, mat);

    // level1 and level2 are needed for 'explosion' effect
    line.userData = { level1: p1.level, level2: p2.level, isElevator: isElevator };
    groups.graph.add(line);
}
