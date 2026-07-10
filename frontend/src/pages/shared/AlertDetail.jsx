import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, AlertTriangle, CheckCircle,
  XCircle, Clock, Shield, ExternalLink,
  Flag, Database, Globe, Wifi
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

  function handleStatusChange(newStatus) {
    setPendingStatus(newStatus)
    setShowNoteInput(true)
  }

  async function confirmStatusChange() {
    if (!pendingStatus) return
    setUpdating(true)
    try {
      await alertsAPI.updateStatus(alertId, pendingStatus, note)
      toast.success('Alert status updated to ' + pendingStatus.replace('_', ' '))
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
    return STATUS_OPTIONS.find(function(s) {
      return s.value === status
    }) || STATUS_OPTIONS[0]
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

  function formatTimestamp(ts) {
    if (!ts) return 'Unknown'
    if (ts.toDate) return ts.toDate().toLocaleString()
    if (ts._seconds) return new Date(ts._seconds * 1000).toLocaleString()
    return String(ts)
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
  const regulatoryFlags = alert.regulatory_flags || []
  const isKillChain = alert.is_kill_chain_alert || false
  const isCompound = alert.is_compound_alert || false

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

      {/* Kill chain / compound alert banner */}
      {(isKillChain || isCompound) && (
        <div style={{
          padding: '14px 18px',
          background: 'rgba(248,113,113,0.08)',
          border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: '10px',
          marginBottom: '16px',
          display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <Flag size={18} color="var(--danger)" />
          <div>
            <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--danger)' }}>
              {isKillChain ? 'Kill Chain Attack Pattern Detected' : 'Compound Alert — Persistent Attacker'}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {alert.description || 'Multiple related attack events have been correlated into this compound alert.'}
            </p>
          </div>
        </div>
      )}

      {/* Regulatory flags banner */}
      {regulatoryFlags.length > 0 && (
        <div style={{
          padding: '14px 18px',
          background: 'rgba(251,191,36,0.08)',
          border: '1px solid rgba(251,191,36,0.25)',
          borderRadius: '10px',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Flag size={16} color="var(--warning)" />
            <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--warning)' }}>
              Regulatory Action Required
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {regulatoryFlags.map(function(flag) {
              return (
                <span
                  key={flag}
                  style={{
                    fontSize: '11px', fontWeight: '600',
                    color: 'var(--warning)',
                    background: 'rgba(251,191,36,0.12)',
                    border: '1px solid rgba(251,191,36,0.2)',
                    padding: '3px 10px', borderRadius: '999px',
                    fontFamily: 'JetBrains Mono, monospace'
                  }}
                >
                  {flag}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Alert header card */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', background: severityStyle.bg, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertTriangle size={24} color={severityStyle.color} />
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '6px' }}>
                {alert.attack_type?.replace(/_/g, ' ')}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: '500', color: severityStyle.color, background: severityStyle.bg, padding: '3px 10px', borderRadius: '999px' }}>
                  {alert.severity?.toUpperCase()}
                </span>
                <span style={{ fontSize: '12px', fontWeight: '500', color: statusStyle.color, background: statusStyle.bg, padding: '3px 10px', borderRadius: '999px' }}>
                  {statusStyle.label}
                </span>
                {alert.is_financial_port && (
                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#F87171', background: 'rgba(248,113,113,0.1)', padding: '3px 10px', borderRadius: '999px' }}>
                    Financial System Targeted
                  </span>
                )}
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {formatTimestamp(alert.timestamp)}
                </span>
              </div>
            </div>
          </div>

          {/* Status Action Buttons */}
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
                {updating
                  ? 'Updating...'
                  : 'Confirm — Mark as ' + (STATUS_OPTIONS.find(function(s) { return s.value === pendingStatus })?.label || '')
                }
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

      {/* Main content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* Flow Details */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Wifi size={16} color="var(--accent)" />
            <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Flow Details
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { label: 'Source IP', value: alert.src_ip, mono: true },
              { label: 'Destination IP', value: alert.dst_ip, mono: true },
              { label: 'Source Port', value: alert.src_port, mono: true },
              { label: 'Destination Port', value: alert.dst_port, mono: true },
              { label: 'Protocol', value: alert.protocol },
              { label: 'Target System', value: alert.target_system, highlight: true },
              { label: 'Flow Duration', value: alert.flow_duration ? alert.flow_duration.toFixed(2) + ' ms' : '—' },
              { label: 'ML Confidence', value: ((alert.confidence || 0) * 100).toFixed(1) + '%' }
            ].map(function(item) {
              return (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: '6px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.label}</p>
                  <p style={{
                    fontSize: '12px', fontWeight: '500',
                    color: item.highlight ? 'var(--warning)' : 'var(--text-primary)',
                    fontFamily: item.mono ? 'JetBrains Mono, monospace' : 'inherit'
                  }}>
                    {item.value || '—'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* MITRE ATT&CK + IP Reputation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* MITRE Card */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Shield size={16} color="var(--accent)" />
              <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                MITRE ATT&CK
              </p>
            </div>

            {(alert.mitre || alert.mitre_id) && (
              <div style={{ padding: '14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '10px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {alert.mitre?.id || alert.mitre_id}
                  </span>
                  <a
                    href={alert.mitre?.url || ('https://attack.mitre.org/techniques/' + (alert.mitre_id || '').replace('.', '/'))}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', textDecoration: 'none' }}
                  >
                    View <ExternalLink size={12} />
                  </a>
                </div>
                <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {alert.mitre?.name || alert.mitre_name}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '500', color: 'var(--warning)', background: 'rgba(251,191,36,0.1)', padding: '2px 8px', borderRadius: '999px' }}>
                    {alert.mitre?.tactic || alert.mitre_tactic}
                  </span>
                  {(alert.pci_dss_ref || alert.mitre?.pci_dss) && (
                    <span style={{ fontSize: '11px', fontWeight: '500', color: 'var(--success)', background: 'rgba(52,211,153,0.1)', padding: '2px 8px', borderRadius: '999px' }}>
                      PCI-DSS: {alert.pci_dss_ref || alert.mitre?.pci_dss}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Confidence bar */}
            <div style={{ padding: '12px', background: 'var(--bg-elevated)', borderRadius: '8px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Detection Confidence</p>
                <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {((alert.confidence || 0) * 100).toFixed(1)}%
                </p>
              </div>
              <div style={{ height: '6px', background: 'var(--bg-card)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  width: ((alert.confidence || 0) * 100) + '%',
                  height: '100%',
                  background: alert.confidence > 0.8 ? 'var(--danger)' : alert.confidence > 0.6 ? 'var(--warning)' : 'var(--accent)',
                  borderRadius: '3px',
                  transition: 'width 0.5s ease'
                }} />
              </div>
            </div>

            <button
              onClick={function() { handleStatusChange('false_positive') }}
              style={{ width: '100%', padding: '10px', background: 'none', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <XCircle size={14} />
              Mark as False Positive
            </button>
          </div>

          {/* IP Reputation Card */}
          {(alert.ip_reputation_score > 0 || alert.ip_is_malicious || alert.ip_is_tor) && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Globe size={16} color={alert.ip_is_malicious ? 'var(--danger)' : 'var(--text-muted)'} />
                <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  IP Reputation
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: '6px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Source IP</p>
                  <p style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: alert.ip_is_malicious ? 'var(--danger)' : 'var(--text-primary)' }}>
                    {alert.src_ip}
                  </p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: '6px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Malicious</p>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: alert.ip_is_malicious ? 'var(--danger)' : 'var(--success)' }}>
                    {alert.ip_is_malicious ? 'YES — Known Threat' : 'No'}
                  </span>
                </div>
                {alert.ip_is_tor && (
                  <div style={{ padding: '8px 12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '6px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: '600' }}>
                      Tor Exit Node Detected — Attacker is hiding their identity
                    </p>
                  </div>
                )}
                {alert.ip_reputation_score > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: '6px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Abuse Score</p>
                    <p style={{ fontSize: '12px', fontWeight: '600', color: alert.ip_reputation_score > 50 ? 'var(--danger)' : 'var(--warning)' }}>
                      {alert.ip_reputation_score}/100
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Kill Chain Steps */}
      {isKillChain && alert.matched_steps && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Flag size={16} color="var(--danger)" />
            <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Kill Chain Progress — {alert.completion_percent?.toFixed(0)}% Complete
            </p>
          </div>
          <div style={{ height: '6px', background: 'var(--bg-elevated)', borderRadius: '3px', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ width: (alert.completion_percent || 0) + '%', height: '100%', background: 'var(--danger)', borderRadius: '3px' }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {(alert.matched_steps || []).map(function(step) {
              return (
                <span
                  key={step}
                  style={{
                    fontSize: '12px', fontWeight: '500',
                    color: 'var(--danger)',
                    background: 'rgba(248,113,113,0.1)',
                    border: '1px solid rgba(248,113,113,0.2)',
                    padding: '4px 12px', borderRadius: '999px'
                  }}
                >
                  {step}
                </span>
              )
            })}
          </div>
          {alert.mitre_tactic && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
              MITRE Tactic Chain: {alert.mitre_tactic}
            </p>
          )}
        </div>
      )}

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
              const isPciStep = step.includes('PCI-DSS')
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{
                    width: '24px', height: '24px',
                    background: isPciStep ? 'rgba(52,211,153,0.1)' : 'rgba(99,102,241,0.1)',
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: '700',
                    color: isPciStep ? 'var(--success)' : 'var(--accent)',
                    flexShrink: 0
                  }}>
                    {i + 1}
                  </div>
                  <p style={{
                    fontSize: '13px',
                    color: isPciStep ? 'var(--success)' : 'var(--text-muted)',
                    lineHeight: 1.5, paddingTop: '4px',
                    fontWeight: isPciStep ? '500' : '400'
                  }}>
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

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Created */}
          <div style={{ display: 'flex', gap: '12px', paddingBottom: '16px' }}>
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
                {formatTimestamp(alert.timestamp)}
              </p>
            </div>
          </div>

          {/* Timeline entries */}
          {(alert.timeline || []).map(function(entry, i) {
            const isLast = i === (alert.timeline.length - 1)
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
                      {entry.to_status?.replace(/_/g, ' ')}
                    </span>
                    {' '}by {entry.admin_email}
                  </p>
                  {entry.note && (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                      "{entry.note}"
                    </p>
                  )}
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {formatTimestamp(entry.timestamp)}
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
