# Final Experience Betano — Landing + Concurso

Landing de inscripción para el concurso "Final Experience Betano" (final del Mundial 2026), con panel de administración para sorteo aleatorio auditable y notificación de ganadores por correo.

Stack: **Next.js 16.2 (App Router, Turbopack) · React 19 · TypeScript · Supabase · Resend · Vercel**.

> Nota técnica: la protección de `/admin` vive en `proxy.ts` (antes `middleware.ts` en versiones previas de Next.js — Next.js 16 renombró el archivo y la función a `proxy`, ejecutándose en runtime Node.js). El comportamiento es el mismo: revalida la sesión de Supabase en cada request a `/admin/*` y redirige a `/admin/login` si no hay usuario.

## Qué incluye

- **Landing** (`/`): hero replicando el mockup + formulario de inscripción con validación de RUT chileno (dígito verificador) y soporte para DNI extranjero / Pasaporte.
- **Bases legales** (`/bases-legales`): borrador conforme a la Ley 21.719 (finalidad única, plazo de eliminación, derechos ARCO+). **Revisar con un abogado antes de publicar.**
- **Panel admin** (`/admin`): protegido por Supabase Auth. Ejecuta el sorteo con semilla guardada (reproducible/auditable), gestiona ganadores y suplentes en cascada, y notifica por Resend.

## 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. SQL Editor → pega y ejecuta `supabase/schema.sql`.
3. Crea el usuario admin: Authentication → Users → Add user (email + password). Confírmalo.
4. Copia desde Project Settings → API: `URL`, `anon key` y `service_role key`.

## 2. Resend

1. Crea cuenta en [resend.com](https://resend.com) y verifica tu dominio (DNS).
2. Crea una API key.
3. Define el remitente, ej. `Final Experience <concurso@tudominio.cl>`.

## 3. Variables de entorno

Copia `.env.example` a `.env.local` y rellena los valores. Las mismas variables van en Vercel (Project Settings → Environment Variables).

> `SUPABASE_SERVICE_ROLE_KEY` y `RESEND_API_KEY` son secretas: nunca las expongas al cliente ni las subas al repo.

## 4. Local

```bash
npm install
npm run dev
```

## 5. Deploy a Vercel

1. Sube el repo a GitHub.
2. Importa el repo en Vercel.
3. Agrega las variables de entorno.
4. Deploy. El `RESEND_FROM` debe usar tu dominio verificado.

## Flujo del sorteo

1. Cierras inscripciones.
2. En `/admin`, ejecutas el sorteo (con o sin semilla; si la dejas vacía se genera una y queda guardada).
3. La función SQL `ejecutar_sorteo` baraja con esa semilla → resultado reproducible.
4. Posiciones 1–10 = ganadores; 11+ = suplentes.
5. Si un ganador declina (botón "Declinó"), el primer suplente disponible sube a ganador efectivo automáticamente.
6. "Notificar ganadores" envía correo a los 10 efectivos y registra la fecha de envío.

## Eliminación de datos (Ley 21.719)

Tras el evento del 19 de julio de 2026, eliminas los datos manualmente:

```sql
-- En Supabase SQL Editor, tras entregar los premios:
delete from public.sorteo_resultados;
delete from public.sorteos;
delete from public.participantes;
```

## Notas importantes

- Las bases legales son un **borrador referencial**, no asesoría legal. Reemplaza los campos `[ ]` y hazlo revisar por un abogado chileno.
- El **responsable del tratamiento** es Betano / la empresa organizadora (decide la finalidad). El desarrollador es el **encargado**.
- Los **logos de Betano y FIFA** son placeholders. Sustitúyelos por los assets oficiales con licencia antes de publicar.
- El sorteo y los emails sólo son accesibles tras login en `/admin`; las APIs re-verifican la sesión en el servidor.
