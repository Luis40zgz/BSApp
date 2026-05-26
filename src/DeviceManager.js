/**
 * Registro y orquestacion de devices KMTronic.
 *
 * DeviceManager centraliza:
 * - alta de instancias KMTronic
 * - routing de respuestas UDP por IP origen
 * - polling secuencial para no mezclar respuestas UDP
 */
class DeviceManager {
  #devices = new Map();
  #byIp = new Map();
  #udpServer;
  #pollInterval = null;
  #polling = false;

  constructor(udpServer) {
    this.#udpServer = udpServer;

    udpServer.on('message', ({ ip, data }) => {
      const device = this.#byIp.get(ip);

      if (device) {
        device.onMessage(data);
        return;
      }

      console.warn(`[DeviceManager] mensaje de IP desconocida: ${ip}`);
    });
  }

  add(device) {
    device._setSendFn((buffer, overridePort) => {
      this.#udpServer.send(buffer, device.ip, overridePort || device.port);
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

  get(id) {
    return this.#devices.get(id);
  }

  list() {
    return [...this.#devices.values()].map((device) => device.getStatus());
  }

  /**
   * Lanza un poll secuencial sobre todos los KMTronic registrados.
   *
   * Es secuencial a proposito: KMTronic responde por UDP y conviene evitar
   * solapamiento de comandos/respuestas cuando hay varios modulos.
   */
  async pollOnce(delayBetweenMs = 500) {
    if (this.#polling) return;

    this.#polling = true;
    const devices = [...this.#devices.values()];

    console.log(`[poll] consultando ${devices.length} dispositivo(s)...`);

    try {
      for (const device of devices) {
        try {
          await device.queryStatus();
        } catch (error) {
          console.warn(`[poll] ${device.id}: ${error.message}`);
        }

        if (devices.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, delayBetweenMs));
        }
      }
    } finally {
      this.#polling = false;
    }
  }

  startPolling(intervalMs = 30000, delayBetweenMs = 500) {
    if (this.#pollInterval) return;

    this.pollOnce(delayBetweenMs);

    this.#pollInterval = setInterval(() => {
      this.pollOnce(delayBetweenMs);
    }, intervalMs);

    console.log(`[DeviceManager] polling cada ${intervalMs / 1000}s`);
  }

  stopPolling() {
    if (!this.#pollInterval) return;

    clearInterval(this.#pollInterval);
    this.#pollInterval = null;
  }
}

module.exports = { DeviceManager };
