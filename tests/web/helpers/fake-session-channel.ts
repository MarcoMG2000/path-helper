import type { SessionChannel, SessionMessage } from "../../../src/web/session/session-channel";

export interface FakeSessionChannel extends SessionChannel {
  posted: SessionMessage[];
  /** Simula un mensaje recibido de otra pestaña. */
  receive(message: SessionMessage): void;
  closed: boolean;
}

export function makeFakeSessionChannel(): FakeSessionChannel {
  const handlers = new Set<(m: SessionMessage) => void>();
  const channel: FakeSessionChannel = {
    posted: [],
    closed: false,
    post(message) {
      channel.posted.push(message);
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    close() {
      channel.closed = true;
      handlers.clear();
    },
    receive(message) {
      for (const handler of [...handlers]) handler(message);
    },
  };
  return channel;
}
