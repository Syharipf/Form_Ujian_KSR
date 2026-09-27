import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { COOKIE, verifyToken } from './admin-token'

export async function isAdmin() {
  return verifyToken((await cookies()).get(COOKIE)?.value)
}

// Call at the top of every admin page and server action: actions are public endpoints.
export async function requireAdmin() {
  if (!(await isAdmin())) redirect('/admin/login')
}
