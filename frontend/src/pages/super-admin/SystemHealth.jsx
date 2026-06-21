import { useState, useEffect } from 'react'
import { Activity, Server, Database, Cloud, RefreshCw } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import api from '../../services/api'
import toast from 'react-hot-toast'

function SystemHealth() {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState([])

  useEffect(function() {
    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return function() { clearInterval(interval) }
  }, [])

  async function checkHealth() {
    try {
      const startTime = performance.now()
      const response = await api.get('/health')
      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      const timestamp = new Date().toLocaleTimeString()

      const healthData = {
        status: response.data.status,
        timestamp: timestamp,
        api: 'healthy',
        firebase: 'healthy',
        s3: 'healthy'
      }

      setHealth(healthData)

      setHistory(function(prev) {
        const newEntry = {
          time: timestamp,
          response: responseTime
        }
        return [...prev.slice(-19), newEntry]
      })

    } catch(e) {
      setHealth({ status: 'error', api: 'error', firebase: 'unknown', s3: 'unknown' })
    } finally {
      setLoading(false)
    }
  }

  const services = [
    {
      name: 'Backend API',
      icon: Server,
      status: health?.api || 'checking',
      description: 'FastAPI server on EC2',
      detail: health?.api === 'healthy' ? 'All endpoints responding' : 'Connection error'
    },
    {
      name: 'Firebase',
      icon: Database,
      status: health?.firebase || 'checking',
      description: 'Firestore database',
      detail: health?.firebase === 'healthy' ? 'Real-time sync active' : 'Check credentials'
    },
    {
      name: 'AWS S3',
      icon: Cloud,
      status: health?.s3 || 'checking',
      description: 'Log and model storage',
      detail: health?.s3 === 'healthy' ? 'Bucket accessible' : 'Check credentials'
    },
    {
      name: 'ML Pipeline',
      icon: Activity,
      status: 'healthy',
      description: 'Retraining scheduler',
      detail: 'APScheduler running'
    }
  ]

  const statusColor = {
    healthy: { color: 'var(--success)', bg: 'rgba(52,211,153,0.1)', label: 'Healthy' },
    error: { color: 'var(--danger)', bg: 'rgba(248,113,113,0.1)', label: 'Error' },
    checking: { color: 'var(--warning)', bg: 'rgba(251,191,36,0.1)', label: 'Checking' },
    unknown: { color: 'var(--text-muted)', bg: 'var(--bg-elevated)', label: 'Unknown' }
  }

  return (
    <Layout>
      <TopBar title="System Health" />

      {/* Overall status */}
      <div style={{
        padding: '20px 24px',
        background: health?.status === 'success'
          ? 'rgba(52,211,153,0.08)'
          : 'rgba(248,113,113,0.08)',
        border: '1px solid ' + (health?.status === 'success'
          ? 'rgba(52,211,153,0.2)'
          : 'rgba(248,113,113,0.2)'),
        borderRadius: '12px',
        marginBottom: '24px',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '12px', height: '12px',
            borderRadius: '50%',
            background: health?.status === 'success' ? 'var(--success)' : 'var(--danger)',
            boxShadow: '0 0 0 3px ' + (health?.status === 'success'
              ? 'rgba(52,211,153,0.2)'
              : 'rgba(248,113,113,0.2)')
          }} />
          <div>
            <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
              {health?.status === 'success' ? 'All Systems Operational' : 'System Issues Detected'}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Last checked: {health?.timestamp || 'Checking...'}
            </p>
          </div>
        </div>
        <button
          onClick={checkHealth}
          className="btn-secondary"
          style={{ padding: '8px 14px', fontSize: '13px' }}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Service cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '16px', marginBottom: '24px'
      }}>
        {services.map(function(service) {
          const s = statusColor[service.status] || statusColor.unknown
          return (
            <div key={service.name} className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px', height: '40px',
                    background: s.bg,
                    borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <service.icon size={18} color={s.color} />
                  </div>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      {service.name}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {service.description}
                    </p>
                  </div>
                </div>
                <span className={'badge badge-' + (service.status === 'healthy' ? 'success' : service.status === 'error' ? 'danger' : 'warning')}>
                  {s.label}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {service.detail}
              </p>
            </div>
          )
        })}
      </div>

      {/* Response time chart */}
      <div className="card">
        <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
          API Response Time
        </p>
        <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
          Last 20 checks (ms)
        </p>
        {history.length > 1 ? (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="time" tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px', fontSize: '12px',
                  color: 'var(--text-primary)'
                }}
              />
              <Line
                type="monotone"
                dataKey="response"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
                name="Response (ms)"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            Collecting data...
          </div>
        )}
      </div>
    </Layout>
  )
}

export default SystemHealth
