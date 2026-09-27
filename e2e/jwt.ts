// Mint the service_role JWT PostgREST expects (stand-in for the Supabase secret key).
import { createHmac } from 'node:crypto'
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const head = b64({ alg: 'HS256', typ: 'JWT' })
const body = b64({ role: 'service_role', exp: 4102444800 })
const sig = createHmac('sha256', process.argv[2]).update(`${head}.${body}`).digest('base64url')
console.log(`${head}.${body}.${sig}`)
