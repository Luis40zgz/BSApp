export class Kmtronic {
  #status = "disconnected";
  #relays = new Array(8).fill(null); // null = desconocido, true = cerrado, false = abierto
  #send = null; // inyectado por DeviceManager

  constructor({ id, ip, port }) {
    this.id = id;
    this.ip = ip;
    this.port = port;
  }

  // Inyectado por DeviceManager — no llamar directamente
  _setSendFn(fn) {
    this.#send = fn;
  }

  // Llamado por DeviceManager cuando llega un mensaje UDP de esta IP
  onMessage(data) {
    this.#status = "connected";

    // El KMTronic responde al query FF0000 con un buffer donde
    // cada byte representa el estado de un relé: 0x00=abierto, 0x01=cerrado
    // Ejemplo: si relé 1 y 3 están cerrados → [1, 0, 1, 0, 0, 0, 0, 0]
    if (Buffer.isBuffer(data)) {
      this.#parseRelayStatus(data);
    } else {
      // Si llega como string, convertir
      const buf = Buffer.from(data, "binary");
      if (buf.length >= 8) {
        this.#parseRelayStatus(buf);
      }
    }

    console.log(`[${this.id}] estado relés:`, this.#relays.map((v, i) =>
      `R${i + 1}:${v === null ? "?" : v ? "ON" : "OFF"}`
    ).join(" "));
  }

  #parseRelayStatus(buf) {
    for (let i = 0; i < 8 && i < buf.length; i++) {
      this.#relays[i] = buf[i] === 0x01;
    }
  }

  // Pregunta el estado de todos los relés → responde con 8 bytes
  queryStatus() {
    if (!this.#send) {
      console.error(`[${this.id}] sin función de envío`);
      return;
    }
    const cmd = Buffer.from([0xFF, 0x00, 0x00]);
    this.#send(cmd);
    console.log(`[${this.id}] query estado enviado`);
  }

  // Controla un relé: relay 1-8, state true=cerrado false=abierto
  // Formato: FF 0y 0x  donde y=relé (1-8), x=estado (1=ON, 0=OFF)
  setRelay(relay, state) {
    if (relay < 1 || relay > 8) throw new Error("Relé debe ser 1-8");
    if (!this.#send) {
      console.error(`[${this.id}] sin función de envío`);
      return;
    }
    const cmd = Buffer.from([0xFF, relay, state ? 0x01 : 0x00]);
    this.#send(cmd);
    console.log(`[${this.id}] relé ${relay} → ${state ? "ON" : "OFF"}`);
  }

  getStatus() {
    return {
      id: this.id,
      ip: this.ip,
      port: this.port,
      status: this.#status,
      relays: this.#relays.map((v, i) => ({
        relay: i + 1,
        state: v === null ? "unknown" : v ? "on" : "off"
      }))
    };
  }
}
