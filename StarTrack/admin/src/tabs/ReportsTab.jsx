import { api } from '../api'
import { StatusBadge } from '../lib/ui'

export default function ReportsTab({ reports, onReportsChanged, toast, guard }) {
  async function handleReportAction(reportId, action) {
    await guard.run(`report-${action}-${reportId}`, async () => {
      try {
        await api.resolveReport(reportId, { action })
        toast.push('success', action === 'dismiss' ? 'Report dismissed' : 'Review deleted')
        onReportsChanged()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  return (
    <section className="section-grid">
      <div className="panel-card">
        <h2>Review Reports</h2>
        <p>Moderation queue for user-submitted complaints about reviews that may be spam, abusive, or otherwise inappropriate.</p>
      </div>
      <div className="admin-panel wide-panel">
        <div className="panel-header">
          <h3>Open Report Queue</h3>
          <button type="button" className="pill" onClick={onReportsChanged} aria-label="Refresh reports">🔄 Refresh</button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Review</th>
                <th>Reporter</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Created</th>
                <th>Details</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 && (
                <tr><td colSpan={8} style={{ opacity: 0.6 }}>No review reports queued.</td></tr>
              )}
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>#{report.id}</td>
                  <td>Review #{report.review_id}</td>
                  <td>User #{report.user_id}</td>
                  <td>{report.reason}</td>
                  <td><StatusBadge active={report.status === 'open'} activeLabel="Open" inactiveLabel={report.status || 'Closed'} /></td>
                  <td>{new Date(report.created_at).toLocaleString()}</td>
                  <td>{report.details || '—'}</td>
                  <td>
                    {report.status === 'open' && (
                      <div className="table-actions">
                        <button type="button" className="icon-btn" disabled={guard.isPending(`report-dismiss-${report.id}`)} onClick={() => handleReportAction(report.id, 'dismiss')} title="Dismiss this report as false positive">{guard.isPending(`report-dismiss-${report.id}`) ? '…' : 'Dismiss'}</button>
                        <button type="button" className="icon-btn" disabled={guard.isPending(`report-delete_review-${report.id}`)} onClick={() => { if (window.confirm('Delete the flagged review? This cannot be undone.')) { handleReportAction(report.id, 'delete_review') } }} title="Delete the flagged review and mark report resolved">{guard.isPending(`report-delete_review-${report.id}`) ? 'Deleting…' : 'Delete Review'}</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
