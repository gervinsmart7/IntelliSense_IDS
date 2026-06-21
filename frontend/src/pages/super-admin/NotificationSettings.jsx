import { useState, useEffect } from 'react'
import { Bell, Send, Users, Eye } from 'lucide-react'
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, where } from 'firebase/firestore'
import { db } from '../../services/firebase'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import useAuthStore from '../../store/useAuthStore'
import toast from 'react-hot-toast'

function NotificationSettings() {
  const { admin } = useAuthStore()
  const [admins, setAdmins] = useState([])
  const [recipientType, setRecipientType] = useState('all_org_admins')
  const [selectedAdminId, setSelectedAdminId] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [recentMessages, setRecentMessages] = useState([])
  const [selectedMessageDetail, setSelectedMessageDetail] = useState(null)
  const [incomingMessages, setIncomingMessages] = useState([])

  useEffect(function() {
    const q = query(collection(db, 'admins'), orderBy('full_name', 'asc'))
    const unsub = onSnapshot(q, function(snapshot) {
      setAdmins(snapshot.docs.map(function(doc) {
        return { id: doc.id, ...doc.data() }
      }))
    })
    return unsub
  }, [])

  useEffect(function() {
    const q = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'))
    const unsub = onSnapshot(q, function(snapshot) {
      setRecentMessages(snapshot.docs.slice(0, 8).map(function(doc) {
        return { id: doc.id, ...doc.data() }
      }))
    })
    return unsub
  }, [])

  useEffect(function() {
    const q = query(
      collection(db, 'admin_messages'),
      where('recipientRole', '==', 'super_admin'),
      orderBy('timestamp', 'desc')
    )
    const unsub = onSnapshot(q, function(snapshot) {
      setIncomingMessages(snapshot.docs.map(function(doc) {
        return { id: doc.id, ...doc.data() }
      }))
    })
    return unsub
  }, [])

  async function sendMessage() {
    if (!title.trim() || !message.trim()) {
      toast.error('Please provide both a title and a message')
      return
    }

    if (recipientType === 'specific_admins' && !selectedAdminId) {
      toast.error('Please select a specific admin to send to')
      return
    }

    setSending(true)
    try {
      const recipients = { type: recipientType }
      const sent_to = []

      if (recipientType === 'specific_admins' && selectedAdminId) {
        recipients.adminIds = [selectedAdminId]
        const targetAdmin = admins.find(a => a.id === selectedAdminId)
        if (targetAdmin) {
          sent_to.push({
            adminId: targetAdmin.id,
            adminName: targetAdmin.full_name,
            role: targetAdmin.role,
            orgId: targetAdmin.org_id,
            delivered: true,
            deliveredAt: serverTimestamp()
          })
        }
      } else if (recipientType === 'all_org_admins') {
        const orgAdmins = admins.filter(a => a.role === 'org_admin')
        recipients.orgIds = Array.from(new Set(
          orgAdmins.map(item => item.org_id).filter(Boolean)
        ))
        sent_to.push(
          ...orgAdmins.map(a => ({
            adminId: a.id,
            adminName: a.full_name,
            role: a.role,
            orgId: a.org_id,
            delivered: true,
            deliveredAt: serverTimestamp()
          }))
        )
      } else if (recipientType === 'all_platform_admins') {
        const platformAdmins = admins.filter(a => a.role === 'platform_admin')
        recipients.adminIds = platformAdmins.map(a => a.id)
        sent_to.push(
          ...platformAdmins.map(a => ({
            adminId: a.id,
            adminName: a.full_name,
            role: a.role,
            delivered: true,
            deliveredAt: serverTimestamp()
          }))
        )
      } else if (recipientType === 'all_admins') {
        recipients.adminIds = admins.map(a => a.id)
        sent_to.push(
          ...admins.map(a => ({
            adminId: a.id,
            adminName: a.full_name,
            role: a.role,
            orgId: a.org_id,
            delivered: true,
            deliveredAt: serverTimestamp()
          }))
        )
      }

      await addDoc(collection(db, 'notifications'), {
        type: 'PLATFORM_MESSAGE',
        title: title.trim(),
        message: message.trim(),
        recipients,
        sent_by: {
          adminId: admin?.email || 'superadmin',
          adminName: admin?.full_name || 'Super Admin',
          role: admin?.role || 'super_admin'
        },
        sent_to,
        createdBy: admin?.email || 'superadmin',
        createdByName: admin?.full_name || 'Super Admin',
        timestamp: serverTimestamp(),
        read: false
      })

      setTitle('')
      setMessage('')
      setSelectedAdminId('')
      toast.success('Platform message sent to ' + sent_to.length + ' recipient(s)')
    } catch (error) {
      console.error('Error sending message:', error)
      toast.error('Failed to send platform message: ' + error.message)
    } finally {
      setSending(false)
    }
  }

  const recipientOptions = [
    { value: 'all_org_admins', label: 'All organisation admins' },
    { value: 'all_platform_admins', label: 'All platform admins' },
    { value: 'all_platform_admins' + 'all_org_admin', label: 'Everyone' },
    { value: 'specific_admins', label: 'Specific admin' }
  ]

  return (
    <Layout>
      <TopBar title="Notification Settings" />

      <div style={{ display: 'grid', gap: '24px', maxWidth: '760px' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <Bell size={18} color="var(--accent)" />
            <div>
              <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Platform Notifications</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Send internal messages and alerts to admins directly through the platform.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '16px' }}>
            <label style={{ display: 'grid', gap: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
              Message title
              <input
                className="input"
                value={title}
                onChange={function(e) { setTitle(e.target.value) }}
                placeholder="Enter message title"
              />
            </label>

            <label style={{ display: 'grid', gap: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
              Message body
              <textarea
                rows={5}
                className="input"
                value={message}
                onChange={function(e) { setMessage(e.target.value) }}
                placeholder="Compose the notification you want org admins to see"
              />
            </label>

            <label style={{ display: 'grid', gap: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
              Send to
              <select
                className="input"
                value={recipientType}
                onChange={function(e) {
                  setRecipientType(e.target.value)
                  setSelectedAdminId('')
                }}
              >
                {recipientOptions.map(function(option) {
                  return (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  )
                })}
              </select>
            </label>

            {recipientType === 'specific_admins' && (
              <label style={{ display: 'grid', gap: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
                Select admin
                <select
                  className="input"
                  value={selectedAdminId}
                  onChange={function(e) { setSelectedAdminId(e.target.value) }}
                >
                  <option value="">Choose an admin</option>
                  {admins.map(function(item) {
                    return (
                      <option key={item.id} value={item.id}>{item.full_name} ({item.role})</option>
                    )
                  })}
                </select>
              </label>
            )}

            <button
              onClick={sendMessage}
              className="btn-primary"
              disabled={sending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', width: 'fit-content' }}
            >
              <Send size={14} />
              {sending ? 'Sending…' : 'Send platform message'}
            </button>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <Users size={18} color="var(--accent)" />
            <div>
              <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Recent platform notifications</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Messages sent from the platform with delivery status.</p>
            </div>
          </div>

          {recentMessages.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No platform messages have been sent yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {recentMessages.map(function(messageItem) {
                return (
                  <button
                    key={messageItem.id}
                    onClick={function() { setSelectedMessageDetail(messageItem) }}
                    style={{
                      padding: '14px',
                      background: 'var(--bg-elevated)',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>{messageItem.title}</p>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{messageItem.message}</p>
                        {messageItem.sent_to && messageItem.sent_to.length > 0 && (
                          <p style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '6px' }}>
                            <Eye size={12} style={{ display: 'inline', marginRight: '4px' }} />
                            Sent to {messageItem.sent_to.length} recipient(s)
                          </p>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', minWidth: '140px' }}>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{messageItem.recipients?.type || 'All'}</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{messageItem.timestamp?.toDate ? messageItem.timestamp.toDate().toLocaleString() : ''}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {selectedMessageDetail && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Eye size={18} color="var(--accent)" />
                <div>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Message Recipients</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>View who this message was delivered to.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={function() { setSelectedMessageDetail(null) }}
                className="btn-secondary"
              >
                Close
              </button>
            </div>

            <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-elevated)', borderRadius: '8px' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', marginBottom: '6px', color: 'var(--text-primary)' }}>{selectedMessageDetail.title}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{selectedMessageDetail.message}</p>
            </div>

            {selectedMessageDetail.sent_to && selectedMessageDetail.sent_to.length > 0 ? (
              <div>
                <p style={{ fontSize: '13px', fontWeight: '700', marginBottom: '12px', color: 'var(--text-primary)' }}>
                  Delivered to {selectedMessageDetail.sent_to.length} recipient(s)
                </p>
                <div style={{ display: 'grid', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                  {selectedMessageDetail.sent_to.map(function(recipient, idx) {
                    return (
                      <div key={idx} style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px', borderLeft: '3px solid var(--accent)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <div>
                            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                              {recipient.adminName}
                            </p>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
                              Role: {recipient.role}
                            </p>
                            {recipient.orgId && (
                              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0' }}>
                                Org: {recipient.orgId}
                              </p>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '11px', color: 'var(--accent)', margin: 0, fontWeight: '600' }}>✓ Delivered</p>
                            <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                              {recipient.deliveredAt?.toDate ? recipient.deliveredAt.toDate().toLocaleString() : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No recipient details available.</p>
            )}
          </div>
        )}

        {incomingMessages.length > 0 && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <Bell size={18} color="var(--accent)" />
              <div>
                <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Messages from org admins</p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Incoming messages from organisation administrators.</p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              {incomingMessages.map(function(msg) {
                return (
                  <div key={msg.id} style={{ padding: '14px', background: 'var(--bg-elevated)', borderRadius: '12px', borderLeft: '3px solid var(--accent)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>{msg.title}</p>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{msg.message}</p>
                        <p style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '600' }}>From: {msg.senderName} ({msg.senderRole})</p>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: '120px' }}>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{msg.read ? 'Read' : 'Unread'}</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleString() : ''}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

export default NotificationSettings
