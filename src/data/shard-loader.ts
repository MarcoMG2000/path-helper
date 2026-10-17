// Contrato de los módulos generados `src/data/<categoría>/index.ts` (carga perezosa, R61).
// Cada shard JSON es un array de entradas (salvo `spell-lists`, que es un único objeto).

export interface ShardModule {
  default: unknown;
}

export interface ShardRef {
  /** Ruta relativa a `src/data`, p. ej. `classes/druid.json` (la usan los mensajes de error, R60). */
  file: string;
  load: () => Promise<ShardModule>;
}

export interface CategoryShards {
  /** Shards de datos de la categoría. */
  SHARDS: readonly ShardRef[];
  /** Shards de resúmenes ES (`summaries/<categoría>/**.json`): objeto `id -> resumen`. */
  SUMMARIES: readonly ShardRef[];
}
