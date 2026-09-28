# 🗄️ Guía Técnica y Arquitectónica — Cloudflare D1 (Base de Datos)

Esta guía explica qué es **Cloudflare D1**, cómo se comunica con nuestro backend y por qué elegimos este motor de persistencia para **Tsuzuki**.

---

## 1. ¿Qué es Cloudflare D1?

### 1.1 El concepto nuclear
Cloudflare D1 es una base de datos relacional SQL distribuida basada en **SQLite**:
- **SQLite en el Edge**: Tradicionalmente, SQLite corría como un archivo local en un único servidor. D1 toma la simplicidad de SQLite y la distribuye por la red global de Cloudflare.
- **Lecturas globales ultrarrápidas**: Las lecturas se resuelven lo más cerca posible del usuario.
- **Escrituras con consistencia fuerte**: Las escrituras se canalizan a través de un coordinador primario para garantizar que los datos nunca se corrompan.

---

## 2. Decisiones de Modelado en Tsuzuki

### 2.1 ¿Por qué ULID en vez de UUID o AUTOINCREMENT?
En [`migrations/001_initial.sql`](file:///c:/Users/User/Development/Self/tsuzuki/migrations/001_initial.sql) definimos:
```sql
CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY,
  ...
);
```

| Tipo de ID | Desventaja | ¿Por qué elegimos ULID? |
|---|---|---|
| `INTEGER AUTOINCREMENT` | Predecible (vulnerable a scraping) y difícil de sincronizar si hay réplicas offline o múltiples fuentes. | No apto para sincronización distribuida. |
| `UUID v4` | Es completamente aleatorio. En bases de datos B-Tree (como SQLite), insertar UUIDs aleatorios fragmenta los índices y degrada el rendimiento de disco. | Fragmenta índices. |
| **`ULID` (Universally Unique Lexicographically Sortable Identifier)** | — | **Son 128 bits únicos, pero los primeros 48 bits son un timestamp (milisegundos desde Epoch). Esto significa que se ordenan cronológicamente de forma natural, optimizando al máximo los índices de SQLite.** |

Implementamos el generador en [`workers/api/shared/ulid.ts`](file:///c:/Users/User/Development/Self/tsuzuki/workers/api/shared/ulid.ts) usando la API criptográfica nativa `crypto.getRandomValues()` sin dependencias de terceros.

### 2.2 Reglas de Integridad con `CHECK` Constraints
La base de datos es la **última línea de defensa**. Aunque Zod valide en el backend y TypeScript valide en el frontend, la DB debe rechazar datos inconsistentes a nivel de motor:

```sql
CONSTRAINT valid_chapter CHECK (
  current_chapter >= 0
  AND (total_chapters IS NULL OR current_chapter <= total_chapters)
)
```
- No podés tener un capítulo negativo (`-5`).
- No podés ir por el capítulo 15 si el manga tiene 12 capítulos en total.

---

## 3. API de D1 en el Código (`db.prepare()`)

En Hono accedemos a D1 mediante el binding `c.env.tsuzuki_db` (o `c.get('db')`):

### 3.1 Prepared Statements y Prevención de SQL Injection
**NUNCA concatenamos strings en SQL**:
```typescript
// ❌ VULNERABLE A SQL INJECTION:
const sql = `SELECT * FROM media_items WHERE id = '${id}'`;

// ✅ SEGURO (Prepared Statement con bind):
const item = await db.prepare('SELECT * FROM media_items WHERE id = ?').bind(id).first();
```

### 3.2 Métodos de ejecución en D1
- **`.first<T>()`**: Devuelve la primera fila coincidente o `null` (ideal para buscar por ID).
- **`.all<T>()`**: Devuelve todas las filas coincidentes (`{ results: [...] }`).
- **`.run()`**: Ejecuta una sentencia de modificación (`INSERT`, `UPDATE`, `DELETE`) y devuelve metadatos como `result.meta.changes` (número de filas afectadas).

### 3.3 Transacciones Atómicas con `db.batch()`
Para el requerimiento de progreso rápido (**RF-10**), cada vez que el usuario avanza un capítulo, debemos:
1. Actualizar `media_items` (nuevo `current_chapter` y `updated_at`).
2. Insertar un registro en `progress_history`.

Si la segunda operación falla, la primera no debe quedar guardada a medias. Para esto usamos **`db.batch()`**:

```typescript
await db.batch([
  db.prepare(`
    UPDATE media_items SET current_chapter = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(newChapter, id),

  db.prepare(`
    INSERT INTO progress_history (id, item_id, from_chapter, to_chapter, changed_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(historyId, id, oldChapter, newChapter),
]);
```
`db.batch()` ejecuta ambas sentencias en una única transacción atómica en D1: o pasan las dos, o no pasa ninguna.
