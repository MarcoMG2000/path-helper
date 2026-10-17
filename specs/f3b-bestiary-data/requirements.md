# f3b-bestiary-data: Requirements

> Feature: **Datos de monstruos del Bestiario (dataset separado)** (`depends_on: f3-srd-data`;
> se recomienda añadir `f2-rules-engine-core`, ver Q14).
> Notación EARS (ver `docs/specs.md`). Cada `R<n>` es estable y verificable por un test concreto
> (tabla "Verificación" al final). Este spec EXTIENDE `specs/f3-srd-data/`: no redefine su
> pipeline, su procedencia ni su aviso OGL; cuando dice "como f3" significa "reutilizando el
> mismo código, parametrizado" (detalle en `design.md` §2).
> Decisión del humano (2026-10-16): excepción consciente a "solo Core Rulebook" para que el GM
> use y edite monstruos; el dataset del Bestiario vive APARTE del Core. Alcance asumido:
> **Pathfinder Roleplaying Game Bestiary (1ª edición) únicamente** (Q1).

## Glosario del spec

- **Bestiario / B1**: Pathfinder Roleplaying Game Bestiary (1ª edición). Valor `book: "B1"`.
- **Dataset Core**: el de f3 (`CATEGORIES` de f3, `book: "CRB"`). **Dataset Bestiario**: el de este
  feature, bajo `src/data/bestiary/`, con su propio registro de categorías y su propia allowlist de libros.
- **Página**: una página de monstruo de la fuente (puede contener varios bloques de estadísticas).
  **Bloque de estadísticas** (*stat block*): la ficha numérica de una criatura. **Entrada**: un
  bloque de estadísticas almacenado como registro `monsters`.
- **Línea de estadística**: cada línea etiquetada del bloque (`Init`, `AC`, `hp`, `Melee`, ...);
  la lista cerrada está en `design.md` §4.2.
- **Lote** (*batch*): rango alfabético contiguo de páginas, unidad de trabajo paralelo y de
  fichero (`monsters/b<NN>.json`).
- **Error** vs **aviso** (*warning*): un error hace fallar `bestiary:validate`; un aviso marca la
  entrada `needsReview` y se lista, pero no falla (ver §D).
- **Fuente primaria / de contraste**: como f3 (Archives of Nethys / d20pfsrd).

## A. Separación del Core y modelo base

- **R1.** El sistema DEBE almacenar los datos del Bestiario bajo `src/data/bestiary/`, separados
  de los ficheros del Core, con un registro propio `src/data/bestiary/categories.ts` que declare
  exactamente las categorías `monsters`, `monster-feats`, `universal-rules` y `creature-types`.
- **R2.** El sistema DEBE definir un `BestiaryBaseEntrySchema` con los campos `id`, `name`,
  `textEn`, `source`, `sourceRef`, `book`, `needsReview?` y `reviewFlags?`, construido
  reutilizando los validadores exportados por f3 (`noHtmlTags`, host permitido, `slugify`) sin copiarlos.
- **R3.** SI el `book` de una entrada del Bestiario no pertenece a la allowlist de
  `scripts/bestiary/config/books.json` (inicialmente solo `B1`), ENTONCES el schema DEBE rechazarla.
- **R4.** SI una entrada del Bestiario tiene `book: "CRB"`, ENTONCES el schema del Bestiario DEBE
  rechazarla.
- **R5.** SI una entrada validada con los schemas del Core de f3 tiene un `book` de la allowlist
  del Bestiario, ENTONCES el schema del Core DEBE rechazarla (la regla R3 de f3 sigue vigente sin cambios).
- **R6.** El campo `sourceRef` DEBE conservar la etiqueta literal de fuente de la página y SI no
  empieza por uno de los prefijos que `books.json` declara para el `book` de la entrada, ENTONCES
  la validación DEBE fallar.
- **R7.** El campo `source` DEBE ser una URL `https` cuyo host pertenezca a la lista de hosts
  permitidos de f3; SI no, ENTONCES el schema DEBE rechazarla.
- **R8.** El campo `textEn` DEBE contener el texto original del bloque en inglés como Markdown
  restringido (párrafos, negritas, listas, tablas simples) y SI está vacío o contiene etiquetas
  HTML, ENTONCES el schema DEBE rechazarlo.
- **R9.** El sistema NO DEBE añadir categorías del Bestiario a `CATEGORIES` de f3, y CUANDO se
  ejecuta `runIntegrity` de f3 sobre los datos reales del Core con el dataset del Bestiario
  presente, el resultado DEBE ser idéntico al obtenido sin él.
- **R10.** Los ficheros de `src/data` ajenos a `src/data/bestiary/` NO DEBEN importar de
  `src/data/bestiary/` ni reexportarlo, y `src/data/index.ts` NO DEBE exponer el Bestiario.
- **R11.** Los ficheros de `src/web` NO DEBEN importar de `src/data/bestiary/` salvo mediante
  `import type`, de modo que los datos de monstruos no entren en el bundle del cliente.
- **R12.** El sistema DEBE derivar el `id` de una entrada `monsters` como `slug(pageName)` si la
  página tiene un único bloque, o `slug(pageName).slug(variantLabel)` si tiene varios, y SI el `id`
  no coincide con esa derivación (salvo alias declarado en `scripts/bestiary/config/slug-aliases.json`),
  ENTONCES la validación DEBE fallar; los `id` de las demás categorías DEBEN ser `slug(name)`.
- **R13.** SI dos entradas de una misma categoría del Bestiario comparten `id`, ENTONCES la
  validación DEBE fallar indicando ambos orígenes.

## B. Schema de monstruo (bloque de estadísticas completo)

- **R14.** El schema `monsters` DEBE exigir `pageId`, `pageName`, `variantLabel?`, `cr` (una de
  las etiquetas de la tabla de FP del Core: `1/8`, `1/6`, `1/4`, `1/3`, `1/2`, `1` a `25`) y `xp`
  (entero no negativo), y SI `cr` no pertenece a esa lista, ENTONCES DEBE rechazar la entrada.
- **R15.** El schema `monsters` DEBE exigir `alignment` (los nueve alineamientos o `null`),
  `size` (el tipo `Size` de `src/rules`), `type` (uno de los 13 tipos de criatura) y `subtypes`
  (lista de slugs).
- **R16.** El schema `monsters` DEBE exigir `initiative` (entero), `senses` (lista de sentidos con
  alcance en pies cuando exista) y `perception` (entero o `null`), y DEBE admitir `auras`.
- **R17.** El schema `monsters` DEBE exigir `ac` con `total`, `touch`, `flatFooted` (enteros) y
  `components`: lista de componentes de CA tipados con `BONUS_TYPES` de `src/rules` o con
  `ability` y el id de característica, cada uno con su valor entero.
- **R18.** El schema `monsters` DEBE exigir `hp` con `total`, `dice` (lista de `{count, sides}`),
  `bonus` (entero) y `hd` (entero positivo igual a la suma de `count`), y SI `hd` difiere de esa
  suma, ENTONCES la validación DEBE fallar.
- **R19.** El schema `monsters` DEBE exigir `saves` con `fort`, `ref` y `will` enteros y notas
  condicionales opcionales (p. ej. "+2 contra encantamientos").
- **R20.** El schema `monsters` DEBE exigir `defense` con `dr` (cantidad y obviadores), `sr`
  (entero o `null`), `resist` (tipo y cantidad), `immune`, `weaknesses` y `defensiveAbilities`.
- **R21.** El schema `monsters` DEBE exigir `speeds` como lista de `{mode, ft}` con `mode` en
  `land|burrow|climb|fly|swim` y, para `fly`, `maneuverability`.
- **R22.** El schema `monsters` DEBE exigir `spaceFt` y `reachFt` (números en pies) y admitir
  `reachNotes`.
- **R23.** El schema `monsters` DEBE exigir `melee` y `ranged` como listas de rutinas de ataque
  alternativas, cada una con una lista de ataques `{name, count, attackBonuses, damage, raw}`,
  donde `attackBonuses` es la lista de enteros de los ataques iterativos.
- **R24.** CUANDO un ataque tiene daño, el schema DEBE exigir `damage` con `dice` (`{count, sides}`),
  `bonus`, `critRange` (umbral de amenaza), `critMultiplier`, `extras` (dados de daño adicional con
  su texto) y `effects` (efectos tras "plus"), de modo que la calculadora de f6 pueda
  usarlos sin analizar texto.
- **R25.** El schema `monsters` DEBE exigir `specialAttacks` como lista de `{name, detail?, dc?}`.
- **R26.** El schema `monsters` DEBE admitir `spellcasting` como lista de bloques de conjuros o
  capacidades sortílegas con `casterLevel`, `concentration`, `source?` y grupos de conjuros con su
  frecuencia o nivel y, por conjuro, `name`, `spellId` (id de `spells` del Core; `null` solo si el
  conjuro no es del Core) y `dc?`.
- **R27.** El schema `monsters` DEBE exigir `abilityScores` con las seis características como
  entero o `null`, donde `null` representa "—".
- **R28.** El schema `monsters` DEBE exigir `bab` (entero), `cmb` y `cmd` (cada uno con `total`
  entero o `null` y notas opcionales).
- **R29.** El schema `monsters` DEBE exigir `feats` como lista de `{name, choice?, featId, source}`
  con `source` en `core|bestiary|unresolved`.
- **R30.** El schema `monsters` DEBE exigir `skills` como lista de `{name, subject?, skillId, value,
  conditional?}` y admitir `racialModifiers`.
- **R31.** El schema `monsters` DEBE exigir `languages` (lista y capacidades especiales como
  telepatía) y `specialQualities` (lista de `{name, detail?}`), y admitir `environment`,
  `organization` y `treasure` como texto del SRD.
- **R32.** El schema `monsters` DEBE exigir `specialAbilities` como lista de `{name, abilityType, textEn}`
  con `abilityType` en `Ex|Su|Sp|null` y `textEn` íntegro y no vacío.
- **R33.** El schema `monsters` DEBE exigir `lines`, el texto literal de cada línea de estadística,
  y SI el texto de una línea de `lines` no aparece (normalizado) en `textEn`, ENTONCES la validación
  DEBE fallar.
- **R34.** SI el parser encuentra en un bloque una línea de estadística no incluida en la lista
  cerrada de líneas conocidas, ENTONCES `bestiary:parse` DEBE fallar nombrando la página y la
  línea, sin incluir ese contenido.
- **R35.** SI el parser no consigue interpretar un fragmento dentro de una línea conocida, ENTONCES
  DEBE conservarlo en `leftovers` y añadir el aviso `unparsed-fragment` a `reviewFlags`.
- **R36.** CUANDO una página contiene `n` bloques de estadísticas, el sistema DEBE producir `n`
  entradas que comparten `pageId`, con `variantLabel` único dentro de la página, y el texto
  descriptivo de la página (`descriptionEn`) SOLO en la primera.
- **R37.** El sistema DEBE exportar `MonsterStatsSchema` (el schema de las estadísticas sin los
  campos de procedencia) y construir `MonsterSchema` a partir de él, para que f5b valide con el
  mismo schema los monstruos creados o editados a mano.

## C. Cobertura, recuentos y referencias

- **R38.** CUANDO se valida la categoría `monsters`, el número de páginas distintas DEBE ser igual
  al `expectedPages` congelado en la procedencia a partir del índice de la fuente filtrado por
  libro, y SI difiere, ENTONCES la validación DEBE fallar.
- **R39.** CUANDO `bestiary:parse` procesa una página, el número de entradas producidas DEBE ser
  igual al número de bloques que detecta una heurística independiente del parser (recuento de
  encabezados `CR`/`XP` en el HTML crudo), y SI difieren, ENTONCES DEBE fallar nombrando la página.
- **R40.** CUANDO se valida la categoría `monsters`, el número de entradas DEBE ser igual al
  `expectedStatBlocks` congelado en la procedencia (por lote y en total), y SI difiere, ENTONCES la
  validación DEBE fallar.
- **R41.** SI una página fuente declara un libro fuera de la allowlist de `books.json`, ENTONCES
  `bestiary:parse` DEBE excluirla de los datos y listarla en el informe de importación
  `reports/bestiary-import-<fecha>.md`.
- **R42.** CUANDO se validan las categorías `monster-feats`, `universal-rules` y `creature-types`,
  el número de entradas de cada una DEBE ser igual a su `expectedCount` congelado, y SI difiere,
  ENTONCES la validación DEBE fallar.
- **R43.** SI el `type` o un elemento de `subtypes` de un monstruo no resuelve a una entrada de
  `creature-types`, ENTONCES la validación DEBE fallar.
- **R44.** CUANDO se valida un monstruo, cada dote de `feats` con `source` distinto de
  `unresolved` DEBE resolver a un id de `feats` del Core o de `monster-feats`, y SI no resuelve,
  ENTONCES la validación DEBE fallar; las dotes `unresolved` DEBEN contarse en el informe.
- **R45.** SI un `skillId` de un monstruo no existe en `skills` del Core, ENTONCES la validación
  DEBE fallar; los nombres de habilidad sin id (`null`) DEBEN contarse en el informe.
- **R46.** CUANDO se valida un monstruo, cada `spellId` no nulo DEBE existir en `spells` del Core,
  y SI no existe, ENTONCES la validación DEBE fallar; los conjuros con `spellId: null` DEBEN
  contarse en el informe y, SI el nombre normalizado de uno de ellos coincide con el `id` de un
  conjuro de `spells` del Core (ya incluye los de mago/hechicero, ver Q4), ENTONCES la validación
  DEBE fallar.

## D. Coherencia aritmética entre campos

> Principio: una regla sin término libre es un **error**; una regla con término libre (p. ej. bonos
> varios en salvaciones) calcula un **residuo** y emite un **aviso** si el residuo no lo explica una
> causa listada en los datos. Las fórmulas están en `design.md` §6.

- **R47.** SI `xp` no es igual al valor de la tabla de PX por FP del Core para `cr`, ENTONCES la
  validación DEBE fallar con un error.
- **R48.** SI `ac.total` no es igual a 10 más la suma de los valores de `ac.components`, ENTONCES
  la validación DEBE fallar con un error.
- **R49.** SI `ac.touch` o `ac.flatFooted` no coincide con el valor que `armorClass()` de
  `src/rules` calcula a partir de `size` y de los componentes de CA, ENTONCES la validación DEBE
  fallar con un error, salvo en monstruos con "uncanny dodge" para `flatFooted`, donde DEBE emitir un aviso.
- **R50.** SI el componente de tamaño de `ac.components` difiere de `sizeModifier(size)` de
  `src/rules`, o el componente de Destreza difiere del modificador de `abilityScores.dex`, ENTONCES
  la validación DEBE emitir el aviso `ac-component-mismatch`.
- **R51.** SI el valor medio de `hp.dice` más `hp.bonus` difiere de `hp.total` en más de 1,
  ENTONCES la validación DEBE fallar con un error.
- **R52.** SI `hp.bonus` difiere de `hd` por el modificador de Constitución y la diferencia no la
  explica una dote, una regla de constructo o una nota listada, ENTONCES la validación DEBE emitir
  el aviso `hp-bonus-residual`.
- **R53.** SI los dados de `hp.dice` o el `bab` no coinciden con los de la tabla de tipo de
  criatura y `hd` (tipo no `humanoid`), ENTONCES la validación DEBE emitir el aviso
  `type-progression-mismatch`.
- **R54.** SI `cmb.total` o `cmd.total` difiere del valor derivado de `bab`, características y
  modificador especial de tamaño y el residuo no lo explica una dote listada, ENTONCES la
  validación DEBE emitir el aviso `cm-residual`.
- **R55.** SI el residuo de una salvación (total menos base por DG y tipo, menos modificador de
  característica) no lo explica una dote listada, ENTONCES la validación DEBE emitir el aviso
  `save-residual`.
- **R56.** SI el residuo de `initiative` (total menos modificador de Destreza) no lo explica una
  dote listada, ENTONCES la validación DEBE emitir el aviso `initiative-residual`.
- **R57.** SI `spaceFt` no es el espacio que el Core asigna a `size`, ENTONCES la validación DEBE
  emitir el aviso `space-size-mismatch`.
- **R58.** SI los `attackBonuses` de un ataque iterativo no descienden de 5 en 5, o el residuo del
  primer bonificador (menos BAB, característica y tamaño) no lo explican una dote o un bonificador
  de mejora listados, ENTONCES la validación DEBE emitir el aviso `attack-residual`.
- **R59.** CUANDO se ejecuta `bestiary:parse`, el sistema DEBE guardar en `reviewFlags` de cada
  entrada los avisos de R35, R49 a R58 que le apliquen y poner `needsReview: true`, y SI los
  `reviewFlags` guardados difieren de los recalculados, ENTONCES `bestiary:validate` DEBE fallar.
- **R60.** DONDE exista el fichero `src/data/bestiary/review/<lote>.json`, el sistema DEBE
  tratar como revisado por el humano cada aviso listado con `reviewedBy`, `reviewedAt` y `note`,
  y SI un reconocimiento no corresponde a un aviso existente, ENTONCES la validación DEBE fallar.
- **R61.** SI las tablas de referencia (`xp-table.json`, `type-progression.json`) no coinciden con
  sus valores de referencia `tests/data/bestiary/fixtures/*-golden.json` aprobados por el humano, o
  el modificador especial de tamaño de CMB/CMD no es el opuesto de `sizeModifier(size)` de
  `src/rules`, ENTONCES la validación DEBE fallar.
- **R62.** El sistema DEBE producir, para cada monstruo del fichero de valores de referencia
  `tests/data/bestiary/fixtures/monster-golden.json` (al menos 12 monstruos aprobados por el humano),
  datos idénticos a los de ese fichero en los campos que éste declare.

## E. Aviso legal OGL

- **R63.** El sistema DEBE incluir en `LICENSE-OGL.md`, además de lo exigido por f3 R37, la
  Section 15 del Pathfinder Roleplaying Game Bestiary reproducida literalmente.
- **R64.** El módulo `src/data` DEBE devolver desde `getLegalNotice()` (f3 R38) las entradas de
  Section 15 del Bestiario, y su contenido DEBE seguir siendo idéntico al de `LICENSE-OGL.md`.
- **R65.** El sistema DEBE etiquetar con `license: "OGL-1.0a"` cada fichero de procedencia del
  Bestiario.
- **R66.** DONDE una línea de Section 15 del Bestiario atribuya un monstruo a una fuente de
  terceros, el sistema DEBE guardar esa línea literal en `attribution` de la entrada y SI una
  línea de este tipo no corresponde a ningún monstruo, o un monstruo con `attribution` no tiene
  su línea, ENTONCES la validación DEBE fallar.

## F. Adquisición reproducible

- **R67.** El sistema DEBE proporcionar `npm run bestiary:import` que descubra las páginas
  desde el índice de monstruos de la fuente y las descargue con el `User-Agent`, el límite de
  1 petición por segundo y los reintentos acotados de f3 R41, guardándolas en `.cache/srd-raw/`.
- **R68.** SI ya existe una importación del Bestiario en curso, ENTONCES `bestiary:import`
  DEBE terminar sin descargar nada e indicar el bloqueo, de modo que el total de peticiones al
  servidor no supere 1 por segundo.
- **R69.** CUANDO se descarga una página, el sistema DEBE registrar en
  `src/data/bestiary/provenance/<categoría>[-<lote>].json` su URL, `sha256`, bytes, fecha de
  descarga y número de bloques detectados.
- **R70.** CUANDO se ejecuta `npm run bestiary:parse -- --batch <id>`, el sistema DEBE generar
  los ficheros de ese lote únicamente desde la caché local, sin acceso a red, y escribir solo los
  ficheros declarados para ese lote.
- **R71.** CUANDO se ejecuta `bestiary:parse` dos veces con la misma caché, el sistema DEBE
  producir ficheros idénticos byte a byte.
- **R72.** SI el `sha256` de una página cacheada no coincide con el registrado, ENTONCES
  `bestiary:parse` DEBE fallar salvo que se pase `--accept-drift`; y CUANDO se ejecuta
  `bestiary:import -- --verify`, DEBE listar las páginas que difieren sin modificar `src/data`.
- **R73.** SI el parser encuentra un encabezado de sección que no pertenece a la lista permitida
  del Bestiario, ENTONCES `bestiary:parse` DEBE fallar nombrando la página y el encabezado, sin
  incluir ese contenido.
- **R74.** El sistema DEBE aplicar las correcciones de `src/data/bestiary/overrides/<lote>.json`
  tras el parseo, cada una identificando el campo con un puntero JSON, y SI una corrección carece
  de `reason` o `evidence`, o su valor ya coincide con el parseado, ENTONCES la validación DEBE
  fallar.
- **R75.** El sistema DEBE repartir las páginas en lotes según `scripts/bestiary/config/batches.json`
  de modo que cada página pertenezca a exactamente un lote, los lotes sean rangos alfabéticos
  contiguos por `pageId`, ninguno supere `maxPagesPerBatch` y todos los bloques de una página
  queden en el mismo lote.
- **R76.** CUANDO se genera un fichero `monsters/b<NN>.json`, su tamaño DEBE ser como máximo
  400 KB, y SI lo supera, ENTONCES la validación DEBE fallar.
- **R77.** Los tests unitarios del Bestiario NO DEBEN realizar peticiones de red.

## G. Validación y muestreo

- **R78.** El sistema DEBE proporcionar `npm run bestiary:validate` que ejecute las reglas de
  integridad clasificadas como error (R3 a R8, R12, R13, R18, R33, R38, R40, R42 a R49, R51, R59 a R61,
  R66, R74 a R76, R85, R93) y devuelva código de salida distinto de cero si hay algún error.
- **R79.** CUANDO la validación encuentra errores o avisos, el sistema DEBE informar de todos
  ellos agrupados por regla, lote e `id`, distinguiendo errores de avisos, sin detenerse en el primero.
- **R80.** CUANDO se ejecuta `npm run bestiary:sample -- --seed <n> --per-type <k>`, el sistema
  DEBE generar `reports/bestiary-sample-<seed>.md` con una muestra estratificada: todas las entradas
  con `needsReview` o `override`, todas las de páginas con varios bloques, las de FP mayor o igual
  que 15, y `k` entradas aleatorias por cada tipo de criatura.
- **R81.** CUANDO se repite `bestiary:sample` con la misma semilla y los mismos datos, el sistema
  DEBE generar un informe idéntico.
- **R82.** Cada entrada del informe de muestreo DEBE mostrar `id`, nombre EN y ES con su
  indicador `verified`, URL de la fuente, las líneas literales (`lines`), los campos estructurados
  junto a ellas, los residuos de las reglas de §D y los `reviewFlags`, para que el humano los
  compare con la página original.
- **R83.** DONDE se pase `--crosscheck`, `bestiary:sample` DEBE descargar la página equivalente de
  la fuente de contraste y mostrar un índice de similitud, marcando como sospechosas las entradas
  por debajo de 0,9.
- **R84.** CUANDO se genera el informe de muestreo, el sistema DEBE incluir los recuentos de
  entradas por lote y por tipo, de entradas con `needsReview`, de avisos por regla, de overrides
  aplicados, de referencias sin resolver (dotes, habilidades, conjuros) y de nombres ES verificados.
- **R85.** El sistema DEBE generar `monsters/index.json` (índice ligero de búsqueda) a partir de
  los lotes y del glosario, y SI el commiteado difiere del regenerado, ENTONCES la validación DEBE
  fallar.

## H. Acceso desde el resto de la app (`BestiaryDataSource`)

- **R86.** El sistema DEBE definir la interfaz `BestiaryDataSource` con `get(id)`, `list()`,
  `search(query)`, y consulta por id de reglas universales, dotes de monstruo y tipos de criatura,
  sin operaciones de escritura, con la implementación `JsonBestiaryDataSource` y el fake
  `InMemoryBestiaryDataSource`.
- **R87.** CUANDO se consulta un id inexistente, `BestiaryDataSource` DEBE devolver `undefined`
  sin lanzar excepción.
- **R88.** SI un fichero de datos no supera su schema al cargarse, ENTONCES
  `JsonBestiaryDataSource` DEBE lanzar un error que nombre el fichero, el `id` y el campo.
- **R89.** CUANDO se invocan `list` o `search`, `JsonBestiaryDataSource` DEBE usar solo
  `monsters/index.json`, y CUANDO se invoca `get`, DEBE cargar solo el lote del monstruo pedido.
- **R90.** CUANDO se invoca `search`, el sistema DEBE filtrar por texto (subcadena sin distinguir
  mayúsculas ni acentos sobre nombre EN y ES), rango de FP, tipos, subtipos y tamaños, y ordenar
  de forma determinista por nombre o por FP.
- **R91.** CUANDO `BestiaryDataSource` devuelve una entrada, ésta DEBE estar congelada en
  profundidad.
- **R92.** CUANDO se resuelve una entrada localizada, el sistema DEBE exponer `nameEs` y
  `nameEsVerified`, y SI no hay nombre español para el monstruo, ENTONCES DEBE exponer
  `nameEs: null` sin lanzar excepción; la función `displayName` DEBE devolver `nameEs` si existe
  y el nombre inglés en caso contrario.
- **R93.** SI una clave del glosario del Bestiario tiene `verified: true` y `origin` distinto de
  `human`, ENTONCES la validación DEBE fallar (regla R32 de f3 aplicada a ese glosario).
- **R94.** SI un monstruo no tiene clave en el glosario del Bestiario, ENTONCES la validación NO
  DEBE fallar por ello.
- **R95.** El código de `src/data/bestiary` NO DEBE importar de `src/server` ni de `src/web`.

## Trazabilidad con el `acceptance` original

| Criterio de `acceptance` | Cubierto por |
|---|---|
| Dataset del Bestiary 1 en JSON validado por schema | R1-R3, R14-R32, R37 |
| SEPARADO del Core (book distinto, nunca mezclado) | R1, R3-R5, R9-R11, R95 |
| Estadísticas completas de bloque (CA, toque, desprevenido, PG y DG, salvaciones, ataques, habilidades especiales con texto, DG, FP, tamaño, tipo, características) | R14-R32 |
| Texto original del SRD y URL de la fuente | R6-R8, R33 |
| Mismo pipeline reproducible que f3 | R67-R77 |
| Mismas validaciones de integridad que f3 (más coherencia aritmética) | R12, R13, R34-R36, R38-R46, R47-R62, R78, R79 |
| Aviso OGL actualizado con la fuente | R63-R66 |
| Uso por el GM (decisión 2026-10-16): combate, añadir y editar | R23-R24 (ataques parseables), R37 (schema reutilizable), R85-R92 (consumo desde f5b) |

## Verificación (qué test prueba cada requisito)

Tests bajo `tests/data/bestiary/` y `tests/scripts/bestiary/`; fixtures HTML en
`tests/fixtures/bestiary-html/`.

| R | Test |
|---|---|
| R1 | `data/bestiary/categories.test.ts`: las 4 categorías, rutas y schemas |
| R2-R4 | `data/bestiary/schema/base.test.ts`: entrada válida; falta de campo; `book: "CRB"` y `book: "X9"` rechazados |
| R5 | `data/bestiary/core-isolation.test.ts`: schema de dote del Core rechaza `book: "B1"` |
| R6-R8 | `data/bestiary/schema/base.test.ts`: prefijo de `sourceRef`, host, HTML en `textEn` |
| R9, R10 | `data/bestiary/core-isolation.test.ts`: `CATEGORIES` sin categorías del Bestiario; `runIntegrity` Core igual con/sin dataset; escaneo estático de imports |
| R11 | `data/bestiary/layering.test.ts`: escaneo estático de `src/web` |
| R12, R13 | `data/bestiary/integrity/ids.test.ts`: página única, múltiple, alias, duplicado |
| R14-R32 | `data/bestiary/schema/monster.test.ts`: un caso válido por bloque y un rechazo por campo obligatorio (fixtures sintéticas Goblin, dragón multibloque, constructo sin Con, mindless sin Int) |
| R33 | `data/bestiary/integrity/lines.test.ts` |
| R34, R35, R73 | `scripts/bestiary/parse-lines.test.ts` con HTML sintético (línea desconocida, fragmento no interpretable, encabezado desconocido) |
| R36 | `scripts/bestiary/parse-multiblock.test.ts` (fixture de dragón y de esqueleto) |
| R37 | `data/bestiary/schema/monster-stats.test.ts`: `MonsterSchema` = base + stats; stats solas validan una copia editada |
| R38-R40 | `data/bestiary/integrity/counts.test.ts` y `scripts/bestiary/block-count.test.ts` |
| R41 | `scripts/bestiary/book-filter.test.ts` |
| R42-R46 | `data/bestiary/integrity/references.test.ts` con datasets sintéticos rotos |
| R47-R58 | `data/bestiary/integrity/{cr-xp,armor-class,hit-points,type-progression,combat-maneuvers,saves,initiative,space,attacks}.test.ts`: caso verde y caso roto por regla |
| R59, R60 | `data/bestiary/integrity/review-flags.test.ts` |
| R61 | `data/bestiary/integrity/reference-tables.test.ts` |
| R62 | `data/bestiary/monsters-golden.test.ts` |
| R63-R66 | `data/bestiary/legal.test.ts` (compara con `LICENSE-OGL.md`, `license`, atribuciones) |
| R67, R69, R72 | `scripts/bestiary/fetch-cache.test.ts` y `verify.test.ts` con `fetch` falso y reloj falso |
| R68 | `scripts/bestiary/import-lock.test.ts` |
| R70, R71 | `scripts/bestiary/parse-batch.test.ts`: lista de ficheros escritos, doble ejecución |
| R74 | `data/bestiary/integrity/overrides.test.ts` |
| R75, R76 | `data/bestiary/integrity/batches.test.ts` |
| R77 | `setup` de Vitest (f3 R50) cubre también estos tests |
| R78, R79 | `scripts/bestiary/validate-cli.test.ts` |
| R80-R84 | `scripts/bestiary/sample.test.ts` (semilla, estratos, contenido, `--crosscheck` con `fetch` falso) |
| R85 | `data/bestiary/index-file.test.ts` |
| R86-R92 | `data/bestiary/bestiary-data-source.test.ts` (contrato compartido contra ambas implementaciones; congelado; `displayName`) |
| R93, R94 | `data/bestiary/glossary.test.ts` |
| R95 | `data/bestiary/layering.test.ts` |

## Preguntas abiertas (decide el humano)

Cada una con la recomendación por defecto con la que se ha redactado el spec.

- **Q1. Alcance de libros.** Se asume **solo Pathfinder RPG Bestiary (1ª edición)**. ¿Confirmas, o
  quieres también Bestiarios 2 a 6? **Por defecto:** solo B1. Añadir otro libro será una entrada en
  `books.json` más su `expectedPages` y lotes, sin cambios de schema (salvo criaturas míticas, que
  exigirían campos nuevos).
- **Q2. Plantillas y variantes.** Las plantillas (fantasma, liche, vampiro, celestial, infernal...) y los
  bloques de ejemplo que las acompañan. **Por defecto:** los bloques de ejemplo SE importan como
  monstruos (porque tienen bloque de estadísticas); las reglas de la plantilla quedan solo en
  `descriptionEn`/`textEn` sin estructurar ni aplicación automática. Para crear un "Zombi de ogro",
  el GM edita una copia en f5b.
- **Q3. Categorías de apoyo.** Se importan `monster-feats` (dotes propias del Bestiario, p. ej.
  *Multiattack*), `universal-rules` (reglas universales de monstruos: *grab*, *poison*...) y
  `creature-types` (tipos y subtipos), solo como texto con id, porque los bloques las citan y las
  reglas universales explican las capacidades. **Por defecto:** sí. Alternativa: solo monstruos.
- **Q4. Conjuros y alcance de f3. RESUELTA por la ampliación de f3 (decisión del humano,
  2026-10-16).** `spells` de f3 contiene ahora TODOS los conjuros del Core (capítulo 10),
  incluidos los exclusivos de mago/hechicero que muchos monstruos usan (Q4 de f3). Por tanto
  `spellId` enlaza todo conjuro del Core; `null` queda solo para conjuros que no son del Core
  (p. ej. de otro libro) y se cuenta en el informe (R26, R46). El resto de este spec no cambia.
- **Q5. Política de nombres.** Los monstruos sin traducción española verificada mantienen el nombre
  inglés. **Por defecto:** no se genera traducción automática de nombres; `nameEs` solo existe si
  el humano lo aporta (Devir/Bestiario traducido) en el glosario con `origin: human`. La UI muestra
  `displayName` (ES si existe, si no EN). Los 13 tipos y 9 tamaños se traducen como `term` (borrador,
  sin verificar) en el glosario del Bestiario. ¿Quieres borradores de nombres ES marcados "sin verificar"?
- **Q6. Resúmenes en español.** Los monstruos no llevan `summaryEs`: el bloque es numérico y el GM lo
  lee en inglés. **Por defecto:** no hay capa de resúmenes en este feature. ¿Se desea?
- **Q7. Tipo de daño de ataques naturales.** El bloque no lo indica (*bite*, *claw*). **Por defecto:**
  no se deriva; queda en el texto de las reglas universales y f6/f5b lo decidirán. ¿Lo derivamos de
  la tabla de ataques naturales del Bestiario?
- **Q8. Fuente y etiqueta de libro.** Como Q8 de f3: AoN como primaria; el literal exacto de la línea
  `Source` del Bestiario (p. ej. `Bestiary pg. N`) se fija en `books.json` al ver las fixtures.
  ¿Aceptas AoN?
- **Q9. Aviso legal.** La Section 15 del Bestiario incluye atribuciones de terceros por monstruo (p. ej.
  *Tome of Horrors*) y puede haber contenido marcado como Product Identity. **Por defecto:** se
  reproduce literal y R66 asocia las atribuciones a cada monstruo. **Se recomienda revisión legal humana**
  de qué monstruos del Bestiario son contenido abierto antes de publicar.
- **Q10. Consumo solo en servidor.** Para que los jugadores nunca vean las estadísticas completas, los
  datos NO deben viajar al cliente (R11). **Por defecto:** solo el servidor (rutas de GM de f5b) importa el
  Bestiario; el cliente recibe únicamente lo que f5b exponga.
- **Q11. Política de avisos.** Los avisos de §D no hacen fallar la validación; marcan `needsReview`
  y entran en la muestra. **Por defecto:** el humano revisa los marcados y los reconoce (R60) o
  corrige con override. Alternativa: bloquear hasta cero avisos.
- **Q12. Recuentos.** Los `expectedPages` y `expectedStatBlocks` se congelan en el primer import a
  partir del índice; ¿puedes contrastar el total con el índice del libro impreso? ¿Cada categoría de
  edad de un dragón cuenta como bloque (así se asume) o solo la página?
- **Q13. Errata.** Se usa el texto actual de la fuente tal cual, como Q5 de f3.
- **Q14. Dependencias.** f3b usa tipos y `armorClass()`/`sizeModifier()` de f2. **Recomendación:** añadir
  `f2-rules-engine-core` a `depends_on` de f3b en `feature-list.json` (lo decide el leader).
- **Q15. Cambios aditivos sobre f3.** f3b necesita (a) que f3 exporte sus validadores y libs
  parametrizables, (b) ampliar `LICENSE-OGL.md` y `section15.json`, (c) aclarar que el R27 de f3
  ("ningún dataset") se refiere a las categorías de `CATEGORIES`. **Por defecto:** el Lote 0 de f3b hace
  estos cambios mínimos y aditivos tras terminar f3, con los tests de f3 en verde. El leader puede
  preferir incluirlos en la aprobación de f3.
- **Q16. Paralelismo.** Los lotes de parseo son offline y paralelizables; la descarga se hace una sola vez
  y en serie (R68). **Por defecto:** hasta 4 agentes de lote a la vez.
- **Q17. Tolerancias de coherencia.** El residuo "explicable" usa una lista de causas (dotes
  *Great Fortitude*, *Improved Initiative*, *Weapon Focus*, etc.). ¿Algún criterio adicional?
- **Q18. Características "—".** Se modela como `null` y se trata como modificador +0 para las
  fórmulas de §D, salvo Fue "—" (incorpóreo), donde CMB usa Destreza. Confirmar con el Core/Bestiario.
