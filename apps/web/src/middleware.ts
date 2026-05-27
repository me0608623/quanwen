import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require the user to be authenticated
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/profile',
  '/tasks',
  '/earnings',
  '/wallet',
  '/settings',
  '/notifications',
  '/onboarding',
  '/surveys',
  '/admin',
  '/shop',
  '/mutual',
  '/spin',
];

// Auth pages — redirect already-logged-in users away
const AUTH_PREFIXES = ['/auth/login', '/auth/register'];

// Admin-only prefixes (admin role gates real authorization in API; this is just UX nicety)
const ADMIN_PREFIXES = ['/admin'];

/** Decode JWT payload without signature verification (safe for routing hints only). */
function decodeJwtRole(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get('qw_token')?.value;
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PREFIXES.some((p) => pathname.startsWith(p));
  const isAdminPath = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));

  // ── Not logged in: redirect to login ───────────────────────────────────────
  if (isProtected && !token) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // ── Already logged in: redirect away from auth pages to /dashboard ─────────────
  if (token && isAuthPage) {
    const role = decodeJwtRole(token);
    const dest = role === 'admin' ? '/admin' : '/dashboard';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // ── Admin-only path: non-admin users get bounced to /dashboard ──────────────────
  if (token && isAdminPath) {
    const role = decodeJwtRole(token);
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
};
