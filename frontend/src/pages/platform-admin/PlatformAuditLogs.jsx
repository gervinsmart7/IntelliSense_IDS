import { useState, useEffect } from 'react'
import { Search, ClipboardList, RefreshCw, X } from 'lucide-react'
import api from '../../services/api'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'

function AuditLogs() {
  const [logs, setLogs] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(function() {
    loadLogs()
  }, [])

  async function loadLogs() {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get('/api/audit-logs/my-activity')
      const data = response.data.data || []
      setLogs(data)
    } catch(e) {
      console.error('Audit logs error:', e)
      setError('Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }

  const filtered = logs.filter(function(log) {
    const matchSearch =
      log.admin_email?.toLowerCase().includes(search.toLowerCase()) ||
      log.action_type?.toLowerCase().includes(search.toLowerCase()) ||
      log.action_detail?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || log.status === statusFilter
    return matchSearch && matchStatus
  })

  const statusColor = {
    success: 'success',
    failed: 'danger',
    denied: 'warning'
  }

  const roleColor = {
    super_admin: '#A78BFA',
    platform_admin: '#6366F1',
    org_admin: '#34D399',
    agent: '#60A5FA',
    system: '#64748B'
  }

  return (
    <Layout>
      <TopBar title="Audit Logs" />

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', gap: '12px',
          alignItems: 'center', flexWrap: 'wrap'
        }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search logs..."
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
          <div style={{ display: 'flex', gap: '8px' }}>
            {['all', 'success', 'failed', 'denied'].map(function(s) {
              return (
                <button
                  key={s}
                  onClick={function() { setStatusFilter(s) }}
                  style={{
                    padding: '6px 12px', borderRadius: '6px',
                    fontSize: '12px', fontWeight: '500',
                    border: 'none', cursor: 'pointer',
                    background: statusFilter === s ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: statusFilter === s ? 'white' : 'var(--text-muted)'
                  }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              )
            })}
          </div>
          <button
            onClick={loadLogs}
            className="btn-secondary"
            style={{ padding: '6px 10px', marginLeft: 'auto' }}
          >
            <RefreshCw size={14} />
          </button>
        </div>

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
              Loading audit logs...
            </p>
          </div>
        ) : error ? (
          <div style={{ padding: '64px', textAlign: 'center' }}>
            <p style={{ color: 'var(--danger)', fontSize: '14px', marginBottom: '16px' }}>
              {error}
            </p>
            <button onClick={loadLogs} className="btn-primary">
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '64px', textAlign: 'center' }}>
            <ClipboardList size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              No audit logs found
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>TimeStamp</th>
                  <th>Admin</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Detail</th>
                  <th>IP</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map(function(log) {
                  return (
                    <tr key={log.log_id || log.id}>
                    <td style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
  {log.timestamp
    ? (() => {
        // Handle all possible shapes
        if (typeof log.timestamp === 'string') return new Date(log.timestamp).toLocaleString()
        if (log.timestamp?._seconds) return new Date(log.timestamp._seconds * 1000).toLocaleString()
        if (log.timestamp?.toDate) return log.timestamp.toDate().toLocaleString()
        return '—'
      })()
    : '—'}
</td>
                     
                      <td style={{ fontSize: '13px' }}>{log.admin_email}</td>
                      <td>
                        <span style={{ fontSize: '11px', fontWeight: '500', color: roleColor[log.admin_role] || 'var(--text-muted)' }}>
                          {log.admin_role?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)' }}>
                          {log.action_type}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '250px' }}>
                        <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.action_detail}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {log.ip_address || '—'}
                      </td>
                      <td>
                        <span className={'badge badge-' + (statusColor[log.status] || 'muted')}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)' }}>
          Showing {Math.min(filtered.length, 100)} of {filtered.length} entries
        </div>
      </div>
    </Layout>
  )
}

export default AuditLogs
