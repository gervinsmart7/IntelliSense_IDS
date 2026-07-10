import { useState, useEffect } from 'react'
import { Search, Download, FileText, RefreshCw, X } from 'lucide-react'
import { collection, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore'
import { db } from '../../services/firebase'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import useAuthStore from '../../store/useAuthStore'
import api from '../../services/api'
import toast from 'react-hot-toast'

function LogsViewer() {
  const { role, admin } = useAuthStore()
  const [organisations, setOrganisations] = useState([])
  const [selectedOrg, setSelectedOrg] = useState('all')
  const [selectedOrgData, setSelectedOrgData] = useState(null)
  const [logs, setLogs] = useState([])
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  useEffect(function() {
    if (role === 'org_admin') {
      setSelectedOrg(admin.org_id)
      return
    }
    const unsub = onSnapshot(
      collection(db, 'organisations'),
      function(snap) {
        setOrganisations(snap.docs.map(function(d) {
          return { id: d.id, ...d.data() }
        }))
      }
    )
    return unsub
  }, [role, admin])

  useEffect(function() {
    if (role === 'org_admin' && admin?.org_id) {
      const unsub = onSnapshot(
        query(
          collection(db, 'organisations'),
          where('org_id', '==', admin.org_id)
        ),
        function(snap) {
          if (!snap.empty) {
            setSelectedOrgData({ id: snap.docs[0].id, ...snap.docs[0].data() })
          } else {
            setSelectedOrgData(null)
          }
        }
      )
      return unsub
    }

    if (role !== 'org_admin' && selectedOrg !== 'all') {
      const unsub = onSnapshot(
        query(
          collection(db, 'organisations'),
          where('org_id', '==', selectedOrg)
        ),
        function(snap) {
          if (!snap.empty) {
            setSelectedOrgData({ id: snap.docs[0].id, ...snap.docs[0].data() })
          } else {
            setSelectedOrgData(null)
          }
        }
      )
      return unsub
    }

    setSelectedOrgData(null)
  }, [role, admin?.org_id, selectedOrg])

  useEffect(function() {
    loadLogs()
  }, [selectedOrg, classFilter])

  async function loadLogs() {
    setLoading(true)
    try {
      let q
      if (selectedOrg === 'all') {
        q = query(
          collection(db, 'alerts'),
          orderBy('timestamp', 'desc'),
          limit(500)
        )
      } else {
        q = query(
          collection(db, 'alerts'),
          where('org_id', '==', selectedOrg),
          orderBy('timestamp', 'desc'),
          limit(500)
        )
      }

      const unsub = onSnapshot(q, function(snap) {
        let data = snap.docs.map(function(d) {
          return { id: d.id, ...d.data() }
        })

        if (classFilter !== 'all') {
          data = data.filter(function(l) {
            if (classFilter === 'benign') return l.attack_type === 'BENIGN'
            return l.attack_type !== 'BENIGN'
          })
        }

        setLogs(data)
        setLoading(false)
      })

      return unsub
    } catch(e) {
      setLoading(false)
      toast.error('Failed to load logs')
    }
  }

  const filtered = logs.filter(function(log) {
    return (
      log.attack_type?.toLowerCase().includes(search.toLowerCase()) ||
      log.src_ip?.includes(search) ||
      log.dst_ip?.includes(search)
    )
  })

  const flowMetrics = [
    {
      label: 'Flows Captured',
      value: (selectedOrgData?.flows_captured || 0).toLocaleString(),
      color: '#34D399'
    },
    {
      label: 'Flows Uploaded',
      value: (selectedOrgData?.flows_uploaded || 0).toLocaleString(),
      color: '#6366F1'
    },
    {
      label: 'Agent Status',
      value: selectedOrgData?.agent_status || 'Unknown',
      color: selectedOrgData?.agent_status === 'online' ? '#34D399' : '#F87171'
    },
    {
      label: 'Last Sync',
      value: selectedOrgData?.last_sync?.toDate?.()?.toLocaleString() || 'Never',
      color: '#FBBF24'
    }
  ]

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  async function handleExportCSV() {
    const headers = ['Timestamp', 'Org', 'Attack Type', 'Severity', 'Source IP', 'Dest IP', 'Port', 'Protocol', 'Confidence']
    const rows = filtered.map(function(log) {
      const org = organisations.find(function(o) { return o.org_id === log.org_id })
      return [
        log.timestamp?.toDate?.()?.toISOString() || '',
        org?.org_code || log.org_id?.slice(0, 8) || '',
        log.attack_type || '',
        log.severity || '',
        log.src_ip || '',
        log.dst_ip || '',
        log.dst_port || '',
        log.protocol || '',
        ((log.confidence || 0) * 100).toFixed(0) + '%'
      ].join(',')
    })

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ids_logs_' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Logs exported as CSV')
  }

  const severityColor = {
    critical: 'danger',
    high: 'warning',
    medium: 'accent',
    low: 'muted'
  }

  return (
    <Layout>
      <TopBar title="Logs Viewer" />

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Logs', value: filtered.length, color: '#6366F1' },
          { label: 'Attacks', value: filtered.filter(function(l) { return l.attack_type !== 'BENIGN' }).length, color: '#F87171' },
          { label: 'Critical', value: filtered.filter(function(l) { return l.severity === 'critical' }).length, color: '#F87171' },
          { label: 'High', value: filtered.filter(function(l) { return l.severity === 'high' }).length, color: '#FBBF24' }
        ].map(function(item) {
          return (
            <div key={item.label} className="stat-card">
              <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {item.label}
              </p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: item.color, fontFamily: 'Syne, sans-serif' }}>
                {item.value.toLocaleString()}
              </p>
            </div>
          )
        })}
      </div>

      {(role === 'org_admin' || selectedOrg !== 'all') && (
        <div className="card" style={{ marginBottom: '24px', padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Flow Activity
              </p>
              <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                Agent-reported flow counters
              </p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', marginTop: '16px' }}>
            {flowMetrics.map(function(item) {
              return (
                <div key={item.label} className="stat-card">
                  <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    {item.label}
                  </p>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: item.color, fontFamily: 'Syne, sans-serif' }}>
                    {item.value}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', gap: '12px',
          alignItems: 'center', flexWrap: 'wrap'
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: '180px', maxWidth: '280px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search logs..."
              value={search}
              onChange={function(e) { setSearch(e.target.value); setPage(0) }}
              className="input"
              style={{ paddingLeft: '32px' }}
            />
            {search && (
              <button
                onClick={function() { setSearch(''); setPage(0) }}
                aria-label="Clear search"
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                <X size={14} color="var(--text-muted)" />
              </button>
            )}
          </div>

          {/* Org filter — only for super and platform admin */}
          {role !== 'org_admin' && (
            <select
              value={selectedOrg}
              onChange={function(e) { setSelectedOrg(e.target.value); setPage(0) }}
              className="input"
              style={{ width: 'auto', cursor: 'pointer' }}
            >
              <option value="all">All Organisations</option>
              {organisations.map(function(org) {
                return (
                  <option key={org.id} value={org.org_id}>
                    {org.name} ({org.org_code})
                  </option>
                )
              })}
            </select>
          )}

          {/* Classification filter */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {['all', 'attack', 'benign'].map(function(f) {
              return (
                <button
                  key={f}
                  onClick={function() { setClassFilter(f); setPage(0) }}
                  style={{
                    padding: '6px 12px', borderRadius: '6px',
                    fontSize: '12px', fontWeight: '500',
                    border: 'none', cursor: 'pointer',
                    background: classFilter === f ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: classFilter === f ? 'white' : 'var(--text-muted)'
                  }}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              )
            })}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button
              onClick={loadLogs}
              className="btn-secondary"
              style={{ padding: '8px 12px' }}
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={handleExportCSV}
              className="btn-secondary"
              style={{ padding: '8px 12px' }}
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Table content */}
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading logs...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <FileText size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No alert logs found for this selection.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  {role !== 'org_admin' && <th>Organisation</th>}
                  <th>Attack Type</th>
                  <th>Severity</th>
                  <th>Source IP</th>
                  <th>Dest IP</th>
                  <th>Port</th>
                  <th>Protocol</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(function(log) {
                  const org = organisations.find(function(o) {
                    return o.org_id === log.org_id
                  })
                  return (
                    <tr key={log.id}>
                      <td style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {log.timestamp?.toDate?.()?.toLocaleString() || 'Just now'}
                      </td>
                      {role !== 'org_admin' && (
                        <td>
                          <span className="badge badge-accent">
                            {org?.org_code || '—'}
                          </span>
                        </td>
                      )}
                      <td style={{ fontSize: '13px', fontWeight: '500' }}>
                        {log.attack_type}
                      </td>
                      <td>
                        <span className={'badge badge-' + (severityColor[log.severity] || 'muted')}>
                          {log.severity || '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {log.src_ip || '—'}
                      </td>
                      <td style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {log.dst_ip || '—'}
                      </td>
                      <td style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {log.dst_port || '—'}
                      </td>
                      <td>
                        <span className="badge badge-muted">
                          {log.protocol || '—'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{
                            width: '48px', height: '4px',
                            background: 'var(--bg-elevated)',
                            borderRadius: '2px', overflow: 'hidden'
                          }}>
                            <div style={{
                              width: ((log.confidence || 0) * 100) + '%',
                              height: '100%',
                              background: 'var(--accent)',
                              borderRadius: '2px'
                            }} />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {((log.confidence || 0) * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Showing {page * PAGE_SIZE + 1} to {Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} logs
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={function() { setPage(Math.max(0, page - 1)) }}
                disabled={page === 0}
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Previous
              </button>
              <span style={{
                padding: '6px 12px', fontSize: '12px',
                color: 'var(--text-muted)'
              }}>
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={function() { setPage(Math.min(totalPages - 1, page + 1)) }}
                disabled={page >= totalPages - 1}
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

export default LogsViewer
