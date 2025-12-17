
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
    let opacity = 0.8; // SOLID now, was 0.3
    let depthWrite = true; // Enable depth write for solid feel
    let borderColor = CONFIG.colors.roomBorder;

    if (tags.type === 'platform') {
        color = CONFIG.colors.platform;
        opacity = 1.0; // Fully solid
        height = 0.6; // Slightly higher
        borderColor = CONFIG.colors.platformBorder;
    } else if (tags.building) {
        color = 0x0f172a; // Match bg roughly
        opacity = 0.1; // Keep buildings ghostly
        depthWrite = false;
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geo.rotateX(Math.PI / 2); // Rotate to lay flat

    const mat = new THREE.MeshStandardMaterial({
        color: color,
        transparent: opacity < 1.0,
        opacity: opacity,
        side: THREE.DoubleSide, // Still double side for open walls
        depthWrite: depthWrite,
        roughness: 0.7,
        metalness: 0.1
    });

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
function createArrowTexture(colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#222222';
    ctx.fillRect(0, 0, 64, 64);

    // Chevron pointing UP (V-axis)
    ctx.beginPath();
    ctx.moveTo(10, 40);
    ctx.lineTo(32, 20); // Tip
    ctx.lineTo(54, 40);
    ctx.lineTo(54, 50);
    ctx.lineTo(32, 30); // Inner Tip
    ctx.lineTo(10, 50);
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // tex.rotation = Math.PI / 2; // Maybe adjust if mapping is sideways
    return tex;
}

const texGreen = createArrowTexture('#22c55e'); // Green
const texRed = createArrowTexture('#ef4444');   // Red

// --- UPDATE VISUALS ---

export function updateStairVisuals(mesh, explosionOffset) {
    const data = mesh.userData;
    if (!data.points || data.points.length < 2) return;

    // Calculate real Y positions for all points
    // We interpolate levels between start and end?
    // Or do we assume linear slope?
    // StartLvl and EndLvl are known.
    // Calculate total length 2D
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

    // Build 3D points
    const pts3d = data.points.map((p, i) => {
        const progress = totalLen > 0 ? dists[i] / totalLen : 0;
        const y = startY + (progress * yDiff);
        return new THREE.Vector3(p.x, y, p.z);
    });

    const curve = new THREE.CatmullRomCurve3(pts3d);

    // Dispose old geometry
    if (mesh.geometry) mesh.geometry.dispose();

    if (data.isEscalator) {
        // --- ESCALATOR (Ramp) ---
        // TubeGeometry: Radius 0.8
        const tube = new THREE.TubeGeometry(curve, 20, 0.8, 4, false); // Radius 0.8
        mesh.geometry = tube;

        // Direction Logic based on conveying tag
        // 'forward' = along way (Green)
        // 'backward' = against way (Red)
        // 'yes' / other = default (Green?)

        let isForward = true;
        if (data.conveying === 'backward') isForward = false;

        // Clone texture to allow individual repeat/offset per mesh
        const baseTex = isForward ? texGreen : texRed;
        if (mesh.material.map) mesh.material.map.dispose(); // Cleanup old

        const tex = baseTex.clone();
        tex.needsUpdate = true;

        mesh.material.map = tex;
        mesh.material.color.setHex(0xffffff);
        mesh.material.emissive.setHex(0xffffff);
        mesh.material.emissiveMap = tex;
        mesh.material.emissiveIntensity = 1.0;
        mesh.material.transparent = false;

        // Ensure texture repeats along length (V)
        // Tube circumference is 2*PI*r = 2*PI*0.8 ~= 5.
        // Texture width 64px.
        // We want arrow to visually appear "normal". 
        // Let's repeat U (around) 6 times.
        const segments = Math.max(1, Math.round(totalLen));
        tex.repeat.set(6, segments); // U=6 (around), V=segments (along)

        // Store direction for animation in main.js
        mesh.userData.animDirection = isForward ? 1 : -1;

    } else {
        // --- STAIRS (Stepped) ---
        // We construct a stepped mesh manually.
        // Steps count ~ 2 steps per meter?
        const stepHeight = 0.2; // 20cm
        const stepsCount = Math.max(2, Math.floor(Math.abs(yDiff) / stepHeight));

        // We walk the curve.
        const ptrs = [];
        const width = 1.2;

        // Simple "Ribbon" with steps? 
        // Generative geometry:
        // For each step i:
        //   t1 = i/steps
        //   t2 = (i+1)/steps
        //   p1 = curve.getPoint(t1)
        //   p2 = curve.getPoint(t2)
        //   Tangent for normal (width)

        // To be easier, let's just use a Tube for now but with "Box" segments? 
        // No, user wants "Richtige Treppenmodelle".
        // Let's build a Triangle Strip.

        const vertices = [];
        const indices = [];
        // Helper to add quad
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

            // Side vector
            const up = new THREE.Vector3(0, 1, 0);
            const side = new THREE.Vector3().crossVectors(tan, up).normalize().multiplyScalar(width / 2);

            // Step: Horizontal (Tread) then Vertical (Riser)
            // But pA and pB are on the slope.
            // Tread: At Y_A, go from A to B' (where B' is B.x,z but A.y)
            // Riser: At B, go from Y_A to Y_B

            // Vertices for Tread
            const t1 = new THREE.Vector3().copy(pA).add(side); // A Left
            const t2 = new THREE.Vector3().copy(pA).sub(side); // A Right

            // B projected to A's height
            const pB_flat = new THREE.Vector3(pB.x, pA.y, pB.z);
            const t3 = new THREE.Vector3().copy(pB_flat).sub(side); // B Right (Flat)
            const t4 = new THREE.Vector3().copy(pB_flat).add(side); // B Left (Flat)

            // Riser
            // B Flat to B Real
            const r1 = t4;
            const r2 = t3;
            const r3 = new THREE.Vector3().copy(pB).sub(side); // B Right (Real)
            const r4 = new THREE.Vector3().copy(pB).add(side); // B Left (Real)

            addQuad(t1, t2, t3, t4); // Tread
            addQuad(r1, r2, r3, r4); // Riser

            // Bottom/Side closing? Maybe skip for performance/visibility
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
