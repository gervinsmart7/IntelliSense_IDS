import { useState, useEffect } from 'react'
import {
  Download, FileText, Calendar,
  Shield, Flag, AlertTriangle
} from 'lucide-react'
import {
  collection, query, where,
  onSnapshot, orderBy, limit
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import useAuthStore from '../../store/useAuthStore'
import toast from 'react-hot-toast'

function Reports() {
  const { admin, role } = useAuthStore()
  const [alerts, setAlerts] = useState([])
  const [organisations, setOrganisations] = useState([])
  const [generating, setGenerating] = useState(null)
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10)
  })

  useEffect(function() {
    if (role === 'org_admin') {
      const unsub = onSnapshot(
        query(collection(db, 'alerts'), where('org_id', '==', admin.org_id), orderBy('timestamp', 'desc'), limit(1000)),
        function(snap) {
          setAlerts(snap.docs.map(function(d) { return { id: d.id, ...d.data() } }))
        }
      )
      return unsub
    } else {
      const unsubOrgs = onSnapshot(collection(db, 'organisations'), function(snap) {
        setOrganisations(snap.docs.map(function(d) { return { id: d.id, ...d.data() } }))
      })
      const unsubAlerts = onSnapshot(
        query(collection(db, 'alerts'), orderBy('timestamp', 'desc'), limit(1000)),
        function(snap) {
          setAlerts(snap.docs.map(function(d) { return { id: d.id, ...d.data() } }))
        }
      )
      return function() { unsubOrgs(); unsubAlerts() }
    }
  }, [admin?.org_id, role])

  function getFilteredAlerts() {
    const startDate = new Date(dateRange.start)
    const endDate = new Date(dateRange.end)
    endDate.setHours(23, 59, 59)
    return alerts.filter(function(a) {
      const ts = a.timestamp?.toDate?.()
      if (!ts) return true
      return ts >= startDate && ts <= endDate
    })
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function generateFullCSV() {
    setGenerating('csv')
    try {
      const filtered = getFilteredAlerts()
      const headers = [
        'Timestamp', 'Organisation', 'Attack Type', 'Severity',
        'Source IP', 'Dest IP', 'Port', 'Protocol',
        'Target System', 'Confidence', 'Status',
        'MITRE ID', 'PCI-DSS Ref', 'Regulatory Flags',
        'IP Malicious', 'Financial Port'
      ]
      const rows = filtered.map(function(a) {
        const org = organisations.find(function(o) { return o.org_id === a.org_id })
        return [
          a.timestamp?.toDate?.()?.toISOString() || '',
          org?.org_code || admin?.org_code || '',
          a.attack_type || '',
          a.severity || '',
          a.src_ip || '',
          a.dst_ip || '',
          a.dst_port || '',
          a.protocol || '',
          a.target_system || '',
          ((a.confidence || 0) * 100).toFixed(0) + '%',
          a.alert_status || 'new',
          a.mitre_id || '',
          a.pci_dss_ref || '',
          (a.regulatory_flags || []).join('; '),
          a.ip_is_malicious ? 'YES' : 'No',
          a.is_financial_port ? 'YES' : 'No'
        ].join(',')
      })
      const csv = [headers.join(','), ...rows].join('\n')
      downloadFile(csv, 'ids_report_' + dateRange.start + '_to_' + dateRange.end + '.csv', 'text/csv')
      toast.success('Report downloaded — ' + filtered.length + ' records')
    } catch(e) {
      toast.error('Failed to generate report')
    } finally {
      setGenerating(null)
    }
  }

  function generatePCIDSSReport() {
    setGenerating('pci')
    try {
      const filtered = getFilteredAlerts()

      const pciRequirements = [
        {
          id: 'Requirement 6.4',
          name: 'Develop and maintain secure systems (DDoS Resilience)',
          attack_types: ['DDoS', 'DoS'],
          incidents: filtered.filter(function(a) { return a.attack_type?.toLowerCase().includes('ddos') || a.attack_type?.toLowerCase().includes('dos') }).length
        },
        {
          id: 'Requirement 8.3',
          name: 'Secure individual non-consumer authentication (MFA)',
          attack_types: ['Credential-Stuffing', 'SSH-Patator', 'FTP-Patator'],
          incidents: filtered.filter(function(a) { return a.attack_type?.toLowerCase().includes('credential') || a.attack_type?.toLowerCase().includes('patator') }).length
        },
        {
          id: 'Requirement 11.5',
          name: 'Deploy a change-detection mechanism (IDS monitoring)',
          attack_types: ['PortScan', 'Port-Scan-Financial', 'Card-Skim-Probe'],
          incidents: filtered.filter(function(a) { return a.attack_type?.toLowerCase().includes('scan') || a.attack_type?.toLowerCase().includes('skim') }).length
        },
        {
          id: 'Requirement 4.2',
          name: 'Never send unprotected PANs (Data Protection)',
          attack_types: ['Data-Exfiltration'],
          incidents: filtered.filter(function(a) { return a.attack_type?.toLowerCase().includes('exfil') }).length
        },
        {
          id: 'Requirement 12.10',
          name: 'Implement an incident response plan',
          attack_types: ['Ransomware-C2'],
          incidents: filtered.filter(function(a) { return a.attack_type?.toLowerCase().includes('ransomware') }).length
        },
        {
          id: 'Requirement 9.9',
          name: 'Protect devices from tampering (ATM/POS)',
          attack_types: ['Card-Skim-Probe'],
          incidents: filtered.filter(function(a) { return a.attack_type?.toLowerCase().includes('skim') }).length
        },
        {
          id: 'Requirement 7.1',
          name: 'Limit access to system components (Least Privilege)',
          attack_types: ['Insider-Exfiltration'],
          incidents: filtered.filter(function(a) { return a.attack_type?.toLowerCase().includes('insider') }).length
        },
        {
          id: 'Requirement 6.2',
          name: 'Protect all system components from known vulnerabilities',
          attack_types: ['API-Abuse-Banking', 'Web Attack SQL Injection'],
          incidents: filtered.filter(function(a) { return a.attack_type?.toLowerCase().includes('api') || a.attack_type?.toLowerCase().includes('sql') }).length
        }
      ]

      const totalAlerts = filtered.length
      const criticalAlerts = filtered.filter(function(a) { return a.severity === 'critical' }).length
      const regulatoryFlags = filtered.filter(function(a) { return a.regulatory_flags?.length > 0 }).length
      const resolvedAlerts = filtered.filter(function(a) { return a.alert_status === 'resolved' }).length
      const unresolvedAlerts = filtered.filter(function(a) { return a.alert_status === 'new' || a.alert_status === 'investigating' }).length

      const requirementsText = pciRequirements.map(function(req) {
        const status = req.incidents === 0 ? 'COMPLIANT' : req.incidents < 3 ? 'REVIEW REQUIRED' : 'NON-COMPLIANT'
        return [
          req.id + ' — ' + req.name,
          'Status: ' + status,
          'Incidents Detected: ' + req.incidents,
          'Attack Types: ' + req.attack_types.join(', '),
          req.incidents > 0 ? 'ACTION REQUIRED: Review and address incidents related to this requirement.' : 'No incidents detected for this requirement during the report period.',
          ''
        ].join('\n')
      }).join('\n')

      const reportContent = [
        '='.repeat(60),
        'INTELLISENSE IDS — PCI-DSS COMPLIANCE REPORT',
        '='.repeat(60),
        '',
        'Organisation: ' + (admin?.org_code || 'All Organisations'),
        'Report Period: ' + dateRange.start + ' to ' + dateRange.end,
        'Generated: ' + new Date().toLocaleString(),
        'Generated By: IntelliSense IDS Financial Security Platform',
        '',
        '='.repeat(60),
        'EXECUTIVE SUMMARY',
        '='.repeat(60),
        '',
        'Total Security Alerts: ' + totalAlerts,
        'Critical Alerts: ' + criticalAlerts,
        'Regulatory-Flagged Alerts: ' + regulatoryFlags,
        'Resolved Alerts: ' + resolvedAlerts,
        'Unresolved Alerts: ' + unresolvedAlerts,
        '',
        'Overall Compliance Posture: ' + (criticalAlerts === 0 ? 'SATISFACTORY' : criticalAlerts < 5 ? 'REQUIRES ATTENTION' : 'CRITICAL — IMMEDIATE ACTION NEEDED'),
        '',
        '='.repeat(60),
        'PCI-DSS REQUIREMENT STATUS',
        '='.repeat(60),
        '',
        requirementsText,
        '='.repeat(60),
        'DISCLAIMER',
        '='.repeat(60),
        '',
        'This report is generated by IntelliSense IDS based on',
        'network traffic analysis and detected security events.',
        'This report does not constitute a formal PCI-DSS audit.',
        'A qualified security assessor (QSA) must conduct a',
        'formal PCI-DSS assessment for compliance certification.',
        '',
        'IntelliSense IDS Financial Security Platform 2026'
      ].join('\n')

      downloadFile(
        reportContent,
        'pci_dss_report_' + dateRange.start + '.txt',
        'text/plain'
      )
      toast.success('PCI-DSS compliance report downloaded')
    } catch(e) {
      toast.error('Failed to generate PCI-DSS report')
    } finally {
      setGenerating(null)
    }
  }

  function generateIncidentReport() {
    setGenerating('incident')
    try {
      const filtered = getFilteredAlerts()
      const criticalAlerts = filtered.filter(function(a) { return a.severity === 'critical' })
      const regulatoryAlerts = filtered.filter(function(a) { return a.regulatory_flags?.length > 0 })

      const incidentsText = criticalAlerts.slice(0, 20).map(function(a, i) {
        return [
          'Incident #' + (i + 1),
          'Date/Time: ' + (a.timestamp?.toDate?.()?.toLocaleString() || 'Unknown'),
          'Attack Type: ' + a.attack_type,
          'Severity: ' + a.severity?.toUpperCase(),
          'Source IP: ' + a.src_ip,
          'Target System: ' + (a.target_system || 'Port ' + a.dst_port),
          'MITRE Technique: ' + (a.mitre_id || 'Unknown') + ' — ' + (a.mitre_name || ''),
          'PCI-DSS Reference: ' + (a.pci_dss_ref || 'Review requirements'),
          'Regulatory Flags: ' + (a.regulatory_flags?.join(', ') || 'None'),
          'Status: ' + (a.alert_status || 'new'),
          'Resolution: ' + (a.alert_status === 'resolved' ? 'Resolved' : 'Pending investigation'),
          ''
        ].join('\n')
      }).join('\n')

      const reportContent = [
        '='.repeat(60),
        'INTELLISENSE IDS — SECURITY INCIDENT REPORT',
        '='.repeat(60),
        '',
        'Organisation: ' + (admin?.org_code || 'All Organisations'),
        'Report Period: ' + dateRange.start + ' to ' + dateRange.end,
        'Generated: ' + new Date().toLocaleString(),
        '',
        '='.repeat(60),
        'INCIDENT SUMMARY',
        '='.repeat(60),
        '',
        'Total Alerts: ' + filtered.length,
        'Critical Incidents: ' + criticalAlerts.length,
        'Regulatory Reportable: ' + regulatoryAlerts.length,
        '',
        regulatoryAlerts.length > 0 ? [
          'REGULATORY NOTIFICATION STATUS',
          '-'.repeat(40),
          'The following regulatory notifications may be required:',
          ...regulatoryAlerts.flatMap(function(a) {
            return (a.regulatory_flags || []).map(function(f) { return '  • ' + f })
          }),
          'NOTE: Verify notification requirements with your compliance',
          'officer. GDPR requires notification within 72 hours.',
          ''
        ].join('\n') : '',
        '='.repeat(60),
        'CRITICAL INCIDENTS DETAIL',
        '='.repeat(60),
        '',
        criticalAlerts.length === 0
          ? 'No critical incidents detected during this period.'
          : incidentsText,
        '='.repeat(60),
        'IntelliSense IDS Financial Security Platform 2026'
      ].join('\n')

      downloadFile(
        reportContent,
        'incident_report_' + dateRange.start + '.txt',
        'text/plain'
      )
      toast.success('Incident report downloaded')
    } catch(e) {
      toast.error('Failed to generate incident report')
    } finally {
      setGenerating(null)
    }
  }

  function generateExecutiveSummary() {
    setGenerating('exec')
    try {
      const filtered = getFilteredAlerts()
      const total = filtered.length
      const critical = filtered.filter(function(a) { return a.severity === 'critical' }).length
      const high = filtered.filter(function(a) { return a.severity === 'high' }).length
      const resolved = filtered.filter(function(a) { return a.alert_status === 'resolved' }).length
      const regulatoryCount = filtered.filter(function(a) { return a.regulatory_flags?.length > 0 }).length

      const attackTypes = {}
      filtered.forEach(function(a) {
        if (a.attack_type && a.attack_type !== 'BENIGN') {
          attackTypes[a.attack_type] = (attackTypes[a.attack_type] || 0) + 1
        }
      })
      const topAttack = Object.entries(attackTypes).sort(function(a, b) { return b[1] - a[1] })[0]

      const posture = critical === 0 ? 'GOOD' : critical < 3 ? 'FAIR — ACTION REQUIRED' : 'POOR — IMMEDIATE ATTENTION NEEDED'

      const reportContent = [
        '='.repeat(60),
        'INTELLISENSE IDS — EXECUTIVE SECURITY SUMMARY',
        '='.repeat(60),
        '',
        'Prepared for: Board Risk Committee',
        'Organisation: ' + (admin?.org_code || 'All Organisations'),
        'Period: ' + dateRange.start + ' to ' + dateRange.end,
        'Date: ' + new Date().toLocaleDateString(),
        '',
        '='.repeat(60),
        'SECURITY POSTURE: ' + posture,
        '='.repeat(60),
        '',
        'KEY METRICS',
        '-'.repeat(40),
        'Total threat alerts detected:     ' + total,
        'Critical severity incidents:       ' + critical,
        'High severity incidents:           ' + high,
        'Successfully resolved:             ' + resolved + ' (' + (total > 0 ? Math.round(resolved / total * 100) : 0) + '%)',
        'Requiring regulatory action:       ' + regulatoryCount,
        '',
        topAttack ? 'PRIMARY THREAT: ' + topAttack[0] + ' (' + topAttack[1] + ' detections)' : 'No significant threats detected.',
        '',
        '='.repeat(60),
        'RISK ASSESSMENT',
        '='.repeat(60),
        '',
        critical === 0
          ? 'No critical threats were detected during this period. The organisation\'s financial network infrastructure demonstrated adequate security posture.'
          : critical + ' critical threats were detected during this period. Immediate review of security controls is recommended. The security team has been alerted and is investigating.',
        '',
        regulatoryCount > 0
          ? 'IMPORTANT: ' + regulatoryCount + ' incidents have been flagged as potentially requiring regulatory notification. The Compliance team should review these incidents and determine notification obligations under GDPR, PCI-DSS, and applicable banking regulations.'
          : 'No incidents during this period required regulatory notification.',
        '',
        '='.repeat(60),
        'RECOMMENDATIONS',
        '='.repeat(60),
        '',
        critical > 0 ? '1. URGENT: Review and resolve all ' + critical + ' critical alerts immediately.' : '1. Continue routine security monitoring.',
        regulatoryCount > 0 ? '2. URGENT: Initiate regulatory notification assessment for ' + regulatoryCount + ' flagged incidents.' : '2. Maintain current compliance posture.',
        '3. Ensure IDS agent remains online and model is current.',
        '4. Review and update incident response procedures quarterly.',
        '5. Conduct staff security awareness training if credential attacks detected.',
        '',
        '='.repeat(60),
        'This report is confidential and prepared for internal use only.',
        'IntelliSense IDS Financial Security Platform 2026'
      ].join('\n')

      downloadFile(
        reportContent,
        'executive_summary_' + dateRange.start + '.txt',
        'text/plain'
      )
      toast.success('Executive summary downloaded')
    } catch(e) {
      toast.error('Failed to generate executive summary')
    } finally {
      setGenerating(null)
    }
  }

  const reportTypes = [
    {
      key: 'csv',
      title: 'Full Alert Log',
      description: 'Complete CSV export with all fields including MITRE IDs, PCI-DSS references, regulatory flags, and IP reputation data',
      icon: FileText,
      color: 'accent',
      action: generateFullCSV,
      format: 'CSV'
    },
    {
      key: 'pci',
      title: 'PCI-DSS Compliance Report',
      description: 'Maps detected incidents to specific PCI-DSS requirements. Shows compliant/non-compliant status per requirement',
      icon: Shield,
      color: 'success',
      action: generatePCIDSSReport,
      format: 'TXT'
    },
    {
      key: 'incident',
      title: 'Security Incident Report',
      description: 'Detailed incident log with regulatory notification requirements, MITRE mappings, and resolution status',
      icon: AlertTriangle,
      color: 'danger',
      action: generateIncidentReport,
      format: 'TXT'
    },
    {
      key: 'exec',
      title: 'Executive Security Summary',
      description: 'Board-level summary of security posture, key metrics, risk assessment, and recommendations',
      icon: Flag,
      color: 'warning',
      action: generateExecutiveSummary,
      format: 'TXT'
    }
  ]

  const colorMap = {
    accent: { bg: 'rgba(99,102,241,0.1)', text: '#6366F1' },
    success: { bg: 'rgba(52,211,153,0.1)', text: '#34D399' },
    danger: { bg: 'rgba(248,113,113,0.1)', text: '#F87171' },
    warning: { bg: 'rgba(251,191,36,0.1)', text: '#FBBF24' }
  }

  const filteredAlerts = getFilteredAlerts()

  return (
    <Layout>
      <TopBar title="Reports" />

      {/* Date range */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
          Report Date Range
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>From</label>
            <input type="date" value={dateRange.start} onChange={function(e) { setDateRange(function(p) { return { ...p, start: e.target.value } }) }} className="input" style={{ width: 'auto' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>To</label>
            <input type="date" value={dateRange.end} onChange={function(e) { setDateRange(function(p) { return { ...p, end: e.target.value } }) }} className="input" style={{ width: 'auto' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '18px', flexWrap: 'wrap' }}>
            {[
              { label: 'Today', days: 0 },
              { label: 'Last 7 days', days: 7 },
              { label: 'Last 30 days', days: 30 }
            ].map(function(preset) {
              return (
                <button
                  key={preset.label}
                  onClick={function() {
                    const end = new Date()
                    const start = new Date(Date.now() - preset.days * 24 * 60 * 60 * 1000)
                    setDateRange({ start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) })
                  }}
                  className="btn-secondary"
                  style={{ padding: '8px 12px', fontSize: '12px' }}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
              {filteredAlerts.length.toLocaleString()} records
            </p>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>in selected period</p>
          </div>
        </div>
      </div>

      {/* Report types */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        {reportTypes.map(function(report) {
          const c = colorMap[report.color]
          return (
            <div key={report.key} className="card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
                <div style={{ width: '44px', height: '44px', background: c.bg, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <report.icon size={20} color={c.text} />
                </div>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {report.title}
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    {report.description}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: c.text, background: c.bg, padding: '3px 8px', borderRadius: '4px' }}>
                  {report.format}
                </span>
                <button
                  onClick={report.action}
                  disabled={generating === report.key}
                  className="btn-primary"
                  style={{ padding: '8px 14px', fontSize: '13px' }}
                >
                  <Download size={14} />
                  {generating === report.key ? 'Generating...' : 'Download'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </Layout>
  )
}

export default Reports
