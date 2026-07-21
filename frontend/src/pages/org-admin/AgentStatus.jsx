import { useState, useEffect } from 'react'
import {
  Download, Terminal, CheckCircle,
  AlertTriangle, RefreshCw, Copy,
  Monitor, Server
} from 'lucide-react'
import { orgAPI } from '../../services/api'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import useAuthStore from '../../store/useAuthStore'
import toast from 'react-hot-toast'
import {
  collection, query, where,
  onSnapshot
} from 'firebase/firestore'
import { db } from '../../services/firebase'

function AgentStatus() {
  const { admin } = useAuthStore()
  const [org, setOrg] = useState(null)
  const [copied, setCopied] = useState(null)
  const [newKey, setNewKey] = useState(null)
  const [showKey, setShowKey] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [selectedOS, setSelectedOS] = useState('linux')

  useEffect(function() {
    if (!admin?.org_id) return
    const unsub = onSnapshot(
      query(
        collection(db, 'organisations'),
        where('org_id', '==', admin.org_id)
      ),
      function(snap) {
        if (!snap.empty) {
          setOrg({ id: snap.docs[0].id, ...snap.docs[0].data() })
        }
      }
    )
    return unsub
  }, [admin?.org_id])

  async function handleRegenerateKey() {
    if (!window.confirm(
      'Regenerate API key? The current agent will disconnect and need reconfiguring.'
    )) return

    setRegenerating(true)
    try {
        const res = await orgAPI.regenerateKey(admin.org_id)
        setNewKey(res.data.data.api_key)
        toast.success('API key regenerated')
    } catch(e) {
        toast.error('Failed to regenerate key')
    } finally {
        setRegenerating(false)
      }
  }

  function copyText(text, key) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    toast.success('Copied to clipboard')
    setTimeout(function() { setCopied(null) }, 2000)
  }

  const agentStatus = org?.agent_status || 'not_installed'
  const apiKey = org?.raw_api_key_temp || 'Check your welcome email'
  const backendUrl = 'https://intellisense-ids-backend.onrender.com'

  const statusConfig = {
    online: { color: '#34D399', bg: 'rgba(52,211,153,0.1)', label: 'Online', icon: CheckCircle },
    offline: { color: '#F87171', bg: 'rgba(248,113,113,0.1)', label: 'Offline', icon: AlertTriangle },
    not_installed: { color: '#64748B', bg: 'rgba(100,116,139,0.1)', label: 'Not Installed', icon: AlertTriangle }
  }

  const status = statusConfig[agentStatus] || statusConfig.not_installed
  const StatusIcon = status.icon

  const linuxSteps = [
    {
      title: 'Download the agent',
      command: 'wget https://intellisense-ids-backend.onrender.com/api/agent/download/linux -O intellisense-agent',
      desc: 'Downloads the single executable agent file'
    },
    {
      title: 'Make it executable',
      command: 'chmod +x intellisense-agent',
      desc: 'Grants permission to run the agent'
    },
    {
      title: 'Configure your credentials',
      command: `echo "BACKEND_URL=${backendUrl}\\nAPI_KEY=${apiKey}\\nORG_ID=${admin?.org_id || 'your-org-id'}" > agent.env`,
      desc: 'Creates the configuration file'
    },
    {
      title: 'Run the agent',
      command: './intellisense-agent',
      desc: 'Starts monitoring your network. Agent appears online in your dashboard within 30 seconds.'
    }
  ]

  const windowsSteps = [
    {
      title: 'Download the agent',
      command: 'Invoke-WebRequest -Uri "https://intellisense-ids-backend.onrender.com/api/agent/download/windows" -OutFile "intellisense-agent.exe"',
      desc: 'Run in PowerShell as Administrator'
    },
    {
      title: 'Configure your credentials',
      command: `@"
BACKEND_URL=${backendUrl}
API_KEY=${apiKey}
ORG_ID=${admin?.org_id || 'your-org-id'}
"@ | Out-File -FilePath "agent.env" -Encoding UTF8`,
      desc: 'Creates the configuration file'
    },
    {
      title: 'Run the agent',
      command: '.\\intellisense-agent.exe',
      desc: 'Starts monitoring your network. Agent appears online in your dashboard within 30 seconds.'
    }
  ]

  const steps = selectedOS === 'linux' ? linuxSteps : windowsSteps

  return (
    <Layout>
      <TopBar title="Agent Status" />

      {/* Status Card */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '56px', height: '56px', background: status.bg, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <StatusIcon size={26} color={status.color} />
            </div>
            <div>
              <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>
                IDS Agent
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: status.color }} />
                <span style={{ fontSize: '13px', color: status.color, fontWeight: '600' }}>
                  {status.label}
                </span>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Model Version</p>
            <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              {org?.model_version || 'None deployed'}
            </p>
          </div>
        </div>

        {agentStatus === 'online' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '20px' }}>
            {[
              { label: 'Flows Captured', value: (org?.flows_captured || 0).toLocaleString() },
              { label: 'Flows Uploaded', value: (org?.flows_uploaded || 0).toLocaleString() },
              { label: 'Last Heartbeat', value: org?.last_seen?.toDate?.()?.toLocaleTimeString() || 'Just now' }
            ].map(function(stat) {
              return (
                <div key={stat.label} style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: '8px', textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>{stat.value}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Install Guide */}
      {agentStatus !== 'online' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <Download size={16} color="var(--accent)" />
            <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Install the IDS Agent
            </p>
          </div>

          <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
              The agent is a <strong style={{ color: 'var(--text-primary)' }}>single executable file</strong> — no Python, no dependencies, no package installation required. Download it, configure your API key, and run. That's it.
            </p>
          </div>

          {/* OS Selector */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
            {[
              { key: 'linux', label: 'Linux', icon: Server },
              { key: 'windows', label: 'Windows', icon: Monitor }
            ].map(function(os) {
              const isActive = selectedOS === os.key
              return (
                <button
                  key={os.key}
                  onClick={function() { setSelectedOS(os.key) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 20px', borderRadius: '8px',
                    border: '1px solid ' + (isActive ? 'var(--accent)' : 'var(--border)'),
                    background: isActive ? 'rgba(99,102,241,0.1)' : 'var(--bg-elevated)',
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <os.icon size={14} />
                  {os.label}
                </button>
              )
            })}
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {steps.map(function(step, i) {
              return (
                <div key={i} style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ width: '28px', height: '28px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: 'var(--accent)' }}>
                      {i + 1}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                      {step.title}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                      {step.desc}
                    </p>
                    <div style={{ background: '#0D1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <code style={{ fontSize: '12px', color: '#34D399', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.6, wordBreak: 'break-all', flex: 1 }}>
                        {step.command}
                      </code>
                      <button
                        onClick={function() { copyText(step.command, i) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === i ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0, padding: '2px' }}
                      >
                        {copied === i ? <CheckCircle size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* API Key reminder */}
          <div style={{ marginTop: '24px', padding: '14px 18px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: '10px' }}>
            <p style={{ fontSize: '12px', color: 'var(--warning)', fontWeight: '600', marginBottom: '6px' }}>
              ⚠️ Your API Key
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Your API key was sent to your email when you verified your account. You can also find it below:
            </p>
            <div style={{ background: '#0D1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <code style={{ fontSize: '12px', color: '#6366F1', fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-all' }}>
                {apiKey}
              </code>
              <button
                onClick={function() { copyText(apiKey, 'apikey') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === 'apikey' ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0 }}
              >
                {copied === 'apikey' ? <CheckCircle size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

export default AgentStatus
