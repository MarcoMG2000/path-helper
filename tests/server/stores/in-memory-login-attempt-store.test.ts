import { InMemoryLoginAttemptStore } from "../../../src/server/stores/in-memory";
import { runLoginAttemptStoreContract } from "./login-attempt-store.contract";

runLoginAttemptStoreContract("InMemoryLoginAttemptStore", () => new InMemoryLoginAttemptStore());
