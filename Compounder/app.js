/* Carepath Crew: frontend structure.
   Everything marked BACKEND is a stand-in to be swapped for a real API call. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- storage helpers ---------- */
  var memory = {};
  function load(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      if (v) return JSON.parse(v);
    } catch (e) { /* storage blocked, use memory */ }
    return memory[key] !== undefined ? JSON.parse(memory[key]) : fallback;
  }
  function save(key, val) {
    memory[key] = JSON.stringify(val);
    try { localStorage.setItem(key, memory[key]); } catch (e) { /* storage blocked */ }
  }

  /* Test account so the flow can be tried without signing up. Remove before real use. */
  (function seedDemo() {
    var users = load('cp_users', []);
    var has = users.some(function (u) { return u.crewId.toLowerCase() === 'demo'; });
    if (!has) {
      users.push({ name: 'Demo Compounder', crewId: 'demo', phone: '0000000000', email: 'demo@carepath.test',
        unit: 'TN-09-AMB-114', role: 'Compounder', password: 'demo123' });
      save('cp_users', users);
    }
  })();

  /* ---------- state ---------- */
  var state = {
    user: null,
    status: 'available',
    trips: 0,
    shiftStart: null,
    request: null,
    patient: null,
    hospital: null,
    hospitals: [],
    notifiedAt: null,
    phase: 'pickup'
  };

  var STATUS_TEXT = {
    available: 'Waiting for the next request from dispatch.',
    break: 'You are on break. Dispatch will not send requests.',
    offline: 'You are off duty. Set yourself available to receive requests.'
  };
  var STATUS_LABEL = { available: 'Available', break: 'On break', offline: 'Off duty', busy: 'On a trip' };

  /* ---------- screen switching ---------- */
  function show(id) {
    ['auth', 'dash', 'trip'].forEach(function (s) { $('#' + s).hidden = (s !== id); });
    $('#bar').hidden = (id === 'auth');
    window.scrollTo(0, 0);
  }

  function stamp() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function log(text) {
    var li = document.createElement('li');
    li.innerHTML = '<time></time><span></span>';
    $('time', li).textContent = stamp();
    $('span', li).textContent = text;
    $('#log').insertBefore(li, $('#log').firstChild);
  }

  /* ---------- authentication ---------- */
  function swapTab(toLogin) {
    $('#loginForm').hidden = !toLogin;
    $('#signupForm').hidden = toLogin;
    $('#tabLogin').classList.toggle('on', toLogin);
    $('#tabSignup').classList.toggle('on', !toLogin);
    $('#tabLogin').setAttribute('aria-selected', toLogin);
    $('#tabSignup').setAttribute('aria-selected', !toLogin);
  }
  $('#tabLogin').onclick = function () { swapTab(true); };
  $('#tabSignup').onclick = function () { swapTab(false); };

  $('#signupForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, msg = $('#signupMsg');
    var d = {};
    ['name', 'crewId', 'phone', 'email', 'unit', 'role', 'password', 'confirm'].forEach(function (k) {
      d[k] = f.elements[k].value.trim();
    });
    if (!d.name || !d.crewId || !d.phone || !d.email || !d.unit) { msg.textContent = 'Fill in every field to create the account.'; return; }
    if (!/^\S+@\S+\.\S+$/.test(d.email)) { msg.textContent = 'Enter a valid email address.'; return; }
    if (d.password.length < 6) { msg.textContent = 'Use a password of at least 6 characters.'; return; }
    if (d.password !== d.confirm) { msg.textContent = 'The two passwords do not match.'; return; }

    var users = load('cp_users', []);
    var dupe = users.some(function (u) {
      return u.crewId.toLowerCase() === d.crewId.toLowerCase() || u.email.toLowerCase() === d.email.toLowerCase();
    });
    if (dupe) { msg.textContent = 'An account with this crew ID or email already exists.'; return; }

    delete d.confirm;
    /* BACKEND: POST /crew/signup. Never store passwords in the browser in production. */
    users.push(d);
    save('cp_users', users);
    msg.textContent = '';
    f.reset();
    swapTab(true);
    $('#loginForm').elements.id.value = d.crewId;
    $('#loginMsg').textContent = 'Account created. Sign in to continue.';
    $('#loginMsg').classList.add('ok');
  });

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, msg = $('#loginMsg');
    msg.classList.remove('ok');
    var id = f.elements.id.value.trim().toLowerCase(), pw = f.elements.password.value;
    if (!id || !pw) { msg.textContent = 'Enter your crew ID or email and your password.'; return; }
    /* BACKEND: POST /crew/login */
    var found = load('cp_users', []).filter(function (u) {
      return u.crewId.toLowerCase() === id || u.email.toLowerCase() === id;
    })[0];
    if (!found) { msg.textContent = 'No account found for that crew ID or email. Create an account first.'; return; }
    if (found.password !== pw) { msg.textContent = 'Password is not correct.'; return; }
    var user = found;
    msg.textContent = '';
    f.reset();
    enter(user);
  });

  function enter(user) {
    state.user = user;
    state.status = 'available';
    state.shiftStart = new Date();
    $('#barName').textContent = user.name;
    $('#barUnit').textContent = user.unit;
    $('#factUnit').textContent = user.unit;
    $('#factRole').textContent = user.role;
    $('#shiftStart').textContent = stamp();
    $('#tripCount').textContent = state.trips;
    $('#log').innerHTML = '';
    log('Signed in on unit ' + user.unit);
    Tracker.start();
    setStatus('available', true);
    show('dash');
  }

  $('#logoutBtn').onclick = function () {
    if (state.request && !confirm('A trip is in progress. Sign out anyway?')) return;
    stopLeg(); closeSheets();
    $('#doneBox').hidden = true;
    Tracker.stop();
    state.user = null; state.request = null;
    show('auth');
  };

  /* ---------- activity status ---------- */
  function setStatus(s, quiet) {
    state.status = s;
    $$('#statusSet .st').forEach(function (b) { b.classList.toggle('on', b.dataset.s === s); });
    var pill = $('#barStatus');
    pill.textContent = STATUS_LABEL[s];
    pill.className = 'pill' + (s === 'break' ? ' warn' : s === 'offline' ? ' off' : s === 'busy' ? ' busy' : '');
    var w = $('#waitLine');
    w.textContent = STATUS_TEXT[s] || '';
    w.className = 'waiting' + (s === 'break' ? ' paused' : s === 'offline' ? ' stopped' : '');
    $('#simBtn').disabled = (s !== 'available');
    if (!quiet) log('Status changed to ' + STATUS_LABEL[s].toLowerCase());
  }
  $('#statusSet').addEventListener('click', function (e) {
    var b = e.target.closest('.st');
    if (b && !state.request) setStatus(b.dataset.s);
  });

  /* ---------- location tracking (device GPS) ---------- */
  function fmtFix(f) { return f.lat.toFixed(5) + ', ' + f.lng.toFixed(5); }

  var Tracker = {
    watchId: null, fix: null, mode: 'off',
    start: function () {
      var self = this;
      if (!('geolocation' in navigator)) { self.mode = 'unsupported'; self.paint(); return; }
      if (self.watchId !== null) return;
      self.mode = 'asking'; self.paint();
      self.watchId = navigator.geolocation.watchPosition(function (pos) {
        self.fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) };
        self.mode = 'live'; self.paint();
        /* BACKEND: send self.fix on every update so dispatch and the hospital can follow this unit. */
      }, function (err) {
        if (self.watchId !== null) navigator.geolocation.clearWatch(self.watchId);
        self.watchId = null; self.fix = null;
        self.mode = err.code === 1 ? 'denied' : 'unavailable';
        self.paint();
      }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    },
    stop: function () {
      if (this.watchId !== null && 'geolocation' in navigator) navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null; this.fix = null; this.mode = 'off';
      this.paint();
    },
    paint: function () {
      var live = this.mode === 'live' && this.fix;
      var texts = {
        off: 'Location not enabled.',
        asking: 'Waiting for location permission.',
        live: live ? 'Live location on: ' + fmtFix(this.fix) + ' (within ' + this.fix.acc + ' m).' : '',
        denied: 'Location is blocked in the browser. Allow it in the site settings, then try again.',
        unavailable: 'Location could not be read on this device.',
        unsupported: 'This browser does not support location.'
      };
      $('#locState').textContent = texts[this.mode] || '';
      $('#locBtn').hidden = (this.mode === 'live' || this.mode === 'asking');
      $('#gpsLine').textContent = live
        ? 'GPS live: ' + fmtFix(this.fix) + ' (within ' + this.fix.acc + ' m)'
        : 'GPS not available. Route position is simulated.';
    }
  };
  $('#locBtn').onclick = function () { Tracker.start(); };

  /* ---------- route drawing (stand-in for the map) ---------- */
  function routeSVG(fromLabel, toLabel, seed) {
    var bend = 40 + (seed % 5) * 22;
    var d = 'M50,230 C150,' + (230 - bend * 2) + ' 230,' + (60 + bend) + ' 330,150 S500,' + (230 - bend) + ' 550,60';
    var streets = '';
    for (var i = 1; i < 6; i++) streets += '<line x1="' + (i * 100) + '" y1="0" x2="' + (i * 100 - 40) + '" y2="300" />';
    for (var j = 1; j < 4; j++) streets += '<line x1="0" y1="' + (j * 75) + '" x2="600" y2="' + (j * 75 + 20) + '" />';
    return '<svg viewBox="0 0 600 300" role="img" aria-label="Route from ' + fromLabel + ' to ' + toLabel + '">' +
      '<g stroke="#c3cfd2" stroke-width="10" fill="none">' + streets + '</g>' +
      '<path class="route-path" d="' + d + '" fill="none" stroke="#8da3a9" stroke-width="5" stroke-dasharray="2 9" stroke-linecap="round"/>' +
      '<path class="route-trail" d="' + d + '" fill="none" stroke="#0e4a5a" stroke-width="6" stroke-linecap="round"/>' +
      '<circle cx="50" cy="230" r="8" fill="#2b7a4b"/>' +
      '<rect x="541" y="51" width="18" height="18" fill="#b83226"/>' +
      '<circle class="unit-dot" cx="50" cy="230" r="10" fill="#fff" stroke="#b83226" stroke-width="4"/>' +
      '<text x="62" y="256" font-size="15" fill="#15232b" font-family="sans-serif">' + fromLabel + '</text>' +
      '<text x="540" y="92" font-size="15" fill="#15232b" font-family="sans-serif" text-anchor="end">' + toLabel + '</text>' +
      '</svg>';
  }

  function factRows(target, rows) {
    target.innerHTML = '';
    rows.forEach(function (r) {
      var d = document.createElement('div');
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = r[0]; dd.textContent = r[1];
      d.appendChild(dt); d.appendChild(dd); target.appendChild(d);
    });
  }

  /* ---------- journey legs: to the patient, then to the hospital ---------- */
  var leg = { key: '', minutes: 1, km: 0, p: 0, timer: null, path: null, trail: null, dot: null, len: 0 };

  function stopLeg() { clearInterval(leg.timer); leg.timer = null; }

  function paintLeg() {
    var pt = leg.path.getPointAtLength(leg.len * leg.p);
    leg.dot.setAttribute('cx', pt.x);
    leg.dot.setAttribute('cy', pt.y);
    leg.trail.style.strokeDashoffset = leg.len * (1 - leg.p);
    $('#etaMain').textContent = Math.ceil((1 - leg.p) * leg.minutes - 0.0001);
    $('#distMain').textContent = ((1 - leg.p) * leg.km).toFixed(1);
    $('#progFill').style.width = (leg.p * 100) + '%';
  }

  function startLeg(o) {
    stopLeg();
    var map = $('#mapMain');
    map.innerHTML = routeSVG(o.from, o.to, o.seed);
    leg.key = o.key; leg.minutes = Math.max(1, o.minutes); leg.km = o.km; leg.p = 0;
    leg.path = $('.route-path', map); leg.trail = $('.route-trail', map); leg.dot = $('.unit-dot', map);
    leg.len = leg.path.getTotalLength();
    leg.trail.style.strokeDasharray = leg.len;
    paintLeg();
    /* Demo speed: one displayed minute every 4 seconds.
       BACKEND / map: drive leg.p from the real GPS fix and the route returned by the routing service.
       Arrival can then be detected when the distance to the destination falls under about 50 metres. */
    leg.timer = setInterval(function () {
      leg.p = Math.min(1, leg.p + 0.5 / (leg.minutes * 4));
      paintLeg();
      if (leg.p >= 1) arriveLeg();
    }, 500);
  }

  function arriveLeg() {
    stopLeg();
    $('#mainAction').disabled = false;
    $('#actionHint').textContent = '';
    if (leg.key === 'pickup') {
      banner('You have reached the pickup location. Press Patient received once the patient is on board.');
      log('Reached the patient location');
    } else {
      log('Reached ' + state.hospital.h.name);
      openDone();
    }
  }

  function banner(text) {
    var b = $('#banner');
    b.classList.toggle('empty', !text);
    b.textContent = text || '\u00a0';
  }

  /* ---------- base screen phases ---------- */
  var PHASES = {
    pickup:   { line: 'Heading to patient', title: 'Pickup location', btn: 'Patient received' },
    intake:   { line: 'Patient on board', title: 'Patient details needed', btn: 'Enter patient details' },
    hospital: { line: 'Patient on board', title: 'Choose the hospital', btn: 'Choose hospital' },
    transit:  { line: 'Heading to hospital', title: '', btn: 'Confirm arrival at hospital' }
  };

  function setPhase(k) {
    state.phase = k;
    var ph = PHASES[k];
    $('#phaseLine').textContent = ph.line;
    $('#destTitle').textContent = (k === 'transit') ? state.hospital.h.name : ph.title;
    $('#mainAction').textContent = ph.btn;
    $('#mainAction').disabled = (k === 'pickup' || k === 'transit');
    $('#actionHint').textContent = k === 'pickup' ? 'Available once you reach the pickup location.'
      : (k === 'transit' ? 'Available once you reach the hospital.' : '');
    banner('');
  }

  /* ---------- temporary panels ---------- */
  function closeSheets() {
    document.body.classList.remove('sheet-open', 'sheet-full');
    $('#intakeSheet').hidden = true;
    $('#hospitalSheet').hidden = true;
    $('#sheetBack').hidden = true;
  }
  function openSheet(id) {
    closeSheets();
    $('#sheetBack').hidden = false;
    document.body.classList.add('sheet-open');
    if (id === 'intakeSheet') document.body.classList.add('sheet-full');
    $('#' + id).hidden = false;
    $('#' + id).scrollTop = 0;
  }
  $$('.sheet-hide').forEach(function (b) { b.onclick = closeSheets; });
  $('#sheetBack').onclick = closeSheets;
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('#doneBox').hidden) closeSheets();
  });

  /* ---------- incoming request ---------- */
  var SAMPLE_REQUESTS = [
    { caller: 'Meena R.', address: '14, Lake View Road, Adyar', complaint: 'Chest pain, difficulty breathing', priority: 'Priority 1', km: 4.2, eta: 9 },
    { caller: 'Suresh K.', address: 'Bus stand junction, Tambaram', complaint: 'Road accident, leg injury', priority: 'Priority 1', km: 6.8, eta: 13 },
    { caller: 'Fathima B.', address: '22, Gandhi Street, Velachery', complaint: 'Elderly patient, fainted at home', priority: 'Priority 2', km: 3.1, eta: 7 }
  ];

  $('#simBtn').onclick = function () {
    /* BACKEND: replaced by a push (websocket or SSE) carrying the assigned SOS. */
    var r = SAMPLE_REQUESTS[Math.floor(Math.random() * SAMPLE_REQUESTS.length)];
    receiveRequest({
      id: 'SOS-' + Math.floor(1000 + Math.random() * 9000),
      caller: r.caller, address: r.address, complaint: r.complaint,
      priority: r.priority, km: r.km, eta: r.eta
    });
  };

  function receiveRequest(r) {
    state.request = r;
    state.patient = null; state.hospital = null; state.notifiedAt = null;
    setStatus('busy', true);
    log('Request ' + r.id + ' assigned: ' + r.complaint);

    closeSheets();
    $('#doneBox').hidden = true;
    $('#informChip').hidden = true;
    $('#noticeBox').hidden = true;
    $('#reqPriority').textContent = r.priority;
    factRows($('#destFacts'), [
      ['Pickup address', r.address],
      ['Reported by', r.caller],
      ['Reported problem', r.complaint],
      ['Request', r.id],
      ['Your unit', state.user.unit],
      ['Crew', state.user.name]
    ]);
    show('trip');
    startLeg({ key: 'pickup', minutes: r.eta, km: r.km, from: 'Your unit', to: 'Patient', seed: (r.km * 10) | 0 });
    setPhase('pickup');
    banner('Emergency assigned to your unit. Head to the pickup location.');
  }

  $('#mainAction').onclick = function () {
    var k = state.phase;
    if (k === 'pickup') {
      if (leg.timer) return;
      stopLeg();
      leg.p = 1; paintLeg();
      log('Patient received on board');
      prefillFromProfile(null);
      setPhase('intake');
      openSheet('intakeSheet');
    } else if (k === 'intake') {
      openSheet('intakeSheet');
    } else if (k === 'hospital') {
      openSheet('hospitalSheet');
    } else if (k === 'transit') {
      if (leg.timer) return;
      openDone();
    }
  };

  $('#skipBtn').onclick = function () {
    if (!leg.timer) return;
    leg.p = 1; paintLeg(); arriveLeg();
  };

  /* ---------- patient details ---------- */
  /* BACKEND: if the patient is signed in to the user app, pass their profile here.
     Expected shape: { name, age, sex, conditions, allergies, medicines, bloodGroup } */
  function prefillFromProfile(profile) {
    var note = $('#profileNote'), f = $('#intakeForm');
    f.reset();
    $('#intakeMsg').textContent = '';
    if (!profile) {
      note.className = 'profile-note';
      note.textContent = 'Patient profile: not linked. If the patient is signed in, their saved details will fill in here.';
      return;
    }
    f.elements.pname.value = profile.name || '';
    f.elements.age.value = profile.age || '';
    f.elements.sex.value = profile.sex || '';
    note.className = 'profile-note linked';
    note.textContent = 'Patient profile linked. Known conditions: ' + (profile.conditions || 'none recorded') +
      '. Allergies: ' + (profile.allergies || 'none recorded') + '.';
  }

  $('#intakeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    if (!f.elements.symptoms.value.trim()) {
      $('#intakeMsg').textContent = 'Describe the main complaint before searching for a hospital.';
      f.elements.symptoms.focus();
      return;
    }
    state.patient = {
      name: f.elements.pname.value.trim() || 'Unknown',
      age: f.elements.age.value, sex: f.elements.sex.value,
      symptoms: f.elements.symptoms.value.trim(),
      pulse: f.elements.pulse.value, bp: f.elements.bp.value.trim(),
      spo2: f.elements.spo2.value, temp: f.elements.temp.value,
      avpu: f.elements.avpu.value,
      needs: $$('input[name=need]:checked', f).map(function (c) { return c.value; }),
      given: f.elements.given.value.trim()
    };
    log('Patient details recorded');
    findHospitals();
  });

  /* ---------- hospital search ---------- */
  var HOSPITAL_DB = [
    { name: 'Government General Hospital', area: 'Park Town', phone: '044 2530 5000', km: 7.4, eta: 16, beds: 6, has: ['Cardiac care', 'Trauma and orthopaedics', 'Neurology', 'ICU bed', 'Ventilator', 'Blood bank', 'Burns unit', 'Maternity'] },
    { name: 'Southern Heart Institute', area: 'Adyar', phone: '044 2491 1100', km: 3.9, eta: 9, beds: 3, has: ['Cardiac care', 'ICU bed', 'Ventilator', 'Blood bank'] },
    { name: 'Lakeside Trauma Centre', area: 'Guindy', phone: '044 2234 7788', km: 5.6, eta: 12, beds: 4, has: ['Trauma and orthopaedics', 'ICU bed', 'Blood bank', 'Burns unit'] },
    { name: 'St. Matthew Community Hospital', area: 'Velachery', phone: '044 2259 3030', km: 2.7, eta: 6, beds: 8, has: ['Maternity', 'Blood bank', 'ICU bed'] }
  ];

  function findHospitals() {
    /* BACKEND: POST /hospitals/match with the patient summary and the live GPS position.
       The server returns ranked hospitals with live ETA and bed availability.
       The scoring below only imitates that so the interface has something to show. */
    var wanted = state.patient.needs;
    state.hospitals = HOSPITAL_DB.map(function (h) {
      var met = wanted.filter(function (n) { return h.has.indexOf(n) > -1; });
      var missing = wanted.filter(function (n) { return h.has.indexOf(n) === -1; });
      var score = (wanted.length ? met.length / wanted.length : 1) * 100 - h.eta * 2 + Math.min(h.beds, 5);
      return { h: h, met: met, missing: missing, score: score };
    }).sort(function (a, b) { return b.score - a.score; });
    chooseHospital(0, true);
    setPhase('hospital');
    openSheet('hospitalSheet');
  }

  function chooseHospital(i, first) {
    var r = state.hospitals[i], h = r.h;
    state.hospital = r;
    $('#hName').textContent = h.name;
    $('#hAddr').textContent = h.area + ', Chennai';
    $('#matchPill').textContent = first ? 'Best match' : 'Selected by crew';
    $('#mapHospital').innerHTML = routeSVG('Patient pickup', h.name, h.eta);
    $('#etaHospital').textContent = h.eta;
    $('#distHospital').textContent = h.km + ' km';
    factRows($('#hFacts'), [
      ['Needs covered', r.met.length ? r.met.join(', ') : 'No specific needs entered'],
      ['Not available', r.missing.length ? r.missing.join(', ') : 'None'],
      ['Beds free now', String(h.beds)],
      ['Casualty desk', h.phone]
    ]);
    log(first ? 'Recommended hospital: ' + h.name : 'Hospital changed to ' + h.name);
    renderAlternatives();
  }

  function renderAlternatives() {
    var ul = $('#alts');
    ul.innerHTML = '';
    state.hospitals.forEach(function (r, i) {
      if (r === state.hospital) return;
      var li = document.createElement('li');
      var left = document.createElement('div');
      var name = document.createElement('strong'); name.textContent = r.h.name;
      var sm = document.createElement('small');
      sm.textContent = r.h.area + (r.missing.length ? ' - lacks ' + r.missing.join(', ') : ' - covers all needs');
      left.appendChild(name); left.appendChild(sm);
      var meta = document.createElement('span'); meta.textContent = r.h.eta + ' min, ' + r.h.km + ' km';
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn ghost'; b.textContent = 'Use this hospital';
      b.onclick = function () { chooseHospital(i, false); };
      li.appendChild(left); li.appendChild(meta); li.appendChild(b);
      ul.appendChild(li);
    });
  }

  /* ---------- lock the hospital: journey starts, hospital is informed automatically ---------- */
  function buildNotice() {
    var p = state.patient, r = state.request, h = state.hospital.h;
    var vitals = [];
    if (p.pulse) vitals.push('pulse ' + p.pulse);
    if (p.bp) vitals.push('BP ' + p.bp);
    if (p.spo2) vitals.push('SpO2 ' + p.spo2 + '%');
    if (p.temp) vitals.push('temp ' + p.temp + ' C');
    return [
      'To: Casualty desk, ' + h.name,
      'From: Unit ' + state.user.unit + ', ' + state.user.name + ' (' + state.user.role + ')',
      'Expected arrival: about ' + h.eta + ' minutes',
      'Unit location: ' + (Tracker.fix ? fmtFix(Tracker.fix) : 'live tracking will be shared by dispatch'),
      '',
      'Patient: ' + p.name + (p.age ? ', ' + p.age + ' years' : '') + (p.sex ? ', ' + p.sex.toLowerCase() : ''),
      'Reported problem: ' + r.complaint,
      'Symptoms: ' + p.symptoms,
      'Consciousness: ' + p.avpu,
      'Vitals: ' + (vitals.length ? vitals.join(', ') : 'not recorded'),
      'Treatment given: ' + (p.given || 'none'),
      'Please prepare: ' + (p.needs.length ? p.needs.join(', ') : 'general casualty assessment')
    ].join('\n');
  }

  function notifyHospital(h, message) {
    /* BACKEND: POST /hospitals/:id/notify with the message, the patient summary and the unit position.
       Keep sending position updates for the whole journey so the hospital sees the ETA change. */
    state.notifiedAt = stamp();
    $('#informChip').textContent = 'Hospital informed automatically at ' + state.notifiedAt;
    $('#informChip').hidden = false;
    $('#noticeText').textContent = message;
    $('#noticeBox').hidden = false;
    $('#noticeBox').open = false;
    log('Hospital informed: ' + h.name);
  }

  $('#startHospitalBtn').onclick = function () {
    var h = state.hospital.h, p = state.patient;
    notifyHospital(h, buildNotice());
    closeSheets();
    setPhase('transit');
    factRows($('#destFacts'), [
      ['Hospital', h.name],
      ['Address', h.area + ', Chennai'],
      ['Casualty desk', h.phone],
      ['Patient', p.name + (p.age ? ', ' + p.age + ' years' : '')],
      ['Prepared for', p.needs.length ? p.needs.join(', ') : 'General casualty assessment'],
      ['Request', state.request.id]
    ]);
    startLeg({ key: 'hospital', minutes: h.eta, km: h.km, from: 'Patient pickup', to: h.name, seed: h.eta });
    banner('Journey locked to ' + h.name + '. Its casualty desk has been informed.');
  };

  /* ---------- destination reached ---------- */
  function openDone() {
    $('#doneText').textContent = 'You have reached ' + state.hospital.h.name + '. Has the patient been handed over to the hospital staff?';
    $('#doneBox').hidden = false;
    $('#doneYes').focus();
  }

  $('#doneYes').onclick = function () {
    stopLeg();
    $('#doneBox').hidden = true;
    /* BACKEND: POST /requests/:id/close */
    state.trips += 1;
    $('#tripCount').textContent = state.trips;
    log('Ride completed at ' + state.hospital.h.name);
    state.request = null; state.patient = null; state.hospital = null;
    setStatus('available', true);
    show('dash');
  };

  $('#doneNo').onclick = function () {
    $('#doneBox').hidden = true;
    banner('Destination reached. Press Confirm arrival at hospital once the patient is handed over.');
  };

  Tracker.paint();
  show('auth');
})();
