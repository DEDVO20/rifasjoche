'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, user, logout } = useAuth();

  // If in store route, login or home, don't show admin sidebar
  if (
    pathname === '/' ||
    pathname.startsWith('/tienda') ||
    pathname.startsWith('/mis-boletos') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/registro')
  ) {
    return null;
  }

  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
    { href: '/rifas', label: 'Rifas', icon: 'qr_code_2' },
    { href: '/ventas', label: 'Ventas', icon: 'payments' },
    { href: '/loterias', label: 'Loterías', icon: 'casino' },
    { href: '/auditoria', label: 'Auditoría', icon: 'assignment_turned_in' },
  ];

  return (
    <nav className="hidden md:flex fixed inset-y-0 left-0 z-[60] flex-col py-6 bg-surface-container-low shadow-xl h-full w-[280px] rounded-r-xl border-r border-outline-variant/20">
      <div className="px-6 mb-8 flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-primary-container flex items-center justify-center text-on-primary font-bold text-xl shadow-md">
          LW
        </div>
        <div>
          <h2 className="font-headline-md text-headline-md font-bold text-primary">
            Portal Admin
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant capitalize">
            {profile?.role ? profile.role.replace('_', ' ') : 'Administrador'}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <ul className="space-y-2 px-2">
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/' || pathname === '/dashboard'
                : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-4 rounded-lg px-4 py-3 active:scale-[0.98] transition-all ${
                    isActive
                      ? 'bg-secondary-container text-on-secondary-container font-semibold shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-primary'
                  }`}
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span className="font-body-md text-body-md">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Footer Perfil & Salir */}
      <div className="p-4 border-t border-outline-variant/20 space-y-3">
        <div className="flex items-center gap-3 px-2">
          <div className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
            {profile?.full_name?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="font-body-sm text-body-sm font-bold text-primary truncate">
              {profile?.full_name || 'Admin User'}
            </p>
            <p className="text-[10px] text-on-surface-variant truncate">
              {user?.email}
            </p>
          </div>
        </div>

        <button
          onClick={() => logout()}
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-error-container/20 text-error hover:bg-error-container/40 rounded-xl font-body-sm text-body-sm font-bold transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          Cerrar Sesión
        </button>
      </div>
    </nav>
  );
}
