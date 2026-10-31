/* Shared browser API for the patient and compounder portals. */
(() => {
  'use strict';

  const listeners = new Set();
  let eventSource = null;
  let lastRevision = -1;
  let current = null;
  let polling = false;

  function emit(message) {
    if (!message || !message.dispatch) return;
    const dispatch = message.dispatch;
    const revision = Number(dispatch.revision) || 0;
    if (revision < lastRevision) return;
    lastRevision = revision;
    current = dispatch;
    listeners.forEach(listener => {
      try { listener({ type: message.type || 'update', dispatch }); }
      catch (error) { console.error('MediRoute dispatch listener failed:', error); }
    });
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store'
    });
    let data = {};
    try { data = await response.json(); } catch { /* handled below */ }
    if (!response.ok) throw new Error(data.error || `Dispatch server returned HTTP ${response.status}.`);
    return data;
  }

  async function getCurrent() {
    const data = await request('/api/dispatch/current');
    if (data.dispatch) emit({ type: 'snapshot', dispatch: data.dispatch });
    return data.dispatch || null;
  }

  function connect() {
    if ('EventSource' in window && !eventSource) {
      eventSource = new EventSource('/api/dispatch/events');
      eventSource.addEventListener('dispatch', event => {
        try { emit(JSON.parse(event.data)); }
        catch (error) { console.warn('Invalid dispatch event:', error); }
      });
      eventSource.onerror = () => {
        // EventSource reconnects automatically; the polling fallback covers proxies
        // that buffer or do not support server-sent events correctly.
      };
    }
    if (!polling) {
      polling = true;
      getCurrent().catch(error => console.warn('MediRoute dispatch server unavailable:', error.message));
      window.setInterval(() => {
        getCurrent().catch(() => { /* SSE will reconnect; keep the UI usable */ });
      }, 5000);
    }
  }

  async function post(path, body) {
    const data = await request(path, { method: 'POST', body });
    if (data.dispatch) emit({ type: data.type || 'ack', dispatch: data.dispatch });
    return data.dispatch;
  }

  window.MediRouteDispatch = Object.freeze({
    subscribe(listener) {
      listeners.add(listener);
      if (current) listener({ type: 'snapshot', dispatch: current });
      return () => listeners.delete(listener);
    },
    getCurrent,
    createRequest(payload) { return post('/api/dispatch/request', payload); },
    acceptRequest(payload) { return post('/api/dispatch/accept', payload); },
    updateLocation(payload) { return post('/api/dispatch/location', payload); },
    updateStatus(payload) { return post('/api/dispatch/status', payload); },
    getSnapshot() { return current ? JSON.parse(JSON.stringify(current)) : null; }
  });

  connect();
})();
