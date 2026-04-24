import { useState, useMemo } from 'react'

/**
 * Client-side pagination hook.
 * @param {Array} data - Full dataset to paginate
 * @param {number} pageSize - Items per page (default 50)
 * @returns {{ pageData, currentPage, totalPages, setCurrentPage, needsPagination, rangeLabel }}
 */
export function usePagination(data, pageSize = 50) {
  const [currentPage, setCurrentPage] = useState(0)

  // Reset to page 0 when data length changes (filter/search) — useState prev-pattern
  const dataLen = data?.length || 0
  const [prevDataLen, setPrevDataLen] = useState(dataLen)
  if (prevDataLen !== dataLen) {
    setPrevDataLen(dataLen)
    if (currentPage !== 0) setCurrentPage(0)
  }

  const totalPages = Math.max(1, Math.ceil(dataLen / pageSize))
  const needsPagination = dataLen > pageSize

  const pageData = useMemo(() => {
    if (!needsPagination) return data || []
    return (data || []).slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  }, [data, currentPage, pageSize, needsPagination])

  const rangeLabel = needsPagination
    ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, dataLen)} of ${dataLen}`
    : `${dataLen} total`

  return { pageData, currentPage, totalPages, setCurrentPage, needsPagination, rangeLabel }
}
