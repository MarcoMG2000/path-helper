import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBroadcastSessionChannel,
  type SessionChannel,
  type SessionMessage,
} from "../../../src/web/session/session-channel";

const opened: SessionChannel[] = [];
const open = (name: string) => {
  const channel = createBroadcastSessionChannel(name);
  opened.push(channel);
  return channel;
};

afterEach(() => {
  for (const channel of opened.splice(0)) channel.close();
  vi.unstubAllGlobals();
});

const nextMessage = (channel: SessionChannel) =>
  new Promise<SessionMessage>((resolve) => {
    const stop = channel.subscribe((message) => {
      stop();
      resolve(message);
    });
  });

describe("createBroadcastSessionChannel", () => {
  it("R21: un mensaje publicado en una instancia llega a otra del mismo canal", async () => {
    const a = open("test-r21");
    const b = open("test-r21");
    const received = nextMessage(b);
    a.post("logout");
    expect(await received).toBe("logout");
  });

  it("R22: también propaga el mensaje login", async () => {
    const a = open("test-r22");
    const b = open("test-r22");
    const received = nextMessage(b);
    a.post("login");
    expect(await received).toBe("login");
  });

  it("R24: el canal no entrega datos que no sean los dos mensajes conocidos", async () => {
    const a = new BroadcastChannel("test-r24");
    const b = open("test-r24");
    const seen: SessionMessage[] = [];
    b.subscribe((message) => seen.push(message));
    a.postMessage({ name: "Marta", pin: "1234" });
    a.postMessage("otra-cosa");
    a.postMessage("logout");
    await new Promise((resolve) => setTimeout(resolve, 50));
    a.close();
    expect(seen).toEqual(["logout"]);
  });

  it("R21: cancelar la suscripción deja de entregar mensajes", async () => {
    const a = open("test-unsub");
    const b = open("test-unsub");
    const handler = vi.fn();
    const stop = b.subscribe(handler);
    stop();
    a.post("logout");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(handler).not.toHaveBeenCalled();
  });

  it("R23: sin BroadcastChannel devuelve un canal nulo que no lanza", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const channel = createBroadcastSessionChannel();
    const handler = vi.fn();
    expect(() => {
      channel.post("login");
      channel.subscribe(handler)();
      channel.close();
    }).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("R23: si el constructor lanza también devuelve un canal nulo", () => {
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        constructor() {
          throw new Error("no disponible");
        }
      },
    );
    const channel = createBroadcastSessionChannel();
    expect(() => channel.post("logout")).not.toThrow();
  });
});
