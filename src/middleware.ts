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

  // Rutas de tienda / cliente
  const isCustomerRoute =
    pathname.startsWith('/tienda') ||
    pathname.startsWith('/mis-boletos');

  // Rutas públicas de autenticación y estáticos
  const isPublicAuthRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/registro') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.');

  // 1. Si NO está logueado e intenta ir a una ruta de admin (ej: '/')
  if (!user && !isCustomerRoute && !isPublicAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // 2. Si SI está logueado, consultar su rol para control estricto de rutas
  if (user && !isPublicAuthRoute) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

    // A) Si intenta ir a /login o /registro estando autenticado
    if (pathname === '/login' || pathname === '/registro') {
      const url = request.nextUrl.clone();
      url.pathname = isAdmin ? '/' : '/tienda';
      return NextResponse.redirect(url);
    }

    // B) Regla estricta: Si es ADMIN o SUPER_ADMIN e intenta acceder a la Tienda de Compradores (/tienda, /mis-boletos)
    if (isAdmin && isCustomerRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    // C) Regla estricta: Si es CLIENTE e intenta acceder a las rutas de Administración (/, /rifas, /ventas, /loterias, /auditoria)
    const isAdminRoute =
      pathname === '/' ||
      pathname.startsWith('/rifas') ||
      pathname.startsWith('/ventas') ||
      pathname.startsWith('/loterias') ||
      pathname.startsWith('/auditoria');

    if (!isAdmin && isAdminRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/tienda';
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
