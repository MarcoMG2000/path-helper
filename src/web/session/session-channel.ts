// Canal entre pestañas del mismo navegador (R21-R23). Los mensajes no llevan datos: nunca viajan
// nombre, rol ni PIN, y BroadcastChannel no persiste nada (R85).
export type SessionMessage = "login" | "logout";

export interface SessionChannel {
  post(message: SessionMessage): void;
  subscribe(handler: (message: SessionMessage) => void): () => void;
  close(): void;
}

const NULL_CHANNEL: SessionChannel = {
  post() {},
  subscribe() {
    return () => {};
  },
  close() {},
};

function isSessionMessage(value: unknown): value is SessionMessage {
  return value === "login" || value === "logout";
}

export function createBroadcastSessionChannel(name = "ph-session"): SessionChannel {
  if (typeof BroadcastChannel === "undefined") return NULL_CHANNEL;
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(name);
  } catch {
    return NULL_CHANNEL;
  }
  return {
    post(message) {
      try {
        channel.postMessage(message);
      } catch {
        // canal cerrado: sin sincronización, nada más
      }
    },
    subscribe(handler) {
      const listener = (event: MessageEvent<unknown>) => {
        if (isSessionMessage(event.data)) handler(event.data);
      };
      channel.addEventListener("message", listener);
      return () => channel.removeEventListener("message", listener);
    },
    close() {
      channel.close();
    },
  };
}
