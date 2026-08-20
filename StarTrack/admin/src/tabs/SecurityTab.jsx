import { useEffect, useState } from 'react'
import { api } from '../api'

export default function SecurityTab({ toast, guard, onDevicesChanged, onStatsChanged, focus }) {
  const [anomalies, setAnomalies] = useState([])
  const [anomalyStatusFilter, setAnomalyStatusFilter] = useState('open')

  useEffect(() => {
    fetchAnomalies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anomalyStatusFilter])

  // Dashboard's "Open anomalies" Work Queue shortcut jumps here and wants
  // the Open filter re-applied even if this tab was left on something else.
  useEffect(() => {
    if (focus) setAnomalyStatusFilter('open')
  }, [focus])

  async function fetchAnomalies() {
    try {
      const data = await api.anomalies(anomalyStatusFilter)
      setAnomalies(data.anomalies || [])
    } catch (err) {
      toast.push('error', `Failed to load anomalies: ${err.message}`)
    }
  }

  async function handleAnomalyResolve(id, action) {
    await guard.run(`anomaly-${action}-${id}`, async () => {
      try {
        await api.resolveAnomaly(id, action)
        toast.push('success', action === 'dismiss' ? 'Anomaly dismissed' : 'Anomaly confirmed')
        fetchAnomalies()
        onStatsChanged()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  async function handleRevokeCheckin(id) {
    if (!window.confirm('Revoke the checkin behind this anomaly and claw back its score?')) return
    await guard.run(`anomaly-revoke-${id}`, async () => {
      try {
        await api.revokeAnomalyCheckin(id)
        toast.push('success', 'Checkin revoked')
        fetchAnomalies()
        onStatsChanged()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  async function handleDisableDevice(id) {
    if (!window.confirm('Disable the NFC device behind this anomaly?')) return
    await guard.run(`anomaly-disable-device-${id}`, async () => {
      try {
        await api.disableAnomalyDevice(id)
        toast.push('success', 'Device disabled')
        fetchAnomalies()
        onDevicesChanged()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  async function handleBanUserFromAnomaly(id) {
    if (!window.confirm('Ban the user behind this anomaly? They will be unable to log in.')) return
    await guard.run(`anomaly-ban-user-${id}`, async () => {
      try {
        await api.banAnomalyUser(id)
        toast.push('success', 'User banned')
        fetchAnomalies()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  return (
    <section className="section-grid">
      <div className="panel-card">
        <h2>Moderation & Security</h2>
        <p>Review the highest-risk check-in anomalies, suspicious velocity patterns, and audit history.</p>
      </div>
      <div className="admin-panel wide-panel">
        <div className="panel-header">
          <h3>Flagged Anomalies</h3>
          <button type="button" className="pill" onClick={fetchAnomalies} aria-label="Refresh anomalies">🔄 Refresh</button>
        </div>
        <div className="pill-list" style={{ marginBottom: 20 }}>
          {[{ key: 'open', label: 'Open' }, { key: 'dismissed', label: 'Dismissed' }, { key: 'confirmed', label: 'Confirmed' }, { key: '', label: 'All' }].map((opt) => (
            <button
              key={opt.key || 'all'}
              className={anomalyStatusFilter === opt.key ? 'pill active' : 'pill'}
              onClick={() => setAnomalyStatusFilter(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="anomalies-list">
          {anomalies.length === 0 && <p style={{ opacity: 0.6, fontSize: 13 }}>No anomalies in this view.</p>}
          {anomalies.map((item) => (
            <div key={item.id} className="anomaly-card">
              <div className="anomaly-header">
                <strong>{item.severity.toUpperCase()}</strong>
                <span className={`status-badge status-${item.status}`}>{item.status}</span>
              </div>
              <p>{item.description}</p>
              <div className="anomaly-details" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, margin: '12px 0', fontSize: 12, opacity: .8 }}>
                <span>User: #{item.user_id || '—'}</span>
                <span>Restaurant: #{item.restaurant_id || '—'}</span>
                <span>Check-in: #{item.checkin_id || '—'}</span>
                <span>Device: #{item.device_id || '—'}</span>
                <span>Created: {item.created_at ? new Date(item.created_at).toLocaleString() : '—'}</span>
              </div>
              {item.status === 'open' && (
                <div className="table-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={guard.isPending(`anomaly-dismiss-${item.id}`)}
                    onClick={() => handleAnomalyResolve(item.id, 'dismiss')}
                  >
                    {guard.isPending(`anomaly-dismiss-${item.id}`) ? '…' : 'Dismiss'}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={guard.isPending(`anomaly-confirm-${item.id}`)}
                    onClick={() => handleAnomalyResolve(item.id, 'confirm')}
                  >
                    {guard.isPending(`anomaly-confirm-${item.id}`) ? '…' : 'Confirm'}
                  </button>
                  {item.checkin_id && (
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={guard.isPending(`anomaly-revoke-${item.id}`)}
                      onClick={() => handleRevokeCheckin(item.id)}
                    >
                      {guard.isPending(`anomaly-revoke-${item.id}`) ? 'Revoking…' : 'Revoke Check-in'}
                    </button>
                  )}
                  {item.device_id && (
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={guard.isPending(`anomaly-disable-device-${item.id}`)}
                      onClick={() => handleDisableDevice(item.id)}
                    >
                      {guard.isPending(`anomaly-disable-device-${item.id}`) ? 'Disabling…' : 'Disable Device'}
                    </button>
                  )}
                  {item.user_id && (
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={guard.isPending(`anomaly-ban-user-${item.id}`)}
                      onClick={() => handleBanUserFromAnomaly(item.id)}
                    >
                      {guard.isPending(`anomaly-ban-user-${item.id}`) ? 'Banning…' : 'Ban User'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
