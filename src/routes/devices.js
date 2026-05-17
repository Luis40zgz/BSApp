import { Router } from "express";

export function deviceRoutes(manager) {
  const router = Router();

  // GET /api/devices
  router.get("/devices", (req, res) => {
    res.json(manager.list());
  });

  // GET /api/device/:id/status  — estado en memoria (sin UDP)
  router.get("/device/:id/status", (req, res) => {
    const device = manager.get(req.params.id);
    if (!device) return res.status(404).json({ error: "Device no encontrado" });
    res.json(device.getStatus());
  });

  // POST /api/device/:id/query  — envía FF0000 y espera respuesta UDP
  // Response: { ok, relays: [{relay, state}, ...] }
  router.post("/device/:id/query", async (req, res) => {
    const device = manager.get(req.params.id);
    if (!device) return res.status(404).json({ error: "Device no encontrado" });
    try {
      const relays = await device.queryStatus();
      res.json({ ok: true, relays });
    } catch (e) {
      res.status(504).json({ error: e.message });
    }
  });

  // POST /api/device/:id/relay/:relay
  // Body: { "state": true|false }
  // Response: { ok, relay, state, relays: [{relay, state}, ...] }
  router.post("/device/:id/relay/:relay", async (req, res) => {
    const device = manager.get(req.params.id);
    if (!device) return res.status(404).json({ error: "Device no encontrado" });

    const relay = parseInt(req.params.relay);
    if (isNaN(relay) || relay < 1 || relay > 8) {
      return res.status(400).json({ error: "Rele debe ser 1-8" });
    }

    const { state } = req.body;
    if (typeof state !== "boolean") {
      return res.status(400).json({ error: 'Body debe incluir { "state": true|false }' });
    }

    try {
      const relays = await device.setRelay(relay, state);
      res.json({ ok: true, relay, state: state ? "on" : "off", relays });
    } catch (e) {
      res.status(504).json({ error: e.message });
    }
  });

  return router;
}
