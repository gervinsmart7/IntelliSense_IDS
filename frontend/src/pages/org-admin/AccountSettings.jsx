import { useState } from 'react'
import { User, Lock, Save } from 'lucide-react'
import { authAPI } from '../../services/api'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import useAuthStore from '../../store/useAuthStore'
import toast from 'react-hot-toast'

function AccountSettings() {
  const { admin } = useAuthStore()
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  })
  const [saving, setSaving] = useState(false)

  async function handleChangePassword(e) {
    e.preventDefault()
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('New passwords do not match')
      return
    }
    if (passwordForm.new_password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    try {
      await authAPI.changePassword(
        passwordForm.current_password,
        passwordForm.new_password
      )
      toast.success('Password changed successfully')
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch(e) {
      toast.error(e.response?.data?.detail || 'Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout>
      <TopBar title="Account Settings" />

      <div style={{ maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Profile info */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <User size={16} color="var(--accent)" />
            <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Profile Information
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { label: 'Full Name', value: admin?.full_name },
              { label: 'Email Address', value: admin?.email },
              { label: 'Role', value: admin ? (admin.role === 'org_admin' ? 'Organisation Admin' : admin.role) : '—' },
              { label: 'Organisation Code', value: admin?.org_code || '—' }
            ].map(function(item) {
              return (
                <div key={item.label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '12px 14px',
                  background: 'var(--bg-elevated)',
                  borderRadius: '8px'
                }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.label}</p>
                  <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                    {item.value}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Change password */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Lock size={16} color="var(--accent)" />
            <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Change Password
            </p>
          </div>

          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { key: 'current_password', label: 'Current Password', placeholder: 'Enter current password' },
              { key: 'new_password', label: 'New Password', placeholder: 'Minimum 8 characters' },
              { key: 'confirm_password', label: 'Confirm New Password', placeholder: 'Repeat new password' }
            ].map(function(field) {
              return (
                <div key={field.key}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    {field.label}
                  </label>
                  <input
                    type="password"
                    value={passwordForm[field.key]}
                    onChange={function(e) {
                      setPasswordForm(function(p) {
                        const updated = {}
                        updated[field.key] = e.target.value
                        return { ...p, ...updated }
                      })
                    }}
                    placeholder={field.placeholder}
                    className="input"
                  />
                </div>
              )
            })}

            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
              style={{ justifyContent: 'center', padding: '12px', marginTop: '4px' }}
            >
              <Save size={14} />
              {saving ? 'Saving...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  )
}

export default AccountSettings
