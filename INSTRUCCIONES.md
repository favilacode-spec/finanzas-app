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
   - Agregá **dos campos** (botón "Añadir campo"):
     - `token` (Texto) → pegá tu token (lo ves en **Ajustes → Apple Pay** dentro de la app)
     - `text` (Texto) → tocá el campo y, en la barra de variables de arriba del teclado,
       insertá la **única variable disponible: "Transacción"** (también puede aparecer como
       "Atajo de entrada"). No busques una variable "Monto": no existe. Con la variable
       "Transacción" alcanza — la app le saca el monto automáticamente.
5. Desactivá **"Preguntar antes de ejecutar"** para que sea 100% automático.
6. Guardá.

Desde ahí, cada compra con Apple Pay aparece en la **Bandeja** de la app con el monto ya
detectado. La revisás, le ponés categoría y cuenta, y la aprobás con un toque.

### ¿Y el nombre del comercio donde compré?

La variable **"Transacción"** ya trae el nombre del comercio adentro, así que al mandarla
en el campo `text` la app **intenta detectar el comercio automáticamente** y lo muestra en
la Bandeja. Si en algún gasto no lo detecta bien, lo escribís a mano al aprobarlo (toma 2 seg).

**Para que el comercio llegue siempre perfecto** (opcional, recomendado):
1. En la misma acción "Obtener contenido de URL", agregá un **tercer campo**: `merchant` (Texto).
2. Tocá ese campo e insertá la variable **"Transacción"**.
3. Tocá la variable ya insertada → se abre un menú → elegí la propiedad **"Comerciante"**
   (o "Merchant" / "Nombre del comercio").
   - Si tu iPhone no muestra esa opción, no pasa nada: dejá solo `token` y `text`,
     y la app igual saca el comercio del texto.

Resumen de campos del JSON: `token`, `text` (variable Transacción) y, si podés, `merchant`
(propiedad Comerciante de la Transacción).

---

## 4. Automatización B — Emails del banco (Gmail) 📧

Si tu banco te manda un correo por cada movimiento, este script gratuito de Gmail los
manda solos a la app.

### Pasos (una sola vez, en la compu):
1. Entrá a **https://script.google.com** → **Nuevo proyecto**.
2. Se abre un archivo llamado **`Código.gs`** (a la izquierda). Ahí va el código:
   seleccioná todo lo que haya dentro (Ctrl+A o Cmd+A) y borralo. Si aparece vacío,
   no importa. Pegá esto en `Código.gs`:

```javascript
// CONFIG: pegá tu token (Ajustes → Apple Pay → token) y el remitente/asunto de tu banco
const TOKEN = 'PEGA_TU_TOKEN_AQUI';
const URL = 'https://yvivibcczpirjzipuiqb.supabase.co/functions/v1/email-ingest';
// UENO Bank — captura los 3 tipos de correo:
//   "Recibiste una transferencia"               => INGRESO
//   "Pago de servicio" / "Pagaste tu servicio"  => GASTO
//   "Transferencia realizada"                   => GASTO (enviada)
const BUSQUEDA = 'from:(algoueno@ueno.com.py) ("Recibiste una transferencia" OR "Pago de servicio" OR "Pagaste tu servicio" OR "Transferencia realizada" OR "Enviamos tu transferencia") newer_than:2d';

function revisarCorreos() {
  const hilos = GmailApp.search(BUSQUEDA);
  hilos.forEach(function (hilo) {
    hilo.getMessages().forEach(function (msg) {
      if (msg.isStarred()) return; // ya procesado correctamente
      const resp = UrlFetchApp.fetch(URL, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          token: TOKEN,
          subject: msg.getSubject(),
          text: msg.getPlainBody().slice(0, 6000),
        }),
        muteHttpExceptions: true,
      });
      // Solo marca la estrella si entró bien (200). Si falla, lo reintenta luego.
      if (resp.getResponseCode() === 200) msg.star();
    });
  });
}
```

3. Cambiá solo el `TOKEN` (la `URL` y la `BUSQUEDA` ya están listas para UENO + ANDE/Claro).
4. Arriba, **Ejecutar** una vez para autorizar permisos de Gmail.
5. Reloj (Activadores) → **Añadir activador** → función `revisarCorreos`,
   evento por tiempo, cada **5 o 10 minutos**. Guardá.

Listo. Por el correo de UENO entran a la **Bandeja** los 3 tipos, con monto, fecha y nombre:
- **Transferencias recibidas** → **ingreso** (nombre del cliente que te envió).
- **Pagos de servicios** (ANDE, Claro, etc.) → **gasto** (nombre de la empresa).
- **Transferencias realizadas/enviadas** → **gasto** (nombre del beneficiario).
- **Transferencias entre tus propias cuentas** (cuando el remitente o beneficiario sos vos,
  JOSE FABIAN AVILA SANCHO) → **transferencia interna**: en la Bandeja elegís de qué cuenta
  salió y a qué cuenta entró (no cuenta como ingreso ni gasto).

Las compras con tarjeta NO entran por acá (esas ya las trae Apple Pay), así que **no se
duplica nada**. Además, si el mismo correo se procesa dos veces, la app lo detecta por el
N° de transacción y **no lo duplica**. En la Bandeja cada movimiento ya viene marcado como
Ingreso o Gasto (lo podés cambiar antes de aprobar).

> ✅ Remitente de UENO ya configurado: `algoueno@ueno.com.py`. Si algún pago de servicio
> no aparece, es por las palabras clave: pasame el asunto del correo que te llegó y agrego
> esa palabra a la búsqueda.

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
