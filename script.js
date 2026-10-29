// ================= CSV LOADER =================

function splitCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let level3Overlay = null;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ';' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current);
    return result.map(v => v.trim());
}

async function loadCSV(path) {
    const response = await fetch(path);
    const text = await response.text();

    const rows = text.trim().split(/\r?\n/);

    const headers = rows[0]
        .split(/;(?![^"]*")/)
        .map(h => h.trim().toLowerCase());

    return rows.slice(1).map(row => {
        const values = splitCSVLine(row)
            .map(v => v.replace(/^"|"$/g, "").trim());

        let obj = {};
        headers.forEach((h, i) => obj[h] = values[i] || "");
        return obj;
    });
}

// ================= GLOBAL =================

let DATA = {};
let eventMarkers = {};
let eventLayer;
let frontLayer;
let map;
let hoverOverlay = null;
let level3Box = null;
let hoverCloseTimer = null;

const IS_MAP_PAGE = document.getElementById("map") !== null;

// ================= EVENT COLOR =================

function getEventColor(type) {
    const t = (type || "").toLowerCase();

    if (t.includes("battle")) return "red";
    if (t.includes("siege")) return "orange";
    if (t.includes("campaign")) return "purple";
    if (t.includes("naval")) return "blue";
    if (t.includes("political")) return "green";
    if (t.includes("diplomacy")) return "black";

    return "gray";
}

// ================= UTIL =================

function prettyName(id) {
    if (!id) return "";
    return id.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function getPersonName(personId) {
    if (!personId || !DATA.persons) return prettyName(personId);

    const person = DATA.persons.find(p =>
        (p.id || "").trim().toLowerCase() === personId.trim().toLowerCase()
    );

    return person ? person.name : prettyName(personId);
}

function getPerson(personId) {
    if (!personId || !DATA.persons) return null;

    return DATA.persons.find(p =>
        (p.id || "").trim().toLowerCase() === personId.trim().toLowerCase()
    ) || null;
}

function getEntity(entityId) {
    if (!entityId || !DATA.entities) return null;

    return DATA.entities.find(e =>
        (e.id || "").trim().toLowerCase() === entityId.trim().toLowerCase()
    ) || null;
}

function getPlaceForEvent(eventObj) {
    return DATA.places.find(p =>
        (p.placeid || "").trim() === (eventObj.placeid || "").trim()
    );
}

function getReferencesForEvent(eventId) {
    if (!DATA.references) return [];
    return DATA.references.filter(r =>
        (r.eventid || "").trim() === (eventId || "").trim()
    );
}

function getContextsForEvent(eventId) {

    if (!DATA.contexts) return [];

    let result =
        DATA.contexts.filter(c =>
            (c.eventid || "").trim() ===
            (eventId || "").trim()
        );

          console.log(
        "CTX TEST:",
        eventId,
        result.length
    );

    if (result.length > 0) {
        return result;
    }

    const shortId =
        eventId.split("-").pop();

    return DATA.contexts.filter(c =>
        (c.eventid || "").trim() === shortId
    );
}

function getParticipationForEvent(eventId) {

        console.log(
        "PART TEST:",
        eventId
    );

    if (!DATA.participation) return [];
    return DATA.participation.filter(p =>
        (p.eventid || "").trim() === (eventId || "").trim()
    );
}

function openReference(eventId) {
    const refs = getReferencesForEvent(eventId);
    if (!refs.length) return;

    const url = refs[0].wikiurl || refs[0].url || "";
    if (url) openWikiModal(url);
}

function getEventKey(e) {

    if (
        e.eventid &&
        typeof e.eventid === "string" &&
        e.eventid.trim() !== ""
    ) {
        return e.eventid;
    }

    return e.uuid;
}

// ================= PERSON SEARCH =================

function findConflictsByPerson(term) {

    function normalize(str) {
        return (str || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    const searchNorm = normalize(term);

    const matchingPersons = DATA.persons.filter(p => {

        const name = normalize(p.name);
        const parts = searchNorm.split(" ").filter(x => x);

        return parts.every(part => name.includes(part));
    });

    if (!matchingPersons.length) return [];

    const personIds = new Set(matchingPersons.map(p => (p.id || "").toLowerCase()));

    const eventIds = new Set();

    DATA.participation.forEach(p => {
        if (personIds.has((p.personid || "").toLowerCase())) {
            eventIds.add((p.eventid || "").toLowerCase());
        }
    });

    const conflictIds = new Set();

    DATA.events.forEach(e => {
        if (eventIds.has((e.eventid || "").toLowerCase())) {
            conflictIds.add((e.conflictid || "").toLowerCase());
        }
    });

    return DATA.conflicts.filter(c =>
        conflictIds.has((c.uuid || "").toLowerCase())
    );
}

// ================= MAP HELPERS =================

function renderConflictList(conflicts) {

    const sidebar = document.getElementById("sidebar");
    sidebar.innerHTML = "";

    const searchInput = document.createElement("input");
    searchInput.placeholder = "Search Political Entity...";
    searchInput.style.width = "100%";
    sidebar.appendChild(searchInput);

    const personSearchInput = document.createElement("input");
    personSearchInput.placeholder = "Search Person...";
    personSearchInput.style.width = "100%";
    sidebar.appendChild(personSearchInput);

    const listContainer = document.createElement("div");
    sidebar.appendChild(listContainer);

    function renderList(data) {

        listContainer.innerHTML = "";

        const listTitle = document.createElement("div");
        listTitle.innerText = "Browse by century";
        listTitle.style.fontWeight = "bold";
        listTitle.style.margin = "10px 0";
        listContainer.appendChild(listTitle);

        const sorted = [...data].sort((a, b) =>
            parseInt(a.startyear || "0") - parseInt(b.startyear || "0")
        );

        const grouped = {};

        sorted.forEach(c => {
            const century = (c.centurytag || c.century || "").trim() || "Unknown";

            if (!grouped[century]) grouped[century] = [];
            grouped[century].push(c);
        });

        Object.keys(grouped).sort().forEach(century => {

            const header = document.createElement("div");
            header.className = "phase";

            const arrow = document.createElement("span");
            arrow.textContent = "▶ ";
            header.appendChild(arrow);

            const title = document.createElement("span");
            title.textContent = century;
            header.appendChild(title);

            listContainer.appendChild(header);

            const container = document.createElement("div");
            container.style.display = "none";
            container.style.marginLeft = "10px";
            listContainer.appendChild(container);

            let open = false;

            header.onclick = () => {
                open = !open;
                container.style.display = open ? "block" : "none";
                arrow.textContent = open ? "▼ " : "▶ ";
            };

            grouped[century].forEach(c => {

                const div = document.createElement("div");
                div.className = "event";

                div.innerHTML = `<b>${c.startyear || ""}</b> – ${c.fullname || c.uuid}`;

                div.onclick = () => {
                    window.location.href = `map.html?conflict=${c.uuid}`;
                    console.log("CLICK", c);
                };

                container.appendChild(div);
            });
        });
    }

    renderList(conflicts);

    searchInput.addEventListener("input", () => {
        const term = searchInput.value.toLowerCase().trim();
        if (!term) return renderList(DATA.conflicts);

        const filtered = findConflictsByPerson(term);
        renderList(filtered);
    });

    personSearchInput.addEventListener("input", () => {
        const term = personSearchInput.value.toLowerCase().trim();
        if (!term) return renderList(DATA.conflicts);

        renderList(findConflictsByPerson(term));
    });
}

async function safeLoad(path) {
    try {
        return await loadCSV(path);
    } catch (err) {
        console.warn("Missing or failed:", path);
        return [];
    }
}

function renderGeoLayers(conflictId) {

    if (!DATA.geoLayers) return;

    const layers = DATA.geoLayers.filter(f =>
        (f.conflictid || "").trim() === conflictId.trim()
    );

    layers.forEach(layer => {

        if (!layer.coordinates) return;

        const points = layer.coordinates
            .split("|")
            .map(p => {

                const [lat, lon] = p.split(",");

                return [
                    parseFloat(lat),
                    parseFloat(lon)
                ];
            })
            .filter(p =>
                !isNaN(p[0]) && !isNaN(p[1])
            );

        if (points.length < 2) return;

        let shape;

const styleOptions = {

    color: layer.color || "red",

    weight: parseInt(layer.weight || "4"),

    opacity: 0.85,

    smoothFactor: 1,

    dashArray:
        layer.style === "dashed"
            ? "8,6"
            : null
};

if (layer.type === "POCKET") {

    shape = L.polygon(points, {

        ...styleOptions,

        fillOpacity: 0.15

    }).addTo(frontLayer);

} else {

    shape = L.polyline(points, styleOptions)
        .addTo(frontLayer);
}

if (layer.title) {

    shape.bindTooltip(layer.title);

    shape.bindPopup(`
        <b>${layer.title}</b><br>
        ${layer.date || ""}
        <br><br>
        ${layer.notes || ""}
    `);
}
    });
}

function showConflict(conflictId) {

    eventLayer.clearLayers();
    frontLayer.clearLayers();
    eventMarkers = {};
    window.phaseLabelsShown = {};
    let bounds = [];

    const sidebar = document.getElementById("sidebar");

    const conflict = DATA.conflicts.find(c =>
        (c.uuid || "").trim() === conflictId.trim()
    );

    if (!conflict) return;
    renderGeoLayers(conflictId);

    let events = DATA.events.filter(e =>
        (e.conflictid || "").trim() === conflictId.trim()
    );

    events.sort((a, b) => {
        const phaseA = parseInt(a.phaseorder || "9999", 10);
        const phaseB = parseInt(b.phaseorder || "9999", 10);

        if (phaseA !== phaseB) return phaseA - phaseB;
        return new Date(a.eventdate) - new Date(b.eventdate);
    });

    sidebar.innerHTML = `
        <div class="sidebar-nav">
            <button class="btn btn-nav" onclick="renderConflictList(DATA.conflicts)">← Back</button>
            <button class="btn btn-nav" onclick="window.location.href='index.html'">Home</button>
            <button class="btn btn-nav" onclick="openSummary('${conflict.uuid}')">ℹ️ Summary</button>
        </div>
        <h2>${conflict.fullname || conflict.uuid}</h2>
        <hr>
    `;

    const grouped = {};

    events.forEach(e => {
        const phase = (e.phasename || "Other").trim();
        if (!grouped[phase]) grouped[phase] = [];
        grouped[phase].push(e);
    });

    Object.entries(grouped).forEach(([phaseName, phaseEvents]) => {

        const phaseDiv = document.createElement("div");
        phaseDiv.className = "phase";

        const arrow = document.createElement("span");
        arrow.textContent = "▶ ";
        phaseDiv.appendChild(arrow);

        const title = document.createElement("span");
        title.textContent = phaseName;
        phaseDiv.appendChild(title);

        sidebar.appendChild(phaseDiv);

        const container = document.createElement("div");
        container.style.display = "none";
        container.style.marginLeft = "10px";
        sidebar.appendChild(container);

        let open = false;

        phaseDiv.onclick = () => {
            open = !open;
            container.style.display = open ? "block" : "none";
            arrow.textContent = open ? "▼ " : "▶ ";
        };

        phaseEvents.forEach(e => {

                console.log(
        "EVENT CHECK:",
        e.eventid,
        e.uuid,
        e.title
    );

            const div = document.createElement("div");
            div.className = "event";

const refs = getReferencesForEvent(getEventKey(e));
const contexts = getContextsForEvent(getEventKey(e));

const hasRef = refs.length > 0;
const hasContext = contexts.length > 0;


            div.innerHTML = `
                <b>${e.eventdate}</b> – ${e.title}
                ${hasRef ? `<span class="ref-link">🔗</span>` : ""}
            `;

            div.onclick = () => {
                showEventDetail(e);
                highlightEvent(e.eventid);
            };

            div.querySelector(".ref-link")?.addEventListener("click", (ev) => {
                ev.stopPropagation();
                openReference(e.eventid);
            });

            container.appendChild(div);

            const place = getPlaceForEvent(e);
            if (!place) return;

           const lat = parseFloat(place.latitude);
const lon = parseFloat(place.longitude);

if (isNaN(lat) || isNaN(lon)) return;

// Separera händelser som har exakt samma koordinat
if (!window.coordCounter) {
    window.coordCounter = {};
}

const coordKey =
    lat.toFixed(6) + "," +
    lon.toFixed(6);

const count =
    window.coordCounter[coordKey] || 0;

window.coordCounter[coordKey] =
    count + 1;

// Sprid ut markörerna i en liten cirkel
const radiusDeg = 0.05;   // ca 15 km

const angle =
    count * (Math.PI / 4);

const displayLat =
    lat +
    Math.sin(angle) * radiusDeg;

const displayLon =
    lon +
    Math.cos(angle) * radiusDeg;

bounds.push([displayLat, displayLon]);

const marker = L.circleMarker(
    [displayLat, displayLon],
    {
        radius: 5,
        color: getEventColor(e.type),
        fillColor: getEventColor(e.type),
        fillOpacity: 0.7
    }
).addTo(eventLayer);

            marker.on("click", () => {
                showEventDetail(e);
            });

            if (!window.phaseLabelsShown) {
    window.phaseLabelsShown = {};
}

if (!window.phaseLabelsShown[e.phasename]) {

    const labelHtml = `
        

        </div>
    `;

    L.marker(
        [lat, lon],
        {
            icon: L.divIcon({
                className: 'phase-label',
                html: labelHtml
            })
        }
    ).addTo(frontLayer);

    window.phaseLabelsShown[e.phasename] = true;
}

            eventMarkers[e.eventid] = marker;
        });
    });

    if (bounds.length > 0) {

        let normalBounds = L.latLngBounds(bounds);

        let shifted = bounds.map(([lat, lon]) => {
            return [lat, lon < 0 ? lon + 360 : lon];
        });

        let shiftedBounds = L.latLngBounds(shifted);

        const normalWidth = normalBounds.getEast() - normalBounds.getWest();
        const shiftedWidth = shiftedBounds.getEast() - shiftedBounds.getWest();

        if (shiftedWidth < normalWidth) {
            map.fitBounds(shiftedBounds, {
                padding: [40, 40],
                maxZoom: 4
            });
        } else {
            map.fitBounds(normalBounds, {
                padding: [40, 40],
                maxZoom: 4
            });
        }
    }
}

function showEventDetail(e) {

    const detail = document.getElementById("eventDetail");
    const content = document.getElementById("eventDetailContent");

    if (!detail || !content) return;

    const participation = getParticipationForEvent(e.eventid);

    let participantsHTML = "";

    if (participation.length > 0) {

        const grouped = {};

        participation.forEach(p => {

            const entity = getEntity(p.politicalentityid);
            const entityName = entity ? entity.name : prettyName(p.politicalentityid);

            if (!grouped[entityName]) grouped[entityName] = [];

            grouped[entityName].push(p);
        });

        participantsHTML += "<h4>Participants</h4>";

        Object.keys(grouped).forEach(entityName => {

            participantsHTML += `<b>${entityName}</b><br>`;

            grouped[entityName].forEach(p => {
                const personName = getPersonName(p.personid);
                const role = p.role ? ` (${p.role})` : "";
                participantsHTML += `- <span class="person-link" data-person="${p.personid}" style="cursor:pointer; text-decoration:underline;">${personName}</span>${role}<br>`;
            });

        });
    }

    content.innerHTML = `
        <h3>${e.title || ""}</h3>
        <p><b>Date:</b> ${e.eventdate || ""}</p>
        ${e.type ? `<p><b>Type:</b> ${e.type}</p>` : ""}
        ${e.summary ? `<p><b>Summary:</b> ${e.summary}</p>` : ""}
        ${e.outcome ? `<p><b>Outcome:</b> ${e.outcome}</p>` : ""}
        ${e.historicalsignificance ? `<p><b>Significance:</b> ${e.historicalsignificance}</p>` : ""}
        ${participantsHTML}

   ${getContextsForEvent(getEventKey(e)).length > 0 ?
    `<p>
        <button class="context-btn" onclick="showHistoricalContext('${getEventKey(e)}')">
            📜 Context
        </button>
    </p>`
    : ""}

${getReferencesForEvent(getEventKey(e)).length > 0 ?
    `<p><button onclick="openReference('${getEventKey(e)}')">🔗 Source</button></p>`
    : ""}
    `;

    content.querySelectorAll(".person-link").forEach(el => {
        el.onclick = () => {
            const personId = el.getAttribute("data-person");
            showPersonDetail(personId);
        };
    });

    detail.style.display = "block";
}

function highlightEvent(eventId) {

    if (!eventMarkers[eventId]) return;

    Object.values(eventMarkers).forEach(m => {
        m.setStyle({
            radius: 5,
            fillOpacity: 0.7
        });
    });

    const marker = eventMarkers[eventId];

    marker.setStyle({
        radius: 8,
        fillOpacity: 1
    });

    const latlng = marker.getLatLng();
    map.setView(latlng, Math.max(map.getZoom(), 6), {
        animate: true
    });
}

function closeEventDetail() {

    const detail = document.getElementById("eventDetail");
    if (!detail) return;

    detail.style.display = "none";
}

function showPersonDetail(personId) {

    const person = getPerson(personId);
    if (!person) return;

    const detail = document.getElementById("eventDetail");
    const content = document.getElementById("eventDetailContent");

    const participations = DATA.participation.filter(p =>
        (p.personid || "").trim().toLowerCase() === personId.trim().toLowerCase()
    );

    const eventIds = new Set(
        participations.map(p => (p.eventid || "").trim())
    );

    const events = DATA.events.filter(e =>
        eventIds.has((e.eventid || "").trim())
    );

    events.sort((a, b) =>
        new Date(a.eventdate) - new Date(b.eventdate)
    );

    let eventsHTML = "";

    if (events.length > 0) {

        eventsHTML += "<h4>Events</h4>";

        events.forEach(e => {

            eventsHTML += `
                <div class="person-event-link"
                     data-event="${e.eventid}"
                     style="cursor:pointer;
                            text-decoration:underline;
                            margin-bottom:4px;">
                    ${e.eventdate} – ${e.title}
                </div>
            `;
        });
    }

    content.innerHTML = `
        <h3>${person.name}</h3>

        ${person.birthyear ? `<p><b>Born:</b> ${person.birthyear}</p>` : ""}

        ${person.deathyear ? `<p><b>Died:</b> ${person.deathyear}</p>` : ""}

        ${person.nationality ? `<p><b>Nationality:</b> ${person.nationality}</p>` : ""}

        ${person.description ? `<p>${person.description}</p>` : ""}

        ${person.wikiurl ? `
            <p>
                <span class="ref-link person-wiki-link"
                      data-url="${person.wikiurl}">
                    🔗 Wikipedia
                </span>
            </p>
        ` : ""}

        ${eventsHTML}
    `;

    // EVENT LINKS

    content.querySelectorAll(".person-event-link").forEach(el => {

        el.onclick = () => {

            const eventId = el.getAttribute("data-event");

            const eventObj = DATA.events.find(e =>
                e.eventid === eventId
            );

            if (!eventObj) return;

            showEventDetail(eventObj);

            highlightEvent(eventId);
        };
    });

    // WIKI LINKS

    content.querySelectorAll(".person-wiki-link").forEach(el => {

        el.onclick = () => {

            const url = el.getAttribute("data-url");

            if (!url) return;

            openWikiModal(url);
        };
    });

    detail.style.display = "block";
}

function showHistoricalContext(eventId) {

    const contexts = getContextsForEvent(eventId);
    if (!contexts.length) return;

    const detail = document.getElementById("eventDetail");
    const content = document.getElementById("eventDetailContent");

    let html = "<h3>Historical Context</h3>";

    contexts.forEach(c => {
        html += `<p>${c.text}</p>`;
        if (c.source) {
            html += `<p style="font-size:12px;color:gray;">Source: ${c.source}</p>`;
        }
    });

    content.innerHTML = html;
    detail.style.display = "block";
}

function openSummary(conflictId) {

    const conflict = DATA.conflicts.find(c =>
        (c.uuid || "").trim() === conflictId.trim()
    );

    if (!conflict) return;

    const detail = document.getElementById("eventDetail");
    const content = document.getElementById("eventDetailContent");

    content.innerHTML = `
        <h3>${conflict.fullname || conflict.uuid}</h3>
        ${conflict.summary ? `<p>${conflict.summary}</p>` : ""}
        ${conflict.comment ? `<p><i>${conflict.comment}</i></p>` : ""}
        <p style="color:gray;">
            ${conflict.startyear} – ${conflict.endyear}, ${conflict.theatretag}
        </p>
    `;

    detail.style.display = "block";
}

// ================= SEARCH MATRIX HOVER =================

function cancelHoverClose() {
    if (hoverCloseTimer) {
        clearTimeout(hoverCloseTimer);
        hoverCloseTimer = null;
    }
}

function scheduleHoverClose() {
    cancelHoverClose();

    hoverCloseTimer = setTimeout(() => {
        const overLevel2 = hoverOverlay && hoverOverlay.matches(":hover");
        const overLevel3 = level3Box && level3Box.matches(":hover");

        if (!overLevel2 && !overLevel3) {
            hideLevel3();
            hideHover();
        }
    }, 300);
}

function showLevel3(conflicts, anchorEl) {

    cancelHoverClose();

    if (level3Box) {
        level3Box.remove();
        level3Box = null;
    }

    if (!conflicts || conflicts.length === 0) return;

    const box = document.createElement("div");
    box.className = "hover-level3";

    box.style.position = "fixed";
    box.style.background = "white";
    box.style.border = "1px solid #aaa";
    box.style.padding = "8px";
    box.style.borderRadius = "6px";
    box.style.boxShadow = "0 4px 14px rgba(0,0,0,0.25)";
    box.style.zIndex = 3000;
    box.style.minWidth = "240px";
    box.style.maxHeight = "320px";
    box.style.overflowY = "auto";
    box.style.fontSize = "14px";

    const sorted = [...conflicts].sort((a, b) =>
        parseInt(a.startyear || "0") - parseInt(b.startyear || "0")
    );

    sorted.forEach(c => {
        const row = document.createElement("div");
        row.style.padding = "5px 8px";
        row.style.cursor = "pointer";
        row.style.borderBottom = "1px solid #eee";

        row.innerHTML = `<b>${c.startyear || ""}</b> – ${c.shortname || c.fullname || c.uuid}`;

        row.onmouseenter = () => {
            row.style.background = "#f0f0f0";
        };

        row.onmouseleave = () => {
            row.style.background = "white";
        };

        row.onclick = () => {
            window.location.href = `map.html?conflict=${c.uuid}`;
        };

        box.appendChild(row);
    });

    box.addEventListener("mouseenter", cancelHoverClose);
    box.addEventListener("mouseleave", scheduleHoverClose);

    document.body.appendChild(box);

    const rect = anchorEl.getBoundingClientRect();

    box.style.left = `${rect.right + 8}px`;
    box.style.top = `${rect.top}px`;

    level3Box = box;
}

function hideLevel3() {
    if (level3Box) {
        level3Box.remove();
        level3Box = null;
    }
}

function showHoverLevel2(epoch, theatre, anchorEl) {

    cancelHoverClose();

    if (hoverOverlay) {
        hoverOverlay.remove();
        hoverOverlay = null;
    }

    hideLevel3();

    const zoomed = DATA.conflicts.filter(c =>
        epochName(c.startyear) === epoch &&
        mainTheatreOf(c) === theatre
    );

    const periods = periodsForEpoch(epoch);
    const subTheatres = uniqueSubTheatres(zoomed);

    hoverOverlay = document.createElement("div");
    hoverOverlay.className = "hover-overlay";

    hoverOverlay.addEventListener("mouseenter", () => {
    cancelHoverClose();
});

    hoverOverlay.addEventListener("mouseleave", () => {
    scheduleHoverClose();
});

    hoverOverlay.addEventListener("mouseenter", cancelHoverClose);
    hoverOverlay.addEventListener("mouseleave", scheduleHoverClose);

    const grid = document.createElement("div");
    grid.className = "matrix";
    grid.style.gridTemplateColumns = `180px repeat(${periods.length}, 1fr)`;

    grid.appendChild(makeDiv("header", "Theatre"));
    periods.forEach(p => grid.appendChild(makeDiv("header", formatPeriodLabel(epoch, p))));

    subTheatres.forEach(st => {
        grid.appendChild(makeDiv("row-label", st));

        periods.forEach(period => {
            const matches = zoomed.filter(c =>
                (c.theatretag || "").trim() === st &&
                periodOf(epoch, c.startyear) === period
            );

            const cell = document.createElement("div");
            cell.className = matches.length > 0 ? "cell" : "cell empty";

            if (matches.length > 0) {
                cell.innerHTML = `<strong>${matches.length}</strong>`;

                cell.addEventListener("mouseenter", () => {
                    cancelHoverClose();
                    showLevel3(matches, cell);
                });
            }

            grid.appendChild(cell);
        });
    });

    hoverOverlay.appendChild(grid);
    document.body.appendChild(hoverOverlay);

    const overlayWidth = 900;
    const left = Math.max(
        20,
        Math.min(
            window.innerWidth - overlayWidth - 20,
            (window.innerWidth - overlayWidth) / 2
        )
    );

    const rect = anchorEl.getBoundingClientRect();

    hoverOverlay.style.position = "absolute";
    hoverOverlay.style.width = `${overlayWidth}px`;
    hoverOverlay.style.top = `${rect.bottom + window.scrollY - 2}px`;
    hoverOverlay.style.left = `${rect.left + window.scrollX}px`;
}

function hideHover() {
  if (hoverOverlay) {
    hoverOverlay.remove();
    hoverOverlay = null;
  }

  if (level3Overlay) {
    level3Overlay.remove();
    level3Overlay = null;
  }
}

// ================= INIT =================

async function init() {

    DATA.conflicts = await safeLoad("CSV/Conflict.csv");
    DATA.events = await safeLoad("CSV/ConflictEvent.csv");
    DATA.places = await safeLoad("CSV/GeoPlace.csv");
    DATA.participation = await safeLoad("CSV/Participation.csv");
    DATA.persons = await safeLoad("CSV/Person.csv");
    DATA.entities = await safeLoad("CSV/PoliticalEntity.csv");
    DATA.contexts = await safeLoad("CSV/HistoricalContext.csv");
    DATA.references = await safeLoad("CSV/ExternalReference.csv");
    DATA.geoLayers = await safeLoad("CSV/GeoLayers.csv");

    const params = new URLSearchParams(window.location.search);
    const conflictId = params.get("conflict");

    if (IS_MAP_PAGE) {

        map = L.map('map').setView([55, 15], 4);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        eventLayer = L.layerGroup().addTo(map);
        frontLayer = L.layerGroup().addTo(map);

        if (conflictId) {
            showConflict(conflictId);
        } else {
            renderConflictList(DATA.conflicts);
        }
    }
}

// ================= START =================

init();