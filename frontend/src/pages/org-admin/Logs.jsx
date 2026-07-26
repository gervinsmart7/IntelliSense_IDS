import { useState, useEffect } from 'react'
import { FileText, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import StatCard from '../../components/StatCard'
import useAuthStore from '../../store/useAuthStore'
import api from '../../services/api'

function Logs() {
  const { admin } = useAuthStore()
  const [summary, setSummary] = useState(null)
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(function() {
    if (!admin?.org_id) return
    loadSummary()
    loadRawLogs(0)
  }, [admin?.org_id])

  async function loadSummary() {
    try {
      const res = await api.get(`/api/logs/summary/${admin.org_id}`)
      setSummary(res.data.data)
    } catch (e) {
      console.error('Logs summary error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function loadRawLogs(pageNum) {
    try {
      const res = await api.get(`/api/logs/raw/${admin.org_id}`, {
        params: { page: pageNum, page_size: 50 }
      })
      setRows(res.data.data)
      setHasMore(res.data.has_more)
      setPage(pageNum)
    } catch (e) {
      console.error('Raw logs error:', e)
    }
  }

  return (
    <Layout>
      <TopBar title="Traffic Logs" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <StatCard
          title="Total Flows"
          value={(summary?.total_flows || 0).toLocaleString()}
          icon={FileText}
          color="accent"
        />
        <StatCard
          title="Benign"
          value={(summary?.total_benign || 0).toLocaleString()}
          icon={FileText}
          color="success"
        />
        <StatCard
          title="Attack"
          value={(summary?.total_attack || 0).toLocaleString()}
          icon={FileText}
          color="danger"
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '16px 20px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer'
          }}
          onClick={function() { setExpanded(!expanded) }}
        >
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
            Raw Captured Flows
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <RefreshCw
              size={16}
              onClick={function(e) { e.stopPropagation(); loadRawLogs(page) }}
              style={{ cursor: 'pointer', color: 'var(--text-muted)' }}
            />
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>

        {expanded && (
          <>
            {rows.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No captured flows yet</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Captured</th>
                      <th>Prediction</th>
                      <th>Confidence</th>
                      <th>Src IP</th>
                      <th>Dst IP</th>
                      <th>Dst Port</th>
                      <th>Protocol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(function(row, i) {
                      return (
                        <tr key={i}>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {new Date(row.captured_at).toLocaleString()}
                          </td>
                          <td>
                            <span className={'badge badge-' + (row.prediction === 'BENIGN' ? 'success' : 'danger')}>
                              {row.prediction}
                            </span>
                          </td>
                          <td style={{ fontSize: '12px' }}>
                            {((row.confidence || 0) * 100).toFixed(0)}%
                          </td>
                          <td style={{ fontSize: '12px', fontFamily: 'monospace' }}>{row['Src IP']}</td>
                          <td style={{ fontSize: '12px', fontFamily: 'monospace' }}>{row['Dst IP']}</td>
                          <td style={{ fontSize: '12px' }}>{row['Dst Port']}</td>
                          <td style={{ fontSize: '12px' }}>{row['Protocol']}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button disabled={page === 0} onClick={function() { loadRawLogs(page - 1) }}>Previous</button>
              <button disabled={!hasMore} onClick={function() { loadRawLogs(page + 1) }}>Next</button>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}

export default Logs