(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const now = () => new Date().toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
  const shortTime = () => new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
  const safe = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const demoHospitals = [{name:"Riverside General Hospital",address:"18 Riverside Avenue, Demo City",facilities:["Emergency department (sample)","Imaging facilities (sample)","General care (sample)"],id:"HSP-DEMO-01"}];
  const sampleHistory = [
    {id:"MR-HIST-2026-021",date:"Oct 12, 2026 · 14:25",status:"Completed · sample",hospital:"Riverside General Hospital",type:"Medical emergency"},
    {id:"MR-HIST-2026-008",date:"Sep 03, 2026 · 09:10",status:"Completed · sample",hospital:"Central Community Hospital",type:"Road accident"}
  ];
  const initialProfile = {name:"Patient Demo",email:"demo@mediroute.test",phone:"",blood:"",emergencyContact:"",id:"MR-1042"};
  let state = {};
  function resetState(){
    state = {loggedIn:false,guestEmergency:false,profile:{...initialProfile},active:null,history:[...sampleHistory],notifications:[
      {id:1,title:"Welcome to Medi Route",body:"Explore the patient-side academic prototype. No real emergency services are connected.",time:now(),read:false,kind:"info",page:"help"}
    ],nextNotification:2,location:null,locationConfirmed:false,wizardStep:1,details:{type:"",description:"",contact:"",blood:""},routeUpdateCount:0,trackingMode:"normal",failureMode:"none"};
  }
  resetState();
  const titles = {dashboard:"Home",emergency:"Emergency",request:"Request details",tracking:"Track journey",hospital:"Hospital destination",intake:"Intake preview",profile:"My Profile",notifications:"Notifications",history:"Journey history",more:"My Medi Route","help":"Help & prototype"};
  function toast(title,body,kind="info"){
    const el=document.createElement("div");el.className="toast";el.innerHTML=`<div>${kind==="success"?"✓":kind==="error"?"!":"●"}</div><div><strong>${safe(title)}</strong><span>${safe(body)}</span></div>`;
    $("toastArea").appendChild(el);setTimeout(()=>el.remove(),4200);
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
    if(page==="notifications"){state.notifications.forEach(n=>n.read=true);renderNotificationBits();}
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
      $("activeEmergencyBlock").innerHTML=`<div class="card section-gap"><div class="split-head"><div><span class="eyebrow">Active demo request</span><h2 style="margin-top:5px">${safe(a.id)}</h2></div>${statusPill(a.status)}</div><div class="grid three"><div class="metric"><div class="metric-label">CURRENT STATUS</div><div class="metric-value" style="font-size:18px">${safe(statusLabel(a.status))}</div><div class="metric-foot">Updated ${safe(a.updated)}</div></div><div class="metric"><div class="metric-label">ESTIMATED ARRIVAL</div><div class="metric-value">${a.eta?`${a.eta} min`:"—"}</div><div class="metric-foot">${a.eta?"Simulated estimate":"Not available yet"}</div></div><div class="metric"><div class="metric-label">DESTINATION</div><div class="metric-value" style="font-size:16px">${safe(a.hospital?.name||"Pending")}</div><div class="metric-foot">Demo hospital data</div></div></div><div class="actions"><button class="btn primary" data-goto="tracking">Open live tracking →</button><button class="btn outline" data-goto="request">Request details</button>${a.status==="completed"?'<button class="btn secondary" id="newEmergencyBtn">Start a new demo request</button>':""}</div></div>`;
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
  function renderEmergency(){
    const existing=!!state.active&&state.active.status!=="completed";
    $("emergencyExisting").classList.toggle("hidden",!existing);$("emergencyWizard").classList.toggle("hidden",existing);
    if(existing){$("emergencyExisting").innerHTML=`<div class="empty"><div class="empty-icon">✚</div><h2>You already have an active demo request</h2><p>Continue to your current request rather than creating another active journey.</p><p>${statusPill(state.active.status)}</p><div class="actions" style="justify-content:center"><button class="btn primary" data-goto="request">View request</button><button class="btn outline" data-goto="tracking">Open tracking</button></div></div>`;return}
    setWizardStep(state.wizardStep);
    if(state.locationConfirmed){$("locationConfirmed").classList.remove("hidden");$("confirmedLocationText").textContent=state.location.address;$("confirmedCoords").textContent=state.location.coords?`Coordinates detected: ${state.location.coords.lat.toFixed(5)}, ${state.location.coords.lng.toFixed(5)} · Browser geolocation`:"Manual address · coordinates not verified";$("nextLocation").disabled=false}
    else{$("locationConfirmed").classList.add("hidden");$("nextLocation").disabled=true}
  }
  function setWizardStep(step){
    state.wizardStep=step;
    [1,2,3].forEach(n=>$("wizardStep"+n).classList.toggle("hidden",n!==step));
    document.querySelectorAll("[data-step-ind]").forEach(el=>{const n=Number(el.dataset.stepInd);el.classList.toggle("current",n===step);el.classList.toggle("done",n<step);el.querySelector(".step-circle").textContent=n<step?"✓":String(n)});
  }
  function confirmManual(){
    const address=$("manualAddress").value.trim();if(address.length<5){toast("Pickup location needed","Enter a more complete address or landmark.","error");$("manualAddress").focus();return}
    state.location={address:($("locationLabel").value.trim()?$("locationLabel").value.trim()+" — ":"")+address,coords:null,source:"manual"};state.locationConfirmed=true;
    $("locationFeedback").textContent="Manual location entered. Please verify the address is correct.";renderEmergency();toast("Location confirmed","Manual address saved in this demo.","success");
  }
  $("confirmLocation").addEventListener("click",confirmManual);
  $("detectLocation").addEventListener("click",()=>{
    const btn=$("detectLocation");btn.disabled=true;btn.textContent="⌖ Detecting location…";$("locationFeedback").textContent="Waiting for browser location permission…";
    if(!navigator.geolocation){btn.disabled=false;btn.textContent="⌖ Detect my location";$("locationFeedback").textContent="Geolocation is unavailable in this browser. Enter the address manually.";toast("Location unavailable","Use the manual address option.","error");return}
    navigator.geolocation.getCurrentPosition(pos=>{
      const lat=pos.coords.latitude,lng=pos.coords.longitude;btn.disabled=false;btn.textContent="⌖ Detect my location";
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){$("locationFeedback").textContent="The browser returned invalid coordinates. Please enter your location manually.";return}
      state.location={address:"Detected device location (address not geocoded)",coords:{lat,lng},source:"gps"};state.locationConfirmed=true;
      $("manualAddress").value="Detected device location (address not geocoded)";$("locationFeedback").textContent="Browser location detected. A real address has not been looked up.";renderEmergency();toast("Location detected","Confirm that this is the correct pickup point.","success");
    },err=>{
      btn.disabled=false;btn.textContent="⌖ Detect my location";
      const msg=err.code===1?"Location permission was denied. You can enter an address manually.":err.code===2?"Your location could not be determined. Check device location settings or enter an address manually.":"Location request timed out. Try again or enter an address manually.";
      $("locationFeedback").textContent=msg;toast("Could not detect location",msg,"error");
    },{enableHighAccuracy:true,timeout:10000,maximumAge:0});
  });
  $("nextLocation").addEventListener("click",()=>{if(!state.locationConfirmed){toast("Confirm location first","Choose detected location or confirm a manual address.","error");return}setWizardStep(2)});
  $("backDetails").addEventListener("click",()=>setWizardStep(1));
  $("emergencyDetailsForm").addEventListener("submit",e=>{e.preventDefault();if(!$("emergencyType").value){return}
    state.details={type:$("emergencyType").value,description:$("incidentDescription").value.trim(),contact:$("emergencyContact").value.trim()||state.profile.phone||state.profile.emergencyContact||"",blood:$("emergencyBlood").value||state.profile.blood||"",emergencyContact:state.profile.emergencyContact||""};
    $("reviewSummary").innerHTML=`<div class="list-item"><div class="list-icon">⌖</div><div class="list-copy"><strong>Pickup location</strong><span>${safe(state.location.address)}</span></div></div><div class="list-item"><div class="list-icon">✚</div><div class="list-copy"><strong>Emergency category</strong><span>${safe(state.details.type)}</span></div></div><div class="list-item"><div class="list-icon">▤</div><div class="list-copy"><strong>Description</strong><span>${safe(state.details.description||"Not provided")}</span></div></div><div class="list-item"><div class="list-icon">♙</div><div class="list-copy"><strong>Patient information</strong><span>${safe(state.profile.name)} · Blood group: ${safe(state.details.blood||state.profile.blood||"Not provided")}</span></div></div><div class="list-item"><div class="list-icon">☎</div><div class="list-copy"><strong>Contact number</strong><span>${safe(state.details.contact||state.profile.phone||"Not provided")}</span></div></div>${state.profile.emergencyContact?`<div class="list-item"><div class="list-icon">♡</div><div class="list-copy"><strong>Emergency contact</strong><span>${safe(state.profile.emergencyContact)}</span></div></div>`:""}`;
    $("confirmDemoRequest").checked=false;$("reviewError").textContent="";setWizardStep(3);
  });
  $("backReview").addEventListener("click",()=>setWizardStep(2));
  $("submitEmergency").addEventListener("click",()=>{
    if(!$("confirmDemoRequest").checked){$("reviewError").textContent="Please confirm that this is a simulated demo request.";return}
    const btn=$("submitEmergency");btn.disabled=true;btn.textContent="Submitting request…";
    setTimeout(()=>{
      const fail=state.failureMode==="submit";state.failureMode="none";btn.disabled=false;btn.textContent="✚ Submit request";
      if(fail){toast("Demo request could not be created","Your details are still here. Please retry.","error");return}
      const id="MR-"+Math.floor(100000+Math.random()*900000);
      state.active={id,created:now(),updated:now(),location:{...state.location},details:{...state.details},status:"searching",ambulance:null,eta:null,distance:null,hospital:null,routeVersion:1,lastLocationUpdate:now(),trackingMode:"normal"};
      addNotification("Emergency request submitted",`Request ${id} was was created in this portal preview.`,"success","request");
      go("request");toast("Request submitted","Your request is being processed by the local preview.","success");
      setTimeout(()=>simulateAssignment(),1800);
    },800);
  });
  function simulateAssignment(){
    if(!state.active||state.active.status!=="searching")return;
    if(state.failureMode==="unavailable"){state.failureMode="none";state.active.status="unavailable";state.active.updated=now();addNotification("No ambulance available","An ambulance could not be assigned. Your request details have been preserved.","error","request");renderPage(document.querySelector(".page.active").id.replace("page-",""));toast("No ambulance available","Retry assignment or review request details.","error");return}
    state.active.status="assigned";state.active.ambulance={id:"AMB-07",label:"Ambulance 07"};state.active.eta=8;state.active.distance=2.4;state.active.hospital={...demoHospitals[0]};state.active.updated=now();state.active.lastLocationUpdate=now();
    addNotification("Ambulance assigned",`${state.active.ambulance.id} has been assigned. The arrival estimate may change.`,"success","tracking");
    renderPage(document.querySelector(".page.active").id.replace("page-",""));toast("Ambulance assigned","Open tracking to see the simulated route.","success");
  }
  function renderRequest(){
    const root=$("requestContent");const a=state.active;
    if(!a){root.innerHTML=`<div class="card empty"><div class="empty-icon">▤</div><h2>No active request</h2><p>When you create a demo emergency request, its status and details will appear here.</p><button class="btn primary" data-goto="emergency">Report an emergency</button></div>`;return}
    const steps=[["Request submitted",0],["Searching for an ambulance",1],["Ambulance assigned",2],["Patient picked up",4],["En route to hospital",5],["Journey completed",7]];
    const stage=currentStage();
    root.innerHTML=`<div class="card"><div class="split-head"><div><div class="eyebrow">Request reference</div><div class="request-id">${safe(a.id)}</div><p class="muted small" style="margin:5px 0 0">Created ${safe(a.created)}</p></div>${statusPill(a.status)}</div>
      <div class="steps">${steps.map(([label,n],i)=>`<div class="step ${stage>=n&&a.status!=="unavailable"?"done":""} ${stage===n?"current":""}"><div class="step-circle">${stage>n?"✓":i+1}</div>${label}</div>`).join("")}</div>
      ${a.status==="unavailable"?`<div class="notice error"><b>No ambulance is currently available</b> Your request information is preserved. You can retry the simulated assignment.</div><button class="btn primary" id="retryAssign" style="margin-top:14px">Retry demo assignment</button>`:""}
      <div class="grid equal section-gap"><div class="card" style="box-shadow:none"><h3>Pickup information</h3><div class="info-line"><span>Location</span><strong>${safe(a.location.address)}</strong></div><div class="info-line"><span>Category</span><strong>${safe(a.details.type)}</strong></div><div class="info-line"><span>Description</span><strong>${safe(a.details.description||"Not provided")}</strong></div><div class="info-line"><span>Last status update</span><strong>${safe(a.updated)}</strong></div></div><div class="card" style="box-shadow:none"><h3>Assignment information</h3><div class="info-line"><span>Ambulance</span><strong>${safe(a.ambulance?.id||"Pending")}</strong></div><div class="info-line"><span>Estimated arrival</span><strong>${a.eta?`${a.eta} min (simulated)`:"Not available"}</strong></div><div class="info-line"><span>Destination</span><strong>${safe(a.hospital?.name||"Pending")}</strong></div><div class="info-line"><span>Request status</span><strong>${safe(statusLabel(a.status))}</strong></div></div></div>
      <div class="actions section-gap"><button class="btn primary" data-goto="tracking">Open tracking →</button><button class="btn outline" data-goto="hospital">View hospital destination</button><button class="btn outline" data-goto="intake">Intake preview</button>${a.status!=="completed"?'<button class="btn secondary" id="simulateComplete">Mark journey complete</button>':""}</div>
      <div class="notice warn section-gap">Assignment and journey updates are generated within this preview and are not live dispatch information.</div></div>`;
    $("retryAssign")?.addEventListener("click",()=>{a.status="searching";a.updated=now();renderRequest();setTimeout(simulateAssignment,1200)});
    $("simulateComplete")?.addEventListener("click",completeJourney);
  }
  function routeSvg(a){
    const updated=a.routeVersion>1;
    const path=updated?"M 52 300 C 125 270, 135 190, 220 180 S 330 220, 405 130 S 505 110, 560 58":"M 52 300 C 125 270, 120 190, 210 190 S 300 105, 390 145 S 480 90, 560 58";
    const amb=updated?{x:300,y:190}:{x:260,y:164};
    return `<svg viewBox="0 0 620 370" role="img" aria-label="Illustrative simulated road route from pickup point to destination hospital">
      <rect width="620" height="370" fill="#eaf1e8"/>
      <path d="M0 60 L620 300 M-20 320 L620 40 M80 0 L190 370 M420 0 L350 370 M0 210 L620 205" stroke="#d6e2d5" stroke-width="18" fill="none"/>
      <path d="M0 60 L620 300 M-20 320 L620 40 M80 0 L190 370 M420 0 L350 370 M0 210 L620 205" stroke="#f8fbf7" stroke-width="12" fill="none"/>
      <path d="M15 130 L620 130 M15 255 L620 255 M150 0 L150 370 M500 0 L500 370" stroke="#c5d5c9" stroke-width="2" stroke-dasharray="7 7" fill="none"/>
      <path d="${path}" stroke="#fff" stroke-width="13" stroke-linecap="round" fill="none"/>
      <path d="${path}" stroke="${updated?"#b97708":"#07838d"}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${updated?"10 7":"none"}" fill="none"/>
      <g fill="#718a78" font-size="11" font-weight="600"><text x="30" y="95">Garden Road</text><text x="355" y="282">Central Avenue</text><text x="425" y="32">Hospital Road</text><text x="190" y="350">West Link</text><text x="20" y="220">Park Street</text></g>
      <g transform="translate(52 300)"><circle r="16" fill="#fff" stroke="#087f8c" stroke-width="4"/><circle r="5" fill="#087f8c"/><text x="-4" y="34" font-size="11" font-weight="800" fill="#163a4c">PICKUP</text></g>
      <g transform="translate(560 58)"><circle r="18" fill="#fff" stroke="#18794e" stroke-width="4"/><path d="M-7 -5h14v10h-14z M-2 -10h4v20h-4z" fill="#18794e"/><text x="-42" y="36" font-size="11" font-weight="800" fill="#163a4c">HOSPITAL</text></g>
      <g transform="translate(${amb.x} ${amb.y})"><circle r="21" fill="#fff" stroke="#087f8c" stroke-width="3"/><rect x="-13" y="-8" width="26" height="16" rx="4" fill="#087f8c"/><path d="M-2 -5h4v10h-4z M-5 -2h10v4h-10z" fill="#fff"/><text x="-32" y="-29" font-size="11" font-weight="800" fill="#163a4c">AMBULANCE</text></g>
    </svg>`;
  }
  function renderTracking(){
    const root=$("trackingContent"),a=state.active;
    if(!a){root.innerHTML=`<div class="card empty"><div class="empty-icon">⌖</div><h2>No active journey to track</h2><p>Create a demo emergency request to see the tracking experience.</p><button class="btn primary" data-goto="emergency">Start demo request</button></div>`;return}
    if(!a.ambulance&&a.status!=="completed"&&a.status!=="unavailable"){
      root.innerHTML=`<div class="card"><div class="empty"><div class="empty-icon">◷</div><h2>${safe(statusLabel(a.status))}</h2><p>The mock assignment service is processing your request. The tracking route will appear if a demo ambulance is assigned.</p><span class="pill amber">Waiting for assignment</span><div style="margin-top:18px"><button class="btn outline" data-goto="request">View request details</button></div></div></div>`;return;
    }
    if(a.status==="unavailable"){root.innerHTML=`<div class="card empty"><div class="empty-icon">!</div><h2>Tracking is not available</h2><p>An ambulance could not be assigned, so there is no vehicle position or route to display.</p><button class="btn primary" data-goto="request">Retry assignment from request details</button></div>`;return}
    const isDone=a.status==="completed";
    root.innerHTML=`<div class="status-banner"><span class="status-symbol">${isDone?"✓":"⌖"}</span><p><strong>${safe(statusLabel(a.status))}</strong>${isDone?"This demo journey has been marked completed.":"Tracking data is simulated. The map does not show real roads, live traffic or a real ambulance."}</p></div>
      <div class="map-layout"><div><div class="map-box"><div class="map-label top">◎ ROUTE PREVIEW</div>${routeSvg(a)}</div><div class="map-legend"><span><i class="legend-dot" style="background:#087f8c"></i>Pickup point</span><span><i class="legend-dot" style="background:#087f8c"></i>Demo ambulance</span><span><i class="legend-dot" style="background:#18794e"></i>Destination hospital</span></div>${a.routeVersion>1?`<div class="route-update"><b>Route updated · ${safe(a.updated)}</b><br>Demo traffic disruption was applied. The route illustration and ETA changed using sample values.</div>`:""}<div class="actions section-gap"><button class="btn primary" id="demoRouteUpdate" ${isDone?"disabled":""}>↻ Refresh route estimate</button><button class="btn outline" id="demoStale" ${isDone?"disabled":""}>Show stale tracking state</button><button class="btn outline" id="demoTrackingFail" ${isDone?"disabled":""}>Simulate tracking unavailable</button></div></div>
      <div class="route-side"><div class="card"><div class="eyebrow">Estimated arrival</div><div class="big-eta">${isDone?"Arrived":a.eta+" min"}</div><p class="muted small">${isDone?"Journey marked complete":`Approx. ${a.distance} km remaining · Simulated estimate`}</p><div class="info-line"><span>Vehicle</span><strong>${safe(a.ambulance?.id||"AMB-07")}</strong></div><div class="info-line"><span>Status</span><strong>${safe(statusLabel(a.status))}</strong></div><div class="info-line"><span>Last update</span><strong id="lastTrackUpdate">${safe(a.lastLocationUpdate||a.updated)}</strong></div><div id="trackingStateNote" class="notice small" style="margin-top:12px">${a.trackingMode==="stale"?"Tracking data is stale. Last known position is shown.":"Tracking status: demo updates available."}</div></div><div class="card"><h3>Destination hospital</h3><strong>${safe(a.hospital?.name||"Destination pending")}</strong><p class="muted small" style="margin:6px 0 14px">${safe(a.hospital?.address||"No destination available")}</p><button class="btn secondary full" data-goto="hospital">View hospital details</button></div><div class="card"><h3>Journey status</h3><p class="muted small">${isDone?"Your demo journey is complete.":a.status==="enroute"?"The simulated journey to the destination has begun.":"The ambulance is shown as assigned in the demo."}</p><button class="btn outline full" data-goto="request">Open request details</button>${!isDone?'<button id="trackingComplete" class="btn secondary full" style="margin-top:9px">Mark arrival and complete</button>':""}</div></div></div>
      <div class="notice warn section-gap">Route geometry, vehicle position, distance, ETA and traffic changes are sample values. This is not a navigation service.</div>`;
    $("demoRouteUpdate")?.addEventListener("click",simulateRouteUpdate);
    $("demoStale")?.addEventListener("click",()=>{a.trackingMode="stale";$("trackingStateNote").className="notice warn small";$("trackingStateNote").textContent="Tracking data is stale. The map shows the last known demo position, not a live location.";toast("Tracking data is stale","The last known position remains visible.","error")});
    $("demoTrackingFail")?.addEventListener("click",()=>{a.trackingMode="unavailable";$("trackingStateNote").className="notice error small";$("trackingStateNote").textContent="Demo tracking service unavailable. Route and position updates are paused.";toast("Tracking unavailable","The displayed route may no longer be current.","error")});
    $("trackingComplete")?.addEventListener("click",completeJourney);
  }
  function simulateRouteUpdate(){
    const a=state.active;if(!a)return;
    a.routeVersion++;a.eta=Math.max(3,a.eta+(a.routeVersion%2?5:-2));a.distance=Math.max(.4,Number((a.distance+.7).toFixed(1)));a.updated=now();a.lastLocationUpdate=now();a.trackingMode="normal";
    if(a.status==="assigned")a.status="approaching";
    addNotification("Route and ETA updated",`The simulated route changed. New ETA: ${a.eta} minutes. This is demo data.`,"info","tracking");
    renderTracking();toast("Demo route updated",`ETA is now ${a.eta} minutes in the simulation.`,"success");
  }
  function renderHospital(){
    const root=$("hospitalContent"),a=state.active,h=a?.hospital;
    if(!h){root.innerHTML=`<div class="card empty"><div class="empty-icon">✚</div><h2>No destination selected</h2><p>A hospital destination appears after the mock ambulance assignment succeeds.</p><button class="btn primary" data-goto="request">View request status</button></div>`;return}
    root.innerHTML=`<div class="grid two"><div class="card"><div style="height:145px;background:linear-gradient(135deg,#d9efeb,#eef6f3);border-radius:14px;display:grid;place-items:center;font-size:52px;color:#087f8c;margin-bottom:20px">✚</div><span class="pill teal">Simulated destination</span><h2 style="margin-top:12px">${safe(h.name)}</h2><p class="muted">${safe(h.address)}</p><div class="info-line"><span>Selection status</span><strong>Demo recommendation</strong></div><div class="info-line"><span>Estimated travel time</span><strong>${a.eta??"—"} min · simulated</strong></div><div class="info-line"><span>Admission status</span><strong>Not verified</strong></div><div class="info-line"><span>Arrival notification</span><strong>${a.status==="arrived"||a.status==="completed"?"Demo arrival recorded":"Not sent · prototype"}</strong></div><div class="notice warn" style="margin-top:16px">This sample destination is fictional. Facilities and suitability are not verified; no hospital has received a notification.</div></div><div class="card"><h2>Sample facilities</h2><p class="muted small">Illustrative information only — not a statement of real capacity or availability.</p><div class="list">${h.facilities.map(f=>`<div class="list-item"><div class="list-icon">✓</div><div class="list-copy"><strong>${safe(f)}</strong><span>Sample facility indicator · not verified</span></div></div>`).join("")}</div><button class="btn primary full" data-goto="tracking">Back to tracking</button></div></div>`;
  }
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
    state.active=null;state.location=null;state.locationConfirmed=false;state.details={type:"",description:"",contact:"",blood:"",emergencyContact:state.profile.emergencyContact||""};state.wizardStep=1;
    $("manualAddress").value="";$("locationLabel").value="";$("emergencyType").value="";$("incidentDescription").value="";$("emergencyContact").value=state.profile.phone||state.profile.emergencyContact||"";$("emergencyBlood").value=state.profile.blood||"";
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
    state.location=null;state.locationConfirmed=false;state.details={type:"",description:"",contact:"",blood:""};state.wizardStep=1;
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
  // Use a deterministic status transition for the demo; no real-time location is polled.
  updateHeaderMode();
  renderInitial();
})();
