# Formulario Angular + Node + PostgreSQL

Aplicacion para capturar formularios con Angular (frontend) y API Node/Express + PostgreSQL.

## Requisitos
- Node.js 18+
- PostgreSQL accesible

## Backend (API)
1. Configura variables:
   ```bash
   cd backend
   cp .env.example .env
   # Ajusta DATABASE_URL, JWT_SECRET, BACKEND_BASE_URL y SMTP_*
   ```
2. Ejecuta:
   ```bash
   npm install
   npm start
   ```
3. API en `http://localhost:4000`.

### Migraciones para cambios futuros
Cuando agregues nuevas funciones que cambien BD, usa migraciones SQL:

```bash
cd backend
npm run migrate:new -- nombre_del_cambio
# edita backend/migrations/*.sql
npm run migrate
```

Para desplegar actualizaciones en PoC:
1. `git pull`
2. `cd backend && npm ci`
3. `npm run migrate`
4. `npm start` (o reinicio de servicio)

### Auth
- `POST /api/auth/register`: crea usuario con rol `user` en estado pendiente (`email_verified=false`) y envia correo de verificacion.
- `GET /api/auth/verify-email?token=...`: valida token JWT (expira en 1 hora), activa cuenta y limpia token.
- `POST /api/auth/resend-verification`: reenvia correo de verificacion.
- `POST /api/auth/login`: devuelve JWT solo si `email_verified=true`.

### Roles
- `admin`: gestiona usuarios (crear, cambiar rol, borrar, listar) y puede revisar/editar formularios.
- `revisor`: recibe formularios, ve PDF DPI y asigna formulario a un analista. No edita campos del formulario.
- `analista`: revisa/edita solo formularios asignados, puede aprobarlos o devolverlos al usuario con motivo de correccion.
- `user`: llena y envia formulario, y ve el seguimiento de sus tramites (enviado, recibido, asignado, devuelto, aprobado).
- `supervisor`: dashboard de supervision con estadisticas por unidad, tiempos por etapa y exportacion de reportes CSV.

### Endpoints principales
- `POST /api/submissions` (autenticado): crea formulario.
- `GET /api/submissions` (revisor/analista/admin/supervisor): lista formularios. Para `analista`, solo devuelve los asignados.
- `PUT /api/submissions/:id` (analista/admin/supervisor): edita formulario.
- `GET /api/submissions/:id/dpi` (revisor/analista/admin/supervisor): abre PDF DPI adjunto. Para `analista`, solo si el formulario esta asignado.
- `GET /api/submissions/:id/acta` (revisor/analista/admin/supervisor): abre PDF de Acta Notarial adjunta.
- `POST /api/submissions/:id/approve` (analista/admin/supervisor): marca formulario como aprobado.
- `POST /api/submissions/:id/return` (analista/admin/supervisor): devuelve formulario al usuario con motivo de correccion.
- `POST /api/submissions/:id/assign` (revisor/admin/supervisor): asigna o desasigna analista.
- `POST /api/submissions/:id/open` (revisor/admin/supervisor): marca formulario como abierto por receptor.
- `GET /api/my-submissions` (autenticado): seguimiento de procesos del usuario logueado.
- `GET /api/my-submissions/:id` (user): detalle de formulario propio para correccion.
- `PUT /api/my-submissions/:id/resubmit` (user): reenvia formulario devuelto y lo reasigna al analista que lo devolvio.
- `GET /api/supervisor/dashboard` (supervisor/admin): dashboard con estadisticas por unidad y tiempos por etapa.
- `GET /api/supervisor/report?scope=all|active&unit=RAN` (supervisor/admin): descarga reporte CSV.
- `GET /api/analistas` (revisor/admin/supervisor): lista analistas.
- `GET /api/users` (admin): lista usuarios.
- `POST /api/users` (admin): crea usuario con rol especifico.
- `PATCH /api/users/:id/role` (admin): cambia rol.
- `DELETE /api/users/:id` (admin): borra usuario.

## Frontend
1. Ejecuta:
   ```bash
   cd frontend
   npm install
   npm start
   ```
2. URL: `http://localhost:4200`

### Flujo
- Login/registro: `/auth`
- Inicio: `/` (dashboard de gestiones del usuario, agrupadas por unidad)
- Formulario general: `/formulario`
- Formulario RAN "Reserva, Prorroga o Cesion de Matricula": `/ran/formulario-2`
- Formulario RAN "Certificacion": `/ran/formulario-8`
- Formulario FINANCIERO "Solicitud de solvencia de pago": `/financiero/solvencia-pago`
- Revision: `/revision`
- Supervision: `/supervision`
- Admin: `/admin`

### Regla de tipo de persona
- El formulario permite elegir `Persona individual` o `Persona juridica`.
- Si es `individual`, se oculta el numeral 5.
- Si es `juridica`, se muestra el numeral 5 y se exige PDF extra de Acta Notarial.

## Archivos clave
- Backend: `backend/config/db.js`, `backend/config/mailer.js`, `backend/controllers/authController.js`, `backend/routes/authRoutes.js`, `backend/src/index.js`, `backend/src/db.js`
- Frontend: `frontend/src/app/review-panel.component.ts`, `frontend/src/app/admin-page.component.ts`, `frontend/src/app/auth.service.ts`
