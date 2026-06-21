import { useState, useEffect } from 'react'
import { Download, FileText, Calendar } from 'lucide-react'
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
  const [generating, setGenerating] = useState(false)
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10)
  })

  useEffect(function() {
    if (role === 'org_admin') {
      const unsub = onSnapshot(
        query(
          collection(db, 'alerts'),
          where('org_id', '==', admin.org_id),
          orderBy('timestamp', 'desc'),
          limit(1000)
        ),
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

  function generateCSV() {
    setGenerating(true)
    try {
      const startDate = new Date(dateRange.start)
      const endDate = new Date(dateRange.end)
      endDate.setHours(23, 59, 59)

      const filtered = alerts.filter(function(a) {
        const ts = a.timestamp?.toDate?.()
        if (!ts) return true
        return ts >= startDate && ts <= endDate
      })

      const headers = [
        'Timestamp', 'Organisation', 'Attack Type',
        'Severity', 'Source IP', 'Dest IP',
        'Port', 'Protocol', 'Confidence'
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
          ((a.confidence || 0) * 100).toFixed(0) + '%'
        ].join(',')
      })

      const csv = [headers.join(','), ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ids_report_' + dateRange.start + '_to_' + dateRange.end + '.csv'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Report downloaded — ' + filtered.length + ' records')
    } catch(e) {
      toast.error('Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  function generateSummaryReport() {
    setGenerating(true)
    try {
      const startDate = new Date(dateRange.start)
      const endDate = new Date(dateRange.end)
      endDate.setHours(23, 59, 59)

      const filtered = alerts.filter(function(a) {
        const ts = a.timestamp?.toDate?.()
        if (!ts) return true
        return ts >= startDate && ts <= endDate
      })

      const total = filtered.length
      const attacks = filtered.filter(function(a) { return a.attack_type !== 'BENIGN' }).length
      const critical = filtered.filter(function(a) { return a.severity === 'critical' }).length
      const high = filtered.filter(function(a) { return a.severity === 'high' }).length

      const attackTypes = {}
      filtered.forEach(function(a) {
        if (a.attack_type && a.attack_type !== 'BENIGN') {
          attackTypes[a.attack_type] = (attackTypes[a.attack_type] || 0) + 1
        }
      })

      const lines = [
        'IntelliSense IDS — Security Report',
        'Generated: ' + new Date().toLocaleString(),
        'Period: ' + dateRange.start + ' to ' + dateRange.end,
        '',
        'SUMMARY',
        'Total Alerts: ' + total,
        'Attack Flows: ' + attacks,
        'Critical: ' + critical,
        'High: ' + high,
        '',
        'ATTACK BREAKDOWN',
        ...Object.entries(attackTypes).map(function(entry) {
          return entry[0] + ': ' + entry[1]
        })
      ]

      const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ids_summary_' + dateRange.start + '.txt'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Summary report downloaded')
    } catch(e) {
      toast.error('Failed to generate summary')
    } finally {
      setGenerating(false)
    }
  }

  const reportTypes = [
    {
      title: 'Full Alert Log',
      description: 'Complete CSV export of all alerts in date range including all fields',
      icon: FileText,
      color: 'accent',
      action: generateCSV,
      format: 'CSV'
    },
    {
      title: 'Security Summary',
      description: 'Text summary with totals, attack breakdown and key statistics',
      icon: Calendar,
      color: 'success',
      action: generateSummaryReport,
      format: 'TXT'
    }
  ]

  const colorMap = {
    accent: { bg: 'rgba(99,102,241,0.1)', text: '#6366F1' },
    success: { bg: 'rgba(52,211,153,0.1)', text: '#34D399' }
  }

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
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
              From
            </label>
            <input
              type="date"
              value={dateRange.start}
              onChange={function(e) { setDateRange(function(p) { return { ...p, start: e.target.value } }) }}
              className="input"
              style={{ width: 'auto' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
              To
            </label>
            <input
              type="date"
              value={dateRange.end}
              onChange={function(e) { setDateRange(function(p) { return { ...p, end: e.target.value } }) }}
              className="input"
              style={{ width: 'auto' }}
            />
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
                    setDateRange({
                      start: start.toISOString().slice(0, 10),
                      end: end.toISOString().slice(0, 10)
                    })
                  }}
                  className="btn-secondary"
                  style={{ padding: '8px 12px', fontSize: '12px' }}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Report types */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        {reportTypes.map(function(report) {
          const c = colorMap[report.color]
          return (
            <div key={report.title} className="card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
                <div style={{
                  width: '44px', height: '44px',
                  background: c.bg, borderRadius: '10px',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0
                }}>
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
                <span style={{
                  fontSize: '11px', fontWeight: '600',
                  color: c.text, background: c.bg,
                  padding: '3px 8px', borderRadius: '4px'
                }}>
                  {report.format}
                </span>
                <button
                  onClick={report.action}
                  disabled={generating}
                  className="btn-primary"
                  style={{ padding: '8px 14px', fontSize: '13px' }}
                >
                  <Download size={14} />
                  {generating ? 'Generating...' : 'Download'}
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
