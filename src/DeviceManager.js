export class DeviceManager {
  #devices = new Map();
  #byIp = new Map();
  #udpServer;
  #pollInterval = null;

  constructor(udpServer) {
    this.#udpServer = udpServer;

    udpServer.on("message", ({ ip, data }) => {
      const device = this.#byIp.get(ip);
      if (device) device.onMessage(data);
      else console.warn(`[DeviceManager] mensaje de IP desconocida: ${ip}`);
    });
  }

  add(device) {
    device._setSendFn((buf) => {
      this.#udpServer.send(buf, device.ip, device.port);
    });
    this.#devices.set(device.id, device);
    this.#byIp.set(device.ip, device);
    console.log(`[DeviceManager] añadido: ${device.id} (${device.ip}:${device.port})`);
  }

  remove(id) {
    const device = this.#devices.get(id);
    if (!device) return;
    this.#byIp.delete(device.ip);
    this.#devices.delete(id);
  }

  get(id) { return this.#devices.get(id); }
  list() { return [...this.#devices.values()].map(d => d.getStatus()); }

  // Polling secuencial: espera la respuesta UDP de cada device antes de
  // pasar al siguiente (gracias a que queryStatus ahora devuelve Promise).
  startPolling(intervalMs = 30000, delayBetweenMs = 500) {
    if (this.#pollInterval) return;

    const poll = async () => {
      const devices = [...this.#devices.values()];
      console.log(`[poll] consultando ${devices.length} dispositivo(s)...`);
      for (const device of devices) {
        try {
          await device.queryStatus();
        } catch (e) {
          console.warn(`[poll] ${device.id}: ${e.message}`);
        }
        if (devices.length > 1) {
          await new Promise(r => setTimeout(r, delayBetweenMs));
        }
      }
    };

    poll(); // primera query inmediata
    this.#pollInterval = setInterval(poll, intervalMs);
    console.log(`[DeviceManager] polling cada ${intervalMs / 1000}s`);
  }

  stopPolling() {
    clearInterval(this.#pollInterval);
    this.#pollInterval = null;
  }
}
