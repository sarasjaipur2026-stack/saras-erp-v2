/**
 * SARAS POS — Local Print Bridge
 *
 * Standalone Node helper that runs on the counter PC. Polls Supabase for
 * pending pos_print_jobs (target='thermal'), writes ESC/POS over USB to
 * the thermal printer, marks each job as sent/failed.
 *
 * Setup:
 *   1. cd tools/print-bridge && npm install
 *   2. Copy .env.example → .env and fill values:
 *        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, USER_ID
 *   3. node server.js
 *   4. (Windows) Add to startup via Task Scheduler
 *
 * Health endpoint: GET http://localhost:9100/health → 200 OK
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §6 (print pipeline)
 */

import http from 'node:http'
import { createClient } from '@supabase/supabase-js'
import escpos from 'escpos'
import escposUsb from 'escpos-usb'

const PORT = parseInt(process.env.PORT || '9100', 10)
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const USER_ID = process.env.USER_ID

if (!SUPABASE_URL || !SUPABASE_KEY || !USER_ID) {
  console.error('[print-bridge] Missing env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / USER_ID')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
escpos.USB = escposUsb

let printer = null
let device = null
function connectPrinter() {
  try {
    device = new escpos.USB()
    printer = new escpos.Printer(device)
    return true
  } catch (err) {
    console.warn('[print-bridge] No USB thermal printer detected:', err.message)
    printer = null
    return false
  }
}
connectPrinter()

async function processOnce() {
  const { data: jobs, error } = await sb
    .from('pos_print_jobs')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('target', 'thermal')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) { console.error('[print-bridge] poll error:', error.message); return }
  if (!jobs?.length) return

  for (const job of jobs) {
    try {
      if (!printer && !connectPrinter()) {
        await sb.from('pos_print_jobs').update({
          status: 'failed', last_error: 'No USB printer detected', attempts: (job.attempts || 0) + 1,
        }).eq('id', job.id)
        continue
      }

      // Build receipt — use the payload stored on the job, or fetch the
      // invoice + lines + tenders from DB if payload is empty
      const receipt = job.payload?.receipt_text
      if (!receipt) {
        console.warn('[print-bridge] job', job.id, 'has no payload.receipt_text — skipping')
        await sb.from('pos_print_jobs').update({
          status: 'failed', last_error: 'No receipt_text in payload', attempts: (job.attempts || 0) + 1,
        }).eq('id', job.id)
        continue
      }

      await new Promise((resolve, reject) => {
        device.open((err) => {
          if (err) return reject(err)
          printer.raw(Buffer.from(receipt, 'utf-8')).close(resolve)
        })
      })

      await sb.from('pos_print_jobs').update({
        status: 'sent', sent_at: new Date().toISOString(),
      }).eq('id', job.id)

      console.log('[print-bridge] printed job', job.id)
    } catch (err) {
      console.error('[print-bridge] failed job', job.id, err.message)
      await sb.from('pos_print_jobs').update({
        status: 'failed', last_error: err.message, attempts: (job.attempts || 0) + 1,
      }).eq('id', job.id)
    }
  }
}

// Health endpoint
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.url === '/health') {
    res.writeHead(printer ? 200 : 503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: !!printer, hasPrinter: !!printer }))
    return
  }
  res.writeHead(404).end()
}).listen(PORT, () => {
  console.log(`[print-bridge] listening :${PORT}, polling every 5s`)
})

// Poll loop
setInterval(() => { processOnce().catch(err => console.error(err)) }, 5_000)
processOnce().catch(err => console.error(err))
