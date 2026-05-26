const dgram = require('dgram');
const EventEmitter = require('events');

/**
 * Wrapper minimo sobre dgram para KMTronic.
 *
 * - Escucha en un puerto local.
 * - Emite mensajes con IP origen.
 * - Envia buffers/comandos al host/puerto indicado por cada device.
 */
class UDPServer extends EventEmitter {
  #socket = null;

  constructor({ port }) {
    super();
    this.port = port;
  }

  start() {
    if (this.#socket) return;

    this.#socket = dgram.createSocket('udp4');

    this.#socket.on('message', (msg, rinfo) => {
      this.emit('message', {
        ip: rinfo.address,
        data: msg.toString('ascii'),
        rinfo,
      });
    });

    this.#socket.on('error', (error) => {
      console.error(`[UDPServer] error: ${error.message}`);
      this.emit('error', error);
    });

    this.#socket.bind(this.port, () => {
      console.log(`[UDPServer] escuchando KMTronic en puerto ${this.port}`);
    });
  }

  send(message, ip, port) {
    if (!this.#socket) {
      throw new Error('UDPServer no iniciado');
    }

    const buffer = Buffer.isBuffer(message) ? message : Buffer.from(String(message));
    this.#socket.send(buffer, port, ip);
  }
}

module.exports = { UDPServer };
