import Sidebar from './Sidebar'

function Layout({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Sidebar />
      <main className="main-content" style={{ flex: 1 }}>
        {children}
      </main>
    </div>
  )
}

export default Layout
