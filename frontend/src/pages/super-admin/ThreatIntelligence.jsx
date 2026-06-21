import { useState, useEffect } from 'react'
import { Shield, ExternalLink, RefreshCw } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart,
  Pie, Cell
} from 'recharts'
import {
  collection, onSnapshot,
  query, orderBy, limit
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'

const MITRE_MAP = {
  'DDoS': { id: 'T1498', tactic: 'Impact', color: '#F87171' },
  'DoS': { id: 'T1499', tactic: 'Impact', color: '#F87171' },
  'DoS Hulk': { id: 'T1499', tactic: 'Impact', color: '#F87171' },
  'DoS GoldenEye': { id: 'T1499', tactic: 'Impact', color: '#F87171' },
  'DoS slowloris': { id: 'T1499.001', tactic: 'Impact', color: '#F87171' },
  'PortScan': { id: 'T1046', tactic: 'Discovery', color: '#60A5FA' },
  'FTP-Patator': { id: 'T1110.001', tactic: 'Credential Access', color: '#FBBF24' },
  'SSH-Patator': { id: 'T1110.001', tactic: 'Credential Access', color: '#FBBF24' },
  'Bot': { id: 'T1587.001', tactic: 'Resource Development', color: '#A78BFA' },
  'Web Attack XSS': { id: 'T1059.007', tactic: 'Execution', color: '#34D399' },
  'Web Attack SQL Injection': { id: 'T1190', tactic: 'Initial Access', color: '#F87171' },
  'Web Attack Brute Force': { id: 'T1110', tactic: 'Credential Access', color: '#FBBF24' },
  'Infiltration': { id: 'T1078', tactic: 'Defense Evasion', color: '#A78BFA' },
  'Heartbleed': { id: 'T1203', tactic: 'Execution', color: '#F87171' }
}

const TACTIC_COLORS = {
  'Impact': '#F87171',
  'Discovery': '#60A5FA',
  'Credential Access': '#FBBF24',
  'Execution': '#34D399',
  'Initial Access': '#6366F1',
  'Defense Evasion': '#A78BFA',
  'Resource Development': '#FB923C'
}

function ThreatIntelligence() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(function() {
    const unsub = onSnapshot(
      query(
        collection(db, 'alerts'),
        orderBy('timestamp', 'desc'),
        limit(1000)
      ),
      function(snap) {
        setAlerts(snap.docs.map(function(d) {
          return { id: d.id, ...d.data() }
        }))
        setLoading(false)
      },
      function(err) {
        console.error(err)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  // Build MITRE technique counts
  const techniqueCounts = {}
  const tacticCounts = {}

  alerts.forEach(function(alert) {
    const attackType = alert.attack_type
    if (!attackType || attackType === 'BENIGN') return

    const mitre = MITRE_MAP[attackType]
    if (!mitre) return

    const key = mitre.id + ' — ' + attackType
    techniqueCounts[key] = (techniqueCounts[key] || 0) + 1
    tacticCounts[mitre.tactic] = (tacticCounts[mitre.tactic] || 0) + 1
  })

  const techniqueData = Object.entries(techniqueCounts)
    .map(function(entry) {
      return { name: entry[0], count: entry[1] }
    })
    .sort(function(a, b) { return b.count - a.count })
    .slice(0, 8)

  const tacticData = Object.entries(tacticCounts)
    .map(function(entry) {
      return {
        name: entry[0],
        value: entry[1],
        color: TACTIC_COLORS[entry[0]] || '#64748B'
      }
    })
    .sort(function(a, b) { return b.value - a.value })

  // Most attacked techniques summary
  const uniqueTechniques = Object.keys(
    Object.fromEntries(
      alerts
        .filter(function(a) { return a.attack_type && a.attack_type !== 'BENIGN' })
        .map(function(a) {
          const m = MITRE_MAP[a.attack_type]
          return [m ? m.id : 'unknown', m]
        })
        .filter(function(entry) { return entry[1] })
    )
  ).length

  return (
    <Layout>
      <TopBar title="Threat Intelligence" />

      {/* Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px', marginBottom: '24px'
      }}>
        {[
          { label: 'Total Attacks', value: alerts.filter(function(a) { return a.attack_type !== 'BENIGN' }).length, color: '#F87171' },
          { label: 'Unique Techniques', value: uniqueTechniques, color: '#6366F1' },
          { label: 'Tactics Observed', value: Object.keys(tacticCounts).length, color: '#FBBF24' },
          { label: 'Critical Alerts', value: alerts.filter(function(a) { return a.severity === 'critical' }).length, color: '#F87171' }
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

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* Technique frequency */}
        <div className="card">
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
            MITRE ATT&CK
          </p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
            Technique Frequency
          </p>
          {techniqueData.length === 0 ? (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No attack data yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={techniqueData}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} width={160} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px', fontSize: '12px',
                    color: 'var(--text-primary)'
                  }}
                />
                <Bar dataKey="count" fill="#6366F1" radius={[0, 4, 4, 0]} name="Occurrences" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tactic distribution */}
        <div className="card">
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Tactic Distribution
          </p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
            ATT&CK Tactics
          </p>
          {tacticData.length === 0 ? (
            <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No data yet</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie
                    data={tacticData}
                    cx="50%" cy="50%"
                    innerRadius={35} outerRadius={55}
                    paddingAngle={3} dataKey="value"
                  >
                    {tacticData.map(function(entry, index) {
                      return <Cell key={index} fill={entry.color} />
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
                {tacticData.slice(0, 5).map(function(item) {
                  return (
                    <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.color }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.name}</span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>{item.value}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Technique Cards */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Detected Techniques
            </p>
            <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              MITRE ATT&CK Framework
            </p>
          </div>
          
          <a  href="https://attack.mitre.org"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
          >
            View Full Framework <ExternalLink size={12} />
          </a>
        </div>

        {Object.entries(MITRE_MAP).map(function(entry) {
          const attackType = entry[0]
          const mitre = entry[1]
          const count = alerts.filter(function(a) {
            return a.attack_type === attackType
          }).length

          if (count === 0) return null

          return (
            <div key={attackType} style={{
              display: 'flex', alignItems: 'center',
              gap: '16px', padding: '12px 16px',
              borderBottom: '1px solid var(--border)'
            }}>
              <div style={{ flexShrink: 0 }}>
                <span style={{
                  fontSize: '12px', fontWeight: '700',
                  fontFamily: 'JetBrains Mono, monospace',
                  color: mitre.color,
                  background: mitre.color + '18',
                  padding: '3px 8px', borderRadius: '4px'
                }}>
                  {mitre.id}
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                  {attackType}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Tactic: {mitre.tactic}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '16px', fontWeight: '700', color: mitre.color }}>
                  {count}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  detections
                </p>
              </div>
              
               <a href={'https://attack.mitre.org/techniques/' + mitre.id.replace('.', '/')}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--text-muted)', display: 'flex' }}
              >
                <ExternalLink size={14} />
              </a>
            </div>
          )
        }).filter(Boolean)}

        {alerts.filter(function(a) { return a.attack_type && a.attack_type !== 'BENIGN' }).length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <Shield size={32} color="var(--success)" style={{ margin: '0 auto 8px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              No attacks detected yet
            </p>
          </div>
        )}
      </div>
    </Layout>
  )
}

export default ThreatIntelligence
