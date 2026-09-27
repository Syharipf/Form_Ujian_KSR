// Local stand-in for Supabase: in-memory Postgres (PGlite) on :5433 with schema.sql applied,
// plus a proxy on :54321 mapping supabase-js's /rest/v1 prefix onto PostgREST (:3001).
// PGlite drops the connection on SQL errors, so only happy paths are testable through it.
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { readFileSync } from 'node:fs'

const db = new PGlite()
await db.exec('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;')
await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'))
const server = new PGLiteSocketServer({ db, port: 5433, host: '127.0.0.1', maxConnections: 20 })
await server.start()
console.log('pglite on 5433')

Bun.serve({
  port: 54321,
  async fetch(req) {
    const url = new URL(req.url)
    const target = 'http://127.0.0.1:3001' + url.pathname.replace(/^\/rest\/v1/, '') + url.search
    return fetch(target, { method: req.method, headers: req.headers, body: req.body, redirect: 'manual' })
  },
})
console.log('proxy on 54321')
