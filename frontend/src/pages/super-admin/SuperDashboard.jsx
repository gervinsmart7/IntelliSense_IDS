import { useState, useEffect } from 'react'
import {
  Building2, AlertTriangle, Brain,
  Activity, Flag, Shield, TrendingUp
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts'
import {
  collection, onSnapshot,
  query, orderBy, limit
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { analyticsAPI, modelAPI } from '../../services/api'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import StatCard from '../../components/StatCard'
import RiskScore from '../../components/RiskScore'

const COLORS = ['#6366F1', '#34D399', '#FBBF24', '#F87171', '#60A5FA', '#A78BFA']

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: '8px', padding: '10px 14px', fontSize: '12px'
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</p>
      {payload.map(function(entry, i) {
        return <p key={i} style={{ color: entry.color }}>{entry.name}: {entry.value?.toLocaleString()}</p>
      })}
    </div>
  )
}

// PCI-DSS requirement mapping for display
const PCI_DSS_REQUIREMENTS = [
  { id: 'Req 6.4', name: 'DDoS Resilience', attack: 'DDoS-Payment-Gateway' },
  { id: 'Req 8.3', name: 'Multi-Factor Auth', attack: 'Credential-Stuffing' },
  { id: 'Req 11.5', name: 'Network Monitoring', attack: 'Port-Scan-Financial' },
  { id: 'Req 4.2', name: 'Data Protection', attack: 'Data-Exfiltration' },
  { id: 'Req 12.10', name: 'Incident Response', attack: 'Ransomware-C2' },
  { id: 'Req 9.9', name: 'Device Protection', attack: 'Card-Skim-Probe' }
]

function SuperDashboard() {
  const [organisations, setOrganisations] = useState([])
  const [alerts, setAlerts] = useState([])
  const [overview, setOverview] = useState(null)
  const [trafficData, setTrafficData] = useState([])
  const [attackData, setAttackData] = useState([])
  const [riskData, setRiskData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(function() {
    const unsubOrgs = onSnapshot(
      collection(db, 'organisations'),
      function(snap) {
        setOrganisations(snap.docs.map(function(d) {
          return { id: d.id, ...d.data() }
        }))
      }
    )

    const unsubAlerts = onSnapshot(
      query(collection(db, 'alerts'), orderBy('timestamp', 'desc'), limit(200)),
      function(snap) {
        setAlerts(snap.docs.map(function(d) {
          return { id: d.id, ...d.data() }
        }))
      }
    )

    loadAnalytics()

    const interval = setInterval(loadAnalytics, 5 * 60 * 1000)

    return function() {
      unsubOrgs()
      unsubAlerts()
      clearInterval(interval)
    }
  }, [])

  async function loadAnalytics() {
    try {
      const [overviewRes, trafficRes, attackRes, riskRes] = await Promise.all([
        analyticsAPI.getOverview(),
        analyticsAPI.getTraffic('all', '7d'),
        analyticsAPI.getAttackTypes('all'),
        analyticsAPI.getRiskRanking()
      ])
      setOverview(overviewRes.data.data)
      setTrafficData(trafficRes.data.data || [])
      setAttackData(attackRes.data.data || [])
      setRiskData(riskRes.data.data || [])
    } catch(e) {
      console.error('Analytics error:', e)
    } finally {
      setLoading(false)
    }
  }

  const onlineOrgs = organisations.filter(function(o) {
    return o.agent_status === 'online'
  }).length

  const criticalAlerts = alerts.filter(function(a) {
    return a.severity === 'critical'
  }).length

  const regulatoryAlerts = alerts.filter(function(a) {
    return a.regulatory_flags && a.regulatory_flags.length > 0
  })

  const killChainAlerts = alerts.filter(function(a) {
    return a.is_kill_chain_alert
  })

  const severityColor = {
    critical: 'danger', high: 'warning',
    medium: 'accent', low: 'muted'
  }

  // PCI-DSS compliance summary
  const pciStatus = PCI_DSS_REQUIREMENTS.map(function(req) {
    const incidents = alerts.filter(function(a) {
      return a.attack_type && a.attack_type.toLowerCase().includes(req.attack.toLowerCase())
    }).length
    return { ...req, incidents, status: incidents === 0 ? 'clean' : incidents < 3 ? 'warning' : 'critical' }
  })

  if (loading) {
    return (
      <Layout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div style={{ width: '32px', height: '32px', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <TopBar title="Platform Overview" />

      {/* Kill chain alert banner */}
      {killChainAlerts.length > 0 && (
        <div style={{
          padding: '14px 20px',
          background: 'rgba(248,113,113,0.08)',
          border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: '10px', marginBottom: '20px',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Flag size={18} color="var(--danger)" />
            <div>
              <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--danger)' }}>
                {killChainAlerts.length} Active Kill Chain Pattern{killChainAlerts.length > 1 ? 's' : ''} Detected
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Multi-stage attack campaigns in progress across your financial institutions
              </p>
            </div>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--danger)', background: 'rgba(248,113,113,0.1)', padding: '4px 12px', borderRadius: '999px', fontWeight: '600' }}>
            IMMEDIATE ACTION REQUIRED
          </span>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <StatCard
          title="Financial Institutions"
          value={organisations.length}
          subtitle={onlineOrgs + ' agents online'}
          icon={Building2}
          color="accent"
        />
        <StatCard
          title="Active Threats"
          value={alerts.filter(function(a) { return a.alert_status === 'new' || a.alert_status === 'investigating' }).length}
          subtitle={criticalAlerts + ' critical'}
          icon={AlertTriangle}
          color="danger"
        />
        <StatCard
          title="Regulatory Flags"
          value={regulatoryAlerts.length}
          subtitle="Require notification"
          icon={Flag}
          color="warning"
        />
        <StatCard
          title="Model Version"
          value={overview?.model_version || 'None'}
          subtitle={overview?.model_f1 ? 'F1: ' + overview.model_f1.toFixed(3) : 'No model'}
          icon={Brain}
          color="success"
        />
      </div>

      {/* Charts Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div className="card">
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>Global Traffic</p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>Last 7 Days</p>
          {trafficData.length === 0 ? (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No traffic data yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trafficData}>
                <defs>
                  <linearGradient id="benignG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34D399" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#34D399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="attackG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F87171" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F87171" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="day" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="benign" stroke="#34D399" strokeWidth={2} fill="url(#benignG)" name="Benign" />
                <Area type="monotone" dataKey="attack" stroke="#F87171" strokeWidth={2} fill="url(#attackG)" name="Attack" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>Attack Types</p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>Distribution</p>
          {attackData.length === 0 ? (
            <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={32} color="var(--success)" style={{ margin: '0 auto' }} />
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={attackData} cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={3} dataKey="value">
                    {attackData.map(function(entry, index) {
                      return <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    })}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '6px' }}>
                {attackData.slice(0, 4).map(function(item, i) {
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: COLORS[i] }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.name}</span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>{item.value}%</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* PCI-DSS Compliance Overview */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Shield size={16} color="var(--accent)" />
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
            PCI-DSS Compliance Overview
          </p>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            Based on detected incidents
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {pciStatus.map(function(req) {
            const color = req.status === 'clean' ? '#34D399' : req.status === 'warning' ? '#FBBF24' : '#F87171'
            const bg = req.status === 'clean' ? 'rgba(52,211,153,0.08)' : req.status === 'warning' ? 'rgba(251,191,36,0.08)' : 'rgba(248,113,113,0.08)'
            const border = req.status === 'clean' ? 'rgba(52,211,153,0.2)' : req.status === 'warning' ? 'rgba(251,191,36,0.2)' : 'rgba(248,113,113,0.2)'
            return (
              <div key={req.id} style={{ padding: '12px 14px', background: bg, border: '1px solid ' + border, borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: color, fontFamily: 'JetBrains Mono, monospace' }}>{req.id}</span>
                  <span style={{ fontSize: '11px', color: color }}>{req.incidents === 0 ? '✓ Clean' : req.incidents + ' incident' + (req.incidents > 1 ? 's' : '')}</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{req.name}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Regulatory Alerts Panel */}
      {regulatoryAlerts.length > 0 && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Flag size={16} color="var(--warning)" />
            <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Regulatory Action Required
            </p>
            <span style={{ fontSize: '11px', color: 'var(--warning)', background: 'rgba(251,191,36,0.1)', padding: '2px 8px', borderRadius: '999px', marginLeft: 'auto' }}>
              {regulatoryAlerts.length} alerts
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {regulatoryAlerts.slice(0, 5).map(function(alert) {
              return (
                <div key={alert.id} style={{ padding: '12px 14px', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>{alert.attack_type?.replace(/_/g, ' ')}</p>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                      {(alert.regulatory_flags || []).map(function(flag) {
                        return (
                          <span key={flag} style={{ fontSize: '10px', color: 'var(--warning)', background: 'rgba(251,191,36,0.1)', padding: '1px 6px', borderRadius: '4px', fontFamily: 'JetBrains Mono, monospace' }}>
                            {flag}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {alert.timestamp?.toDate?.()?.toLocaleDateString() || '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Risk Ranking */}
      {riskData.length > 0 && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <TrendingUp size={16} color="var(--accent)" />
            <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Institution Risk Ranking
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {riskData.slice(0, 8).map(function(item, i) {
              return (
                <div key={item.org_id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', width: '24px', flexShrink: 0 }}>#{i + 1}</span>
                  <RiskScore score={item.score} level={item.level} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>{item.org_name}</p>
                    <p style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>{item.org_code}</p>
                    {item.financial_context && (
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontStyle: 'italic' }}>{item.financial_context}</p>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {item.factors?.slice(0, 2).map(function(f) {
                      return (
                        <p key={f.name} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {f.name}: {f.score}/{f.max}
                        </p>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent Alerts */}
      <div className="card">
        <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>Recent Alerts</p>
        <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>All Financial Institutions</p>

        {alerts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <Shield size={32} color="var(--success)" style={{ margin: '0 auto 8px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No alerts — all networks clean</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Institution</th>
                  <th>Attack</th>
                  <th>Target System</th>
                  <th>Severity</th>
                  <th>Flags</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 10).map(function(alert) {
                  const org = organisations.find(function(o) { return o.org_id === alert.org_id })
                  return (
                    <tr key={alert.id}>
                      <td style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {alert.timestamp?.toDate?.()?.toLocaleTimeString() || 'Now'}
                      </td>
                      <td>
                        <span className="badge badge-accent">{org?.org_code || '—'}</span>
                      </td>
                      <td style={{ fontSize: '13px', fontWeight: '500' }}>
                        {alert.attack_type?.replace(/_/g, ' ')}
                        {alert.is_kill_chain_alert && (
                          <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--danger)', background: 'rgba(248,113,113,0.1)', padding: '1px 5px', borderRadius: '4px' }}>KILL CHAIN</span>
                        )}
                      </td>
                      <td style={{ fontSize: '12px', color: alert.is_financial_port ? 'var(--warning)' : 'var(--text-muted)' }}>
                        {alert.target_system || '—'}
                      </td>
                      <td>
                        <span className={'badge badge-' + (severityColor[alert.severity] || 'muted')}>
                          {alert.severity}
                        </span>
                      </td>
                      <td>
                        {alert.regulatory_flags?.length > 0 ? (
                          <span style={{ fontSize: '10px', color: 'var(--warning)', fontWeight: '600' }}>
                            {alert.regulatory_flags.length} flag{alert.regulatory_flags.length > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                        )}
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
      </div>
    </Layout>
  )
}

export default SuperDashboard
