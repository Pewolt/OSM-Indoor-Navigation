export const CONFIG = {
    floorHeight: 4.5,
    roomHeight: 3.5,
    nodeSize: 0.8,
    colors: {
        background: 0x0f172a, // Slate 900 (Passt zum Tailwind UI)
        fog: 0x0f172a,
        grid1: 0x334155,
        grid2: 0x1e293b,
        ambientLight: 0xffffff,
        sunLight: 0xfff5e6, // Leicht warmes Sonnenlicht

        // --- NEUE GEBÄUDE PALETTE ---
        building: 0x475569, // Slate 600 (Außenhülle)
        room: 0x64748b, // Slate 500 (Innenräume - etwas heller)
        roomBorder: 0x94a3b8,

        // --- INFRASTRUKTUR ---
        platform: 0xd1d5db, // Gray 300 (Heller Beton, hebt sich super ab)
        platformBorder: 0xffffff,
        railway: 0x9ca3af, // Gray 400

        // --- HIGHLIGHTS ---
        stairs: 0xf59e0b, // Amber 500 (Signalisiert Wege)
        escalator: 0xe11d48, // Rose 600
        entrance: 0x38bdf8, // Sky 400
        entranceEmissive: 0x0284c7, // Sky 600

        // --- ROUTING ---
        startNode: 0x22c55e,
        endNode: 0xef4444,
        route: 0xec4899, // Pink 500 (Starker Kontrast zum blauen Rest)
        graphEdge: 0xffffff,
        graphNode: 0x3b82f6,

        statusOk: "#22c55e",
        statusWait: "#eab308",
        statusError: "#ef4444"
    }
};