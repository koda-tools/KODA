import { PROTOCOL_VERSION } from "@agentclientprotocol/sdk";

/** Announce only the ACP features the adapter actually implements. */
export function initializeResult() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    agentInfo: { name: "koda", version: "1.1.0" },
    agentCapabilities: { sessionCapabilities: { close: {} } },
  };
}
