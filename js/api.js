import { CONFIG } from './config.js';

let searchTimeout;

export function onSearchInput(e, ui, onSelectCallback) {
    const query = e.target.value;
    clearTimeout(searchTimeout);

    if (query.length < 3) {
        if (ui.results) ui.results.classList.add('hidden'); 
        return;
    }

    // Debouncing bleibt bei 600ms, da Photon als primäre API Autocomplete unterstützt
    searchTimeout = setTimeout(() => {
        fetchGeocoding(query, ui, onSelectCallback);
    }, 600);
}

// PROFI-ARCHITEKTUR: Fallback-Pattern implementieren
async function fetchGeocoding(query, ui, onSelectCallback) {
    try {
        // VERSUCH 1: Komoot Photon (Schnell, Autocomplete-optimiert)
        const mappedData = await tryPhoton(query);
        renderResults(mappedData, ui, onSelectCallback);
        
    } catch (photonError) {
        console.warn(`[API] Photon fehlgeschlagen (${photonError.message}). Wechsle zu Nominatim (Plan B)...`);
        
        try {
            // VERSUCH 2: Nominatim (Stabil, aber strikte Limits)
            // Wenn Photon z.B. einen Zertifikatsfehler hat (ERR_CERT_DATE_INVALID), greift das hier sofort.
            const mappedData = await tryNominatim(query);
            renderResults(mappedData, ui, onSelectCallback);
            
        } catch (nominatimError) {
            console.error("[API] Alle Geocoding-Dienste fehlgeschlagen:", nominatimError);
            import('./ui.js').then(module => {
                module.setStatus("Adress-Suche fehlgeschlagen (Server-Probleme).", CONFIG.colors.statusError);
            });
        }
    }
}

async function tryPhoton(query) {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
    const res = await fetch(photonUrl); 
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    
    return data.features.map(f => {
        const props = f.properties;
        const coords = f.geometry.coordinates; 
        
        const nameParts = [props.name, props.street, props.city, props.state, props.country].filter(Boolean);
        const uniqueNameParts = [...new Set(nameParts)]; 
        
        return {
            display_name: uniqueNameParts.join(', '),
            lat: coords[1], 
            lon: coords[0]  
        };
    });
}

async function tryNominatim(query) {
    // WICHTIG: Nominatim sperrt Scraper ohne E-Mail. 
    // Ich setze hier einen Platzhalter. Ändere ihn idealerweise auf deine E-Mail.
    const email = "gis-project-student@example.com";
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&email=${encodeURIComponent(email)}`;
    
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    
    return data.map(item => ({
        display_name: item.display_name.split(',').slice(0, 3).join(', '),
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon)
    }));
}

function renderResults(data, ui, onSelectCallback) {
    import('./ui.js').then(module => {
        module.renderSearchResults(data, ui, onSelectCallback);
    });
}

export async function loadData(lat, lon, radius, onSuccess, onError, onStatus) {
    onStatus("Frage Overpass API ab...", CONFIG.colors.statusWait);

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

            success = true;
            onSuccess(data);
            break;

        } catch (error) {
            console.warn(`[API] Fehlschlag bei ${endpoint}:`, error.message);
        }
    }

    if (!success) {
        onError("Alle OSM-Server sind aktuell überlastet (Timeout). Bitte versuche es in ein paar Minuten nochmal.");
    }
}