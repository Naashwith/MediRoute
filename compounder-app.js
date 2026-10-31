(function () {
    'use strict';

    var $ = function (selector, root) {
        return (root || document).querySelector(selector);
    };

    var $$ = function (selector, root) {
        return Array.from((root || document).querySelectorAll(selector));
    };

    var state = {
        user: null,
        status: 'available',
        trips: 0,
        request: null,
        patient: null,
        hospital: null,
        hospitals: [],
        notifiedAt: null
    };

    var demoUser = {
        name: 'Demo Crew',
        crewId: 'demo',
        phone: '',
        email: '',
        unit: 'TN-09-AMB-114',
        role: 'Compounder',
        password: 'demo123'
    };

    var users = [demoUser];
    var shiftStarted = false;
    var leg = {
        key: '',
        p: 0,
        timer: null,
        arrived: false,
        minutes: 0,
        km: 0,
        from: '',
        to: '',
        token: 0,
        route: null,
        cum: null,
        t0: 0,
        duration: 0
    };

    /* The single road the ambulance drives along on every map.
       Start (green dot) -> corners -> destination (red square). */
    var ROUTE = [
        [50, 230],
        [130, 230],
        [130, 70],
        [470, 70],
        [470, 150]
    ];

    function stamp() {
        return new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function log(message) {
        var li = document.createElement('li');
        li.textContent = stamp() + ' \u2014 ' + message;
        $('#log').prepend(li);
    }

    function show(id) {
        ['auth', 'dash', 'trip'].forEach(function (name) {
            $('#' + name).hidden = name !== id;
        });

        window.scrollTo(0, 0);
        refreshMapSizes();
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setBanner(text) {
        var banner = $('#banner');
        banner.textContent = text || '';
        banner.classList.toggle('empty', !text);
    }

    function setMainAction(text, enabled) {
        $('#mainAction').textContent = text;
        $('#mainAction').disabled = !enabled;
    }

    function resetTripUI() {
        $('#informChip').hidden = true;
        $('#informChip').textContent = '';
        $('#noticeBox').hidden = true;
        $('#noticeBox').open = false;
        $('#noticeText').textContent = '';
        $('#progFill').style.width = '0%';
        setBanner('');
    }

    function setStatus(status, writeLog) {
        state.status = status;

        $$('#statusSet .st').forEach(function (button) {
            button.classList.toggle('on', button.dataset.s === status);
        });

        var labels = {
            available: 'Available',
            break: 'On break',
            offline: 'Off duty',
            busy: 'On assignment'
        };

        $('#barStatus').textContent = labels[status] || status;
        $('#barStatus').className = 'pill';

        if (status === 'busy') {
            $('#barStatus').classList.add('hot');
        } else if (status === 'break') {
            $('#barStatus').classList.add('warn');
        } else if (status === 'offline') {
            $('#barStatus').classList.add('off');
        }

        $('#waitLine').className = 'waiting';

        if (status === 'break') {
            $('#waitLine').textContent = 'You are on break.';
            $('#waitLine').classList.add('paused');
        } else if (status === 'offline') {
            $('#waitLine').textContent = 'You are off duty.';
            $('#waitLine').classList.add('stopped');
        } else if (status === 'busy') {
            $('#waitLine').textContent = 'You are handling an emergency assignment.';
        } else {
            $('#waitLine').textContent = 'Waiting for the next request from dispatch.';
        }

        if (writeLog) {
            log('Status changed to ' + (labels[status] || status));
        }
    }

    function openSheet(id) {
        $('#sheetBack').hidden = false;
        $('#' + id).hidden = false;
        refreshMapSizes();
    }

    function closeSheets() {
        $('#sheetBack').hidden = true;
        $('#intakeSheet').hidden = true;
        $('#hospitalSheet').hidden = true;
    }

    function factRows(dl, rows) {
        dl.innerHTML = '';

        rows.forEach(function (row) {
            var div = document.createElement('div');
            var dt = document.createElement('dt');
            var dd = document.createElement('dd');

            dt.textContent = row[0];
            dd.textContent = row[1];

            div.appendChild(dt);
            div.appendChild(dd);
            dl.appendChild(div);
        });
    }

    /* Returns the x/y point that lies `fraction` (0 to 1) of the way
       along the ROUTE polyline, measured by real road length. */
    function routePoint(fraction) {
        var f = Math.max(0, Math.min(1, Number(fraction) || 0));
        var lengths = [];
        var total = 0;
        var i;

        for (i = 1; i < ROUTE.length; i++) {
            var dx = ROUTE[i][0] - ROUTE[i - 1][0];
            var dy = ROUTE[i][1] - ROUTE[i - 1][1];
            var len = Math.sqrt(dx * dx + dy * dy);
            lengths.push(len);
            total += len;
        }

        var target = f * total;

        for (i = 0; i < lengths.length; i++) {
            if (target <= lengths[i] || i === lengths.length - 1) {
                var a = ROUTE[i];
                var b = ROUTE[i + 1];
                var t = lengths[i] === 0 ? 0 : Math.min(1, target / lengths[i]);

                return {
                    x: a[0] + (b[0] - a[0]) * t,
                    y: a[1] + (b[1] - a[1]) * t
                };
            }

            target -= lengths[i];
        }

        return {
            x: ROUTE[ROUTE.length - 1][0],
            y: ROUTE[ROUTE.length - 1][1]
        };
    }

    /* progress is a fraction from 0 (start) to 1 (arrived). */
    function routeSVG(fromLabel, toLabel, progress) {
        var point = routePoint(progress);

        return '<svg viewBox="0 0 600 300" role="img" aria-label="Illustrative route">' +
            '<rect width="600" height="300" fill="#edf3f6"/>' +
            '<g stroke="#d7e1e9" stroke-width="20" fill="none">' +
            '<path d="M-20 70 L620 70"/>' +
            '<path d="M-20 230 L620 230"/>' +
            '<path d="M130 -20 L130 320"/>' +
            '<path d="M470 -20 L470 320"/>' +
            '</g>' +
            '<path d="M50 230 L130 230 L130 70 L470 70 L470 150" fill="none" stroke="#9aabb8" stroke-width="6" stroke-dasharray="3 9"/>' +
            '<path d="M50 230 L130 230 L130 70 L470 70 L470 150" fill="none" stroke="#176b87" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<circle cx="50" cy="230" r="9" fill="#16845b"/>' +
            '<rect x="460" y="140" width="20" height="20" rx="3" fill="#c83e4d"/>' +
            '<circle cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="9" fill="#ffffff" stroke="#176b87" stroke-width="4"/>' +
            '<text x="45" y="260" font-size="14" fill="#172b3a">' + escapeHtml(fromLabel) + '</text>' +
            '<text x="470" y="125" text-anchor="middle" font-size="14" fill="#172b3a">' + escapeHtml(toLabel) + '</text>' +
            '</svg>';
    }

    /* ---------- Geo helpers ---------- */

    /* Default map viewport only; actual ambulance and patient pins come from the two devices. */
    var DEFAULT_MAP_CENTER = { lat: 13.0732, lng: 80.2609 };
    var tileWarned = false;

    /* OpenStreetMap's own tile server. Its usage policy needs a real web
       address (http://localhost or https), so it refuses pages opened as a file.
       To use another OSM-based tile provider, change these two lines only. */
    var TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    var TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

    function haversineKm(a, b) {
        var r = Math.PI / 180;
        var dLat = (b.lat - a.lat) * r;
        var dLng = (b.lng - a.lng) * r;
        var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * r) * Math.cos(b.lat * r) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);

        return 2 * 6371 * Math.asin(Math.sqrt(h));
    }

    /* Straight line x 1.3 as a road factor, at an urban ambulance speed. */
    function estimate(a, b) {
        var km = haversineKm(a, b) * 1.3;
        return { km: km, minutes: Math.max(1, Math.round(km / 35 * 60)) };
    }

    function pathPrep(coords) {
        var cum = [0];
        var i;

        for (i = 1; i < coords.length; i++) {
            cum.push(cum[i - 1] + haversineKm(
                { lat: coords[i - 1][0], lng: coords[i - 1][1] },
                { lat: coords[i][0], lng: coords[i][1] }
            ));
        }

        return cum;
    }

    /* [lat, lng] lying `f` (0 to 1) of the way along the road path. */
    function pointAt(coords, cum, f) {
        var target = Math.max(0, Math.min(1, f)) * cum[cum.length - 1];
        var i = 1;

        while (i < cum.length - 1 && cum[i] < target) {
            i++;
        }

        var seg = cum[i] - cum[i - 1];
        var t = seg === 0 ? 0 : Math.max(0, Math.min(1, (target - cum[i - 1]) / seg));

        return [
            coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
            coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t
        ];
    }

    /* ---------- Road routing (OSRM public demo server) ---------- */

    var routeCache = {};

    /* Always resolves. Falls back to a straight dashed line when the
       routing service is unreachable, so a trip can never get stuck. */
    function fetchRoute(from, to) {
        var key = [from.lat, from.lng, to.lat, to.lng].map(function (n) {
            return n.toFixed(5);
        }).join(',');

        if (routeCache[key]) {
            return Promise.resolve(routeCache[key]);
        }

        function fallback() {
            var e = estimate(from, to);

            return {
                coords: [[from.lat, from.lng], [to.lat, to.lng]],
                km: e.km,
                minutes: e.minutes,
                approx: true
            };
        }

        if (!window.fetch) {
            return Promise.resolve(fallback());
        }

        var ctl = window.AbortController ? new AbortController() : null;
        var timer = setTimeout(function () {
            if (ctl) {
                ctl.abort();
            }
        }, 7000);

        var url = 'https://router.project-osrm.org/route/v1/driving/' +
            from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat +
            '?overview=full&geometries=geojson';

        return fetch(url, ctl ? { signal: ctl.signal } : {})
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }

                return response.json();
            })
            .then(function (data) {
                var found = data && data.routes && data.routes[0];

                if (!found || !found.geometry || found.geometry.coordinates.length < 2) {
                    throw new Error('No route');
                }

                var result = {
                    coords: found.geometry.coordinates.map(function (c) {
                        return [c[1], c[0]];
                    }),
                    km: found.distance / 1000,
                    minutes: Math.max(1, Math.round(found.duration / 60)),
                    approx: false
                };

                routeCache[key] = result;
                return result;
            })
            .catch(fallback)
            .then(function (result) {
                clearTimeout(timer);
                return result;
            });
    }

    /* ---------- GPS tracking ---------- */

    /* One continuous watch. states: off, searching, live, blocked.
       The last fix is kept so a short signal drop shows its age instead
       of silently freezing, and it is dropped completely when tracking stops. */
    var gps = { id: null, fix: null, state: 'off', msg: '', tick: null };
    var GPS_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 };

    function gpsText() {
        var fix = gps.fix;

        if (gps.state === 'off') {
            return { loc: 'Location not enabled.', line: 'GPS off, using simulated position.' };
        }

        if (gps.state === 'blocked') {
            return { loc: gps.msg, line: 'GPS unavailable.' };
        }

        if (!fix) {
            return { loc: gps.msg, line: gps.msg };
        }

        var age = Math.max(0, Math.round((Date.now() - fix.time) / 1000));
        var acc = 'accuracy ' + Math.round(fix.accuracy) + ' m';
        var coords = fix.lat.toFixed(5) + ', ' + fix.lng.toFixed(5);

        if (age > 30) {
            return {
                loc: coords + ' (last update ' + age + ' s ago)',
                line: 'GPS signal lost, last fix ' + age + ' s ago.'
            };
        }

        return {
            loc: coords + ' (' + acc + ')',
            line: (fix.accuracy > 100 ? 'GPS weak, ' : 'GPS live, ') + acc + '.'
        };
    }

    function renderGps() {
        var text = gpsText();
        var idle = gps.state === 'off' || gps.state === 'blocked';

        $('#locState').textContent = text.loc;
        $('#gpsLine').textContent = text.line;
        $('#locBtn').textContent = idle ? 'Enable location' : 'Turn off location';
    }

    function stopGps(announce) {
        if (gps.id !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(gps.id);
        }

        if (gps.tick) {
            clearInterval(gps.tick);
        }

        var wasOn = gps.id !== null;

        gps.id = null;
        gps.tick = null;
        gps.fix = null;
        gps.state = 'off';
        gps.msg = '';

        drawDevice();
        renderGps();

        if (announce && wasOn) {
            log('Device location turned off');
        }
    }

    function onGpsFix(position) {
        var c = position.coords;

        if (!isFinite(c.latitude) || !isFinite(c.longitude)) {
            return;
        }

        var first = !gps.fix;

        gps.fix = {
            lat: c.latitude,
            lng: c.longitude,
            accuracy: isFinite(c.accuracy) ? c.accuracy : 0,
            time: Date.now()
        };
        gps.state = 'live';

        if (first) {
            log('Device location enabled');
        }

        renderGps();
        drawDevice();
        updateTripFromGps();
    }
    function updateTripFromGps() {
        if (!state.request || !leg.end || !gps.fix) {
            return;
        }

        var current = {
            lat: gps.fix.lat,
            lng: gps.fix.lng
        };

        // Update the ambulance marker using actual device GPS.
        if (views.mapMain && views.mapMain.amb) {
            views.mapMain.amb.setLatLng([current.lat, current.lng]);
        }

        // Calculate the remaining distance from the actual GPS position.
        var remainingKm = haversineKm(current, leg.end);

        $('#distMain').textContent = remainingKm.toFixed(2);
        $('#etaMain').textContent = Math.ceil((remainingKm / 30) * 60);

        // Send the actual GPS position to the shared dispatch server.
        publishAmbulancePosition(current);

        // Report arrival only when GPS is within 30 metres of destination.
        if (remainingKm <= 0.03 && !leg.arrived) {
            arriveLeg();
        }
    }

    function onGpsError(error) {
        if (error.code === 1) {
            stopGps(false);
            gps.state = 'blocked';
            gps.msg = 'Location permission denied. Allow it in the browser site settings, then try again.';
            renderGps();
            log('Location permission denied');
            return;
        }

        /* Signal lost or timed out: the watch keeps retrying by itself. */
        gps.msg = error.code === 3 ? 'GPS timed out, still trying.' : 'GPS signal unavailable, still trying.';
        renderGps();
    }

    function startGps() {
        if (gps.id !== null) {
            return;
        }

        if (!navigator.geolocation) {
            gps.state = 'blocked';
            gps.msg = 'Geolocation is not supported by this browser.';
            renderGps();
            return;
        }

        if (window.isSecureContext === false) {
            gps.state = 'blocked';
            gps.msg = 'Location needs a secure page (https or localhost).';
            renderGps();
            return;
        }

        gps.state = 'searching';
        gps.msg = 'Searching for GPS signal...';
        gps.id = navigator.geolocation.watchPosition(onGpsFix, onGpsError, GPS_OPTIONS);
        gps.tick = setInterval(renderGps, 1000);
        renderGps();
    }

    var FIX_WAIT_MS = 15000;

    function hospitalPoint(hospital) {
        return { lat: Number(hospital.lat), lng: Number(hospital.lng) };
    }

    /* Resolves with the current fix, or null if GPS is blocked, off or too slow. */
    function waitForFix(ms) {
        return new Promise(function (resolve) {
            var began = Date.now();

            (function poll() {
                if (gps.fix) {
                    resolve(gps.fix);
                } else if (gps.state === 'blocked' || gps.state === 'off' || Date.now() - began >= ms) {
                    resolve(null);
                } else {
                    setTimeout(poll, 200);
                }
            })();
        });
    }

    /* ---------- OpenStreetMap views (Leaflet) ---------- */

    var views = {};
    var leafletWarned = false;

    function canMap() {
        return !!(window.L && typeof window.L.map === 'function' && (!window.__leafletReady || window.__leafletCssReady === true));
    }

    function waitForLeaflet() {
        if (canMap()) {
            return Promise.resolve(true);
        }

        if (window.__leafletReady && typeof window.__leafletReady.then === 'function') {
            return window.__leafletReady.then(function () {
                return canMap();
            });
        }

        return Promise.resolve(false);
    }

    function refreshMapSizes() {
        var refresh = function () {
            Object.keys(views).forEach(function (id) {
                var view = views[id];
                var element = $('#' + id);
                if (view && element && element.offsetWidth && element.offsetHeight) {
                    view.map.invalidateSize({ pan: false });
                }
            });
        };

        if (window.requestAnimationFrame) {
            window.requestAnimationFrame(function () {
                refresh();
                window.setTimeout(refresh, 100);
            });
        } else {
            window.setTimeout(refresh, 100);
        }
    }

    function renderRoute(id, route, from, to, fraction) {
        var element = $('#' + id);
        if (!element) {
            return false;
        }

        if (canMap() && drawRoute(id, route, from, to, fraction)) {
            return true;
        }

        /* Keep the trip usable even when a CDN or map provider is unavailable. */
        element.innerHTML = routeSVG(from, to, fraction);
        return false;
    }

    function markerIcon(cls) {
        return L.divIcon({
            className: '',
            html: '<span class="mk ' + cls + '"></span>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        });
    }

    function getView(id) {
        if (!canMap()) {
            return null;
        }

        if (views[id]) {
            return views[id];
        }

        var el = $('#' + id);
        if (!el || !el.offsetWidth || !el.offsetHeight) {
            return null;
        }

        var map = null;
        try {
            el.innerHTML = '';

            /* Disable wheel zoom so page scrolling over the map stays natural. */
            map = L.map(el, {
                scrollWheelZoom: false,
                zoomControl: true,
                preferCanvas: true,
                minZoom: 3,
                maxZoom: 19
            }).setView([DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng], 12);

            var tiles = L.tileLayer(TILE_URL, {
                minZoom: 3,
                maxZoom: 19,
                attribution: TILE_ATTRIBUTION,
                referrerPolicy: 'strict-origin-when-cross-origin',
                updateWhenIdle: true,
                keepBuffer: 2
            }).addTo(map);

            tiles.on('tileerror', function () {
                if (!tileWarned) {
                    tileWarned = true;
                    log(location.protocol === 'file:' ?
                        'Map tiles cannot load from a file:// page. Run this project through http://localhost using Live Server.' :
                        'OpenStreetMap tiles could not load. Check connectivity or the tile service; the trip route will remain available.');
                }
            });

            views[id] = {
                map: map,
                tiles: tiles,
                layer: L.layerGroup().addTo(map),
                amb: null,
                dev: null,
                acc: null
            };

            map.whenReady(function () {
                if (el.offsetWidth && el.offsetHeight) {
                    map.invalidateSize({ pan: false });
                }
            });

            drawDevice();
            return views[id];
        } catch (error) {
            if (map) {
                try { map.remove(); } catch (ignore) {}
            }
            log('Leaflet could not initialise this map: ' + (error && error.message ? error.message : 'unknown error'));
            return null;
        }
    }

    /* Draws the road path, both end markers and the ambulance at fraction f.
       Skipped while the container is hidden (Leaflet cannot size it). */
    function drawRoute(id, route, from, to, f) {
        var v = getView(id);
        var el = $('#' + id);

        if (!v || !el || !el.offsetWidth || !el.offsetHeight || !route || !route.coords || route.coords.length < 2) {
            return false;
        }

        try {
            v.map.invalidateSize({ pan: false });
            v.layer.clearLayers();

            var line = L.polyline(route.coords, {
                color: '#176b87',
                weight: 5,
                opacity: 0.95,
                dashArray: route.approx ? '3 9' : null,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(v.layer);

            L.marker(route.coords[0], { icon: markerIcon('mk-start'), keyboard: false })
                .bindTooltip(escapeHtml(from), { permanent: true, direction: 'bottom', offset: [0, 8] })
                .addTo(v.layer);

            L.marker(route.coords[route.coords.length - 1], { icon: markerIcon('mk-end'), keyboard: false })
                .bindTooltip(escapeHtml(to), { permanent: true, direction: 'top', offset: [0, -8] })
                .addTo(v.layer);

            v.amb = L.marker(pointAt(route.coords, pathPrep(route.coords), f), {
                icon: markerIcon('mk-amb'),
                keyboard: false,
                zIndexOffset: 500
            }).addTo(v.layer);

            var bounds = line.getBounds();
            var settle = function () {
                if (!el.offsetWidth || !el.offsetHeight) {
                    return;
                }
                v.map.invalidateSize({ pan: false });
                v.map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
                if (v.map.getZoom() < 8) {
                    v.map.setView(bounds.getCenter(), 13);
                }
            };

            /* Wait for the browser to lay out a just-shown screen/sheet. */
            if (window.requestAnimationFrame) {
                window.requestAnimationFrame(function () { window.setTimeout(settle, 50); });
            } else {
                window.setTimeout(settle, 80);
            }

            return true;
        } catch (error) {
            if (views[id]) {
                try { views[id].map.remove(); } catch (ignore) {}
                delete views[id];
            }
            log('The route could not be drawn on Leaflet: ' + (error && error.message ? error.message : 'unknown error'));
            return false;
        }
    }

    function drawDevice() {
        if (!canMap()) {
            return;
        }

        Object.keys(views).forEach(function (id) {
            var v = views[id];

            if (!gps.fix) {
                if (v.dev) {
                    v.map.removeLayer(v.dev);
                    v.map.removeLayer(v.acc);
                    v.dev = null;
                    v.acc = null;
                }

                return;
            }

            var at = [gps.fix.lat, gps.fix.lng];

            if (!v.dev) {
                v.acc = L.circle(at, {
                    radius: gps.fix.accuracy,
                    color: '#2f7fc1',
                    weight: 1,
                    fillOpacity: 0.12,
                    interactive: false
                }).addTo(v.map);
                v.dev = L.marker(at, { icon: markerIcon('mk-dev'), interactive: false, keyboard: false }).addTo(v.map);
            } else {
                v.acc.setLatLng(at);
                v.acc.setRadius(gps.fix.accuracy);
                v.dev.setLatLng(at);
            }
        });
    }

    function clearViews() {
        Object.keys(views).forEach(function (id) {
            views[id].layer.clearLayers();
            views[id].amb = null;
        });
    }

    /* ---------- Sign in / account ---------- */

    function showTab(which) {
        var login = which === 'login';

        $('#loginForm').hidden = !login;
        $('#signupForm').hidden = login;
        $('#tabLogin').classList.toggle('on', login);
        $('#tabSignup').classList.toggle('on', !login);
        $('#loginMsg').textContent = '';
        $('#loginMsg').className = 'msg';
        $('#signupMsg').textContent = '';
        $('#signupMsg').className = 'msg';
    }

    function login(user) {
        state.user = user;

        $('#bar').hidden = false;
        $('#barName').textContent = user.name;
        $('#barUnit').textContent = user.unit;

        $('#factUnit').textContent = user.unit;
        $('#factRole').textContent = user.role;
        $('#tripCount').textContent = state.trips;

        if (!shiftStarted) {
            $('#shiftStart').textContent = stamp();
            shiftStarted = true;
        }

        setStatus('available', false);
        log(user.name + ' signed in');
        show('dash');
        if (window.MediRouteDispatch) {
            window.MediRouteDispatch.getCurrent().then(function (dispatch) {
                if (dispatch) handleSharedDispatch({ type: 'login-refresh', dispatch: dispatch });
            }).catch(function (error) {
                $('#dispatchInboxHint').textContent = 'Dispatch server unavailable: ' + error.message;
            });
        }
    }

    $('#tabLogin').onclick = function () {
        showTab('login');
    };

    $('#tabSignup').onclick = function () {
        showTab('signup');
    };

    $('#loginForm').addEventListener('submit', function (event) {
        event.preventDefault();

        var form = event.target;
        var id = form.elements.id.value.trim().toLowerCase();
        var password = form.elements.password.value;

        var user = users.find(function (item) {
            return (
                item.crewId.toLowerCase() === id ||
                (item.email && item.email.toLowerCase() === id)
            ) && item.password === password;
        });

        if (!user) {
            $('#loginMsg').className = 'msg';
            $('#loginMsg').textContent = 'Invalid crew ID/email or password.';
            return;
        }

        $('#loginMsg').textContent = '';
        form.reset();
        login(user);
    });

    $('#signupForm').addEventListener('submit', function (event) {
        event.preventDefault();

        var form = event.target;
        var name = form.elements.name.value.trim();
        var crewId = form.elements.crewId.value.trim();
        var phone = form.elements.phone.value.trim();
        var email = form.elements.email.value.trim();
        var unit = form.elements.unit.value.trim();
        var password = form.elements.password.value;
        var confirm = form.elements.confirm.value;

        $('#signupMsg').className = 'msg';

        if (!name || !crewId || !unit) {
            $('#signupMsg').textContent = 'Name, crew ID and ambulance unit cannot be blank.';
            return;
        }

        if (!/^\+?[\d\s-]{7,15}$/.test(phone)) {
            $('#signupMsg').textContent = 'Enter a valid mobile number.';
            return;
        }

        if (password !== confirm) {
            $('#signupMsg').textContent = 'Passwords do not match.';
            return;
        }

        var exists = users.some(function (user) {
            return user.crewId.toLowerCase() === crewId.toLowerCase() ||
                (user.email && user.email.toLowerCase() === email.toLowerCase());
        });

        if (exists) {
            $('#signupMsg').textContent = 'That crew ID or email is already registered.';
            return;
        }

        users.push({
            name: name,
            crewId: crewId,
            phone: phone,
            email: email,
            unit: unit,
            role: form.elements.role.value,
            password: password
        });

        form.reset();
        showTab('login');

        /* The message is shown on the sign-in tab, which is the one
           that is visible after the switch. */
        $('#loginForm').elements.id.value = crewId;
        $('#loginMsg').className = 'msg ok';
        $('#loginMsg').textContent = 'Account created. Enter your password to sign in.';
        $('#loginForm').elements.password.focus();
    });

    $('#logoutBtn').onclick = function () {
        if (state.request || state.status === 'busy') {
            var text = 'Complete the current assignment before signing out.';

            $('#waitLine').textContent = text;

            if (!$('#trip').hidden) {
                setBanner(text);
            }

            return;
        }

        stopLeg();
        stopGps(false);
        clearViews();
        simToken++;
        simPending = false;
        $('#simBtn').disabled = false;
        closeSheets();
        $('#doneBox').hidden = true;
        $('#bar').hidden = true;

        state.user = null;
        state.request = null;
        state.patient = null;
        state.hospital = null;
        state.hospitals = [];
        state.trips = 0;
        shiftStarted = false;

        $('#tripCount').textContent = '0';
        $('#shiftStart').textContent = '-';
        $('#log').innerHTML = '';
        $('#loginForm').reset();

        showTab('login');
        show('auth');
    };

    /* ---------- Activity status and location ---------- */

    $$('#statusSet .st').forEach(function (button) {
        button.onclick = function () {
            if (state.status === 'busy') {
                $('#waitLine').textContent = 'Complete the current assignment before changing status.';
                return;
            }

            setStatus(button.dataset.s, true);
        };
    });

    $('#locBtn').onclick = function () {
        if (gps.state === 'off' || gps.state === 'blocked') {
            startGps();
        } else {
            stopGps(true);
        }
    };

    /* ---------- Shared patient dispatch ---------- */

    var pendingDispatch = null;
    var acceptingDispatchId = '';
    var lastDispatchRevision = -1;

    function renderDispatchInbox(dispatch) {
        var root = $('#dispatchInbox');
        var hint = $('#dispatchInboxHint');
        if (!root || !hint) return;

        if (!dispatch) {
            hint.textContent = 'Connected to the shared dispatch server. Waiting for a patient request.';
            root.innerHTML = '<p class="hint small">No active patient request. Submit an emergency from the patient portal to see it here.</p>';
            return;
        }

        if (dispatch.status === 'searching') {
            pendingDispatch = dispatch;
            hint.textContent = 'A patient request is waiting for an available compounder.';
            root.innerHTML = '<div class="dispatch-request"><div><strong>' + escapeHtml(dispatch.patient && dispatch.patient.name || 'Patient') +
                ' · ' + escapeHtml(dispatch.id) + '</strong><p class="hint small">Pickup: ' + escapeHtml(dispatch.pickup && dispatch.pickup.address || 'Confirmed map point') +
                '<br>Coordinates: ' + Number(dispatch.pickup.coords.lat).toFixed(5) + ', ' + Number(dispatch.pickup.coords.lng).toFixed(5) +
                '<br>Emergency: ' + escapeHtml(dispatch.details && dispatch.details.type || 'Emergency assistance') +
                (dispatch.details && dispatch.details.description ? '<br>Details: ' + escapeHtml(dispatch.details.description) : '') +
                '</p></div><button class="btn primary" id="acceptPatientDispatch" type="button">Accept and navigate</button></div>';
            $('#acceptPatientDispatch').onclick = function () { acceptPatientDispatch(dispatch); };
            return;
        }

        pendingDispatch = null;
        if (['completed', 'cancelled', 'unavailable'].includes(dispatch.status)) {
            hint.textContent = 'Latest patient request: ' + dispatch.status + '.';
            root.innerHTML = '<p class="hint small">Request ' + escapeHtml(dispatch.id) + ' is ' + escapeHtml(dispatch.status) + '. A new patient request can be received when one is submitted.</p>';
            return;
        }
        if (state.request && state.request.dispatchId === dispatch.id) {
            hint.textContent = 'You are handling this patient request. The patient portal is receiving your position and journey updates.';
            root.innerHTML = '<div class="dispatch-request"><div><strong>' + escapeHtml(dispatch.id) + ' · ' +
                escapeHtml(dispatch.status) + '</strong><p class="hint small">Patient: ' + escapeHtml(dispatch.patient && dispatch.patient.name || 'Patient') +
                '<br>Pickup: ' + escapeHtml(dispatch.pickup.address) +
                (dispatch.hospital ? '<br>Hospital: ' + escapeHtml(dispatch.hospital.name) : '') +
                '</p></div><span class="pill hot">On assignment</span></div>';
        } else if (dispatch.ambulance) {
            hint.textContent = 'A patient request has already been accepted by another crew.';
            root.innerHTML = '<div class="dispatch-request"><div><strong>' + escapeHtml(dispatch.id) + ' · ' + escapeHtml(dispatch.status) +
                '</strong><p class="hint small">Assigned to ' + escapeHtml(dispatch.ambulance.label || dispatch.ambulance.id) +
                '. The request is no longer available for acceptance.</p></div><span class="pill warn">Assigned</span></div>';
        } else {
            hint.textContent = 'The latest request is ' + dispatch.status + '.';
            root.innerHTML = '<p class="hint small">Request ' + escapeHtml(dispatch.id) + ' is not currently waiting for acceptance.</p>';
        }
    }

    function handleSharedDispatch(event) {
        var dispatch = event && event.dispatch;
        if (!dispatch) return;
        var revision = Number(dispatch.revision) || 0;
        if (revision < lastDispatchRevision) return;
        lastDispatchRevision = revision;
        if (state.user && !state.request && dispatch.ambulance && dispatch.id !== acceptingDispatchId &&
            dispatch.ambulance.unit === state.user.unit &&
            !['completed', 'cancelled', 'unavailable'].includes(dispatch.status)) {
            resumeOwnDispatch(dispatch);
        }
        renderDispatchInbox(dispatch);
    }

    /* Rebuild the active trip after a compounder page refresh, using the last
       coordinates and status stored by the shared relay rather than demo points. */
    function resumeOwnDispatch(dispatch) {
        if (!dispatch || !dispatch.ambulance || !dispatch.pickup || !dispatch.pickup.coords || state.request) return;
        var current = dispatch.ambulance.coords || dispatch.ambulance.startCoords;
        var start = { lat: Number(current.lat), lng: Number(current.lng), live: true,
            accuracy: Number(dispatch.ambulance.accuracy) || 0 };
        state.request = {
            id: dispatch.id,
            dispatchId: dispatch.id,
            caller: dispatch.patient && dispatch.patient.name || 'Patient portal',
            address: dispatch.pickup.address || 'Confirmed patient pickup location',
            complaint: [dispatch.details && dispatch.details.type, dispatch.details && dispatch.details.description].filter(Boolean).join(' — ') || 'Emergency medical assistance requested',
            priority: 'Priority 1',
            pickup: { lat: Number(dispatch.pickup.coords.lat), lng: Number(dispatch.pickup.coords.lng) },
            start: { lat: Number(dispatch.ambulance.startCoords.lat), lng: Number(dispatch.ambulance.startCoords.lng), live: true }
        };
        state.patient = null;
        state.hospital = dispatch.hospital ? {
            h: { id: dispatch.hospital.id, name: dispatch.hospital.name, area: dispatch.hospital.address || '',
                phone: dispatch.hospital.phone || '', lat: Number(dispatch.hospital.coords.lat), lng: Number(dispatch.hospital.coords.lng), has: [] },
            met: [], missing: [], eta: 0, km: 0
        } : null;
        state.hospitals = state.hospital ? [state.hospital] : [];
        state.notifiedAt = null;
        setStatus('busy', false);
        closeSheets();
        $('#doneBox').hidden = true;
        resetTripUI();
        $('#reqPriority').textContent = 'Priority 1';
        $('#destTitle').textContent = dispatch.status === 'enroute' || dispatch.status === 'arrived' ? (state.hospital.h.name) : state.request.address;
        factRows($('#destFacts'), [
            ['Pickup address', state.request.address],
            ['Reported by', state.request.caller],
            ['Request', state.request.id],
            ['Your unit', state.user.unit],
            ['Crew', state.user.name]
        ]);
        $('#skipBtn').hidden = false;
        show('trip');

        if (dispatch.status === 'pickedup' && !state.hospital) {
            leg.key = 'pickup'; leg.arrived = true; leg.p = 1;
            $('#phaseLine').textContent = 'At patient location';
            setBanner('This trip was restored after a refresh. Review or re-enter the patient details to select a hospital.');
            setMainAction('Open patient details', true);
        } else if (dispatch.status === 'arrived') {
            leg.key = 'hospital'; leg.arrived = true; leg.p = 1;
            $('#phaseLine').textContent = 'At hospital';
            setBanner('The dispatch server confirms arrival at ' + (state.hospital ? state.hospital.h.name : 'the hospital') + '.');
            setMainAction('Confirm patient handover', true);
        } else if (dispatch.status === 'enroute' && state.hospital) {
            $('#phaseLine').textContent = 'Heading to hospital';
            setBanner('Trip restored. Continuing from the last ambulance position.');
            setMainAction('Handover opens on arrival', false);
            startLeg({ key: 'hospital', start: start, end: hospitalPoint(state.hospital.h), from: 'Ambulance', to: state.hospital.h.name });
        } else {
            $('#phaseLine').textContent = 'Heading to patient';
            setBanner('Trip restored. Continuing from the last ambulance position toward the confirmed patient pickup pin.');
            setMainAction('Patient details open on arrival', false);
            startLeg({ key: 'pickup', start: start, end: state.request.pickup, from: 'Ambulance', to: 'Patient' });
        }
        log('Restored active patient dispatch: ' + dispatch.id);
    }

    function publishDispatchStatus(status, hospital) {
        if (!state.request || !state.request.dispatchId || !window.MediRouteDispatch) return Promise.resolve(null);
        var payload = { requestId: state.request.dispatchId, status: status };
        if (hospital) payload.hospital = hospital;
        return window.MediRouteDispatch.updateStatus(payload).catch(function (error) {
            log('Could not sync dispatch status: ' + error.message);
            setBanner('Local route continues, but the patient portal may not receive this update. Check that the dispatch server is running.');
            return null;
        });
    }

    function publishAmbulancePosition(point) {
        if (!state.request || !state.request.dispatchId || !window.MediRouteDispatch || !point) {
            return;
        }

        var nowAt = Date.now();

        if (nowAt - (leg.lastPublishedAt || 0) < 1000) {
            return;
        }

        leg.lastPublishedAt = nowAt;

        window.MediRouteDispatch.updateLocation({
            requestId: state.request.dispatchId,
            position: {
                lat: Number(point.lat),
                lng: Number(point.lng)
            },
            source: 'browser-geolocation',
            accuracy: gps.fix ? gps.fix.accuracy : null,
            routeLeg: leg.key === 'hospital' ? 'to-hospital' : 'to-pickup'
        }).catch(function (error) {
            if (!leg.syncWarned) {
                leg.syncWarned = true;
                log('GPS location sync is unavailable: ' + error.message);
            }
        });
    }

    function beginConnectedRequest(dispatch, fix) {
        var pickupCoords = dispatch.pickup.coords;
        var start = {
            lat: Number(fix.lat),
            lng: Number(fix.lng),
            live: true,
            accuracy: Number(fix.accuracy) || 0,
        };

        state.request = {
            id: dispatch.id,
            dispatchId: dispatch.id,
            caller: dispatch.patient && dispatch.patient.name || 'Patient portal',
            address: dispatch.pickup.address || 'Confirmed patient pickup location',
            complaint: [dispatch.details && dispatch.details.type, dispatch.details && dispatch.details.description].filter(Boolean).join(' — ') || 'Emergency medical assistance requested',
            priority: 'Priority 1',
            pickup: { lat: Number(pickupCoords.lat), lng: Number(pickupCoords.lng) },
            start: start
        };

        state.patient = null;
        state.hospital = null;
        state.hospitals = [];
        state.notifiedAt = null;
        closeSheets();
        $('#doneBox').hidden = true;
        prefillFromProfile(null);
        resetTripUI();
        setStatus('busy', true);
        $('#reqPriority').textContent = state.request.priority;
        $('#destTitle').textContent = state.request.address;
        $('#phaseLine').textContent = 'Heading to patient';
        factRows($('#destFacts'), [
            ['Pickup address', state.request.address],
            ['Reported by', state.request.caller],
            ['Reported problem', state.request.complaint],
            ['Request', state.request.id],
            ['Your unit', state.user.unit],
            ['Crew', state.user.name]
        ]);
        setMainAction('Patient details open on arrival', false);
        $('#skipBtn').hidden = true;
        setBanner('Patient request accepted. Navigating to the exact pickup coordinates shared by the patient portal.');
        log('Accepted patient request: ' + state.request.id);
        log('Ambulance starting from device GPS: ' + start.lat.toFixed(5) + ', ' + start.lng.toFixed(5));
        log('Patient pickup pin: ' + state.request.pickup.lat.toFixed(5) + ', ' + state.request.pickup.lng.toFixed(5));
        show('trip');

        publishAmbulancePosition({ lat: start.lat, lng: start.lng }, 0);
        startLeg({ key: 'pickup', start: start, end: state.request.pickup, from: 'Ambulance', to: 'Patient' });
    }

    function acceptPatientDispatch(dispatch) {
        if (!state.user || state.request || state.status !== 'available') {
            $('#waitLine').textContent = 'Finish the current assignment and set your status to Available before accepting a patient request.';
            return;
        }
        if (!dispatch || !dispatch.pickup || !dispatch.pickup.coords) {
            setBanner('The patient request does not contain a confirmed map location. Ask the patient to confirm their pickup pin.');
            return;
        }

        acceptingDispatchId = dispatch.id;
        $('#acceptPatientDispatch').disabled = true;
        $('#acceptPatientDispatch').textContent = 'Getting ambulance GPS…';
        if (gps.state === 'off' || gps.state === 'blocked') startGps();

        waitForFix(FIX_WAIT_MS).then(function (fix) {
            if (!fix) {
                renderDispatchInbox(dispatch);
                $('#waitLine').textContent = 'Ambulance GPS is required. Enable location and accept the patient request again.';
                setBanner('No live ambulance location was received. Allow location access in the browser and retry. The app will not substitute a random ambulance address.');
                return;
            }
            return window.MediRouteDispatch.acceptRequest({
                requestId: dispatch.id,
                ambulance: { id: state.user.unit, label: state.user.unit, unit: state.user.unit, crew: state.user.name },
                position: { lat: fix.lat, lng: fix.lng },
                accuracy: fix.accuracy
            }).then(function (accepted) {
                beginConnectedRequest(accepted, fix);
                renderDispatchInbox(accepted);
            });
        }).catch(function (error) {
            renderDispatchInbox(dispatch);
            setBanner('The request could not be accepted: ' + error.message);
            log('Dispatch acceptance failed: ' + error.message);
        }).finally(function () {
            acceptingDispatchId = '';
            var acceptButton = $('#acceptPatientDispatch');
            if (acceptButton && pendingDispatch) {
                acceptButton.disabled = false;
                acceptButton.textContent = 'Accept and navigate';
            }
        });
    }

    $('#simBtn').onclick = function () {
        $('#simBtn').disabled = true;
        window.MediRouteDispatch.getCurrent().then(function (dispatch) {
            if (!dispatch) $('#waitLine').textContent = 'No patient request is currently waiting.';
            else handleSharedDispatch({ type: 'refresh', dispatch: dispatch });
        }).catch(function (error) {
            $('#waitLine').textContent = 'Dispatch server unavailable: ' + error.message;
        }).finally(function () { $('#simBtn').disabled = false; });
    };

    if (window.MediRouteDispatch) {
        window.MediRouteDispatch.subscribe(handleSharedDispatch);
        window.MediRouteDispatch.getCurrent().then(function (dispatch) {
            if (dispatch) handleSharedDispatch({ type: 'snapshot', dispatch: dispatch });
            else renderDispatchInbox(null);
        }).catch(function (error) {
            $('#dispatchInboxHint').textContent = 'Dispatch server is not connected. Start server.js to connect the two portals.';
            $('#dispatchInbox').innerHTML = '<p class="hint small">' + escapeHtml(error.message) + '</p>';
        });
    }

        /* ---------- Travel legs ---------- */

    function paintLeg() {
        var fraction = Math.min(1, leg.p);

        $('#etaMain').textContent = Math.ceil(leg.minutes * (1 - fraction));
        $('#distMain').textContent = (leg.km * (1 - fraction)).toFixed(1);
        $('#progFill').style.width = (fraction * 100) + '%';

        var currentPoint = leg.route ? pointAt(leg.route.coords, leg.cum, fraction) : null;
        if (canMap()) {
            var v = views.mapMain;

            if (v && v.amb) {
                v.amb.setLatLng(currentPoint);
            } else if (leg.route) {
                renderRoute('mapMain', leg.route, leg.from, leg.to, fraction);
            }
        } else {
            $('#mapMain').innerHTML = routeSVG(leg.from, leg.to, fraction);
        }
        if (currentPoint) {
            publishAmbulancePosition({ lat: currentPoint[0], lng: currentPoint[1] }, fraction);
            if (leg.key === 'pickup' && fraction >= 0.05 && !leg.approachingPublished) {
                leg.approachingPublished = true;
                publishDispatchStatus('approaching');
            }
        }
    }

    /* Looks up the road route first, then drives the marker along it.
       The token drops late answers if the trip was stopped or replaced. */
    function startLeg(options) {
        stopLeg();

        var token = ++leg.token;

        leg.key = options.key;
        leg.p = 0;
        leg.arrived = false;
        leg.route = null;
        leg.from = options.from;
        leg.to = options.to;
        leg.end = options.end;
        leg.lastPublishedAt = 0;
        leg.approachingPublished = false;
        leg.syncWarned = false;

        $('#etaMain').textContent = '--';
        $('#distMain').textContent = '--';
        $('#progFill').style.width = '0%';

        fetchRoute(options.start, options.end).then(function (route) {
            if (token !== leg.token || !state.request) {
                return;
            }

            leg.route = route;
            leg.cum = pathPrep(route.coords);
            leg.minutes = route.minutes;
            leg.km = route.km;

            /* One simulated minute plays as one second, between 6 and 30 s.
               Elapsed time is used so a throttled background tab cannot stall it. */
            leg.duration = Math.max(6, Math.min(30, route.minutes)) * 1000;
            leg.t0 = Date.now();

            if (route.approx) {
                log('Road routing unavailable, showing a straight-line estimate');
            }

            renderRoute('mapMain', route, leg.from, leg.to, 0);

            waitForLeaflet().then(function (ready) {
                if (ready && token === leg.token && state.request && leg.route === route) {
                    renderRoute('mapMain', route, leg.from, leg.to, 0);

                    // Put the ambulance marker at the latest real GPS location.
                    if (gps.fix && views.mapMain && views.mapMain.amb) {
                        views.mapMain.amb.setLatLng([gps.fix.lat, gps.fix.lng]);
                    }
                } else if (!ready && !leafletWarned) {
                    leafletWarned = true;
                    log('Leaflet could not be loaded. Check your internet connection.');
                }
            });

            updateTripFromGps();
        });
    }

    function stopLeg() {
        leg.token++;

        if (leg.timer) {
            clearInterval(leg.timer);
            leg.timer = null;
        }
    }

    function arriveLeg() {
        stopLeg();

        if (!state.request) {
            return;
        }

        leg.arrived = true;

        if (leg.key === 'pickup') {
            $('#phaseLine').textContent = 'At patient location';
            setBanner('You have reached the pickup location. Record patient details to find a suitable hospital.');
            setMainAction('Open patient details', true);
            $('#skipBtn').hidden = true;
            log('Reached patient pickup location');
        } else if (leg.key === 'hospital' && state.hospital) {
            publishDispatchStatus('arrived');
            $('#phaseLine').textContent = 'At hospital';
            setBanner('You have reached the selected hospital.');
            setMainAction('Confirm patient handover', true);
            $('#skipBtn').hidden = true;
            log('Reached hospital: ' + state.hospital.h.name);
        }
    }

    $('#mainAction').onclick = function () {
        if (!state.request) {
            return;
        }

        /* Nothing on this button works until the ambulance has arrived. */
        if (!leg.arrived) {
            if (leg.key === 'hospital') {
                setBanner('The ambulance is still travelling to the hospital. Handover can be confirmed on arrival.');
            } else {
                setBanner('The ambulance is still travelling to the patient. Patient details can be entered on arrival.');
            }

            return;
        }

        if (leg.key === 'pickup') {
            $('#intakeMsg').textContent = '';
            openSheet('intakeSheet');
        } else if (leg.key === 'hospital' && state.hospital) {
            $('#doneText').textContent = 'Confirm that the patient has been handed over to ' + state.hospital.h.name + '.';
            $('#doneBox').hidden = false;
        }
    };


    $$('.sheet-hide').forEach(function (button) {
        button.onclick = closeSheets;
    });

    $('#sheetBack').onclick = closeSheets;

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && $('#doneBox').hidden) {
            closeSheets();
        }
    });

    /* ---------- Patient intake ---------- */

    function prefillFromProfile(profile) {
        var form = $('#intakeForm');
        form.reset();
        $('#intakeMsg').textContent = '';

        if (!profile) {
            $('#profileNote').className = 'profile-note';
            $('#profileNote').textContent = 'Patient profile: not linked. Enter the patient details below.';
            return;
        }

        form.elements.pname.value = profile.name || '';
        form.elements.age.value = profile.age || '';
        form.elements.sex.value = profile.sex || '';

        $('#profileNote').className = 'profile-note linked';
        $('#profileNote').textContent = 'Patient profile linked. Verify the details before continuing.';
    }

    function unique(list) {
        return list.filter(function (item, index) {
            return list.indexOf(item) === index;
        });
    }

    /* Adds requirements that the recorded condition clearly implies,
       so a critical patient is never routed on an empty checklist. */
    function deriveNeeds(patient) {
        var added = [];
        var spo2 = patient.spo2 === '' ? null : Number(patient.spo2);

        function add(need) {
            if (patient.needs.indexOf(need) === -1) {
                patient.needs.push(need);
                added.push(need);
            }
        }

        if (spo2 !== null && spo2 < 94) {
            add('Oxygen support');
        }

        if ((spo2 !== null && spo2 < 90) ||
            patient.avpu === 'Responds to pain' ||
            patient.avpu === 'Unresponsive') {
            add('ICU bed');
        }

        if (patient.bloodGroups.some(function (group) { return group !== 'Unknown'; })) {
            add('Blood bank');
        }

        return added;
    }

    $('#intakeForm').addEventListener('submit', function (event) {
        event.preventDefault();

        var form = event.target;

        /* Safety net: the form only counts when the ambulance has reached the patient. */
        if (!state.request || leg.key !== 'pickup' || !leg.arrived) {
            $('#intakeMsg').textContent = 'Patient details can only be recorded after the ambulance reaches the patient.';
            return;
        }

        if (!form.elements.symptoms.value.trim()) {
            $('#intakeMsg').textContent = 'Describe the main complaint before searching for a hospital.';
            form.elements.symptoms.focus();
            return;
        }

        var bp = form.elements.bp.value.trim();

        if (bp) {
            var match = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(bp);

            if (!match) {
                $('#intakeMsg').textContent = 'Enter blood pressure as systolic/diastolic, for example 120/80.';
                form.elements.bp.focus();
                return;
            }

            if (Number(match[1]) <= Number(match[2])) {
                $('#intakeMsg').textContent = 'Systolic pressure must be higher than diastolic pressure.';
                form.elements.bp.focus();
                return;
            }

            bp = match[1] + '/' + match[2];
        }

        var bloodGroups = $$('input[name="bloodGroup"]:checked', form).map(function (checkbox) {
            return checkbox.value;
        });

        if (bloodGroups.indexOf('Unknown') !== -1 && bloodGroups.length > 1) {
            $('#intakeMsg').textContent = 'Blood group cannot be both Unknown and a specific group. Adjust the selection.';
            return;
        }

        var minBeds = Math.floor(Number(form.elements.minBeds.value || 0));

        if (!isFinite(minBeds) || minBeds < 0) {
            minBeds = 0;
        }

        state.patient = {
            name: form.elements.pname.value.trim() || 'Unknown',
            age: form.elements.age.value,
            sex: form.elements.sex.value,
            symptoms: form.elements.symptoms.value.trim(),
            pulse: form.elements.pulse.value,
            bp: bp,
            spo2: form.elements.spo2.value,
            temp: form.elements.temp.value,
            avpu: form.elements.avpu.value,
            needs: unique($$('input[name="need"]:checked', form).map(function (checkbox) {
                return checkbox.value;
            })),
            bloodGroups: bloodGroups,
            minBeds: minBeds,
            bedType: form.elements.bedType.value,
            given: form.elements.given.value.trim(),
            autoAdded: []
        };

        state.patient.autoAdded = deriveNeeds(state.patient);

        log('Patient details recorded');
        publishDispatchStatus('pickedup');

        if (state.patient.autoAdded.length) {
            log('Added from patient condition: ' + state.patient.autoAdded.join(', '));
        }

        findHospitals();
    });

    /* ---------- Hospital matching ---------- */

    var HOSPITAL_DB = [
        {
            name: 'Government General Hospital',
            area: 'Park Town',
            phone: '044 2530 5000',
            lat: 13.0813,
            lng: 80.2757,
            beds: 6,
            has: [
                'Emergency/Casualty', '24/7 specialist service',
                'Cardiac care', 'Trauma and orthopaedics',
                'Neurology', 'Orthopedics', 'Pediatrics',
                'General Medicine', 'Surgery', 'ICU bed',
                'Emergency bed', 'Isolation bed', 'Trauma bed',
                'Ventilator', 'Oxygen support', 'ECG machine',
                'Defibrillator', 'Suction apparatus', 'Infusion pump',
                'Glucometer', 'Blood bank', 'Burns unit', 'Maternity'
            ]
        },
        {
            name: 'Southern Heart Institute',
            area: 'Adyar',
            phone: '044 2491 1100',
            lat: 13.0050,
            lng: 80.2575,
            beds: 3,
            has: [
                'Emergency/Casualty', '24/7 specialist service',
                'Cardiac care', 'Neurology', 'General Medicine',
                'Surgery', 'ICU bed', 'Emergency bed', 'Ventilator',
                'Oxygen support', 'ECG machine', 'Defibrillator',
                'Suction apparatus', 'Infusion pump', 'Glucometer',
                'Blood bank'
            ]
        },
        {
            name: 'Lakeside Trauma Centre',
            area: 'Guindy',
            phone: '044 2234 7788',
            lat: 13.0100,
            lng: 80.2210,
            beds: 4,
            has: [
                'Emergency/Casualty', '24/7 specialist service',
                'Trauma and orthopaedics', 'Orthopedics', 'Surgery',
                'ICU bed', 'Emergency bed', 'Isolation bed', 'Trauma bed',
                'Ventilator', 'Oxygen support', 'ECG machine',
                'Defibrillator', 'Suction apparatus', 'Blood bank',
                'Burns unit'
            ]
        },
        {
            name: 'St. Matthew Community Hospital',
            area: 'Velachery',
            phone: '044 2259 3030',
            lat: 12.9815,
            lng: 80.2180,
            beds: 8,
            has: [
                'Emergency/Casualty', 'Maternity', 'Pediatrics',
                'General Medicine', 'Blood bank', 'ICU bed',
                'Emergency bed', 'Isolation bed', 'Oxygen support',
                'ECG machine', 'Glucometer'
            ]
        }
    ];

    function findHospitals() {
        if (!state.patient) {
            return;
        }

        var wanted = state.patient.needs;

        state.hospitals = HOSPITAL_DB.map(function (hospital) {
            var met = wanted.filter(function (need) {
                return hospital.has.indexOf(need) !== -1;
            });

            var missing = wanted.filter(function (need) {
                return hospital.has.indexOf(need) === -1;
            });

            var bedShortfall = Math.max(0, state.patient.minBeds - hospital.beds);

            if (state.patient.bedType &&
                hospital.has.indexOf(state.patient.bedType) === -1) {
                missing.push(state.patient.bedType);
            }

            if (bedShortfall > 0) {
                missing.push('Minimum ' + state.patient.minBeds + ' available beds');
            }

            var est = estimate(state.request.pickup, hospitalPoint(hospital));

            return {
                h: hospital,
                met: met,
                missing: unique(missing),
                eta: est.minutes,
                km: Math.round(est.km * 10) / 10
            };
        }).sort(function (a, b) {
            /* A hospital that can treat the patient always outranks a closer
               one that cannot. Distance only decides between equal matches. */
            if (a.missing.length !== b.missing.length) {
                return a.missing.length - b.missing.length;
            }

            if (a.eta !== b.eta) {
                return a.eta - b.eta;
            }

            return b.h.beds - a.h.beds;
        });

        /* The sheet must be visible before the preview map is drawn. */
        closeSheets();
        openSheet('hospitalSheet');
        chooseHospital(0);
    }

    var previewToken = 0;

    function chooseHospital(index) {
        var result = state.hospitals[index];
        var hospital = result.h;
        var first = index === 0;

        state.hospital = result;

        $('#hName').textContent = hospital.name;
        $('#hAddr').textContent = hospital.area + ', Chennai';

        if (first) {
            $('#matchPill').textContent = result.missing.length ? 'Closest match' : 'Best match';
        } else {
            $('#matchPill').textContent = 'Selected by crew';
        }

        $('#matchPill').className = result.missing.length ? 'pill warn' : 'pill';

        /* Preview map: the ambulance waits at the start of the route.
           A straight dashed line shows at once, then the road route replaces it. */
        var pickup = state.request.pickup;
        var target = hospitalPoint(hospital);
        var token = ++previewToken;

        var previewRoute = {
            coords: [[pickup.lat, pickup.lng], [target.lat, target.lng]],
            approx: true
        };
        renderRoute('mapHospital', previewRoute, 'Patient pickup', hospital.name, 0);

        waitForLeaflet().then(function (ready) {
            if (ready && token === previewToken && state.hospital === result) {
                renderRoute('mapHospital', previewRoute, 'Patient pickup', hospital.name, 0);
            }
        });

        $('#etaHospital').textContent = result.eta;
        $('#distHospital').textContent = result.km.toFixed(1) + ' km';

        fetchRoute(pickup, target).then(function (route) {
            if (token !== previewToken || state.hospital !== result) {
                return;
            }

            result.eta = route.minutes;
            result.km = Math.round(route.km * 10) / 10;
            $('#etaHospital').textContent = result.eta;
            $('#distHospital').textContent = result.km.toFixed(1) + ' km';
            renderRoute('mapHospital', route, 'Patient pickup', hospital.name, 0);
            waitForLeaflet().then(function (ready) {
                if (ready && token === previewToken && state.hospital === result) {
                    renderRoute('mapHospital', route, 'Patient pickup', hospital.name, 0);
                }
            });
            renderAlternatives();
        });

        var rows = [
            ['Needs covered', result.met.length ? result.met.join(', ') : 'No specific needs entered'],
            ['Not available', result.missing.length ? result.missing.join(', ') : 'None'],
            ['Beds free in demo data', String(hospital.beds)],
            ['Casualty desk', hospital.phone],
            ['Blood group selected', state.patient.bloodGroups.length ? state.patient.bloodGroups.join(', ') : 'Not specified']
        ];

        if (state.patient.autoAdded && state.patient.autoAdded.length) {
            rows.splice(2, 0, ['Added from condition', state.patient.autoAdded.join(', ')]);
        }

        factRows($('#hFacts'), rows);

        log((first ? 'Recommended hospital: ' : 'Hospital selected: ') + hospital.name);
        renderAlternatives();
    }

    function renderAlternatives() {
        var list = $('#alts');
        list.innerHTML = '';

        state.hospitals.forEach(function (result, index) {
            if (result === state.hospital) {
                return;
            }

            var li = document.createElement('li');
            var left = document.createElement('div');
            var name = document.createElement('strong');
            var small = document.createElement('small');
            var meta = document.createElement('span');
            var button = document.createElement('button');

            name.textContent = result.h.name;
            small.textContent = result.h.area +
                (result.missing.length ? ' \u2014 missing: ' + result.missing.join(', ') : ' \u2014 covers selected services');

            left.appendChild(name);
            left.appendChild(small);

            meta.textContent = 'about ' + result.eta + ' min, ' + result.km.toFixed(1) + ' km';

            button.type = 'button';
            button.className = 'btn ghost';
            button.textContent = 'Use this hospital';

            button.onclick = function () {
                chooseHospital(index);
            };

            li.appendChild(left);
            li.appendChild(meta);
            li.appendChild(button);
            list.appendChild(li);
        });
    }

    function buildNotice() {
        var patient = state.patient;
        var request = state.request;
        var hospital = state.hospital.h;
        var vitals = [];
        var lines = [
            'To: Casualty desk, ' + hospital.name,
            'From: Unit ' + state.user.unit + ', ' + state.user.name,
            'Request: ' + request.id + ' (' + request.priority + ')',
            'Expected arrival: about ' + state.hospital.eta + ' minutes'
        ];

        /* Do not send empty or placeholder patient fields to the hospital. */
        if (patient.name && patient.name !== 'Unknown') {
            lines.push('Patient: ' + patient.name);
        }
        if (patient.age !== '') {
            lines.push('Age: ' + patient.age);
        }
        if (patient.sex) {
            lines.push('Sex: ' + patient.sex);
        }

        if (request.complaint) {
            lines.push('Reported problem: ' + request.complaint);
        }
        if (patient.symptoms) {
            lines.push('Symptoms: ' + patient.symptoms);
        }
        if (patient.avpu) {
            lines.push('Consciousness: ' + patient.avpu);
        }

        if (patient.pulse !== '') {
            vitals.push('Pulse: ' + patient.pulse + ' bpm');
        }
        if (patient.bp) {
            vitals.push('BP: ' + patient.bp);
        }
        if (patient.spo2 !== '') {
            vitals.push('SpO2: ' + patient.spo2 + '%');
        }
        if (patient.temp !== '') {
            vitals.push('Temperature: ' + patient.temp + ' °C');
        }
        if (vitals.length) {
            lines.push('Vitals: ' + vitals.join(', '));
        }

        if (patient.bloodGroups && patient.bloodGroups.length) {
            lines.push('Blood group: ' + patient.bloodGroups.join(', '));
        }
        if (patient.needs && patient.needs.length) {
            lines.push('Required services/equipment: ' + patient.needs.join(', '));
        }
        if (state.hospital.missing && state.hospital.missing.length) {
            lines.push('Not available at this hospital: ' + state.hospital.missing.join(', '));
        }
        if (patient.given) {
            lines.push('Treatment given: ' + patient.given);
        }

        return lines.join('\n');
    }

    function notifyHospital(hospital, message) {
        state.notifiedAt = stamp();

        $('#informChip').textContent = 'Hospital notification prepared at ' + state.notifiedAt;
        $('#informChip').hidden = false;
        $('#noticeText').textContent = message;
        $('#noticeBox').hidden = false;
        $('#noticeBox').open = false;

        log('Demo notification prepared for ' + hospital.name);
    }

    $('#startHospitalBtn').onclick = function () {
        if (!state.request || !state.patient || !state.hospital) {
            return;
        }

        var hospital = state.hospital.h;
        var patient = state.patient;

        notifyHospital(hospital, buildNotice());
        closeSheets();

        $('#phaseLine').textContent = 'Heading to hospital';
        $('#destTitle').textContent = hospital.name;

        /* Handover stays locked until the ambulance reaches the hospital. */
        setMainAction('Handover opens on arrival', false);
        $('#skipBtn').hidden = false;

        factRows($('#destFacts'), [
            ['Hospital', hospital.name],
            ['Address', hospital.area + ', Chennai'],
            ['Casualty desk', hospital.phone],
            ['Patient', patient.name],
            ['Blood group', patient.bloodGroups.length ? patient.bloodGroups.join(', ') : 'Not specified'],
            ['Prepared for', patient.needs.length ? patient.needs.join(', ') : 'General casualty assessment'],
            ['Request', state.request.id]
        ]);

        setBanner('Destination selected: ' + hospital.name + '.');
        show('trip');

        publishDispatchStatus('enroute', {
            id: hospital.id || hospital.name,
            name: hospital.name,
            address: hospital.area + ', Chennai',
            phone: hospital.phone,
            coords: hospitalPoint(hospital),
            source: 'compounder-demo-hospital-list'
        });

        startLeg({
            key: 'hospital',
            start: state.request.pickup,
            end: hospitalPoint(hospital),
            from: 'Patient pickup',
            to: hospital.name
        });
    };

    /* ---------- Handover ---------- */

    $('#doneYes').onclick = function () {
        if (!state.request || !state.hospital || !leg.arrived || leg.key !== 'hospital') {
            $('#doneBox').hidden = true;
            return;
        }

        stopLeg();
        $('#doneBox').hidden = true;

        state.trips += 1;
        $('#tripCount').textContent = state.trips;

        log('Ride completed at ' + state.hospital.h.name);
        publishDispatchStatus('completed');

        state.request = null;
        state.patient = null;
        state.hospital = null;
        state.hospitals = [];
        state.notifiedAt = null;

        leg.key = '';
        leg.arrived = false;
        leg.p = 0;

        clearViews();
        resetTripUI();
        setStatus('available', true);
        show('dash');
    };

    $('#doneNo').onclick = function () {
        $('#doneBox').hidden = true;
        setBanner('Confirm patient handover once it is complete.');
    };

    renderGps();
    show('auth');
})();
