// Only errors proving that the server rejected an unauthenticated request are
// safe to replay after refreshing the session. Timeouts and generic network
// failures are deliberately excluded because a mutation may have committed.
export const isJwtStaleError = (error) => {
  if (!error) return false
  const status = error.status ?? error.statusCode ?? error.cause?.status
  const code = String(error.code || error.cause?.code || '')
  const message = String(error.message || error.error_description || '').toLowerCase()
  return status === 401
    || code === 'PGRST301'
    || code === 'PGRST302'
    || message.includes('jwt expired')
    || message.includes('jwt is expired')
    || message.includes('invalid jwt')
    || message.includes('not authenticated')
    || message.includes('token has expired')
}
