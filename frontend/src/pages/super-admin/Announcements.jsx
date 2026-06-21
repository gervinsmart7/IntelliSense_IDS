import { useState, useEffect } from 'react'
import { MessageSquare, Send, AlertTriangle } from 'lucide-react'
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, orderBy } from 'firebase/firestore'
import { db } from '../../services/firebase'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import useAuthStore from '../../store/useAuthStore'
import toast from 'react-hot-toast'

function Announcements() {
  const { admin } = useAuthStore()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState('announcement')
  const [targetOrgs, setTargetOrgs] = useState('all')
  const [specificOrgs, setSpecificOrgs] = useState('')
  const [sending, setSending] = useState(false)
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEmergencyWarning, setShowEmergencyWarning] = useState(false)

  const announcementTypes = [
    { value: 'announcement', label: '📢 Announcement', description: 'General announcement' },
    { value: 'maintenance_notice', label: '🔧 Maintenance Notice', description: 'Scheduled maintenance' },
    { value: 'emergency_alert', label: '🚨 Emergency Alert', description: 'Critical emergency - requires immediate attention' },
    { value: 'policy_update', label: '📋 Policy Update', description: 'Security or operational policy changes' },
    { value: 'feature_release', label: '✨ Feature Release', description: 'New features or improvements' }
  ]

  useEffect(function() {
    if (!admin?.email) return

    const q = query(
      collection(db, 'notifications'),
      where('sender', '==', 'super_admin'),
      where('createdBy', '==', admin.email),
      orderBy('createdAt', 'desc')
    )

    const unsub = onSnapshot(q, function(snapshot) {
      setAnnouncements(snapshot.docs.map(function(doc) {
        return { id: doc.id, ...doc.data() }
      }))
      setLoading(false)
    }, function(error) {
      console.error('Error fetching announcements:', error)
      setLoading(false)
    })

    return unsub
  }, [admin?.email])

  async function sendAnnouncement() {
    // Validation
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!message.trim()) {
      toast.error('Message is required')
      return
    }

    // Emergency warning
    if (type === 'emergency_alert' && !showEmergencyWarning) {
      toast.error('Please acknowledge this is an emergency alert')
      setShowEmergencyWarning(true)
      return
    }

    setSending(true)
    try {
      const notificationData = {
        type: type,
        severity: type === 'emergency_alert' ? 'critical' : 'info',
        sender: 'super_admin',
        senderName: admin?.full_name || 'Super Admin',
        senderEmail: admin?.email,
        createdBy: admin?.email,
        title: title.trim(),
        message: message.trim(),
        organisationId: targetOrgs === 'all' ? null : (specificOrgs.split(',').map(o => o.trim())),
        targetRoles: ['org_admin', 'platform_admin'],
        read: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      await addDoc(collection(db, 'notifications'), notificationData)

      // Reset form
      setTitle('')
      setMessage('')
      setType('announcement')
      setTargetOrgs('all')
      setSpecificOrgs('')
      setShowEmergencyWarning(false)

      toast.success('Announcement sent successfully')
    } catch (error) {
      console.error('Error sending announcement:', error)
      toast.error('Failed to send announcement: ' + error.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Layout>
      <TopBar title="Create Announcements" />

      <div style={{ display: 'grid', gap: '20px' }}>
        {/* Compose Card */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <MessageSquare size={18} color="var(--accent)" />
            <div>
              <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Create Announcement</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Send important messages to all organizations and admins.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '16px' }}>
            {/* Type Selection */}
            <label style={{ display: 'grid', gap: '8px' }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Announcement Type *</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {announcementTypes.map(function(t) {
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={function() { 
                        setType(t.value)
                        setShowEmergencyWarning(false)
                      }}
                      style={{
                        padding: '12px',
                        border: type === t.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                        background: type === t.value ? 'var(--bg-elevated)' : 'var(--bg)',
                        borderRadius: '8px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{t.label}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>{t.description}</p>
                    </button>
                  )
                })}
              </div>
            </label>

            {/* Title */}
            <label style={{ display: 'grid', gap: '6px' }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Title *</p>
              <input
                className="input"
                value={title}
                onChange={function(e) { setTitle(e.target.value) }}
                placeholder="Announcement title"
                style={{ fontSize: '14px' }}
              />
            </label>

            {/* Message */}
            <label style={{ display: 'grid', gap: '6px' }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Message *</p>
              <textarea
                className="input"
                value={message}
                onChange={function(e) { setMessage(e.target.value) }}
                placeholder="Write your announcement message..."
                rows={6}
                style={{ fontSize: '14px', fontFamily: 'inherit' }}
              />
            </label>

            {/* Target Organizations */}
            <label style={{ display: 'grid', gap: '6px' }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Send to</p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="targetOrgs"
                    value="all"
                    checked={targetOrgs === 'all'}
                    onChange={function(e) { setTargetOrgs(e.target.value) }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>All Organizations</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="targetOrgs"
                    value="specific"
                    checked={targetOrgs === 'specific'}
                    onChange={function(e) { setTargetOrgs(e.target.value) }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Specific Organizations</span>
                </label>
              </div>
              {targetOrgs === 'specific' && (
                <input
                  className="input"
                  value={specificOrgs}
                  onChange={function(e) { setSpecificOrgs(e.target.value) }}
                  placeholder="Enter org IDs separated by commas (e.g., org1, org2, org3)"
                  style={{ fontSize: '13px', marginTop: '8px' }}
                />
              )}
            </label>

            {/* Emergency Alert Warning */}
            {type === 'emergency_alert' && (
              <div style={{
                padding: '12px',
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: '8px',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start'
              }}>
                <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: '#991b1b', margin: 0 }}>Emergency Alert</p>
                  <p style={{ fontSize: '12px', color: '#991b1b', margin: '4px 0 0 0' }}>
                    This will notify all organizations immediately with critical severity. Only use for actual emergencies.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginTop: '8px' }}>
                    <input
                      type="checkbox"
                      checked={showEmergencyWarning}
                      onChange={function(e) { setShowEmergencyWarning(e.target.checked) }}
                    />
                    <span style={{ fontSize: '12px', color: '#991b1b' }}>I acknowledge this is an emergency and requires immediate action</span>
                  </label>
                </div>
              </div>
            )}

            {/* Send Button */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={sendAnnouncement}
                disabled={sending || (type === 'emergency_alert' && !showEmergencyWarning)}
                className="btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Send size={14} /> {sending ? 'Sending...' : 'Send Announcement'}
              </button>
            </div>
          </div>
        </div>

        {/* Recent Announcements */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <MessageSquare size={18} color="var(--accent)" />
            <div>
              <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Recent Announcements</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Your announcements sent to organizations.</p>
            </div>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading announcements…</p>
          ) : announcements.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No announcements sent yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {announcements.map(function(ann) {
                const getIcon = function(t) {
                  if (t === 'announcement') return '📢'
                  if (t === 'maintenance_notice') return '🔧'
                  if (t === 'emergency_alert') return '🚨'
                  if (t === 'policy_update') return '📋'
                  if (t === 'feature_release') return '✨'
                  return '📬'
                }

                const getTypeLabel = function(t) {
                  const labels = {
                    announcement: 'Announcement',
                    maintenance_notice: 'Maintenance',
                    emergency_alert: 'Emergency',
                    policy_update: 'Policy',
                    feature_release: 'Feature'
                  }
                  return labels[t] || t
                }

                return (
                  <div
                    key={ann.id}
                    style={{
                      padding: '12px',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      background: 'var(--bg-elevated)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '16px' }}>{getIcon(ann.type)}</span>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
                            {getTypeLabel(ann.type)}
                          </span>
                        </div>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {ann.title}
                        </p>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                          {ann.message.substring(0, 100)}{ann.message.length > 100 ? '...' : ''}
                        </p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {ann.organisationId === null || !ann.organisationId ? 'All Organizations' : 'Specific Organizations'}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {ann.createdAt?.toDate ? ann.createdAt.toDate().toLocaleString() : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

export default Announcements
