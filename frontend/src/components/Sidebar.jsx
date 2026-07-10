import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Bell, Brain,
  FileText, AlertTriangle, Settings,
  LogOut, Shield, Activity,
  ClipboardList, Users, Cpu
} from 'lucide-react'
import useAuthStore from '../store/useAuthStore'
import { authAPI } from '../services/api'

const NAV_ITEMS = {
  super_admin: [
    { to: '/dashboard/super', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/dashboard/super/organisations', icon: Building2, label: 'Organisations' },
    { to: '/dashboard/super/admins', icon: Users, label: 'Admins' },
    { to: '/dashboard/super/model', icon: Brain, label: 'System Version' },
    { to: '/dashboard/super/alerts', icon: AlertTriangle, label: 'Alerts' },
    { to: '/dashboard/super/notifications', icon: Bell, label: 'Notifications' },
    { to: '/dashboard/super/threat-intel', icon: Shield, label: 'Threat Intel' },
    { to: '/dashboard/super/logs', icon: FileText, label: 'Logs' },
    { to: '/dashboard/super/audit', icon: ClipboardList, label: 'Audit Logs' },
    { to: '/dashboard/super/health', icon: Cpu, label: 'System Health' },
    { to: '/dashboard/super/config', icon: Settings, label: 'Config' }
  ],
  platform_admin: [
    { to: '/dashboard/platform', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/dashboard/platform/organisations', icon: Building2, label: 'Organisations' },
    { to: '/dashboard/platform/admins', icon: Users, label: 'Admins' },
    { to: '/dashboard/platform/model', icon: Brain, label: 'System Version' },
    { to: '/dashboard/platform/alerts', icon: AlertTriangle, label: 'Alerts' },
    { to: '/dashboard/platform/notifications', icon: Bell, label: 'Notifications' },
    { to: '/dashboard/platform/threat-intel', icon: Shield, label: 'Threat Intel' },
    { to: '/dashboard/platform/audit', icon: ClipboardList, label: 'Audit Logs' },
    { to: '/dashboard/platform/logs', icon: FileText, label: 'Logs' },
    { to: '/dashboard/platform/health', icon: Activity, label: 'Health' }
  ],
  org_admin: [
    { to: '/dashboard/organisation', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/dashboard/organisation/alerts', icon: AlertTriangle, label: 'Alerts' },
    { to: '/dashboard/organisation/logs', icon: FileText, label: 'Logs' },
    { to: '/dashboard/organisation/agent', icon: Shield, label: 'Agent' },
    { to: '/dashboard/organisation/activity', icon: Activity, label: 'History' },
    { to: '/dashboard/organisation/notifications', icon: Bell, label: 'Notifications' },
    { to: '/dashboard/organisation/reports', icon: ClipboardList, label: 'Reports' },
    { to: '/dashboard/organisation/settings', icon: Settings, label: 'Settings' }
  ]
}

const ROLE_COLORS = {
  super_admin: '#A78BFA',
  platform_admin: '#6366F1',
  org_admin: '#34D399'
}

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  platform_admin: 'Platform Admin',
  org_admin: 'Org Admin'
}

function Sidebar() {
  const { role, admin, logout } = useAuthStore()
  const navigate = useNavigate()
  const items = NAV_ITEMS[role] || []

  async function handleLogout() {
    try { await authAPI.logout() } catch(e) {}
    logout()
    navigate('/login')
  }

  const initial = admin?.full_name?.charAt(0)?.toUpperCase() || 'A'

  return (
    <div className="sidebar">
      {/* Logo */}
      <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px',
            background: 'var(--accent)',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <Shield size={16} color="white" />
          </div>
          <div>
            <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1.2 }}>
              IntelliSense
            </p>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              IDS Platform
            </p>
          </div>
        </div>
      </div>

      {/* Admin info */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px',
            background: 'var(--bg-elevated)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', fontWeight: '600',
            color: 'var(--accent)', flexShrink: 0
          }}>
            {initial}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <p style={{
              fontSize: '12px', fontWeight: '500',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {admin?.full_name || 'Admin'}
            </p>
            <p style={{ fontSize: '11px', color: ROLE_COLORS[role] }}>
              {ROLE_LABELS[role]}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {items.map(function(item) {
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to.split('/').length <= 3}
              className={function({ isActive }) {
                return 'sidebar-item' + (isActive ? ' active' : '')
              }}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Logout */}
      <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={handleLogout}
          className="sidebar-item"
          style={{ width: '100%', color: 'var(--danger)', background: 'none', border: 'none' }}
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  )
}

export default Sidebar
