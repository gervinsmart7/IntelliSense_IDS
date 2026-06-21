import { useState, useEffect } from 'react'
import { Bell, Send, Plus, CheckCircle, MessageSquare } from 'lucide-react'
import {
  collection, query, onSnapshot, addDoc,
  updateDoc, doc, serverTimestamp, where, arrayUnion, orderBy, writeBatch
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import useAuthStore from '../../store/useAuthStore'
import toast from 'react-hot-toast'

const SEVERITY_COLOR = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308',
  low: '#3b82f6', info: '#9ca3af'
}

const TYPE_ICONS = {
  security_alert: '🚨', agent_offline: '⚠️', agent_online: '✅',
  resource_warning: '⚠️', threat_intel_update: 'ℹ️', model_deployed: '📢',
  failed_login_attempt: '🔒', announcement: '📢', maintenance_notice: '🔧',
  emergency_alert: '🚨', policy_update: '📋', feature_release: '✨',
  PLATFORM_MESSAGE: '📨'
}

const TYPE_LABELS = {
  security_alert: 'Security Alert', agent_offline: 'Agent Offline',
  agent_online: 'Agent Online', resource_warning: 'Resource Warning',
  threat_intel_update: 'Threat Intel', model_deployed: 'Model Deployed',
  failed_login_attempt: 'Failed Login', announcement: 'Announcement',
  maintenance_notice: 'Maintenance', emergency_alert: 'Emergency Alert',
  policy_update: 'Policy Update', feature_release: 'Feature Release',
  PLATFORM_MESSAGE: 'Platform Message'
}

function Notifications() {
  const { admin } = useAuthStore()
  const [tab, setTab] = useState('inbox')

  // Inbox — two parallel queries merged
  const [inbox, setInbox] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  // Sent messages to super admin
  const [sent, setSent] = useState([])

  // Compose
  const [showCompose, setShowCompose] = useState(false)
  const [composeTitle, setComposeTitle] = useState('')
  const [composeMessage, setComposeMessage] = useState('')
  const [sending, setSending] = useState(false)

  // ── Inbox query: org-specific + broadcasts merged ──
  useEffect(function() {
    if (!admin?.org_id) return

    let orgDocs = []
    let broadcastDocs = []
    let ready = 0

    function merge() {
      ready++
      if (ready < 2) return
      const seen = new Set()
      const all = [...orgDocs, ...broadcastDocs].filter(function(n) {
        if (seen.has(n.id)) return false
        seen.add(n.id)
        return true
      })
      all.sort(function(a, b) {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0)
        const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0)
        return tb - ta
      })
      setInbox(all)
      setLoading(false)
    }

    const unsubOrg = onSnapshot(
      query(
        collection(db, 'notifications'),
        where('organisationId', '==', admin.org_id)
      ),
      function(snap) {
        orgDocs = snap.docs.map(function(d) { return { id: d.id, ...d.data() } })
        merge()
      },
      function(err) { console.error('org query error:', err); ready++; setLoading(false) }
    )

    const unsubBroadcast = onSnapshot(
      query(
        collection(db, 'notifications'),
        where('organisationId', '==', null)
      ),
      function(snap) {
        broadcastDocs = snap.docs
          .map(function(d) { return { id: d.id, ...d.data() } })
          .filter(function(n) {
            const roles = n.targetRoles || []
            return roles.length === 0 || roles.includes('org_admin')
          })
        merge()
      },
      function(err) { console.error('broadcast query error:', err); ready++; setLoading(false) }
    )

    return function() { unsubOrg(); unsubBroadcast() }
  }, [admin?.org_id])

  // ── Sent messages query — no orderBy to avoid index requirement ──
  useEffect(function() {
    if (!admin?.email) return
    const unsub = onSnapshot(
      query(
        collection(db, 'admin_messages'),
        where('senderId', '==', admin.email)
      ),
      function(snap) {
        const msgs = snap.docs.map(function(d) { return { id: d.id, ...d.data() } })
        msgs.sort(function(a, b) {
          const ta = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(0)
          const tb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(0)
          return tb - ta
        })
        setSent(msgs)
      }
    )
    return unsub
  }, [admin?.email])

  // When inbox loads, batch-mark all unread as read
  useEffect(function() {
    if (loading || inbox.length === 0) return
    const unread = inbox.filter(function(n) { return !n.read })
    if (unread.length === 0) return

    const batch = writeBatch(db)
    unread.forEach(function(n) {
      batch.update(doc(db, 'notifications', n.id), {
        read: true,
        seen_by: arrayUnion({
          adminId: admin?.admin_id || admin?.email,
          adminName: admin?.full_name || 'Org Admin',
          timestamp: new Date().toISOString()
        })
      })
    })
    batch.commit().catch(function(e) { console.error('batch mark read error:', e) })

    setInbox(function(prev) {
      return prev.map(function(n) { return { ...n, read: true } })
    })
  }, [loading])

  async function markRead(n) {
    if (n.read) return
    try {
      await updateDoc(doc(db, 'notifications', n.id), {
        read: true,
        seen_by: arrayUnion({
          adminId: admin?.admin_id || admin?.email,
          adminName: admin?.full_name || 'Org Admin',
          timestamp: new Date().toISOString()
        })
      })
      setInbox(function(prev) {
        return prev.map(function(item) {
          return item.id === n.id ? { ...item, read: true } : item
        })
      })
      if (selected?.id === n.id) setSelected(function(p) { return { ...p, read: true } })
    } catch (e) { console.error(e) }
  }

  async function sendMessage() {
    if (!composeTitle.trim() || !composeMessage.trim()) {
      toast.error('Title and message are required')
      return
    }
    setSending(true)
    try {
      await addDoc(collection(db, 'admin_messages'), {
        title: composeTitle.trim(),
        message: composeMessage.trim(),
        senderId: admin?.email,
        senderName: admin?.full_name || 'Org Admin',
        senderRole: 'org_admin',
        orgId: admin?.org_id,
        recipientRole: 'platform_admin',
        recipient: 'Admin',
        timestamp: serverTimestamp(),
        read: false
      })
      setComposeTitle('')
      setComposeMessage('')
      setShowCompose(false)
      toast.success('Message sent, Administrators will review it shortly.')
      setTab('sent')
    } catch (e) {
      toast.error('Failed to send: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  const unreadCount = inbox.filter(function(n) { return !n.read }).length

  const TABS = [
    { key: 'inbox', label: 'Inbox', badge: unreadCount },
    { key: 'sent', label: 'Sent' }
  ]

  return (
    <Layout>
      <TopBar title="Notifications" />

      {/* Compose button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button
          className="btn-primary"
          onClick={function() { setShowCompose(!showCompose) }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={14} /> Message Administrators
        </button>
      </div>

      {/* Compose panel */}
      {showCompose && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' }}>
            ✉️ New Message to Administrators
          </p>
          <div style={{ display: 'grid', gap: '12px' }}>
            <label style={{ display: 'grid', gap: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
              Subject
              <input
                className="input"
                value={composeTitle}
                onChange={function(e) { setComposeTitle(e.target.value) }}
                placeholder="Message subject"
              />
            </label>
            <label style={{ display: 'grid', gap: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
              Message
              <textarea
                rows={4}
                className="input"
                value={composeMessage}
                onChange={function(e) { setComposeMessage(e.target.value) }}
                placeholder="Write your message…"
                style={{ fontFamily: 'inherit' }}
              />
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn-primary"
                onClick={sendMessage}
                disabled={sending}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Send size={14} /> {sending ? 'Sending…' : 'Send'}
              </button>
              <button className="btn-secondary" onClick={function() { setShowCompose(false) }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
        {TABS.map(function(t) {
          return (
            <button
              key={t.key}
              onClick={function() { setTab(t.key) }}
              style={{
                padding: '10px 18px', background: 'none', border: 'none',
                borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: tab === t.key ? '600' : '400',
                fontSize: '14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
                marginBottom: '-1px'
              }}
            >
              {t.label}
              {t.badge > 0 && (
                <span style={{
                  background: 'var(--danger)', color: '#fff',
                  borderRadius: '20px', fontSize: '11px',
                  padding: '1px 6px', fontWeight: '700'
                }}>{t.badge}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── INBOX ── */}
      {tab === 'inbox' && (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: '16px' }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <p style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading…</p>
            ) : inbox.length === 0 ? (
              <p style={{ padding: '24px', color: 'var(--text-muted)' }}>No notifications yet.</p>
            ) : (
              inbox.map(function(n) {
                const isSelected = selected?.id === n.id
                return (
                  <button
                    key={n.id}
                    onClick={function() {
                      setSelected(isSelected ? null : { ...n, read: true })
                      markRead(n)
                    }}
                    style={{
                      width: '100%', textAlign: 'left',
                      background: isSelected ? 'var(--bg-elevated)' : 'transparent',
                      border: 'none', borderBottom: '1px solid var(--border)',
                      padding: '14px 16px', cursor: 'pointer',
                      display: 'flex', gap: '12px', alignItems: 'flex-start',
                      opacity: n.read ? 0.65 : 1
                    }}
                  >
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>
                      {TYPE_ICONS[n.type] || '📬'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                        <p style={{ fontSize: '13px', fontWeight: n.read ? '400' : '700', color: 'var(--text-primary)', margin: 0 }}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, marginTop: '5px', background: SEVERITY_COLOR[n.severity] || SEVERITY_COLOR.info }} />
                        )}
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.message}
                      </p>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{
                          fontSize: '10px', fontWeight: '600', padding: '1px 6px',
                          borderRadius: '4px', color: '#fff',
                          background: SEVERITY_COLOR[n.severity] || SEVERITY_COLOR.info
                        }}>
                          {(n.severity || 'info').toUpperCase()}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {TYPE_LABELS[n.type] || n.type}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                          {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : ''}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {selected && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '24px' }}>{TYPE_ICONS[selected.type] || '📬'}</span>
                  <span style={{
                    fontSize: '11px', fontWeight: '700', padding: '3px 10px',
                    borderRadius: '20px', color: '#fff',
                    background: SEVERITY_COLOR[selected.severity] || SEVERITY_COLOR.info
                  }}>
                    {(selected.severity || 'info').toUpperCase()}
                  </span>
                </div>
                <button
                  onClick={function() { setSelected(null) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '20px' }}
                >×</button>
              </div>
              <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>{selected.title}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                From: {selected.sender === 'system' ? '🤖 System' : (selected.senderName || 'Platform Admin')}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                {selected.createdAt?.toDate ? selected.createdAt.toDate().toLocaleString() : ''}
              </p>
              <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {selected.message}
              </p>
              {!selected.read && (
                <button
                  onClick={function() { markRead(selected) }}
                  className="btn-secondary"
                  style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckCircle size={14} /> Mark as read
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SENT ── */}
      {tab === 'sent' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {sent.length === 0 ? (
            <p style={{ padding: '24px', color: 'var(--text-muted)' }}>No messages sent yet.</p>
          ) : (
            sent.map(function(msg) {
              return (
                <div
                  key={msg.id}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex', gap: '12px', alignItems: 'flex-start'
                  }}
                >
                  <span style={{ fontSize: '18px', flexShrink: 0 }}>✉️</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                      {msg.title}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 6px 0' }}>
                      {msg.message}
                    </p>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>To: <span style={{ color: 'var(--accent)', fontWeight: '600' }}>Super Admin</span></span>
                      <span>{msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleString() : 'Sending…'}</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </Layout>
  )
}

export default Notifications
