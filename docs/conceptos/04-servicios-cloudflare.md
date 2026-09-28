# ☁️ Guía Técnica y Arquitectónica — Ecosistema Cloudflare

Esta guía explica el resto de los servicios de infraestructura de Cloudflare que hacen posible que **Tsuzuki** sea 100% serverless, gratuito, seguro y con alta durabilidad de datos.

---

## 1. Cloudflare Access (Zero Trust)

### 1.1 ¿Qué es y cómo funciona el Perímetro Zero Trust?
En las aplicaciones web tradicionales, los desarrolladores tienen que:
- Diseñar tablas de usuarios y contraseñas.
- Hashear passwords con bcrypt.
- Manejar sesiones, cookies seguras, CSRF, expiración de tokens.
- Implementar pantallas de login, registro, "olvidé mi contraseña".

En **Tsuzuki**, delegamos toda esa complejidad a **Cloudflare Access**:
- **Cero código de login**: Cloudflare actúa como un guardia de seguridad en la puerta del edificio.
- Cuando una petición llega a `tsuzuki.pages.dev` o `/api/*`:
  1. Si no hay una sesión activa, Cloudflare intercepta el tráfico y muestra la pantalla de autenticación OTP por email.
  2. Una vez que ingresas el código, Cloudflare emite una cookie firmada criptográficamente (`CF_Authorization`).
  3. Tu aplicación Angular y tu Worker solo reciben tráfico que **ya fue autenticado y validado por Cloudflare**.

### 1.2 Validación de Defensa en Profundidad ([`workers/api/shared/auth.ts`](file:///c:/Users/User/Development/Self/tsuzuki/workers/api/shared/auth.ts))
Aunque Cloudflare Access frena a los intrusos en el borde, en el Worker aplicamos el principio de **Defensa en Profundidad**:
- Verificamos que el header `CF-Authorization` o la cookie existan.
- Si está configurado el secreto `CF_ACCESS_AUDIENCE_ID`, validamos que el token JWT pertenezca exactamente a nuestra aplicación (campo `aud`), impidiendo que un token de otra aplicación de Cloudflare pueda ser reutilizado acá.

---

## 2. Cloudflare Pages & Workers Static Assets

### 2.1 La convergencia de Assets y Compute
En nuestro archivo [`wrangler.jsonc`](file:///c:/Users/User/Development/Self/tsuzuki/wrangler.jsonc):
```jsonc
{
  "name": "tsuzuki",
  "main": "workers/api/index.ts",
  "assets": {
    "directory": "dist/index/browser"
  }
}
```
Esto utiliza la arquitectura moderna de Cloudflare:
- **`dist/index/browser`**: Es la carpeta donde Angular compila el HTML, CSS y JavaScript de la SPA. Cloudflare los sirve como archivos estáticos directamente desde su red de CDN (con compresión Brotli y caching HTTP agresivo).
- **`main: workers/api/index.ts`**: Cualquier petición dirigida a `/api/*` es interceptada por el Worker para ejecutar la lógica de Hono y D1.
- **Resultado**: Tanto el frontend como el backend viven bajo el mismo origen, eliminando problemas de CORS en producción y desplegándose con un único comando: `wrangler deploy`.

---

## 3. Cloudflare R2 (Object Storage)

### 3.1 ¿Qué es R2?
Cloudflare R2 es un almacenamiento de objetos compatible con la API de Amazon S3, pero con una ventaja económica revolucionaria: **Cero costos de egress (ancho de banda de salida gratuito)**.

### 3.2 Su rol en Tsuzuki: Backups Diarios (Fase 5)
En [`wrangler.jsonc`](file:///c:/Users/User/Development/Self/tsuzuki/wrangler.jsonc) tenemos vinculado el bucket:
```jsonc
"r2_buckets": [
  {
    "bucket_name": "tsuzuki-backups",
    "binding": "tsuzuki_backups"
  }
]
```
Un Cron Worker programado diariamente exportará todos los registros de D1 a un archivo JSON compactado y lo subirá a R2, reteniendo los últimos 30 días de historia.

---

## 4. Estrategia 3-2-1 y GitHub Off-site

La arquitectura de durabilidad de Tsuzuki sigue la regla de oro de la ingeniería de sistemas (Estrategia 3-2-1):
1. **3 copias de los datos**:
   - Copia 1: Base de datos D1 en producción.
   - Copia 2: Snapshot diario en Cloudflare R2.
   - Copia 3: Commit diario de `backup.json` a un repositorio privado de GitHub.
2. **2 medios diferentes**:
   - Base de datos relacional SQLite (D1) y almacenamiento de objetos JSON (R2).
3. **1 copia fuera de la infraestructura principal (Off-site)**:
   - Si Cloudflare sufriera una caída catastrófica global o tu cuenta fuera suspendida, **GitHub tiene la copia completa e intacta de todos tus mangas y capítulos**, permitiendo levantar el sistema en cualquier otro proveedor en cuestión de minutos.
