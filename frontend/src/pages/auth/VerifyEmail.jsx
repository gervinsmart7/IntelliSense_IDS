import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function VerifyEmail() {
  const navigate = useNavigate()

  useEffect(function() {
    // Old email verification link — redirect to login
    // SMS verification now happens inside the registration flow
    navigate('/login')
  }, [])

  return null
}

export default VerifyEmail
