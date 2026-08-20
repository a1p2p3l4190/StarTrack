import ErrorBoundary from '../ErrorBoundary'
import { CheckinTrendChart, CityBreakdownChart } from '../DashboardCharts'

export default function DashboardTab({ stats, onRefreshStats, reportsCount, disabledDeviceCount, setTab, onOpenSecurity }) {
  return (
    <>
      <section className="section-grid">
        <div className="panel-card">
          <div className="panel-header" style={{ marginBottom: 0 }}>
            <h2 style={{ marginBottom: 0 }}>Operations Dashboard</h2>
            <button type="button" className="pill" onClick={onRefreshStats} aria-label="Refresh dashboard statistics">🔄 Refresh Data</button>
          </div>
          <p>System-wide totals across check-ins, members, and fraud signals.</p>
        </div>
        {!stats && (
          <>
            <div className="stat-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-row" style={{ height: 78, borderRadius: 20 }} role="status" aria-label="Loading statistics" />
              ))}
            </div>
            <div className="chart-grid">
              <div className="skeleton-row" style={{ height: 240 }} role="status" aria-label="Loading chart" />
              <div className="skeleton-row" style={{ height: 240 }} role="status" aria-label="Loading chart" />
            </div>
          </>
        )}
        {stats && (
          <>
            <div className="stat-grid">
              <div className="stat-tile">
                <span className="stat-label">Total Check-ins</span>
                <span className="stat-value">{stats.total_checkins}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-label">Verified Check-ins</span>
                <span className="stat-value">{stats.verified_checkins}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-label">Members</span>
                <span className="stat-value">{stats.total_users}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-label">Active Members</span>
                <span className="stat-value">{stats.active_users}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-label">Open Anomalies</span>
                <span className="stat-value">{stats.open_anomalies}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-label">Anomaly Rate</span>
                <span className="stat-value">{stats.anomaly_rate.toFixed(1)}%</span>
              </div>
            </div>
            <div className="chart-grid">
              <div className="admin-panel">
                <div className="panel-header">
                  <h3>Check-in Trend (Last 7 Days)</h3>
                </div>
                <ErrorBoundary resetKey={JSON.stringify(stats.daily_trend)}>
                  <CheckinTrendChart data={stats.daily_trend || []} />
                </ErrorBoundary>
              </div>
              <div className="admin-panel">
                <div className="panel-header">
                  <h3>Verified Check-ins by City</h3>
                </div>
                <ErrorBoundary resetKey={JSON.stringify(stats.city_breakdown)}>
                  <CityBreakdownChart data={stats.city_breakdown || []} />
                </ErrorBoundary>
              </div>
            </div>

            <div className="admin-panel wide-panel">
              <div className="panel-header">
                <h3>Top 5 Restaurants by Verified Check-ins</h3>
              </div>
              <ErrorBoundary resetKey={JSON.stringify(stats.top_restaurants)}>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Restaurant</th>
                        <th>Verified Check-ins</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.top_restaurants || []).length === 0 && (
                        <tr><td colSpan={2} style={{ opacity: 0.6 }}>No verified check-ins yet.</td></tr>
                      )}
                      {(stats.top_restaurants || []).map((r) => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>{r.verified_checkins}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ErrorBoundary>
            </div>
          </>
        )}
      </section>

      {stats && (
        <section className="admin-panel wide-panel" style={{ marginBottom: 20 }}>
          <div className="panel-header"><h3>Work Queue</h3><span className="field-hint">Next actions for the admin team</span></div>
          <div className="stat-grid">
            <button type="button" className="stat-tile" onClick={onOpenSecurity}><span className="stat-label">Open anomalies</span><span className="stat-value">{stats.open_anomalies || 0}</span><span className="field-hint">Review now →</span></button>
            <button type="button" className="stat-tile" onClick={() => setTab('reports')}><span className="stat-label">Pending reports</span><span className="stat-value">{reportsCount}</span><span className="field-hint">Moderate now →</span></button>
            <button type="button" className="stat-tile" onClick={() => setTab('devices')}><span className="stat-label">Disabled devices</span><span className="stat-value">{disabledDeviceCount}</span><span className="field-hint">Manage devices →</span></button>
          </div>
        </section>
      )}
    </>
  )
}
