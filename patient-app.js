(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const now = () => new Date().toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
  const safe = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sampleHistory = [
    {id:"MR-HIST-2026-021",date:"Oct 12, 2026 · 14:25",status:"Completed · sample",hospital:"Riverside General Hospital",type:"Medical emergency"},
    {id:"MR-HIST-2026-008",date:"Sep 03, 2026 · 09:10",status:"Completed · sample",hospital:"Central Community Hospital",type:"Road accident"}
  ];
  const initialProfile = {name:"Patient Demo",email:"demo@mediroute.test",phone:"",blood:"",emergencyContact:"",id:"MR-1042"};
  let state = {};
  let pickupSearchResults = [];
  let nearbyHospitalResults = [];
  let locationLookupSequence = 0;
  let lastAutoLocationAddress = "";
  let lastAutoLocationLabel = "";
  function resetState(){
    state = {loggedIn:false,guestEmergency:false,profile:{...initialProfile},active:null,history:[...sampleHistory],notifications:[
      {id:1,title:"Welcome to Medi Route",body:"Explore the patient-side academic prototype. No real emergency services are connected.",time:now(),read:false,kind:"info",page:"help"}
    ],nextNotification:2,location:null,locationDraft:null,locationConfirmed:false,wizardStep:1,details:{type:"",description:"",contact:"",blood:""},routeUpdateCount:0,trackingMode:"normal",failureMode:"none"};
    pickupSearchResults=[];nearbyHospitalResults=[];
  }
  resetState();
  const titles = {dashboard:"Home",emergency:"Emergency",request:"Request details",tracking:"Track journey",hospital:"Hospital destination",intake:"Intake preview",profile:"My Profile",notifications:"Notifications",history:"Journey history",more:"My Medi Route","help":"Help & prototype"};
  function toast(title,body,kind="info"){
    const key=`${kind}|${title}|${body}`;
    const area=$("toastArea");
    const existing=[...area.children].find(item=>item.dataset.toastKey===key);
    if(existing)return;
    const el=document.createElement("div");el.className="toast";el.dataset.toastKey=key;
    el.innerHTML=`<div>${kind==="success"?"✓":kind==="error"?"!":"●"}</div><div><strong>${safe(title)}</strong><span>${safe(body)}</span></div>`;
    area.appendChild(el);setTimeout(()=>el.remove(),4200);
  }
  function addNotification(title,body,kind="info",page="request"){
    state.notifications.unshift({id:state.nextNotification++,title,body,time:now(),read:false,kind,page});renderNotificationBits();
  }
  function unreadCount(){return state.notifications.filter(n=>!n.read).length}
  function renderNotificationBits(){
    const n=unreadCount();$("topUnreadDot").classList.toggle("hidden",n===0);const sideUnread=$("sideUnread");if(sideUnread){sideUnread.classList.toggle("hidden",n===0);sideUnread.textContent=n;}
    const recent=state.notifications.slice(0,3);
    $("dashboardNotifications").innerHTML=recent.length?recent.map(n=>`<div class="list-item"><div class="list-icon">${n.kind==="success"?"✓":"♧"}</div><div class="list-copy"><strong>${safe(n.title)} ${n.read?"":'<span class="pill teal">New</span>'}</strong><span>${safe(n.body)} · ${safe(n.time)}</span></div></div>`).join(""):`<div class="empty"><p>No notifications yet.</p></div>`;
    $("notificationList").innerHTML=state.notifications.length?state.notifications.map(n=>`<div class="list-item" style="${n.read?"opacity:.72":""}"><div class="list-icon">${n.kind==="success"?"✓":n.kind==="error"?"!":"♧"}</div><div class="list-copy"><strong>${safe(n.title)} ${n.read?"":'<span class="pill teal">Unread</span>'}</strong><span>${safe(n.body)} · ${safe(n.time)}</span><div class="actions" style="margin-top:9px"><button class="btn outline" data-notif-page="${safe(n.page)}" data-notif-id="${n.id}">View related page</button>${n.read?"":`<button class="btn secondary" data-read-id="${n.id}">Mark read</button>`}</div></div></div>`).join(""):`<div class="empty"><div class="empty-icon">♧</div><h3>You're all caught up</h3><p>Updates related to your demo request will appear here.</p></div>`;
  }
  function go(page){
    if(!titles[page])page="dashboard";
    document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
    $("page-"+page).classList.add("active");
    document.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
    $("topTitle").textContent=titles[page];window.scrollTo({top:0,behavior:"smooth"});
    renderPage(page);
    if(page==="emergency")prefillEmergencyProfile();
  }
  function renderPage(page){
    if(page==="dashboard")renderDashboard();
    if(page==="request")renderRequest();
    if(page==="tracking")renderTracking();
    if(page==="hospital")renderHospital();
    if(page==="intake")renderIntake();
    if(page==="profile")renderProfile();
    if(page==="history")renderHistory();
    if(page==="notifications")renderNotificationBits();
    if(page==="more")renderMore();
    if(page==="emergency")renderEmergency();
  }
  function currentStage(){
    if(!state.active)return -1;
    return ({submitted:0,searching:1,assigned:2,approaching:3,pickedup:4,enroute:5,arrived:6,completed:7,unavailable:1})[state.active.status]??0;
  }
  function statusLabel(s){return ({submitted:"Request submitted",searching:"Searching for an ambulance",assigned:"Ambulance assigned",approaching:"Ambulance approaching",pickedup:"Patient picked up",enroute:"En route to hospital",arrived:"Arrived at hospital",completed:"Journey completed",unavailable:"No ambulance available"})[s]||"Status unavailable"}
  function statusPill(s){let cls=["completed","arrived"].includes(s)?"green":["unavailable"].includes(s)?"red":["submitted","searching"].includes(s)?"amber":"teal";return `<span class="pill ${cls}">${safe(statusLabel(s))}</span>`}
  function renderDashboard(){
    $("welcomeTitle").textContent=`Good to see you, ${state.profile.name.split(" ")[0]}`;
    $("sideName").textContent=state.profile.name;$("sideAvatar").textContent=state.profile.name.charAt(0).toUpperCase()||"P";
    $("dashPatientId").textContent=state.profile.id;$("dashName").textContent=state.profile.name;$("dashEmail").textContent=state.profile.email;$("dashBlood").textContent=state.profile.blood||"Not provided";
    const filled=[state.profile.name,state.profile.email,state.profile.phone,state.profile.blood,state.profile.emergencyContact].filter(Boolean).length;
    const percent=Math.round(filled/5*100);$("profileComplete").textContent=percent+"%";$("historyCount").textContent=state.history.length;
    $("dashboardIdle").classList.toggle("hidden",!!state.active);$("activeEmergencyBlock").classList.toggle("hidden",!state.active);
    if(state.active){
      const a=state.active;
      const etaLabel=["assigned","approaching"].includes(a.status)?"ETA TO PICKUP":["pickedup","enroute"].includes(a.status)?"ETA TO HOSPITAL":"ESTIMATED ARRIVAL";
      const etaText=a.eta!==null&&a.eta!==undefined?`${a.eta} min`:"—";
      const destinationNote=a.hospital?.coords?(a.liveDispatch?"Selected by compounder":"Map-listed demo destination"):"Waiting for compounder destination";
      $("activeEmergencyBlock").innerHTML=`<div class="card section-gap"><div class="split-head"><div><span class="eyebrow">Active demo request</span><h2 style="margin-top:5px">${safe(a.id)}</h2></div>${statusPill(a.status)}</div><div class="grid three"><div class="metric"><div class="metric-label">CURRENT STATUS</div><div class="metric-value" style="font-size:18px">${safe(statusLabel(a.status))}</div><div class="metric-foot">Updated ${safe(a.updated)}</div></div><div class="metric"><div class="metric-label">${safe(etaLabel)}</div><div class="metric-value">${safe(etaText)}</div><div class="metric-foot">${a.eta!==null&&a.eta!==undefined?"OSRM road estimate":"Not available yet"}</div></div><div class="metric"><div class="metric-label">DESTINATION</div><div class="metric-value" style="font-size:16px">${safe(a.hospital?.name||"Pending")}</div><div class="metric-foot">${safe(destinationNote)}</div></div></div><div class="actions"><button class="btn primary" data-goto="tracking">Open journey tracking →</button><button class="btn outline" data-goto="request">Request details</button>${a.status==="completed"?'<button class="btn secondary" id="newEmergencyBtn">Start a new demo request</button>':""}</div></div>`;
      $("activeEmergencyBlock").querySelector("#newEmergencyBtn")?.addEventListener("click",()=>startNewEmergency());
    }
    $("dashboardHistory").innerHTML=historyRows(state.history.slice(0,3));
    renderNotificationBits();
  }
  function historyRows(items){
    if(!items.length)return `<div class="empty"><div class="empty-icon">◷</div><h3>No journeys yet</h3><p>Completed and sample demo journeys will appear here.</p><button class="btn primary" data-goto="emergency">Start a demo request</button></div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Request reference</th><th>Date</th><th>Journey type</th><th>Status</th><th>Destination</th></tr></thead><tbody>${items.map(x=>`<tr><td><strong>${safe(x.id)}</strong></td><td>${safe(x.date)}</td><td>${safe(x.type||"Demo journey")}</td><td><span class="pill green">${safe(x.status)}</span></td><td>${safe(x.hospital||"Not assigned")}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderMore(){
    $("moreName").textContent=state.profile.name;
    $("moreEmail").textContent=state.profile.email;
    $("moreNotifications").innerHTML=state.notifications.length?state.notifications.slice(0,2).map(n=>`<div class="list-item"><div class="list-copy"><strong>${safe(n.title)}</strong><span>${safe(n.time)}</span></div></div>`).join(""):`<p class="muted small">No notifications yet.</p>`;
    $("moreRequestSummary").innerHTML=state.active?`<div class="list-item"><div class="list-copy"><strong>${safe(state.active.id)}</strong><span>${safe(statusLabel(state.active.status))}</span></div>${statusPill(state.active.status)}</div>`:`<p class="muted small">No active request. Start an emergency request if you want to explore the journey flow.</p>`;
    $("moreHistorySummary").innerHTML=state.history.length?`<p class="muted small">${state.history.length} journey record${state.history.length===1?"":"s"} available.</p>`:`<p class="muted small">No journey records yet.</p>`;
  }
  function renderPickupCoordinates(point){
    const hasPoint=!!point&&Number.isFinite(Number(point.lat))&&Number.isFinite(Number(point.lng));
    const set=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
    if(!hasPoint){
      set("pickupLatitude","—");set("pickupLongitude","—");
      set("pickupAccuracy","Not available");set("pickupLocationSource","Not detected");
      set("pickupCoordinateHint","Use Detect my location or select a point on the map.");
      set("pickupCoordinateNote","Coordinates come directly from the browser's device-location result or from the point you select on the map. No IP-based location fallback is used.");
      return;
    }
    const lat=Number(point.lat),lng=Number(point.lng);
    const accuracy=Number(point.accuracy);
    const source=String(point.source||"map-pin");
    const sourceLabel=source==="gps"?"Device location (macOS / Chrome)":source==="nominatim"?"OpenStreetMap place search":source==="map-pin"?"Selected on map":"Selected location";
    set("pickupLatitude",lat.toFixed(6));set("pickupLongitude",lng.toFixed(6));
    set("pickupAccuracy",Number.isFinite(accuracy)&&accuracy>0?`±${Math.round(accuracy)} m`:(source==="gps"?"Not reported by device":"Not available"));
    set("pickupLocationSource",sourceLabel);
    set("pickupCoordinateHint",source==="gps"?"Device location received. Check its accuracy and confirm the pickup point.":"Selected map coordinates. Confirm that the pin is at the correct pickup point.");
    set("pickupCoordinateNote",source==="gps"?"These are the coordinates returned by Chrome's device-location API using macOS Location Services. No IP-based estimate is used.":"The displayed coordinates are the exact map point selected. Drag the marker or tap the map to adjust it.");
  }

  function renderEmergency(){
    const existing=!!state.active&&state.active.status!=="completed";
    $("emergencyExisting").classList.toggle("hidden",!existing);$("emergencyWizard").classList.toggle("hidden",existing);
    if(existing){$("emergencyExisting").innerHTML=`<div class="empty"><div class="empty-icon">✚</div><h2>You already have an active demo request</h2><p>Continue to your current request rather than creating another active journey.</p><p>${statusPill(state.active.status)}</p><div class="actions" style="justify-content:center"><button class="btn primary" data-goto="request">View request</button><button class="btn outline" data-goto="tracking">Open tracking</button></div></div>`;return}
    setWizardStep(state.wizardStep);
    if(state.locationConfirmed&&state.location){
      $("locationConfirmed").classList.remove("hidden");
      $("confirmedLocationText").textContent=state.location.address;
      $("confirmedCoords").textContent=state.location.coords?`Coordinates: ${state.location.coords.lat.toFixed(5)}, ${state.location.coords.lng.toFixed(5)} · ${state.location.source||"map point"}`:"Manual address · map coordinates not available";
      $("nextLocation").disabled=false;
    } else {
      $("locationConfirmed").classList.add("hidden");
      $("nextLocation").disabled=true;
    }
    const point=state.locationDraft?.coords||state.location?.coords||null;
    renderPickupCoordinates(point?{...point,source:state.locationDraft?.source||state.location?.source,accuracy:state.locationDraft?.accuracy}:null);
    if(window.MediRouteMaps){
      const mapPoint=point?{...point,accuracy:state.locationDraft?.accuracy??state.location?.accuracy}:null;
      const ready=window.MediRouteMaps.initPickupMap(onPickupMapPicked,mapPoint);
      if(!ready&&$("pickupMapStatus"))$("pickupMapStatus").textContent="The map library could not load. You can still enter a pickup address manually; reload the page to retry the map.";
    } else if($("pickupMapStatus")) {
      $("pickupMapStatus").textContent="Map library is not available. You can still enter a pickup address manually.";
    }
  }
  function onPickupMapPicked(point){
    if(!point||!Number.isFinite(Number(point.lat))||!Number.isFinite(Number(point.lng)))return;
    const lat=Number(point.lat),lng=Number(point.lng);
    const inputAddressBeforeLookup=$("manualAddress").value;
    const inputLabelBeforeLookup=$("locationLabel").value;
    state.locationDraft={
      ...(state.locationDraft||{}),
      address:inputAddressBeforeLookup.trim()||state.locationDraft?.address||`Selected map point (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
      coords:{lat,lng},
      source:point.source||"map-pin",
      ...(Number.isFinite(Number(point.accuracy))?{accuracy:Number(point.accuracy)}:{}),
      ...(Number.isFinite(Number(point.timestamp))?{timestamp:Number(point.timestamp)}:{})
    };
    state.locationConfirmed=false;
    renderPickupCoordinates({lat,lng,source:point.source||"map-pin",accuracy:point.accuracy});
    $("locationConfirmed").classList.add("hidden");
    $("nextLocation").disabled=true;
    const lookupId=++locationLookupSequence;
    const gpsAccuracy=Number.isFinite(Number(point.accuracy))?` · reported accuracy ±${Math.round(Number(point.accuracy))} m`:"";
    $("locationFeedback").textContent=`Map centred on ${lat.toFixed(5)}, ${lng.toFixed(5)}${gpsAccuracy}. Looking up the nearest readable address…`;

    // Convert GPS/map coordinates into readable address fields. This is a
    // reverse-geocoding request, so it is queued under Nominatim's rate limit.
    if(window.MediRouteMaps?.reverseGeocode){
      window.MediRouteMaps.reverseGeocode({lat,lng}).then(result=>{
        if(lookupId!==locationLookupSequence)return;
        const current=state.locationDraft?.coords;
        if(!current||Math.abs(current.lat-lat)>0.00001||Math.abs(current.lng-lng)>0.00001)return;
        const address=result.displayName;
        const currentAddress=$("manualAddress").value;
        if(currentAddress===inputAddressBeforeLookup||currentAddress===lastAutoLocationAddress||!currentAddress.trim()){
          $("manualAddress").value=address;
          lastAutoLocationAddress=address;
        }
        const currentLabel=$("locationLabel").value;
        if(result.locality&&(currentLabel===inputLabelBeforeLookup||currentLabel===lastAutoLocationLabel||!currentLabel.trim())){
          $("locationLabel").value=result.locality;
          lastAutoLocationLabel=result.locality;
        }
        state.locationDraft.address=address;
        $("locationFeedback").textContent=`Address found: ${address}. The map pin is centred on the selected point. Confirm only after checking the pickup point.`;
      }).catch(error=>{
        if(lookupId!==locationLookupSequence)return;
        $("locationFeedback").textContent=`Map point selected (${lat.toFixed(5)}, ${lng.toFixed(5)}), but the address lookup failed. ${error.message||"Enter the address manually if needed."}`;
      });
    } else {
      $("locationFeedback").textContent=`Pickup point selected at ${lat.toFixed(5)}, ${lng.toFixed(5)}. Enter an address manually and confirm this point.`;
    }
  }
  function setWizardStep(step){
    state.wizardStep=step;
    [1,2,3].forEach(n=>$("wizardStep"+n).classList.toggle("hidden",n!==step));
    document.querySelectorAll("[data-step-ind]").forEach(el=>{const n=Number(el.dataset.stepInd);el.classList.toggle("current",n===step);el.classList.toggle("done",n<step);el.querySelector(".step-circle").textContent=n<step?"✓":String(n)});
    if(step===1&&window.MediRouteMaps){requestAnimationFrame(()=>{const point=state.locationDraft?.coords||state.location?.coords||null;const mapPoint=point?{...point,accuracy:state.locationDraft?.accuracy??state.location?.accuracy}:null;window.MediRouteMaps.initPickupMap(onPickupMapPicked,mapPoint);});}
  }
  function confirmManual(){
    const address=$("manualAddress").value.trim();
    const draft=state.locationDraft;
    const hasPoint=!!draft?.coords;
    if(!hasPoint&&address.length<5){toast("Pickup location needed","Enter a more complete address or select a point on the map.","error");$("manualAddress").focus();return}
    const label=$("locationLabel").value.trim();
    const baseAddress=address||(hasPoint?(draft.address||"Selected map pin"):"");
    state.location={
      address:(label?label+" — ":"")+baseAddress,
      coords:hasPoint?{...draft.coords}:null,
      source:hasPoint?(draft.source||"map-pin"):"manual",
      ...(hasPoint&&Number.isFinite(Number(draft.accuracy))?{accuracy:Number(draft.accuracy)}:{})
    };
    state.locationDraft=null;state.locationConfirmed=true;
    $("locationFeedback").textContent=hasPoint?"Pickup point confirmed. The road route can use these coordinates.":"Manual pickup address confirmed. Add a map point later if you want a road-route preview.";
    renderEmergency();toast("Location confirmed","Your pickup location is saved in this browser demo.","success");
  }
  $("confirmLocation").addEventListener("click",confirmManual);
  $("clearPickupPin").addEventListener("click",()=>{
    state.locationDraft=null;state.location=null;state.locationConfirmed=false;
    window.MediRouteMaps?.clearPickupMarker();
    renderPickupCoordinates(null);
    $("locationConfirmed").classList.add("hidden");$("nextLocation").disabled=true;
    $("locationFeedback").textContent="Map pin cleared. Confirm the manual pickup address to continue.";
    toast("Map pin cleared","You can now use only the manually entered address.","info");
  });
  $("searchLocationBtn").addEventListener("click",async()=>{
    const query=$("locationSearchQuery").value.trim();
    const button=$("searchLocationBtn"),status=$("pickupSearchStatus"),resultsRoot=$("pickupSearchResults");
    if(!window.MediRouteMaps){status.textContent="Map services are unavailable. Reload the page or enter the address manually.";return}
    if(query.length<3){status.textContent="Enter at least 3 characters for a public place or landmark search.";return}
    button.disabled=true;button.textContent="Searching…";status.textContent="Searching OpenStreetMap place data…";resultsRoot.innerHTML="";
    try{
      pickupSearchResults=await window.MediRouteMaps.searchPlaces(query,{limit:6});
      if(!pickupSearchResults.length){status.textContent="No matching places found. Try a nearby landmark, area or station name.";return}
      status.textContent=`${pickupSearchResults.length} result${pickupSearchResults.length===1?"":"s"}. Select the correct pickup point.`;
      resultsRoot.innerHTML=pickupSearchResults.map((item,index)=>`<div class="list-item"><div class="list-icon">⌖</div><div class="list-copy"><strong>${safe(item.name)}</strong><span>${safe(item.displayName)}</span><div class="actions" style="margin-top:7px"><button class="btn outline" type="button" data-pickup-result="${index}">Use this point</button></div></div></div>`).join("");
    }catch(error){status.textContent=error.message||"Place search failed. Try again or enter a manual address.";}
    finally{button.disabled=false;button.textContent="Search map";}
  });
  function requestPositionOnce(options){
    return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,options));
  }
  function requestPositionFromWatch(timeoutMs=15000,enableHighAccuracy=true){
    return new Promise((resolve,reject)=>{
      if(typeof navigator.geolocation.watchPosition!=="function"){
        reject(Object.assign(new Error("Continuous location updates are not supported by this browser."),{code:"UNSUPPORTED"}));
        return;
      }
      let watchId=null,settled=false,lastError=null;
      const finish=(callback,value)=>{
        if(settled)return;
        settled=true;
        if(watchId!==null)navigator.geolocation.clearWatch(watchId);
        clearTimeout(timer);callback(value);
      };
      const timer=setTimeout(()=>finish(reject,lastError||Object.assign(new Error("No device-location update was received."),{code:3})),timeoutMs);
      watchId=navigator.geolocation.watchPosition(
        position=>finish(resolve,position),
        error=>{lastError=error;finish(reject,error);},
        {enableHighAccuracy,timeout:timeoutMs,maximumAge:0}
      );
    });
  }
  async function browserPermissionState(){
    try{
      if(!navigator.permissions?.query)return "unknown";
      const result=await navigator.permissions.query({name:"geolocation"});
      return result.state||"unknown";
    }catch{return "unknown";}
  }
  async function requestBrowserPosition(onProgress=()=>{}){
    if(!window.isSecureContext){
      throw Object.assign(new Error("Location access requires HTTPS or localhost. Open this site through http://127.0.0.1 or an HTTPS address, not file://."),{code:"INSECURE_CONTEXT"});
    }
    if(!navigator.geolocation){
      throw Object.assign(new Error("This browser does not expose device-location services. Use a current Chrome or Safari browser, or select the pickup point on the map."),{code:"UNSUPPORTED"});
    }
    const permission=await browserPermissionState();
    if(permission==="denied")throw Object.assign(new Error("Location permission is blocked for this site. Allow Location for 127.0.0.1 in Chrome site settings, then retry."),{code:1});

    let lastError=null;
    onProgress(0);
    try{
      // Always request a fresh device location. Do not reuse stale cached fixes
      // and do not estimate a location from the public IP address.
      return await requestPositionOnce({enableHighAccuracy:true,timeout:20000,maximumAge:0});
    }catch(error){lastError=error;if(error?.code===1)throw error;}
    onProgress(1);
    try{
      // macOS may take a moment to resolve the browser's location from nearby
      // Wi-Fi networks. A short watch keeps the request alive for a fresh fix.
      return await requestPositionFromWatch(15000,true);
    }catch(error){lastError=error;if(error?.code===1)throw error;}
    onProgress(2);
    try{
      // Some platform providers return a fix only when high accuracy is not
      // requested. This is still the browser/macOS Location Services result.
      return await requestPositionOnce({enableHighAccuracy:false,timeout:12000,maximumAge:0});
    }catch(error){if(error?.code===1)throw error;lastError=error||lastError;}
    throw lastError||Object.assign(new Error("macOS and Chrome did not return a device location."),{code:2});
  }
  function locationErrorMessage(error,permissionState="unknown"){
    if(error?.code==="INSECURE_CONTEXT"||error?.code==="UNSUPPORTED")return error.message;
    if(error?.code===1||permissionState==="denied")return "Location permission is blocked. In Chrome, open the site controls beside the address, set Location to Allow, and retry. Also make sure Location Services is enabled for Google Chrome in macOS System Settings → Privacy & Security → Location Services.";
    if(error?.code===2)return "macOS/Chrome could not return a device location. MediRoute has not used your IP address or an approximate fallback. Make sure Wi‑Fi is turned on and Location Services is enabled for Google Chrome in macOS System Settings → Privacy & Security → Location Services. In Chrome site settings for 127.0.0.1, set Location to Allow, then retry.";
    if(error?.code===3)return "The device-location request timed out. Keep Wi‑Fi on, check that macOS Location Services and Chrome's site permission are enabled, then retry.";
    return "The browser could not detect the device location. Check macOS and Chrome location permissions, then retry or select a pickup point on the map.";
  }
  function showLocationFailure(error,permissionState="unknown"){
    const feedback=$("locationFeedback");
    feedback.textContent=locationErrorMessage(error,permissionState);
  }
  let locationRequestInProgress=false;
  $("detectLocation").addEventListener("click",async()=>{
    if(locationRequestInProgress)return;
    locationRequestInProgress=true;
    const btn=$("detectLocation"),feedback=$("locationFeedback");
    btn.disabled=true;btn.textContent="⌖ Detecting location…";
    feedback.textContent="Requesting a fresh location from Chrome and macOS Location Services…";
    try{
      const position=await requestBrowserPosition(stage=>{
        const messages=[
          "Requesting a fresh high-accuracy device location…",
          "Waiting for a fresh macOS location update…",
          "Retrying with the browser's standard device-location setting…"
        ];
        feedback.textContent=messages[stage]||messages[messages.length-1];
      });
      const lat=Number(position.coords.latitude),lng=Number(position.coords.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw Object.assign(new Error("The browser returned invalid coordinates. Select a point on the map instead."),{code:"INVALID_POSITION"});
      const accuracy=Number.isFinite(Number(position.coords.accuracy))?Number(position.coords.accuracy):null;
      const timestamp=Number(position.timestamp)||Date.now();
      state.locationDraft={address:"Current device location",coords:{lat,lng},source:"gps",accuracy,timestamp};
      state.locationConfirmed=false;
      let mapReady=false;
      if(window.MediRouteMaps){
        mapReady=window.MediRouteMaps.initPickupMap(onPickupMapPicked,{lat,lng,accuracy});
        window.MediRouteMaps.updatePickupMap({lat,lng,accuracy});
      }
      onPickupMapPicked({lat,lng,source:"gps",accuracy,timestamp});
      const accuracyText=accuracy!==null?` Browser-reported accuracy: approximately ±${Math.round(accuracy)} m.`:"";
      const ageSeconds=Math.max(0,Math.round((Date.now()-timestamp)/1000));
      const ageText=ageSeconds>60?` Fix age: ${Math.round(ageSeconds/60)} min.`:"";
      const precisionNote=accuracy!==null&&accuracy>1000?" The reported accuracy is low; check the pin carefully.":"";
      renderPickupCoordinates({lat,lng,source:"gps",accuracy});
      feedback.textContent=`Device location received (${lat.toFixed(6)}, ${lng.toFixed(6)}).${accuracyText}${ageText}${precisionNote} ${mapReady?"Check the marker and confirm the pickup location.":"Coordinates were received; verify the pickup point before confirming."}`;
      $("locationConfirmed").classList.add("hidden");$("nextLocation").disabled=true;
      toast("Device location detected","Check the map pin and confirm the pickup point.","success");
    }catch(error){
      if(error?.code==="INVALID_POSITION")feedback.textContent=error.message;
      else {
        const permissionState=await browserPermissionState();
        showLocationFailure(error,permissionState);
      }
      console.warn("MediRoute browser geolocation failed:",{code:error?.code,message:error?.message});
    }finally{
      locationRequestInProgress=false;
      btn.disabled=false;btn.textContent="⌖ Detect my location";
    }
  });
  $("nextLocation").addEventListener("click",()=>{if(!state.locationConfirmed){toast("Confirm location first","Choose a map point or manual address and confirm it before continuing.","error");return}setWizardStep(2)});
  $("backDetails").addEventListener("click",()=>setWizardStep(1));
  $("emergencyDetailsForm").addEventListener("submit",e=>{e.preventDefault();if(!$("emergencyType").value){return}
    state.details={type:$("emergencyType").value,description:$("incidentDescription").value.trim(),contact:$("emergencyContact").value.trim()||state.profile.phone||state.profile.emergencyContact||"",blood:$("emergencyBlood").value||state.profile.blood||"",emergencyContact:state.profile.emergencyContact||""};
    $("reviewSummary").innerHTML=`<div class="list-item"><div class="list-icon">⌖</div><div class="list-copy"><strong>Pickup location</strong><span>${safe(state.location.address)}</span></div></div><div class="list-item"><div class="list-icon">✚</div><div class="list-copy"><strong>Emergency category</strong><span>${safe(state.details.type)}</span></div></div><div class="list-item"><div class="list-icon">▤</div><div class="list-copy"><strong>Description</strong><span>${safe(state.details.description||"Not provided")}</span></div></div><div class="list-item"><div class="list-icon">♙</div><div class="list-copy"><strong>Patient information</strong><span>${safe(state.profile.name)} · Blood group: ${safe(state.details.blood||state.profile.blood||"Not provided")}</span></div></div><div class="list-item"><div class="list-icon">☎</div><div class="list-copy"><strong>Contact number</strong><span>${safe(state.details.contact||state.profile.phone||"Not provided")}</span></div></div>${state.profile.emergencyContact?`<div class="list-item"><div class="list-icon">♡</div><div class="list-copy"><strong>Emergency contact</strong><span>${safe(state.profile.emergencyContact)}</span></div></div>`:""}`;
    $("confirmDemoRequest").checked=false;$("reviewError").textContent="";setWizardStep(3);
  });
  $("backReview").addEventListener("click",()=>setWizardStep(2));
  $("submitEmergency").addEventListener("click",async()=>{
    if(!$("confirmDemoRequest").checked){$("reviewError").textContent="Please confirm that this is a simulated demo request.";return}
    if(!state.locationConfirmed||!state.location){$("reviewError").textContent="Confirm a pickup location before submitting.";setWizardStep(1);return}
    if(!state.location.coords||!window.MediRouteDispatch){
      $("reviewError").textContent="A confirmed map/GPS coordinate and the local dispatch server are required. Select a point on the map or detect your location, then run server.js.";
      setWizardStep(1);return;
    }
    const btn=$("submitEmergency");btn.disabled=true;btn.textContent="Connecting to dispatch…";
    try{
      const fail=state.failureMode==="submit";state.failureMode="none";
      if(fail)throw new Error("The demo request was interrupted by the selected test control. Your details are still here; retry when ready.");
      const id="MR-"+Math.floor(100000+Math.random()*900000);
      const dispatch=await window.MediRouteDispatch.createRequest({
        id,
        createdAt:new Date().toISOString(),
        patient:{id:state.profile.id,name:state.profile.name,phone:state.details.contact||state.profile.phone||""},
        pickup:{address:state.location.address,coords:{lat:Number(state.location.coords.lat),lng:Number(state.location.coords.lng)},source:state.location.source||"confirmed-map-point",accuracy:state.location.accuracy??null},
        details:{type:state.details.type,description:state.details.description,contact:state.details.contact,blood:state.details.blood}
      });
      applySharedDispatch(dispatch);
      addNotification("Emergency request submitted",`Request ${id} was sent to the shared compounder dispatch inbox.`,"success","request");
      go("request");toast("Request submitted","Your confirmed pickup point has been sent to the compounder portal.","success");
    }catch(error){
      $("reviewError").textContent=error.message||"The dispatch server could not create the request. Check that server.js is running.";
      toast("Request not sent",error.message||"Check the local dispatch server.","error");
    }finally{btn.disabled=false;btn.textContent="✚ Submit request";}
  });

  // The ambulance position is never generated from the patient's coordinates.
  // It is received from the compounder portal through the shared dispatch server.
  function activeRouteEndpoints(a){
    if(!a)return null;
    if(["assigned","approaching"].includes(a.status)){
      if(!a.location?.coords||!a.ambulance?.startCoords)return null;
      return {origin:a.ambulance.startCoords,destination:a.location.coords,mode:"to-pickup"};
    }
    if(["pickedup","enroute","arrived","completed"].includes(a.status)){
      if(!a.location?.coords||!a.hospital?.coords)return null;
      return {origin:a.location.coords,destination:a.hospital.coords,mode:"to-hospital"};
    }
    return null;
  }
  async function loadActiveRoute(){
    const a=state.active;
    if(!a)return false;
    const endpoints=activeRouteEndpoints(a);
    if(!endpoints){a.routeData=null;a.routeMode=null;a.routeError=a.status==="pickedup"||a.status==="enroute"?"Choose a map-listed destination hospital to calculate the hospital route.":"A confirmed pickup map point is needed for a road route.";return false}
    a.routeLoading=true;
    try{
      if(!window.MediRouteMaps)throw new Error("The map service library did not load. Reload the page to retry.");
      const result=await window.MediRouteMaps.getRoute(endpoints.origin,endpoints.destination);
      a.routeData=result;a.routeMode=endpoints.mode;a.routeError="";
      const route=result.primary;
      const progress=endpoints.mode==="to-pickup"?(Number(a.ambulance?.progress)||0):(Number(a.ambulance?.progress)||0);
      a.distance=Math.max(0,Number((route.distance/1000)*(1-progress)).toFixed(1));
      a.eta=Math.max(0,Math.ceil((route.duration/60)*(1-progress)));
      a.lastLocationUpdate=now();
      return true;
    }catch(error){
      a.routeData=null;a.routeMode=endpoints.mode;a.routeError=error.message||"Road route could not be calculated.";a.eta=null;a.distance=null;
      return false;
    }finally{a.routeLoading=false;}
  }
  function currentDemoAmbulancePoint(a){
    if(!a?.ambulance)return null;
    if(a.liveDispatch&&a.ambulance.coords)return a.ambulance.coords;
    const route=a.routeData?.primary;
    if(route&&window.MediRouteMaps){
      const point=window.MediRouteMaps.pointAlongRoute(route,a.ambulance.progress||0);
      if(point)return point;
    }
    return a.ambulance.coords||a.ambulance.startCoords||null;
  }

  let lastAppliedDispatchRevision=-1;
  function applySharedDispatch(dispatch){
    if(!dispatch||!dispatch.id)return;
    const revision=Number(dispatch.revision)||0;
    if(revision&&revision<=lastAppliedDispatchRevision)return;
    if(revision)lastAppliedDispatchRevision=revision;

    const previous=state.active;
    const same=!!previous&&previous.id===dispatch.id;
    const oldStatus=same?previous.status:null;
    const oldHospital=same?previous.hospital:null;
    const hospital=dispatch.hospital?{
      id:dispatch.hospital.id||dispatch.hospital.name,
      name:dispatch.hospital.name,
      address:dispatch.hospital.address,
      coords:dispatch.hospital.coords?{lat:Number(dispatch.hospital.coords.lat),lng:Number(dispatch.hospital.coords.lng)}:null,
      facilities:["Selected by the compounder portal"],
      source:dispatch.hospital.source||"compounder"
    }:null;
    const ambulance=dispatch.ambulance?{
      id:dispatch.ambulance.id,
      label:dispatch.ambulance.label,
      unit:dispatch.ambulance.unit,
      startCoords:dispatch.ambulance.startCoords?{lat:Number(dispatch.ambulance.startCoords.lat),lng:Number(dispatch.ambulance.startCoords.lng)}:null,
      coords:dispatch.ambulance.coords?{lat:Number(dispatch.ambulance.coords.lat),lng:Number(dispatch.ambulance.coords.lng)}:null,
      progress:Number(dispatch.ambulance.progress)||0,
      positionSource:dispatch.ambulance.positionSource||"device-gps",
      accuracy:dispatch.ambulance.accuracy??null,
      routeLeg:dispatch.ambulance.routeLeg||dispatch.routeLeg
    }:null;
    const hospitalChanged=JSON.stringify(oldHospital?.coords||null)!==JSON.stringify(hospital?.coords||null)||oldHospital?.name!==hospital?.name;
    const newRouteMode=["assigned","approaching"].includes(dispatch.status)?"to-pickup":(["pickedup","enroute","arrived","completed"].includes(dispatch.status)&&hospital?.coords?"to-hospital":null);
    const oldRouteMode=same?previous.routeMode:null;
    const routeChanged=!same||oldRouteMode!==newRouteMode||hospitalChanged;

    state.active={
      id:dispatch.id,
      created:previous?.created||dispatch.createdAt||now(),
      updated:dispatch.updatedAt?new Date(dispatch.updatedAt).toLocaleString():now(),
      location:{address:dispatch.pickup?.address||"Confirmed patient pickup point",coords:dispatch.pickup?.coords?{lat:Number(dispatch.pickup.coords.lat),lng:Number(dispatch.pickup.coords.lng)}:null,source:dispatch.pickup?.source||"patient-confirmed"},
      details:{type:dispatch.details?.type||"Emergency assistance",description:dispatch.details?.description||"",contact:dispatch.details?.contact||"",blood:dispatch.details?.blood||""},
      status:dispatch.status,
      ambulance,
      eta:same?previous.eta:null,
      distance:same?previous.distance:null,
      hospital,
      routeData:routeChanged?null:previous.routeData,
      routeMode:routeChanged?newRouteMode:previous.routeMode,
      routeError:routeChanged?"":"" ,
      routeVersion:same?previous.routeVersion||1:1,
      lastLocationUpdate:dispatch.updatedAt?new Date(dispatch.updatedAt).toLocaleTimeString():now(),
      trackingMode:"normal",
      liveDispatch:true,
      dispatchRevision:revision
    };
    if(!routeChanged&&state.active.routeData?.primary)updateRemainingEstimate(state.active);

    if(dispatch.patient?.name&&state.profile.name==="Patient Demo")state.profile.name=dispatch.patient.name;

    const statusMessages={
      assigned:["Ambulance assigned","A compounder accepted the request and shared the ambulance's own GPS starting point."],
      approaching:["Ambulance approaching","The compounder portal is sharing the ambulance position along the route to your pickup point."],
      pickedup:["Patient picked up","The compounder recorded the patient pickup. The hospital destination will follow."],
      enroute:["Hospital journey started",`${hospital?.name||"The selected hospital"} was shared by the compounder portal.`],
      arrived:["Ambulance arrived at hospital","The compounder portal confirmed arrival at the selected destination."],
      completed:["Journey completed","The compounder confirmed the patient handover in the shared demo."],
      cancelled:["Request cancelled","The dispatch request was cancelled."],
      unavailable:["No ambulance available","No crew accepted this request."]
    };
    if(!same||oldStatus!==dispatch.status){
      const message=statusMessages[dispatch.status];
      if(message)addNotification(message[0],message[1],dispatch.status==="unavailable"||dispatch.status==="cancelled"?"error":"success",dispatch.status==="enroute"||dispatch.status==="arrived"?"hospital":"tracking");
    }

    const activePage=document.querySelector(".page.active")?.id.replace("page-","")||"dashboard";
    if(routeChanged&&activeRouteEndpoints(state.active)){
      loadActiveRoute().then(()=>{
        renderDashboard();
        renderRequest();
        if(document.querySelector("#page-tracking.active"))renderTracking();
      });
    }

    if(activePage==="tracking"&&same&&!routeChanged&&ambulance?.coords){
      window.MediRouteMaps?.updateTrackingAmbulance?.(ambulance.coords);
      const last=$("lastTrackUpdate");if(last)last.textContent=state.active.lastLocationUpdate;
      const etaNode=$("trackEtaValue");if(etaNode)etaNode.textContent=state.active.eta!=null?`${state.active.eta} min`:"—";
      const remainingNode=$("trackRemainingValue");if(remainingNode)remainingNode.textContent=state.active.distance!=null?`${state.active.distance} km remaining · OSRM road estimate`:"Road estimate unavailable";
    } else if(!same||oldStatus!==dispatch.status||routeChanged){
      if(activePage==="tracking")renderTracking();
    }
    renderDashboard();
    if(activePage==="request")renderRequest();
    if(activePage==="hospital")renderHospital();
    if(activePage==="intake")renderIntake();
  }

  function handleSharedDispatchEvent(event){
    const dispatch=event?.dispatch;
    if(dispatch)applySharedDispatch(dispatch);
  }
  document.addEventListener("click",e=>{
    const button=e.target.closest("[data-pickup-result]");if(!button)return;
    const item=pickupSearchResults[Number(button.dataset.pickupResult)];if(!item)return;
    state.locationDraft={address:item.displayName,coords:{lat:item.lat,lng:item.lng},source:"nominatim"};state.locationConfirmed=false;
    $("manualAddress").value=item.displayName;
    if(item.locality && (!$("locationLabel").value.trim() || $("locationLabel").value===lastAutoLocationLabel)){
      $("locationLabel").value=item.locality;
      lastAutoLocationLabel=item.locality;
    }
    $("locationFeedback").textContent=`${item.name} selected. The map is centred on this point. Checking the address details…`;
    $("locationConfirmed").classList.add("hidden");$("nextLocation").disabled=true;
    if(window.MediRouteMaps)window.MediRouteMaps.updatePickupMap(item);
    onPickupMapPicked({lat:item.lat,lng:item.lng,source:"nominatim"});
    toast("Pickup point selected","Check the filled address and map pin, then confirm.","success");
  });
  function renderRequest(){
    const root=$("requestContent");const a=state.active;
    if(!a){root.innerHTML=`<div class="card empty"><div class="empty-icon">▤</div><h2>No active request</h2><p>When you create a demo emergency request, its status and details will appear here.</p><button class="btn primary" data-goto="emergency">Report an emergency</button></div>`;return}
    const steps=[["Request submitted",0],["Searching",1],["Ambulance assigned",2],["Ambulance approaching",3],["Patient picked up",4],["En route to hospital",5],["Arrived at hospital",6],["Journey completed",7]];
    const stage=currentStage();
    root.innerHTML=`<div class="card"><div class="split-head"><div><div class="eyebrow">Request reference</div><div class="request-id">${safe(a.id)}</div><p class="muted small" style="margin:5px 0 0">Created ${safe(a.created)}</p></div>${statusPill(a.status)}</div>
      <div class="steps">${steps.map(([label,n],i)=>`<div class="step ${stage>=n&&a.status!=="unavailable"?"done":""} ${stage===n?"current":""}"><div class="step-circle">${stage>n?"✓":i+1}</div>${label}</div>`).join("")}</div>
      ${a.status==="unavailable"?`<div class="notice error"><b>No ambulance is currently available</b> Your request information is preserved. Refresh dispatch status or submit a new request after the current request is closed.</div><button class="btn primary" id="retryAssign" style="margin-top:14px">Refresh dispatch status</button>`:""}
      <div class="grid equal section-gap"><div class="card" style="box-shadow:none"><h3>Pickup information</h3><div class="info-line"><span>Location</span><strong>${safe(a.location.address)}</strong></div><div class="info-line"><span>Category</span><strong>${safe(a.details.type)}</strong></div><div class="info-line"><span>Description</span><strong>${safe(a.details.description||"Not provided")}</strong></div><div class="info-line"><span>Last status update</span><strong>${safe(a.updated)}</strong></div></div><div class="card" style="box-shadow:none"><h3>Assignment information</h3><div class="info-line"><span>Ambulance</span><strong>${safe(a.ambulance?.id||"Pending")}</strong></div><div class="info-line"><span>${["assigned","approaching"].includes(a.status)?"ETA to pickup":["pickedup","enroute"].includes(a.status)?"ETA to hospital":"Estimated arrival"}</span><strong>${a.eta!==null&&a.eta!==undefined?`${a.eta} min (OSRM road estimate)`:"Not available"}</strong></div><div class="info-line"><span>Destination</span><strong>${safe(a.hospital?.name||"Pending")}</strong></div><div class="info-line"><span>Request status</span><strong>${safe(statusLabel(a.status))}</strong></div></div></div>
      <div class="actions section-gap"><button class="btn primary" data-goto="tracking">Open tracking →</button><button class="btn outline" data-goto="hospital">View hospital destination</button><button class="btn outline" data-goto="intake">Intake preview</button>${a.status!=="completed"?`<button class="btn secondary" data-goto="tracking">${a.liveDispatch?"Follow live dispatch updates":"Continue journey simulation"}</button>`:""}</div>
      <div class="notice warn section-gap">${a.liveDispatch?"Request, ambulance coordinates, journey status and selected hospital are synchronized through the local MediRoute dispatch server.":"Assignment and journey updates are generated within this preview and are not live dispatch information."}</div></div>`;
    $("retryAssign")?.addEventListener("click",async()=>{
      try{
        const latest=await window.MediRouteDispatch?.getCurrent();
        if(latest)applySharedDispatch(latest);
        else toast("No active dispatch","Submit a new request from the Emergency page.","info");
      }catch(error){toast("Dispatch server unavailable",error.message,"error")}
    });
  }
  function nextDemoActionLabel(status){
    return ({assigned:"Simulate ambulance approaching",approaching:"Simulate patient pickup",pickedup:"Start simulated trip to hospital",enroute:"Advance demo vehicle",arrived:"Complete demo handover",completed:"Journey completed"})[status]||"Advance demo journey";
  }
  function updateRemainingEstimate(a){
    const route=a?.routeData?.primary;if(!route)return;
    const progress=Math.max(0,Math.min(1,Number(a.ambulance?.progress)||0));
    a.distance=Math.max(0,Number((route.distance*(1-progress)/1000).toFixed(1)));
    a.eta=Math.max(0,Math.ceil((route.duration/60)*(1-progress)));
    const point=window.MediRouteMaps?.pointAlongRoute(route,progress);
    // Standalone demo mode derives the marker from route progress. In a shared
    // dispatch, keep the exact coordinates received from the compounder relay.
    if(point&&a.ambulance&&!a.liveDispatch)a.ambulance.coords=point;
  }
  function routeInstructionsMarkup(a){
    const steps=a?.routeData?.primary?.legs?.[0]?.steps||[];
    if(!steps.length)return `<p class="muted small">${a?.routeError?safe(a.routeError):"Route guidance will appear after a road route is available."}</p>`;
    return `<div class="list">${steps.slice(0,6).map((step,index)=>{
      const manoeuvre=step.maneuver||{};const action=String(manoeuvre.type||"continue").replace(/_/g," ");
      const direction=manoeuvre.modifier?` ${String(manoeuvre.modifier).replace(/_/g," ")}`:"";
      const street=step.name?` onto ${step.name}`:"";
      const metres=Number(step.distance)||0;const distance=metres>=1000?`${(metres/1000).toFixed(1)} km`:`${Math.round(metres)} m`;
      return `<div class="list-item"><div class="list-icon">${index+1}</div><div class="list-copy"><strong>${safe(action+direction+street)}</strong><span>${safe(distance)}</span></div></div>`;
    }).join("")}</div>`;
  }
  function renderTracking(){
    const root=$("trackingContent"),a=state.active;
    if(!a){root.innerHTML=`<div class="card empty"><div class="empty-icon">⌖</div><h2>No active journey to track</h2><p>Create a demo emergency request to see the tracking experience.</p><button class="btn primary" data-goto="emergency">Start demo request</button></div>`;return}
    if(a.status==="searching"){
      root.innerHTML=`<div class="card"><div class="empty"><div class="empty-icon">◷</div><h2>Searching for an ambulance</h2><p>Your confirmed pickup point has been sent to the shared dispatch server. The tracking map appears when a compounder accepts the request and shares their own GPS position.</p><span class="pill amber">Waiting for compounder</span><div style="margin-top:18px"><button class="btn outline" data-goto="request">View request details</button></div></div></div>`;return;
    }
    if(a.status==="unavailable"){
      root.innerHTML=`<div class="card empty"><div class="empty-icon">!</div><h2>Tracking is not available</h2><p>An ambulance could not be assigned, so there is no vehicle position or route to display.</p><button class="btn primary" data-goto="request">Retry assignment from request details</button></div>`;return;
    }
    const isDone=a.status==="completed";
    const isToPickup=["assigned","approaching"].includes(a.status);
    const awaitingHospital=a.status==="pickedup"&&!a.hospital?.coords;
    const routeLabel=isToPickup?"Ambulance to pickup":awaitingHospital?"Pickup complete · hospital pending":"Patient journey to hospital";
    const etaLabel=isToPickup?"Estimated arrival at pickup":awaitingHospital?"Hospital destination pending":"Estimated arrival at hospital";
    const ambulancePoint=currentDemoAmbulancePoint(a);
    const routeExists=!!a.routeData?.primary;
    const statusMessage=a.liveDispatch?(isDone?"The compounder portal has confirmed the journey.":"The ambulance start point comes from the compounder's device GPS. Current route position is shared by the compounder portal; route geometry is supplied by OSRM."):(isDone?"The demo journey has been completed.":"Ambulance movement is simulated. Map roads and route geometry are supplied by OpenStreetMap and OSRM; no live vehicle GPS or traffic feed is connected.");
    root.innerHTML=`<div class="status-banner"><span class="status-symbol">${isDone?"✓":"⌖"}</span><p><strong>${safe(statusLabel(a.status))}</strong>${safe(statusMessage)}</p></div>
      <div class="map-layout"><div>
        <div class="map-box"><div class="map-label top">${safe(routeLabel.toUpperCase())}</div><div id="trackingMap" role="application" aria-label="Map showing patient pickup, ambulance position and selected hospital" style="height:410px;min-height:410px;width:100%"></div></div>
        <div id="trackingMapStatus" class="small muted" role="status" style="margin-top:8px">${routeExists?"Road route calculated by OSRM.":safe(a.routeError||"Waiting for a road route. A pickup map point and a map-selected hospital are needed for routing.")}</div>
        <div class="map-legend"><span><i class="legend-dot" style="background:#176b87"></i>Pickup</span><span><i class="legend-dot" style="background:#c83e4d"></i>Ambulance</span><span><i class="legend-dot" style="background:#16845b"></i>Hospital</span></div>
        <div class="actions section-gap">${a.liveDispatch?`<button class="btn primary" id="demoRouteUpdate" ${isDone?"disabled":""}>↻ Refresh road route</button>`:`<button class="btn primary" id="demoRouteUpdate" ${isDone?"disabled":""}>↻ Recalculate road route</button><button class="btn outline" id="demoStale" ${isDone?"disabled":""}>Show stale tracking state</button><button class="btn outline" id="demoTrackingFail" ${isDone?"disabled":""}>Simulate tracking unavailable</button>`}</div>
        <div class="card section-gap"><h3>Route guidance</h3>${routeInstructionsMarkup(a)}</div>
      </div>
      <div class="route-side">
        <div class="card"><div class="eyebrow">${safe(etaLabel)}</div><div class="big-eta" id="trackEtaValue">${isDone||a.status==="arrived"?"Arrived":a.eta!=null?`${a.eta} min`:"—"}</div><p class="muted small" id="trackRemainingValue">${a.distance!=null?`${a.distance} km remaining · OSRM road estimate`:"Road estimate unavailable"}</p><div class="info-line"><span>Vehicle</span><strong>${safe(a.ambulance?.id||"AMB-07")}</strong></div><div class="info-line"><span>Status</span><strong>${safe(statusLabel(a.status))}</strong></div><div class="info-line"><span>Last map update</span><strong id="lastTrackUpdate">${safe(a.lastLocationUpdate||a.updated)}</strong></div><div id="trackingStateNote" class="notice small" style="margin-top:12px">${a.trackingMode==="stale"?"Tracking is marked stale. The last known simulated point remains visible.":a.trackingMode==="unavailable"?"Tracking is unavailable. The last known point may be outdated.":"Route map is available when the required coordinates and public services are available."}</div></div>
        <div class="card"><h3>Destination hospital</h3><strong>${safe(a.hospital?.name||"Destination pending")}</strong><p class="muted small" style="margin:6px 0 14px">${safe(a.hospital?.address||"No destination selected")}</p><p class="muted small">${a.hospital?.coords?"Map coordinates available.":"Choose a map-listed demo destination to calculate the hospital route."}</p><button class="btn secondary full" data-goto="hospital">View / choose hospital</button></div>
        ${a.liveDispatch?`<div class="card"><h3>Journey progression</h3><p class="muted small">The compounder portal controls the pickup, hospital route, arrival and handover milestones. This page receives those changes from the shared dispatch server.</p><span class="pill teal">Synced with compounder</span></div>`:`<div class="card"><h3>Journey progression</h3><p class="muted small">Use this control to advance the local demonstration. In a real workflow, these milestones would arrive from authorised dispatch or crew updates.</p><button id="advanceDemoJourney" class="btn primary full" ${isDone?"disabled":""}>${safe(nextDemoActionLabel(a.status))}</button><p class="muted small" style="margin:10px 0 0">This does not move or contact a real ambulance.</p></div>`}
      </div></div>
      <div class="notice warn section-gap">${a.liveDispatch?"This connected prototype shares the compounder's GPS start point and route position through the local dispatch server. Movement between the two real endpoints is simulated for demonstration; OSRM is not live traffic data.":"OSRM estimates are road-network estimates, not live traffic ETAs. Public demo services can be rate-limited or temporarily unavailable. The standalone preview marker is simulated."}</div>`;

    if(window.MediRouteMaps){
      const ready=window.MediRouteMaps.renderTrackingMap({pickup:a.location?.coords,ambulance:ambulancePoint,hospital:a.hospital?.coords,route:a.routeData,ambulanceLabel:a.liveDispatch?(a.ambulance?.positionSource==="device-gps"?"Ambulance · device GPS":"Ambulance · shared route position"):"Demo ambulance position · simulated"});
      if(!ready&&$("trackingMapStatus"))$("trackingMapStatus").textContent="The map library could not load. Reload the page to retry; request and journey details remain available.";
    }else if($("trackingMapStatus"))$("trackingMapStatus").textContent="Map services are unavailable. Request and journey details remain available.";

    if(!routeExists&&!a.routeLoading&&!a.routeError&&activeRouteEndpoints(a)){
      a.routeLoading=true;
      loadActiveRoute().then(()=>{if(document.querySelector("#page-tracking.active"))renderTracking();});
    }
    $("demoRouteUpdate")?.addEventListener("click",simulateRouteUpdate);
    $("demoStale")?.addEventListener("click",()=>{a.trackingMode="stale";$("trackingStateNote").className="notice warn small";$("trackingStateNote").textContent="Tracking data is marked stale. The map shows the last known simulated position, not a live location.";toast("Tracking data is stale","The last known simulated position remains visible.","error")});
    $("demoTrackingFail")?.addEventListener("click",()=>{a.trackingMode="unavailable";$("trackingStateNote").className="notice error small";$("trackingStateNote").textContent="Demo tracking is marked unavailable. Route and position updates are paused.";toast("Tracking unavailable","The displayed route may no longer be current.","error")});
    $("advanceDemoJourney")?.addEventListener("click",advanceDemoJourney);
  }
  async function simulateRouteUpdate(){
    const a=state.active;if(!a)return;
    if(a.liveDispatch){
      const ok=await loadActiveRoute();
      if(ok){a.updated=now();renderTracking();toast("Route refreshed","The shared trip endpoints were used to refresh the road route.","success");}
      else toast("Route unavailable",a.routeError||"The road route could not be refreshed.","error");
      return;
    }
    const current=currentDemoAmbulancePoint(a);
    if(current&&a.ambulance){
      if(a.routeMode==="to-pickup")a.ambulance.startCoords={...current};
      a.ambulance.coords={...current};a.ambulance.progress=0;
    }
    a.routeData=null;a.routeError="";a.trackingMode="normal";a.updated=now();
    const ok=await loadActiveRoute();
    if(ok){a.routeVersion=(a.routeVersion||1)+1;addNotification("Road route recalculated","The road route and remaining estimate were refreshed using OSRM map data.","info","tracking");toast("Route recalculated","The road route estimate has been refreshed.","success");}
    else toast("Route unavailable",a.routeError||"The road route could not be refreshed.","error");
    renderTracking();renderDashboard();
  }
  async function advanceDemoJourney(){
    const a=state.active;if(!a||a.status==="completed")return;
    if(a.liveDispatch){toast("Journey controlled by compounder","Use the compounder portal for journey milestones and hospital handover.","info");return}
    if(a.status==="assigned"){
      a.status="approaching";if(a.ambulance)a.ambulance.progress=0.55;updateRemainingEstimate(a);
      a.updated=now();addNotification("Ambulance approaching","The demo ambulance marker has advanced along the OSRM route. Its position is simulated.","info","tracking");
    }else if(a.status==="approaching"){
      a.status="pickedup";if(a.ambulance){a.ambulance.coords=a.location?.coords?{...a.location.coords}:a.ambulance.coords;a.ambulance.progress=0;}
      a.routeData=null;a.routeMode=null;a.routeError="";await loadActiveRoute();
      a.updated=now();addNotification("Patient pickup simulated","The demo journey has moved to the patient-onboard stage.","success","tracking");
    }else if(a.status==="pickedup"){
      if(!a.hospital?.coords){toast("Choose a destination first","Select a map-listed hospital on the Hospital destination page before starting the hospital route.","error");go("hospital");return;}
      a.status="enroute";if(a.ambulance){a.ambulance.coords={...a.location.coords};a.ambulance.progress=0;}
      a.routeData=null;a.routeMode=null;a.routeError="";await loadActiveRoute();
      a.updated=now();addNotification("Hospital journey started","The demo vehicle is now following the OSRM road route to the selected destination.","success","tracking");
    }else if(a.status==="enroute"){
      if(!a.routeData?.primary){const ok=await loadActiveRoute();if(!ok){toast("Route unavailable",a.routeError||"Cannot advance without a road route.","error");renderTracking();return;}}
      if(a.ambulance)a.ambulance.progress=Math.min(1,(Number(a.ambulance.progress)||0)+0.35);
      updateRemainingEstimate(a);a.updated=now();
      if((a.ambulance?.progress||0)>=1){a.status="arrived";if(a.ambulance)a.ambulance.coords={...a.hospital.coords};a.eta=0;a.distance=0;addNotification("Hospital arrival simulated","The demo vehicle reached the selected destination on the route.","success","hospital");}
      else addNotification("Journey position updated","The simulated vehicle marker moved further along the road route.","info","tracking");
    }else if(a.status==="arrived"){
      completeJourney();return;
    }
    renderTracking();renderRequest();renderDashboard();
    toast("Demo journey updated",statusLabel(a.status),"success");
  }
  function renderHospital(){
    const root=$("hospitalContent"),a=state.active,h=a?.hospital;
    if(!a){root.innerHTML=`<div class="card empty"><div class="empty-icon">✚</div><h2>No active request</h2><p>A destination can be explored after creating a demo emergency request.</p><button class="btn primary" data-goto="emergency">Start demo request</button></div>`;return}
    if(a.liveDispatch&&!h){root.innerHTML=`<div class="card"><h2>Hospital destination pending</h2><p class="muted">Your pickup coordinates have been shared with the compounder. The compounder portal will select the destination after recording patient details, then the hospital name, address and map coordinates will appear here automatically.</p><div class="info-line"><span>Request</span><strong>${safe(a.id)}</strong></div><div class="info-line"><span>Current status</span><strong>${safe(statusLabel(a.status))}</strong></div><button class="btn primary" data-goto="tracking">Back to live tracking</button></div>`;return;}
    const hasCoordinates=!!h?.coords;
    root.innerHTML=`<div class="grid two"><div class="card">
        <div style="height:145px;background:linear-gradient(135deg,#d9efeb,#eef6f3);border-radius:14px;display:grid;place-items:center;font-size:52px;color:#087f8c;margin-bottom:20px">✚</div>
        <span class="pill ${hasCoordinates?"teal":"amber"}">${hasCoordinates?(a.liveDispatch?"Compounder-selected destination":"Map-listed demo destination"):"Sample destination placeholder"}</span>
        <h2 style="margin-top:12px">${safe(h?.name||"No destination selected")}</h2><p class="muted">${safe(h?.address||"Select a hospital listed on the map to create a route preview.")}</p>
        <div class="info-line"><span>Destination source</span><strong>${hasCoordinates?(a.liveDispatch?"Compounder portal":"OpenStreetMap listing"):"Sample data"}</strong></div>
        <div class="info-line"><span>Coordinates</span><strong>${hasCoordinates?`${h.coords.lat.toFixed(5)}, ${h.coords.lng.toFixed(5)}`:"Not available"}</strong></div>
        <div class="info-line"><span>Admission / capacity</span><strong>Not verified</strong></div>
        <div class="notice warn" style="margin-top:16px">A map listing confirms only that a place appears in OpenStreetMap. It does not verify emergency capability, capacity, availability, suitability or acceptance. This patient-side selection is for route demonstration only.</div>
      </div><div class="card">
        <h2>Find hospitals near pickup</h2><p class="muted small">Searches public OpenStreetMap place listings around the confirmed pickup coordinates. Search runs only when you press the button; there is no autocomplete.</p>
        <button id="searchNearbyHospitals" class="btn primary full" ${a.location?.coords?"":"disabled"}>⌖ Find nearby hospitals</button>
        <div id="hospitalSearchStatus" class="small muted" role="status" style="margin-top:10px">${a.location?.coords?"Ready to search around your pickup point.":"A map-confirmed pickup point is required. Add one in the Emergency location step."}</div>
        <div id="hospitalSearchResults" class="list section-gap"></div>
        <button class="btn outline full" style="margin-top:14px" data-goto="tracking">Back to journey tracking</button>
      </div></div>`;
    $("searchNearbyHospitals")?.addEventListener("click",async()=>{
      const button=$("searchNearbyHospitals"),status=$("hospitalSearchStatus"),results=$("hospitalSearchResults");
      if(!a.location?.coords){status.textContent="A map-confirmed pickup point is required.";return}
      if(!window.MediRouteMaps){status.textContent="Map services did not load. Reload the page to retry.";return}
      button.disabled=true;button.textContent="Searching…";status.textContent="Searching OpenStreetMap for nearby hospital listings…";results.innerHTML="";
      try{
        nearbyHospitalResults=await window.MediRouteMaps.searchNearbyHospitals(a.location.coords);
        if(!nearbyHospitalResults.length){status.textContent="No nearby hospital listings were returned. Try adjusting the pickup map pin or retry later.";return}
        status.textContent=`${nearbyHospitalResults.length} nearby map listing${nearbyHospitalResults.length===1?"":"s"}. Select one only to preview a road route.`;
        results.innerHTML=nearbyHospitalResults.map((item,index)=>`<div class="list-item"><div class="list-icon">✚</div><div class="list-copy"><strong>${safe(item.name)}</strong><span>${safe(item.displayName)}</span><span>${item.distanceKm.toFixed(1)} km straight-line from pickup · road distance may differ</span><div class="actions" style="margin-top:8px"><button type="button" class="btn outline" data-hospital-result="${index}">Use as demo destination</button></div></div></div>`).join("");
      }catch(error){status.textContent=error.message||"Hospital search failed. Try again later.";}
      finally{button.disabled=false;button.textContent="⌖ Find nearby hospitals";}
    });
  }
  document.addEventListener("click",async e=>{
    const button=e.target.closest("[data-hospital-result]");if(!button)return;
    const item=nearbyHospitalResults[Number(button.dataset.hospitalResult)];if(!item||!state.active)return;
    state.active.hospital={id:item.id,name:item.name,address:item.displayName,coords:{lat:item.lat,lng:item.lng},facilities:["OpenStreetMap place listing · not independently verified"],source:"nominatim"};
    state.active.routeData=null;state.active.routeMode=null;state.active.routeError="";
    if(["pickedup","enroute"].includes(state.active.status))await loadActiveRoute();
    state.active.updated=now();
    addNotification("Demo destination selected",`${item.name} was selected as the map destination for route preview. Hospital suitability and capacity are not verified.`,"info","hospital");
    renderHospital();renderDashboard();
    toast("Destination selected","The hospital route can now be previewed in tracking.","success");
  });
  function renderIntake(){
    const root=$("intakeContent"),p=state.profile,a=state.active;
    const fields=[["Patient name",p.name],["Patient ID",p.id],["Email",p.email],["Mobile number",p.phone],["Blood group",p.blood],["Emergency contact",p.emergencyContact],["Pickup location",a?.location?.address]];
    const complete=fields.filter(x=>String(x[1]||"").trim()).length;
    root.innerHTML=`<div class="grid two"><div class="card"><div class="split-head"><div><h2>Patient intake summary</h2><p class="muted small">Read-only preview of fields that could be shared in a real integrated system.</p></div><span class="pill amber">Preview only</span></div><div class="notice ${complete===fields.length?"success":"warn"}"> ${complete} of ${fields.length} fields have values. Missing optional information can remain blank.</div><div class="list section-gap">${fields.map(([label,value])=>`<div class="list-item"><div class="list-icon">${value?"✓":"—"}</div><div class="list-copy"><strong>${safe(label)}</strong><span>${value?safe(value):"Not provided"}</span></div><span class="pill ${value?"green":"amber"}">${value?"Available":"Incomplete"}</span></div>`).join("")}</div><button class="btn primary" data-goto="profile">Review my profile</button></div><div><div class="card"><h2>Preparation status</h2><div class="list-item"><div class="list-icon">▣</div><div class="list-copy"><strong>${a?"Demo intake preview prepared":"Awaiting a demo request"}</strong><span>${a?"A local preview can be generated from the current profile and request.":"Create a demo request to associate pickup information."}</span></div></div><div class="info-line"><span>Destination</span><strong>${safe(a?.hospital?.name||"Not selected")}</strong></div><div class="info-line"><span>Hospital receipt</span><strong>Not sent</strong></div><div class="info-line"><span>Clinical review</span><strong>Not performed</strong></div></div><div class="notice warn section-gap"><b>Important:</b> This is not a real hospital referral. The information is not transmitted to a hospital and this preview is not a clinical record.</div></div></div>`;
  }
  function renderProfile(){
    const p=state.profile;$("profileName").value=p.name;$("profileEmail").value=p.email;$("profilePhone").value=p.phone;$("profileBlood").value=p.blood;$("profileEmergencyContact").value=p.emergencyContact;
    $("profileDisplayName").textContent=p.name;$("profileDisplayId").textContent=p.id;$("profileAvatar").textContent=p.name.charAt(0).toUpperCase()||"P";
    const checks=[["Name",p.name],["Email",p.email],["Mobile number",p.phone],["Blood group",p.blood],["Emergency contact",p.emergencyContact]];
    const count=checks.filter(x=>x[1]).length;const percent=Math.round(count/checks.length*100);
    $("profileProgressBar").style.width=percent+"%";$("profileProgressText").textContent=percent+"% complete";
    $("profileMissing").innerHTML=checks.map(([name,val])=>`<div class="list-item"><div class="list-icon">${val?"✓":"—"}</div><div class="list-copy"><strong>${safe(name)}</strong><span>${val?"Provided":"Optional · not provided"}</span></div></div>`).join("");
    $("profileSuccess").classList.add("hidden");$("profileError").textContent="";
  }
  $("profileForm").addEventListener("submit",e=>{e.preventDefault();const name=$("profileName").value.trim(),email=$("profileEmail").value.trim();if(name.length<2||!email){$("profileError").textContent="Enter a valid name and email.";return}
    state.profile={...state.profile,name,email,phone:$("profilePhone").value.trim(),blood:$("profileBlood").value,emergencyContact:$("profileEmergencyContact").value.trim()};
    $("profileSuccess").classList.remove("hidden");addNotification("Patient profile updated","Your profile was updated for this session.","success","profile");renderProfile();$("profileSuccess").classList.remove("hidden");renderDashboard();toast("Profile saved","Changes are held for this session only.","success");
  });
  $("cancelProfile").addEventListener("click",()=>renderProfile());
  function renderHistory(){$("historyContent").innerHTML=historyRows(state.history)}
  function completeJourney(){
    const a=state.active;if(!a)return;
    a.status="completed";a.updated=now();a.eta=0;a.distance=0;
    const exists=state.history.some(h=>h.id===a.id);
    if(!exists)state.history.unshift({id:a.id,date:a.created,type:a.details.type,status:"Completed · demo",hospital:a.hospital?.name||"Not assigned"});
    addNotification("Demo journey completed","The patient journey was marked complete in the prototype. This is not a real arrival confirmation.","success","history");
    renderPage(document.querySelector(".page.active").id.replace("page-",""));renderDashboard();toast("Journey completed","The demo history has been updated.","success");
  }
  function prefillEmergencyProfile(force=false){
    // Use details already saved in the profile; never overwrite something the user has typed.
    if(force || !$('emergencyContact').value) $('emergencyContact').value=state.profile.phone||state.profile.emergencyContact||"";
    if(force || !$('emergencyBlood').value) $('emergencyBlood').value=state.profile.blood||"";
  }
  function startNewEmergency(){
    if(state.active&&state.active.status!=="completed"){toast("Active request exists","Complete or reset the demo journey before starting another.","error");return}
    state.active=null;state.location=null;state.locationDraft=null;state.locationConfirmed=false;
    state.details={type:"",description:"",contact:"",blood:"",emergencyContact:state.profile.emergencyContact||""};state.wizardStep=1;
    pickupSearchResults=[];nearbyHospitalResults=[];
    $("locationSearchQuery").value="";$("pickupSearchResults").innerHTML="";$("pickupSearchStatus").textContent="";
    $("manualAddress").value="";$("locationLabel").value="";$("emergencyType").value="";$("incidentDescription").value="";$("emergencyContact").value=state.profile.phone||state.profile.emergencyContact||"";$("emergencyBlood").value=state.profile.blood||"";
    $("confirmDemoRequest").checked=false;
    go("emergency");
  }
  $("markAllRead").addEventListener("click",()=>{state.notifications.forEach(n=>n.read=true);renderNotificationBits();toast("Notifications updated","All notifications marked as read.","success")});
  function updateHeaderMode(){
    const guestMode=!!state.guestEmergency&&!state.loggedIn;
    $("guestHeaderActions").classList.toggle("hidden",!guestMode);
    $("logoutBtn").classList.toggle("hidden",guestMode);
  }
  function showLoginFromGuest(){
    state.guestEmergency=false;
    state.loggedIn=false;
    $("appView").classList.add("hidden");$("appView").style.display="none";
    $("authView").classList.remove("hidden");$("authView").style.display="grid";
    $("loginForm").classList.remove("hidden");$("registerForm").classList.add("hidden");
    $("loginPassword").value="";$("loginError").textContent="";
    updateHeaderMode();
  }
  // Emergency access is available from the login screen without creating or signing into an account.
  $("requestAmbulanceGuest").addEventListener("click",()=>{
    state.loggedIn=false;state.guestEmergency=true;
    $("authView").classList.add("hidden");$("authView").style.display="none";
    $("appView").classList.remove("hidden");$("appView").style.display="block";
    updateHeaderMode();startNewEmergency();
    toast("Emergency access","You can complete the request flow without signing in. This is a local prototype only.","info");
  });
  $("guestSignInBtn").addEventListener("click",()=>{
    showLoginFromGuest();
    toast("Sign in","Your emergency form remains in this browser session if you return to guest access.","info");
  });
  $("cancelGuestRequestBtn").addEventListener("click",()=>{
    if(!confirm("Cancel this guest emergency flow and return to the login page?"))return;
    if(state.guestEmergency)state.active=null;
    state.location=null;state.locationDraft=null;state.locationConfirmed=false;state.details={type:"",description:"",contact:"",blood:""};state.wizardStep=1;
    pickupSearchResults=[];nearbyHospitalResults=[];
    $("locationSearchQuery").value="";$("pickupSearchResults").innerHTML="";$("pickupSearchStatus").textContent="";
    $("manualAddress").value="";$("locationLabel").value="";$("emergencyType").value="";$("incidentDescription").value="";$("emergencyContact").value="";$("emergencyBlood").value="";$("confirmDemoRequest").checked=false;
    showLoginFromGuest();toast("Request cancelled","The guest request flow was cancelled.","success");
  });
  document.addEventListener("click",e=>{
    const nav=e.target.closest("[data-page]");if(nav){go(nav.dataset.page);return}
    const goto=e.target.closest("[data-goto]");if(goto){go(goto.dataset.goto);return}
    const notif=e.target.closest("[data-notif-page]");if(notif){const n=state.notifications.find(x=>x.id===Number(notif.dataset.notifId));if(n)n.read=true;go(notif.dataset.notifPage);return}
    const read=e.target.closest("[data-read-id]");if(read){const n=state.notifications.find(x=>x.id===Number(read.dataset.readId));if(n)n.read=true;renderNotificationBits();return}
  });
  $("loginFormEl").addEventListener("submit",e=>{e.preventDefault();const email=$("loginEmail").value.trim(),pass=$("loginPassword").value;if(!email||pass.length<4){$("loginError").textContent="Enter an email or patient ID and a password of at least 4 characters.";return}
    $("loginError").textContent="";const btn=e.submitter;btn.disabled=true;btn.textContent="Signing in…";
    setTimeout(()=>{btn.disabled=false;btn.innerHTML='Sign in to Medi Route <span>→</span>';state.loggedIn=true;if(email.toLowerCase()==="demo@mediroute.test"){state.profile={...state.profile,email}}else{state.profile={...state.profile,email,name:state.profile.name==="Patient Demo"?"Demo Patient":state.profile.name}}showApp();toast("Welcome back","You are signed in to the local preview.","success")},500);
  });
  $("showPass").addEventListener("change",e=>$("loginPassword").type=e.target.checked?"text":"password");
  $("toRegister").addEventListener("click",e=>{e.preventDefault();$("loginForm").classList.add("hidden");$("registerForm").classList.remove("hidden")});
  $("toLogin").addEventListener("click",e=>{e.preventDefault();$("registerForm").classList.add("hidden");$("loginForm").classList.remove("hidden")});
  $("registerFormEl").addEventListener("submit",e=>{e.preventDefault();const name=$("regName").value.trim(),email=$("regEmail").value.trim(),p=$("regPassword").value,c=$("regConfirm").value;if(name.length<2||!email){$("registerError").textContent="Enter a name and valid email.";return}if(p.length<4){$("registerError").textContent="Password must be at least 4 characters.";return}if(p!==c){$("registerError").textContent="Passwords do not match.";return}
    state.profile={name,email,phone:$("regPhone").value.trim(),blood:$("regBlood").value,emergencyContact:"",id:"MR-"+Math.floor(1000+Math.random()*9000)};state.loggedIn=true;addNotification("Demo account created","Your fictional patient account was created locally for this session.","success","profile");showApp();toast("Demo account created","Your account was created in this local preview.","success");
  });
  function showApp(){state.guestEmergency=false;$("authView").classList.add("hidden");$("authView").style.display="none";$("appView").classList.remove("hidden");$("appView").style.display="block";updateHeaderMode();go("dashboard")}
  function signOut(){state.guestEmergency=false;$("appView").classList.add("hidden");$("appView").style.display="none";$("authView").classList.remove("hidden");$("authView").style.display="grid";$("loginForm").classList.remove("hidden");$("registerForm").classList.add("hidden");$("loginPassword").value="";$("loginError").textContent="";state.loggedIn=false;updateHeaderMode()}
  $("logoutBtn").addEventListener("click",signOut);
  function resetDemo(){
    if(!confirm("Reset the demo? The active request, profile edits and notifications in this session will be cleared."))return;
    resetState();updateHeaderMode();$("loginEmail").value="demo@mediroute.test";$("loginPassword").value="";$("manualAddress").value="";$("locationLabel").value="";$("emergencyType").value="";$("incidentDescription").value="";$("emergencyContact").value="";$("emergencyBlood").value="";$("confirmDemoRequest").checked=false;
    $("appView").classList.add("hidden");$("appView").style.display="none";$("authView").classList.remove("hidden");$("authView").style.display="grid";$("loginForm").classList.remove("hidden");$("registerForm").classList.add("hidden");toast("Demo reset","The app is back at sign-in.","success");
  }
  $("resetBtn").addEventListener("click",resetDemo);$("helpReset").addEventListener("click",resetDemo);
  document.addEventListener("click",e=>{if(e.target.closest("#moreReset"))resetDemo()});
  // Demo-only fault injection for a presentation; not connected to a service.
  function renderInitial(){renderNotificationBits()}
  // Double-click the demo mode badge to reveal a small demo test menu.
  document.querySelector(".demo-label").addEventListener("dblclick",()=>{
    $("modalRoot").innerHTML=`<div class="modal-backdrop" role="presentation"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="demoToolsTitle"><h2 id="demoToolsTitle">Demo test controls</h2><p class="muted small">These controls simulate failure paths for testing the patient interface only.</p><div class="field"><label for="faultChoice">Next operation</label><select id="faultChoice"><option value="none">Normal demo flow</option><option value="submit">Fail next request submission</option><option value="unavailable">No ambulance available</option></select></div><div class="modal-actions"><button class="btn outline" id="cancelDemoTools">Cancel</button><button class="btn primary" id="applyDemoTools">Apply</button></div></div></div>`;
    $("cancelDemoTools").onclick=()=>$("modalRoot").innerHTML="";
    $("applyDemoTools").onclick=()=>{state.failureMode=$("faultChoice").value;$("modalRoot").innerHTML="";toast("Demo test mode updated","The selected behavior applies to the next matching operation.","success")};
  });
  // Shared dispatch relay: patient pickup coordinates and compounder GPS/route updates
  // are synchronized through server.js (SSE with periodic snapshot fallback).
  if(window.MediRouteDispatch){
    window.MediRouteDispatch.subscribe(handleSharedDispatchEvent);
    window.MediRouteDispatch.getCurrent().then(dispatch=>{
      if(dispatch){applySharedDispatch(dispatch);renderDashboard();}
    }).catch(error=>console.warn("MediRoute dispatch server is not connected:",error.message));
  }

  // Use a deterministic status transition for the standalone fallback demo only.
  updateHeaderMode();
  renderInitial();
})();
