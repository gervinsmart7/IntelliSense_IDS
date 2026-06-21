import { Bell, Search, X } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, query, where, onSnapshot,
  orderBy, limit, doc, updateDoc, arrayUnion
} from 'firebase/firestore'
import { db } from '../services/firebase'
import useAuthStore from '../store/useAuthStore'
import ThemeToggle from './ThemeToggle'

const NOTIFICATIONS_ROUTE = {
  super_admin: '/dashboard/super/notifications',
  platform_admin: '/dashboard/platform/notifications',
  org_admin: '/dashboard/organisation/notifications'
}

const SEVERITY_COLOR = {
  critical: '#F87171',
  high: '#FB923C',
  medium: '#FBBF24',
  low: '#60A5FA',
  info: '#94A3B8'
}

function TopBar({ title, showSearch = false }) {
  const { admin, role } = useAuthStore()
  const navigate = useNavigate()
  const [searchValue, setSearchValue] = useState('')
  const [notifications, setNotifications] = useState([])
  const [adminMessages, setAdminMessages] = useState([])
  const [showPanel, setShowPanel] = useState(false)
  const panelRef = useRef(null)

  // Query only unread, scoped to this admin's visibility, latest 10
  useEffect(function() {
    if (!admin) return

    if (role === 'org_admin') {
      let orgDocs = []
      let broadcastDocs = []
      let loaded = 0

      function merge() {
        loaded++
        if (loaded < 2) return
        const seen = new Set()
        const unique = [...orgDocs, ...broadcastDocs].filter(function(n) {
          if (seen.has(n.id)) return false
          seen.add(n.id)
          return true
        })
        unique.sort(function(a, b) {
          const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0)
          const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0)
          return tb - ta
        })
        setNotifications(unique.slice(0, 10))
      }

      const unsubOrg = onSnapshot(
        query(
          collection(db, 'notifications'),
          where('organisationId', '==', admin.org_id),
          where('read', '==', false),
          orderBy('createdAt', 'desc'),
          limit(20)
        ),
        function(snap) {
          orgDocs = snap.docs.map(function(d) { return { id: d.id, ...d.data() } })
          merge()
        }
      )

      const unsubBroadcast = onSnapshot(
        query(
          collection(db, 'notifications'),
          where('organisationId', '==', null),
          where('read', '==', false),
          orderBy('createdAt', 'desc'),
          limit(20)
        ),
        function(snap) {
          broadcastDocs = snap.docs
            .map(function(d) { return { id: d.id, ...d.data() } })
            .filter(function(n) {
              const roles = n.targetRoles || []
              return roles.length === 0 || roles.includes('org_admin')
            })
          merge()
        }
      )

      return function() { unsubOrg(); unsubBroadcast() }
    }

    // Super/platform: fetch unread, filter out self-sent
    const unsub = onSnapshot(
      query(
        collection(db, 'notifications'),
        where('read', '==', false),
        orderBy('createdAt', 'desc'),
        limit(50)
      ),
      function(snap) {
        const docs = snap.docs
          .map(function(d) { return { id: d.id, ...d.data() } })
          .filter(function(n) {
            return n.createdBy !== admin.email && n.senderEmail !== admin.email
          })
          .slice(0, 10)
        setNotifications(docs)
      }
    )
    return unsub
  }, [admin, role])

  // Watch admin_messages for super admin bell
  useEffect(function() {
    if (role !== 'super_admin') return
    const q = query(
      collection(db, 'admin_messages'),
      where('recipientRole', '==', 'super_admin'),
      where('read', '==', false)
    )
    const unsub = onSnapshot(q, function(snap) {
      setAdminMessages(snap.docs.map(function(d) { return { id: d.id, ...d.data() } }))
    })
    return unsub
  }, [role])

  // Close panel when clicking outside
  useEffect(function() {
    if (!showPanel) return

    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowPanel(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return function() {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showPanel])

  async function handleNotificationClick(n) {
    try {
      await updateDoc(doc(db, 'notifications', n.id), {
        read: true,
        seen_by: arrayUnion({
          adminId: admin?.admin_id || admin?.email,
          adminName: admin?.full_name || 'Admin',
          timestamp: new Date().toISOString()
        })
      })
    } catch (e) {
      console.error('Mark read error:', e)
    }
    setShowPanel(false)
    navigate(NOTIFICATIONS_ROUTE[role] || '/dashboard/organisation/notifications')
  }

  function handleViewAll() {
    setShowPanel(false)
    navigate(NOTIFICATIONS_ROUTE[role] || '/dashboard/organisation/notifications')
  }

  function getGreeting() {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  function getIcon(type) {
    if (type === 'security_alert') return '🚨'
    if (type === 'agent_offline') return '⚠️'
    if (type === 'agent_online') return '✅'
    if (type === 'resource_warning') return '⚠️'
    if (type === 'model_deployed') return '📢'
    if (type === 'failed_login_attempt') return '🔒'
    if (type === 'new_org_registered') return '📥'
    if (type === 'threat_intel_update') return 'ℹ️'
    if (type === 'emergency_alert') return '🚨'
    if (type === 'maintenance_notice') return '🔧'
    if (type === 'policy_update') return '📋'
    if (type === 'feature_release') return '✨'
    return '📬'
  }

  const firstName = admin?.full_name?.split(' ')[0] || 'Admin'
  const unreadCount = notifications.length + adminMessages.length

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '32px'
    }}>
      <div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>
          {getGreeting()}, {firstName}
        </p>
        <h1 style={{
          fontSize: '24px', fontWeight: '700',
          color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif'
        }}>
          {title}
        </h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {showSearch && (
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{
              position: 'absolute', left: '10px',
              top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)'
            }} />
            <input
              type="text"
              placeholder="Search..."
              value={searchValue}
              onChange={function(e) { setSearchValue(e.target.value) }}
              className="input"
              style={{ paddingLeft: '32px', width: '180px', padding: '8px 12px 8px 32px' }}
            />
            {searchValue && (
              <button
                onClick={function() { setSearchValue('') }}
                style={{
                  position: 'absolute', right: '6px', top: '50%',
                  transform: 'translateY(-50%)', width: '28px', height: '28px',
                  border: 'none', background: 'transparent', cursor: 'pointer'
                }}
              >
                <X size={14} color="var(--text-muted)" />
              </button>
            )}
          </div>
        )}

        <ThemeToggle />

        {/* Notification Bell */}
        <div style={{ position: 'relative' }} ref={panelRef}>
          <button
            onClick={function() { setShowPanel(!showPanel) }}
            style={{
              width: '36px', height: '36px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', position: 'relative'
            }}
          >
            <Bell size={16} color={unreadCount > 0 ? 'var(--accent)' : 'var(--text-muted)'} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: '-4px', right: '-4px',
                minWidth: '16px', height: '16px',
                background: 'var(--danger)',
                borderRadius: '50%',
                fontSize: '10px', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px'
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showPanel && (
            <div style={{
              position: 'absolute', right: 0, top: '44px',
              width: '320px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              zIndex: 50, overflow: 'hidden'
            }}>
              {/* Header */}
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  Notifications
                </p>
                {unreadCount > 0 && (
                  <span style={{
                    fontSize: '11px', color: 'var(--text-muted)',
                    background: 'var(--bg-elevated)',
                    padding: '2px 8px', borderRadius: '20px'
                  }}>
                    {unreadCount} unread
                  </span>
                )}
              </div>

              {/* Items */}
              <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                {notifications.length === 0 && adminMessages.length === 0 ? (
                  <div style={{
                    padding: '32px', textAlign: 'center',
                    color: 'var(--text-muted)', fontSize: '13px'
                  }}>
                    <p style={{ fontSize: '24px', marginBottom: '8px' }}>🔔</p>
                    You're all caught up
                  </div>
                ) : (
                  <>
                    {notifications.map(function(n) {
                      return (
                        <button
                          key={n.id}
                          onClick={function() { handleNotificationClick(n) }}
                          style={{
                            width: '100%', textAlign: 'left',
                            padding: '12px 16px',
                            background: 'transparent', border: 'none',
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer', display: 'flex', gap: '10px',
                            alignItems: 'flex-start', transition: 'background 0.15s'
                          }}
                          onMouseEnter={function(e) { e.currentTarget.style.background = 'var(--bg-elevated)' }}
                          onMouseLeave={function(e) { e.currentTarget.style.background = 'transparent' }}
                        >
                          <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>{getIcon(n.type)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                              <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
                                {n.title}
                              </p>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: SEVERITY_COLOR[n.severity] || SEVERITY_COLOR.info }} />
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', margin: 0 }}>
                              {n.message}
                            </p>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                              {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : ''}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                    {adminMessages.map(function(m) {
                      return (
                        <button
                          key={m.id}
                          onClick={async function() {
                            try { await updateDoc(doc(db, 'admin_messages', m.id), { read: true }) } catch(e) {}
                            setShowPanel(false)
                            navigate(NOTIFICATIONS_ROUTE[role])
                          }}
                          style={{
                            width: '100%', textAlign: 'left',
                            padding: '12px 16px',
                            background: 'transparent', border: 'none',
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer', display: 'flex', gap: '10px',
                            alignItems: 'flex-start', transition: 'background 0.15s'
                          }}
                          onMouseEnter={function(e) { e.currentTarget.style.background = 'var(--bg-elevated)' }}
                          onMouseLeave={function(e) { e.currentTarget.style.background = 'transparent' }}
                        >
                          <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>✉️</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {m.title}
                            </p>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                              From: {m.senderName}
                            </p>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                              {m.timestamp?.toDate ? m.timestamp.toDate().toLocaleString() : ''}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>

              {/* Footer */}
              <button
                onClick={handleViewAll}
                style={{
                  width: '100%', padding: '12px',
                  borderTop: '1px solid var(--border)',
                  background: 'transparent', border: 'none',
                  borderTop: '1px solid var(--border)',
                  fontSize: '13px', color: 'var(--accent)',
                  fontWeight: '600', cursor: 'pointer',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={function(e) { e.currentTarget.style.background = 'var(--bg-elevated)' }}
                onMouseLeave={function(e) { e.currentTarget.style.background = 'transparent' }}
              >
                View all notifications →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TopBar
