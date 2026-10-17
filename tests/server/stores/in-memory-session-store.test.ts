import { InMemorySessionStore } from "../../../src/server/stores/in-memory";
import { runSessionStoreContract } from "./session-store.contract";

runSessionStoreContract("InMemorySessionStore", () => ({
  store: new InMemorySessionStore(),
  seedUser: async () => {},
}));
