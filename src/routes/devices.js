import { Router } from "express";

export function deviceRoutes(manager) {
  const router = Router();

  // GET /api/devices — lista todos los dispositivos con su estado
  router.get("/devices", (req, res) => {
    res.json(manager.list());
  });

  // GET /api/device/:id/status — estado de un dispositivo específico
  router.get("/device/:id/status", (req, res) => {
    const device = manager.get(req.params.id);
    if (!device) return res.status(404).json({ error: "Device no encontrado" });
    res.json(device.getStatus());
  });

  // POST /api/device/:id/query — fuerza una query de estado por UDP
  router.post("/device/:id/query", (req, res) => {
    const device = manager.get(req.params.id);
    if (!device) return res.status(404).json({ error: "Device no encontrado" });
    if (typeof device.queryStatus !== "function") {
      return res.status(400).json({ error: "Device no soporta queryStatus" });
    }
    device.queryStatus();
    res.json({ ok: true, message: "Query enviada" });
  });

  // POST /api/device/:id/relay/:relay — controla un relé
  // Body: { "state": true } → cerrado (ON), false → abierto (OFF)
  router.post("/device/:id/relay/:relay", (req, res) => {
    const device = manager.get(req.params.id);
    if (!device) return res.status(404).json({ error: "Device no encontrado" });

    const relay = parseInt(req.params.relay);
    if (isNaN(relay) || relay < 1 || relay > 8) {
      return res.status(400).json({ error: "Relé debe ser un número entre 1 y 8" });
    }

    const { state } = req.body;
    if (typeof state !== "boolean") {
      return res.status(400).json({ error: "Body debe incluir { state: true|false }" });
    }

    if (typeof device.setRelay !== "function") {
      return res.status(400).json({ error: "Device no soporta setRelay" });
    }

    device.setRelay(relay, state);
    res.json({ ok: true, relay, state: state ? "on" : "off" });
  });

  return router;
}
