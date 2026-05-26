import React from "react";

/**
 * Controles globales del BrightSign.
 *
 * No dependen del KMTronic seleccionado. El backend enviara PLAY/STOP al host
 * configurado en BRIGHTSIGN_HOST:BRIGHTSIGN_PORT.
 */
export function BrightSignTransportControls({ target, busyCommand, onSend }) {
  const subtitle = target
    ? `Destino independiente: ${target.host}:${target.port} · UDP`
    : "Destino BrightSign no cargado · UDP 2023";

  return (
    <section className="transport-panel" aria-label="Controles BrightSign">
      <div>
        <div className="transport-title">BrightSign Transport</div>
        <div className="transport-subtitle">{subtitle}</div>
      </div>

      <div className="transport-actions">
        <button
          className="transport-btn play"
          type="button"
          disabled={Boolean(busyCommand)}
          onClick={() => onSend("PLAY")}
        >
          <span className="transport-icon">▶</span>
          <span>{busyCommand === "PLAY" ? "enviando..." : "PLAY"}</span>
        </button>

        <button
          className="transport-btn stop"
          type="button"
          disabled={Boolean(busyCommand)}
          onClick={() => onSend("STOP")}
        >
          <span className="transport-icon">■</span>
          <span>{busyCommand === "STOP" ? "enviando..." : "STOP"}</span>
        </button>
      </div>
    </section>
  );
}
