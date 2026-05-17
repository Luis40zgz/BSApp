export class Kmtronic {
  #status = "disconnected";
  #relays = new Array(8).fill(null); // null=desconocido, true=ON, false=OFF
  #send = null;                       // inyectado por DeviceManager
  #pendingResolve = null;             // resolver de la promesa en espera
  #pendingTimeout = null;

  constructor({ id, ip, port }) {
    this.id = id;
    this.ip = ip;
    this.port = port;
  }

  _setSendFn(fn) {
    this.#send = fn;
  }

  // Llamado por DeviceManager cuando llega un paquete UDP de esta IP.
  // El dispositivo responde con un string ASCII de 8 dígitos: "10100000"
  // donde cada posición [0..7] es el relé 1..8 (0=OFF, 1=ON).
  onMessage(raw) {
    this.#status = "connected";

    const str = (Buffer.isBuffer(raw) ? raw.toString("ascii") : String(raw)).trim();

    if (/^[01]{8}$/.test(str)) {
      for (let i = 0; i < 8; i++) {
        this.#relays[i] = str[i] === "1";
      }
      console.log(`[${this.id}] <- UDP "${str}"`);
    } else {
      console.warn(`[${this.id}] <- UDP payload inesperado: "${str}"`);
    }

    // Resolver la promesa pendiente (setRelay/queryStatus esperando)
    if (this.#pendingResolve) {
      clearTimeout(this.#pendingTimeout);
      const resolve = this.#pendingResolve;
      this.#pendingResolve = null;
      this.#pendingTimeout = null;
      resolve(this.#buildRelayList());
    }
  }

  // Devuelve una Promise que se resuelve cuando llega la respuesta UDP.
  // Si el dispositivo no contesta en timeoutMs, rechaza.
  #awaitResponse(timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      if (this.#pendingTimeout) {
        clearTimeout(this.#pendingTimeout);
        if (this.#pendingResolve) this.#pendingResolve(this.#buildRelayList());
      }
      this.#pendingResolve = resolve;
      this.#pendingTimeout = setTimeout(() => {
        this.#pendingResolve = null;
        this.#pendingTimeout = null;
        reject(new Error(`timeout: ${this.id} no respondio en ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  // Query de estado: FF 00 00
  queryStatus() {
    if (!this.#send) throw new Error(`[${this.id}] sin funcion de envio`);
    const promise = this.#awaitResponse();
    this.#send(Buffer.from([0xff, 0x00, 0x00]));
    console.log(`[${this.id}] -> UDP query FF0000`);
    return promise;
  }

  // Comando de rele: FF 0y 0x  (y=rele 1-8, x=0 OFF / 1 ON)
  // Retorna Promise<relays[]> que se resuelve cuando el dispositivo confirma.
  setRelay(relay, state) {
    if (relay < 1 || relay > 8) throw new Error("Rele debe ser 1-8");
    if (!this.#send) throw new Error(`[${this.id}] sin funcion de envio`);
    const promise = this.#awaitResponse();
    this.#send(Buffer.from([0xff, relay, state ? 0x01 : 0x00]));
    console.log(`[${this.id}] -> UDP rele ${relay} ${state ? "ON" : "OFF"}`);
    return promise;
  }

  #buildRelayList() {
    return this.#relays.map((v, i) => ({
      relay: i + 1,
      state: v === null ? "unknown" : v ? "on" : "off",
    }));
  }

  getStatus() {
    return {
      id: this.id,
      ip: this.ip,
      port: this.port,
      status: this.#status,
      relays: this.#buildRelayList(),
    };
  }
}
