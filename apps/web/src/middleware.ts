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
];

// Auth pages — redirect already-logged-in users away
const AUTH_PREFIXES = ['/auth/login', '/auth/register', '/login'];

// Surveyor-only routes — redirect respondents away
const SURVEYOR_ONLY_PREFIXES = ['/dashboard'];

// Respondent-only routes — redirect surveyors away
const RESPONDENT_ONLY_PREFIXES = ['/tasks', '/earnings', '/profile', '/shop'];

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

  // ── Not logged in: redirect to login ───────────────────────────────────────
  if (isProtected && !token) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // ── Already logged in: redirect away from auth pages ───────────────────────
  if (token && (isAuthPage || pathname === '/')) {
    const role = decodeJwtRole(token);
    const dest = role === 'admin' ? '/admin' : role === 'surveyor' ? '/dashboard' : '/tasks';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // ── Role-based access guards ────────────────────────────────────────────────
  if (token) {
    const role = decodeJwtRole(token);

    if (role === 'respondent' && SURVEYOR_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL('/tasks', request.url));
    }

    if (role === 'surveyor' && RESPONDENT_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Admin can only access /admin — redirect to /admin if they visit other role-specific areas
    if (role === 'admin' && !pathname.startsWith('/admin') && !pathname.startsWith('/settings') && !pathname.startsWith('/notifications')) {
      return NextResponse.redirect(new URL('/admin', request.url));
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
