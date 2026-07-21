import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'

const useAuthStore = create(
  persist(
    function(set, get) {
      return {
        admin: null,
        role: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,

        login: async function(email, password) {
          const res = await api.post('/api/auth/login', {
            email, password
          })
          const data = res.data.data
          set({
            admin: data.admin || { full_name: data.full_name, email: data.email, org_id: data.org_id, org_code: data.org_code },
            role: data.role || (data.admin && data.admin.role),
            token: data.access_token,
            refreshToken: data.refresh_token,
            isAuthenticated: true
          })
          return data
        },

        // Set authentication state directly after successful login
        setAuth: function(accessToken, refreshToken, role, adminObj) {
          set({
            token: accessToken,
            refreshToken: refreshToken,
            role: role,
            admin: adminObj,
            isAuthenticated: true
          })
        },

        logout: async function() {
          try {
            await api.post('/api/auth/logout')
          } catch(e) {
            // ignore logout errors
          } finally {
            set({
              admin: null,
              role: null,
              token: null,
              refreshToken: null,
              isAuthenticated: false
            })
            // Clear browser history so back button
            // cannot return to dashboard
            window.location.replace('/login')
            window.history.pushState(null, '', '/login')
          }
        },

        refreshAccessToken: async function() {
          const { refreshToken } = get()
          if (!refreshToken) return false
          try {
            const res = await api.post('/api/auth/refresh', {
              refresh_token: refreshToken
            })
            set({ token: res.data.data.access_token })
            return true
          } catch(e) {
            get().logout()
            return false
          }
        },

        setToken: function(token) {
          set({ token })
        }
      }
    },
    {
      name: 'intellisense-auth',
      partialize: function(state) {
        return {
          admin: state.admin,
          role: state.role,
          token: state.token,
          refreshToken: state.refreshToken,
          isAuthenticated: state.isAuthenticated
        }
      }
    }
  )
)

export default useAuthStore