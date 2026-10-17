import { InMemoryUserStore } from "../../../src/server/stores/in-memory";
import { runUserStoreContract } from "./user-store.contract";

runUserStoreContract("InMemoryUserStore", () => new InMemoryUserStore());
