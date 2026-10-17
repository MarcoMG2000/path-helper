# Fixtures de conjuros (f3-srd-data, Lote D0)

Páginas reales de Archives of Nethys (`www.aonprd.com`) descargadas el 2026-10-16 con la
canalización de `scripts/srd/` (1 petición/s, User-Agent identificable) y copiadas sin cambios
desde `.cache/srd-raw/`. Se conservan byte a byte (`.prettierignore`).

| Fichero | URL de origen | Qué cubre |
|---|---|---|
| `cure-light-wounds.html` | `SpellDisplay.aspx?ItemName=Cure Light Wounds` | golden; subescuela; SR con `; see text`; clases de otros libros |
| `cure-light-wounds-mass.html` | `...ItemName=Cure Light Wounds, Mass` | salvación compuesta (`Will half (harmless) or Will half; see text`) |
| `burning-hands.html` | `...ItemName=Burning Hands` | golden; sin clave de dominio en `Level` |
| `magic-missile.html` | `...ItemName=Magic Missile` | golden; solo sorcerer/wizard entre las clases CRB; sección «Mythic» de otro libro con su propio `Source` |
| `wish.html` | `...ItemName=Wish` | golden; nivel 9; componente material con coste |
| `analyze-dweomer.html` | `...ItemName=Analyze Dweomer` | foco (`F`) con coste |
| `bless.html` | `...ItemName=Bless` | foco divino (`DF`) |
| `ant-haul.html` | `...ItemName=Ant Haul` | conjuro de otro libro (Advanced Player's Guide): se excluye |
| `commune.html` | `...ItemName=Commune` | sin `Saving Throw` ni `Spell Resistance`; tiempo en minutos |
| `animate-dead.html` | `...ItemName=Animate Dead` | la página trae otra entrada (`Animate Dead, Lesser`) y una sección Mythic |
| `charm-person.html` | `...ItemName=Charm Person` | `LabelName_0` vacío; el conjuro está en `LabelName_1` |
| `contingency.html` | `...ItemName=Contingency` | `kind: other` en tiempo y duración; `M` y `F` |
| `mages-magnificent-mansion.html` | `...ItemName=Mage's Magnificent Mansion` | apóstrofe en el nombre |
| `blindness-deafness.html` | `...ItemName=Blindness/Deafness` | barra en el nombre |
| `mislead.html` | `...ItemName=Mislead` | etiqueta combinada `Target/Effect` (con barra) |
| `reincarnate.html` | `...ItemName=Reincarnate` | tras una sección de otro libro (`Reincarnation on Golarion`) vienen dos `<h2>` sin `Source` propio (`Core Incarnations`, `Other Incarnations`) |

Fixtures **recortadas** (marcado real de la fuente; se eliminaron filas y el valor de los campos
`__VIEWSTATE`/`__EVENTVALIDATION`, que no se usan):

| Fichero | Origen | Recorte |
|---|---|---|
| `index-crb-source.html` | `SourceDisplay.aspx?FixedSource=PRPG Core Rulebook` | el encabezado `Spells [N]` pasa de 623 a 7 y quedan 7 enlaces (más la cabecera de la página) |
| `index-all.html` | `Spells.aspx?Class=All` | 10 filas de las 3.039 (CRB y de otros libros) |
| `class-list-cleric.html` | `Spells.aspx?Class=Cleric` | los niveles 0, 1 y 2 con unas pocas filas (incluye conjuros de otros libros) |

Hallazgos de estructura (válidos para todas las páginas de conjuro revisadas):

- `Level` solo trae clases (`arcanist 1, bard 1, ... sorcerer 1, wizard 1`), **sin claves de dominio**,
  y escribe `sorcerer` y `wizard` por separado (no aparece la abreviatura `sor/wiz`).
- Los tokens de otros libros llegan en minúsculas, también sin espacios (`redmantisassassin`,
  `sahirafiyun`) o con paréntesis (`summoner (unchained)`).
- Una página puede contener varias entradas (cada una abre con su `<h1>`), y las secciones de otros
  libros (`Mythic ...`) son `<h2>` con su propia línea `Source`.
