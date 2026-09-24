# Mi Billetera CR 🇨🇷

App de administración financiera personal y familiar, en **Guaraníes (₲)**, con diseño basado en la bandera de Costa Rica en modo oscuro.

**En vivo:** https://finanzas-app-favila-code.vercel.app
**Repo:** github.com/favilacode-spec/finanzas-app · **Backend:** Supabase `finanzas-app`

## Funciones
- 👥 **Hogar compartido**: vos y tu pareja, cada uno con su usuario, viendo las mismas finanzas (código de invitación).
- 🏦 **Múltiples cuentas**: agregá cada banco/billetera por separado (efectivo, corriente, ahorros, tarjeta, inversión, préstamo). Vista total y por cuenta.
- 💸 **Movimientos**: ingresos, gastos y transferencias, con categorías, comercio, notas y filtros.
- 🥧 **Presupuestos** mensuales por categoría con alertas de exceso.
- 🎯 **Metas de ahorro** con progreso.
- 🔁 **Recurrentes** (suscripciones, alquiler, salario).
- 📊 **Reportes** con gráficos y exportación a CSV.
- 📥 **Bandeja automática**: gastos de **Apple Pay** y **emails del banco** entran solos para aprobar.
- 🧾 **Pagos y suscripciones**: el próximo vencimiento primero, avisos push (8:00), "Marcar pagado" / "Saltar", costo real anual.
- 📅 **Calendario** mensual (pasado y futuro) + **suscripción ICS** para Google Calendar / Apple Calendar.
- 💳 **Tarjetas de crédito**: día de cierre y vencimiento, ciclo actual, disponible, pagar tarjeta.
- 🎯 **Metas con foto**, asistente (cuánto ahorrar por mes), historial de aportes, cuenta vinculada.
- 🥧 **Presupuestos** con arrastre, recargas, traspasos, rebalanceo e historial de 12 meses.
- ⚡ **Carga rápida** en lenguaje natural ("café 15 mil ueno"), atajos, link para el doble toque del iPhone.
- 📎 Tickets adjuntos, #etiquetas, subcategorías, edición masiva, reportes de patrimonio / comercios / proyección, PDF y copia de seguridad.
- ✨ **Asesor IA** (Groq, gratis) con consejos personalizados.

## Stack (100% gratis)
- Frontend: Vite + React + Recharts
- Backend/DB/Auth: Supabase (PostgreSQL + RLS + Edge Functions + Storage + pg_cron)
- IA: Groq · Deploy: Vercel

## Desarrollo local
```bash
npm install
npm run dev
```
Variables en `.env` (ver `.env.example`).

## Automatización y uso
Ver **INSTRUCCIONES.md**.
