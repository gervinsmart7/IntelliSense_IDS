import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'

function ProtectedRoute({ allowedRoles, children }) {
  const { isAuthenticated, role } = useAuthStore()
  const location = useLocation()

  useEffect(function() {
    if (!isAuthenticated) {
      // Replace history entries so back button
      // cannot return to protected pages
      window.history.replaceState(null, '', '/login')
    }
    }, [isAuthenticated])

  if (!isAuthenticated) {
    return (
    <Navigate 
      to="/login"
      state={{ from: location }}
    replace />
    )
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default ProtectedRoute
