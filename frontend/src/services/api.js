import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'https://intellisense-ids.onrender.com/'

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
})

// Request interceptor — attach access token
api.interceptors.request.use(function(config) {
  const state = JSON.parse(localStorage.getItem('intellisense-auth') || '{}')
  const token = state?.state?.token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor — auto refresh on 401
api.interceptors.response.use(
  function(response) { return response },
  async function(error) {
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const state = JSON.parse(
          localStorage.getItem('intellisense-auth') || '{}'
        )
        const refreshToken = state?.state?.refreshToken

        if (refreshToken) {
          const res = await api.post('/api/auth/refresh', {
            refresh_token: refreshToken
          })
          const newToken = res.data.data.access_token

          // Update token in localStorage
          const stored = JSON.parse(
            localStorage.getItem('intellisense-auth') || '{}'
          )
          stored.state.token = newToken
          localStorage.setItem(
            'intellisense-auth',
            JSON.stringify(stored)
          )

          original.headers.Authorization = `Bearer ${newToken}`
          return api(original)
        }
      } catch(e) {
        // Refresh failed — clear auth and redirect to login
        localStorage.removeItem('intellisense-auth')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  login: (email, password) =>
    api.post('/api/auth/login', { email, password }),
  forgotPassword: (email) =>
    api.post('/api/auth/forgot-password', { email }),
  resetPassword: (token, new_password) =>
    api.post('/api/auth/reset-password', { token, new_password }),
  logout: () =>
    api.post('/api/auth/logout'),
  getMe: () =>
    api.get('/api/auth/me'),
  changePassword: (current_password, new_password) =>
    api.post('/api/auth/change-password', {
      current_password, new_password
    })
}

export const orgAPI = {
  register: (data) =>
    api.post('/api/organisations/register', data),
  verifyEmail: (token) =>
    api.post('/api/organisations/verify-email/' + token),
  getAll: () =>
    api.get('/api/organisations'),
  getOne: (orgId) =>
    api.get('/api/organisations/' + orgId),
  update: (orgId, data) =>
    api.put('/api/organisations/' + orgId, data),
  suspend: (orgId) =>
    api.post('/api/organisations/' + orgId + '/suspend'),
  reinstate: (orgId) =>
    api.post('/api/organisations/' + orgId + '/reinstate'),
  delete: (orgId) =>
    api.delete('/api/organisations/' + orgId),
  regenerateKey: (orgId) =>
    api.post('/api/organisations/' + orgId + '/regenerate-key')
}

export const modelAPI = {
  getVersions: () =>
    api.get('/api/model/versions'),
  getProduction: () =>
    api.get('/api/model/production'),
  triggerRetrain: (reason) =>
    api.post('/api/model/retrain', { reason }),
  pushModel: (version) =>
    api.post('/api/model/push/' + version),
  rollback: (version) =>
    api.post('/api/model/rollback/' + version),
  getRetrainJobs: () =>
    api.get('/api/model/retrain/jobs')
}

export const analyticsAPI = {
  getOverview: () =>
    api.get('/api/analytics/overview'),
  getTraffic: (orgId, period) =>
    api.get('/api/analytics/traffic/' + orgId, { params: { period } }),
  getAttackTypes: (orgId) =>
    api.get('/api/analytics/attack-types/' + orgId),
  getSeverity: (orgId) =>
    api.get('/api/analytics/severity/' + orgId),
  getTopIPs: (orgId) =>
    api.get('/api/analytics/top-ips/' + orgId),
  getTopPorts: (orgId) =>
    api.get('/api/analytics/top-ports/' + orgId),
  getGlobal: () =>
    api.get('/api/analytics/global'),
  getRisk: (orgId) =>
    api.get('/api/analytics/risk/' + orgId),
  getRiskRanking: () =>
    api.get('/api/analytics/risk-ranking')
}

export const alertsAPI = {
  getAll: (params) =>
    api.get('/api/alerts', { params }),
  getOne: (alertId) =>
    api.get('/api/alerts/' + alertId),
  updateStatus: (alertId, status, note) =>
    api.put('/api/alerts/' + alertId + '/status', { status, note }),
  submitFeedback: (alertId, isFalsePositive, note) =>
    api.post('/api/alerts/' + alertId + '/feedback', {
      alert_id: alertId,
      is_false_positive: isFalsePositive,
      note
    })
}

export default api
