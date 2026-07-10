import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Shield, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '../../services/api'

function ResetPassword() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()

    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in both password fields')
      return
    }

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await authAPI.resetPassword(token, newPassword)
      toast.success('Password updated successfully')
      navigate('/login')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Unable to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ width: '40px', height: '40px', background: 'var(--accent)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={20} color="white" />
          </div>
          <div>
            <p style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)' }}>IntelliSense IDS</p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Create a new password</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px' }}>
              New password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={function(e) { setNewPassword(e.target.value) }}
                placeholder="Enter new password"
                className="input"
                style={{ paddingRight: '40px' }}
              />
              <button type="button" onClick={function() { setShowPassword(!showPassword) }} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Confirm password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={function(e) { setConfirmPassword(e.target.value) }}
              placeholder="Confirm new password"
              className="input"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary" style={{ justifyContent: 'center', padding: '12px' }}>
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ResetPassword
