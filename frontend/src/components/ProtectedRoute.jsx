import { Navigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'

function ProtectedRoute({ allowedRoles, children }) {
  const { isAuthenticated, role } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorised" replace />
  }

  return children
}

export default ProtectedRoute
