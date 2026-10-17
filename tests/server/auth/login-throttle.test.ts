import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LOCKOUT } from "../../../src/server/auth/config";
import { LoginThrottle } from "../../../src/server/auth/login-throttle";
import { InMemoryLoginAttemptStore } from "../../../src/server/stores/in-memory";
import { FakeClock } from "../../helpers/fake-clock";

const MIN = 60_000;
const HOUR = 60 * MIN;

let clock: FakeClock;
let store: InMemoryLoginAttemptStore;
let throttle: LoginThrottle;

beforeEach(() => {
  clock = new FakeClock(1_000_000);
  store = new InMemoryLoginAttemptStore();
  throttle = new LoginThrottle(store, clock, DEFAULT_LOCKOUT);
});

async function fail(key: string, times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) await throttle.recordFailure(key);
}

describe("LoginThrottle", () => {
  it("R41: cuenta fallos por clave de nombre aunque no exista ninguna cuenta con ese nombre", async () => {
    await fail("fantasma", 3);
    expect(await store.get("fantasma")).toMatchObject({ failures: 3, lockLevel: 0 });
    expect(await throttle.check("fantasma")).toEqual({ locked: false });
  });

  it("R41: los contadores de claves distintas son independientes", async () => {
    await fail("a", 4);
    await fail("b", 1);
    await throttle.recordFailure("a");
    expect(await throttle.check("a")).toMatchObject({ locked: true });
    expect(await throttle.check("b")).toEqual({ locked: false });
  });

  it("R42: el 4.º fallo no bloquea y el 5.º bloquea 15 minutos", async () => {
    await fail("ana", 4);
    expect(await throttle.check("ana")).toEqual({ locked: false });
    const result = await throttle.recordFailure("ana");
    expect(result.lockedUntil).toBe(clock.now() + 15 * MIN);
    expect(await throttle.check("ana")).toEqual({
      locked: true,
      lockedUntil: clock.now() + 15 * MIN,
    });
  });

  it("R44: mientras está bloqueada, un fallo adicional no incrementa el contador ni alarga el bloqueo", async () => {
    await fail("ana", 5);
    const locked = await store.get("ana");
    clock.advance(5 * MIN);
    await fail("ana", 10);
    expect(await store.get("ana")).toEqual(locked);
  });

  it("R45: bloqueos sucesivos duplican la duración hasta el tope de 24 h", async () => {
    const expected = [15 * MIN, 30 * MIN, 60 * MIN, 120 * MIN, 240 * MIN, 480 * MIN, 960 * MIN];
    for (const duration of expected) {
      await fail("ana", 4);
      const { lockedUntil } = await throttle.recordFailure("ana");
      expect(lockedUntil).toBe(clock.now() + duration);
      clock.advance(duration);
    }
    // Siguientes: 1920 min se recorta a 24 h, y se mantiene.
    for (let i = 0; i < 3; i += 1) {
      await fail("ana", 4);
      const { lockedUntil } = await throttle.recordFailure("ana");
      expect(lockedUntil).toBe(clock.now() + 24 * HOUR);
      clock.advance(24 * HOUR);
    }
  });

  it("R45: el nivel se conserva entre bloqueos aunque el desbloqueo por tiempo ponga los fallos a 0", async () => {
    await fail("ana", 5);
    clock.advance(15 * MIN);
    expect(await throttle.check("ana")).toEqual({ locked: false });
    await fail("ana", 4);
    expect(await throttle.check("ana")).toEqual({ locked: false });
    await throttle.recordFailure("ana");
    expect(await store.get("ana")).toMatchObject({ lockLevel: 2, failures: 0 });
  });

  it("R46: al terminar el bloqueo se permiten nuevos intentos con el contador a 0", async () => {
    await fail("ana", 5);
    clock.advance(15 * MIN - 1);
    expect(await throttle.check("ana")).toMatchObject({ locked: true });
    clock.advance(1);
    expect(await throttle.check("ana")).toEqual({ locked: false });
    // Hacen falta otros 5 fallos completos para el siguiente bloqueo.
    await fail("ana", 4);
    expect(await throttle.check("ana")).toEqual({ locked: false });
    await throttle.recordFailure("ana");
    expect(await throttle.check("ana")).toMatchObject({ locked: true });
  });

  it("R47: reset olvida contador y nivel", async () => {
    await fail("ana", 5);
    await throttle.reset("ana");
    expect(await store.get("ana")).toBeNull();
    expect(await throttle.check("ana")).toEqual({ locked: false });
    await fail("ana", 5);
    // vuelve a 15 min (nivel 1), no a 30
    expect(await throttle.check("ana")).toEqual({
      locked: true,
      lockedUntil: clock.now() + 15 * MIN,
    });
  });

  it("R47: reset de una clave inexistente no falla", async () => {
    await expect(throttle.reset("nadie")).resolves.toBeUndefined();
  });

  it("R50: purgeIdle elimina las claves sin actividad desde hace más de 48 h y conserva las recientes", async () => {
    await fail("vieja", 2);
    clock.advance(47 * HOUR);
    await fail("reciente", 1);
    clock.advance(HOUR + 1);
    expect(await throttle.purgeIdle()).toBe(1); // "vieja": 48 h + 1 ms
    expect(await store.get("vieja")).toBeNull();
    expect(await store.get("reciente")).not.toBeNull();
  });

  it("R50: un fallo registrado dispara la purga de otras claves inactivas", async () => {
    await fail("vieja", 2);
    clock.advance(49 * HOUR);
    await throttle.recordFailure("otra");
    expect(await store.get("vieja")).toBeNull();
  });

  it("R50: un estado inactivo pendiente de purga ya cuenta como olvidado (no hereda nivel ni fallos)", async () => {
    await fail("ana", 5);
    clock.advance(49 * HOUR);
    expect(await throttle.check("ana")).toEqual({ locked: false });
    await throttle.recordFailure("ana");
    expect(await store.get("ana")).toMatchObject({ failures: 1, lockLevel: 0 });
  });

  it("respeta una configuración distinta (3 fallos, 1 min, tope 2 min)", async () => {
    const custom = new LoginThrottle(store, clock, {
      maxFailures: 3,
      baseLockMs: MIN,
      maxLockMs: 2 * MIN,
      idleResetMs: HOUR,
    });
    for (let i = 0; i < 3; i += 1) await custom.recordFailure("x");
    expect(await custom.check("x")).toEqual({ locked: true, lockedUntil: clock.now() + MIN });
    clock.advance(MIN);
    for (let i = 0; i < 3; i += 1) await custom.recordFailure("x");
    expect(await custom.check("x")).toEqual({ locked: true, lockedUntil: clock.now() + 2 * MIN });
    clock.advance(2 * MIN);
    for (let i = 0; i < 3; i += 1) await custom.recordFailure("x");
    expect(await custom.check("x")).toEqual({ locked: true, lockedUntil: clock.now() + 2 * MIN });
  });
});
