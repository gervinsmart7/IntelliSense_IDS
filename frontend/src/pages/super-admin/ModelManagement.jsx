import { useState, useEffect } from 'react'
import {
  Brain, RefreshCw, Upload,
  RotateCcw, CheckCircle, Clock
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { modelAPI } from '../../services/api'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import toast from 'react-hot-toast'

function ModelManagement() {
  const [versions, setVersions] = useState([])
  const [production, setProduction] = useState(null)
  const [jobs, setJobs] = useState([])
  const [retraining, setRetraining] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(function() {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [versRes, prodRes, jobsRes] = await Promise.all([
        modelAPI.getVersions(),
        modelAPI.getProduction(),
        modelAPI.getRetrainJobs()
      ])
      setVersions(versRes.data.data || [])
      setProduction(prodRes.data.data)
      setJobs(jobsRes.data.data || [])
    } catch(e) {
      toast.error('Failed to load model data')
    } finally {
      setLoading(false)
    }
  }

  async function handleRetrain() {
    setRetraining(true)
    try {
      await modelAPI.triggerRetrain('Manual retrain from dashboard')
      toast.success('Retraining started in background')
      setTimeout(loadData, 3000)
    } catch(e) {
      toast.error('Failed to trigger retraining')
    } finally {
      setRetraining(false)
    }
  }

  async function handlePush(version) {
    try {
      await modelAPI.pushModel(version)
      toast.success('Model ' + version + ' pushed to all agents')
      loadData()
    } catch(e) {
      toast.error('Failed to push model')
    }
  }

  async function handleRollback(version) {
    if (!window.confirm('Roll back to ' + version + '?')) return
    try {
      await modelAPI.rollback(version)
      toast.success('Rolled back to ' + version)
      loadData()
    } catch(e) {
      toast.error('Failed to rollback')
    }
  }

  function formatTimestamp(value) {
    if (!value) return '—'
    if (typeof value === 'string') {
      const date = new Date(value)
      return isNaN(date.getTime()) ? '—' : date.toLocaleString()
    }
    if (value?.toDate) {
      return value.toDate().toLocaleString()
    }
    if (value instanceof Date) {
      return value.toLocaleString()
    }
    return String(value)
  }

  // Performance chart data
  const perfData = versions.map(function(v) {
    return {
      version: v.version,
      f1: v.f1_score ? parseFloat(v.f1_score.toFixed(4)) : 0,
      precision: v.precision ? parseFloat(v.precision.toFixed(4)) : 0,
      recall: v.recall ? parseFloat(v.recall.toFixed(4)) : 0
    }
  }).reverse()

  const jobStatusColor = {
    completed: 'success',
    running: 'accent',
    failed: 'danger',
    rejected: 'warning',
    pending: 'muted'
  }

  return (
    <Layout>
      <TopBar title="Model Management" />

      {/* Production model card */}
      <div style={{ marginBottom: '24px' }}>
        <div className="card" style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(99,102,241,0.05) 100%)',
          border: '1px solid rgba(99,102,241,0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px', height: '48px',
                background: 'rgba(99,102,241,0.2)',
                borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Brain size={24} color="var(--accent)" />
              </div>
              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  CLASSIFICATION MODEL
                </p>
                <p style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>
                  {production?.version || 'No model deployed'}
                </p>
              </div>
            </div>

            {production && (
              <div style={{ display: 'flex', gap: '32px' }}>
                {[
                  { label: 'F1 Score', value: production.f1_score?.toFixed(4) },
                  { label: 'Precision', value: production.precision?.toFixed(4) },
                  { label: 'Recall', value: production.recall?.toFixed(4) },
                  { label: 'Accuracy', value: production.accuracy?.toFixed(4) }
                ].map(function(m) {
                  return (
                    <div key={m.label} style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        {m.label}
                      </p>
                      <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--success)' }}>
                        {m.value || '—'}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleRetrain}
                disabled={retraining}
                className="btn-primary"
              >
                <RefreshCw size={14} className={retraining ? 'animate-spin' : ''} />
                {retraining ? 'Retraining...' : 'Retrain Now'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Performance chart */}
      {perfData.length > 1 && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Model Performance
          </p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
            Across Versions
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="version" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0.9, 1]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px', fontSize: '12px',
                  color: 'var(--text-primary)'
                }}
              />
              <Line type="monotone" dataKey="f1" stroke="#6366F1" strokeWidth={2} dot={{ fill: '#6366F1', r: 4 }} name="F1" />
              <Line type="monotone" dataKey="precision" stroke="#34D399" strokeWidth={2} dot={{ fill: '#34D399', r: 4 }} name="Precision" />
              <Line type="monotone" dataKey="recall" stroke="#FBBF24" strokeWidth={2} dot={{ fill: '#FBBF24', r: 4 }} name="Recall" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Version history */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Version History
            </p>
          </div>
          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {versions.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No versions yet
              </div>
            ) : (
              versions.map(function(v) {
                return (
                  <div key={v.version} style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {v.is_production && (
                        <CheckCircle size={14} color="var(--success)" />
                      )}
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                          {v.version}
                          {v.is_production && (
                            <span style={{
                              marginLeft: '8px', fontSize: '10px',
                              background: 'rgba(52,211,153,0.12)',
                              color: 'var(--success)',
                              padding: '1px 6px', borderRadius: '4px'
                            }}>
                              LIVE
                            </span>
                          )}
                        </p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          F1: {v.f1_score?.toFixed(4)}
                        </p>
                        <p style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          <Clock size={12} />
                          {v.created_at?.toDate?.()?.toLocaleString() || (typeof v.created_at === 'string' ? new Date(v.created_at).toLocaleString() : 'Unknown date')}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {!v.is_production && (
                        <>
                          <button
                            onClick={function() { handlePush(v.version) }}
                            style={{
                              padding: '4px 8px', fontSize: '11px',
                              background: 'rgba(99,102,241,0.1)',
                              color: 'var(--accent)', border: 'none',
                              borderRadius: '4px', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                          >
                            <Upload size={10} /> Push
                          </button>
                          <button
                            onClick={function() { handleRollback(v.version) }}
                            style={{
                              padding: '4px 8px', fontSize: '11px',
                              background: 'rgba(251,191,36,0.1)',
                              color: 'var(--warning)', border: 'none',
                              borderRadius: '4px', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                          >
                            <RotateCcw size={10} /> Rollback
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Retrain jobs */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Retraining Jobs
            </p>
          </div>
          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {jobs.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No retraining jobs yet
              </div>
            ) : (
              jobs.map(function(job, i) {
                return (
                  <div key={i} style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Clock size={14} color="var(--text-muted)" />
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-primary)' }}>
                          {job.triggered_by === 'manual' ? 'Manual' : 'Automatic'}
                        </p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {formatTimestamp(job.started_at)}
                        </p>
                      </div>
                    </div>
                    <span className={'badge badge-' + (jobStatusColor[job.status] || 'muted')}>
                      {job.status}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default ModelManagement
