import { useState, useEffect } from 'react'
import { AlertTriangle, Activity, Shield, FileText } from 'lucide-react'
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
import useAuthStore from '../../store/useAuthStore'
import RiskScore from '../../components/RiskScore'
import { useNavigate } from 'react-router-dom'

const COLORS = ['#6366F1', '#34D399', '#FBBF24', '#F87171', '#60A5FA']

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
        return (
          <p key={i} style={{ color: entry.color }}>
            {entry.name}: {entry.value?.toLocaleString()}
          </p>
        )
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
  const [loading, setLoading] = useState(true)
  const [riskScore, setRiskScore] = useState(null)
  const navigate = useNavigate()

  useEffect(function() {
    if (!admin?.org_id) return

    const unsubOrg = onSnapshot(
      query(
        collection(db, 'organisations'),
        where('org_id', '==', admin.org_id)
      ),
      function(snap) {
        if (!snap.empty) {
          setOrg({ id: snap.docs[0].id, ...snap.docs[0].data() })
        }
      }
    )

    const unsubAlerts = onSnapshot(
      query(
        collection(db, 'alerts'),
        where('org_id', '==', admin.org_id),
        orderBy('timestamp', 'desc'),
        limit(50)
      ),
      function(snap) {
        setAlerts(snap.docs.map(function(d) {
          return { id: d.id, ...d.data() }
        }))
      }
    )

    loadAnalytics()
    return function() { unsubOrg(); unsubAlerts() }
  }, [admin?.org_id])

  async function loadAnalytics() {
    if (!admin?.org_id) return
    try {
      const [trafficRes, attackRes, modelRes, riskRes] = await Promise.all([
  analyticsAPI.getTraffic(admin.org_id, '7d'),
  analyticsAPI.getAttackTypes(admin.org_id),
  modelAPI.getProduction(),
  analyticsAPI.getRisk(admin.org_id)
])

setTrafficData(trafficRes.data.data || [])
setAttackData(attackRes.data.data || [])
setModel(modelRes.data.data)
setRiskScore(riskRes.data.data)

    } catch(e) {
      console.error('Analytics error:', e)
    } finally {
      setLoading(false)
    }
  }

  const criticalAlerts = alerts.filter(function(a) {
    return a.severity === 'critical'
  }).length

  const severityColor = {
    critical: 'danger',
    high: 'warning',
    medium: 'accent',
    low: 'muted'
  }

  return (
    <Layout>
      <TopBar title={org?.name || 'My Organisation'} />

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px', marginBottom: '24px'
      }}>
        <StatCard
          title="Agent Status"
          value={org?.agent_status === 'online' ? 'Online' : 'Offline'}
          subtitle={'Model ' + (org?.model_version || 'none')}
          icon={Shield}
          color={org?.agent_status === 'online' ? 'success' : 'danger'}
        />
        <StatCard
          title="Total Alerts"
          value={alerts.length}
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
{riskScore && (
  <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
    <RiskScore
      score={riskScore.score}
      level={riskScore.level}
      size="large"
    />
    <div>
      <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
        Risk Score
      </p>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
        Based on alerts and agent health
      </p>
    </div>
  </div>
)}
      </div>

      {/* Charts */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: '16px', marginBottom: '16px'
      }}>
        <div className="card">
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Traffic
          </p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
            Last 7 Days
          </p>
          {trafficData.length === 0 ? (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                No traffic data yet
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trafficData}>
                <defs>
                  <linearGradient id="bg3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34D399" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#34D399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ag3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F87171" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F87171" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="day" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="benign" stroke="#34D399" strokeWidth={2} fill="url(#bg3)" name="Benign" />
                <Area type="monotone" dataKey="attack" stroke="#F87171" strokeWidth={2} fill="url(#ag3)" name="Attack" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Attack Types
          </p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
            Distribution
          </p>
          {attackData.length === 0 ? (
            <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                No attacks yet
              </p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie
                    data={attackData}
                    cx="50%" cy="50%"
                    innerRadius={35} outerRadius={55}
                    paddingAngle={3} dataKey="value"
                  >
                    {attackData.map(function(entry, index) {
                      return (
                        <Cell
                          key={index}
                          fill={COLORS[index % COLORS.length]}
                        />
                      )
                    })}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px', fontSize: '12px',
                      color: 'var(--text-primary)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
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
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
            Recent Alerts
          </p>
        </div>
        {alerts.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <Shield size={32} color="var(--success)" style={{ margin: '0 auto 8px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              No alerts — network is clean
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Attack Type</th>
                  <th>Severity</th>
                  <th>Source IP</th>
                  <th>Dest Port</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 10).map(function(alert) {
                  return (
                    <tr key={alert.id}
                   onClick={function() { navigate('/dashboard/organisation/alerts/' + alert.id) }}
  style={{ cursor: 'pointer' }} >
                      <td style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                        {alert.timestamp?.toDate?.()?.toLocaleTimeString() || 'Just now'}
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
                        {alert.dst_port}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '50px', height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
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
