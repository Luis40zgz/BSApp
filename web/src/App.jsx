import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { BrightSignTransportControls } from './components/BrightSignTransportControls.jsx';
import { RelayToggle } from './components/RelayToggle.jsx';
import './styles.css';

const POLL_MS = 10000;
const RELAY_COUNT = 8;

/**
 * La web se sirve en WEB_PORT y la API en API_PORT. Usamos el hostname actual
 * para que funcione igual en local y en BrightSign.
 */
function getDefaultApiBase() {
  return `${window.location.protocol}//${window.location.hostname}:3000/api`;
}

function normalizeDevice(device) {
  return {
    ...device,
    relays: Array.from({ length: RELAY_COUNT }, (_, index) => {
      return device?.relays?.[index] || { relay: index + 1, state: 'unknown' };
    }),
  };
}

function isRelayOn(state) {
  return state === 'on';
}

function getConnectionClass(device) {
  return device?.status === 'connected' ? 'connected' : 'disconnected';
}

function App() {
  // -------------------------------------------------------------------------
  // Estado de configuracion y datos recibidos de la API
  // -------------------------------------------------------------------------

  const [apiUrl, setApiUrl] = useState(getDefaultApiBase());
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [brightSignTarget, setBrightSignTarget] = useState(null);

  // -------------------------------------------------------------------------
  // Estado visual de UI
  // -------------------------------------------------------------------------

  const [statusMessage, setStatusMessage] = useState('listo');
  const [statusKind, setStatusKind] = useState('');
  const [statusTime, setStatusTime] = useState('');
  const [pollLabel, setPollLabel] = useState('sin datos');
  const [pollPulse, setPollPulse] = useState(0);
  const [busyRelay, setBusyRelay] = useState(null);
  const [queryBusy, setQueryBusy] = useState(false);
  const [brightSignBusy, setBrightSignBusy] = useState(null);

  const pollRef = useRef(null);

  const apiBase = useMemo(() => apiUrl.trim().replace(/\/$/, '') || getDefaultApiBase(), [apiUrl]);

  const selectedDevice = useMemo(() => {
    return devices.find((device) => device.id === selectedDeviceId);
  }, [devices, selectedDeviceId]);

  const showStatus = useCallback((message, kind = '') => {
    setStatusMessage(message);
    setStatusKind(kind);
    setStatusTime(new Date().toLocaleTimeString());
  }, []);

  const markPollFeedback = useCallback(() => {
    setPollPulse((value) => value + 1);
    setPollLabel(new Date().toLocaleTimeString());
  }, []);

  const upsertDevice = useCallback((device) => {
    const normalized = normalizeDevice(device);

    setDevices((current) => {
      const index = current.findIndex((item) => item.id === normalized.id);

      if (index < 0) {
        return [...current, normalized];
      }

      const copy = [...current];
      copy[index] = normalized;
      return copy;
    });

    return normalized;
  }, []);

  // -------------------------------------------------------------------------
  // API: KMTronic
  // -------------------------------------------------------------------------

  const fetchSelectedStatus = useCallback(async (deviceId = selectedDeviceId) => {
    if (!deviceId) return;

    try {
      const response = await fetch(`${apiBase}/device/${encodeURIComponent(deviceId)}/status`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      upsertDevice(data);
      markPollFeedback();
      showStatus(`${deviceId}: estado leído desde backend`, 'ok');
    } catch (error) {
      showStatus(`error leyendo estado: ${error.message}`, 'err');
    }
  }, [apiBase, selectedDeviceId, markPollFeedback, showStatus, upsertDevice]);

  const loadDevices = useCallback(async () => {
    showStatus('cargando KMTronic registrados...');

    try {
      const response = await fetch(`${apiBase}/devices`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const list = Array.isArray(data) ? data : data.devices;

      if (!Array.isArray(list)) {
        throw new Error('Respuesta /devices no es una lista');
      }

      const normalized = list.map(normalizeDevice);
      const nextSelectedId = selectedDeviceId || normalized[0]?.id || '';

      setDevices(normalized);
      setSelectedDeviceId(nextSelectedId);

      if (nextSelectedId) {
        await fetchSelectedStatus(nextSelectedId);
      }

      showStatus(`${normalized.length} KMTronic registrado(s)`, 'ok');
    } catch (error) {
      setDevices([]);
      setSelectedDeviceId('');
      showStatus(`error cargando KMTronic: ${error.message}`, 'err');
    }
  }, [apiBase, selectedDeviceId, fetchSelectedStatus, showStatus]);

  const querySelectedDevice = useCallback(async () => {
    if (!selectedDeviceId) return;

    setQueryBusy(true);
    showStatus(`${selectedDeviceId}: query relés...`);

    try {
      const response = await fetch(`${apiBase}/device/${encodeURIComponent(selectedDeviceId)}/query`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      upsertDevice(data);
      markPollFeedback();
      showStatus(`${selectedDeviceId}: feedback UDP actualizado`, 'ok');
    } catch (error) {
      showStatus(`error query relés: ${error.message}`, 'err');
    } finally {
      setQueryBusy(false);
    }
  }, [apiBase, selectedDeviceId, markPollFeedback, showStatus, upsertDevice]);

  const toggleRelay = useCallback(async (relay) => {
    if (!selectedDevice) return;

    const nextState = !isRelayOn(relay.state);
    setBusyRelay(relay.relay);
    showStatus(`${selectedDevice.id}: relé ${relay.relay} → ${nextState ? 'ON' : 'OFF'}...`);

    try {
      const response = await fetch(`${apiBase}/device/${encodeURIComponent(selectedDevice.id)}/relay/${relay.relay}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: nextState }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      upsertDevice(data);
      markPollFeedback();
      showStatus(`${selectedDevice.id}: feedback recibido del dispositivo`, 'ok');
    } catch (error) {
      showStatus(`error accionando relé: ${error.message}`, 'err');
    } finally {
      setBusyRelay(null);
    }
  }, [apiBase, selectedDevice, markPollFeedback, showStatus, upsertDevice]);

  // -------------------------------------------------------------------------
  // API: BrightSign transport independiente
  // -------------------------------------------------------------------------

  const loadBrightSignConfig = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/brightsign`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setBrightSignTarget(data);
    } catch (error) {
      setBrightSignTarget(null);
      showStatus(`error cargando BrightSign: ${error.message}`, 'err');
    }
  }, [apiBase, showStatus]);

  const sendBrightSignCommand = useCallback(async (command) => {
    setBrightSignBusy(command);
    showStatus(`BrightSign: enviando ${command} por UDP...`);

    try {
      const response = await fetch(`${apiBase}/brightsign/transport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setBrightSignTarget({
        host: data.host,
        port: data.port,
        protocol: 'udp',
        commands: ['PLAY', 'STOP'],
      });
      showStatus(`${command} enviado a BrightSign ${data.host}:${data.port}`, 'ok');
    } catch (error) {
      showStatus(`error enviando ${command}: ${error.message}`, 'err');
    } finally {
      setBrightSignBusy(null);
    }
  }, [apiBase, showStatus]);

  // -------------------------------------------------------------------------
  // Ciclo de vida: carga inicial y poll del device seleccionado
  // -------------------------------------------------------------------------

  useEffect(() => {
    loadDevices();
    loadBrightSignConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
    }

    if (!selectedDeviceId) {
      return undefined;
    }

    pollRef.current = setInterval(() => {
      fetchSelectedStatus(selectedDeviceId);
    }, POLL_MS);

    return () => clearInterval(pollRef.current);
  }, [selectedDeviceId, fetchSelectedStatus]);

  return (
    <div className="wrap">
      <header>
        <div className="logo">
          Bright<span>Sign</span> control
        </div>

        <div>
          <div className="poll-badge">
            <div key={pollPulse} className={`poll-dot ${pollPulse > 0 ? 'active' : ''}`} />
            <span>{pollLabel}</span>
          </div>
          <div className="poll-countdown">front poll: 10s</div>
        </div>
      </header>

      <section className="config">
        <label htmlFor="api-url">API URL</label>
        <input id="api-url" type="text" value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} />
        <button className="btn" type="button" onClick={loadDevices}>
          refrescar
        </button>

        <label htmlFor="device-select">KMTronic relés</label>
        <select
          id="device-select"
          disabled={!devices.length}
          value={selectedDeviceId}
          onChange={(event) => setSelectedDeviceId(event.target.value)}
        >
          {!devices.length && <option value="">sin KMTronic</option>}
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.id} · {device.ip}:{device.port}
            </option>
          ))}
        </select>

        <button className="btn" type="button" disabled={!selectedDeviceId || queryBusy} onClick={querySelectedDevice}>
          query relés
        </button>
      </section>

      <BrightSignTransportControls target={brightSignTarget} busyCommand={brightSignBusy} onSend={sendBrightSignCommand} />

      <main>
        {!devices.length ? (
          <div className="empty">
            <strong>sin KMTronic</strong>
            No hay módulos de relés registrados o no hay conexión con la API.
          </div>
        ) : !selectedDevice ? (
          <div className="empty">
            <strong>sin selección</strong>
            Selecciona un KMTronic.
          </div>
        ) : (
          <section className="device-card">
            <div className="device-header">
              <div>
                <div className="device-id">{selectedDevice.id}</div>
                <div className="device-meta">
                  {selectedDevice.ip} : {selectedDevice.port} · última actualización:{' '}
                  {selectedDevice.lastUpdated ? new Date(selectedDevice.lastUpdated).toLocaleTimeString() : '---'}
                </div>
              </div>

              <span className={`badge ${getConnectionClass(selectedDevice)}`}>{selectedDevice.status || 'unknown'}</span>
            </div>

            <div className="relays-grid">
              {selectedDevice.relays.map((relay) => (
                <RelayToggle
                  key={relay.relay}
                  relay={relay}
                  busy={busyRelay === relay.relay}
                  onToggle={() => toggleRelay(relay)}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="statusbar">
        <span className={statusKind}>{statusMessage}</span>
        <span className="ts">{statusTime}</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
