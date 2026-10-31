'use strict';

/*
 * MediRoute demo dispatch relay.
 * Uses Node's built-in HTTP server only (no npm dependencies).
 * One active demo dispatch is shared by the patient and compounder portals.
 * This is intentionally a local prototype relay, not a production dispatch API.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 1024 * 1024;
let currentDispatch = null;
let revision = 0;
const subscribers = new Set();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function validPoint(point) {
  return !!point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) &&
    Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lng)) <= 180;
}

function publicSnapshot() {
  return currentDispatch ? JSON.parse(JSON.stringify(currentDispatch)) : null;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

function publish(type) {
  if (currentDispatch) {
    currentDispatch.revision = ++revision;
    currentDispatch.updatedAt = new Date().toISOString();
  }
  const message = `event: dispatch\ndata: ${JSON.stringify({ type, dispatch: publicSnapshot() })}\n\n`;
  for (const client of subscribers) {
    try { client.write(message); } catch { subscribers.delete(client); }
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > MAX_BODY) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error('Invalid JSON request body.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function requireDispatch(id) {
  if (!currentDispatch || currentDispatch.id !== String(id || '')) {
    const error = new Error('This dispatch is no longer active. Refresh the portal and check for a new request.');
    error.statusCode = 404;
    throw error;
  }
  return currentDispatch;
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, service: 'MediRoute demo dispatch relay', revision });
  }

  if (req.method === 'GET' && url.pathname === '/api/dispatch/current') {
    return sendJson(res, 200, { dispatch: publicSnapshot() });
  }

  if (req.method === 'GET' && url.pathname === '/api/dispatch/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(`event: dispatch\ndata: ${JSON.stringify({ type: 'snapshot', dispatch: publicSnapshot() })}\n\n`);
    subscribers.add(res);
    const keepAlive = setInterval(() => {
      if (!res.destroyed) res.write(': keep-alive\n\n');
    }, 20000);
    res.on('close', () => {
      clearInterval(keepAlive);
      subscribers.delete(res);
    });
    return;
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const body = await readJson(req);

  if (url.pathname === '/api/dispatch/request') {
    if (currentDispatch && !['completed', 'cancelled', 'unavailable'].includes(currentDispatch.status)) {
      return sendJson(res, 409, { error: `Request ${currentDispatch.id} is already active.` });
    }
    if (!validPoint(body.pickup?.coords)) {
      return sendJson(res, 400, { error: 'A confirmed patient pickup coordinate is required. Select a map point or detect device location.' });
    }
    const id = String(body.id || '').trim();
    if (!id) return sendJson(res, 400, { error: 'A request ID is required.' });
    currentDispatch = {
      id,
      status: 'searching',
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: ++revision,
      patient: {
        id: String(body.patient?.id || 'PATIENT-DEMO'),
        name: String(body.patient?.name || 'Patient'),
        phone: String(body.patient?.phone || '')
      },
      pickup: {
        address: String(body.pickup.address || 'Confirmed patient pickup point'),
        coords: { lat: Number(body.pickup.coords.lat), lng: Number(body.pickup.coords.lng) },
        source: String(body.pickup.source || 'confirmed-map-point'),
        accuracy: Number.isFinite(Number(body.pickup.accuracy)) ? Number(body.pickup.accuracy) : null
      },
      details: {
        type: String(body.details?.type || 'Emergency assistance'),
        description: String(body.details?.description || ''),
        contact: String(body.details?.contact || ''),
        blood: String(body.details?.blood || '')
      },
      ambulance: null,
      hospital: null,
      routeLeg: 'to-pickup',
      eta: null,
      distance: null
    };
    publish('request-created');
    return sendJson(res, 201, { dispatch: publicSnapshot() });
  }

  if (url.pathname === '/api/dispatch/accept') {
    const dispatch = requireDispatch(body.requestId);
    if (dispatch.status !== 'searching') return sendJson(res, 409, { error: 'This request has already been assigned or is no longer waiting.' });
    if (!validPoint(body.position)) return sendJson(res, 400, { error: 'A live ambulance GPS position is required before accepting the request.' });
    dispatch.ambulance = {
      id: String(body.ambulance?.id || 'AMB-DEMO'),
      label: String(body.ambulance?.label || body.ambulance?.id || 'Ambulance'),
      unit: String(body.ambulance?.unit || ''),
      crew: String(body.ambulance?.crew || ''),
      startCoords: { lat: Number(body.position.lat), lng: Number(body.position.lng) },
      coords: { lat: Number(body.position.lat), lng: Number(body.position.lng) },
      positionSource: 'device-gps',
      accuracy: Number.isFinite(Number(body.accuracy)) ? Number(body.accuracy) : null,
      progress: 0,
      routeLeg: 'to-pickup'
    };
    dispatch.status = 'assigned';
    dispatch.routeLeg = 'to-pickup';
    publish('ambulance-assigned');
    return sendJson(res, 200, { dispatch: publicSnapshot() });
  }

  if (url.pathname === '/api/dispatch/location') {
    const dispatch = requireDispatch(body.requestId);
    if (!dispatch.ambulance) return sendJson(res, 409, { error: 'No ambulance has accepted this request yet.' });
    if (!validPoint(body.position)) return sendJson(res, 400, { error: 'Invalid ambulance position.' });
    dispatch.ambulance.coords = { lat: Number(body.position.lat), lng: Number(body.position.lng) };
    dispatch.ambulance.positionSource = String(body.source || 'route-simulation');
    dispatch.ambulance.accuracy = Number.isFinite(Number(body.accuracy)) ? Number(body.accuracy) : null;
    if (Number.isFinite(Number(body.progress))) dispatch.ambulance.progress = Math.max(0, Math.min(1, Number(body.progress)));
    if (body.routeLeg === 'to-pickup' || body.routeLeg === 'to-hospital') {
      dispatch.ambulance.routeLeg = body.routeLeg;
      dispatch.routeLeg = body.routeLeg;
    }
    publish('ambulance-location');
    return sendJson(res, 200, { dispatch: publicSnapshot() });
  }

  if (url.pathname === '/api/dispatch/status') {
    const dispatch = requireDispatch(body.requestId);
    const allowed = new Set(['approaching', 'pickedup', 'enroute', 'arrived', 'completed', 'cancelled', 'unavailable']);
    if (!allowed.has(body.status)) return sendJson(res, 400, { error: 'Unsupported dispatch status.' });
    if (body.status === 'enroute' || body.status === 'arrived') {
      if (body.hospital) {
        if (!validPoint(body.hospital.coords)) return sendJson(res, 400, { error: 'The selected hospital must include valid map coordinates.' });
        dispatch.hospital = {
          id: String(body.hospital.id || ''),
          name: String(body.hospital.name || 'Selected hospital'),
          address: String(body.hospital.address || ''),
          phone: String(body.hospital.phone || ''),
          coords: { lat: Number(body.hospital.coords.lat), lng: Number(body.hospital.coords.lng) },
          source: String(body.hospital.source || 'compounder-selection')
        };
      }
      if (!dispatch.hospital?.coords) return sendJson(res, 400, { error: 'Select a hospital destination before starting the hospital journey.' });
      dispatch.routeLeg = 'to-hospital';
    }
    if (body.status === 'pickedup') dispatch.routeLeg = 'to-pickup';
    if (body.status === 'completed' && dispatch.ambulance && dispatch.hospital?.coords) {
      dispatch.ambulance.coords = { ...dispatch.hospital.coords };
      dispatch.ambulance.progress = 1;
    }
    dispatch.status = body.status;
    publish('status-updated');
    return sendJson(res, 200, { dispatch: publicSnapshot() });
  }

  return sendJson(res, 404, { error: 'Unknown API endpoint.' });
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/patient') pathname = '/index.html';
  if (pathname === '/compounder') pathname = '/compounder.html';
  const resolved = path.resolve(ROOT, `.${pathname}`);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    return sendJson(res, 403, { error: 'Forbidden.' });
  }
  fs.stat(resolved, (statError, stat) => {
    if (statError || !stat.isFile()) return sendJson(res, 404, { error: 'File not found.' });
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    fs.createReadStream(resolved).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (error) {
    if (!res.headersSent) sendJson(res, error.statusCode || 500, { error: error.message || 'Server error.' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MediRoute connected demo is running:`);
  console.log(`  Patient:    http://localhost:${PORT}/`);
  console.log(`  Compounder: http://localhost:${PORT}/compounder.html`);
  console.log(`  LAN access: http://<this-computer-ip>:${PORT}/`);
  console.log('Keep this terminal running while both portals are in use.');
});

process.on('SIGINT', () => {
  for (const client of subscribers) client.end();
  server.close(() => process.exit(0));
});
