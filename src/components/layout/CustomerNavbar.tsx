'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function CustomerNavbar() {
  const pathname = usePathname();
  const { user, profile, logout } = useAuth();

  return (
    <header className="sticky top-0 z-[80] bg-surface/90 backdrop-blur-md border-b border-outline-variant/20 shadow-sm">
      <div className="max-w-container-max mx-auto px-3 sm:px-4 py-2 sm:py-0 sm:h-16 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-secondary-container flex items-center justify-center font-extrabold text-on-secondary-container text-base sm:text-lg shadow-sm flex-shrink-0">
            LW
          </div>
          <div className="min-w-0">
            <span className="font-headline-md text-lg sm:text-headline-md font-extrabold text-primary block leading-tight truncate">
              Joche77
            </span>
            <span className="text-[10px] font-bold text-on-tertiary-container bg-tertiary-fixed-dim/20 px-1.5 py-0.5 rounded">
              Sorteos Oficiales
            </span>
          </div>
        </Link>

        {/* Links & Auth State */}
        <nav className={`w-full sm:w-auto grid ${user ? 'grid-cols-3' : 'grid-cols-4'} sm:flex items-center gap-1 sm:gap-4`}>
          <Link
            href="/"
            className={`min-w-0 text-center sm:text-left rounded-lg px-1.5 py-1.5 sm:px-0 sm:py-0 font-body-md text-[11px] sm:text-body-md font-medium transition-colors ${pathname === '/' || pathname === '/tienda' ? 'text-primary font-bold bg-secondary-container/60 sm:bg-transparent' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container sm:hover:bg-transparent'
              }`}
          >
            <span className="sm:hidden">Sorteos</span>
            <span className="hidden sm:inline">Sorteos Disponibles</span>
          </Link>
          <Link
            href="/mis-boletos"
            className={`min-w-0 text-center rounded-lg px-1.5 py-1.5 sm:px-0 sm:py-0 font-body-md text-[11px] sm:text-body-md font-medium transition-colors flex items-center justify-center gap-1 ${pathname === '/mis-boletos' ? 'text-primary font-bold bg-secondary-container/60 sm:bg-transparent' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container sm:hover:bg-transparent'
              }`}
          >
            <span className="material-symbols-outlined text-[16px] sm:text-[18px]">confirmation_number</span>
            <span className="truncate">Mis Boletos</span>
          </Link>

          {/* Portal Admin link si es Admin */}
          {(profile?.role === 'admin' || profile?.role === 'super_admin') && (
            <Link
              href="/admin"
              className="hidden md:flex items-center gap-1 px-3 py-1.5 border border-outline-variant rounded-lg font-body-sm text-body-sm font-semibold hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">admin_panel_settings</span>
              Portal Admin
            </Link>
          )}

          {/* Estado de Usuario */}
          {user ? (
            <div className="min-w-0 flex items-center justify-center sm:justify-start gap-3 sm:pl-2 sm:border-l sm:border-outline-variant/30">
              <div className="hidden sm:flex flex-col text-right">
                <span className="font-body-sm text-body-sm font-bold text-primary leading-none">
                  {profile?.full_name || user.email?.split('@')[0]}
                </span>
                <span className="text-[10px] text-on-surface-variant capitalize">
                  {profile?.role || 'Cliente'}
                </span>
              </div>
              <button
                onClick={() => logout()}
                title="Cerrar Sesión"
                className="w-full sm:w-auto flex items-center justify-center gap-1 text-on-surface-variant hover:text-error px-1.5 sm:px-2.5 py-1.5 rounded-lg border border-outline-variant/40 hover:bg-error-container/20 transition-all font-body-sm text-[11px] sm:text-xs font-semibold"
              >
                <span className="material-symbols-outlined text-[16px] sm:text-[18px]">logout</span>
                <span>Salir</span>
              </button>
            </div>
          ) : (
            <div className="contents sm:flex sm:items-center sm:gap-2">
              <Link
                href="/login"
                className="min-w-0 text-center px-1.5 sm:px-3.5 py-1.5 font-body-sm text-[11px] sm:text-body-sm font-bold text-primary hover:bg-surface-container rounded-lg sm:rounded-xl transition-colors"
              >
                Iniciar Sesión
              </Link>
              <Link
                href="/registro"
                className="min-w-0 text-center px-1.5 sm:px-4 py-1.5 font-body-sm text-[11px] sm:text-body-sm font-extrabold bg-primary text-on-primary rounded-lg sm:rounded-xl hover:bg-primary-container transition-colors shadow-sm"
              >
                Registro
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
