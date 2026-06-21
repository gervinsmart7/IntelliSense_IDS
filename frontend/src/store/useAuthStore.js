import { create } from 'zustand'

const PERMISSIONS = {
  super_admin: [
    'view_all_orgs', 'delete_org', 'suspend_org',
    'trigger_retrain', 'approve_model',
    'force_push_model', 'rollback_model',
    'view_all_audit_logs', 'system_config',
    'create_platform_admin', 'delete_admin',
    'view_all_alerts', 'system_health'
  ],
  platform_admin: [
    'view_all_orgs', 'trigger_retrain',
    'approve_model', 'view_all_alerts',
    'view_all_audit_logs', 'system_health', 'create_org_admin'
  ],
  org_admin: [
    'view_own_org', 'view_own_alerts',
    'view_own_logs', 'view_own_agent_status',
    'regenerate_own_api_key'
  ]
}

const useAuthStore = create(function(set, get) {
  return {
    token: localStorage.getItem('token') || null,
    role: localStorage.getItem('role') || null,
    admin: JSON.parse(localStorage.getItem('admin') || 'null'),
    isAuthenticated: !!localStorage.getItem('token'),

    login: function(token, role, adminData) {
      localStorage.setItem('token', token)
      localStorage.setItem('role', role)
      localStorage.setItem('admin', JSON.stringify(adminData))
      set({ token, role, admin: adminData, isAuthenticated: true })
    },

    logout: function() {
      localStorage.clear()
      set({ token: null, role: null, admin: null, isAuthenticated: false })
    },

    hasPermission: function(permission) {
      const role = get().role
      return PERMISSIONS[role]?.includes(permission) || false
    }
  }
})

export default useAuthStore
