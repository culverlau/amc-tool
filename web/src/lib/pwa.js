// Environment detection + install/push helpers for the PWA.

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

export function platform() {
  const ua = navigator.userAgent
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  const isIpadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/.test(ua) || isIpadOs) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

/** True for real Safari on iOS — the only iOS browser that can add to Home Screen
 * with a working push-capable PWA (Chrome/Firefox/in-app browsers can't). */
export function isIosSafari() {
  if (platform() !== 'ios') return false
  const ua = navigator.userAgent
  return !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line\//.test(ua)
}

export function isMobile() {
  return platform() !== 'desktop'
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// --- Android/desktop Chrome "install" prompt, captured so any button can trigger it.
let deferredPrompt = null
const listeners = new Set()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    listeners.forEach((fn) => fn())
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    listeners.forEach((fn) => fn())
  })
}

export function canPromptInstall() {
  return deferredPrompt !== null
}

export function onInstallStateChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function promptInstall() {
  if (!deferredPrompt) return false
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  listeners.forEach((fn) => fn())
  return outcome === 'accepted'
}

export function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function getPushSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

/** Must be called from a user gesture (iOS requirement). Returns the PushSubscription. */
export async function subscribeToPush() {
  if (!VAPID_PUBLIC_KEY) throw new Error('Push is not configured (missing VITE_VAPID_PUBLIC_KEY).')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('permission-denied')
  const reg = await navigator.serviceWorker.ready
  return (
    (await reg.pushManager.getSubscription()) ||
    reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  )
}

export async function showLocalTestNotification() {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('Notifications are working', {
    body: "You'll get a message like this when a seat opens up.",
    icon: '/icons/icon-192.png',
    data: { url: '/#settings' },
  })
}

// localStorage helpers that never throw (private mode, blocked storage).
export function lsGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
export function lsSet(key, value) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}
