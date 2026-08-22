'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function CustomerNavbar() {
  const pathname = usePathname();
  const { user, profile, logout } = useAuth();

  return (
    <header className="sticky top-0 z-[80] bg-surface/90 backdrop-blur-md border-b border-outline-variant/20 shadow-sm">
      <div className="max-w-container-max mx-auto px-4 h-16 flex justify-between items-center">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-secondary-container flex items-center justify-center font-extrabold text-on-secondary-container text-lg shadow-sm">
            LW
          </div>
          <div>
            <span className="font-headline-md text-headline-md font-extrabold text-primary block leading-tight">
              Joche77
            </span>
            <span className="text-[10px] font-bold text-on-tertiary-container bg-tertiary-fixed-dim/20 px-1.5 py-0.5 rounded">
              Sorteos Oficiales
            </span>
          </div>
        </Link>

        {/* Links & Auth State */}
        <nav className="flex items-center gap-4">
          <Link
            href="/"
            className={`font-body-md text-body-md font-medium transition-colors ${pathname === '/' || pathname === '/tienda' ? 'text-primary font-bold' : 'text-on-surface-variant hover:text-primary'
              }`}
          >
            Sorteos Disponibles
          </Link>
          <Link
            href="/mis-boletos"
            className={`font-body-md text-body-md font-medium transition-colors flex items-center gap-1 ${pathname === '/mis-boletos' ? 'text-primary font-bold' : 'text-on-surface-variant hover:text-primary'
              }`}
          >
            <span className="material-symbols-outlined text-[18px]">confirmation_number</span>
            Mis Boletos
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
            <div className="flex items-center gap-3 pl-2 border-l border-outline-variant/30">
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
                className="flex items-center gap-1 text-on-surface-variant hover:text-error px-2.5 py-1.5 rounded-lg border border-outline-variant/40 hover:bg-error-container/20 transition-all font-body-sm text-xs font-semibold"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3.5 py-1.5 font-body-sm text-body-sm font-bold text-primary hover:bg-surface-container rounded-xl transition-colors"
              >
                Iniciar Sesión
              </Link>
              <Link
                href="/registro"
                className="px-4 py-1.5 font-body-sm text-body-sm font-extrabold bg-primary text-on-primary rounded-xl hover:bg-primary-container transition-colors shadow-sm"
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
