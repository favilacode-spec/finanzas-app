import { supabase } from './supabase'

const VAPID_PUBLIC = 'BBGayW5ZN97Cibwdur2NtGG97G8CpLHST9XbQ1xntwnEHCbch_CQD3gBSQKKixpUPePm9-tzVKVguEMAJxQNZ7I'

function urlB64ToUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function pushSoportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function pushActivo() {
  if (!pushSoportado()) return false
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return !!sub && Notification.permission === 'granted'
}

// Pide permiso, se suscribe y guarda la suscripción
export async function activarPush(householdId, userId) {
  if (!pushSoportado()) throw new Error('Tu navegador no soporta notificaciones. En iPhone hay que agregar la app a la pantalla de inicio primero.')
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('No diste permiso para notificaciones.')

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(VAPID_PUBLIC),
    })
  }
  const j = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    household_id: householdId, user_id: userId,
    endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
  }, { onConflict: 'endpoint' })
  if (error) throw error
  return true
}

export async function desactivarPush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  return true
}
