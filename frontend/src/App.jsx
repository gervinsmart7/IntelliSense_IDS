import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect } from 'react'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import VerifyEmail from './pages/auth/VerifyEmail'
import ResetPassword from './pages/auth/ResetPassword'
import SuperDashboard from './pages/super-admin/SuperDashboard'
import Organisations from './pages/super-admin/Organisations'
import ModelManagement from './pages/super-admin/ModelManagement'
import Alerts from './pages/super-admin/Alerts'
import AuditLogs from './pages/super-admin/AuditLogs'
import SystemConfig from './pages/super-admin/SystemConfig'
import AdminManagement from './pages/super-admin/AdminManagement'
import SystemHealth from './pages/super-admin/SystemHealth'
import LogsViewer from './pages/super-admin/LogsViewer'
import ThreatIntelligence from './pages/super-admin/ThreatIntelligence'
import NotificationsPage from './pages/super-admin/NotificationsPage'
import PlatformDashboard from './pages/platform-admin/PlatformDashboard'
import PlatformNotifications from './pages/platform-admin/PlatformNotifications'
import OrgDashboard from './pages/org-admin/OrgDashboard'
import AgentStatus from './pages/org-admin/AgentStatus'
import Reports from './pages/org-admin/Reports'
import AccountSettings from './pages/org-admin/AccountSettings'
import ActivityHistory from './pages/org-admin/ActivityHistory'
import Notifications from './pages/org-admin/Notifications'
import AlertDetail from './pages/shared/AlertDetail'
import Layout from './components/Layout'
import useAuthStore from './store/useAuthStore'
import useThemeStore from './store/useThemeStore'

function Unauthorised() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '64px', marginBottom: '16px' }}>🔒</p>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', fontFamily: 'Syne, sans-serif' }}>
          Access Denied
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          You do not have permission to view this page
        </p>
      </div>
    </div>
  )
}

function ComingSoon({ page }) {
  return (
    <Layout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '48px' }}>🚧</p>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>
          {page}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Coming soon</p>
      </div>
    </Layout>
  )
}

function RootRedirect() {
  const { isAuthenticated, role } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (role === 'super_admin') return <Navigate to="/dashboard/super" replace />
  if (role === 'platform_admin') return <Navigate to="/dashboard/platform" replace />
  return <Navigate to="/dashboard/organisation" replace />
}

function App() {
  const { isAuthenticated, role } = useAuthStore()
  const { initTheme } = useThemeStore()

  useEffect(function() {
    initTheme()
  }, [])

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '14px'
          }
        }}
      />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={isAuthenticated ? <RootRedirect /> : <Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-account" element={<VerifyEmail />} />
        <Route path="/verify-email/:token" element={<VerifyEmail />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/unauthorised" element={<Unauthorised />} />

        {/* Super Admin */}
        <Route path="/dashboard/super" element={<ProtectedRoute allowedRoles={['super_admin']}><SuperDashboard /></ProtectedRoute>} />
        <Route path="/dashboard/super/organisations" element={<ProtectedRoute allowedRoles={['super_admin']}><Organisations /></ProtectedRoute>} />
        <Route path="/dashboard/super/model" element={<ProtectedRoute allowedRoles={['super_admin']}><ModelManagement /></ProtectedRoute>} />
        <Route path="/dashboard/super/alerts" element={<ProtectedRoute allowedRoles={['super_admin']}><Alerts /></ProtectedRoute>} />
        <Route path="/dashboard/super/alerts/:alertId" element={<ProtectedRoute allowedRoles={['super_admin']}><AlertDetail /></ProtectedRoute>} />
        <Route path="/dashboard/super/threat-intel" element={<ProtectedRoute allowedRoles={['super_admin']}><ThreatIntelligence /></ProtectedRoute>} />
        <Route path="/dashboard/super/logs" element={<ProtectedRoute allowedRoles={['super_admin']}><LogsViewer /></ProtectedRoute>} />
        <Route path="/dashboard/super/admins" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminManagement /></ProtectedRoute>} />
        <Route path="/dashboard/super/audit" element={<ProtectedRoute allowedRoles={['super_admin']}><AuditLogs /></ProtectedRoute>} />
        <Route path="/dashboard/super/notifications" element={<ProtectedRoute allowedRoles={['super_admin']}><NotificationsPage /></ProtectedRoute>} />
        <Route path="/dashboard/super/health" element={<ProtectedRoute allowedRoles={['super_admin']}><SystemHealth /></ProtectedRoute>} />
        <Route path="/dashboard/super/config" element={<ProtectedRoute allowedRoles={['super_admin']}><SystemConfig /></ProtectedRoute>} />

        {/* Platform Admin */}
        <Route path="/dashboard/platform" element={<ProtectedRoute allowedRoles={['platform_admin']}><PlatformDashboard /></ProtectedRoute>} />
        <Route path="/dashboard/platform/organisations" element={<ProtectedRoute allowedRoles={['platform_admin']}><Organisations /></ProtectedRoute>} />
        <Route path="/dashboard/platform/model" element={<ProtectedRoute allowedRoles={['platform_admin']}><ModelManagement /></ProtectedRoute>} />
        <Route path="/dashboard/platform/alerts" element={<ProtectedRoute allowedRoles={['platform_admin']}><Alerts /></ProtectedRoute>} />
        <Route path="/dashboard/platform/alerts/:alertId" element={<ProtectedRoute allowedRoles={['platform_admin']}><AlertDetail /></ProtectedRoute>} />
        <Route path="/dashboard/platform/admins" element={<ProtectedRoute allowedRoles={['platform_admin']}><AdminManagement /></ProtectedRoute>} />
        <Route path="/dashboard/platform/threat-intel" element={<ProtectedRoute allowedRoles={['platform_admin']}><ThreatIntelligence /></ProtectedRoute>} />
        <Route path = "/dashboard/platform/audit" element={<ProtectedRoute allowedRoles={['platform_admin']}><AuditLogs /></ProtectedRoute>} />
        <Route path ="/dashboard/platform/logs" element={<ProtectedRoute allowedRoles={['platform_admin']}><LogsViewer /></ProtectedRoute>} />
        <Route path="/dashboard/platform/notifications" element={<ProtectedRoute allowedRoles={['platform_admin']}><PlatformNotifications /></ProtectedRoute>} />
        <Route path="/dashboard/platform/health" element={<ProtectedRoute allowedRoles={['platform_admin']}><SystemHealth /></ProtectedRoute>} />

        {/* Org Admin */}
        <Route path="/dashboard/organisation" element={<ProtectedRoute allowedRoles={['org_admin']}><OrgDashboard /></ProtectedRoute>} />
        <Route path="/dashboard/organisation/alerts" element={<ProtectedRoute allowedRoles={['org_admin']}><Alerts /></ProtectedRoute>} />
        <Route path="/dashboard/organisation/alerts/:alertId" element={<ProtectedRoute allowedRoles={['org_admin']}><AlertDetail /></ProtectedRoute>} />
        <Route path="/dashboard/organisation/logs" element={<ProtectedRoute allowedRoles={['org_admin']}><LogsViewer /></ProtectedRoute>} />
        <Route path="/dashboard/organisation/agent" element={<ProtectedRoute allowedRoles={['org_admin']}><AgentStatus /></ProtectedRoute>} />
        <Route path="/dashboard/organisation/activity" element={<ProtectedRoute allowedRoles={['org_admin']}><ActivityHistory /></ProtectedRoute>} />
        <Route path="/dashboard/organisation/notifications" element={<ProtectedRoute allowedRoles={["org_admin"]}><Notifications /></ProtectedRoute>} />
        <Route path="/dashboard/organisation/reports" element={<ProtectedRoute allowedRoles={['org_admin']}><Reports /></ProtectedRoute>} />
        <Route path="/dashboard/organisation/settings" element={<ProtectedRoute allowedRoles={['org_admin']}><AccountSettings /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
