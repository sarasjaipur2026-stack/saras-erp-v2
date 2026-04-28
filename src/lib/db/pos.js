// SARAS POS — data access factories.
// Spec: docs/specs/2026-04-28-pos-system-design.md §5
// Plan: docs/specs/2026-04-28-pos-system-plan.md §Phase 1
//
// Simple CRUD via createTable factory. Custom RPC + business logic
// (createSale, holdSale, openSession, closeSession) lives in
// src/modules/pos/lib/posDb.js — separated to keep db/ thin and aligned
// with how orders.js / finance.js are split.

import { createTable } from './core'

export const posTerminals = createTable('pos_terminals')
export const posSessions = createTable('pos_sessions')
export const posTenders = createTable('pos_tenders')
export const posPrintJobs = createTable('pos_print_jobs')
export const productImages = createTable('product_images')
export const invoiceLines = createTable('invoice_lines')
