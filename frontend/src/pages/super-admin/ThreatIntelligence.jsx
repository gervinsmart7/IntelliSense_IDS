import { useState, useEffect } from 'react'
import { Shield, ExternalLink, Globe, Flag, RefreshCw } from 'lucide-react'
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

const FINANCE_MITRE_MAP = {
  'Credential-Stuffing': { id: 'T1110.004', tactic: 'Credential Access', color: '#FBBF24', pci: 'Req 8.3' },
  'Card-Skim-Probe': { id: 'T1046', tactic: 'Discovery', color: '#60A5FA', pci: 'Req 9.9/11.5' },
  'DDoS-Payment-Gateway': { id: 'T1498', tactic: 'Impact', color: '#F87171', pci: 'Req 6.4' },
  'Data-Exfiltration': { id: 'T1048', tactic: 'Exfiltration', color: '#F87171', pci: 'Req 4.2' },
  'Ransomware-C2': { id: 'T1571', tactic: 'Command and Control', color: '#F87171', pci: 'Req 12.10' },
  'API-Abuse-Banking': { id: 'T1190', tactic: 'Initial Access', color: '#6366F1', pci: 'Req 6.2' },
  'Insider-Exfiltration': { id: 'T1078', tactic: 'Defense Evasion', color: '#A78BFA', pci: 'Req 7.1' },
  'SWIFT-Anomaly': { id: 'T1657', tactic: 'Impact', color: '#F87171', pci: 'Req 10.3' },
  'Cryptojacking': { id: 'T1496', tactic: 'Impact', color: '#FB923C', pci: 'Req 6.3' },
  'Port-Scan-Financial': { id: 'T1046', tactic: 'Discovery', color: '#60A5FA', pci: 'Req 11.5' },
  'DDoS': { id: 'T1498', tactic: 'Impact', color: '#F87171', pci: '' },
  'DoS': { id: 'T1499', tactic: 'Impact', color: '#F87171', pci: '' },
  'DoS Hulk': { id: 'T1499', tactic: 'Impact', color: '#F87171', pci: '' },
  'DoS GoldenEye': { id: 'T1499', tactic: 'Impact', color: '#F87171', pci: '' },
  'DoS slowloris': { id: 'T1499.001', tactic: 'Impact', color: '#F87171', pci: '' },
  'PortScan': { id: 'T1046', tactic: 'Discovery', color: '#60A5FA', pci: '' },
  'FTP-Patator': { id: 'T1110.001', tactic: 'Credential Access', color: '#FBBF24', pci: '' },
  'SSH-Patator': { id: 'T1110.001', tactic: 'Credential Access', color: '#FBBF24', pci: '' },
  'Bot': { id: 'T1587.001', tactic: 'Resource Development', color: '#A78BFA', pci: '' },
  'Web Attack XSS': { id: 'T1059.007', tactic: 'Execution', color: '#34D399', pci: '' },
  'Web Attack SQL Injection': { id: 'T1190', tactic: 'Initial Access', color: '#6366F1', pci: '' },
  'Web Attack Brute Force': { id: 'T1110', tactic: 'Credential Access', color: '#FBBF24', pci: '' },
  'Infiltration': { id: 'T1078', tactic: 'Defense Evasion', color: '#A78BFA', pci: '' },
  'Heartbleed': { id: 'T1203', tactic: 'Execution', color: '#34D399', pci: '' }
}

const TACTIC_COLORS = {
  'Impact': '#F87171',
  'Discovery': '#60A5FA',
  'Credential Access': '#FBBF24',
  'Execution': '#34D399',
  'Initial Access': '#6366F1',
  'Defense Evasion': '#A78BFA',
  'Resource Development': '#FB923C',
  'Exfiltration': '#F87171',
  'Command and Control': '#EC4899'
}

function ThreatIntelligence() {
  const [alerts, setAlerts] = useState([])
  const [ipReputationData, setIpReputationData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(function() {
    const unsubAlerts = onSnapshot(
      query(collection(db, 'alerts'), orderBy('timestamp', 'desc'), limit(1000)),
      function(snap) {
        setAlerts(snap.docs.map(function(d) { return { id: d.id, ...d.data() } }))
        setLoading(false)
      },
      function(err) {
        console.error(err)
        setLoading(false)
      }
    )

    // Load IP reputation cache
    const unsubIP = onSnapshot(
      collection(db, 'ip_reputation_cache'),
      function(snap) {
        const malicious = snap.docs
          .map(function(d) { return d.to_dict ? d.to_dict() : d.data() })
          .filter(function(d) { return d.is_malicious })
          .slice(0, 20)
        setIpReputationData(malicious)
      }
    )

    return function() { unsubAlerts(); unsubIP() }
  }, [])

  // Build technique counts
  const techniqueCounts = {}
  const tacticCounts = {}
  const killChainAlerts = []
  const regulatoryAlerts = []
  const maliciousIPAlerts = []

  alerts.forEach(function(alert) {
    const attackType = alert.attack_type
    if (!attackType || attackType === 'BENIGN') return

    if (alert.is_kill_chain_alert) killChainAlerts.push(alert)
    if (alert.regulatory_flags?.length > 0) regulatoryAlerts.push(alert)
    if (alert.ip_is_malicious) maliciousIPAlerts.push(alert)

    const mitre = FINANCE_MITRE_MAP[attackType]
    if (!mitre) return

    const key = mitre.id + ' — ' + attackType
    techniqueCounts[key] = (techniqueCounts[key] || 0) + 1
    tacticCounts[mitre.tactic] = (tacticCounts[mitre.tactic] || 0) + 1
  })

  const techniqueData = Object.entries(techniqueCounts)
    .map(function(e) { return { name: e[0], count: e[1] } })
    .sort(function(a, b) { return b.count - a.count })
    .slice(0, 8)

  const tacticData = Object.entries(tacticCounts)
    .map(function(e) { return { name: e[0], value: e[1], color: TACTIC_COLORS[e[0]] || '#64748B' } })
    .sort(function(a, b) { return b.value - a.value })

  const uniqueTechniques = Object.keys(
    Object.fromEntries(
      alerts
        .filter(function(a) { return a.attack_type && a.attack_type !== 'BENIGN' })
        .map(function(a) { return [FINANCE_MITRE_MAP[a.attack_type]?.id || 'unknown', true] })
        .filter(function(e) { return e[0] !== 'unknown' })
    )
  ).length

  return (
    <Layout>
      <TopBar title="Threat Intelligence" />

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Attacks', value: alerts.filter(function(a) { return a.attack_type !== 'BENIGN' }).length, color: '#F87171' },
          { label: 'MITRE Techniques', value: uniqueTechniques, color: '#6366F1' },
          { label: 'Kill Chains', value: killChainAlerts.length, color: '#F87171' },
          { label: 'Regulatory Flags', value: regulatoryAlerts.length, color: '#FBBF24' }
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

      {/* Kill Chain Alerts */}
      {killChainAlerts.length > 0 && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Flag size={16} color="var(--danger)" />
            <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Active Kill Chain Campaigns
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {killChainAlerts.slice(0, 5).map(function(alert) {
              return (
                <div key={alert.id} style={{ padding: '14px 16px', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--danger)' }}>
                      {alert.kill_chain_name || alert.attack_type?.replace(/_/g, ' ')}
                    </p>
                    {alert.completion_percent && (
                      <span style={{ fontSize: '11px', color: 'var(--danger)', background: 'rgba(248,113,113,0.1)', padding: '2px 8px', borderRadius: '999px', fontWeight: '600' }}>
                        {alert.completion_percent.toFixed(0)}% Complete
                      </span>
                    )}
                  </div>
                  {alert.matched_steps && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {alert.matched_steps.map(function(step) {
                        return (
                          <span key={step} style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: '4px' }}>
                            {step}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {alert.mitre_tactic && (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      MITRE Chain: {alert.mitre_tactic}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div className="card">
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>MITRE ATT&CK Finance</p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>Technique Frequency</p>
          {techniqueData.length === 0 ? (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No attack data yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={techniqueData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} width={160} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)' }} />
                <Bar dataKey="count" fill="#6366F1" radius={[0, 4, 4, 0]} name="Occurrences" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>Tactic Distribution</p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>ATT&CK Tactics</p>
          {tacticData.length === 0 ? (
            <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={28} color="var(--success)" />
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={tacticData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value">
                    {tacticData.map(function(entry, index) { return <Cell key={index} fill={entry.color} /> })}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '6px' }}>
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

      {/* IP Reputation Panel */}
      {maliciousIPAlerts.length > 0 && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Globe size={16} color="var(--danger)" />
            <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Known Malicious IPs
            </p>
            <span style={{ fontSize: '11px', color: 'var(--danger)', background: 'rgba(248,113,113,0.1)', padding: '2px 8px', borderRadius: '999px', marginLeft: 'auto' }}>
              {maliciousIPAlerts.length} attacks from known threat actors
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Source IP</th>
                  <th>Attack Type</th>
                  <th>Abuse Score</th>
                  <th>Tor Node</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {maliciousIPAlerts.slice(0, 10).map(function(alert) {
                  return (
                    <tr key={alert.id}>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--danger)' }}>
                        {alert.src_ip}
                      </td>
                      <td style={{ fontSize: '13px' }}>{alert.attack_type?.replace(/_/g, ' ')}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '40px', height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: (alert.ip_reputation_score || 0) + '%', height: '100%', background: 'var(--danger)', borderRadius: '2px' }} />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--danger)' }}>{alert.ip_reputation_score || 0}/100</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', color: alert.ip_is_tor ? 'var(--danger)' : 'var(--success)', fontWeight: '600' }}>
                          {alert.ip_is_tor ? 'YES' : 'No'}
                        </span>
                      </td>
                      <td>
                        <span className={'badge badge-' + (alert.severity === 'critical' ? 'danger' : alert.severity === 'high' ? 'warning' : 'accent')}>
                          {alert.severity}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Finance MITRE Technique Cards */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Finance Sector Techniques
            </p>
            <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              MITRE ATT&CK Framework Mapping
            </p>
          </div>
          
           <a href="https://attack.mitre.org"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
          >
            View Full Framework <ExternalLink size={12} />
          </a>
        </div>

        {Object.entries(FINANCE_MITRE_MAP).map(function(entry) {
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
                  {attackType.replace(/-/g, ' ')}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Tactic: {mitre.tactic}
                  </span>
                  {mitre.pci && (
                    <span style={{ fontSize: '10px', color: 'var(--success)', background: 'rgba(52,211,153,0.1)', padding: '1px 6px', borderRadius: '4px', fontWeight: '600' }}>
                      PCI-DSS {mitre.pci}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '18px', fontWeight: '700', color: mitre.color, fontFamily: 'Syne, sans-serif' }}>
                  {count}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  detections
                </p>
              </div>
              
                <a href={'https://attack.mitre.org/techniques/' + mitre.id.replace('.', '/')}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
              >
                <ExternalLink size={14} />
              </a>
            </div>
          )
        }).filter(Boolean)}

        {alerts.filter(function(a) {
          return a.attack_type && a.attack_type !== 'BENIGN'
        }).length === 0 && (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <Shield size={40} color="var(--success)" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              No attacks detected yet — all financial systems secure
            </p>
          </div>
        )}
      </div>
    </Layout>
  )
}

export default ThreatIntelligence

