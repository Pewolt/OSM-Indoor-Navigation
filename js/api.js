import { CONFIG } from './config.js';

let searchTimeout;

export function onSearchInput(e, ui, onSelectCallback) {
    const query = e.target.value;
    clearTimeout(searchTimeout);

    if (query.length < 3) {
        if (ui.results) ui.results.style.display = 'none';
        return;
    }

    // Entprellung (Debouncing) - Schont die API
    searchTimeout = setTimeout(() => {
        fetchNominatim(query, ui, onSelectCallback);
    }, 600);
}

async function fetchNominatim(query, ui, onSelectCallback) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'OSM-Indoor-Routing-Pro-App' } });
        const data = await res.json();

        // Dynamischer Import des UI-Moduls, um zirkuläre Abhängigkeiten zu vermeiden
        import('./ui.js').then(module => {
            module.renderSearchResults(data, ui, onSelectCallback);
        });
    } catch (err) {
        console.error("[API] Nominatim Error", err);
    }
}

export async function loadData(lat, lon, radius, onSuccess, onError, onStatus) {
    onStatus("Frage Overpass API ab...", CONFIG.colors.statusWait);

    // Die Query bleibt gleich
    const query = `
        [out:json][timeout:25];
        (
          node(around:${radius},${lat},${lon})["indoor"];
          way(around:${radius},${lat},${lon})["indoor"];
          relation(around:${radius},${lat},${lon})["indoor"];
          node(around:${radius},${lat},${lon})["building"];
          way(around:${radius},${lat},${lon})["building"];
          relation(around:${radius},${lat},${lon})["building"];
          node(around:${radius},${lat},${lon})["highway"="steps"];
          way(around:${radius},${lat},${lon})["highway"="steps"];
          node(around:${radius},${lat},${lon})["highway"="elevator"];
          node(around:${radius},${lat},${lon})["public_transport"];
          way(around:${radius},${lat},${lon})["public_transport"];
          relation(around:${radius},${lat},${lon})["public_transport"];
          node(around:${radius},${lat},${lon})["railway"];
          way(around:${radius},${lat},${lon})["railway"];
          relation(around:${radius},${lat},${lon})["railway"];
        );
        (._;>;);
        out body;
    `;

    // PROFESSIONELLE LÖSUNG: Fallback-Endpoints gegen 504 Timeouts
    const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter'
    ];

    let success = false;

    for (const endpoint of endpoints) {
        try {
            console.log(`[API] Versuche Overpass API: ${endpoint}`);
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: "data=" + encodeURIComponent(query)
            });

            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}`);
            }

            const data = await response.json();

            if (!data.elements || data.elements.length === 0) {
                throw new Error("Keine relevanten Indoor/Gebäude-Daten in diesem Radius gefunden.");
            }

            // Erfolg! Loop abbrechen.
            success = true;
            onSuccess(data);
            break;

        } catch (error) {
            console.warn(`[API] Fehlschlag bei ${endpoint}:`, error.message);
            // Wenn es fehlschlägt, springt die Schleife automatisch zum nächsten Endpoint
        }
    }

    if (!success) {
        onError("Alle OSM-Server sind aktuell überlastet (Timeout). Bitte versuche es in ein paar Minuten nochmal.");
    }
}