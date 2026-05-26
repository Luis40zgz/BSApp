import React from "react";

function getRelayUiState(state) {
  if (state === "on") {
    return { label: "ON", action: "OFF", toggleClass: "is-on" };
  }

  if (state === "off") {
    return { label: "OFF", action: "ON", toggleClass: "is-off" };
  }

  return { label: "---", action: "ON", toggleClass: "" };
}

/**
 * Boton de control de un rele KMTronic.
 *
 * El componente es puramente visual: recibe el estado y delega la accion al
 * contenedor App mediante onToggle().
 */
export function RelayToggle({ relay, busy = false, onToggle }) {
  const state = relay.state || "unknown";
  const { label, action, toggleClass } = getRelayUiState(state);

  return (
    <div className="relay-cell">
      {busy && (
        <div className="spin-ov">
          <div className="spin" />
        </div>
      )}

      <div className="relay-num">relé {relay.relay}</div>

      <div className="relay-indicator">
        <div className={`relay-dot ${state}`} />
        <div className={`relay-label ${state}`}>{label}</div>
      </div>

      <button
        className={`relay-toggle ${toggleClass}`}
        type="button"
        disabled={busy}
        onClick={onToggle}
      >
        toggle → {action}
      </button>
    </div>
  );
}
