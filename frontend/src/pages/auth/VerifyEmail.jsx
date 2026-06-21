import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, Loader } from 'lucide-react'
import { orgAPI } from '../../services/api'

function VerifyEmail() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('verifying')
  const [message, setMessage] = useState('')

  useEffect(function() {
    async function verify() {
      try {
        const response = await orgAPI.verifyEmail(token)
        setStatus('success')
        setMessage(response.data.message)
        setTimeout(function() { navigate('/login') }, 4000)
      } catch(e) {
        setStatus('error')
        setMessage(e.response?.data?.detail || 'Verification failed')
      }
    }
    if (token) verify()
  }, [token])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>

        {status === 'verifying' && (
          <>
            <div style={{
              width: '64px', height: '64px',
              background: 'rgba(99,102,241,0.1)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              animation: 'spin 1s linear infinite'
            }}>
              <Loader size={28} color="var(--accent)" />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '8px' }}>
              Verifying your email
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Please wait...
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{
              width: '64px', height: '64px',
              background: 'rgba(52,211,153,0.1)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <CheckCircle size={28} color="var(--success)" />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '8px' }}>
              Email Verified
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {message}
            </p>
            <div style={{
              padding: '12px 16px',
              background: 'rgba(52,211,153,0.08)',
              border: '1px solid rgba(52,211,153,0.2)',
              borderRadius: '8px', marginBottom: '16px'
            }}>
              <p style={{ fontSize: '12px', color: 'var(--success)' }}>
                Your API key has been sent to your email.
                Check your inbox before proceeding.
              </p>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Redirecting to login in 4 seconds...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{
              width: '64px', height: '64px',
              background: 'rgba(248,113,113,0.1)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <XCircle size={28} color="var(--danger)" />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '8px' }}>
              Verification Failed
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              {message}
            </p>
            <button
              onClick={function() { navigate('/register') }}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              Back to Registration
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default VerifyEmail
