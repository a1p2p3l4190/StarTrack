import { useState } from 'react'
import { api, setToken } from './api'

export default function LoginPanel({ onAuthenticated }) {
  const [email, setEmail] = useState('admin@startrack.app')
  const [password, setPassword] = useState('StarTrack123!')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.login({ email, password })
      if (data.user.role !== 'admin') {
        throw new Error('This account does not have admin access.')
      }
      setToken(data.token)
      onAuthenticated(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-shell" style={{ maxWidth: 420, paddingTop: 120 }}>
      <div className="panel-card">
        <h1>StarTrack Admin</h1>
        <p>Sign in with an admin account to manage restaurants, NFC inventory, and security review.</p>
      </div>
      <div className="form-card" style={{ marginTop: 24 }}>
        <form onSubmit={submit} className="admin-form">
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
          </label>
          {error ? <p style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</p> : null}
          <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>
        <p style={{ fontSize: 12, opacity: 0.6, marginTop: 12 }}>Demo login: admin@startrack.app / StarTrack123!</p>
      </div>
    </div>
  )
}
