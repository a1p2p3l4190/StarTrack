import { useState } from 'react'

// Toast notifications replace the old single status banner so success and
// error feedback can stack and auto-dismiss instead of overwriting itself.
export function useToasts() {
  const [toasts, setToasts] = useState([])
  function push(type, message) {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, type, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }
  function dismiss(id) {
    setToasts((t) => t.filter((x) => x.id !== id))
  }
  return { toasts, push, dismiss }
}

// Tracks in-flight async actions by an arbitrary string key, so a button can
// disable itself (and only itself) while its own request is outstanding —
// guards against double-submits from a slow network + an impatient click.
export function useActionGuard() {
  const [pending, setPending] = useState(() => new Set())
  async function run(key, fn) {
    if (pending.has(key)) return
    setPending((p) => new Set(p).add(key))
    try {
      await fn()
    } finally {
      setPending((p) => {
        const next = new Set(p)
        next.delete(key)
        return next
      })
    }
  }
  function isPending(key) {
    return pending.has(key)
  }
  return { run, isPending }
}
