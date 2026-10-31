# MediRoute — Connected Patient + Compounder Demo

This package connects the **patient portal** and the **compounder / ambulance portal** through one local Node.js dispatch relay. Both pages must be opened from the same `server.js` origin. Do not use VS Code Live Server for this connected build.

## 1. Requirements

- Node.js 18 or newer
- A modern browser (Chrome or Edge recommended)
- Internet access for Leaflet CDN delivery, OpenStreetMap tiles and OSRM road routing
- Browser location permission for the compounder device; use `http://localhost` on the same computer for GPS permission

There are no npm dependencies to install.

## 2. Start the connected app

1. Extract the ZIP into one folder.
2. Open that folder in VS Code or a terminal.
3. Run:

   ```bash
   node server.js
   ```

4. Keep that terminal open. The server prints the two addresses:

   - Patient portal: `http://localhost:3000/`
   - Compounder portal: `http://localhost:3000/compounder.html`

5. Open each address in a separate browser tab or window. Both pages communicate with the same relay at `/api/dispatch/*`.

If port 3000 is occupied, choose another port:

- macOS / Linux: `PORT=3001 node server.js`
- Windows PowerShell: `$env:PORT=3001; node server.js`

Then use port `3001` in both tabs.

## 3. Test the shared-location workflow

### Patient tab

1. Open **Emergency**.
2. Detect the patient's device location or search/select a real map point.
3. Check the pin and address, then explicitly confirm the pickup location.
4. Complete the emergency details and submit the demo request.
5. The confirmed patient coordinates are sent to the dispatch relay. The patient tracking page waits for an ambulance assignment; it does not invent an ambulance location beside the patient.

### Compounder tab

1. Sign in with the demo credentials shown on the page:
   - Crew ID: `demo`
   - Password: `demo123`
2. Allow location access (or press **Enable location** first).
3. The patient's request appears in **Patient dispatch inbox**.
4. Press **Accept and navigate**. Acceptance is rejected until the browser supplies a valid compounder-device GPS coordinate.
5. The compounder map routes from the ambulance's own GPS starting point to the exact patient pickup point shared by the patient portal.
6. After reaching the pickup, record the patient details and choose a destination in the compounder workflow.
7. Lock the hospital and start the second leg. The selected hospital's exact coordinates are shared back to the patient portal; both map views use the same destination and the route continues from pickup to hospital.
8. On hospital arrival, confirm handover. The completed status is sent to the patient portal.

## 4. What is shared between portals

The relay shares one dispatch record containing:

- Patient request ID and basic demo request details
- Patient's confirmed pickup address and latitude / longitude
- Ambulance unit / crew details and the compounder's GPS starting coordinate
- Ambulance's latest route position and journey progress
- Compounder-selected hospital name, address and coordinates
- Journey status: searching, assigned, approaching, picked up, en route, arrived, completed, cancelled or unavailable

The portals receive updates over Server-Sent Events (SSE), with a periodic snapshot poll as a fallback. The patient marker follows the ambulance coordinate published by the compounder portal. The road route and ETA use OSRM; map tiles and map display use Leaflet with OpenStreetMap attribution.

## 5. Important demo limitations

- **Ambulance movement is an accelerated route simulation between the real GPS starting point and the confirmed destination.** The compounder's browser GPS is used as the starting location; this is not a continuous live ambulance telematics feed. A blue device marker may also show the compounder's current browser GPS in the compounder view.
- The compounder portal retains its sample hospital catalogue and sample coordinates in Chennai. The chosen hospital coordinate is synchronized exactly to both portals, but its facilities, capacity, availability and emergency suitability are not verified. The patient portal can search OpenStreetMap for nearby listings, but a map listing is not proof that a facility can accept a patient.
- The public OpenStreetMap tile and OSRM demo services can be rate-limited or unavailable. They are for light demonstration use, not emergency-service production use.
- The relay keeps one active dispatch in memory. Restarting `server.js` clears that dispatch. There is no database, user authentication, authorization, audit trail or production privacy/security controls.
- Both portals are served from one origin. For access from a second physical device, use the computer's LAN address for both portals; browser geolocation on other devices generally requires HTTPS. Do not expose this unauthenticated demo server to the public internet.
- This is an academic prototype, not a real dispatch service. Do not enter real patient medical data or rely on it in an emergency.

## 6. Files

- `server.js` — local web server and shared dispatch API / SSE relay
- `dispatch-bridge.js` — common browser API used by both portals
- `index.html`, `patient-app.js`, `patient-styles.css` — patient portal
- `compounder.html`, `compounder-app.js`, `compounder-styles.css` — compounder portal
- `map-services.js` — patient-side Leaflet / OpenStreetMap / Nominatim / OSRM functions

## 7. Quick connection check

With the server running, open `http://localhost:3000/api/health`. A healthy server returns JSON with `"ok": true`. If either page says the dispatch server is unavailable, check that both tabs are on the same host and port and that the Node terminal is still running.
