const express = require("express");
const morgan = require("morgan");

const { BrightSignController } = require("./src/BrightSignController.js");
const { DeviceManager } = require("./src/DeviceManager.js");
const { UDPServer } = require("./src/UDPServer.js");
const { loadRuntimeConfig } = require("./src/config.js");
const { Kmtronic } = require("./src/devices/Kmtronic.js");
const { loadIndexHtml } = require("./src/html.js");
const { deviceRoutes } = require("./src/routes/devices.js");

const config = loadRuntimeConfig();
const indexHtml = loadIndexHtml();

/**
 * Middleware comun para API y web.
 *
 * CORS queda abierto porque el panel HTML se sirve en WEB_PORT y la API en
 * API_PORT. En una red AV cerrada esto simplifica la operativa del BrightSign.
 */
function applyCommonMiddleware(app) {
  app.use(morgan("dev"));
  app.use(express.json());

  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    return next();
  });
}

/**
 * Crea la API REST.
 *
 * Responsabilidades:
 * - exponer estado de KMTronic
 * - accionar reles KMTronic via UDP
 * - enviar PLAY/STOP al BrightSign por UDP independiente
 */
function createApiApp(manager, brightSignController) {
  const app = express();
  applyCommonMiddleware(app);

  app.use("/api", deviceRoutes(manager, brightSignController));

  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      service: "brightsign-api",
      devices: manager.list().length,
      brightsign: brightSignController.getConfig(),
    });
  });

  return app;
}

/**
 * Crea el servidor web que devuelve el HTML React ya incrustado en el bundle.
 * No se sirve ningun asset externo: el deploy final es `dist/bundle.js`.
 */
function createWebApp(html) {
  const app = express();

  app.get("/", (req, res) => {
    res.type("html").send(html);
  });

  app.get("/health", (req, res) => {
    res.json({ ok: true, service: "brightsign-web" });
  });

  return app;
}

function registerKmtronicDevices(manager, devices) {
  devices.forEach((deviceConfig) => {
    manager.add(new Kmtronic(deviceConfig));
  });
}

// UDP de KMTronic: recibe respuestas de poll/acciones y envia comandos a reles.
const kmtronicUdp = new UDPServer({ port: config.udpPort });

// UDP independiente para BrightSign: PLAY/STOP al puerto 2023 por defecto.
const brightSignController = new BrightSignController(config.brightSign);

const manager = new DeviceManager(kmtronicUdp);
registerKmtronicDevices(manager, config.kmtronicDevices);

const apiApp = createApiApp(manager, brightSignController);
const webApp = createWebApp(indexHtml);

kmtronicUdp.start();
manager.startPolling(config.pollMs, config.pollDelayMs);

apiApp.listen(config.apiPort, config.host, () => {
  console.log(`[API] escuchando en http://${config.host}:${config.apiPort}`);
  console.log(
    `[API] devices: http://${config.host}:${config.apiPort}/api/devices`,
  );
});

webApp.listen(config.webPort, config.host, () => {
  console.log(`[WEB] panel HTML en http://${config.host}:${config.webPort}`);
});
