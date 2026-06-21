import { useState, useEffect } from 'react'
import { Save, Settings, Mail, Users } from 'lucide-react'
import { doc, onSnapshot, updateDoc, collection } from 'firebase/firestore'
import { db } from '../../services/firebase'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import toast from 'react-hot-toast'

function SystemConfig() {
  const [config, setConfig] = useState({
    retrain_interval_days: 7,
    min_log_threshold: 1000,
    confidence_threshold: 0.75,
    alert_email_enabled: false,
    email_recipients: { type: 'all', adminIds: [] }
  })
  const [changed, setChanged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [admins, setAdmins] = useState([])
  const [orgAdmins, setOrgAdmins] = useState([])
  const [platformAdmins, setPlatformAdmins] = useState([])

  useEffect(function() {
    const unsub = onSnapshot(
      doc(db, 'system_config', 'main'),
      function(snap) {
        if (snap.exists()) {
          setConfig(snap.data())
        }
      }
    )
    return unsub
  }, [])

  useEffect(function() {
    const unsub = onSnapshot(
      collection(db, 'admins'),
      function(snap) {
        const allAdmins = snap.docs.map(function(d) {
          return { id: d.id, ...d.data() }
        })
        setAdmins(allAdmins)
        setOrgAdmins(allAdmins.filter(function(a) { return a.role === 'org_admin' }))
        setPlatformAdmins(allAdmins.filter(function(a) { return a.role === 'platform_admin' }))
      }
    )
    return unsub
  }, [])

  function handleChange(key, value) {
    setConfig(function(prev) { return { ...prev, [key]: value } })
    setChanged(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'system_config', 'main'), config)
      toast.success('Configuration saved')
      setChanged(false)
    } catch(e) {
      toast.error('Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const sections = [
    {
      title: 'Retraining Settings',
      fields: [
        {
          key: 'retrain_interval_days',
          label: 'Retraining Interval',
          description: 'How often the model retrains automatically',
          type: 'number',
          suffix: 'days',
          min: 1, max: 30
        },
        {
          key: 'min_log_threshold',
          label: 'Minimum Log Threshold',
          description: 'Minimum number of log files before retraining triggers',
          type: 'number',
          suffix: 'files',
          min: 100
        },
        {
          key: 'confidence_threshold',
          label: 'Confidence Threshold',
          description: 'Below this confidence score retraining is triggered',
          type: 'number',
          suffix: '(0-1)',
          min: 0, max: 1, step: 0.01
        }
      ]
    },
    {
      title: 'Notification Settings',
      fields: [
        {
          key: 'alert_email_enabled',
          label: 'Email Notifications',
          description: 'Send email alerts for critical events',
          type: 'toggle'
        },
        {
          key: 'email_recipients',
          label: 'Send Notifications To',
          description: 'Select which admins receive email notifications',
          type: 'recipients'
        }
      ]
    }
  ]

  return (
    <Layout>
      <TopBar title="System Configuration" />

      <div style={{ maxWidth: '700px' }}>
        {sections.map(function(section) {
          return (
            <div key={section.title} className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <Settings size={16} color="var(--accent)" />
                <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {section.title}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {section.fields.map(function(field) {
                  return (
                    <div key={field.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '2px' }}>
                          {field.label}
                        </p>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {field.description}
                        </p>
                      </div>

                      {field.type === 'toggle' ? (
                        <div
                          onClick={function() { handleChange(field.key, !config[field.key]) }}
                          style={{
                            width: '44px', height: '24px',
                            background: config[field.key] ? 'var(--accent)' : 'var(--bg-elevated)',
                            borderRadius: '12px', position: 'relative',
                            cursor: 'pointer', transition: 'background 0.2s ease',
                            flexShrink: 0
                          }}
                        >
                          <div style={{
                            position: 'absolute',
                            top: '2px',
                            left: config[field.key] ? '22px' : '2px',
                            width: '20px', height: '20px',
                            background: 'white', borderRadius: '50%',
                            transition: 'left 0.2s ease'
                          }} />
                        </div>
                      ) : field.type === 'recipients' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '280px' }}>
                          <select
                            value={config.email_recipients?.type || 'all'}
                            onChange={function(e) {
                              handleChange('email_recipients', { type: e.target.value, adminIds: [] })
                            }}
                            className="input"
                            style={{ width: '100%' }}
                          >
                            <option value="all">All Admins (Both Types)</option>
                            <option value="all_platform">All Platform Admins</option>
                            <option value="all_org">All Organisation Admins</option>
                            <option value="specific_platform">Specific Platform Admin</option>
                            <option value="specific_org">Specific Organisation Admin</option>
                          </select>

                          {(config.email_recipients?.type === 'specific_platform' || config.email_recipients?.type === 'specific_org') && (
                            <select
                              value={config.email_recipients?.adminIds?.[0] || ''}
                              onChange={function(e) {
                                handleChange('email_recipients', {
                                  type: config.email_recipients?.type,
                                  adminIds: e.target.value ? [e.target.value] : []
                                })
                              }}
                              className="input"
                              style={{ width: '100%' }}
                            >
                              <option value="">Select an admin...</option>
                              {(config.email_recipients?.type === 'specific_platform' ? platformAdmins : orgAdmins).map(function(admin) {
                                return (
                                  <option key={admin.id} value={admin.id}>
                                    {admin.full_name} ({admin.email})
                                  </option>
                                )
                              })}
                            </select>
                          )}

                          {config.email_recipients && (
                            <div style={{
                              padding: '12px',
                              background: 'rgba(99,102,241,0.1)',
                              borderRadius: '8px',
                              fontSize: '12px',
                              color: 'var(--text-muted)',
                              display: 'flex', alignItems: 'center', gap: '8px'
                            }}>
                              <Mail size={14} color="var(--accent)" />
                              <span>
                                {config.email_recipients?.type === 'all' ? 'All admins (' + admins.length + ')' :
                                 config.email_recipients?.type === 'all_platform' ? 'All platform admins (' + platformAdmins.length + ')' :
                                 config.email_recipients?.type === 'all_org' ? 'All org admins (' + orgAdmins.length + ')' :
                                 config.email_recipients?.type === 'specific_platform' ? (platformAdmins.find(function(a) { return a.id === config.email_recipients?.adminIds?.[0] })?.full_name || 'Select admin') :
                                 config.email_recipients?.type === 'specific_org' ? (orgAdmins.find(function(a) { return a.id === config.email_recipients?.adminIds?.[0] })?.full_name || 'Select admin') :
                                 'No selection'}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type={field.type || 'text'}
                            value={config[field.key] || ''}
                            onChange={function(e) {
                              const val = field.type === 'number'
                                ? parseFloat(e.target.value)
                                : e.target.value
                              handleChange(field.key, val)
                            }}
                            min={field.min}
                            max={field.max}
                            step={field.step || 1}
                            className="input"
                            style={{ width: '120px' }}
                          />
                          {field.suffix && (
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {field.suffix}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {changed && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
          >
            <Save size={14} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>
    </Layout>
  )
}

export default SystemConfig
