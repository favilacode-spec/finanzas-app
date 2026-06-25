# Mi Billetera CR — Guía de uso y automatización

App de administración financiera para vos y tu pareja. Moneda: Guaraníes (₲).
Diseño: bandera de Costa Rica en modo oscuro.

## 🔗 La app está EN LÍNEA acá:
### **https://finanzas-app-favila-code.vercel.app**

Abrila desde la compu o el celular (podés "Agregar a pantalla de inicio" en el iPhone
para que funcione como una app). Cada cambio que subamos al código se actualiza solo.

---

## 1. Primer ingreso (vos y tu esposa)

1. Entrá a la app (link al final, cuando esté desplegada).
2. Tocá **Crear cuenta**, poné nombre, correo y contraseña. Cada uno crea la suya.
3. Para **compartir las finanzas** entre los dos:
   - Vos entrás primero y vas a **Ajustes → Hogar compartido**.
   - Copiás el **Código de invitación** y se lo pasás a tu esposa.
   - Ella crea su cuenta, va a **Ajustes → Unirme a otro hogar**, pega el código y toca **Unirme**.
   - Listo: los dos ven y editan las mismas cuentas, movimientos y presupuestos.

> Cada movimiento queda registrado con quién lo creó.

---

## 2. Cargar tus cuentas y empezar

1. Andá a **Cuentas → Nueva cuenta** y agregá cada banco/billetera por separado
   (Ueno, Itaú, efectivo, tarjeta, etc.), con su saldo inicial.
2. En el **Resumen** ves el saldo total combinado y por cuenta.
3. Cargá movimientos con el botón **Nuevo movimiento** (ingreso, gasto o transferencia).
4. Definí **Presupuestos** por categoría y **Metas de ahorro**.

---

## 3. Automatización A — Apple Pay (gastos automáticos) 🍎

Cada vez que pagás con Apple Pay, el gasto entra solo a la **Bandeja** de la app para que lo apruebes.

### Pasos en tu iPhone (una sola vez):
1. Abrí la app **Atajos** → pestaña **Automatización** → **+** → **Crear automatización personal**.
2. Elegí el disparador **Transacción** (Wallet / Apple Pay).
   - Podés filtrar por tarjeta si querés.
3. Tocá **Siguiente** → **Añadir acción** → buscá **"Obtener contenido de URL"**.
4. Configurá la acción:
   - **URL:** `https://yvivibcczpirjzipuiqb.supabase.co/functions/v1/apple-pay-ingest`
   - Tocá **Mostrar más** → **Método:** `POST`
   - **Cuerpo de la solicitud:** `JSON`
   - Agregá estos campos:
     - `token` (Texto) → pegá tu token (lo ves en **Ajustes → Apple Pay** dentro de la app)
     - `amount` (Texto) → insertá la variable **Monto** de la transacción
     - `merchant` (Texto) → insertá la variable **Comercio / Nombre** de la transacción
5. Desactivá **"Preguntar antes de ejecutar"** para que sea 100% automático.
6. Guardá.

Desde ahí, cada compra con Apple Pay aparece en la **Bandeja** de la app. La revisás,
le ponés categoría y cuenta, y la aprobás con un toque.

---

## 4. Automatización B — Emails del banco (Gmail) 📧

Si tu banco te manda un correo por cada movimiento, este script gratuito de Gmail los
manda solos a la app.

### Pasos (una sola vez, en la compu):
1. Entrá a **https://script.google.com** → **Nuevo proyecto**.
2. Borrá el código que aparece y pegá esto:

```javascript
// CONFIG: pegá tu token (Ajustes → Apple Pay → token) y el remitente/asunto de tu banco
const TOKEN = 'PEGA_TU_TOKEN_AQUI';
const URL = 'https://yvivibcczpirjzipuiqb.supabase.co/functions/v1/email-ingest';
const BUSQUEDA = 'from:(tu-banco@correo.com) newer_than:1d'; // ajustá a tu banco

function revisarCorreos() {
  const hilos = GmailApp.search(BUSQUEDA);
  hilos.forEach(function (hilo) {
    hilo.getMessages().forEach(function (msg) {
      if (msg.isUnread() || !msg.isStarred()) {
        UrlFetchApp.fetch(URL, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({
            token: TOKEN,
            subject: msg.getSubject(),
            text: msg.getPlainBody().slice(0, 1500),
          }),
          muteHttpExceptions: true,
        });
        msg.star(); // marcado para no repetir
      }
    });
  });
}
```

3. Cambiá `TOKEN`, `URL` (ya está) y `BUSQUEDA` (el remitente de tu banco).
4. Arriba, **Ejecutar** una vez para autorizar permisos de Gmail.
5. Reloj (Activadores) → **Añadir activador** → función `revisarCorreos`,
   evento por tiempo, cada **5 o 10 minutos**. Guardá.

Listo: los movimientos de tus correos aparecen en la **Bandeja** automáticamente.

---

## 5. Activar el Asesor IA (opcional, gratis) ✨

1. Creá una clave gratis en **https://console.groq.com** → API Keys.
2. En **Supabase** → proyecto `finanzas-app` → **Edge Functions → Secrets**
   (o Project Settings → Functions) agregá un secret:
   - Nombre: `GROQ_API_KEY`
   - Valor: tu clave de Groq
3. Listo. En la app, **Consejos IA → Generar consejos**.

Sin esta clave, todo el resto de la app funciona igual.

---

## Datos técnicos

- **Frontend:** Vite + React (gratis, Vercel)
- **Backend/DB/Auth:** Supabase (PostgreSQL + RLS) — proyecto `finanzas-app`
- **IA:** Groq (`llama-3.1-8b-instant`) — gratis
- **Moneda:** PYG (Guaraníes)
- Todo el stack es **100% gratuito**.
