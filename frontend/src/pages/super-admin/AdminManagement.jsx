import { useState, useEffect } from 'react'
import { Users, Plus, Lock, Unlock, Trash2, Send, Wifi, Search, X } from 'lucide-react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../services/firebase'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import api from '../../services/api'
import toast from 'react-hot-toast'
import useAuthStore from '../../store/useAuthStore'

function AdminManagement() {
  const { role } = useAuthStore()
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '' })
  const [inviting, setInviting] = useState(false)
  const [onlineAdmins, setOnlineAdmins] = useState([])
  const [search, setSearch] = useState('')

  useEffect(function() {
    const unsub = onSnapshot(
      collection(db, 'admins'),
      function(snap) {
        setAdmins(snap.docs.map(function(d) {
          return { id: d.id, ...d.data() }
        }))
        setLoading(false)
      }
    )
    return unsub
  }, [])

  async function handleInvite() {
    if (!inviteForm.email || !inviteForm.full_name) {
      toast.error('Please fill in all fields')
      return
    }
    setInviting(true)
    try {
      await api.post('/api/admins/invite', {
        email: inviteForm.email,
        full_name: inviteForm.full_name,
        role: 'platform_admin'
      })
      toast.success('Invitation sent to ' + inviteForm.email)
      setShowInviteModal(false)
      setInviteForm({ email: '', full_name: '' })
    } catch(e) {
      toast.error(e.response?.data?.detail || 'Failed to send invitation')
    } finally {
      setInviting(false)
    }
  }

  async function handleLock(adminId, email) {
    try {
      await api.post('/api/admins/' + adminId + '/lock')
      toast.success(email + ' locked')
    } catch(e) {
      toast.error('Failed to lock account')
    }
  }

  async function handleUnlock(adminId, email) {
    try {
      await api.post('/api/admins/' + adminId + '/unlock')
      toast.success(email + ' unlocked')
    } catch(e) {
      toast.error('Failed to unlock account')
    }
  }

  async function handleDelete(adminId, email, role) {
    if (role === 'super_admin') {
      toast.error('Cannot delete Super Admin')
      return
    }
    if (!window.confirm('Delete ' + email + '?')) return
    try {
      await api.delete('/api/admins/' + adminId)
      toast.success(email + ' deleted')
    } catch(e) {
      toast.error('Failed to delete admin')
    }
  }

  // Also fetch online admins
  useEffect(function() {
  fetchOnlineAdmins()
  const interval = setInterval(fetchOnlineAdmins, 30000)
  return function() { 
  clearInterval(interval)
  }
}, [])

async function fetchOnlineAdmins() {
  try {
    const res = await api.get('/api/admins/online')
    setOnlineAdmins(res.data.data || [])
  } catch(e) {
    console.error('Online admins error:', e)
  }
}

  const roleColor = {
    super_admin: '#A78BFA',
    platform_admin: '#6366F1',
    org_admin: '#34D399'
  }

  const roleLabel = {
    super_admin: 'Super Admin',
    platform_admin: 'Platform Admin',
    org_admin: 'Org Admin'
  }

  const counts = {
    super: admins.filter(function(a) { return a.role === 'super_admin' }).length,
    platform: admins.filter(function(a) { return a.role === 'platform_admin' }).length,
    org: admins.filter(function(a) { return a.role === 'org_admin' }).length
  }

  const filteredAdmins = admins.filter(function(a) {
    const s = search.toLowerCase()
    return (
      a.full_name?.toLowerCase().includes(s) ||
      a.email?.toLowerCase().includes(s) ||
      (a.org_code || '').toLowerCase().includes(s) ||
      (a.role || '').toLowerCase().includes(s)
    )
  })

  return (
    <Layout>
      <TopBar title="Admin Management" />

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Super Admins', value: counts.super, color: '#A78BFA' },
          { label: 'Platform Admins', value: counts.platform, color: '#6366F1' },
          { label: 'Org Admins', value: counts.org, color: '#34D399' }
        ].map(function(item) {
          return (
            <div key={item.label} className="stat-card">
              <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {item.label}
              </p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: item.color, fontFamily: 'Syne, sans-serif' }}>
                {item.value}
              </p>
            </div>
          )
        })}
      </div>

{/* Online Admins Panel */}
{onlineAdmins.length > 0 && (
  <div className="card" style={{ marginBottom: '16px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
      <Wifi size={16} color="var(--success)" />
      <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
        Online Now
      </p>
      <span style={{
        fontSize: '11px', fontWeight: '600',
        background: 'rgba(52,211,153,0.12)',
        color: 'var(--success)',
        padding: '2px 8px', borderRadius: '999px'
      }}>
        {onlineAdmins.length}
      </span>
    </div>
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
      {onlineAdmins.map(function(admin) {
        return (
          <div key={admin.admin_id} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px',
            background: 'var(--bg-elevated)',
            borderRadius: '10px',
            border: '1px solid rgba(52,211,153,0.15)'
          }}>
            <div style={{
              width: '32px', height: '32px',
              borderRadius: '50%',
              background: 'rgba(52,211,153,0.15)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px', fontWeight: '600',
              color: 'var(--success)', position: 'relative'
            }}>
              {admin.full_name?.charAt(0)?.toUpperCase()}
              <span style={{
                position: 'absolute', bottom: 0, right: 0,
                width: '8px', height: '8px',
                background: 'var(--success)',
                borderRadius: '50%',
                border: '1px solid var(--bg-elevated)'
              }} />
            </div>
            <div>
              <p style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-primary)' }}>
                {admin.full_name}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {admin.role?.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  </div>
)}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
              All Administrators
            </p>
            <div style={{ position: 'relative', marginLeft: '12px', flex: 1, maxWidth: '360px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search administrators..."
                value={search}
                onChange={function(e) { setSearch(e.target.value) }}
                className="input"
                style={{ paddingLeft: '32px', width: '100%' }}
              />
              {search && (
                <button
                  onClick={function() { setSearch('') }}
                  aria-label="Clear search"
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                  <X size={14} color="var(--text-muted)" />
                </button>
              )}
            </div>
          </div>
          {role === 'super_admin' && (
            <button
              onClick={function() { setShowInviteModal(true) }}
              className="btn-primary"
              style={{ padding: '8px 14px', fontSize: '13px' }}
            >
              <Plus size={14} />
              Invite Platform Admin
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading...
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>Role</th>
                  <th>Organisation</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Created</th>
                  {(role === 'super_admin' || role === 'platform_admin') && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredAdmins.map(function(admin) {
                  // Determine if actions should show for this row
                  const canActOn =
                    (role === 'super_admin' && admin.role !== 'super_admin') ||
                    (role === 'platform_admin' && admin.role === 'org_admin')

                  return (
                    <tr key={admin.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px', height: '32px',
                            borderRadius: '50%',
                            background: 'var(--bg-elevated)',
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '13px', fontWeight: '600',
                            color: roleColor[admin.role] || 'var(--text-muted)',
                            flexShrink: 0
                          }}>
                            {admin.full_name?.charAt(0)?.toUpperCase() || 'A'}
                          </div>
                          <div>
                            <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                              {admin.full_name}
                            </p>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {admin.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{
                          fontSize: '12px', fontWeight: '500',
                          color: roleColor[admin.role] || 'var(--text-muted)'
                        }}>
                          {roleLabel[admin.role] || admin.role}
                        </span>
                      </td>
                      <td>
                        {admin.org_code ? (
                          <span className="badge badge-accent">{admin.org_code}</span>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span className={'badge badge-' + (admin.is_locked ? 'danger' : admin.is_active ? 'success' : 'warning')}>
                          {admin.is_locked ? 'Locked' : admin.is_active ? 'Active' : 'Pending'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {admin.last_login?.toDate?.()?.toLocaleString() || 'Never'}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {admin.created_at?.toDate?.()?.toLocaleDateString() || '—'}
                      </td>
                      {(role === 'super_admin' || role === 'platform_admin') && (
                        <td>
                          {canActOn && (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {admin.is_locked ? (
                                <button
                                  onClick={function() { handleUnlock(admin.admin_id, admin.email) }}
                                  style={{
                                    padding: '4px 8px', fontSize: '11px',
                                    background: 'rgba(52,211,153,0.1)',
                                    color: 'var(--success)', border: 'none',
                                    borderRadius: '4px', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '4px'
                                  }}
                                >
                                  <Unlock size={10} /> Unlock
                                </button>
                              ) : (
                                <button
                                  onClick={function() { handleLock(admin.admin_id, admin.email) }}
                                  style={{
                                    padding: '4px 8px', fontSize: '11px',
                                    background: 'rgba(251,191,36,0.1)',
                                    color: 'var(--warning)', border: 'none',
                                    borderRadius: '4px', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '4px'
                                  }}
                                >
                                  <Lock size={10} /> Lock
                                </button>
                              )}
                              <button
                                onClick={function() { handleDelete(admin.admin_id, admin.email, admin.role) }}
                                style={{
                                  padding: '4px 8px', fontSize: '11px',
                                  background: 'rgba(248,113,113,0.1)',
                                  color: 'var(--danger)', border: 'none',
                                  borderRadius: '4px', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', gap: '4px'
                                }}
                              >
                                <Trash2 size={10} /> Delete
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 200
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            width: '100%', maxWidth: '400px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Send size={18} color="var(--accent)" />
              <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                Invite Platform Admin
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={inviteForm.full_name}
                  onChange={function(e) { setInviteForm(function(p) { return { ...p, full_name: e.target.value } }) }}
                  placeholder="e.g. John Mensah"
                  className="input"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={function(e) { setInviteForm(function(p) { return { ...p, email: e.target.value } }) }}
                  placeholder="admin@intellisenseids.com"
                  className="input"
                />
              </div>
              <div style={{
                padding: '10px 12px',
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.15)',
                borderRadius: '6px'
              }}>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Role will be set to <span style={{ color: 'var(--accent)' }}>Platform Admin</span> automatically.
                  An invitation email will be sent.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                onClick={function() { setShowInviteModal(false) }}
                className="btn-secondary"
                style={{ justifyContent: 'center', padding: '10px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={inviting}
                className="btn-primary"
                style={{ justifyContent: 'center', padding: '10px' }}
              >
                {inviting ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

export default AdminManagement
