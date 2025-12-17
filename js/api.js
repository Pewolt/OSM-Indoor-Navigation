import { renderSearchResults } from './ui.js';

export async function loadData(lat, lon, rad, onSuccess, onError, onStatus) {
    onStatus("Lade Overpass API...", "#eab308");

    const query = `
        [out:json][timeout:25];
        (
            way["highway"](around:${rad},${lat},${lon});
            way["indoor"](around:${rad},${lat},${lon});
            way["building"](around:${rad},${lat},${lon});
            way["wall"](around:${rad},${lat},${lon});
            way["railway"](around:${rad},${lat},${lon});
            way["public_transport"](around:${rad},${lat},${lon});
            relation["public_transport"="platform"](around:${rad},${lat},${lon});
            relation["railway"="platform"](around:${rad},${lat},${lon});
            relation["building"](around:${rad},${lat},${lon});
            node["highway"="elevator"](around:${rad},${lat},${lon});
            node["entrance"](around:${rad},${lat},${lon});
            node["door"](around:${rad},${lat},${lon});
        );
        out body;
        >;
        out skel qt;
    `;

    try {
        const res = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "data=" + encodeURIComponent(query)
        });
        if (!res.ok) throw new Error(`API Error ${res.status}`);
        const text = await res.text();
        const data = JSON.parse(text);
        onSuccess(data);
    } catch (e) {
        console.error(e);
        onError("Fehler: " + e.message);
    }
}

let searchTimeout = null;

export function onSearchInput(e, ui) {
    const query = e.target.value;
    clearTimeout(searchTimeout);
    if (query.length < 3) {
        ui.results.style.display = 'none';
        return;
    }
    searchTimeout = setTimeout(() => { fetchNominatim(query, ui); }, 600);
}

async function fetchNominatim(query, ui) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'OSM-Indoor-Routing-Student-App' } });
        const data = await res.json();
        renderSearchResults(data, ui);
    } catch (err) { console.error("Nominatim Error", err); }
}
