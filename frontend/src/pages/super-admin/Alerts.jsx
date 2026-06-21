import { useState, useEffect } from 'react'
import { AlertTriangle, Search, RefreshCw, X } from 'lucide-react'
import {
  collection, onSnapshot,
  query, orderBy, limit
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { orgAPI } from '../../services/api'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import { useNavigate } from 'react-router-dom'

function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [organisations, setOrganisations] = useState([])
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
 const navigate = useNavigate()

  useEffect(function() {
    // Load organisations from API
    orgAPI.getAll()
      .then(function(res) {
        setOrganisations(res.data.data || [])
      })
      .catch(console.error)

    // Load alerts from Firestore with timeout
    const timeout = setTimeout(function() {
      setLoading(false)
      if (alerts.length === 0) {
        setError(null)
      }
    }, 10000)

    try {
      const unsubAlerts = onSnapshot(
        query(
          collection(db, 'alerts'),
          orderBy('timestamp', 'desc'),
          limit(500)
        ),
        function(snap) {
          clearTimeout(timeout)
          setAlerts(snap.docs.map(function(d) {
            return { id: d.id, ...d.data() }
          }))
          setLoading(false)
        },
        function(err) {
          clearTimeout(timeout)
          console.error('Alerts error:', err)
          setError('Failed to load alerts: ' + err.message)
          setLoading(false)
        }
      )
      return function() {
        clearTimeout(timeout)
        unsubAlerts()
      }
    } catch(e) {
      clearTimeout(timeout)
      setError('Failed to connect to database')
      setLoading(false)
    }
  }, [])

  const filtered = alerts.filter(function(a) {
    const q = search.toLowerCase()
    const matchSearch =
      (a.attack_type || '').toLowerCase().includes(q) ||
      (a.src_ip || '').includes(search) ||
      (a.dst_ip || '').includes(search)
    const matchSeverity = severityFilter === 'all' || a.severity === severityFilter
    return matchSearch && matchSeverity
  })

  const severityColor = {
    critical: 'danger',
    high: 'warning',
    medium: 'accent',
    low: 'muted'
  }

  const counts = {
    critical: alerts.filter(function(a) { return a.severity === 'critical' }).length,
    high: alerts.filter(function(a) { return a.severity === 'high' }).length,
    medium: alerts.filter(function(a) { return a.severity === 'medium' }).length,
    low: alerts.filter(function(a) { return a.severity === 'low' }).length
  }

  return (
    <Layout>
      <TopBar title="Alerts" />

      {/* Severity summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Critical', count: counts.critical, color: '#F87171', key: 'critical' },
          { label: 'High', count: counts.high, color: '#FBBF24', key: 'high' },
          { label: 'Medium', count: counts.medium, color: '#6366F1', key: 'medium' },
          { label: 'Low', count: counts.low, color: '#64748B', key: 'low' }
        ].map(function(item) {
          return (
            <div
              key={item.label}
              className="stat-card"
              onClick={function() { setSeverityFilter(item.key) }}
              style={{
                cursor: 'pointer',
                borderColor: severityFilter === item.key
                  ? item.color
                  : 'var(--border)'
              }}
            >
              <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {item.label}
              </p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: item.color, fontFamily: 'Syne, sans-serif' }}>
                {item.count}
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
          display: 'flex', gap: '12px',
          alignItems: 'center', flexWrap: 'wrap'
        }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search alerts..."
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
            {['all', 'critical', 'high', 'medium', 'low'].map(function(s) {
              return (
                <button
                  key={s}
                  onClick={function() { setSeverityFilter(s) }}
                  style={{
                    padding: '6px 12px', borderRadius: '6px',
                    fontSize: '12px', fontWeight: '500',
                    border: 'none', cursor: 'pointer',
                    background: severityFilter === s ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: severityFilter === s ? 'white' : 'var(--text-muted)'
                  }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              )
            })}
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
              Loading alerts...
            </p>
          </div>
        ) : error ? (
          <div style={{ padding: '64px', textAlign: 'center' }}>
            <p style={{ color: 'var(--danger)', fontSize: '14px', marginBottom: '8px' }}>
              {error}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '16px' }}>
              Check your Firestore rules and indexes
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '64px', textAlign: 'center' }}>
            <AlertTriangle size={40} color="var(--success)" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              {search || severityFilter !== 'all'
                ? 'No alerts match your filters'
                : 'No alerts yet — network is clean'
              }
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Organisation</th>
                  <th>Attack Type</th>
                  <th>Severity</th>
                  <th>Source IP</th>
                  <th>Dest IP</th>
                  <th>Port</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map(function(alert) {
                  const org = organisations.find(function(o) {
                    return o.org_id === alert.org_id
                  })
                 

		 return (
                    <tr key={alert.id}
		onClick={function() { navigate('/dashboard/super/alerts/' + alert.id) }}
                style={{ cursor: 'pointer' }}
	   >
                      <td style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {alert.timestamp?.toDate?.()?.toLocaleString() || 'Just now'}
                      </td>
                      <td>
                        <span className="badge badge-accent">
                          {org?.org_code || '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: '13px', fontWeight: '500' }}>
                        {alert.attack_type}
                      </td>
                      <td>
                        <span className={'badge badge-' + (severityColor[alert.severity] || 'muted')}>
                          {alert.severity}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {alert.src_ip}
                      </td>
                      <td style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {alert.dst_ip}
                      </td>
                      <td style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {alert.dst_port}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '48px', height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: ((alert.confidence || 0) * 100) + '%', height: '100%', background: 'var(--accent)', borderRadius: '2px' }} />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {((alert.confidence || 0) * 100).toFixed(0)}%
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

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)' }}>
          Showing {Math.min(filtered.length, 100)} of {filtered.length} alerts
        </div>
      </div>
    </Layout>
  )
}

export default Alerts
