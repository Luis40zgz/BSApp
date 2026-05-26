const RELAY_COUNT = 8;
const RESPONSE_TIMEOUT_MS = 3000;

/**
 * Modelo de un modulo KMTronic de 8 reles.
 *
 * El dispositivo devuelve un payload ASCII de 8 digitos:
 * - posicion 0 => rele 1
 * - posicion 7 => rele 8
 * - '0' => OFF
 * - '1' => ON
 */
class Kmtronic {
  #status = "disconnected";
  #relays = new Array(RELAY_COUNT).fill(null);
  #send = null;
  #pendingResolve = null;
  #pendingReject = null;
  #pendingTimeout = null;
  #queue = Promise.resolve();
  #lastRaw = null;
  #lastUpdated = null;

  constructor({ id, ip, port }) {
    this.id = id;
    this.ip = ip;
    this.port = port;
  }

  /**
   * Inyeccion interna usada por DeviceManager.
   * Evita que Kmtronic conozca detalles del socket UDP compartido.
   */
  _setSendFn(sendFn) {
    this.#send = sendFn;
  }

  /**
   * Procesa una respuesta UDP del modulo.
   */
  onMessage(raw) {
    const payload = this.#normalizePayload(raw);
    const parsedRelays = this.#parseRelayPayload(payload);

    if (!parsedRelays) {
      console.warn(`[${this.id}] <- UDP payload inesperado: "${payload}"`);
      return;
    }

    this.#status = "connected";
    this.#lastRaw = payload;
    this.#lastUpdated = new Date().toISOString();
    this.#relays = parsedRelays;

    console.log(`[${this.id}] <- UDP "${payload}"`);

    if (this.#pendingResolve) {
      clearTimeout(this.#pendingTimeout);
      const resolve = this.#pendingResolve;
      this.#clearPending();
      resolve(this.getStatus());
    }
  }

  queryStatus() {
    return this.#enqueue(() => {
      console.log(`[${this.id}] -> UDP query FF0000`);
      return this.#sendCommand("FF0000");
    });
  }

  setRelay(relay, state) {
    if (relay < 1 || relay > RELAY_COUNT) {
      throw new Error("Rele debe ser 1-8");
    }

    return this.#enqueue(() => {
      const command = `FF0${relay}0${state ? "1" : "0"}`;
      console.log(`[${this.id}] -> UDP rele ${relay} ${state ? "ON" : "OFF"}`);
      return this.#sendCommand(command);
    });
  }

  getStatus() {
    return {
      id: this.id,
      ip: this.ip,
      port: this.port,
      status: this.#status,
      raw: this.#lastRaw,
      lastUpdated: this.#lastUpdated,
      relays: this.#buildRelayList(),
    };
  }

  #normalizePayload(raw) {
    if (Buffer.isBuffer(raw)) return raw.toString("ascii").trim();
    return String(raw ?? "").trim();
  }

  #parseRelayPayload(payload) {
    if (!/^[01]{8}$/.test(payload)) return null;
    return [...payload].map((bit) => bit === "1");
  }

  #buildRelayList() {
    return this.#relays.map((value, index) => ({
      relay: index + 1,
      state: value === null ? "unknown" : value ? "on" : "off",
    }));
  }

  #awaitResponse(timeoutMs = RESPONSE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      this.#pendingResolve = resolve;
      this.#pendingReject = reject;
      this.#pendingTimeout = setTimeout(() => {
        this.#status = "disconnected";
        this.#clearPending();
        reject(new Error(`timeout: ${this.id} no respondio en ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Cola interna por device.
   *
   * Los comandos no se lanzan en paralelo porque las respuestas UDP no incluyen
   * un identificador de correlacion. Serializar evita aplicar feedback cruzado.
   */
  #enqueue(task) {
    const run = async () => {
      if (!this.#send) {
        throw new Error(`[${this.id}] sin funcion de envio`);
      }

      return task();
    };

    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  #sendCommand(command) {
    const responsePromise = this.#awaitResponse();
    this.#send(Buffer.from(command));
    return responsePromise;
  }

  #clearPending() {
    this.#pendingResolve = null;
    this.#pendingReject = null;
    this.#pendingTimeout = null;
  }
}

module.exports = { Kmtronic };
