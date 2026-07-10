import { useState, useEffect } from 'react'
import {
  AlertTriangle, Activity,
  Shield, FileText, Flag, TrendingUp
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import {
  collection, query, where,
  onSnapshot, orderBy, limit
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { analyticsAPI, modelAPI } from '../../services/api'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import StatCard from '../../components/StatCard'
import RiskScore from '../../components/RiskScore'
import useAuthStore from '../../store/useAuthStore'

const COLORS = ['#6366F1', '#34D399', '#FBBF24', '#F87171', '#60A5FA']

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px' }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</p>
      {payload.map(function(entry, i) {
        return <p key={i} style={{ color: entry.color }}>{entry.name}: {entry.value?.toLocaleString()}</p>
      })}
    </div>
  )
}

function OrgDashboard() {
  const { admin } = useAuthStore()
  const [org, setOrg] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [model, setModel] = useState(null)
  const [trafficData, setTrafficData] = useState([])
  const [attackData, setAttackData] = useState([])
  const [riskScore, setRiskScore] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(function() {
    if (!admin?.org_id) return

    const unsubOrg = onSnapshot(
      query(collection(db, 'organisations'), where('org_id', '==', admin.org_id)),
      function(snap) {
        if (!snap.empty) setOrg({ id: snap.docs[0].id, ...snap.docs[0].data() })
      }
    )

    const unsubAlerts = onSnapshot(
      query(collection(db, 'alerts'), where('org_id', '==', admin.org_id), orderBy('timestamp', 'desc'), limit(50)),
      function(snap) {
        setAlerts(snap.docs.map(function(d) { return { id: d.id, ...d.data() } }))
      }
    )

    loadAnalytics()

    return function() { unsubOrg(); unsubAlerts() }
  }, [admin?.org_id])

  async function loadAnalytics() {
    if (!admin?.org_id) return
    try {
      const [trafficRes, attackRes, riskRes, modelRes] = await Promise.all([
        analyticsAPI.getTraffic(admin.org_id, '7d'),
        analyticsAPI.getAttackTypes(admin.org_id),
        analyticsAPI.getRisk(admin.org_id),
        modelAPI.getProduction()
      ])
      setTrafficData(trafficRes.data.data || [])
      setAttackData(attackRes.data.data || [])
      setRiskScore(riskRes.data.data)
      setModel(modelRes.data.data)
    } catch(e) {
      console.error('Analytics error:', e)
    } finally {
      setLoading(false)
    }
  }

  const criticalAlerts = alerts.filter(function(a) { return a.severity === 'critical' }).length
  const unresolvedAlerts = alerts.filter(function(a) { return a.alert_status === 'new' || a.alert_status === 'investigating' }).length
  const regulatoryAlerts = alerts.filter(function(a) { return a.regulatory_flags && a.regulatory_flags.length > 0 })

  const severityColor = { critical: 'danger', high: 'warning', medium: 'accent', low: 'muted' }

  return (
    <Layout>
      <TopBar title={org?.name || 'My Organisation'} />

      {/* Regulatory alert banner */}
      {regulatoryAlerts.length > 0 && (
        <div style={{
          padding: '14px 18px',
          background: 'rgba(251,191,36,0.08)',
          border: '1px solid rgba(251,191,36,0.25)',
          borderRadius: '10px', marginBottom: '20px',
          display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <Flag size={18} color="var(--warning)" />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--warning)' }}>
              {regulatoryAlerts.length} alert{regulatoryAlerts.length > 1 ? 's' : ''} require regulatory notification
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Review flagged alerts and notify your compliance team and relevant regulators
            </p>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: riskScore ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <StatCard
          title="Agent Status"
          value={org?.agent_status === 'online' ? 'Online' : 'Offline'}
          subtitle={'Model ' + (org?.model_version || 'none')}
          icon={Shield}
          color={org?.agent_status === 'online' ? 'success' : 'danger'}
        />
        <StatCard
          title="Active Threats"
          value={unresolvedAlerts}
          subtitle={criticalAlerts + ' critical'}
          icon={AlertTriangle}
          color="danger"
        />
        <StatCard
          title="Model Version"
          value={model?.version || 'None'}
          subtitle={model ? 'F1: ' + model.f1_score?.toFixed(3) : 'No model'}
          icon={Activity}
          color="accent"
        />
        <StatCard
          title="Flows Uploaded"
          value={(org?.flows_uploaded || 0).toLocaleString()}
          subtitle={'Captured: ' + (org?.flows_captured || 0).toLocaleString()}
          icon={FileText}
          color="warning"
        />
      </div>

      {/* Risk score + financial exposure row */}
      {riskScore && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '16px' }}>

          {/* Risk Score Card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '12px' }}>
            <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              Security Risk Score
            </p>
            <RiskScore score={riskScore.score} level={riskScore.level} size="large" />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: '200px' }}>
              {riskScore.financial_context}
            </p>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(riskScore.factors || []).map(function(factor) {
                const pct = (factor.score / factor.max) * 100
                return (
                  <div key={factor.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{factor.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>{factor.score}/{factor.max}</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: pct + '%', height: '100%', background: pct > 66 ? 'var(--danger)' : pct > 33 ? 'var(--warning)' : 'var(--success)', borderRadius: '2px' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Financial Exposure Card */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <TrendingUp size={16} color="var(--accent)" />
              <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                Financial Exposure Assessment
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                {
                  label: 'Payment Gateway',
                  count: alerts.filter(function(a) { return a.attack_type?.includes('DDoS-Payment') || a.attack_type?.includes('API-Abuse') }).length,
                  desc: 'Payment processing attacks',
                  color: '#F87171'
                },
                {
                  label: 'Customer Data',
                  count: alerts.filter(function(a) { return a.attack_type?.includes('Credential') || a.attack_type?.includes('Exfiltration') }).length,
                  desc: 'Data theft attempts',
                  color: '#FBBF24'
                },
                {
                  label: 'Core Banking',
                  count: alerts.filter(function(a) { return a.is_financial_port }).length,
                  desc: 'Critical system targeting',
                  color: '#F87171'
                },
                {
                  label: 'Regulatory Risk',
                  count: regulatoryAlerts.length,
                  desc: 'Alerts requiring notification',
                  color: '#FBBF24'
                }
              ].map(function(item) {
                return (
                  <div key={item.label} style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: item.count > 0 ? item.color + '08' : 'var(--bg-elevated)',
                    border: '1px solid ' + (item.count > 0 ? item.color + '20' : 'transparent'),
                    borderRadius: '8px'
                  }}>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>{item.label}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.desc}</p>
                    </div>
                    <span style={{
                      fontSize: '18px', fontWeight: '700',
                      color: item.count > 0 ? item.color : 'var(--success)',
                      fontFamily: 'Syne, sans-serif'
                    }}>
                      {item.count === 0 ? '✓' : item.count}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Traffic Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div className="card">
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>Network Traffic</p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>Last 7 Days</p>
          {trafficData.length === 0 ? (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No traffic data yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trafficData}>
                <defs>
                  <linearGradient id="bg4" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34D399" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#34D399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ag4" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F87171" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F87171" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="day" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="benign" stroke="#34D399" strokeWidth={2} fill="url(#bg4)" name="Benign" />
                <Area type="monotone" dataKey="attack" stroke="#F87171" strokeWidth={2} fill="url(#ag4)" name="Attack" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>Attack Types</p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>Finance Threats</p>
          {attackData.length === 0 ? (
            <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={28} color="var(--success)" />
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={110}>
                <PieChart>
                  <Pie data={attackData} cx="50%" cy="50%" innerRadius={32} outerRadius={50} paddingAngle={3} dataKey="value">
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

      {/* Recent Alerts */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>Recent Alerts</p>
          {unresolvedAlerts > 0 && (
            <span style={{ fontSize: '12px', color: 'var(--warning)', background: 'rgba(251,191,36,0.1)', padding: '3px 10px', borderRadius: '999px' }}>
              {unresolvedAlerts} need attention
            </span>
          )}
        </div>
        {alerts.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <Shield size={32} color="var(--success)" style={{ margin: '0 auto 8px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No alerts — network is clean</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Attack Type</th>
                  <th>Target</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Flags</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 10).map(function(alert) {
                  const statusColors = {
                    new: 'accent', investigating: 'warning',
                    resolved: 'success', false_positive: 'muted'
                  }
                  return (
                    <tr key={alert.id}>
                      <td style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {alert.timestamp?.toDate?.()?.toLocaleTimeString() || 'Now'}
                      </td>
                      <td style={{ fontSize: '13px', fontWeight: '500' }}>
                        {alert.attack_type?.replace(/_/g, ' ')}
                      </td>
                      <td style={{ fontSize: '12px', color: alert.is_financial_port ? 'var(--warning)' : 'var(--text-muted)' }}>
                        {alert.target_system || ('Port ' + alert.dst_port) || '—'}
                      </td>
                      <td>
                        <span className={'badge badge-' + (severityColor[alert.severity] || 'muted')}>
                          {alert.severity}
                        </span>
                      </td>
                      <td>
                        <span className={'badge badge-' + (statusColors[alert.alert_status] || 'muted')}>
                          {alert.alert_status?.replace('_', ' ') || 'new'}
                        </span>
                      </td>
                      <td>
                        {alert.regulatory_flags?.length > 0 ? (
                          <span style={{ fontSize: '10px', color: 'var(--warning)', fontWeight: '600' }}>
                            {alert.regulatory_flags.length} flag{alert.regulatory_flags.length > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
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

export default OrgDashboard
