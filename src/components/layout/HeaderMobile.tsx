'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

export default function HeaderMobile() {
  const { profile, user } = useAuth();
  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n: string) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() || 'AD';

  return (
    <header className="md:hidden sticky top-0 w-full z-50 bg-surface h-14 flex justify-between items-center px-4 border-b border-outline-variant/20 shadow-sm">
      <Link href="/admin" className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary-container text-on-primary flex items-center justify-center font-extrabold text-sm shadow-sm">
          LW
        </div>
        <div className="flex flex-col">
          <span className="font-headline-md text-base font-extrabold text-primary leading-tight">
            Joche77
          </span>
          <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">
            Portal Admin
          </span>
        </div>
      </Link>

      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="flex items-center gap-1 text-[11px] font-semibold text-primary bg-secondary-container/60 hover:bg-secondary-container px-2.5 py-1 rounded-lg transition-colors"
          title="Ver Tienda / Vista Pública"
        >
          <span className="material-symbols-outlined text-[16px]">storefront</span>
          <span>Tienda</span>
        </Link>
        <div
          className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center text-xs font-bold shadow-sm"
          title={profile?.full_name || user?.email || 'Usuario'}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
