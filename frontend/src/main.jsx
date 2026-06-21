import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { applyTheme } from './store/useThemeStore'

// Apply saved theme on startup
// Default is light
const savedTheme = localStorage.getItem('theme') || 'light'
applyTheme(savedTheme)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
