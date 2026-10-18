import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { UserDto } from "../../shared";
import type { ApiResult } from "../api/http-client";
import { useServices } from "../api/services";
import type { SessionChannel } from "./session-channel";

export type SessionNotice = "expired" | "signed-out-elsewhere";

// Solo `{ id, name, role }` y avisos: nunca PIN ni token (R24).
export type SessionState =
  | { status: "loading" }
  | { status: "authenticated"; user: UserDto }
  | { status: "anonymous"; notice?: SessionNotice }
  | { status: "error" };

export interface SessionValue {
  state: SessionState;
  login(name: string, pin: string): Promise<ApiResult<UserDto>>;
  logout(): Promise<ApiResult<void>>;
  /** Reintenta `me` (desde `error`). */
  reload(): void;
  clearNotice(): void;
}

const SessionContext = createContext<SessionValue | null>(null);

function toUser(user: UserDto): UserDto {
  return { id: user.id, name: user.name, role: user.role };
}

export function SessionProvider({
  channel,
  children,
}: {
  channel?: SessionChannel;
  children: ReactNode;
}) {
  const { auth, onUnauthenticated } = useServices();
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const stateRef = useRef(state);
  // Contador de peticiones `me`: StrictMode monta dos veces y una respuesta obsoleta se ignora.
  const requestId = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setState((prev) => (prev.status === "loading" ? prev : { status: "loading" }));
    void auth.me().then((result) => {
      if (id !== requestId.current) return;
      if (result.ok) setState({ status: "authenticated", user: toUser(result.value) });
      else if (result.error.status === 401) setState({ status: "anonymous" });
      else setState({ status: "error" });
    });
  }, [auth]);

  useEffect(() => {
    load();
    return () => {
      requestId.current++;
    };
  }, [load]);

  useEffect(
    () =>
      onUnauthenticated(() => {
        setState((prev) =>
          prev.status === "authenticated" ? { status: "anonymous", notice: "expired" } : prev,
        );
      }),
    [onUnauthenticated],
  );

  useEffect(() => {
    if (!channel) return undefined;
    return channel.subscribe((message) => {
      if (message === "logout") {
        setState((prev) =>
          prev.status === "authenticated"
            ? { status: "anonymous", notice: "signed-out-elsewhere" }
            : prev,
        );
      } else if (stateRef.current.status === "anonymous") {
        load();
      }
    });
  }, [channel, load]);

  const login = useCallback<SessionValue["login"]>(
    async (name, pin) => {
      const result = await auth.login(name, pin);
      if (result.ok) {
        requestId.current++;
        setState({ status: "authenticated", user: toUser(result.value) });
        channel?.post("login");
      }
      return result;
    },
    [auth, channel],
  );

  const logout = useCallback<SessionValue["logout"]>(async () => {
    const result = await auth.logout();
    if (result.ok) {
      requestId.current++;
      setState({ status: "anonymous" });
      channel?.post("logout");
    }
    return result;
  }, [auth, channel]);

  const clearNotice = useCallback(() => {
    setState((prev) =>
      prev.status === "anonymous" && prev.notice ? { status: "anonymous" } : prev,
    );
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ state, login, logout, reload: load, clearNotice }),
    [state, login, logout, load, clearNotice],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession requiere un SessionProvider");
  return value;
}

/** Solo dentro de `RequireAuth`: la guarda garantiza la sesión. */
export function useUser(): UserDto {
  const { state } = useSession();
  if (state.status !== "authenticated") throw new Error("useUser requiere una sesión activa");
  return state.user;
}
