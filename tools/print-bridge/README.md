# SARAS POS — Print Bridge

Local Node helper that prints POS receipts to a USB thermal printer.

## Setup (one-time, on the counter PC)

1. Install Node 20+ and a 80mm USB thermal printer (e.g. TVS RP3160).
2. Copy `.env.example` → `.env` and fill values:
   - `SUPABASE_URL` — your project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — from Supabase → Settings → API → service_role
   - `USER_ID` — your `profiles.id` UUID
3. `npm install`
4. `npm start`

## Windows auto-start

Use Task Scheduler:
- Trigger: At log on
- Action: Start a program → `C:\Program Files\nodejs\node.exe`
- Arguments: `server.js`
- Start in: `<path>\tools\print-bridge`

## Health check

POS UI pings `GET http://localhost:9100/health` every 30s. Status pill in the
register topbar shows green/red based on this.

## How it works

- Polls `pos_print_jobs WHERE target='thermal' AND status='pending'` every 5s.
- For each pending job: builds the ESC/POS receipt from `payload.receipt_text`
  and writes it to USB.
- Marks job as `sent` (with `sent_at`) on success or `failed` (with
  `last_error` + `attempts++`) on failure.

## Failure modes

- Printer offline → POS UI shows red dot. Sale still completes; print job stays
  pending. Bridge picks it up when reconnected.
- Service role key expired → poll loop logs error every 5s. Rotate key, restart.
