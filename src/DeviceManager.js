export class DeviceManager {
  #devices = new Map();   // id -> Device
  #byIp = new Map();      // ip -> Device
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
    // Inyectar función de envío al dispositivo
    device._setSendFn((buf) => {
      this.#udpServer.send(buf, device.ip, device.port);
    });

    this.#devices.set(device.id, device);
    this.#byIp.set(device.ip, device);
    console.log(`[DeviceManager] dispositivo añadido: ${device.id} (${device.ip})`);
  }

  remove(id) {
    const device = this.#devices.get(id);
    if (!device) return;
    this.#byIp.delete(device.ip);
    this.#devices.delete(id);
    console.log(`[DeviceManager] dispositivo eliminado: ${id}`);
  }

  get(id) { return this.#devices.get(id); }
  list() { return [...this.#devices.values()].map(d => d.getStatus()); }

  // Inicia el poller: cada 30s pregunta el estado a todos los devices
  // de forma secuencial (uno tras otro con un pequeño delay entre ellos)
  startPolling(intervalMs = 30000, delayBetweenMs = 500) {
    if (this.#pollInterval) return; // ya está corriendo

    const poll = async () => {
      const devices = [...this.#devices.values()];
      console.log(`[DeviceManager] polling ${devices.length} dispositivos...`);

      for (const device of devices) {
        if (typeof device.queryStatus === "function") {
          device.queryStatus();
          // Pequeña pausa entre queries para no saturar la red
          await new Promise(r => setTimeout(r, delayBetweenMs));
        }
      }
    };

    // Primera query inmediata al arrancar
    poll();

    this.#pollInterval = setInterval(poll, intervalMs);
    console.log(`[DeviceManager] polling iniciado cada ${intervalMs / 1000}s`);
  }

  stopPolling() {
    if (this.#pollInterval) {
      clearInterval(this.#pollInterval);
      this.#pollInterval = null;
      console.log("[DeviceManager] polling detenido");
    }
  }
}
