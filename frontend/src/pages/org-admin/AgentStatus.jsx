import { useState, useEffect } from 'react'
import {
  Shield, RefreshCw, Copy,
  Eye, EyeOff, Download, Terminal,
  CheckCircle, AlertCircle
} from 'lucide-react'
import {
  collection, query, where, onSnapshot
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { orgAPI } from '../../services/api'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import useAuthStore from '../../store/useAuthStore'
import toast from 'react-hot-toast'

function AgentStatus() {
  const { admin } = useAuthStore()
  const [org, setOrg] = useState(null)
  const [newKey, setNewKey] = useState(null)
  const [showKey, setShowKey] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showInstallGuide, setShowInstallGuide] = useState(false)
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

  function copyText(text) {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const isOnline = org?.agent_status === 'online'
  const isNotInstalled = org?.agent_status === 'not_installed'
  const isPending = org?.status === 'pending_verification'

  const installCommands = {
    linux: [
      {
        step: 'Install Python 3',
        cmd: 'sudo apt install python3 python3-pip -y'
      },
      {
        step: 'Install Java (for CICFlowMeter)',
        cmd: 'sudo apt install openjdk-11-jdk -y'
      },
      {
        step: 'Install TShark',
        cmd: 'sudo apt install tshark -y'
      },
      {
        step: 'Download agent',
        cmd: 'git clone https://github.com/gervinsmart7/intellisense-ids-agent.git'
      },
      {
        step: 'Install dependencies',
        cmd: 'cd intellisense-ids-agent && pip install -r requirements.txt'
      },
      {
        step: 'Run setup wizard',
        cmd: 'python3 setup.py'
      },
      {
        step: 'Start agent',
        cmd: 'python3 main.py'
      }
    ],
    windows: [
      {
        step: 'Install Python 3 from python.org',
        cmd: 'https://python.org/downloads'
      },
      {
        step: 'Install Java from adoptium.net',
        cmd: 'https://adoptium.net'
      },
      {
        step: 'Install Npcap from npcap.com',
        cmd: 'https://npcap.com'
      },
      {
        step: 'Download agent',
        cmd: 'git clone https://github.com/gervinsmart7/intellisense-ids-agent.git'
      },
      {
        step: 'Install dependencies',
        cmd: 'cd intellisense-ids-agent && pip install -r requirements.txt'
      },
      {
        step: 'Run setup wizard',
        cmd: 'python setup.py'
      },
      {
        step: 'Start agent',
        cmd: 'python main.py'
      }
    ]
  }

  const statusItems = [
    {
      label: 'Agent Status',
      value: org?.agent_status || 'Unknown',
      type: 'badge',
      color: isOnline ? 'success' : isNotInstalled ? 'warning' : 'danger'
    },
    { label: 'Current Model', value: org?.model_version || 'None', type: 'text' },
    { label: 'Update Status', value: org?.update_status || '—', type: 'text' },
    {
      label: 'Last Seen',
      value: org?.last_seen?.toDate?.()?.toLocaleString() || '—',
      type: 'text'
    },
    {
      label: 'Last Sync',
      value: org?.last_sync?.toDate?.()?.toLocaleString() || '—',
      type: 'text'
    },
    { label: 'Agent IP', value: org?.agent_ip || '—', type: 'mono' },
    {
      label: 'Flows Captured',
      value: (org?.flows_captured || 0).toLocaleString(),
      type: 'text'
    },
    {
      label: 'Flows Uploaded',
      value: (org?.flows_uploaded || 0).toLocaleString(),
      type: 'text'
    }
  ]

  return (
    <Layout>
      <TopBar title="Agent Status" />

      {/* Agent not installed banner */}
      {isNotInstalled && (
        <div style={{
          padding: '20px 24px',
          background: 'rgba(251,191,36,0.08)',
          border: '1px solid rgba(251,191,36,0.2)',
          borderRadius: '12px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle size={20} color="var(--warning)" />
            <div>
              <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                Agent not installed
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Install the IDS agent on your network machine to start monitoring
              </p>
            </div>
          </div>
          <button
            onClick={function() { setShowInstallGuide(!showInstallGuide) }}
            className="btn-primary"
            style={{ padding: '10px 18px' }}
          >
            <Download size={14} />
            {showInstallGuide ? 'Hide Guide' : 'Install Agent'}
          </button>
        </div>
      )}

      {/* Installation Guide */}
      {showInstallGuide && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Terminal size={18} color="var(--accent)" />
              <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
                Agent Installation Guide
              </p>
            </div>
            {/* OS Selector */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {['linux', 'windows'].map(function(os) {
                return (
                  <button
                    key={os}
                    onClick={function() { setSelectedOS(os) }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      border: 'none',
                      cursor: 'pointer',
                      background: selectedOS === os
                        ? 'var(--accent)'
                        : 'var(--bg-elevated)',
                      color: selectedOS === os
                        ? 'white'
                        : 'var(--text-muted)'
                    }}
                  >
                    {os.charAt(0).toUpperCase() + os.slice(1)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Your API Key */}
          <div style={{
            padding: '14px 16px',
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.15)',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <p style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', marginBottom: '8px' }}>
              Your API Key — needed during setup
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <p style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                Check your welcome email for your API key
              </p>
              <button
                onClick={function() { copyText(org?.org_code || '') }}
                style={{
                  background: 'none', border: 'none',
                  cursor: 'pointer', color: 'var(--accent)',
                  display: 'flex', flexShrink: 0
                }}
              >
                <Copy size={14} />
              </button>
            </div>
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {installCommands[selectedOS].map(function(item, i) {
              return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}>
                  <div style={{
                    width: '24px', height: '24px',
                    background: 'var(--accent)',
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px', color: 'white',
                    fontWeight: '700', flexShrink: 0,
                    marginTop: '2px'
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      {item.step}
                    </p>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--bg-elevated)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      gap: '8px'
                    }}>
                      <code style={{
                        fontSize: '12px',
                        fontFamily: 'JetBrains Mono, monospace',
                        color: 'var(--success)',
                        flex: 1
                      }}>
                        {item.cmd}
                      </code>
                      <button
                        onClick={function() { copyText(item.cmd) }}
                        style={{
                          background: 'none', border: 'none',
                          cursor: 'pointer', color: 'var(--text-muted)',
                          display: 'flex', flexShrink: 0
                        }}
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{
            marginTop: '20px',
            padding: '12px 16px',
            background: 'rgba(52,211,153,0.08)',
            border: '1px solid rgba(52,211,153,0.15)',
            borderRadius: '8px'
          }}>
            <p style={{ fontSize: '12px', color: 'var(--success)' }}>
              After running the setup wizard your agent will appear online
              in this dashboard within seconds.
            </p>
          </div>
        </div>
      )}

      {/* Status card */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div style={{
            width: '56px', height: '56px',
            background: isOnline
              ? 'rgba(52,211,153,0.1)'
              : isNotInstalled
              ? 'rgba(251,191,36,0.1)'
              : 'rgba(248,113,113,0.1)',
            borderRadius: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Shield
              size={28}
              color={
                isOnline ? 'var(--success)'
                : isNotInstalled ? 'var(--warning)'
                : 'var(--danger)'
              }
            />
          </div>
          <div>
            <p style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>
              {org?.name || 'My Organisation'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span className={'pulse-dot ' + (isOnline ? 'online' : isNotInstalled ? 'warning' : 'offline')} />
              <span style={{
                fontSize: '13px',
                color: isOnline
                  ? 'var(--success)'
                  : isNotInstalled
                  ? 'var(--warning)'
                  : 'var(--danger)'
              }}>
                {isOnline
                  ? 'Agent Online'
                  : isNotInstalled
                  ? 'Agent Not Installed'
                  : 'Agent Offline'
                }
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {statusItems.map(function(item) {
            return (
              <div key={item.label} style={{
                padding: '14px 16px',
                background: 'var(--bg-elevated)',
                borderRadius: '8px'
              }}>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {item.label}
                </p>
                {item.type === 'badge' ? (
                  <span className={'badge badge-' + item.color}>
                    {item.value}
                  </span>
                ) : item.type === 'mono' ? (
                  <p style={{ fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)' }}>
                    {item.value}
                  </p>
                ) : (
                  <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                    {item.value}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* API Key management */}
      <div className="card">
        <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
          API Key Management
        </p>

        {newKey && (
          <div style={{
            padding: '14px 16px',
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.2)',
            borderRadius: '8px', marginBottom: '16px'
          }}>
            <p style={{ fontSize: '12px', color: 'var(--warning)', marginBottom: '8px' }}>
              New API key — copy it now, it will not be shown again
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <code style={{
                flex: 1, fontSize: '12px',
                fontFamily: 'JetBrains Mono, monospace',
                color: 'var(--text-primary)',
                wordBreak: 'break-all'
              }}>
                {showKey ? newKey : newKey.slice(0, 20) + '...'}
              </code>
              <button
                onClick={function() { setShowKey(!showKey) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                onClick={function() { copyText(newKey) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', display: 'flex' }}
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
        )}

        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Regenerating the API key will disconnect the current agent.
          You will need to run the setup wizard again with the new key.
        </p>

        <button
          onClick={handleRegenerateKey}
          disabled={regenerating}
          className="btn-secondary"
        >
          <RefreshCw size={14} />
          {regenerating ? 'Regenerating...' : 'Regenerate API Key'}
        </button>
      </div>
    </Layout>
  )
}

export default AgentStatus
