const dgram = require('dgram');

const ALLOWED_COMMANDS = new Set(['PLAY', 'STOP']);

/**
 * Control UDP independiente del BrightSign.
 *
 * Este controlador NO usa el host del KMTronic seleccionado. El destino sale de
 * BRIGHTSIGN_HOST / BRIGHTSIGN_PORT y envia comandos ASCII simples al puerto
 * 2023 por defecto.
 */
class BrightSignController {
  #socket;

  constructor({ host, port = 2023 }) {
    if (!host) {
      throw new Error('BrightSign host no configurado');
    }

    this.host = host;
    this.port = Number(port || 2023);
    this.#socket = dgram.createSocket('udp4');

    this.#socket.on('error', (error) => {
      console.error(`[BrightSignController] UDP error: ${error.message}`);
    });
  }

  getConfig() {
    return {
      host: this.host,
      port: this.port,
      protocol: 'udp',
      commands: [...ALLOWED_COMMANDS],
    };
  }

  send(command) {
    const normalized = String(command || '').trim().toUpperCase();

    if (!ALLOWED_COMMANDS.has(normalized)) {
      throw new Error('Comando BrightSign no permitido. Usa PLAY o STOP.');
    }

    const payload = Buffer.from(normalized, 'ascii');

    this.#socket.send(payload, this.port, this.host, (error) => {
      if (error) {
        console.error(`[BrightSignController] error enviando ${normalized}: ${error.message}`);
      }
    });

    console.log(`[BrightSignController] -> UDP "${normalized}" a ${this.host}:${this.port}`);

    return {
      command: normalized,
      host: this.host,
      port: this.port,
      sentAt: new Date().toISOString(),
    };
  }
}

module.exports = { BrightSignController };
