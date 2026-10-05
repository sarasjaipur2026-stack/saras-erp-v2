// Saras operates on Indian business dates, independent of the browser timezone.
export const businessDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date)

export const nextDate = (day) => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export const invoiceDateRange = (from, to) => ({
  from: from ? `${from}T00:00:00+05:30` : undefined,
  to: to ? `${nextDate(to)}T00:00:00+05:30` : undefined,
})

export const dateDaysAgo = (day, days) => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}
