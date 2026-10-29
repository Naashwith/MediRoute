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
        to: ''
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
        if (!navigator.geolocation) {
            $('#locState').textContent = 'Geolocation is not supported by this browser.';
            return;
        }

        $('#locState').textContent = 'Requesting location permission...';

        navigator.geolocation.getCurrentPosition(
            function (position) {
                var latitude = position.coords.latitude.toFixed(5);
                var longitude = position.coords.longitude.toFixed(5);

                $('#locState').textContent = latitude + ', ' + longitude;
                $('#gpsLine').textContent = 'GPS location received from device.';
                log('Device location enabled');
            },
            function () {
                $('#locState').textContent = 'Location permission denied or unavailable.';
            },
            {
                enableHighAccuracy: true,
                timeout: 10000
            }
        );
    };

    /* ---------- Incoming request ---------- */

    $('#simBtn').onclick = function () {
        if (state.request || state.status === 'busy') {
            $('#waitLine').textContent = 'Complete the current assignment before accepting another request.';
            return;
        }

        if (state.status !== 'available') {
            $('#waitLine').textContent = 'Set your status to Available to accept a test request.';
            return;
        }

        state.request = {
            id: 'REQ-' + Date.now().toString().slice(-6),
            caller: 'Dispatch centre',
            address: 'Emergency pickup location',
            complaint: 'Emergency medical assistance requested',
            priority: 'Priority 1',
            eta: 8,
            km: 3.2
        };

        /* Clean slate for every new assignment so nothing from the
           previous patient or trip is carried over. */
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

        /* Patient details stay locked until the ambulance arrives. */
        setMainAction('Patient details open on arrival', false);
        $('#skipBtn').hidden = false;
        setBanner('Ambulance dispatched. Patient details can be entered once you reach the pickup location.');

        log('Emergency request received: ' + state.request.id);
        show('trip');

        startLeg({
            key: 'pickup',
            minutes: state.request.eta,
            km: state.request.km,
            from: 'Ambulance',
            to: 'Patient'
        });
    };

    /* ---------- Travel legs ---------- */

    function paintLeg() {
        var fraction = Math.min(1, leg.p);
        var remainingMinutes = Math.ceil(leg.minutes * (1 - fraction));
        var remainingKm = (leg.km * (1 - fraction)).toFixed(1);

        $('#etaMain').textContent = remainingMinutes;
        $('#distMain').textContent = remainingKm;
        $('#progFill').style.width = (fraction * 100) + '%';
        $('#mapMain').innerHTML = routeSVG(leg.from, leg.to, fraction);
    }

    function startLeg(options) {
        stopLeg();

        leg.key = options.key;
        leg.p = 0;
        leg.arrived = false;
        leg.minutes = options.minutes;
        leg.km = options.km;
        leg.from = options.from;
        leg.to = options.to;

        paintLeg();

        leg.timer = setInterval(function () {
            leg.p += 1 / Math.max(1, leg.minutes * 2);

            if (leg.p >= 0.999999) {
                leg.p = 1;
                paintLeg();
                arriveLeg();
                return;
            }

            paintLeg();
        }, 500);
    }

    function stopLeg() {
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

    $('#skipBtn').onclick = function () {
        if (!leg.timer) {
            return;
        }

        leg.p = 1;
        paintLeg();
        arriveLeg();
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
            km: 7.4,
            eta: 16,
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
            km: 3.9,
            eta: 9,
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
            km: 5.6,
            eta: 12,
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
            km: 2.7,
            eta: 6,
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

            return {
                h: hospital,
                met: met,
                missing: unique(missing)
            };
        }).sort(function (a, b) {
            /* A hospital that can treat the patient always outranks a closer
               one that cannot. Distance only decides between equal matches. */
            if (a.missing.length !== b.missing.length) {
                return a.missing.length - b.missing.length;
            }

            if (a.h.eta !== b.h.eta) {
                return a.h.eta - b.h.eta;
            }

            return b.h.beds - a.h.beds;
        });

        chooseHospital(0);
        closeSheets();
        openSheet('hospitalSheet');
    }

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

        /* Preview map: the ambulance waits at the start of the route. */
        $('#mapHospital').innerHTML = routeSVG(
            'Patient pickup',
            hospital.name,
            0
        );

        $('#etaHospital').textContent = hospital.eta;
        $('#distHospital').textContent = hospital.km + ' km';

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

            meta.textContent = result.h.eta + ' min, ' + result.h.km + ' km';

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
            vitals.push('Temperature: ' + patient.temp + ' \u00b0C');
        }

        return [
            'To: Casualty desk, ' + hospital.name,
            'From: Unit ' + state.user.unit + ', ' + state.user.name,
            'Request: ' + request.id + ' (' + request.priority + ')',
            'Expected arrival: about ' + hospital.eta + ' minutes',
            '',
            'Patient: ' + patient.name,
            'Age: ' + (patient.age || 'Not recorded'),
            'Sex: ' + (patient.sex || 'Not stated'),
            'Reported problem: ' + request.complaint,
            'Symptoms: ' + patient.symptoms,
            'Consciousness: ' + patient.avpu,
            'Vitals: ' + (vitals.length ? vitals.join(', ') : 'Not recorded'),
            'Blood group: ' + (patient.bloodGroups.length ? patient.bloodGroups.join(', ') : 'Not recorded'),
            'Required services/equipment: ' + (patient.needs.length ? patient.needs.join(', ') : 'General casualty assessment'),
            'Not available at this hospital: ' + (state.hospital.missing.length ? state.hospital.missing.join(', ') : 'None'),
            'Treatment given: ' + (patient.given || 'None recorded')
        ].join('\n');
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

        startLeg({
            key: 'hospital',
            minutes: hospital.eta,
            km: hospital.km,
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

        state.request = null;
        state.patient = null;
        state.hospital = null;
        state.hospitals = [];
        state.notifiedAt = null;

        leg.key = '';
        leg.arrived = false;
        leg.p = 0;

        resetTripUI();
        setStatus('available', true);
        show('dash');
    };

    $('#doneNo').onclick = function () {
        $('#doneBox').hidden = true;
        setBanner('Confirm patient handover once it is complete.');
    };

    show('auth');
})();
