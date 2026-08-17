// AdminComponents.jsx
// Reusable components for the admin dashboard

export function LoadingSpinner() {
  return (
    <div style={{
      display: 'inline-block',
      width: '16px',
      height: '16px',
      border: '2px solid rgba(210, 161, 76, 0.2)',
      borderTop: '2px solid #D2A14C',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite'
    }}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export function EmptyStateMessage({ icon = '📭', title = 'No Data', description = '' }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      textAlign: 'center',
      color: '#a0a0a0',
      minHeight: '200px'
    }}>
      <div style={{ fontSize: '40px', marginBottom: '12px' }}>{icon}</div>
      <h3 style={{ margin: '0 0 8px 0', color: '#d2a14c', fontSize: '16px' }}>{title}</h3>
      {description && (
        <p style={{ margin: '0', fontSize: '13px', color: '#808080', maxWidth: '300px', lineHeight: '1.5' }}>
          {description}
        </p>
      )}
    </div>
  )
}

export function DataLoadingIndicator({ isLoading = false }) {
  if (!isLoading) return null
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      backgroundColor: 'rgba(210, 161, 76, 0.1)',
      border: '1px solid rgba(210, 161, 76, 0.3)',
      borderRadius: '6px',
      fontSize: '13px',
      color: '#d2a14c',
      marginBottom: '12px'
    }}>
      <LoadingSpinner />
      <span>Refreshing data...</span>
    </div>
  )
}
