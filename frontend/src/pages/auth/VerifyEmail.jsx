import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import api from '../../services/api'
import toast from 'react-hot-toast'

function VerifyEmail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { token: routeToken } = useParams()
  const [status, setStatus] = useState('Verifying your account...')
  const [verifying, setVerifying] = useState(true)

  useEffect(function() {
    const params = new URLSearchParams(location.search)
    const token = params.get('token') || routeToken || ''
    const email = params.get('email') || ''

    if (!token) {
      setStatus('This verification link is invalid or has expired.')
      setVerifying(false)
      return
    }

    if (!email) {
      setStatus('The verification link is missing your email address.')
      setVerifying(false)
      return
    }

    async function verifyAccount() {
      try {
        const res = await api.post('/api/organisations/verify-sms', {
          token,
          email
        })

        if (res.data.status === 'success') {
          setStatus('Account verified successfully. Redirecting to login...')
          toast.success('Account verified successfully')
          setTimeout(function() {
            navigate('/login')
          }, 1500)
          return
        }

        setStatus(res.data.message || 'Unable to verify account right now.')
      } catch (e) {
        const msg = e.response?.data?.detail || 'Unable to verify account. Please try again or use the code from your registration email.'
        setStatus(msg)
        toast.error(msg)
      } finally {
        setVerifying(false)
      }
    }

    verifyAccount()
  }, [location.search, navigate, routeToken])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div className="card" style={{ width: '100%', maxWidth: '440px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
          Account Verification
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '20px' }}>
          {status}
        </p>
        {!verifying && (
          <button
            onClick={function() { navigate('/register') }}
            className="btn-primary"
            style={{ justifyContent: 'center', width: '100%' }}
          >
            Back to Registration
          </button>
        )}
      </div>
    </div>
  )
}

export default VerifyEmail
