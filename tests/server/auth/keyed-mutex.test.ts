import { describe, expect, it } from "vitest";
import { KeyedMutex } from "../../../src/server/auth/keyed-mutex";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("KeyedMutex", () => {
  it("serializa las tareas de la misma clave, en orden de llegada", async () => {
    const mutex = new KeyedMutex();
    const log: string[] = [];
    const gate = deferred();
    const first = mutex.runExclusive("k", async () => {
      log.push("1 inicio");
      await gate.promise;
      log.push("1 fin");
    });
    const second = mutex.runExclusive("k", async () => {
      log.push("2 inicio");
      log.push("2 fin");
    });
    const third = mutex.runExclusive("k", async () => {
      log.push("3");
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(log).toEqual(["1 inicio"]); // la 2 y la 3 esperan
    gate.resolve();
    await Promise.all([first, second, third]);
    expect(log).toEqual(["1 inicio", "1 fin", "2 inicio", "2 fin", "3"]);
  });

  it("claves distintas no se bloquean entre sí", async () => {
    const mutex = new KeyedMutex();
    const gate = deferred();
    const blocked = mutex.runExclusive("a", () => gate.promise);
    const other = await mutex.runExclusive("b", async () => "listo");
    expect(other).toBe("listo");
    gate.resolve();
    await blocked;
  });

  it("devuelve el resultado de la tarea", async () => {
    const mutex = new KeyedMutex();
    expect(await mutex.runExclusive("k", async () => 42)).toBe(42);
  });

  it("una tarea que lanza libera la clave y propaga el error", async () => {
    const mutex = new KeyedMutex();
    await expect(
      mutex.runExclusive("k", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await mutex.runExclusive("k", async () => "sigue")).toBe("sigue");
  });

  it("una tarea que lanza no impide ejecutar las que ya esperaban", async () => {
    const mutex = new KeyedMutex();
    const gate = deferred();
    const first = mutex.runExclusive("k", async () => {
      await gate.promise;
      throw new Error("falla");
    });
    const second = mutex.runExclusive("k", async () => "segunda");
    gate.resolve();
    await expect(first).rejects.toThrow("falla");
    expect(await second).toBe("segunda");
  });

  it("libera la entrada de la clave cuando no queda trabajo (sin fugas)", async () => {
    const mutex = new KeyedMutex();
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => mutex.runExclusive(`k${i % 5}`, async () => i)),
    );
    expect(mutex.activeKeys).toBe(0);
  });

  it("muchas tareas concurrentes sobre una clave nunca se solapan", async () => {
    const mutex = new KeyedMutex();
    let running = 0;
    let maxRunning = 0;
    await Promise.all(
      Array.from({ length: 20 }, () =>
        mutex.runExclusive("k", async () => {
          running += 1;
          maxRunning = Math.max(maxRunning, running);
          await new Promise((r) => setTimeout(r, 1));
          running -= 1;
        }),
      ),
    );
    expect(maxRunning).toBe(1);
  });
});
