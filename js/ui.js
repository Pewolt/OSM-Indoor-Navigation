
import { osmCache } from './data.js';

export const ELEMENTS = {
    search: document.getElementById('in-search'),
    results: document.getElementById('search-results'),
    lat: document.getElementById('in-lat'),
    lon: document.getElementById('in-lon'),
    rad: document.getElementById('in-rad'),
    btnLoad: document.getElementById('btn-load'),
    status: document.getElementById('status-text'),
    infoStart: document.getElementById('info-start'),
    infoEnd: document.getElementById('info-end'),
    slider: document.getElementById('explode-slider'),
    infoPanel: document.getElementById('ui-info'),
    infoContent: document.getElementById('info-content'),
    infoTitle: document.getElementById('info-title'),
    btnCloseInfo: document.getElementById('btn-close-info'),
    inTrack: document.getElementById('in-track'),
    btnFindTrack: document.getElementById('btn-find-track'),
    // Replay
    replayControls: document.getElementById('replay-controls'),
    btnReplayPrev: document.getElementById('btn-replay-prev'),
    btnReplayNext: document.getElementById('btn-replay-next'),
    replayStatus: document.getElementById('replay-status'),
    // Tools
    btnLockStart: document.getElementById('btn-lock-start'),
    btnClearRoute: document.getElementById('btn-clear-route')
};

export function setStatus(text, color) {
    ELEMENTS.status.innerText = text;
    ELEMENTS.status.style.color = color || 'white';
}

export function showInfo(osmId, typeLabel) {
    const tags = osmCache[osmId] || {};
    ELEMENTS.infoPanel.style.display = 'flex';
    ELEMENTS.infoTitle.innerText = tags.name || typeLabel || osmId;
    let html = `<table class="attr-table">`;
    html += `<tr><td class="key">OSM ID</td><td class="val">${osmId}</td></tr>`;
    for (let [k, v] of Object.entries(tags)) {
        html += `<tr><td class="key">${k}</td><td class="val">${v}</td></tr>`;
    }
    html += `</table>`;
    ELEMENTS.infoContent.innerHTML = html;
}

export function hideInfo() {
    ELEMENTS.infoPanel.style.display = 'none';
}

export function renderSearchResults(data, uiElements) {
    // uiElements can be passed or we use global ELEMENTS if initialized
    const resultsContainer = uiElements ? uiElements.results : ELEMENTS.results;
    const latInput = uiElements ? uiElements.lat : ELEMENTS.lat;
    const lonInput = uiElements ? uiElements.lon : ELEMENTS.lon;
    const searchInput = uiElements ? uiElements.search : ELEMENTS.search;

    resultsContainer.innerHTML = '';
    if (data.length === 0) {
        resultsContainer.style.display = 'none';
        return;
    }
    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerText = item.display_name.split(',').slice(0, 3).join(',');
        div.addEventListener('click', () => {
            latInput.value = item.lat;
            lonInput.value = item.lon;
            searchInput.value = div.innerText;
            resultsContainer.style.display = 'none';
            setStatus("Ort übernommen. Klicke 'Laden'.", "#eab308");
        });
        resultsContainer.appendChild(div);
    });
    resultsContainer.style.display = 'block';
}

export function updateRouteInfo(startNode, endNode) {
    ELEMENTS.infoStart.innerText = startNode ? startNode.osmId : "-";
    ELEMENTS.infoEnd.innerText = endNode ? endNode.osmId : "-";
}

export function showReplayControls(show) {
    if (ELEMENTS.replayControls) {
        ELEMENTS.replayControls.style.display = show ? 'flex' : 'none';
        if (!show) updateReplayStatus("-"); // Reset on hide
    }
}

export function updateReplayStatus(text) {
    if (ELEMENTS.replayStatus) ELEMENTS.replayStatus.innerText = text;
}

export function updateLockStatus(isLocked) {
    if (ELEMENTS.btnLockStart) {
        ELEMENTS.btnLockStart.innerText = isLocked ? "Start fixiert 🔒" : "Start fixieren 🔓";
        ELEMENTS.btnLockStart.style.background = isLocked ? "#22c55e" : "#3b82f6"; // Green if locked, Blue if unlocked
    }
}
