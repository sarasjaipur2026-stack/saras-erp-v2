export const REQUIRED_SCHEMA_VERSION = '20261005095632'
let pending

export async function ensureSchemaCompatibility(client) {
  if (!pending) {
    pending = (async () => {
      const { data, error } = await client.rpc('erp_schema_version')
      if (error || data !== REQUIRED_SCHEMA_VERSION) {
        throw new Error('Database update required or database unavailable. Contact the administrator before making changes.')
      }
    })().catch(error => { pending = null; throw error })
  }
  return pending
}
