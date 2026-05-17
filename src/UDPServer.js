import dgram from "dgram";
import EventEmitter from "events";

export class UDPServer extends EventEmitter {
  #socket;

  constructor({ port }) {
    super();
    this.port = port;
  }

  start() {
    this.#socket = dgram.createSocket("udp4");

    this.#socket.on("message", (msg, rinfo) => {
      // emite con la IP origen para que DeviceManager enrute
      this.emit("message", { ip: rinfo.address, data: msg.toString(), rinfo });
    });

    this.#socket.bind(this.port, () => {
      console.log(`UDP escuchando en puerto ${this.port}`);
    });

    this.#socket.on("error", (err) => this.emit("error", err));
  }

  send(message, ip, port) {
    const buf = Buffer.from(message);
    this.#socket.send(buf, port, ip);
  }
}