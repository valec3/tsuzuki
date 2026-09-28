# 🚀 Guía de Despliegue e Infraestructura — Tsuzuki (完了)

> **Stack**: Angular 21 (PWA) + Cloudflare Workers (API REST) + D1 (SQLite) + R2 (Backups) + Cloudflare Access (Zero Trust Auth).  
> **Costo de infraestructura**: $0 / mes (100% Free Tier de Cloudflare).

---

## 1. Arquitectura de Despliegue

Tsuzuki utiliza el modelo moderno de **Cloudflare Workers con Assets Estáticos** (declarado en `wrangler.jsonc`):
- **Frontend**: Compilación estática de Angular (`dist/index/browser`) servida a través del CDN de Cloudflare Assets con soporte PWA y Service Worker.
- **Backend**: API REST montada sobre Cloudflare Workers (`workers/api/index.ts`) bajo la ruta `/api/*`.
- **Persistencia**: Cloudflare D1 Database (`tsuzuki-db`) accesible directamente desde el Worker vía binding `tsuzuki_db`.
- **Seguridad**: Cloudflare Access (Zero Trust) protegiendo el dominio de borde antes de tocar tanto la SPA como la API.

---

## 2. Requisitos Previos

1. **Node.js** (v20+ recomendado) y **pnpm** instalados.
2. **Wrangler CLI** autenticado con tu cuenta de Cloudflare:
   ```bash
   npx wrangler login
   ```
   Verificar sesión activa:
   ```bash
   npx wrangler whoami
   ```

---

## 3. Preparación de la Base de Datos (Cloudflare D1)

### 3.1 Creación de la Base de Datos (una sola vez)
```bash
npx wrangler d1 create tsuzuki-db
```
Copia el `database_id` que devuelve el comando y verifícalo en `wrangler.jsonc`:
```jsonc
"d1_databases": [
  {
    "binding": "tsuzuki_db",
    "database_name": "tsuzuki-db",
    "database_id": "TU_DATABASE_ID_AQUI",
    "remote": true
  }
]
```

### 3.2 Aplicar Migraciones
Las migraciones SQL residen en la carpeta `migrations/`.

- **En la base de datos remota (Producción)**:
  ```bash
  npx wrangler d1 execute tsuzuki-db --remote --file=migrations/001_initial.sql
  ```

- **Verificar que las tablas e índices fueron creados**:
  ```bash
  # Ver tablas creadas
  npx wrangler d1 execute tsuzuki-db --remote --command "SELECT name FROM sqlite_master WHERE type='table';"

  # Ver índices creados
  npx wrangler d1 execute tsuzuki-db --remote --command "SELECT name FROM sqlite_master WHERE type='index';"
  ```

---

## 4. Almacenamiento de Backups (Cloudflare R2)

Para la retención diaria de snapshots de la base de datos:
```bash
npx wrangler r2 bucket create tsuzuki-backups
```
Verifica que el binding en `wrangler.jsonc` coincida con el nombre creado:
```jsonc
"r2_buckets": [
  {
    "bucket_name": "tsuzuki-backups",
    "binding": "tsuzuki_backups",
    "remote": true
  }
]
```

---

## 5. Secretos y Variables de Entorno en Cloudflare

Los secretos de producción **NUNCA** se commitean al repositorio. Se inyectan de forma encriptada en la plataforma:

### 5.1 Cloudflare Access (Audience Tag)
Si activaste la validación estricta de AUD en el Worker:
```bash
npx wrangler secret put CF_ACCESS_AUDIENCE_ID
# Pega el Audience Tag obtenido en Zero Trust Dashboard
```

### 5.2 GitHub Token (Para Backups Off-site — Fase 5)
```bash
npx wrangler secret put GITHUB_TOKEN
# Pega tu Personal Access Token (PAT) con scope 'repo'
```

### 5.3 Listar secretos configurados
```bash
npx wrangler secret list
```

---

## 6. Proceso de Despliegue (Paso a Paso)

El despliegue se realiza en dos fases: **Build del Frontend** y **Deploy del Worker + Assets**:

```bash
# 1. Compilar la aplicación Angular en modo producción
pnpm run build

# 2. Desplegar Worker junto con los assets estáticos a Cloudflare
npx wrangler deploy
```

> **¿Qué hace `wrangler deploy`?**
> Sube el bundle compilado de Angular desde `dist/index/browser` a la red CDN de Cloudflare y despliega el Worker con la API `/api/*` y los bindings de D1/R2 en una única operación atómica.

---

## 7. Configuración de Cloudflare Access (Zero Trust)

Para evitar tener que ingresar códigos de acceso continuamente:

1. Entrar a [Cloudflare Zero Trust Dashboard](https://dash.teams.cloudflare.com).
2. Ir a **Access** → **Applications**.
3. Seleccionar la aplicación de Tsuzuki → **Edit**.
4. **Session Duration**:
   - Cambiar de `24 hours` a **`1 month`** (o el plazo que prefieras).
   - Con esto, te autenticas una única vez en el navegador o PWA de tu teléfono y la sesión permanece activa.
5. **Políticas de Acceso (Policies)**:
   - Política: `owner-only` (Action: `Allow`).
   - Criterio de inclusión: `Include` → `Emails` → Tu dirección de correo.
6. *(Opcional)* **Login con Google/GitHub**:
   - En **Settings** → **Authentication** → **Login methods**, añade tu proveedor de identidad para autenticarte con un solo clic sin esperar códigos OTP.

---

## 8. Diagnóstico, Logs y Verificación en Vivo

### 8.1 Ver logs de la API en tiempo real
Para inspeccionar peticiones, errores o consultas SQL mientras usas la app:
```bash
npx wrangler tail
```

### 8.2 Probar el Health Check en producción
```bash
curl -I https://tu-dominio.workers.dev/api/health
```
Debe responder `HTTP/1.1 200 OK` con JSON `{"status":"ok", ...}`.

---

## 9. Rollback y Recuperación ante Desastres

- **Deshacer un despliegue de Worker**:
  ```bash
  npx wrangler rollback
  ```
- **Time Travel en D1 (Recuperar base de datos a un punto temporal)**:
  ```bash
  # Ver historial de bookmarks / transacciones
  npx wrangler d1 time-travel info tsuzuki-db

  # Restaurar la base de datos a un timestamp específico
  npx wrangler d1 time-travel restore tsuzuki-db --timestamp="2026-09-06T12:00:00Z"
  ```
