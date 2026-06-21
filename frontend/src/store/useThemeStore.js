import { create } from 'zustand'

const useThemeStore = create(function(set, get) {
  const savedTheme = localStorage.getItem('theme') || 'light'

  return {
    theme: savedTheme,

    toggleTheme: function() {
      const current = get().theme
      const next = current === 'light' ? 'dark' : 'light'
      localStorage.setItem('theme', next)
      set({ theme: next })
      applyTheme(next)
    },

    initTheme: function() {
      const saved = localStorage.getItem('theme') || 'light'
      set({ theme: saved })
      applyTheme(saved)
    }
  }
})

function applyTheme(theme) {
  const root = document.documentElement

  if (theme === 'dark') {
    root.style.setProperty('--bg-primary', '#0F1117')
    root.style.setProperty('--bg-card', '#1A1D27')
    root.style.setProperty('--bg-elevated', '#22263A')
    root.style.setProperty('--text-primary', '#E2E8F0')
    root.style.setProperty('--text-muted', '#64748B')
    root.style.setProperty('--border', 'rgba(255, 255, 255, 0.06)')
    root.style.setProperty('--accent', '#6366F1')
    root.style.setProperty('--accent-hover', '#4F46E5')
    root.style.setProperty('--success', '#34D399')
    root.style.setProperty('--warning', '#FBBF24')
    root.style.setProperty('--danger', '#F87171')
    document.body.style.background = '#0F1117'
    document.body.style.color = '#E2E8F0'
  } else {
    root.style.setProperty('--bg-primary', '#F8FAFC')
    root.style.setProperty('--bg-card', '#FFFFFF')
    root.style.setProperty('--bg-elevated', '#F1F5F9')
    root.style.setProperty('--text-primary', '#0F172A')
    root.style.setProperty('--text-muted', '#64748B')
    root.style.setProperty('--border', 'rgba(0, 0, 0, 0.08)')
    root.style.setProperty('--accent', '#6366F1')
    root.style.setProperty('--accent-hover', '#4F46E5')
    root.style.setProperty('--success', '#059669')
    root.style.setProperty('--warning', '#D97706')
    root.style.setProperty('--danger', '#DC2626')
    document.body.style.background = '#F8FAFC'
    document.body.style.color = '#0F172A'
  }
}

export { applyTheme }
export default useThemeStore
