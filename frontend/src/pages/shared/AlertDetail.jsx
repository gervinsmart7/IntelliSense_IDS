import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, AlertTriangle, CheckCircle,
  XCircle, Search, Clock, Shield,
  ExternalLink, MessageSquare, RefreshCw
} from 'lucide-react'
import { alertsAPI } from '../../services/api'
import Layout from '../../components/Layout'
import toast from 'react-hot-toast'
import useAuthStore from '../../store/useAuthStore'

const STATUS_OPTIONS = [
  {
    value: 'new',
    label: 'New',
    color: 'var(--accent)',
    bg: 'rgba(99,102,241,0.1)'
  },
  {
    value: 'investigating',
    label: 'Investigating',
    color: 'var(--warning)',
    bg: 'rgba(251,191,36,0.1)'
  },
  {
    value: 'resolved',
    label: 'Resolved',
    color: 'var(--success)',
    bg: 'rgba(52,211,153,0.1)'
  },
  {
    value: 'false_positive',
    label: 'False Positive',
    color: 'var(--text-muted)',
    bg: 'var(--bg-elevated)'
  }
]

function AlertDetail() {
  const { alertId } = useParams()
  const navigate = useNavigate()
  const { role } = useAuthStore()
  const [alert, setAlert] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [note, setNote] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [pendingStatus, setPendingStatus] = useState(null)

  useEffect(function() {
    loadAlert()
  }, [alertId])

  async function loadAlert() {
    setLoading(true)
    try {
      const res = await alertsAPI.getOne(alertId)
      setAlert(res.data.data)
    } catch(e) {
      toast.error('Failed to load alert')
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(newStatus) {
    setPendingStatus(newStatus)
    setShowNoteInput(true)
  }

  async function confirmStatusChange() {
    if (!pendingStatus) return
    setUpdating(true)
    try {
      await alertsAPI.updateStatus(alertId, pendingStatus, note)
      toast.success('Alert status updated to ' + pendingStatus)
      setShowNoteInput(false)
      setNote('')
      setPendingStatus(null)
      loadAlert()
    } catch(e) {
      toast.error('Failed to update status')
    } finally {
      setUpdating(false)
    }
  }

  function getStatusStyle(status) {
    const opt = STATUS_OPTIONS.find(function(s) {
      return s.value === status
    })
    return opt || STATUS_OPTIONS[0]
  }

  function getSeverityColor(severity) {
    const map = {
      critical: { color: '#F87171', bg: 'rgba(248,113,113,0.1)' },
      high: { color: '#FBBF24', bg: 'rgba(251,191,36,0.1)' },
      medium: { color: '#6366F1', bg: 'rgba(99,102,241,0.1)' },
      low: { color: '#64748B', bg: 'rgba(100,116,139,0.1)' }
    }
    return map[severity] || map.low
  }

  function getBackPath() {
    if (role === 'super_admin') return '/dashboard/super/alerts'
    if (role === 'platform_admin') return '/dashboard/platform/alerts'
    return '/dashboard/organisation/alerts'
  }

  if (loading) {
    return (
      <Layout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div style={{ width: '32px', height: '32px', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      </Layout>
    )
  }

  if (!alert) {
    return (
      <Layout>
        <div style={{ textAlign: 'center', padding: '64px' }}>
          <p style={{ color: 'var(--text-muted)' }}>Alert not found</p>
          <button onClick={function() { navigate(getBackPath()) }} className="btn-primary" style={{ marginTop: '16px' }}>
            Go Back
          </button>
        </div>
      </Layout>
    )
  }

  const severityStyle = getSeverityColor(alert.severity)
  const statusStyle = getStatusStyle(alert.alert_status || 'new')

  return (
    <Layout>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button
          onClick={function() { navigate(getBackPath()) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
        >
          <ArrowLeft size={16} /> Back to Alerts
        </button>
      </div>

      {/* Alert header card */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', background: severityStyle.bg, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertTriangle size={24} color={severityStyle.color} />
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '6px' }}>
                {alert.attack_type}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: '500', color: severityStyle.color, background: severityStyle.bg, padding: '3px 10px', borderRadius: '999px' }}>
                  {alert.severity?.toUpperCase()}
                </span>
                <span style={{ fontSize: '12px', fontWeight: '500', color: statusStyle.color, background: statusStyle.bg, padding: '3px 10px', borderRadius: '999px' }}>
                  {statusStyle.label}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {alert.timestamp?.toDate?.()?.toLocaleString() || 'Unknown time'}
                </span>
              </div>
            </div>
          </div>

          {/* Status Actions */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {STATUS_OPTIONS.filter(function(s) {
              return s.value !== (alert.alert_status || 'new')
            }).map(function(option) {
              return (
                <button
                  key={option.value}
                  onClick={function() { handleStatusChange(option.value) }}
                  style={{
                    padding: '8px 14px', borderRadius: '8px',
                    fontSize: '12px', fontWeight: '500',
                    border: '1px solid ' + option.color + '40',
                    background: option.bg,
                    color: option.color,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Note Input */}
        {showNoteInput && (
          <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-elevated)', borderRadius: '8px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: '500' }}>
              Add a note for this status change (optional)
            </p>
            <textarea
              value={note}
              onChange={function(e) { setNote(e.target.value) }}
              placeholder="e.g. Confirmed attack from external IP, blocked at firewall..."
              style={{
                width: '100%', padding: '10px 12px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '13px', resize: 'vertical',
                minHeight: '80px', outline: 'none',
                fontFamily: 'DM Sans, sans-serif'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button
                onClick={confirmStatusChange}
                disabled={updating}
                className="btn-primary"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                {updating ? 'Updating...' : 'Confirm — Mark as ' + STATUS_OPTIONS.find(function(s) { return s.value === pendingStatus })?.label}
              </button>
              <button
                onClick={function() { setShowNoteInput(false); setPendingStatus(null); setNote('') }}
                className="btn-secondary"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* Flow Details */}
        <div className="card">
          <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
            Flow Details
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { label: 'Source IP', value: alert.src_ip, mono: true },
              { label: 'Destination IP', value: alert.dst_ip, mono: true },
              { label: 'Source Port', value: alert.src_port, mono: true },
              { label: 'Destination Port', value: alert.dst_port, mono: true },
              { label: 'Protocol', value: alert.protocol },
              { label: 'Flow Duration', value: alert.flow_duration ? alert.flow_duration.toFixed(2) + ' ms' : '—' },
              { label: 'ML Confidence', value: ((alert.confidence || 0) * 100).toFixed(1) + '%' },
              { label: 'Organisation', value: alert.org_id?.slice(0, 12) + '...' || '—' }
            ].map(function(item) {
              return (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: '6px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.label}</p>
                  <p style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-primary)', fontFamily: item.mono ? 'JetBrains Mono, monospace' : 'inherit' }}>
                    {item.value || '—'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* MITRE ATT&CK */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Shield size={16} color="var(--accent)" />
            <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
              MITRE ATT&CK Mapping
            </p>
          </div>

          {alert.mitre && (
            <div style={{ padding: '16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '10px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {alert.mitre.id}
                </span>
                
                 href={alert.mitre.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', textDecoration: 'none' }}
              <a>
                  View <ExternalLink size={12} />
                </a>
              </div>
              <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                {alert.mitre.name}
              </p>
              <span style={{ fontSize: '11px', fontWeight: '500', color: 'var(--warning)', background: 'rgba(251,191,36,0.1)', padding: '2px 8px', borderRadius: '999px' }}>
                {alert.mitre.tactic}
              </span>
            </div>
          )}

          {/* Confidence bar */}
          <div style={{ padding: '12px', background: 'var(--bg-elevated)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Detection Confidence</p>
              <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                {((alert.confidence || 0) * 100).toFixed(1)}%
              </p>
            </div>
            <div style={{ height: '6px', background: 'var(--bg-card)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: ((alert.confidence || 0) * 100) + '%', height: '100%', background: alert.confidence > 0.8 ? 'var(--danger)' : alert.confidence > 0.6 ? 'var(--warning)' : 'var(--accent)', borderRadius: '3px', transition: 'width 0.5s ease' }} />
            </div>
          </div>

          {/* False positive button */}
          <button
            onClick={function() { handleStatusChange('false_positive') }}
            style={{ marginTop: '12px', width: '100%', padding: '10px', background: 'none', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <XCircle size={14} />
            Mark as False Positive
          </button>
        </div>
      </div>

      {/* Remediation Steps */}
      {alert.remediation && alert.remediation.length > 0 && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <CheckCircle size={16} color="var(--success)" />
            <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Recommended Remediation Steps
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {alert.remediation.map(function(step, i) {
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ width: '24px', height: '24px', background: 'rgba(52,211,153,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--success)', flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, paddingTop: '4px' }}>
                    {step}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Clock size={16} color="var(--accent)" />
          <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
            Alert Timeline
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {/* Created entry */}
          <div style={{ display: 'flex', gap: '12px', paddingBottom: '16px', position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--danger)', flexShrink: 0, marginTop: '3px' }} />
              {(alert.timeline?.length > 0) && (
                <div style={{ width: '1px', flex: 1, background: 'var(--border)', marginTop: '4px' }} />
              )}
            </div>
            <div>
              <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                Alert Created
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {alert.timestamp?.toDate?.()?.toLocaleString() || 'Unknown'}
              </p>
            </div>
          </div>

          {/* Timeline entries */}
          {(alert.timeline || []).map(function(entry, i) {
            const isLast = i === alert.timeline.length - 1
            return (
              <div key={i} style={{ display: 'flex', gap: '12px', paddingBottom: isLast ? '0' : '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: '3px' }} />
                  {!isLast && (
                    <div style={{ width: '1px', flex: 1, background: 'var(--border)', marginTop: '4px' }} />
                  )}
                </div>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                    Status changed to{' '}
                    <span style={{ color: 'var(--accent)' }}>
                      {entry.to_status?.replace('_', ' ')}
                    </span>
                    {' '}by {entry.admin_email}
                  </p>
                  {entry.note && (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                      "{entry.note}"
                    </p>
                  )}
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {entry.timestamp?.toDate?.()?.toLocaleString() || 'Unknown'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Layout>
  )
}

export default AlertDetail
