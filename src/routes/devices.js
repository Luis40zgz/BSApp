const { Router } = require("express");

function getDeviceOr404(manager, id, res) {
  const device = manager.get(id);

  if (!device) {
    res.status(404).json({ error: "Device no encontrado" });
    return null;
  }

  return device;
}

/**
 * Rutas REST de la aplicacion.
 *
 * Se mantienen en un unico router para que el build final siga siendo simple.
 * La separacion logica queda clara por bloques: BrightSign y KMTronic.
 */
function deviceRoutes(manager, brightSignController) {
  const router = Router();

  // -------------------------------------------------------------------------
  // KMTronic: listado, estado, query y reles
  // -------------------------------------------------------------------------

  router.get("/devices", (req, res) => {
    res.json(manager.list());
  });

  router.get("/device/:id/status", (req, res) => {
    const device = getDeviceOr404(manager, req.params.id, res);
    if (!device) return;

    res.json(device.getStatus());
  });

  router.post("/device/:id/query", async (req, res) => {
    const device = getDeviceOr404(manager, req.params.id, res);
    if (!device) return;

    try {
      const status = await device.queryStatus();
      res.json({ ok: true, ...status });
    } catch (error) {
      res.status(504).json({ error: error.message, ...device.getStatus() });
    }
  });

  router.post("/device/:id/relay/:relay", async (req, res) => {
    const device = getDeviceOr404(manager, req.params.id, res);
    if (!device) return;

    const relay = Number.parseInt(req.params.relay, 10);

    if (Number.isNaN(relay) || relay < 1 || relay > 8) {
      return res.status(400).json({ error: "Rele debe ser 1-8" });
    }

    if (typeof req.body.state !== "boolean") {
      return res
        .status(400)
        .json({ error: 'Body debe incluir { "state": true|false }' });
    }

    try {
      const status = await device.setRelay(relay, req.body.state);
      return res.json({
        ok: true,
        relay,
        requestedState: req.body.state ? "on" : "off",
        ...status,
      });
    } catch (error) {
      return res
        .status(504)
        .json({ error: error.message, ...device.getStatus() });
    }
  });

  // -------------------------------------------------------------------------
  // BrightSign: transporte PLAY/STOP por UDP independiente
  // -------------------------------------------------------------------------

  router.get("/brightsign", (req, res) => {
    res.json(brightSignController.getConfig());
  });

  router.post("/brightsign/transport", (req, res) => {
    try {
      const result = brightSignController.send(req.body && req.body.command);
      return res.json({ ok: true, target: "brightsign", ...result });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  // Alias util para pruebas manuales: POST /api/brightsign/PLAY
  router.post("/brightsign/:command", (req, res) => {
    try {
      const result = brightSignController.send(req.params.command);
      return res.json({ ok: true, target: "brightsign", ...result });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { deviceRoutes };
