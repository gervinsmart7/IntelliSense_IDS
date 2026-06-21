import { useState, useEffect } from 'react'
import { Bell, Send, Plus, AlertTriangle, Users, Eye, CheckCircle, MessageSquare } from 'lucide-react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp,
  where, arrayUnion, writeBatch
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import useAuthStore from '../../store/useAuthStore'
import toast from 'react-hot-toast'

const ANNOUNCEMENT_TYPES = [
  { value: 'announcement', label: '📢 Announcement', description: 'General platform announcement' },
  { value: 'maintenance_notice', label: '🔧 Maintenance', description: 'Scheduled downtime notice' },
  { value: 'emergency_alert', label: '🚨 Emergency', description: 'Critical — use sparingly' },
  { value: 'policy_update', label: '📋 Policy Update', description: 'Policy or compliance changes' },
  { value: 'feature_release', label: '✨ Feature Release', description: 'New features or improvements' }
]

const TYPE_ICONS = {
  announcement: '📢', maintenance_notice: '🔧', emergency_alert: '🚨',
  policy_update: '📋', feature_release: '✨', PLATFORM_MESSAGE: '📨',
  security_alert: '🚨', agent_offline: '⚠️', agent_online: '✅',
  model_deployed: '📢', failed_login_attempt: '🔒', new_org_registered: '📥',
  threat_intel_update: 'ℹ️', resource_warning: '⚠️'
}

const SEVERITY_COLOR = {
  critical: '#F87171', high: '#FB923C', medium: '#FBBF24',
  low: '#60A5FA', info: '#94A3B8'
}

function getNotificationDate(item) {
  const dateValue = item.createdAt || item.timestamp
  return dateValue?.toDate ? dateValue.toDate() : new Date(0)
}

function formatNotificationDate(item) {
  const date = getNotificationDate(item)
  return date.getTime() > 0 ? date.toLocaleString() : ''
}

function NotificationsPage() {
  const { admin } = useAuthStore()
  const [tab, setTab] = useState('inbox')

  const [allNotifications, setAllNotifications] = useState([])
  const [inboxLoading, setInboxLoading] = useState(true)

  // Announcement state
  const [annType, setAnnType] = useState('announcement')
  const [annTitle, setAnnTitle] = useState('')
  const [annMessage, setAnnMessage] = useState('')
  const [emergencyAck, setEmergencyAck] = useState(false)
  const [sendingAnn, setSendingAnn] = useState(false)

  // Direct message state
  const [msgTitle, setMsgTitle] = useState('')
  const [msgMessage, setMsgMessage] = useState('')
  const [recipientType, setRecipientType] = useState('all_org_admins')
  const [admins, setAdmins] = useState([])
  const [selectedAdminId, setSelectedAdminId] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)

  // Sent state
  const [sentDetail, setSentDetail] = useState(null)
  const [selected, setSelected] = useState(null)

  // Incoming messages from org admins
  const [incoming, setIncoming] = useState([])

  // Reply state
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  useEffect(function() {
    const q = query(collection(db, 'notifications'))
    const unsub = onSnapshot(q, function(snap) {
      const items = snap.docs.map(function(d) { return { id: d.id, ...d.data() } })
      items.sort(function(a, b) {
        return getNotificationDate(b) - getNotificationDate(a)
      })
      setAllNotifications(items)
      setInboxLoading(false)
    })
    return unsub
  }, [])

  const incomingInbox = incoming.map(function(msg) {
    return {
      ...msg,
      id: 'admin_message_' + msg.id,
      rawId: msg.id,
      source: 'admin_message',
      type: 'PLATFORM_MESSAGE',
      severity: 'info',
      sender: msg.senderRole,
      senderName: msg.senderName,
      senderEmail: msg.senderId,
      createdAt: msg.timestamp,
      title: msg.title,
      message: msg.message
    }
  })

  // Derive inbox and sent from the same snapshot
  const inbox = allNotifications.filter(function(n) {
    // Sent by this admin = goes to Sent tab
    if (n.createdBy === admin?.email) return false
    if (n.senderEmail === admin?.email) return false
    return true
  }).concat(incomingInbox).sort(function(a, b) {
    return getNotificationDate(b) - getNotificationDate(a)
  })

  const sent = allNotifications.filter(function(n) {
    return n.createdBy === admin?.email || n.senderEmail === admin?.email
  })

  useEffect(function() {
    // Messages sent from org admins — no orderBy to avoid index requirement
    const q = query(
      collection(db, 'admin_messages'),
      where('recipientRole', '==', 'super_admin')
    )
    const unsub = onSnapshot(q, function(snap) {
      const msgs = snap.docs.map(function(d) { return { id: d.id, ...d.data() } })
      // Sort client-side
      msgs.sort(function(a, b) {
        const ta = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(0)
        const tb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(0)
        return tb - ta
      })
      setIncoming(msgs)
    })
    return unsub
  }, [])

  useEffect(function() {
    // Load admins list for recipient picker
    const q = query(collection(db, 'admins'), orderBy('full_name', 'asc'))
    const unsub = onSnapshot(q, function(snap) {
      setAdmins(snap.docs.map(function(d) { return { id: d.id, ...d.data() } }))
    })
    return unsub
  }, [])

  // Batch-mark all unread as read when inbox tab is active and data loads
  useEffect(function() {
    if (tab !== 'inbox') return
    const unread = inbox.filter(function(n) { return !n.read })
    if (unread.length === 0) return

    const batch = writeBatch(db)
    unread.forEach(function(n) {
      if (n.source === 'admin_message') {
        batch.update(doc(db, 'admin_messages', n.rawId), { read: true })
      } else {
        batch.update(doc(db, 'notifications', n.id), {
          read: true,
          seen_by: arrayUnion({
            adminId: admin?.admin_id || admin?.email,
            adminName: admin?.full_name || 'Admin',
            timestamp: new Date().toISOString()
          })
        })
      }
    })
    batch.commit().catch(function(e) { console.error('batch mark read:', e) })

    setAllNotifications(function(prev) {
      return prev.map(function(n) { return { ...n, read: true } })
    })
  }, [tab, inboxLoading])

  async function markRead(n) {
    try {
      if (n.source === 'admin_message') {
        await updateDoc(doc(db, 'admin_messages', n.rawId), { read: true })
        setIncoming(function(prev) {
          return prev.map(function(item) {
            return item.id === n.rawId ? { ...item, read: true } : item
          })
        })
        return
      }

      await updateDoc(doc(db, 'notifications', n.id), {
        read: true,
        seen_by: arrayUnion({
          adminId: admin?.admin_id || admin?.email,
          adminName: admin?.full_name,
          timestamp: new Date().toISOString()
        })
      })
      setAllNotifications(function(prev) {
        return prev.map(function(item) {
          return item.id === n.id ? { ...item, read: true } : item
        })
      })
    } catch (e) { console.error(e) }
  }

  async function sendAnnouncement() {
    if (!annTitle.trim() || !annMessage.trim()) { toast.error('Title and message are required'); return }
    if (annType === 'emergency_alert' && !emergencyAck) { toast.error('Acknowledge this is an emergency first'); return }
    setSendingAnn(true)
    try {
      // Build sent_to from all org + platform admins, excluding super admin
      const recipients = admins.filter(function(a) {
        return a.role === 'org_admin' || a.role === 'platform_admin'
      })
      const sent_to = recipients.map(function(a) {
        return { adminId: a.id, adminName: a.full_name, role: a.role, orgId: a.org_id || null }
      })

      await addDoc(collection(db, 'notifications'), {
        type: annType,
        severity: annType === 'emergency_alert' ? 'critical' : 'info',
        sender: 'super_admin',
        senderName: admin?.full_name || 'Super Admin',
        senderEmail: admin?.email,
        createdBy: admin?.email,
        title: annTitle.trim(),
        message: annMessage.trim(),
        organisationId: null,
        targetRoles: ['org_admin', 'platform_admin'],
        sent_to,
        read: false, seen_by: [],
        createdAt: serverTimestamp()
      })
      toast.success('Announcement sent to ' + sent_to.length + ' recipient(s)')
      setAnnTitle(''); setAnnMessage(''); setAnnType('announcement'); setEmergencyAck(false)
      setTab('sent')
    } catch (e) { toast.error('Failed: ' + e.message) }
    finally { setSendingAnn(false) }
  }

  async function sendDirectMessage() {
    if (!msgTitle.trim() || !msgMessage.trim()) { toast.error('Title and message are required'); return }
    if (recipientType === 'specific_admins' && !selectedAdminId) { toast.error('Select a specific admin'); return }
    setSendingMsg(true)
    try {
      const sent_to = []
      const recipients = { type: recipientType }
      // Never include the sender in any recipient list
      const otherAdmins = admins.filter(function(a) { return a.email !== admin?.email })

      if (recipientType === 'specific_admins' && selectedAdminId) {
        const target = otherAdmins.find(function(a) { return a.id === selectedAdminId })
        if (target) sent_to.push({ adminId: target.id, adminName: target.full_name, role: target.role, orgId: target.org_id })
        recipients.adminIds = [selectedAdminId]
      } else if (recipientType === 'all_org_admins') {
        otherAdmins.filter(function(a) { return a.role === 'org_admin' }).forEach(function(a) {
          sent_to.push({ adminId: a.id, adminName: a.full_name, role: a.role, orgId: a.org_id })
        })
      } else if (recipientType === 'all_platform_admins') {
        otherAdmins.filter(function(a) { return a.role === 'platform_admin' }).forEach(function(a) {
          sent_to.push({ adminId: a.id, adminName: a.full_name, role: a.role })
        })
      } else {
        // all_admins — everyone except the sender
        otherAdmins.forEach(function(a) { sent_to.push({ adminId: a.id, adminName: a.full_name, role: a.role, orgId: a.org_id }) })
      }
      await addDoc(collection(db, 'notifications'), {
        type: 'PLATFORM_MESSAGE', severity: 'info',
        sender: 'super_admin', senderName: admin?.full_name || 'Super Admin',
        senderEmail: admin?.email, createdBy: admin?.email,
        title: msgTitle.trim(), message: msgMessage.trim(),
        recipients, sent_to, organisationId: null,
        targetRoles: ['org_admin', 'platform_admin'],
        read: false, seen_by: [], createdAt: serverTimestamp()
      })
      toast.success('Message sent to ' + sent_to.length + ' recipient(s)')
      setMsgTitle(''); setMsgMessage(''); setSelectedAdminId('')
      setTab('sent')
    } catch (e) { toast.error('Failed: ' + e.message) }
    finally { setSendingMsg(false) }
  }

  async function sendReply() {
    if (!replyText.trim()) { 
      toast.error('Reply message is required')
      return 
    }
    if (!selected) {
      toast.error('No message selected')
      return
    }
    
    setSendingReply(true)
    try {
      // Find the original sender's admin record to get their ID
      const senderAdmin = admins.find(function(a) { 
        return a.email === selected.senderEmail 
      })
      
      if (!senderAdmin) {
        toast.error('Could not find original sender')
        setSendingReply(false)
        return
      }

      // Determine sender role based on current admin
      const senderRole = admin?.role === 'super_admin' ? 'super_admin' : 'platform_admin'
      
      // Create sent_to array with the original sender
      const sent_to = [{
        adminId: senderAdmin.id,
        adminName: senderAdmin.full_name,
        role: senderAdmin.role,
        orgId: senderAdmin.org_id || null
      }]

      await addDoc(collection(db, 'notifications'), {
        type: 'PLATFORM_MESSAGE',
        severity: 'info',
        sender: senderRole,
        senderName: admin?.full_name || 'Admin',
        senderEmail: admin?.email,
        createdBy: admin?.email,
        title: 'Re: ' + selected.title,
        message: replyText.trim(),
        recipients: { 
          type: 'specific_admins', 
          adminIds: [senderAdmin.id] 
        },
        sent_to: sent_to,
        organisationId: senderAdmin.org_id || null,
        targetRoles: [senderAdmin.role],
        read: false,
        seen_by: [],
        createdAt: serverTimestamp()
      })
      
      toast.success('Reply sent to ' + senderAdmin.full_name)
      setReplyText('')
    } catch (e) { 
      toast.error('Failed to send reply: ' + e.message)
      console.error('Reply error:', e)
    } finally { 
      setSendingReply(false) 
    }
  }

  const unread = inbox.filter(function(n) { return !n.read }).length

  const TABS = [
    { key: 'inbox', label: 'Inbox', badge: unread },
    { key: 'compose', label: 'Compose' },
    { key: 'sent', label: 'Sent' }
  ]

  return (
    <Layout>
      <TopBar title="Notifications" showSearch={false} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {TABS.map(function(t) {
          return (
            <button
              key={t.key}
              onClick={function() { setTab(t.key) }}
              style={{
                padding: '10px 18px',
                background: 'none', border: 'none',
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
            {inboxLoading ? (
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
                      const updated = { ...n, read: true }
                      setSelected(isSelected ? null : updated)
                      if (!n.read) markRead(n)
                    }}
                    style={{
                      width: '100%', textAlign: 'left', background: isSelected ? 'var(--bg-elevated)' : 'transparent',
                      border: 'none', borderBottom: '1px solid var(--border)',
                      padding: '14px 16px', cursor: 'pointer',
                      display: 'flex', gap: '12px', alignItems: 'flex-start',
                      opacity: n.read ? 0.6 : 1
                    }}
                  >
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>{TYPE_ICONS[n.type] || '📬'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                        <p style={{ fontSize: '13px', fontWeight: n.read ? '400' : '700', color: 'var(--text-primary)', margin: 0 }}>
                          {n.title}
                        </p>
                        <span style={{
                          width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, marginTop: '5px',
                          background: n.read ? 'transparent' : (SEVERITY_COLOR[n.severity] || SEVERITY_COLOR.info)
                        }} />
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.message}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                        {formatNotificationDate(n)}
                      </p>
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
                    fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', color: '#fff',
                    background: SEVERITY_COLOR[selected.severity] || SEVERITY_COLOR.info
                  }}>
                    {(selected.severity || 'info').toUpperCase()}
                  </span>
                </div>
                <button onClick={function() { setSelected(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px' }}>×</button>
              </div>
              <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>{selected.title}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                From: {selected.sender === 'system' ? '🤖 System' : (selected.senderName || selected.sender)}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                {formatNotificationDate(selected)}
              </p>
              <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selected.message}</p>
              
              {/* Reply section - only for PLATFORM_MESSAGE from other admins, not announcements */}
              {selected.type === 'PLATFORM_MESSAGE' && 
               selected.senderEmail && 
               selected.senderEmail !== admin?.email && (
                <div style={{ 
                  marginTop: '20px', 
                  borderTop: '1px solid var(--border)', 
                  paddingTop: '16px' 
                }}>
                  <p style={{ 
                    fontSize: '13px', 
                    fontWeight: '600', 
                    color: 'var(--text-primary)', 
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <MessageSquare size={14} />
                    Reply to {selected.senderName}
                  </p>
                  <textarea
                    rows={3}
                    className="input"
                    value={replyText}
                    onChange={function(e) { setReplyText(e.target.value) }}
                    placeholder="Write your reply…"
                    style={{ 
                      fontFamily: 'inherit', 
                      marginBottom: '10px',
                      resize: 'vertical'
                    }}
                  />
                  <button
                    onClick={sendReply}
                    disabled={sendingReply || !replyText.trim()}
                    className="btn-primary"
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '6px',
                      opacity: (!replyText.trim() || sendingReply) ? 0.6 : 1
                    }}
                  >
                    <Send size={14} /> 
                    {sendingReply ? 'Sending…' : 'Send Reply'}
                  </button>
                </div>
              )}
              
              {!selected.read && (
                <button
                  onClick={function() { markRead(selected); setSelected({ ...selected, read: true }) }}
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

      {/* ── COMPOSE ── */}
      {tab === 'compose' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>

          {/* Left — Announcement */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '18px' }}>📢</span>
              <div>
                <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Announcement</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Broadcast to all organisations and admins</p>
              </div>
            </div>

            {/* Recipient summary */}
            <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={14} color="var(--accent)" />
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Sending to: <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
                  All org admins ({admins.filter(function(a) { return a.role === 'org_admin' }).length}) + Platform admins ({admins.filter(function(a) { return a.role === 'platform_admin' }).length})
                </span>
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              {ANNOUNCEMENT_TYPES.map(function(t) {
                return (
                  <button
                    key={t.value}
                    onClick={function() { setAnnType(t.value); setEmergencyAck(false) }}
                    style={{
                      padding: '10px', borderRadius: '8px', textAlign: 'left', cursor: 'pointer',
                      border: annType === t.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: annType === t.value ? 'var(--bg-elevated)' : 'transparent'
                    }}
                  >
                    <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 2px 0' }}>{t.label}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>{t.description}</p>
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
                Title
                <input className="input" value={annTitle} onChange={function(e) { setAnnTitle(e.target.value) }} placeholder="Announcement title" />
              </label>
              <label style={{ display: 'grid', gap: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
                Message
                <textarea className="input" rows={5} value={annMessage} onChange={function(e) { setAnnMessage(e.target.value) }} placeholder="Write your announcement…" style={{ fontFamily: 'inherit' }} />
              </label>
            </div>

            {annType === 'emergency_alert' && (
              <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid #F87171', borderRadius: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <AlertTriangle size={15} color="#F87171" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: '600', color: '#F87171', margin: '0 0 6px 0' }}>Emergency — use sparingly</p>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <input type="checkbox" checked={emergencyAck} onChange={function(e) { setEmergencyAck(e.target.checked) }} />
                      I confirm this is a real emergency
                    </label>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={sendAnnouncement}
              disabled={sendingAnn || (annType === 'emergency_alert' && !emergencyAck)}
              className="btn-primary"
              style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Send size={14} /> {sendingAnn ? 'Sending…' : 'Send Announcement'}
            </button>
          </div>

          {/* Right — Direct Message */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '18px' }}>✉️</span>
              <div>
                <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Direct Message</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Send to specific admins or groups</p>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'grid', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '10px' }}>
                Send to
                <select
                  className="input"
                  value={recipientType}
                  onChange={function(e) { setRecipientType(e.target.value); setSelectedAdminId('') }}
                >
                  <option value="all_org_admins">All organisation admins</option>
                  <option value="all_platform_admins">All platform admins</option>
                  <option value="all_admins">Everyone (except you)</option>
                  <option value="specific_admins">Specific admin</option>
                </select>
              </label>
              {recipientType === 'specific_admins' && (
                <label style={{ display: 'grid', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '10px' }}>
                  Select admin
                  <select className="input" value={selectedAdminId} onChange={function(e) { setSelectedAdminId(e.target.value) }}>
                    <option value="">Choose an admin…</option>
                    {admins.filter(function(a) { return a.email !== admin?.email }).map(function(a) {
                      return <option key={a.id} value={a.id}>{a.full_name} ({a.role})</option>
                    })}
                  </select>
                </label>
              )}
              {/* Live recipient preview */}
              {(function() {
                const others = admins.filter(function(a) { return a.email !== admin?.email })
                let preview = ''
                if (recipientType === 'all_org_admins') {
                  const count = others.filter(function(a) { return a.role === 'org_admin' }).length
                  preview = count + ' org admin' + (count !== 1 ? 's' : '')
                } else if (recipientType === 'all_platform_admins') {
                  const count = others.filter(function(a) { return a.role === 'platform_admin' }).length
                  preview = count + ' platform admin' + (count !== 1 ? 's' : '')
                } else if (recipientType === 'all_admins') {
                  preview = others.length + ' admin' + (others.length !== 1 ? 's' : '') + ' (all roles)'
                } else if (recipientType === 'specific_admins' && selectedAdminId) {
                  const target = admins.find(function(a) { return a.id === selectedAdminId })
                  preview = target ? target.full_name + ' (' + target.role + ')' : ''
                }
                if (!preview) return null
                return (
                  <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={14} color="var(--accent)" />
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                      Will be sent to: <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{preview}</span>
                    </p>
                  </div>
                )
              })()}
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
                Title
                <input className="input" value={msgTitle} onChange={function(e) { setMsgTitle(e.target.value) }} placeholder="Message subject" />
              </label>
              <label style={{ display: 'grid', gap: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
                Message
                <textarea className="input" rows={5} value={msgMessage} onChange={function(e) { setMsgMessage(e.target.value) }} placeholder="Write your message…" style={{ fontFamily: 'inherit' }} />
              </label>
            </div>

            <button
              onClick={sendDirectMessage}
              disabled={sendingMsg}
              className="btn-primary"
              style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Send size={14} /> {sendingMsg ? 'Sending…' : 'Send Message'}
            </button>
          </div>
        </div>
      )}

      {/* ── SENT ── */}
      {tab === 'sent' && (
        <div style={{ display: 'grid', gridTemplateColumns: sentDetail ? '1fr 1fr' : '1fr', gap: '16px' }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {sent.length === 0 ? (
              <p style={{ padding: '24px', color: 'var(--text-muted)' }}>Nothing sent yet.</p>
            ) : (
              sent.map(function(n) {
                return (
                  <button
                    key={n.id}
                    onClick={function() { setSentDetail(sentDetail?.id === n.id ? null : n) }}
                    style={{
                      width: '100%', textAlign: 'left',
                      background: sentDetail?.id === n.id ? 'var(--bg-elevated)' : 'transparent',
                      border: 'none', borderBottom: '1px solid var(--border)',
                      padding: '14px 16px', cursor: 'pointer',
                      display: 'flex', gap: '12px', alignItems: 'flex-start'
                    }}
                  >
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>{TYPE_ICONS[n.type] || '📬'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 3px 0' }}>{n.title}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.message}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                        {formatNotificationDate(n)}
                        {n.sent_to?.length > 0 && (' · ' + n.sent_to.length + ' recipient(s)')}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {sentDetail && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>{sentDetail.title}</p>
                <button onClick={function() { setSentDetail(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px' }}>×</button>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', whiteSpace: 'pre-wrap' }}>{sentDetail.message}</p>

              {/* Recipient details */}
              <div style={{ padding: '12px', background: 'var(--bg-elevated)', borderRadius: '8px', marginBottom: '8px' }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Eye size={12} /> Recipients
                </p>
                {(function() {
                  const rtype = sentDetail.recipients?.type
                  const sent_to = sentDetail.sent_to || []

                  if (rtype === 'all_org_admins') {
                    return (
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                          All Organisation Admins ({sent_to.length})
                        </p>
                        <div style={{ display: 'grid', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                          {sent_to.map(function(r, i) {
                            return (
                              <p key={i} style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                                {r.adminName}
                              </p>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }

                  if (rtype === 'all_platform_admins') {
                    return (
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                          All Platform Admins ({sent_to.length})
                        </p>
                        <div style={{ display: 'grid', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                          {sent_to.map(function(r, i) {
                            return (
                              <p key={i} style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                                {r.adminName}
                              </p>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }

                  if (rtype === 'all_admins') {
                    return (
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                          All Admins ({sent_to.length})
                        </p>
                        <div style={{ display: 'grid', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                          {sent_to.map(function(r, i) {
                            return (
                              <p key={i} style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                                {r.adminName} <span style={{ color: 'var(--accent)' }}>({r.role.replace('_', ' ')})</span>
                              </p>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }

                  if (rtype === 'specific_admins' && sent_to.length > 0) {
                    return (
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                          Specific Admin
                        </p>
                        {sent_to.map(function(r, i) {
                          return (
                            <p key={i} style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                              {r.adminName} <span style={{ color: 'var(--accent)' }}>({r.role.replace('_', ' ')})</span>
                            </p>
                          )
                        })}
                      </div>
                    )
                  }

                  // Announcement — targetRoles based, no recipients type
                  if (sent_to.length > 0) {
                    const orgAdmins = sent_to.filter(function(r) { return r.role === 'org_admin' })
                    const platformAdmins = sent_to.filter(function(r) { return r.role === 'platform_admin' })
                    return (
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {orgAdmins.length > 0 && (
                          <div>
                            <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                              Organisation Admins ({orgAdmins.length})
                            </p>
                            <div style={{ display: 'grid', gap: '4px', maxHeight: '150px', overflowY: 'auto' }}>
                              {orgAdmins.map(function(r, i) {
                                return (
                                  <p key={i} style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                                    {r.adminName}
                                  </p>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {platformAdmins.length > 0 && (
                          <div>
                            <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                              Platform Admins ({platformAdmins.length})
                            </p>
                            <div style={{ display: 'grid', gap: '4px' }}>
                              {platformAdmins.map(function(r, i) {
                                return (
                                  <p key={i} style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                                    {r.adminName}
                                  </p>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  }

                  // Fallback for system notifications
                  if (sentDetail.targetRoles?.length > 0) {
                    return <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Sent to: {sentDetail.targetRoles.join(', ')}</p>
                  }

                  return <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>No recipient details available</p>
                })()}
              </div>
            </div>
          )}
        </div>
      )}

    </Layout>
  )
}

export default NotificationsPage
