# S1 — D1 Schema + Migrations: Tareas

> **Fecha**: 08/08/2026 | **Duración**: 4h | **Entregable**: DB lista con migración 001

---

## Lo que VOS hacés (entender, configurar, verificar)

| # | Tarea | Por qué es tuyo |
|---|---|---|
| 1 | **Leer §7 del doc de arquitectura** (modelo de datos, ER, índices, reglas de integridad) | Necesitás entender QUÉ se modela y POR QUÉ. Sin esto no podés revisar lo que genere la IA |
| 2 | **Crear cuenta en Cloudflare** (si no tenés) y hacer `wrangler login` | Es tu infraestructura, tu cuenta, tus secrets |
| 3 | **Ejecutar `wrangler d1 create tsuzuki-db`** y copiar el `database_id` | La IA no puede crear recursos en tu cuenta |
| 4 | **Reemplazar el `PLACEHOLDER`** en `wrangler.jsonc` con tu `database_id` | Configuración local, tuya |
| 5 | **Crear el archivo `migrations/001_initial.sql`** vos primero — aunque sea un borrador | Es TU esquema. Poné las columnas que creés necesarias, los tipos, los constraints. Después la IA puede refinar |
| 6 | **Aplicar la migración**: `wrangler d1 execute tsuzuki-db --file=migrations/001_initial.sql` | Verificar que tu SQL compila y crea las tablas |
| 7 | **Explorar la DB**: `wrangler d1 execute tsuzuki-db --command "SELECT * FROM media_items"` | Confirmar que las tablas existen, que los tipos están bien |
| 8 | **Leer y entender cada columna** de la tabla — ¿por qué `TEXT` y no `INTEGER` para IDs? ¿por qué `ULID` y no `UUID`? ¿por qué `CHECK` constraints? | Si no entendés esto, no podés debuggear cuando algo falle |
| 9 | **Escribir los tests manualmente** (aunque sea pseudocódigo): ¿qué casos querés testear? ¿qué debería fallar? | Los tests son TU specification. La IA los implementa, pero vos definís QUÉ se testea |
| 10 | **Correr `ng test` y `cd workers && npx vitest run`** y verificar que todo pasa | Si algo falla, VOS diagnosticás qué pasó |

---

## Lo que le delegás a la IA

| # | Tarea | Prompt sugerido |
|---|---|---|
| A | **Generar el SQL de la migración** basado en el modelo del doc de arquitectura | "Generá el SQL para la migración 001_initial.sql con las tablas `media_items` y `progress_history` según el modelo de datos de §7 del doc de arquitectura. Incluí los CHECK constraints y los 5 índices." |
| B | **Implementar el ULID generator** | "Creá un generador de ULID en `workers/api/ulid.ts` que use `crypto.getRandomValues()` sin dependencias externas." |
| C | **Implementar los tests** basado en tus casos de prueba | "Implementá los tests de schema en `workers/api/schema.test.ts` con estos casos: [tus casos]" |
| D | **Refinar la migración** si hay errores | "La migración falló con [error]. ¿Cómo la arreglo?" |

---

## Checklist de verificación (antes de pasar a S2)

- [x] `wrangler d1 create` ejecutado, `database_id` guardado en `wrangler.jsonc`
- [x] `wrangler d1 execute tsuzuki-db --file=migrations/001_initial.sql` sin errores
- [x] `wrangler d1 execute tsuzuki-db --command ".schema"` muestra las 3 tablas (media_items, media_sources, progress_history)
- [x] `wrangler d1 execute tsuzuki-db --command ".indexes"` muestra los 6 índices
- [x] Entendés por qué cada columna tiene el tipo que tiene
- [x] Entendés qué hace cada `CHECK` constraint
- [x] Los tests pasan (`npx vitest run` en `workers/`) — 12 tests, todos verdes
- [x] Puedes explicarle a alguien más por qué `ULID` > `UUID` para este caso

---

**La regla**: si no podés explicar POR QUÉ algo está así, no está listo. La IA te genera el código, pero VOS tenés que poder defender cada decisión.
