import { useEffect, useState } from 'react'
import { api } from '../api'
import { SortableTh } from '../lib/ui'
import { toggleSort } from '../lib/utils'

const AUDIT_PAGE_SIZE = 20

export default function AuditTab({ toast }) {
  const [auditSearch, setAuditSearch] = useState('')
  const [auditPage, setAuditPage] = useState(1)
  const [auditSort, setAuditSort] = useState({ key: 'created_at', dir: 'desc' })
  const [auditLogsTotal, setAuditLogsTotal] = useState(0)
  const [auditLogs, setAuditLogs] = useState([])

  useEffect(() => {
    const t = setTimeout(() => fetchAuditLogs(), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditSearch, auditPage, auditSort])

  async function fetchAuditLogs() {
    try {
      const params = { limit: AUDIT_PAGE_SIZE, page: auditPage, sort: auditSort.key, order: auditSort.dir }
      if (auditSearch) params.search = auditSearch
      const data = await api.auditLogs(params)
      setAuditLogs(data.audit_logs || [])
      setAuditLogsTotal(data.total || 0)
    } catch (err) {
      toast.push('error', `Failed to load audit log: ${err.message}`)
    }
  }

  const auditTotalPages = Math.max(1, Math.ceil(auditLogsTotal / AUDIT_PAGE_SIZE))

  return (
    <section className="section-grid">
      <div className="panel-card">
        <h2>Audit Log</h2>
        <p>Every sensitive admin action — deletes, bans, manual overrides, device status changes, anomaly resolutions — with who did it, when, and from where.</p>
      </div>
      <div className="admin-panel wide-panel">
        <div className="panel-header">
          <h3>Recent Activity</h3>
          <button type="button" className="pill" onClick={fetchAuditLogs} aria-label="Refresh audit log">🔄 Refresh</button>
        </div>
        <label style={{ marginBottom: 16, display: 'block' }}>
          Search
          <input
            value={auditSearch}
            onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1) }}
            placeholder="Search by admin, action, target type, or detail"
          />
        </label>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <SortableTh label="Time" sortKey="created_at" sort={auditSort} onSort={(key) => { setAuditSort((s) => toggleSort(s, key)); setAuditPage(1) }} />
                <SortableTh label="Admin" sortKey="admin_email" sort={auditSort} onSort={(key) => { setAuditSort((s) => toggleSort(s, key)); setAuditPage(1) }} />
                <SortableTh label="Action" sortKey="action" sort={auditSort} onSort={(key) => { setAuditSort((s) => toggleSort(s, key)); setAuditPage(1) }} />
                <SortableTh label="Target" sortKey="target_type" sort={auditSort} onSort={(key) => { setAuditSort((s) => toggleSort(s, key)); setAuditPage(1) }} />
                <th>Detail</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 && (
                <tr><td colSpan={6} style={{ opacity: 0.6 }}>No admin actions recorded yet.</td></tr>
              )}
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td>{log.admin_email || `#${log.admin_id}`}</td>
                  <td>{log.action}</td>
                  <td>{log.target_type ? `${log.target_type}${log.target_id ? ` #${log.target_id}` : ''}` : '—'}</td>
                  <td>{log.detail || '—'}</td>
                  <td>{log.ip_address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination-row">
          <span>{auditLogsTotal} event{auditLogsTotal === 1 ? '' : 's'}</span>
          <div className="pagination-buttons">
            <button type="button" className="icon-btn" disabled={auditPage <= 1} onClick={() => setAuditPage((p) => p - 1)}>Prev</button>
            <span>Page {auditPage} / {auditTotalPages}</span>
            <button type="button" className="icon-btn" disabled={auditPage >= auditTotalPages} onClick={() => setAuditPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </div>
    </section>
  )
}
