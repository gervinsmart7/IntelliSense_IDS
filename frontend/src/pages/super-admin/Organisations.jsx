import { useState, useEffect } from 'react'
import {
  Search, MoreVertical,
  CheckCircle, XCircle, Trash2,
  Building2, RefreshCw, X
} from 'lucide-react'
import { orgAPI } from '../../services/api'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import toast from 'react-hot-toast'

function Organisations() {
  const [organisations, setOrganisations] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionOrg, setActionOrg] = useState(null)

  useEffect(function() {
    loadOrganisations()
  }, [])

  async function loadOrganisations() {
    setLoading(true)
    setError(null)
    try {
      const response = await orgAPI.getAll()
      setOrganisations(response.data.data || [])
    } catch(e) {
      console.error('Organisations error:', e)
      setError('Failed to load organisations. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  const filtered = organisations.filter(function(org) {
    const matchSearch =
      org.name?.toLowerCase().includes(search.toLowerCase()) ||
      org.org_code?.toLowerCase().includes(search.toLowerCase()) ||
      org.domain?.toLowerCase().includes(search.toLowerCase())

    const matchFilter =
      filter === 'all' ||
      (filter === 'online' && org.agent_status === 'online') ||
      (filter === 'offline' && org.agent_status !== 'online') ||
      (filter === 'active' && org.status === 'active') ||
      (filter === 'suspended' && org.status === 'suspended') ||
      (filter === 'pending' && org.status === 'pending_verification')

    return matchSearch && matchFilter
  })

  async function handleSuspend(orgId, name) {
    try {
      await orgAPI.suspend(orgId)
      toast.success(name + ' suspended')
      setActionOrg(null)
      loadOrganisations()
    } catch(e) {
      toast.error('Failed to suspend organisation')
    }
  }

  async function handleReinstate(orgId, name) {
    try {
      await orgAPI.reinstate(orgId)
      toast.success(name + ' reinstated')
      setActionOrg(null)
      loadOrganisations()
    } catch(e) {
      toast.error('Failed to reinstate organisation')
    }
  }

  async function handleDelete(orgId, name) {
    if (!window.confirm('Delete ' + name + '? This cannot be undone.')) return
    try {
      await orgAPI.delete(orgId)
      toast.success(name + ' deleted')
      setActionOrg(null)
      loadOrganisations()
    } catch(e) {
      toast.error('Failed to delete organisation')
    }
  }

  const statusColor = {
    active: 'success',
    pending_verification: 'warning',
    suspended: 'danger'
  }

  return (
    <Layout>
      <TopBar title="Organisations" />

      {/* Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px', marginBottom: '24px'
      }}>
        {[
          { label: 'Total', value: organisations.length, color: '#6366F1' },
          { label: 'Active', value: organisations.filter(function(o) { return o.status === 'active' }).length, color: '#34D399' },
          { label: 'Online Agents', value: organisations.filter(function(o) { return o.agent_status === 'online' }).length, color: '#60A5FA' },
          { label: 'Suspended', value: organisations.filter(function(o) { return o.status === 'suspended' }).length, color: '#F87171' },
          { label: 'Pending Verification', value: organisations.filter(function(o) { return o.status === 'pending_verification' }).length, color: '#FBBF24' }
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

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px', flexWrap: 'wrap'
        }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '320px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search organisations..."
              value={search}
              onChange={function(e) { setSearch(e.target.value) }}
              className="input"
              style={{ paddingLeft: '32px' }}
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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {['all', 'active', 'online', 'offline', 'suspended', 'pending'].map(function(f) {
              return (
                <button
                  key={f}
                  onClick={function() { setFilter(f) }}
                  style={{
                    padding: '6px 12px', borderRadius: '6px',
                    fontSize: '12px', fontWeight: '500',
                    border: 'none', cursor: 'pointer',
                    background: filter === f ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: filter === f ? 'white' : 'var(--text-muted)'
                  }}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              )
            })}
            <button
              onClick={loadOrganisations}
              className="btn-secondary"
              style={{ padding: '6px 10px' }}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ padding: '64px', textAlign: 'center' }}>
            <div style={{
              width: '32px', height: '32px',
              border: '2px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px'
            }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              Loading organisations...
            </p>
          </div>
        ) : error ? (
          <div style={{ padding: '64px', textAlign: 'center' }}>
            <p style={{ color: 'var(--danger)', fontSize: '14px', marginBottom: '16px' }}>
              {error}
            </p>
            <button onClick={loadOrganisations} className="btn-primary">
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '64px', textAlign: 'center' }}>
            <Building2 size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              {search ? 'No organisations match your search' : 'No organisations registered yet'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Organisation</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Agent</th>
                  <th>Model</th>
                  <th>Last Seen</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(function(org) {
                  return (
                    <tr key={org.org_id || org.id}>
                      <td>
                        <div>
                          <p style={{ fontWeight: '500', fontSize: '13px' }}>
                            {org.name}
                          </p>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                            {org.org_code}
                          </p>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-accent">{org.type}</span>
                      </td>
                      <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        {org.city}, {org.country}
                      </td>
                      <td>
                        <span className={'badge badge-' + (statusColor[org.status] || 'muted')}>
                          {org.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={'pulse-dot ' + (org.agent_status === 'online' ? 'online' : 'offline')} />
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {org.agent_status || 'offline'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span style={{
                          fontSize: '12px',
                          fontFamily: 'JetBrains Mono, monospace',
                          color: org.model_version ? 'var(--success)' : 'var(--text-muted)'
                        }}>
                          {org.model_version || 'none'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {org.last_seen
                          ? new Date(org.last_seen?.toDate?.() || org.last_seen).toLocaleString()
                          : '—'
                        }
                      </td>
                      <td>
                        <div style={{ position: 'relative' }}>
                          <button
                            onClick={function() {
                              setActionOrg(actionOrg === org.org_id ? null : org.org_id)
                            }}
                            style={{
                              background: 'none', border: 'none',
                              cursor: 'pointer', color: 'var(--text-muted)',
                              padding: '4px', borderRadius: '4px',
                              display: 'flex', alignItems: 'center'
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>

                          {actionOrg === org.org_id && (
                            <div style={{
                              position: 'absolute', right: 0, top: '100%',
                              background: 'var(--bg-card)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                              zIndex: 50, minWidth: '160px',
                              overflow: 'hidden'
                            }}>
                              {org.status === 'suspended' ? (
                                <button
                                  onClick={function() { handleReinstate(org.org_id, org.name) }}
                                  style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--success)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}
                                >
                                  <CheckCircle size={14} /> Reinstate
                                </button>
                              ) : (
                                <button
                                  onClick={function() { handleSuspend(org.org_id, org.name) }}
                                  style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warning)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}
                                >
                                  <XCircle size={14} /> Suspend
                                </button>
                              )}
                              <button
                                onClick={function() { handleDelete(org.org_id, org.name) }}
                                style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left', borderTop: '1px solid var(--border)' }}
                              >
                                <Trash2 size={14} /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)' }}>
          Showing {filtered.length} of {organisations.length} organisations
        </div>
      </div>
    </Layout>
  )
}

export default Organisations
