import { useEffect } from 'react'

// Aviso global de "cambiaron los datos" para que cada pantalla se recargue
export function notifyChange() { window.dispatchEvent(new Event('mb:changed')) }
export function useOnChange(fn) {
  useEffect(() => {
    const h = () => fn()
    window.addEventListener('mb:changed', h)
    return () => window.removeEventListener('mb:changed', h)
  }) // se re-suscribe con el fn más nuevo
}
