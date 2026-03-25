import { osmCache } from './data.js';

export const ELEMENTS = {
    search: document.getElementById('in-search'),
    btnGeolocation: document.getElementById('btn-geolocation'),
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
    replayControls: document.getElementById('replay-controls'),
    btnReplayPrev: document.getElementById('btn-replay-prev'),
    btnReplayNext: document.getElementById('btn-replay-next'),
    btnReplayPlayPause: document.getElementById('btn-replay-playpause'),
    iconPlayPause: document.getElementById('icon-playpause'),
    btnExitFPV: document.getElementById('btn-exit-fpv'),
    replayStatus: document.getElementById('replay-status'),
    btnLockStart: document.getElementById('btn-lock-start'),
    btnClearRoute: document.getElementById('btn-clear-route'),
    levelSelect: document.getElementById('in-level-select'),
    btnCamPanToggle: document.getElementById('btn-cam-pan-toggle')
};

export function setStatus(text, color) {
    if (!ELEMENTS.status) return;
    ELEMENTS.status.innerText = text;
    ELEMENTS.status.style.color = color || '';
}

export function showInfo(osmId, typeLabel) {
    const tags = osmCache[osmId] || {};
    ELEMENTS.infoPanel.style.display = 'flex';
    ELEMENTS.infoPanel.classList.remove('hidden');

    if (ELEMENTS.infoTitle) ELEMENTS.infoTitle.innerText = tags.name || typeLabel || osmId;

    let html = `<div class="flex flex-col gap-3">`;
    html += `
        <div class="flex flex-col gap-1">
            <span class="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">OSM ID</span>
            <span class="text-sm font-body text-primary-fixed-dim font-mono">${osmId}</span>
        </div>
    `;

    for (let [k, v] of Object.entries(tags)) {
        html += `
            <div class="flex flex-col gap-1">
                <span class="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">${k}</span>
                <span class="text-sm font-body text-white break-words">${v}</span>
            </div>
        `;
    }
    html += `</div>`;

    if (ELEMENTS.infoContent) ELEMENTS.infoContent.innerHTML = html;
}

export function hideInfo() {
    if (ELEMENTS.infoPanel) {
        ELEMENTS.infoPanel.style.display = 'none';
        ELEMENTS.infoPanel.classList.add('hidden');
    }
}

export function renderSearchResults(data, uiElements, onSelectCallback) {
    const resultsContainer = uiElements ? uiElements.results : ELEMENTS.results;
    const latInput = uiElements ? uiElements.lat : ELEMENTS.lat;
    const lonInput = uiElements ? uiElements.lon : ELEMENTS.lon;
    const searchInput = uiElements ? uiElements.search : ELEMENTS.search;

    if (!resultsContainer) return;

    resultsContainer.innerHTML = '';
    if (data.length === 0) {
        resultsContainer.classList.add('hidden');
        return;
    }
    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'px-4 py-3 text-sm text-on-surface hover:bg-primary/20 hover:text-white cursor-pointer border-b border-outline-variant/30 last:border-0 transition-colors';
        div.innerText = item.display_name.split(',').slice(0, 3).join(',');
        div.addEventListener('click', () => {
            if (latInput) latInput.value = item.lat;
            if (lonInput) lonInput.value = item.lon;
            if (searchInput) searchInput.value = div.innerText;
            resultsContainer.classList.add('hidden');
            if (onSelectCallback) onSelectCallback();
        });
        resultsContainer.appendChild(div);
    });
    resultsContainer.classList.remove('hidden');
}

export function populateTrackDropdown(registry) {
    const select = ELEMENTS.inTrack;
    if (!select) return;

    select.innerHTML = '<option value="">-- Wähle ein Ziel --</option>';

    const tracks = [];
    for (let key in registry) {
        const p = registry[key];
        const name = p.trackRef || p.localRef || p.ref || p.name;
        if (name && !tracks.some(t => t === name)) {
            tracks.push(name);
        }
    }

    tracks.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    tracks.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.toLowerCase();
        opt.innerText = `Gleis / Ref ${t}`;
        select.appendChild(opt);
    });
}

export function updateRouteInfo(startNode, endNode) {
    if (ELEMENTS.infoStart) ELEMENTS.infoStart.innerText = startNode ? startNode.osmId : "-";
    if (ELEMENTS.infoEnd) ELEMENTS.infoEnd.innerText = endNode ? endNode.osmId : "-";
}

export function showReplayControls(show) {
    if (ELEMENTS.replayControls) {
        if (show) {
            ELEMENTS.replayControls.style.display = 'flex';
            ELEMENTS.replayControls.classList.remove('hidden');
        } else {
            ELEMENTS.replayControls.style.display = 'none';
            ELEMENTS.replayControls.classList.add('hidden');
            updateReplayStatus("-");
            updatePlayPauseIcon(false);
            toggleFPVUI(false);
        }
    }
}

export function updateReplayStatus(text) {
    if (ELEMENTS.replayStatus) ELEMENTS.replayStatus.innerText = text;
}

// --- NEU FÜR FPV MODUS ---
export function updatePlayPauseIcon(isPlaying) {
    if (ELEMENTS.iconPlayPause) {
        ELEMENTS.iconPlayPause.innerText = isPlaying ? 'pause' : 'play_arrow';
    }
}

export function toggleFPVUI(isFPV) {
    if (ELEMENTS.btnExitFPV) {
        if (isFPV) {
            ELEMENTS.btnExitFPV.classList.remove('hidden');
        } else {
            ELEMENTS.btnExitFPV.classList.add('hidden');
        }
    }
}

export function updateLockStatus(isLocked) {
    if (ELEMENTS.btnLockStart) {
        ELEMENTS.btnLockStart.innerHTML = isLocked ? `<span class="material-symbols-outlined text-sm">lock</span> Start fixiert` : `<span class="material-symbols-outlined text-sm">lock_open</span> Start fixieren`;

        if (isLocked) {
            ELEMENTS.btnLockStart.classList.replace('bg-surface-container-highest', 'bg-green-500/20');
            ELEMENTS.btnLockStart.classList.replace('text-primary', 'text-green-400');
            ELEMENTS.btnLockStart.classList.replace('border-primary/20', 'border-green-500/20');
        } else {
            ELEMENTS.btnLockStart.classList.replace('bg-green-500/20', 'bg-surface-container-highest');
            ELEMENTS.btnLockStart.classList.replace('text-green-400', 'text-primary');
            ELEMENTS.btnLockStart.classList.replace('border-green-500/20', 'border-primary/20');
        }
    }
}

export function populateLevelSelect(levels) {
    const select = ELEMENTS.levelSelect;
    if (!select) return;

    select.innerHTML = '<option value="all">Alle Etagen anzeigen</option>';
    levels.sort((a, b) => a - b);

    levels.forEach(lvl => {
        const opt = document.createElement('option');
        opt.value = lvl;
        opt.innerText = `Level ${lvl}`;
        select.appendChild(opt);
    });
}

export function initMobileMenu() {}