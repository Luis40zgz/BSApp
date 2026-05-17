import express from "express";
import morgan from "morgan";
import { UDPServer }     from "./src/UDPServer.js";
import { Kmtronic }      from "./src/devices/Kmtronic.js";
import { DeviceManager } from "./src/DeviceManager.js";
import { deviceRoutes }  from "./src/routes/devices.js";

const udpServer = new UDPServer({ port: 12345 });
udpServer.start();

const manager = new DeviceManager(udpServer);

// Añadir dispositivos
manager.add(new Kmtronic({ id: "dev-1", ip: "192.168.0.10", port: 12345 }));
// manager.add(new Kmtronic({ id: "dev-2", ip: "192.168.0.11", port: 12345 }));

// Arrancar polling secuencial cada 30 segundos
manager.startPolling(30000);

const app = express();
app.use(morgan("dev"));
app.use(express.json());
app.use("/api", deviceRoutes(manager));

app.listen(3000, () => console.log("API en http://localhost:3000"));
