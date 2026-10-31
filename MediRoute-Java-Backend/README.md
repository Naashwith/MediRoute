# MediRoute Java backend

Standalone Spring Boot 3 / Java 17 backend for the existing MediRoute patient and compounder web pages. It stores hospitals, ambulances, emergency requests and assignments in MySQL, exposes JSON REST APIs, and streams location, dispatch and simulated signal events over WebSocket/STOMP.

## Important use boundary
This is an academic prototype. Do not use it to dispatch real emergencies or enter identifiable patient information. The default route URLs are public demonstration services, and traffic-signal priority is a software simulation with no connection to real traffic controllers. Compounder and hospital account passwords are stored as salted PBKDF2 hashes. Hospital profile edits require an in-memory session token, but most dispatch REST endpoints are not authenticated. Before a public deployment, add complete API authorization, HTTPS, audit logging, privacy controls, managed routing infrastructure, and real operational review.

## Requirements (Windows)
- JDK 17 or newer (`java -version`)
- Maven 3.9+ (`mvn -version`)
- MySQL Server 8+ (Workbench is optional)
- VS Code with Extension Pack for Java (optional)
- Internet access for Maven dependencies and OSRM/Valhalla routes

## Start MySQL
Option A: In MySQL Workbench, run `CREATE DATABASE mediroute;` and create/use a local MySQL account.

Option B: Docker Desktop from this folder: `docker compose up -d`.

Set credentials in PowerShell before starting the backend (change password to your MySQL password):

```powershell
$env:DB_URL='jdbc:mysql://localhost:3306/mediroute?createDatabaseIfNotExist=true&useSSL=false&serverTimezone=UTC'
$env:DB_USER='root'
$env:DB_PASSWORD='your-password'
```

The app uses Hibernate `ddl-auto: update` for this prototype. It creates/updates the tables on startup. Back up data before changing entity mappings.

Hospital profiles created in the Hospital portal are persistent in MySQL. Main tables include `hospitals`, `hospital_accounts`, `hospital_capabilities`, `hospital_specialties`, `hospital_equipment`, `hospital_blood_groups`, and `hospital_services`. The `hospitals` row stores total and available beds, occupied/reserved counts, ICU/emergency/trauma/isolation beds, location, and contact details. Hospital portal edits update the existing row; registration creates a hospital row and a linked account row. Existing simple hospital records remain available to the directory and compounder matching, but do not have a hospital login until registered through the portal.

## Build and run
Open this `mediroute-backend` folder in VS Code, or open PowerShell here:

```powershell
mvn clean package
mvn spring-boot:run
```

Or run the packaged jar after a successful build:

```powershell
java -jar target\mediroute-backend-1.0.0.jar
```

Health check: `http://localhost:8080/api/health`.

## Run across devices on the same Wi-Fi
Keep the host computer and phones/tablets on the same trusted Wi-Fi. Find the host LAN IPv4 address with `ipconfig`, then use `http://HOST-LAN-IP:8080` as the API base URL from the browser. Allow inbound TCP port 8080 in Windows Defender Firewall only on the Private network profile. Browser GPS is normally restricted to secure contexts; `localhost` is treated as secure, but a plain `http://192.168...` URL may not get location permission. Use local coordinates or configure HTTPS for device GPS. Do not expose this prototype port to the public internet.

## API workflow
All request and response bodies are JSON.

Compounder accounts are created with `POST /api/auth/register` and checked with `POST /api/auth/login`. Registration requires a crew ID, email, phone, password, and role. Each successful new account automatically creates a unique ambulance unit and links the crew account to it. If optional latitude and longitude are supplied, they are used as the starting position and the ambulance is available; if no location is supplied, the ambulance stays `OFFLINE` until its crew reports GPS. The API returns the generated unit code in the crew profile. It never returns the password or password hash. Passwords are salted and hashed before storage.

Example registration:

```json
{"name":"Demo Crew","crewId":"crew01","phone":"5551234567","email":"crew01@example.com","latitude":13.0827,"longitude":80.2707,"role":"Compounder","password":"choose-a-password","confirmPassword":"choose-a-password"}
```

1. Register a hospital (capabilities are strings such as `TRAUMA`, `CARDIAC`, `PEDIATRIC`):

```http
POST /api/hospitals
Content-Type: application/json
{"name":"City Hospital","address":"Central Chennai","latitude":13.0604,"longitude":80.2496,"capacity":100,"availableBeds":8,"capabilities":["TRAUMA","CARDIAC"]}
```

2. Patient creates an emergency. Backend chooses the nearest available ambulance using great-circle distance from its last reported GPS point:

```http
POST /api/emergencies
Content-Type: application/json
{"patientName":"Demo patient","contact":"","latitude":13.05,"longitude":80.24}
```

3. Compounder posts symptoms and a normalized required capability. The backend chooses the nearest active hospital with a bed and matching capability:

```http
POST /api/emergencies/1/assessment
Content-Type: application/json
{"symptoms":"chest pain","requiredCapability":"CARDIAC"}
```

4. Retrieve candidate routes: `GET /api/emergencies/1/routes`. OSRM alternatives and a Valhalla candidate are scored by estimated duration plus a small distance preference; the minimum score is marked `selected`. Providers may return fewer alternatives. If both fail, a fallback estimate is returned and has no road geometry.

For connected pages, the API also provides `GET /api/emergencies/latest` (latest saved request), `GET /api/emergencies` (saved requests newest first), and `GET /api/emergencies/by-unit/{unitCode}` (active requests assigned to one ambulance unit). Each available ambulance can receive one active assignment at a time; completing a request releases it back to `AVAILABLE`. Every newly created compounder account has its own unit. The crew portal reports an idle unit's current GPS with `POST /api/ambulances/unit/{unitCode}/location`; this also brings a newly registered offline unit into service. During an active trip, it uses `POST /api/ambulances/{ambulanceId}/location`.

5. Request simulated green priority: `POST /api/signals/priority` with `{"signalId":"SIG-001","emergencyId":"1","durationSeconds":30}`. State resets after 30 seconds; this is not a real signal controller. The compounder page counts OpenStreetMap traffic signals along the active road route and automatically requests simulated priority when live ambulance GPS is within 1 km of a mapped signal.

Hospital portal endpoints: `POST /api/hospital-auth/register` creates the hospital profile and account together; `POST /api/hospital-auth/login` checks credentials; `GET /api/hospital-auth/me` loads the signed-in profile; and `PUT /api/hospital-auth/me` updates profile details and bed/resource counts in MySQL. The public `GET /api/hospitals` directory continues to feed compounder hospital matching. Capability tags such as CARDIAC, TRAUMA, PEDIATRIC, MATERNITY, ICU, EMERGENCY, and GENERAL are derived from hospital specialties and emergency services.

## WebSocket / STOMP
Connect a STOMP client to `ws://HOST:8080/ws` and subscribe to:

- `/topic/emergencies/{emergencyId}` — assignment and hospital selection updates
- `/topic/ambulances/{ambulanceId}` — GPS coordinates
- `/topic/signals/{signalId}` — simulated signal state

REST is under `/api/**`, with permissive CORS for local frontend development. Restrict allowed origins before deployment.

## Connect the existing HTML/CSS/JS frontend
Keep the frontend files in their own folder. The single-page MediRoute frontend serves Patient, Compounder / Ambulance, and Hospitals sections from one address. Its Node server only serves the page; dispatch data is stored by this Spring Boot backend and MySQL.

## Design / OOP roles
- `entity`: persistent domain objects and lifecycle behavior
- `repository`: MySQL persistence interfaces
- `service`: dispatch orchestration and route provider/scoring logic
- `auth`: crew account registration, password hashing and credential checks
- `signal`: simulated priority state with timed restoration
- `controller`: HTTP boundary and input validation
- `config`: CORS and STOMP broker configuration

The database stores ambulance status/coordinates, hospital accounts and resource profiles, and emergency request/status/assessment/assignment. Route responses are computed from routing services and are not persisted; GPS updates are persisted as each ambulance's latest position. Simulated traffic-signal state stays in memory and expires; it is not saved as a permanent traffic record.

## Troubleshooting
- `Access denied`: confirm `DB_USER` / `DB_PASSWORD` and that the account has access to `mediroute`.
- `Communications link failure`: start MySQL and check port 3306 / `DB_URL`.
- No ambulance assigned: sign into the compounder/ambulance account and enable location so that unit reports GPS and becomes `AVAILABLE`.
- No hospital selected: ensure an active hospital has `availableBeds > 0` and a matching capability (case-insensitive).
- Route geometry absent: public engines can rate-limit requests; fallback routes are estimates only.
- Device GPS unavailable: use HTTPS for remote-device pages; permit browser location and post coordinates to the location API.
