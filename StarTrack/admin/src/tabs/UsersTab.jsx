import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { RestaurantSelect, SkeletonStack, SortableTh, StatusBadge } from '../lib/ui'
import { toggleSort } from '../lib/utils'

const USER_PAGE_SIZE = 20

export default function UsersTab({ restaurants, toast, guard, onStatsChanged, focus }) {
  const [userSearch, setUserSearch] = useState('')
  const [userPage, setUserPage] = useState(1)
  const [userSort, setUserSort] = useState({ key: 'created_at', dir: 'desc' })
  const [usersTotal, setUsersTotal] = useState(0)
  const [users, setUsers] = useState([])
  const [selectedUserIds, setSelectedUserIds] = useState(new Set())
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedUserHistory, setSelectedUserHistory] = useState(null)
  const [manualVerifyForm, setManualVerifyForm] = useState({ restaurant_id: null, note: '' })

  useEffect(() => {
    const t = setTimeout(() => fetchUsers(), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSearch, userPage, userSort])

  // Selection is page-scoped (bulkBanUsers only acts on rows in the
  // currently loaded page), so clear it whenever the page/search/sort
  // changes underneath it rather than leaving stale, invisible selections.
  useEffect(() => {
    setSelectedUserIds(new Set())
  }, [userPage, userSearch, userSort])

  // Global search bar jumps here with a specific user to open history for.
  useEffect(() => {
    if (focus) openUserHistory(focus.user)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce])

  async function fetchUsers() {
    try {
      const params = { limit: USER_PAGE_SIZE, page: userPage, sort: userSort.key, order: userSort.dir }
      if (userSearch) params.search = userSearch
      const data = await api.users(params)
      setUsers(data.users || [])
      setUsersTotal(data.total || 0)
    } catch (err) {
      toast.push('error', `Failed to load users: ${err.message}`)
    }
  }

  const userTotalPages = Math.max(1, Math.ceil(usersTotal / USER_PAGE_SIZE))

  const manualVerifyMatch = useMemo(
    () => restaurants.find((r) => r.id === manualVerifyForm.restaurant_id),
    [restaurants, manualVerifyForm.restaurant_id]
  )

  async function openUserHistory(user) {
    setSelectedUserId(user.id)
    setSelectedUserHistory(null)
    try {
      const data = await api.userHistory(user.id)
      setSelectedUserHistory(data)
    } catch (err) {
      toast.push('error', err.message)
    }
  }

  async function bulkBanUsers() {
    const selected = users.filter((user) => selectedUserIds.has(user.id))
    const skippedAdmins = selected.filter((user) => user.role === 'admin')
    const targets = selected.filter((user) => user.role !== 'admin' && !user.banned)
    const ids = targets.map((user) => user.id)
    if (!ids.length) return
    if (!window.confirm(`Ban ${ids.length} selected user${ids.length === 1 ? '' : 's'}? Admin accounts and already banned users will be skipped.`)) return
    const results = await Promise.allSettled(ids.map((id) => api.banUser(id)))
    const failed = results.filter((result) => result.status === 'rejected').length
    try {
      setSelectedUserIds(new Set())
      const succeeded = ids.length - failed
      toast.push(failed ? 'error' : 'success', `${succeeded} banned, ${failed} failed${skippedAdmins.length ? `, ${skippedAdmins.length} admin skipped` : ''}`)
      fetchUsers()
    } catch (err) {
      toast.push('error', `Could not refresh users: ${err.message}`)
    }
  }

  async function handleBanToggle(user) {
    if (!user.banned && !window.confirm(`Ban ${user.display_name}? They will be unable to log in.`)) return
    await guard.run(`user-ban-${user.id}`, async () => {
      try {
        if (user.banned) await api.unbanUser(user.id)
        else await api.banUser(user.id)
        toast.push('success', user.banned ? 'User unbanned' : 'User banned')
        fetchUsers()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  async function submitManualVerify(e) {
    e.preventDefault()
    if (!selectedUserId || !manualVerifyMatch) {
      toast.push('error', 'Pick a restaurant first')
      return
    }
    await guard.run('manual-verify-form', async () => {
      try {
        const data = await api.manualVerify({ user_id: selectedUserId, restaurant_id: manualVerifyMatch.id, note: manualVerifyForm.note })
        toast.push('success', data.new_badges?.length ? `Checkin added — ${data.new_badges.length} new badge(s) unlocked` : 'Checkin added')
        setManualVerifyForm({ restaurant_id: null, note: '' })
        openUserHistory({ id: selectedUserId })
        onStatsChanged()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  return (
    <section className="section-grid">
      <div className="panel-card">
        <h2>User Management</h2>
        <p>Search members, review their check-in history, and manually back-fill a verified visit when a physical NFC tap fails.</p>
      </div>
      <div className="admin-panel wide-panel">
        <div className="panel-header">
          <h3>Members</h3>
        </div>
        <label style={{ marginBottom: 16, display: 'block' }}>
          Search
          <input value={userSearch} onChange={(e) => { setUserSearch(e.target.value); setUserPage(1) }} placeholder="Search by email or name" />
        </label>
        {selectedUserIds.size > 0 && (
          <div className="panel-header" style={{ marginBottom: 12 }}>
            <span>{selectedUserIds.size} selected on this page</span>
            <button type="button" className="icon-btn" onClick={bulkBanUsers}>Ban Selected Users</button>
          </div>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Select all visible users" checked={users.length > 0 && users.every((u) => selectedUserIds.has(u.id))} onChange={(e) => setSelectedUserIds((prev) => { const next = new Set(prev); users.forEach((u) => e.target.checked ? next.add(u.id) : next.delete(u.id)); return next })} /></th>
                <th>ID</th>
                <SortableTh label="Name" sortKey="display_name" sort={userSort} onSort={(key) => { setUserSort((s) => toggleSort(s, key)); setUserPage(1) }} />
                <SortableTh label="Email" sortKey="email" sort={userSort} onSort={(key) => { setUserSort((s) => toggleSort(s, key)); setUserPage(1) }} />
                <th>Role</th>
                <SortableTh label="Region" sortKey="region" sort={userSort} onSort={(key) => { setUserSort((s) => toggleSort(s, key)); setUserPage(1) }} />
                <SortableTh label="Score" sortKey="score" sort={userSort} onSort={(key) => { setUserSort((s) => toggleSort(s, key)); setUserPage(1) }} />
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && <tr><td colSpan={9} style={{ opacity: 0.6 }}>No users found.</td></tr>}
              {users.map((u) => (
                <tr key={u.id}>
                  <td><input type="checkbox" aria-label={`Select ${u.display_name}`} checked={selectedUserIds.has(u.id)} onChange={(e) => setSelectedUserIds((prev) => { const next = new Set(prev); e.target.checked ? next.add(u.id) : next.delete(u.id); return next })} /></td>
                  <td>{u.id}</td>
                  <td>{u.display_name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{u.region}</td>
                  <td>{u.score}</td>
                  <td><StatusBadge active={!u.banned} activeLabel="Active" inactiveLabel="Banned" /></td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="icon-btn" onClick={() => openUserHistory(u)}>History</button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={guard.isPending(`user-ban-${u.id}`)}
                        onClick={() => handleBanToggle(u)}
                      >
                        {guard.isPending(`user-ban-${u.id}`) ? '…' : u.banned ? 'Unban' : 'Ban'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination-row">
          <span>{usersTotal} user{usersTotal === 1 ? '' : 's'}</span>
          <div className="pagination-buttons">
            <button type="button" className="icon-btn" disabled={userPage <= 1} onClick={() => setUserPage((p) => p - 1)}>Prev</button>
            <span>Page {userPage} / {userTotalPages}</span>
            <button type="button" className="icon-btn" disabled={userPage >= userTotalPages} onClick={() => setUserPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </div>

      {selectedUserId && (
        <>
          <div onClick={() => setSelectedUserId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.48)', zIndex: 20 }} />
          <div className="admin-panel" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(560px, 92vw)', maxWidth: '100%', overflowY: 'auto', zIndex: 21, borderRadius: 0, padding: 24, boxShadow: '-12px 0 30px rgba(0,0,0,0.35)' }}>
          <div className="panel-header">
            <h3>Member Details{selectedUserHistory ? ` — ${selectedUserHistory.user.display_name}` : ''}</h3>
            <button type="button" className="icon-btn" onClick={() => setSelectedUserId(null)}>Close</button>
          </div>
          {!selectedUserHistory && <SkeletonStack count={4} height={44} />}
          {selectedUserHistory && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Restaurant</th>
                    <th>Verified</th>
                    <th>Revoked</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedUserHistory.checkins || []).length === 0 && (
                    <tr><td colSpan={4} style={{ opacity: 0.6 }}>No check-ins yet.</td></tr>
                  )}
                  {(selectedUserHistory.checkins || []).map((ci) => (
                    <tr key={ci.id}>
                      <td>{ci.restaurant?.name || `#${ci.restaurant_id}`}</td>
                      <td>{ci.verified ? 'Yes' : 'No'}</td>
                      <td>{ci.revoked ? 'Yes' : 'No'}</td>
                      <td>{new Date(ci.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="form-card" style={{ marginTop: 20 }}>
            <h3>Manual Check-in Override</h3>
            <p style={{ fontSize: 13, opacity: 0.75, marginTop: -8 }}>
              Use when a customer's physical NFC tap failed but they have other proof of dining (e.g. a receipt).
            </p>
            <form onSubmit={submitManualVerify} className="admin-form">
              <RestaurantSelect
                label="Restaurant"
                value={manualVerifyForm.restaurant_id}
                onChange={(id) => setManualVerifyForm({ ...manualVerifyForm, restaurant_id: id })}
                restaurants={restaurants}
                placeholder="Select a restaurant"
              />
              <label>
                Note (optional)
                <input
                  value={manualVerifyForm.note}
                  onChange={(e) => setManualVerifyForm({ ...manualVerifyForm, note: e.target.value })}
                  placeholder="e.g. receipt #1234 confirmed by support"
                />
              </label>
              <button type="submit" disabled={!manualVerifyMatch || guard.isPending('manual-verify-form')}>
                {guard.isPending('manual-verify-form') ? 'Saving…' : 'Add Verified Check-in'}
              </button>
            </form>
          </div>
          </div>
        </>
      )}
    </section>
  )
}
