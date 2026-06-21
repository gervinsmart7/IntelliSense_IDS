import { useState, useEffect } from 'react'
import { Building2, AlertTriangle, Brain, Activity } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { modelAPI, analyticsAPI } from '../../services/api'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import StatCard from '../../components/StatCard'
import RiskScore from '../../components/RiskScore'

const COLORS = ['#6366F1', '#34D399', '#FBBF24', '#F87171', '#60A5FA', '#A78BFA']
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

function PlatformDashboard() {
  const [organisations, setOrganisations] = useState([])
  const [alerts, setAlerts] = useState([])
  const [productionModel, setProductionModel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [riskData, setRiskData] = useState([])
  const [trafficData, setTrafficData] = useState([])
  const [orgTrafficData, setOrgTrafficData] = useState([])
  const [attackData, setAttackData] = useState([])
  
  useEffect(function() {
    const unsubOrgs = onSnapshot(collection(db, 'organisations'), function(snap) {
      setOrganisations(snap.docs.map(function(d) { return { id: d.id, ...d.data() } }))
    })
    const unsubAlerts = onSnapshot(
      query(collection(db, 'alerts'), orderBy('timestamp', 'desc'), limit(200)),
      function(snap) {
        setAlerts(snap.docs.map(function(d) { return { id: d.id, ...d.data() } }))
      }
    )
    modelAPI.getProduction()
      .then(function(res) { setProductionModel(res.data.data) })
      .catch(console.error)
      .finally(function() { setLoading(false) })

    analyticsAPI.getRiskRanking()
    .then(function(res) {
      setRiskData(res.data.data || [])
    })
    .catch(console.error)
    
    analyticsAPI.getTraffic('all', '7d')
      .then(function(res) {
        setTrafficData(res.data.data || [])
      })
      .catch(function(err) {
        console.error('Failed to fetch global traffic:', err)
        setTrafficData([])
      })
    
    analyticsAPI.getAttackTypes('all')
      .then(function(res) {
        setAttackData(res.data.data || [])
      })
      .catch(function(err) {
        console.error('Failed to fetch attack types:', err)
        setAttackData([])
      })

    analyticsAPI.getGlobal()
      .then(function(res) {
        const orgStats = res.data.data?.org_stats || []
        setOrgTrafficData(orgStats.map(function(org) {
          return {
            name: org.org_code || org.name?.slice(0, 6) || 'Unknown',
            attack: org.attack_count || 0,
            benign: Math.max((org.alert_count || 0) - (org.attack_count || 0), 0)
          }
        }))
      })
      .catch(function(err) {
        console.error('Failed to fetch org traffic comparison:', err)
        setOrgTrafficData([])
      })

    return function() {
      unsubOrgs()
      unsubAlerts()
    }
  }, [])


  const onlineOrgs = organisations.filter(function(o) { 
    return o.agent_status === 'online' 
  }).length
  
  const criticalAlerts = alerts.filter(function(a) {
    return a.severity === 'critical' 
  }).length

  const stableSeed = function(value) {
    let hash = 0
    for (let i = 0; i < value.length; i++) {
      hash = (hash << 5) - hash + value.charCodeAt(i)
      hash |= 0
    }
    return Math.abs(hash)
  }

  const stableValue = function(seed, min, max) {
    const scaled = ((seed * 9301 + 49297) % 233280) / 233280
    return Math.floor(min + scaled * (max - min + 1))
  }
  
  if (loading) {
   return (
    <Layout>
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', height: '60vh'
      }}>
        <div style={{
          width: '32px', height: '32px',
          border: '2px solid var(--border)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
      </div>
    </Layout>
   )
    }
  
  return (
    <Layout>
      <TopBar title="Platform-Admin Dashboard"  showSearch={false} />

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '16px', 
        marginBottom: '24px' 
      }}>
        <StatCard title="Organisations" 
          value={organisations.length} 
          subtitle={onlineOrgs + ' online'} 
          icon={Building2} 
          color="accent" 
        />
        <StatCard title="Online Agents" 
          value={onlineOrgs + '/' + organisations.length} 
          subtitle="Active now" 
          icon={Activity} 
          color="success" 
        />
        <StatCard title="Alerts Today" 
          value={alerts.length} 
          subtitle={criticalAlerts + ' critical'} 
          icon={AlertTriangle} 
          color="danger" 
        />
        <StatCard title="Model Version" 
          value={productionModel?.version || 'None'} 
          subtitle={productionModel 
            ? 'F1: ' + productionModel.f1_score?.toFixed(3) 
            : 'No model'} 
          icon={Brain} 
          color="warning" 
        />
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '2fr 1fr', 
        gap: '16px', 
        marginBottom: '16px' 
      }}>

        <div className="card">
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Global Traffic</p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
            Last 7 Days
          </p>
          <ResponsiveContainer width="100%" height={180}>
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
              <Area type="monotone" dataKey="benign" stroke="#34D399" strokeWidth={2} fill="url(#bg2)" name="Benign" />
              <Area type="monotone" dataKey="attack" stroke="#F87171" strokeWidth={2} fill="url(#ag2)" name="Attack" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

{/* Attack types */}
        <div className="card">
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Attack Types
          </p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
            Distribution
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={attackData}
                cx="50%" cy="50%"
                innerRadius={40} outerRadius={65}
                paddingAngle={3} dataKey="value"
              >
                {attackData.map(function(entry, index) {
                  return <Cell key={index} fill={COLORS[index % COLORS.length]} />
                })}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '12px'
                }}
              />
            </PieChart>

          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            {attackData.map(function(item, i) {
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: COLORS[i] }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.name}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{item.value}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

{/* Charts Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* Per org comparison */}
        <div className="card">
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Per Organisation
          </p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
            Traffic Comparison
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={orgTrafficData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="benign" fill="#34D399" radius={[4, 4, 0, 0]} name="Benign" />
              <Bar dataKey="attack" fill="#F87171" radius={[4, 4, 0, 0]} name="Attack" />
            </BarChart>
          </ResponsiveContainer>
        </div>

{/* Agent status */}
        <div className="card">
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Agent Status
          </p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
            All Organisations
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
            {organisations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No organisations yet
              </div>
            ) : (
              organisations.map(function(org) {
                const isOnline = org.agent_status === 'online'
                return (
                  <div key={org.id} style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: 'var(--bg-elevated)',
                    borderRadius: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className={'pulse-dot ' + (isOnline ? 'online' : 'offline')} />
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-primary)' }}>
                          {org.name}
                        </p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                          {org.org_code}
                        </p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className={'badge badge-' + (isOnline ? 'success' : 'danger')}>
                        {org.agent_status || 'offline'}
                      </span>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {org.model_version || 'no model'}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

   {/* Risk Ranking */}
{riskData.length > 0 && (
  <div className="card" style={{ marginBottom: '16px' }}>
    <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
      Organisation Risk Ranking
    </p>
    <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
      Highest Risk First
    </p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {riskData.slice(0, 8).map(function(item, i) {
        return (
          <div key={item.org_id} style={{
            display: 'flex', alignItems: 'center',
            gap: '16px', padding: '12px 16px',
            background: 'var(--bg-elevated)',
            borderRadius: '8px'
          }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', width: '20px' }}>
              #{i + 1}
            </span>
            <RiskScore score={item.score} level={item.level} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                {item.org_name}
              </p>
              <p style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                {item.org_code}
              </p>
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
        <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
          Recent Alerts
        </p>
        <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
          All Organisations
        </p>

        {alerts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <p style={{ color: 'var(--success)', fontSize: '13px' }}>
              No alerts — network is clean
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Org</th>
                  <th>Attack Type</th>
                  <th>Severity</th>
                  <th>Source IP</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 10).map(function(alert) {
                  const org = organisations.find(function(o) {
                    return o.org_id === alert.org_id
                  })
                  const severityColor = {
                    critical: 'danger',
                    high: 'warning',
                    medium: 'accent',
                    low: 'muted'
                  }[alert.severity] || 'muted'

                  return (
                    <tr key={alert.id}>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-muted)' }}>
                        {alert.timestamp?.toDate ? alert.timestamp.toDate().toLocaleTimeString() : 'Just now'}
                      </td>
                      <td>
                        <span className="badge badge-accent">
                          {org?.org_code || '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: '13px' }}>{alert.attack_type}</td>
                      <td>
                        <span className={'badge badge-' + severityColor}>
                          {alert.severity}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-muted)' }}>
                        {alert.src_ip}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '60px', height: '4px',
                            background: 'var(--bg-elevated)',
                            borderRadius: '2px', overflow: 'hidden'
                          }}>
                            <div style={{
                              width: ((alert.confidence || 0) * 100) + '%',
                              height: '100%',
                              background: 'var(--accent)',
                              borderRadius: '2px'
                            }} />
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
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
 
export default PlatformDashboard
