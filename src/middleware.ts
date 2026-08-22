import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refrescar token si venció
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Rutas administrativas protegidas
  const isAdminRoute =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/ventas') ||
    pathname.startsWith('/rifas') ||
    pathname.startsWith('/loterias') ||
    pathname.startsWith('/auditoria');

  // Rutas públicas de autenticación y estáticos
  const isAuthRoute = pathname === '/login' || pathname === '/registro';

  // 1. Si NO está autenticado e intenta acceder a una ruta de administración -> Redirigir a /login
  if (!user && isAdminRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // 2. Si SÍ está autenticado
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

    // A) Si intenta ir a /login o /registro ya estando autenticado
    if (isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = isAdmin ? '/admin' : '/';
      return NextResponse.redirect(url);
    }

    // B) Si es un cliente estándar e intenta acceder a rutas de administración protegidas
    if (!isAdmin && isAdminRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
