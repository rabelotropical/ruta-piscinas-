# Ruta de Piscinas — guía para ponerla en línea (desde cero)

Esta es la versión independiente de tu app: ya no depende de Claude para guardar datos.
Usa Supabase como base de datos y Vercel para tenerla en una URL propia. Ambos tienen plan
gratis y son suficientes para tu negocio.

Vas a hacer 3 cosas, en este orden: **Supabase → GitHub → Vercel**. Toma como 20-30 minutos
la primera vez.

---

## 1. Crear la base de datos en Supabase

1. Ve a **supabase.com** → "Start your project" → crea una cuenta (puedes usar tu email o GitHub).
2. Crea un proyecto nuevo: dale un nombre (ej. "piscinas"), elige una contraseña para la base
   de datos (guárdala en algún lado, no la vas a necesitar seguido) y la región más cercana
   (US East suele ser la más rápida desde Puerto Rico).
3. Espera 1-2 minutos a que el proyecto termine de crearse.
4. En el menú izquierdo, ve a **SQL Editor** → **New query**.
5. Abre el archivo `supabase_schema.sql` que viene en esta carpeta, copia todo su contenido,
   pégalo ahí, y dale **Run**. Esto crea las tablas de clientes, visitas, técnicos, y el
   espacio para guardar las fotos.
6. Ve a **Project Settings** (el engranaje) → **API**. Ahí vas a ver dos cosas que necesitas
   copiar y guardar por ahora:
   - **Project URL** (algo como `https://xxxxx.supabase.co`)
   - **anon public key** (una llave larga de texto)

---

## 2. Subir el código a GitHub

1. Ve a **github.com** → crea una cuenta si no tienes.
2. Crea un repositorio nuevo (botón verde "New"), dale un nombre como `ruta-piscinas`,
   déjalo público o privado (cualquiera funciona), y créalo sin plantillas.
3. Sube todos los archivos de esta carpeta (`piscina-app`) a ese repositorio. La forma más
   fácil sin usar la terminal: en la página del repositorio, "Add file" → "Upload files" →
   arrastra todos los archivos y carpetas de aquí, y confirma.
   - **No subas** la carpeta `node_modules` si la llegas a tener — no viene incluida aquí.

---

## 3. Publicarla con Vercel

1. Ve a **vercel.com** → crea una cuenta usando tu cuenta de GitHub (más fácil, te la conecta
   directo).
2. "Add New" → "Project" → busca y selecciona el repositorio `ruta-piscinas` que acabas de subir.
3. Antes de darle "Deploy", abre la sección **Environment Variables** y añade las dos que
   copiaste de Supabase:
   - `VITE_SUPABASE_URL` = tu Project URL
   - `VITE_SUPABASE_ANON_KEY` = tu anon public key
4. Dale **Deploy**. En 1-2 minutos te da una URL como `ruta-piscinas.vercel.app` — esa es tu
   app, ya en línea, accesible desde cualquier celular, tablet o computadora.

---

## 4. Instalarla en tu iPhone

1. Abre esa URL de Vercel en **Safari** en tu iPhone.
2. Toca el ícono de compartir (el cuadrito con la flecha hacia arriba).
3. Elige **"Añadir a pantalla de inicio"**.

Ahora tienes un ícono real en tu iPhone que abre la app a pantalla completa — y esta vez sí
funciona de forma completamente independiente, con tus propios datos guardados en tu base de
datos de Supabase, no en Claude.

---

## Notas importantes

- **Seguridad actual:** por ahora cualquiera con la URL de tu app y la llave "anon" podría ver
  o cambiar los datos — no hay usuario/contraseña todavía, solo el nombre de técnico que se
  guarda en cada visita. Está bien para un equipo pequeño de confianza. Si más adelante quieres
  login real por técnico (con contraseña), es un paso extra que podemos añadir con Supabase Auth.
- **Costo:** Supabase y Vercel son gratis en el plan que necesitas para esta operación (hasta
  volúmenes bastante grandes de clientes y visitas). Si tu negocio crece mucho, eventualmente
  podrías necesitar un plan de pago — te avisará la misma plataforma cuando te acerques al límite.
- **Actualizaciones futuras:** cualquier cambio que quieras hacerle a la app, lo hacemos aquí en
  el código y luego solo tienes que subir los archivos actualizados a GitHub — Vercel la vuelve
  a publicar sola en 1-2 minutos.
- **App Store:** esta versión funciona como ícono en tu pantalla (PWA), no como app descargada del
  App Store. Si más adelante quieres eso de verdad, se envuelve este mismo código con una
  herramienta llamada Capacitor y se sube a Apple Developer (cuesta $99/año) — es un proyecto
  aparte que podemos hacer cuando estés listo.
