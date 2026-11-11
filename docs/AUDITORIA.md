# Informe de auditoría técnica – API MRFront (MRAPI)

Fecha: 2026-11-11 · Rama: `claude/friendly-lovelace-fhz789`

## ⚠️ Acciones manuales obligatorias tras fusionar

1. **Rotar secretos.** El archivo `.env` (credenciales de MySQL y `JWT_KEY`) estuvo versionado en git y sigue en el historial. Hay que cambiar la contraseña de MySQL y generar un `JWT_KEY` nuevo de ≥ 32 caracteres aleatorios:
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   Si el repositorio es o fue público, considere también limpiar el historial (`git filter-repo`).
2. **Haga copia de su `.env` antes de hacer `git pull`.** `.env` y `node_modules/` dejan de estar versionados; al traer estos cambios git borrará ambos de su copia local. Después: restaure `.env` y ejecute `npm ci`.
3. Defina `CORS_ORIGINS` con la URL del frontend React (p. ej. `http://localhost:5173`) en cada entorno.

## 1. Estado general

API Express 4 (ES modules transpilados con Babel) organizada por servicio (`routes → controller → service`) sobre MySQL mediante `mysql2/promise` y procedimientos almacenados. Tamaño reducido: 5 endpoints.

**Antes:** el servidor **no arrancaba** en Linux (binario nativo de bcrypt para macOS versionado en `node_modules`), 13 vulnerabilidades en dependencias (2 críticas), secretos en git, sin manejo de errores consistente, sin protección contra fuerza bruta y sin pruebas.
**Después:** arranca, 0 vulnerabilidades en dependencias de producción, manejo de errores centralizado, rate limiting, validación de entrada y 39 pruebas automatizadas (35 unitarias + 4 de integración con MariaDB real).

### Endpoints

| Método | Ruta | Auth | Notas |
|---|---|---|---|
| GET | `/api/example` | JWT | Ejemplo |
| GET | `/api/products` | JWT | `CALL get_all_products()` |
| GET | `/api/products/:id` | JWT | `CALL get_Prod_ByID(?)` |
| GET / **POST (nuevo alias)** | `/user/login` | Pública + rate limit | `CALL validateUserCredentials(?)` |
| POST | `/user/CreateUser` | Pública + rate limit | `CALL CrearUsuario(?,?,?,?,?)` |

> `/api/products` **ya requería JWT** antes (el middleware montado en `/api` se ejecutaba para cualquier ruta `/api/*`). Se ha mantenido y ahora es explícito.

## 2–3. Hallazgos y vulnerabilidades

| # | Criticidad | Hallazgo | Estado |
|---|---|---|---|
| 1 | CRÍTICO | `.env` con credenciales de BD y `JWT_KEY` versionado en git | Corregido (desversionado + `.gitignore`). **Rotar secretos** (pendiente manual) |
| 2 | CRÍTICO | Dependencias con vulnerabilidades conocidas: `proxy-addr`, `tar` (críticas), `express`, `mysql2`, `jws`, `body-parser`, `path-to-regexp`, `bcrypt 5` (vía `node-pre-gyp`/`tar`)… 13 en total | Corregido: `npm audit fix` + `bcrypt` 6. Producción: 0 vulnerabilidades |
| 3 | CRÍTICO | El backend no arrancaba fuera de macOS: `node_modules` versionado con binario Mach-O de bcrypt (`invalid ELF header`) | Corregido: `node_modules` fuera de git, reinstalación limpia |
| 4 | ALTO | Sin protección contra fuerza bruta ni rate limiting | Corregido: `express-rate-limit` (global 300/min/IP; login 10 fallos/15 min/IP; CreateUser 20/h/IP) |
| 5 | ALTO | Login: con `password` ausente `bcrypt.compare` lanzaba excepción → 500; sin validación de tipos | Corregido: validación → 400 |
| 6 | ALTO | Enumeración de usuarios: respuesta distinta (400 «Datos del usuario incompletos») y tiempo de respuesta distinto si el usuario existe o no | Corregido: siempre 401 genérico + comparación bcrypt ficticia para igualar tiempos |
| 7 | ALTO | `GET /user/login` con credenciales en el cuerpo: los navegadores (fetch/axios) no envían cuerpo en GET, por lo que el login no puede funcionar desde React | Añadido `POST /user/login` (mismo contrato). GET se conserva por compatibilidad |
| 8 | ALTO | Exposición de errores internos: productos devolvía `error.message` (p. ej. nombres de tablas/BD) en 500; manejador global en texto plano | Corregido: manejador centralizado, mensajes genéricos en JSON |
| 9 | ALTO | `POST /user/CreateUser` es público y acepta `Estatus_User` del cliente (posible autoregistro con estado arbitrario) | **Pendiente de decisión de negocio** (ver §9). Mitigado con rate limit y validación |
| 10 | MEDIO | Parámetros SQL sin validar tipo: `pool.query` expande objetos/arrays (`{a:1}` → `` `a` = 1``) | Corregido: solo valores primitivos; el SQL siempre usa `?` (no había inyección por concatenación) |
| 11 | MEDIO | JWT: sin algoritmo fijado en `verify`/`sign`; secreto no validado (si faltaba, `jwt.sign` fallaba en la primera petición) | Corregido: `HS256` explícito; validación de variables obligatorias al arrancar y aviso si `JWT_KEY` < 32 caracteres (el actual tiene 17) |
| 12 | MEDIO | CORS abierto a cualquier origen | Configurable con `CORS_ORIGINS` (vacío mantiene el comportamiento anterior con aviso) |
| 13 | MEDIO | Contraseñas > 72 bytes truncadas silenciosamente por bcrypt | Corregido: validación → 400 |
| 14 | MEDIO | Sin cabeceras de seguridad; `X-Powered-By` expuesto | Corregido: `helmet` |
| 15 | MEDIO | `uncaughtException`/`unhandledRejection` sin manejar; solo SIGINT; el servidor HTTP no se cerraba antes del pool | Corregido: apagado ordenado SIGINT/SIGTERM con timeout |
| 16 | MEDIO | Pool MySQL sin timeouts; `handleDisconnect()` (código muerto que hacía `throw` dentro de un evento) | Corregido: `connectTimeout`, `enableKeepAlive`, timeout por consulta (15 s), límites configurables; código muerto eliminado |
| 17 | BAJO | `src/server.js` duplicado y roto (rutas de import inexistentes); `nodemon.json` apuntaba a él | Eliminado; `nodemon.json` apunta a `server.js` |
| 18 | BAJO | Dependencias innecesarias: `bcryptjs` (sin uso), `body-parser` importado sin estar declarado (y duplicado con `express.json`) | Eliminadas |
| 19 | BAJO | Mezcla de `require`/`import`, código comentado, `.DS_Store` versionados | Limpiado |
| 20 | BAJO | Sin rutas 404 en JSON; JSON mal formado devolvía 500 | Corregido: 404 / 400 / 413 en JSON |

## 4. Errores corregidos (resumen funcional)

- Arranque en Linux/servidores; validación de configuración al iniciar (falla con mensaje claro, sin imprimir valores).
- Login: entradas inválidas → 400; errores de BD → 500/503 genérico, nunca stack ni SQL.
- `CreateUser`: `ER_DUP_ENTRY` → 409; `SIGNAL 45000` del procedimiento → 400 con su mensaje (contrato original).
- BD no disponible (`ECONNREFUSED`, `PROTOCOL_CONNECTION_LOST`, timeouts…) → 503.

### Formato de errores (consistente)

```json
{ "message": "texto legible" }
{ "message": "Datos inválidos", "errors": ["email_user no tiene un formato de correo válido"] }
```

## 5. MySQL

- Todas las consultas usan parámetros enlazados (`?`) mediante el helper `callProcedure()` (`src/config/db.js`), con timeout por consulta.
- No hay N+1 ni consultas repetidas en el código Node: cada endpoint ejecuta un único `CALL`.
- **No se ha modificado el esquema.** Los procedimientos almacenados y tablas no están en el repositorio, por lo que índices, claves foráneas, transacciones y concurrencia dentro de los procedimientos no se pueden auditar. Recomendaciones (aplicar solo tras revisar el esquema real; los nombres de tabla/columna son supuestos):

```sql
-- Búsqueda del login por nombre de usuario (validateUserCredentials) y unicidad
ALTER TABLE usuarios ADD UNIQUE INDEX uq_usuarios_nombre (nombre);
ALTER TABLE usuarios ADD UNIQUE INDEX uq_usuarios_email (email);
-- Columna de hash bcrypt con tamaño suficiente
ALTER TABLE usuarios MODIFY password VARCHAR(255) NOT NULL;
```

  Justificación: el login filtra por nombre de usuario en cada intento; sin índice es un recorrido completo de la tabla, y sin restricción UNIQUE `CrearUsuario` tiene una condición de carrera (dos peticiones simultáneas pueden pasar el `IF EXISTS` y duplicar el usuario).
- `CrearUsuario` debería ejecutar la comprobación y el `INSERT` dentro de una transacción o apoyarse en la restricción UNIQUE (ahora la API devuelve 409 si salta).

## 6. Rendimiento

- Pool: límite configurable (`DB_POOL_LIMIT`), keep-alive, `connectTimeout` y timeout por consulta para que una consulta colgada no retenga conexiones indefinidamente.
- Rechazo temprano de peticiones inválidas antes de tocar la BD o bcrypt.
- Límite de cuerpo JSON de 100 kB.
- **No paginado:** `GET /api/products` devuelve todos los productos. Paginarlo requiere cambiar el procedimiento `get_all_products` y el contrato con React; queda como recomendación.
- No se añadió caché ni infraestructura adicional: el volumen actual no lo justifica.

## 7. Archivos modificados

| Archivo | Cambio |
|---|---|
| `.gitignore` | Nuevo: `node_modules`, `.env`, `.DS_Store`, logs |
| `.env`, `node_modules/`, `.DS_Store` | Retirados del control de versiones (no del disco) |
| `.env.example` | Documenta todas las variables (nuevas opcionales) |
| `package.json`, `package-lock.json` | Dependencias actualizadas/seguras, scripts `start`, `test`, `test:integration` |
| `nodemon.json` | Apunta a `server.js` |
| `server.js` | Validación de configuración, apagado ordenado, manejo de excepciones globales |
| `src/server.js` | Eliminado (duplicado roto) |
| `src/app.js` | helmet, CORS configurable, rate limit, 404 y manejador de errores |
| `src/config/index.js` | Nuevas variables, `validateConfig()` |
| `src/config/db.js` | Pool con timeouts, `callProcedure()`, `ping` en `testConnection` |
| `src/middleware/authMiddleware.js` | Algoritmo fijado, import corregido |
| `src/middleware/errorHandler.js` | Nuevo: manejo centralizado de errores |
| `src/middleware/rateLimiters.js` | Nuevo |
| `src/utils/httpError.js`, `src/utils/validators.js` | Nuevos |
| `src/services/User_Services/*` | Validación, anti-enumeración, `POST /login`, errores |
| `src/services/product_Service/*` | Validación, errores genéricos, limpieza |
| `tests/**` | Nuevas pruebas y fixtures de prueba |

## 8. Pruebas ejecutadas

| Prueba | Resultado |
|---|---|
| Arranque original (antes de cambios) | ❌ `invalid ELF header` (bcrypt macOS) |
| `npm test` – 35 pruebas unitarias (BD simulada): JWT (sin token, formato, firma falsa, expirado, `alg: none`), productos, login, creación, 404/400/413, cabeceras, rate limit | ✅ 35/35 |
| `npm run test:integration` contra **MariaDB 10.11 local desechable** con `tests/integration/fixtures.sql` (crear usuario, duplicado vía SIGNAL, login OK/KO, intento de inyección SQL, productos) | ✅ 4/4 |
| `npm start` real + curl: crear usuario 201, login POST con token, productos 200 con la **misma forma de respuesta que antes**, sin token 403, CORS permitido/denegado | ✅ |
| Arranque sin `JWT_KEY` / con BD inaccesible | ✅ Falla con mensaje claro sin exponer secretos |
| SIGTERM | ✅ Cierra HTTP, pool y sale |
| `npm audit --omit=dev` | ✅ 0 vulnerabilidades |

Ejecutar integración (nunca contra producción):

```bash
mysql mrapi_test < tests/integration/fixtures.sql
TEST_DB_HOST=127.0.0.1 TEST_DB_USER=... TEST_DB_PASSWORD=... TEST_DB_NAME=mrapi_test npm run test:integration
```

**No verificado:** conexión con su MySQL real (los procedimientos reales no están en el repositorio; se probó con procedimientos *stub* que reproducen el contrato inferido del código) y el frontend React (no está en este repositorio).

## 9. Pendientes

- **Rotar secretos** (§ acciones manuales).
- **ALTO – `POST /user/CreateUser` es público.** Si solo administradores deben crear usuarios, protegerlo con JWT + rol. No se ha cambiado porque rompería un posible registro público desde React. Además el cliente fija `Estatus_User` y `CreateByDateU`; deberían decidirse en el servidor.
- Migrar el frontend de `GET /user/login` a `POST /user/login` y luego retirar el GET.
- `/api/*` sin token responde **403**; lo estándar es **401**. Se mantuvo por compatibilidad.
- `GET /api/products` devuelve la salida cruda del `CALL` (`[[filas], {fieldCount, affectedRows…}]`) y `/:id` devuelve `[]` si no existe en lugar de 404. Se mantuvo por compatibilidad con React; normalizarlo (`res.json(rows[0])`, 404) requiere ajustar el frontend.
- 6 avisos de severidad baja en `jest` (dev, `deepmerge`): sin corrección no disruptiva; no afectan a producción.
- El rate limit usa memoria del proceso: si se ejecutan varias instancias, usar un store compartido (Redis). Detrás de un proxy, configurar `TRUST_PROXY`.

## 10. Recomendaciones

1. Versionar el esquema y los procedimientos almacenados (carpeta `db/migrations`).
2. Política de contraseñas mínima (longitud ≥ 8) acordada con negocio.
3. Autorización por rol (`req.user.role`) para endpoints administrativos.
4. Compilar con `babel src -d dist` y ejecutar `node dist/...` en producción en lugar de `babel-node`.
5. Logger estructurado (pino) con redacción de campos sensibles.
6. Paginación en productos (`LIMIT/OFFSET` en el procedimiento).
7. CI que ejecute `npm test` y `npm audit --omit=dev`.
