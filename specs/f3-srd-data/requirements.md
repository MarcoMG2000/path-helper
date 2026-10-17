# f3-srd-data: Requirements

> Feature: **Datos del Core Rulebook (SRD) estructurados** (`depends_on: f0-project-skeleton`).
> Notación EARS (ver `docs/specs.md`). Cada `R<n>` es estable y verificable por un test
> concreto (columna "Verificación" en la tabla final de trazabilidad).
> Las decisiones de diseño (fuente, caché, partición, glosario) están en `design.md`;
> las preguntas abiertas para el humano están al final de este fichero.

## Glosario del spec

- **CRB**: Pathfinder Roleplaying Game Core Rulebook (1ª edición). Único libro admitido.
- **Entrada**: un registro de reglas (clase, dote, conjuro, arma, etc.) en `src/data`.
- **Categoría**: `classes`, `class-features`, `domains`, `races`, `skills`, `feats`,
  `spells`, `spell-lists`, `weapons`, `armor`, `shields`, `gear`, `magic-items`
  (dataset `magicItems`: objetos mágicos del capítulo 15; el id de categoría va en kebab-case
  como `class-features` y `spell-lists`).
- **Objeto mágico / `kind`**: entrada de `magic-items`; su `kind` es una de las secciones del
  capítulo 15 (R64). **Variante**: una fila de precio/efecto de un mismo objeto (p. ej.
  *Cloak of Resistance* +1 a +5). **Efecto**: modificador numérico estructurado de una variante
  (R72), con el mismo catálogo de tipos de bonificador que el resolvedor de f2.
- **Catálogo de clases CRB** (`CRB_CLASS_IDS`): lista cerrada de los 11 ids de clase del CRB
  (`barbarian`, `bard`, `cleric`, `druid`, `fighter`, `monk`, `paladin`, `ranger`, `rogue`,
  `sorcerer`, `wizard`), definida en `scripts/srd/config/spell-class-ids.json` y replicada como
  constante en `src/data/schema/spell.ts`. Existe para validar las claves de `spells[].levels`
  sin exigir que la clase tenga entrada en `classes` (solo 7 de las 11 la tienen, Q9).
- **Clave de nivel**: clave de `spells[].levels`; es un id del catálogo de clases CRB o el id de
  un dominio del CRB (categoría `domains`).
- **Clase con lista**: clase que tiene entrada en `spell-lists` (hoy `bard`, `cleric`, `druid`,
  `paladin`, `ranger`). `sorcerer` y `wizard` NO son clases con lista: sus niveles viven solo en
  `spells[].levels`.
- **Lote de conjuros**: rango contiguo de iniciales de `id` de conjuro definido en
  `scripts/srd/config/spell-batches.json` (R99); unidad de trabajo paralelo del Lote D.
- **Capa SRD**: los datos derivados de la fuente (inglés). **Capa ES**: contenido curado en
  español (resúmenes y nombres), almacenado aparte y unido en carga.
- **Fuente primaria**: Archives of Nethys (`aonprd.com`). **Fuente de contraste**: `d20pfsrd.com`.

## A. Modelo de datos y schemas

- **R1.** El sistema DEBE almacenar los datos del CRB como ficheros JSON bajo `src/data`,
  uno o más ficheros por categoría, según el registro `src/data/categories.ts`.
- **R2.** El sistema DEBE definir un schema zod por categoría, y todo schema de entrada DEBE
  incluir los campos comunes `id`, `name` (inglés del SRD), `textEn`, `source`, `sourceRef`
  y `book`.
- **R3.** SI una entrada tiene `book` distinto de `"CRB"`, ENTONCES el schema DEBE
  rechazarla.
- **R4.** El sistema DEBE derivar `id` como el slug en kebab-case del `name` inglés (minúsculas,
  sin apóstrofes, no alfanuméricos a guion) y SI el `id` de una entrada no coincide con ese
  slug (salvo alias declarado en `scripts/srd/config/slug-aliases.json`), ENTONCES la
  validación DEBE fallar.
- **R5.** SI dos entradas de una misma categoría comparten `id`, ENTONCES la validación DEBE
  fallar indicando ambos orígenes.
- **R6.** El campo `source` DEBE ser una URL `https` cuyo host pertenezca a la lista
  `aonprd.com`, `www.aonprd.com`, `d20pfsrd.com`, `www.d20pfsrd.com`; SI no, ENTONCES el
  schema DEBE rechazarla.
- **R7.** El campo `sourceRef` DEBE conservar la etiqueta literal de fuente de la página
  (p. ej. `PRPG Core Rulebook pg. 131`) y SI no empieza por `PRPG Core Rulebook`,
  ENTONCES la validación DEBE fallar.
- **R8.** El campo `textEn` DEBE contener el texto completo del SRD en inglés como Markdown
  restringido (párrafos, negritas, listas, tablas simples) y SI contiene etiquetas HTML o está
  vacío, ENTONCES el schema DEBE rechazarlo.

## B. Cobertura de contenido (primera entrega)

- **R9.** El dataset `classes` DEBE contener exactamente las 7 clases `druid`, `rogue`,
  `ranger`, `barbarian`, `paladin`, `bard` y `cleric`, y ninguna otra.
- **R10.** Cada clase DEBE incluir una tabla de 20 filas con `level`, `bab` (lista de
  ataques iterativos como números), `fort`, `ref`, `will`, `special` (ids de capacidades) y,
  si es lanzadora, `spellsPerDay` indexado de nivel 0 a 9, donde "—" DEBE representarse como
  `null` y `0` como el número 0.
- **R11.** La tabla de cada clase DEBE ser coherente con su progresión declarada: BAB
  completo = `level`, 3/4 = `floor(3·level/4)`, medio = `floor(level/2)`; salvación buena =
  `2 + floor(level/2)`, mala = `floor(level/3)`; SI una fila no coincide, ENTONCES la
  validación DEBE fallar.
- **R12.** Cada clase DEBE declarar `hitDie`, `skillRanksPerLevel`, `classSkills`
  (lista de ids de `skills`), competencias con armas/armaduras/escudos, restricción de
  alineamiento y riqueza inicial, y estos valores DEBEN coincidir con el fichero de valores
  de referencia `tests/data/fixtures/class-golden.json` (derivado del CRB y aprobado por el
  humano).
- **R13.** El dataset `class-features` DEBE contener todas las capacidades de clase de las 7
  clases (incluidas las opciones elegibles: talentos de pícaro, poderes de furia, misericordias,
  actuaciones de bardo, estilos de combate, poderes de dominio), cada una con `classId`,
  `level`, `abilityType` (`Ex`, `Su`, `Sp` o `null`) y `parentId` cuando sea una opción.
- **R14.** SI un nombre de la columna `special` de una tabla de clase no resuelve a una
  capacidad existente en `class-features`, ENTONCES la validación DEBE fallar.
- **R15.** El dataset `races` DEBE contener exactamente las 7 razas del CRB (`dwarf`, `elf`,
  `gnome`, `half-elf`, `half-orc`, `halfling`, `human`) con modificadores de característica
  (incluido el elegible de humano y semielfo), tamaño, velocidad base, idiomas y rasgos
  raciales estándar.
- **R16.** El dataset `skills` DEBE contener exactamente las 35 habilidades del CRB (cada
  `Knowledge` como entrada propia; `Craft`, `Perform` y `Profession` como una entrada cada
  una) con característica clave, `trainedOnly` y `armorCheckPenalty`.
- **R17.** El dataset `feats` DEBE contener todas las dotes cuyo `sourceRef` sea CRB, con
  `types` (General, Combat, Metamagic, Item Creation, Critical) y prerrequisitos
  estructurados (`abilities`, `bab`, `featIds`, `skills`, `casterLevel`, `other`).
- **R18.** SI un `featIds` de un prerrequisito no existe en `feats`, ENTONCES la
  validación DEBE fallar.
- **R19.** SI el grafo de prerrequisitos de dotes contiene un ciclo, ENTONCES la validación
  DEBE fallar.
- **R20.** El dataset `spells` DEBE contener TODOS los conjuros del capítulo 10 del CRB
  (incluidos los que solo tienen `sorcerer` y `wizard`, los de lista de clase y los de dominio),
  cada uno con `school`, `subschool`, `descriptors`, `levels` (un nivel de conjuro por cada clave
  de nivel que lo tenga en su lista, según R91), `castingTime`, `components`, `range`,
  `targeting` (objetivo, área o efecto), `duration`, `savingThrow`, `spellResistance` y
  `shortDescriptionEn`, con el esquema de `design.md` §4.4. *(Reescrito el 2026-10-16: antes solo
  incluía las listas de 5 clases y dominios; ver Q4 y Q12.)*
- **R21.** El dataset `spell-lists` DEBE listar, por cada clase con lista (hoy las 5 clases
  lanzadoras de `classes`: `bard`, `cleric`, `druid`, `paladin`, `ranger`) y por nivel, los ids de
  conjuros, y SI algún id no existe en `spells`, ENTONCES la validación DEBE fallar. El dataset
  NO DEBE contener listas de `sorcerer` ni `wizard` (Q15).
- **R22.** SI para una clase con lista el conjunto de pares (conjuro, nivel) de `spell-lists` no
  coincide con el que declaran `spells[].levels` para esa clase (un conjuro en una lista sin ese
  nivel de clase en su entrada, o viceversa), ENTONCES la validación DEBE fallar nombrando clase,
  conjunto y nivel. Las claves de nivel de clases sin lista (`sorcerer`, `wizard`) y de dominios
  quedan fuera de esta comprobación (R95).
- **R23.** El dataset `domains` DEBE contener los dominios del CRB con sus poderes concedidos
  y su lista de conjuros de nivel 1 a 9, y SI un conjuro de dominio no existe en `spells`,
  ENTONCES la validación DEBE fallar.
- **R24.** Los datasets `weapons`, `armor` y `shields` DEBEN contener todas las armas,
  armaduras y escudos del CRB con coste en piezas de cobre (`costCp`), `weightLb` y los
  campos estructurados de cada tipo: arma (`category`, `handedness`, `damage` pequeño y
  mediano, `critical.range`, `critical.multiplier`, `rangeIncrementFt`, `damageTypes`,
  `special`), armadura y escudo (`armorBonus` o `shieldBonus`, `maxDex`, `armorCheckPenalty`,
  `arcaneSpellFailure`, velocidades).
- **R25.** El dataset `gear` DEBE contener los objetos mundanos de Bienes y Servicios del CRB
  (equipo de aventurero, sustancias especiales, herramientas, ropa, comida y alojamiento,
  monturas y arreos) con `category`, `costCp` y `weightLb`; los objetos mágicos NO se
  almacenan en `gear`: viven en `magic-items` (sección H, R63-R90).
- **R26.** CUANDO se valida cada categoría presente, el número de entradas DEBE ser igual al
  `expectedCount` congelado en `src/data/provenance/<categoría>.json`, y SI difiere,
  ENTONCES la validación DEBE fallar.
- **R27.** El sistema NO DEBE contener entradas de ningún libro distinto del CRB (ni
  Bestiario, APG, Ultimate *, etc.) en ningún dataset.

## C. Capa en español y glosario

- **R28.** El sistema DEBE almacenar los resúmenes en español en `src/data/summaries/<categoría>/`
  separados de la capa SRD, con `summaryEs` (1 a 300 caracteres) y `status`
  (`draft` o `reviewed`) por id de entrada.
- **R29.** SI una entrada no tiene resumen español, ENTONCES la validación DEBE fallar.
- **R30.** SI `summaryEs` contiene un número, dado de daño o modificador (`1d6`, `+2`, `10`) que
  no aparece en el `textEn` de la misma entrada, ENTONCES la validación DEBE fallar.
- **R31.** El sistema DEBE almacenar el glosario en `src/data/glossary.es.json` con, por
  clave, `es`, `verified` (booleano), `origin` (`human` o `draft`) y `kind`
  (`entry` o `term`), y el fichero DEBE generarse a partir de los shards
  `src/data/glossary/<categoría>.es.json`.
- **R32.** SI una clave del glosario tiene `verified: true` y `origin` distinto de `human`,
  ENTONCES la validación DEBE fallar.
- **R33.** SI una entrada del CRB no tiene clave de glosario, o una clave de tipo `entry` no
  corresponde a ninguna entrada, ENTONCES la validación DEBE fallar.
- **R34.** El sistema DEBE incluir en el glosario como `term` los términos de reglas
  transversales listados en `design.md` §7 (p. ej. `smite-evil`, `power-attack`).
- **R35.** CUANDO se resuelve una entrada localizada, el sistema DEBE exponer `nameEs`,
  `nameEsVerified` y `summaryEs`, y SI no hay glosario para la entrada, ENTONCES DEBE exponer
  `nameEs: null` sin lanzar excepción.
- **R36.** CUANDO se ejecuta la generación del glosario, el sistema DEBE producir un
  `glossary.es.json` idéntico byte a byte si los shards no cambian, y la validación DEBE fallar
  si el fichero commiteado difiere del generado.

## D. Aviso legal OGL

- **R37.** El sistema DEBE incluir en la raíz del repo `LICENSE-OGL.md` con el texto íntegro
  de la Open Game License v1.0a y su Section 15 con los avisos de copyright del
  Pathfinder Roleplaying Game Core Rulebook y del Pathfinder Roleplaying Game Reference
  Document.
- **R38.** El módulo `src/data` DEBE exportar `getLegalNotice()` que devuelve el texto de la
  OGL y las entradas de Section 15, y su contenido DEBE ser idéntico al de `LICENSE-OGL.md`.
- **R39.** El sistema DEBE etiquetar con `license: "OGL-1.0a"` cada fichero
  `src/data/provenance/<categoría>.json`.
- **R40.** DONDE la aplicación web esté presente, ésta DEBE ofrecer una pantalla de aviso legal
  que muestre el resultado de `getLegalNotice()`; la responsabilidad de montarla se acuerda en
  la pregunta abierta Q6.

## E. Adquisición reproducible de datos

- **R41.** El sistema DEBE proporcionar `npm run data:import` que descargue las páginas fuente
  de la lista de semillas `scripts/srd/config/seeds.json`, con identificador `User-Agent`,
  tasa máxima de 1 petición por segundo y reintentos acotados.
- **R42.** CUANDO se descarga una página, el sistema DEBE guardarla en la caché local
  `.cache/srd-raw/` (fuera de git) y registrar en `src/data/provenance/<categoría>.json` su
  URL, `sha256`, bytes y fecha de descarga.
- **R43.** CUANDO se ejecuta `npm run data:parse`, el sistema DEBE generar los ficheros
  `src/data` únicamente desde la caché local, sin acceso a red.
- **R44.** CUANDO se ejecuta `data:parse` dos veces con la misma caché, el sistema DEBE
  producir ficheros idénticos byte a byte.
- **R45.** SI el parser encuentra un encabezado de sección que no pertenece a la lista
  permitida de la categoría, ENTONCES `data:parse` DEBE fallar nombrando la página y el
  encabezado, sin incluir ese contenido.
- **R46.** SI una página fuente declara un libro distinto del CRB, ENTONCES `data:parse` DEBE
  excluirla de los datos y listarla en el informe de importación `reports/import-<fecha>.md`.
- **R47.** SI el `sha256` de una página cacheada no coincide con el registrado en la
  procedencia, ENTONCES `data:parse` DEBE fallar salvo que se pase `--accept-drift`.
- **R48.** CUANDO se ejecuta `npm run data:import -- --verify`, el sistema DEBE volver a
  descargar las páginas y listar las que difieren de su `sha256` registrado, sin modificar
  `src/data`.
- **R49.** El sistema DEBE aplicar las correcciones manuales de `src/data/overrides/<categoría>.json`
  tras el parseo y SI una corrección carece de `reason` o `evidence`, o su valor ya coincide con
  el parseado, ENTONCES la validación DEBE fallar.
- **R50.** Los tests unitarios NO DEBEN realizar peticiones de red.

## F. Validación e informe de muestreo

- **R51.** El sistema DEBE proporcionar `npm run data:validate` que ejecute todas las reglas
  de integridad (R3 a R8, R11, R14, R18, R19, R21, R22, R23, R26, R27, R29, R30, R32, R33, R36,
  R49, R66, R67, R68, R69, R70, R73 a R77, R82 a R85, R91, R92, R96, R98, R99, R101) y devuelva código de salida distinto de
  cero si hay algún error.
- **R52.** CUANDO la validación encuentra errores, el sistema DEBE informar de todos ellos
  agrupados por categoría, regla y `id`, y no detenerse en el primero.
- **R53.** CUANDO se ejecuta `npm run data:sample -- --seed <n> --per-category <k>`, el sistema
  DEBE generar `reports/srd-sample-<seed>.md` con una muestra estratificada: todas las
  entradas de `classes`, todas las que tengan `override` o `needsReview`, y `k` entradas
  aleatorias por cada otra categoría.
- **R54.** CUANDO se repite `data:sample` con la misma semilla y los mismos datos, el sistema
  DEBE generar un informe idéntico.
- **R55.** Cada entrada del informe de muestreo DEBE mostrar `id`, nombre EN y ES con su
  indicador `verified`, URL de la fuente, los campos estructurados, el resumen español y el
  `textEn`, para que el humano los compare con la página original.
- **R56.** DONDE se pase `--crosscheck`, `data:sample` DEBE descargar la página equivalente
  de la fuente de contraste y mostrar un índice de similitud de texto normalizado, marcando
  como sospechosas las entradas por debajo de 0,9.
- **R57.** CUANDO se genera el informe de muestreo, el sistema DEBE incluir el recuento de
  entradas por categoría, de entradas con `summaryEs.status = draft`, de claves de glosario con
  `verified: false` y de overrides aplicados.

## G. Acceso a los datos desde el resto de la app

- **R58.** El sistema DEBE definir la interfaz `RulesDataSource` con consulta por id y
  listado por categoría que devuelva entradas localizadas (SRD + capa ES), con la
  implementación `JsonRulesDataSource` y el fake `InMemoryRulesDataSource`.
- **R59.** CUANDO se consulta un id inexistente, `RulesDataSource` DEBE devolver `undefined`
  sin lanzar excepción.
- **R60.** SI un fichero de datos no supera su schema al cargarse, ENTONCES
  `JsonRulesDataSource` DEBE lanzar un error que nombre el fichero, el `id` y el campo.
- **R61.** CUANDO se pide una categoría, `JsonRulesDataSource` DEBE cargar solo los ficheros de
  esa categoría (carga perezosa) y no los demás.
- **R62.** El código de `src/data` NO DEBE importar de `src/server` ni de `src/web`, y el motor
  de `src/rules` NO DEBE leer ficheros: recibe los datos por parámetro.

## H. Objetos mágicos (capítulo 15 del CRB)

> Decisión del humano (2026-10-16), que resuelve Q3: los jugadores están a nivel 5-6 y ya
> poseen objetos mágicos, así que los objetos mágicos del Core entran en la **primera
> entrega** (armas y armaduras mágicas con sus habilidades especiales, escudos, anillos,
> varitas, varas, bastones, pociones, pergaminos, objetos maravillosos, etc.). Todos son del
> CRB: R3 y R27 siguen vigentes. Los efectos numéricos (R72-R80) usan los tipos de bonificador
> de f2 para que f4/f6 los pasen al resolvedor como `Modifier`. Las reglas R1-R62 aplican a
> `magic-items` como a cualquier otra categoría; aquí solo se añade lo específico.

- **R63.** El sistema DEBE registrar en `src/data/categories.ts` la categoría `magic-items`
  (dataset `magicItems`) con su schema zod y sus ficheros en `src/data/magic-items/<kind>.json`,
  uno por valor de `kind`.
- **R64.** Toda entrada de `magic-items` DEBE incluir, además de los campos comunes de R2,
  `kind` (uno de `armor-ability`, `shield-ability`, `weapon-ability`, `specific-armor`,
  `specific-shield`, `specific-weapon`, `potion`, `oil`, `ring`, `rod`, `staff`, `wand`,
  `wondrous`, `cursed`, `intelligent`, `artifact`, `general`), `slot` (literal de la fuente),
  `aura`, `weightLb` (número o `null`), `construction` (requisitos y coste de fabricación) y
  `variants` (lista con al menos una variante con `variantId`, `label`, `casterLevel` entero o
  `null`, `priceRaw`, `priceCp`, `effects` y `extraDamage`).
- **R65.** El campo `textEn` de cada entrada de `magic-items` DEBE contener sin omisión la
  descripción, los requisitos y el coste de construcción de la página fuente y las filas de sus
  tablas de variantes.
- **R66.** El sistema DEBE cubrir todas las secciones del capítulo 15 declaradas en
  `scripts/srd/config/magic-sections.json` (una por `kind`, incluidas las secciones de reglas
  generales como pergaminos y creación de objetos), y SI una sección declarada no tiene
  entradas importadas y no figura con `expectedCount: 0` y un `reason`, ENTONCES la validación
  DEBE fallar.
- **R67.** SI el número de entradas importadas de un `kind` difiere de `expectedCountByKind[kind]`
  congelado en `src/data/provenance/magic-items.json`, ENTONCES la validación DEBE fallar.
- **R68.** El sistema DEBE conservar el precio literal de cada variante en `priceRaw` y
  expresar `priceCp` como entero no negativo de piezas de cobre, o `null` cuando la fuente no
  da un precio fijo, y SI `priceCp` no cumple eso, ENTONCES el schema DEBE rechazarlo.
- **R69.** DONDE el precio de una habilidad especial de arma, armadura o escudo se exprese
  como equivalente de bonificador (p. ej. `+1 bonus`), la variante DEBE declarar
  `bonusEquivalent` (entero de 1 a 5) con `priceCp: null`, y SI declara a la vez
  `bonusEquivalent` y un `priceCp` no nulo, ENTONCES el schema DEBE rechazarla.
- **R70.** Cada entrada `specific-weapon`, `specific-armor` y `specific-shield` DEBE declarar
  `baseItemId` (id existente en `weapons`, `armor` o `shields`, o `null` junto con
  `baseItemRaw` literal), `enhancement` (`on` y `bonus` de 1 a 5), `abilityIds` (ids de
  habilidades especiales) y `baseEvidence` (fragmento literal de su `textEn` del que se
  derivaron), y SI `baseEvidence` no es subcadena de `textEn`, ENTONCES la validación DEBE
  fallar.
- **R71.** Las entradas `general` de armaduras, escudos y armas mágicas DEBEN exponer
  `enhancementPrices` (lista de `bonus` 1 a 5 con `priceCp` entero) tomada de la tabla de precios
  de la sección.
- **R72.** Cada efecto de una variante DEBE declarar `target`, `bonusType`, `value` (entero
  distinto de 0; negativo = penalizador), `appliesTo` (`wearer` o `item`), `conditional`
  (booleano) y `evidence`, y puede declarar `conditionText` y `foldInto`.
- **R73.** El campo `bonusType` DEBE pertenecer exactamente al catálogo de 19 tipos de
  bonificador de f2 (`BONUS_TYPES`: `alchemical`, `armor`, `circumstance`, `competence`,
  `deflection`, `dodge`, `enhancement`, `inherent`, `insight`, `luck`, `morale`, `naturalArmor`,
  `profane`, `racial`, `resistance`, `sacred`, `shield`, `size`, `untyped`), y SI un efecto usa
  otro valor, ENTONCES el schema DEBE rechazarlo.
- **R74.** El campo `target` DEBE ser uno de `attack`, `damage`, `ac`, `initiative`,
  `save.fortitude`, `save.reflex`, `save.will`, `save.all`, `ability.str`, `ability.dex`,
  `ability.con`, `ability.int`, `ability.wis`, `ability.cha` o `skill.<id>` con `<id>` de la
  categoría `skills`, y SI no, ENTONCES el schema DEBE rechazarlo.
- **R75.** SI el `evidence` de un efecto o de un `extraDamage` no es subcadena literal del
  `textEn` de su entrada, o no contiene el valor absoluto del efecto (o los dados), ENTONCES la
  validación DEBE fallar.
- **R76.** SI un efecto tiene `conditional: true` sin `conditionText` no vacío, o
  `conditional: false` con `conditionText`, ENTONCES el schema DEBE rechazarlo.
- **R77.** DONDE un efecto tenga `foldInto`, éste DEBE ser `armor`, `shield` o `naturalArmor` y
  su `target` DEBE ser `ac`, y SI no, ENTONCES el schema DEBE rechazarlo.
- **R78.** DONDE el texto de una variante de arma declare daño adicional por dados (p. ej.
  `+1d6 fire damage`), la variante DEBE declarar en `extraDamage` el `dice`, el `damageType` y
  un `trigger` (`always`, `onCritical` o `conditional`) con su `evidence`.
- **R79.** CUANDO se llama a `getItemEffects(entry, variantId)`, el sistema DEBE devolver los
  efectos de esa variante con la forma `{ id, name, value, type, target, appliesTo,
  conditional, conditionText?, foldInto? }` (compatible con `Modifier` de f2: `id` estable y
  único `magic:<entryId>:<variantId>:<n>`, `name` = nombre SRD, `type` = `bonusType`),
  expandiendo `save.all` en tres efectos, y SI la variante no existe, ENTONCES DEBE devolver
  `undefined` sin lanzar excepción.
- **R80.** CUANDO se llama a `getEnhancementEffects(on, bonus)`, el sistema DEBE devolver para
  `weapon` dos efectos `enhancement` (`attack` y `damage`, `appliesTo: "item"`), para `armor` un
  efecto `enhancement` con `target: "ac"` y `foldInto: "armor"` y para `shield` uno con
  `foldInto: "shield"`.
- **R81.** Cada entrada `weapon-ability`, `armor-ability` y `shield-ability` DEBE declarar
  `legalFor` con la restricción de uso estructurada (arma: `range` `melee|ranged|any`,
  `damageTypes`, `weaponIds`; armadura y escudo: `categories`) y la frase literal en `raw`, y SI
  el texto contiene una restricción que el parser no sabe estructurar, ENTONCES la entrada DEBE
  marcarse `needsReview`.
- **R82.** SI una habilidad especial listada en `abilityIds` de un objeto específico no es legal
  para su objeto base según `legalFor` (alcance, tipo de daño, categoría de armadura), ENTONCES
  la validación DEBE fallar nombrando ambos ids.
- **R83.** SI el `enhancement.bonus` de un objeto excede el máximo de mejora del CRB, o la suma
  de mejora y `bonusEquivalent` de sus habilidades excede el máximo de bonificador efectivo del
  CRB, ENTONCES la validación DEBE fallar (valores a confirmar en el texto del capítulo 15,
  ver `design.md` §14.5).
- **R84.** SI un `baseItemId` no existe en su categoría, un id de `abilityIds` no existe en
  `magic-items` con el `kind` de habilidad correspondiente, o un `target` `skill.<id>` no existe
  en `skills`, ENTONCES la validación DEBE fallar.
- **R85.** DONDE un objeto tenga `spellRefs` (pociones, aceites, varitas, bastones),
  cada elemento DEBE incluir el nombre literal del conjuro y `spellId` (id existente en `spells`, o
  `null` solo si el conjuro no pertenece al CRB), y SI `spellId` no es `null` y no existe en
  `spells`, o es `null` y el slug del nombre literal coincide con un `id` de `spells`, ENTONCES la
  validación DEBE fallar. *(Reescrito el 2026-10-16: con R20 ampliado, los conjuros de
  mago/hechicero del Core ya no quedan fuera de alcance; resuelve Q12.)*
- **R86.** SI una página fuente de un objeto mágico declara varias etiquetas `Source` y una de
  ellas es `PRPG Core Rulebook`, ENTONCES `data:parse` DEBE incluirla con `sourceRef` igual a esa
  etiqueta, `sourceRefAll` con la línea literal completa y `reprintedIn` con las demás etiquetas,
  sin marcarla `needsReview` solo por ello.
- **R87.** SI una página fuente de un objeto mágico no declara ninguna etiqueta
  `PRPG Core Rulebook`, ENTONCES `data:parse` DEBE excluirla de los datos y listarla en el
  informe de importación (extiende R46).
- **R88.** CUANDO se ejecuta `data:parse` sobre `magic-items`, el informe de importación DEBE
  listar las entradas cuyo `textEn` contiene un bonificador tipado numérico (p. ej.
  `+2 competence bonus`) y que no tienen ningún efecto estructurado, para revisión humana.
- **R89.** CUANDO se genera el informe de muestreo (R53), el sistema DEBE incluir al menos una
  entrada de cada `kind` de `magic-items` además de las `k` aleatorias.
- **R90.** CUANDO se genera el informe de muestreo, el sistema DEBE incluir el recuento de
  entradas de `magic-items` por `kind`, las que tienen `reprintedIn` no vacío y las listadas
  por R88.

## I. Ampliación de `spells` a todo el capítulo 10 del CRB

> Decisión del humano (2026-10-16), que resuelve Q4 y Q12 y acota Q9: el dataset `spells`
> contiene TODOS los conjuros del CRB, no solo los de las listas de las clases de la campaña.
> Motivo: los monstruos del bestiario (f3b) y los PNJ los usan y el compendio (f8) los mostrará.
> NO cambia: las clases con datos completos siguen siendo las 7 de la campaña (Q9); `spell-lists`
> sigue limitado a las 5 clases lanzadoras presentes (R21). Sí cambia que `levels` registra los
> niveles de TODAS las clases del CRB que tengan el conjuro en su lista, incluidas `sorcerer` y
> `wizard` aunque no exista su entrada de clase (R91-R95, R97). Los lotes de trabajo paralelo
> se definen en R99 y en `tasks.md` (Lote D).

- **R91.** El schema de `spells` DEBE exigir que cada clave de `levels` sea un id en kebab-case y
  cada valor un entero de 0 a 9, y SI no, ENTONCES el schema DEBE rechazar la entrada.
- **R92.** SI una clave de `spells[].levels` no pertenece al catálogo `CRB_CLASS_IDS` ni es el id
  de una entrada de `domains`, ENTONCES la validación DEBE fallar nombrando el conjuro y la clave
  (así se detectan clases de otros libros, como `alchemist` o `witch`, y errores de tipografía).
- **R93.** CUANDO `data:import` descubre los conjuros, el sistema DEBE tomar como universo todas
  las páginas de conjuro del índice de la fuente cuya etiqueta de libro sea el CRB, sin filtrar
  por pertenencia a ninguna lista de clase ni de dominio.
- **R94.** CUANDO la línea `Level` de un conjuro contiene la forma abreviada `sor/wiz` o
  `sorcerer/wizard` seguida de un nivel, `data:parse` DEBE producir las claves `sorcerer` y
  `wizard` en `levels`, ambas con ese nivel.
- **R95.** MIENTRAS una clase del catálogo `CRB_CLASS_IDS` no tenga entrada en `spell-lists`,
  la validación NO DEBE exigir su lista y DEBE aceptar sus niveles en `spells[].levels`.
- **R96.** SI un campo estructurado de `spells` (`castingTime`, `range`, `targeting`, `duration`,
  `savingThrow`, `spellResistance`, `components`) no coincide con el resultado de la función pura
  `classifySpellFields` aplicada a su texto `raw`, ENTONCES la validación DEBE fallar nombrando
  conjuro y campo. El texto `raw` siempre se conserva literal; lo que la función no sabe
  clasificar se guarda como `kind: "other"` y se cuenta en el informe de importación.
- **R97.** CUANDO la línea `Level` de un conjuro contiene el id de una clase de otro libro
  (lista cerrada `nonCrbClassIds` en `scripts/srd/config/spell-class-ids.json`), `data:parse`
  DEBE descartar esa clave y contarla en el informe de importación; SI contiene un token que no
  está en el catálogo CRB, en la lista `nonCrbClassIds` ni es un dominio del CRB, ENTONCES
  `data:parse` DEBE fallar nombrando la página y el token (extiende R45).
- **R98.** DONDE una categoría se importe por lotes (hoy `spells`), la procedencia y los
  overrides PUEDEN repartirse en `src/data/provenance/<categoría>/<lote>.json` y
  `src/data/overrides/<categoría>/<lote>.json`, y la validación DEBE tratar la unión de esos
  ficheros como el fichero de la categoría (R26, R39, R42, R49) y fallar si algún fichero de lote
  no declara `license: "OGL-1.0a"`.
- **R99.** El sistema DEBE definir en `scripts/srd/config/spell-batches.json` los lotes de
  conjuros como rangos contiguos de la inicial del `id` que cubren `a` a `z` sin solaparse, y SI
  un conjuro cae en ningún lote o en más de uno, o la suma de `expectedCountByBatch` difiere del
  `expectedCount` total de `spells`, ENTONCES la validación DEBE fallar.
- **R100.** El sistema DEBE exportar la función pura `spellsForClass(spells, classKey, level?)`
  que devuelva los ids de conjuros cuyo `levels[classKey]` existe (o es igual a `level`),
  ordenados por nivel y por `id`, válida para cualquier clave de nivel; PARA las clases con lista
  su resultado DEBE coincidir con `spell-lists`.
- **R101.** El schema de `spells` DEBE restringir `school` a `abjuration`, `conjuration`,
  `divination`, `enchantment`, `evocation`, `illusion`, `necromancy`, `transmutation` o
  `universal`, y SI recibe otro valor, ENTONCES DEBE rechazar la entrada.
- **R102.** SI tras filtrar las claves de otros libros (R97) un conjuro queda con `levels` vacío,
  ENTONCES `data:parse` DEBE marcarlo `needsReview` y listarlo en el informe de importación.
- **R103.** CUANDO se genera el informe de muestreo (R53), el sistema DEBE incluir al menos un
  conjuro de cada escuela y al menos un conjuro que solo tenga claves `sorcerer` y `wizard` (si
  existe), además de los recuentos de `spells` por clave de nivel de clase y por escuela y de los
  conjuros con campos estructurados `kind: "other"` (R96).

## Trazabilidad con el `acceptance` original

| Criterio de `acceptance` | Cubierto por |
|---|---|
| JSON validados por schema (zod), sin expansiones | R1-R8, R27, R51 |
| 7 clases con tablas de progresión y habilidades de clase | R9-R14 |
| razas, habilidades | R15, R16 |
| dotes | R17-R19 |
| conjuros (todos los del capítulo 10 del CRB, con niveles de todas las clases del CRB; ampliación del 2026-10-16) | R20-R23, R91-R103 |
| equipo (armas, armaduras, objetos) | R24, R25 |
| objetos mágicos del Core (cap. 15: armas y armaduras mágicas con sus habilidades, escudos, anillos, varitas, pociones, objetos maravillosos...) | R63-R71 (cobertura, schema, precios, mejora) |
| objetos mágicos: efectos numéricos para el cálculo (mejora a ataque/daño/CA, bonos tipados a salvaciones/habilidades/características) | R72-R80 (compatibles con el resolvedor de f2) |
| objetos mágicos: integridad y fuente | R81-R88 |
| Cada entrada: resumen ES, texto EN completo, URL fuente | R2, R6-R8, R28-R30, R35, R65, R86 |
| Aviso OGL incluido | R37-R40 |
| Script de validación (referencias, campos obligatorios, nada fuera del Core) | R3, R14, R18-R23, R26, R27, R51, R52, R66, R67, R70, R75, R82-R85, R87, R91, R92, R96-R99, R101 |
| (revisión humana de los datos importados) | R53-R57, R89, R90, R103 |

## Verificación (qué test prueba cada requisito)

| R | Test (fichero en `tests/`) |
|---|---|
| R1 | `data/categories.test.ts`: cada categoría registrada tiene su schema y rutas |
| R2, R3 | `data/schema/common.test.ts`: entrada válida pasa; falta de campo y `book: "BEST"` fallan |
| R4, R5 | `data/integrity/ids.test.ts`: slug incorrecto y duplicado detectados |
| R6, R7, R8 | `data/schema/common.test.ts`: host fuera de lista, `sourceRef` ajeno, HTML en `textEn` |
| R9-R14 | `data/classes.test.ts` (+ `class-golden.json`) y `data/integrity/class-tables.test.ts` con tablas sintéticas rotas |
| R15, R16 | `data/races.test.ts`, `data/skills.test.ts` (recuento y ids exactos) |
| R17-R19 | `data/feats.test.ts` y `data/integrity/feat-prereqs.test.ts` (ciclo y referencia rota sintéticos; golden Power Attack, Cleave, Great Cleave) |
| R20-R23 | `data/spells.test.ts` y `data/integrity/spell-lists.test.ts` (inconsistencia sintética en ambos sentidos; goldens Cure Light Wounds (clases con lista), *Magic Missile* y *Burning Hands* (solo `sorcerer`/`wizard` en `levels`, más aparición en un dominio), un conjuro de nivel 9) |
| R91, R101 | `data/schema/spell.test.ts`: clave no kebab-case, nivel 10 o -1 y `school` desconocida rechazados; entrada válida pasa |
| R92 | `data/integrity/spell-lists.test.ts`: clave `alchemist` y clave de dominio inexistente fallan; `sorcerer` y un dominio existente pasan |
| R93, R94, R97, R102 | `scripts/srd/parse-spells.test.ts` con fixtures de índice y de página: conjuro solo `sor/wiz` incluido, `sor/wiz` expandido, clase de otro libro descartada y contada, token desconocido falla, `levels` vacío marcado |
| R95 | `data/integrity/spell-lists.test.ts`: conjuro con `sorcerer: 3` y sin lista de `sorcerer` pasa |
| R96 | `data/spells/fields.test.ts` (tabla de casos de `classifySpellFields`) y `data/integrity/spell-lists.test.ts` (campo estructurado alterado falla) |
| R98 | `data/integrity/provenance-shards.test.ts`: unión de ficheros de lote, `license` ausente y recuento total |
| R99 | `data/integrity/counts.test.ts` y `scripts/srd/spell-batches.test.ts`: rangos solapados, hueco y suma distinta (sintéticos); la configuración real cubre `a`-`z` |
| R100 | `data/spells/query.test.ts` (clase con lista coincide con `spell-lists`; `sorcerer`, `wizard` y un dominio funcionan; orden estable) |
| R103 | `scripts/srd/sample.test.ts` (estrato por escuela, estrato solo `sorcerer`/`wizard`, contadores) |
| R24, R25 | `data/equipment.test.ts` (golden Longsword, Dagger, Full Plate, Heavy Steel Shield) |
| R26, R27 | `data/integrity/counts.test.ts` y `data/integrity/book-filter.test.ts` |
| R28-R30 | `data/integrity/summaries.test.ts` |
| R31-R36 | `data/glossary.test.ts` y `scripts/srd/glossary-build.test.ts` |
| R37-R39 | `data/legal.test.ts` (compara con `LICENSE-OGL.md`, comprueba Section 15 y `license`) |
| R40 | Test en la feature que monte la pantalla (ver Q6); `data/legal.test.ts` cubre el contrato |
| R41, R42 | `scripts/srd/fetch-cache.test.ts` con `fetch` falso y reloj falso |
| R43-R47 | `scripts/srd/parse.test.ts` con fixtures HTML en `tests/fixtures/srd-html/` |
| R48 | `scripts/srd/verify.test.ts` con `fetch` falso |
| R49 | `data/integrity/overrides.test.ts` |
| R50 | `setup` de Vitest sustituye `globalThis.fetch` por un stub que lanza; la suite pasa |
| R51, R52 | `scripts/srd/validate-cli.test.ts` (código de salida, informe agregado) |
| R53-R57 | `scripts/srd/sample.test.ts` (semilla, estratificación, contenido, `--crosscheck` con `fetch` falso) |
| R58-R61 | `data/rules-data-source.test.ts` (contrato compartido ejecutado contra ambas implementaciones) |
| R62 | `data/layering.test.ts` (escaneo estático de imports) |
| R63, R64 | `data/categories.test.ts` y `data/schema/magic-item.test.ts`: entrada válida de cada `kind` pasa; `kind` desconocido o sin `variants` falla |
| R65 | `scripts/srd/parse-magic-items.test.ts`: la fixture *Keen* conserva en `textEn` descripción, requisitos y coste de construcción; la de *Cloak of Resistance* las filas de variantes |
| R66, R67 | `data/integrity/magic-refs.test.ts`: sección sin entradas, con `expectedCount: 0` justificado y recuento distinto (datos sintéticos) |
| R68, R69 | `data/schema/magic-item.test.ts`: `priceCp` decimal/negativo, `bonusEquivalent` con `priceCp` a la vez |
| R70, R71 | `data/schema/magic-item.test.ts` y `data/magic-items.test.ts` (golden *Flame Tongue*: base `longsword`, mejora 1, `flaming` y `flaming-burst`; precios de mejora de arma y armadura) |
| R72-R77 | `data/schema/magic-effect.test.ts` (cada rechazo) y `data/integrity/magic-refs.test.ts` (evidencia ajena al texto); `bonusType` contra `tests/data/fixtures/bonus-types.json` y, si existe `src/rules/types.ts`, contra su `BONUS_TYPES` |
| R78 | `data/magic-items.test.ts` (golden *Flaming*: `1d6`, `fire`, `always`) |
| R79, R80 | `data/magic-effects.test.ts`: forma `Modifier`, ids únicos, expansión de `save.all`, variante inexistente, mejora de arma/armadura/escudo; un test acepta los resultados como `Modifier` de f2 cuando `src/rules` existe |
| R81, R82 | `data/schema/magic-item.test.ts` y `data/integrity/magic-refs.test.ts` (*Keen* sobre arco/maza y espada; *Seeking* sobre arma cuerpo a cuerpo; casos sintéticos) |
| R83-R85 | `data/integrity/magic-refs.test.ts` (referencias rotas y topes sintéticos; R85: `spellId` inexistente y `spellId: null` con nombre de conjuro del Core fallan, `null` con nombre de otro libro pasa) |
| R86, R87 | `scripts/srd/parse-magic-items.test.ts` (fixtures con `Source` múltiple y sin etiqueta CRB) |
| R88 | `scripts/srd/parse-magic-items.test.ts` (informe de importación) |
| R89, R90 | `scripts/srd/sample.test.ts` (estrato por `kind`, contadores) |

## Preguntas abiertas (decide el humano)

- **Q1 (obligatoria). Monstruos.** El Bestiario no es Core Rulebook. **Recomendación por
  defecto:** el GM introduce los monstruos a mano (f5 ya modela enemigos como texto libre) y
  este feature NO importa el Bestiario. Alternativa: importar el Bestiario como "expansión"
  (rompe el principio "solo CRB" y R27). Decide el humano.
- **Q2. Glosario ES (Devir).** Los nombres españoles del manual no son verificables desde el SRD
  inglés. Se entregan como borrador (`verified: false`, `origin: draft`) hasta que el humano los
  confirme o corrija. Términos a confirmar primero: Castigar el mal (*Smite Evil*), Ataque
  poderoso (*Power Attack*), Ataque furtivo (*Sneak Attack*), Furia (*Rage*), Enemigo
  predilecto (*Favored Enemy*), Interpretación de bardo (*Bardic Performance*), Inspirar valor
  (*Inspire Courage*), Forma salvaje (*Wild Shape*), Canalizar energía (*Channel Energy*),
  Imposición de manos (*Lay on Hands*), Compañero animal (*Animal Companion*), Desprevenido
  (*Flat-Footed*), CA de toque (*Touch AC*) y Bonificador base de ataque (*Base Attack Bonus*).
  Pregunta añadida: ¿cómo debe mostrar la UI un nombre no verificado (EN primero, ES
  secundario con marca)? Por defecto: EN primero + ES con marca "sin verificar".
- **Q3. Objetos mágicos (cap. 15 del CRB). RESUELTA por el humano (2026-10-16).** Los
  objetos mágicos del Core (armas y armaduras mágicas con sus habilidades especiales, escudos,
  anillos, varitas, varas, bastones, pociones, pergaminos, objetos maravillosos...) entran en la
  primera entrega porque los jugadores están a nivel 5-6 y ya los poseen. Son del CRB, así que
  R27 sigue vigente. Ver sección H (R63-R90) y `design.md` §14. Los **materiales especiales** no
  son del capítulo 15 (están en el capítulo de equipo) y quedan en Q14.
- **Q4. Conjuros de dominio y alcance de `spells`. RESUELTA por el humano (2026-10-16).** El
  dataset `spells` pasa a contener TODOS los conjuros del capítulo 10 del CRB, no solo los de las
  listas de bardo, clérigo, druida, paladín, cazador y dominios. Incluye los conjuros que solo
  tienen mago/hechicero y cualquier otro del CRB. Motivo: los monstruos del bestiario (f3b) y los
  PNJ los usan y el compendio (f8) los mostrará. Los conjuros de dominio (p. ej. *burning
  hands*) quedan incluidos como caso particular. Ver R20, R91-R103 y `design.md` §4.4. El resto
  del alcance no cambia (Q9).
- **Q5. Errata.** Archives of Nethys publica el texto con la errata actual, que puede diferir de
  la impresión. Por defecto se usa el texto de AoN tal cual. ¿O se prefiere la impresión
  original (requiere cotejo manual)?
- **Q6. Aviso OGL en la app.** `src/data` expone `getLegalNotice()` (R38). ¿Qué feature monta
  la pantalla "Aviso legal / OGL"? Propuesta: f0 reserva la ruta `/legal` y f8 (compendio) la
  implementa; f4 añade un enlace en el pie. Además: ¿se revisa legalmente que el texto
  importado no incluya Product Identity de Paizo (p. ej. nombres propios de Golarion en las
  descripciones de clérigo)? Por defecto se conserva el texto verbatim del SRD.
- **Q7. Compañeros animales, monturas y familiares.** Por defecto su tabla de progresión queda
  como texto dentro de la capacidad de clase (druida, cazador, paladín) y no se estructura.
  ¿Se estructura en f7?
- **Q8. Fuente y etiqueta de uso.** AoN no ofrece API pública; se hace descarga cortés
  (1 petición/s, caché, una sola pasada). ¿Aceptas AoN como fuente primaria, o prefieres la
  Paizo Reference Document (`paizo.com/pathfinderRPG/prd`) como primaria?
- **Q9. Otras 4 clases del Core** (guerrero, monje, hechicero, mago): sus **entradas de clase**
  (tabla de 20 niveles, capacidades, `class-features`) quedan fuera. Actualizado el 2026-10-16:
  los **conjuros** de hechicero y mago SÍ están en `spells` (Q4) con sus niveles en
  `levels.sorcerer` y `levels.wizard`; solo falta la entrada de clase, y esas claves se validan
  contra el catálogo `CRB_CLASS_IDS` (R92, R95). ¿Confirmas que las 4 clases siguen fuera?
- **Q10. Recuentos.** Los `expectedCount` de dotes, conjuros, armas, etc. se congelan en el
  primer import a partir del índice de la fuente. ¿Puedes contrastar los totales con los
  índices del libro impreso antes de aprobar la revisión humana (R26)? Para `spells` (ampliado el
  2026-10-16) el total es del orden de varios centenares y se congela por lote (R99); el
  contraste con el capítulo 10 impreso es ahora más importante, porque ya no hay una lista de
  clase que sirva de segunda lectura del universo de conjuros.
- **Q11. Fuente de las pociones, aceites, varitas y pergaminos genéricos del cap. 15.**
  Comprobación del 2026-10-16 contra Archives of Nethys: sus índices de objetos mágicos
  (`MagicPotions.aspx`, `MagicStaves.aspx`, etc.) listan objetos con nombre propio (muchos de
  otros libros), pero no las filas genéricas del CRB (*potion of cure light wounds*, *wand of
  cure light wounds*...) ni hay sección de varitas en su navegación. Si la tarea TM.0
  lo confirma, ¿qué fuente se usa para esas filas? Opciones: (a) `d20pfsrd.com` (ya permitido
  por R6; su etiqueta de libro difiere de `PRPG Core Rulebook`, habría que normalizarla o
  ampliar R7 para ese host), (b) Paizo PRD (hay que añadir el host a R6; ver Q8), (c) no
  importarlas y dejar solo las de nombre propio. Por defecto el implementer NO elige: anota el
  hallazgo en `progress/impl_f3-srd-data_M.md`, completa el resto del lote y espera la decisión.
- **Q12. Conjuros referenciados por objetos mágicos. RESUELTA por la ampliación de Q4
  (2026-10-16).** Los conjuros de mago/hechicero que usan pociones, varitas y bastones (p. ej.
  *magic missile*) ya están en `spells`, así que `spellRefs[].spellId` DEBE enlazarlos; `null`
  queda solo para conjuros que no son del CRB (R85).
- **Q13. Texto de páginas con varias etiquetas `Source`.** Páginas de AoN como *Keen* y
  *Seeking* (comprobado) citan `Ultimate Equipment` y `PRPG Core Rulebook pg. 469` a la vez, y el
  texto mostrado puede ser el de la reimpresión actualizada. Por defecto se usa el texto de AoN
  tal cual con `reprintedIn` (R86), `data:sample --crosscheck` como contraste (R56) y el
  recuento de R90 para el humano. Mismo criterio que Q5. ¿Aceptas, o hay que cotejar contra la
  impresión del CRB?
- **Q14. Materiales especiales** (adamantina, mithril, hierro frío, plata alquímica...). No son
  del capítulo 15 sino del capítulo de equipo, y alteran precio, peso y penalizadores de armas
  y armaduras que los jugadores pueden llevar. Por defecto quedan fuera de esta feature (R25 no
  los menciona). ¿Se añaden como entradas de `gear` (categoría `special-material`) en el
  Lote E?
- **Q15. Listas de hechicero y mago (nueva, 2026-10-16).** Con la ampliación de `spells`, los
  niveles de `sorcerer` y `wizard` viven solo en `spells[].levels` (R20, R95), sin `spell-lists`
  propio (R21), porque su entrada de clase está fuera de alcance (Q9) y una lista duplicada sería
  una segunda fuente de verdad. f7/f8 obtienen la lista con `spellsForClass` (R100). **Por
  defecto:** no se generan `spell-lists` de `sorcerer`/`wizard`. Alternativa: generarlas desde la
  página de lista de la fuente para que R22 las contraste como a las demás clases (más trabajo
  de import, una segunda lectura independiente del universo de conjuros). ¿Cuál prefieres?
