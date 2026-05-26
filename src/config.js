/**
 * Configuracion de runtime.
 *
 * El bundle final para BrightSign debe ser un unico archivo JS. Por eso la
 * configuracion se obtiene desde variables de entorno con valores por defecto.
 */
const DEFAULTS = {
  API_PORT: 3000,
  WEB_PORT: 8000,
  UDP_PORT: 12345,
  HOST: '0.0.0.0',
  POLL_MS: 30000,
  POLL_DELAY_MS: 500,
  BRIGHTSIGN_HOST: '127.0.0.1',
  BRIGHTSIGN_PORT: 2023,
  DEVICE_ID: 'kmtronic-1',
  DEVICE_IP: '192.168.0.115',
  DEVICE_PORT: 12345,
};

function readNumber(name, fallback) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) ? value : fallback;
}

function loadRuntimeConfig() {
  return {
    host: process.env.HOST || DEFAULTS.HOST,
    apiPort: readNumber('API_PORT', DEFAULTS.API_PORT),
    webPort: readNumber('WEB_PORT', DEFAULTS.WEB_PORT),
    udpPort: readNumber('UDP_PORT', DEFAULTS.UDP_PORT),
    pollMs: readNumber('POLL_MS', DEFAULTS.POLL_MS),
    pollDelayMs: readNumber('POLL_DELAY_MS', DEFAULTS.POLL_DELAY_MS),
    brightSign: {
      host: process.env.BRIGHTSIGN_HOST || DEFAULTS.BRIGHTSIGN_HOST,
      port: readNumber('BRIGHTSIGN_PORT', DEFAULTS.BRIGHTSIGN_PORT),
    },
    kmtronicDevices: [
      {
        id: process.env.DEVICE_ID || DEFAULTS.DEVICE_ID,
        ip: process.env.DEVICE_IP || DEFAULTS.DEVICE_IP,
        port: readNumber('DEVICE_PORT', DEFAULTS.DEVICE_PORT),
      },
    ],
  };
}

module.exports = { loadRuntimeConfig };
