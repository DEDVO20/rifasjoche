'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/context/AuthContext';
import Sidebar from './Sidebar';
import HeaderMobile from './HeaderMobile';
import BottomNavMobile from './BottomNavMobile';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Rutas que no usan el layout administrativo con Sidebar
  const isCustomerRoute =
    pathname.startsWith('/tienda') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/registro') ||
    pathname.startsWith('/mis-boletos');

  return (
    <AuthProvider>
      {isCustomerRoute ? (
        <div className="min-h-screen bg-surface text-on-surface font-body-md">
          {children}
        </div>
      ) : (
        <div className="min-h-screen bg-surface text-on-surface font-body-md flex flex-col">
          <HeaderMobile />
          <Sidebar />
          <main className="flex-1 md:ml-[280px] p-margin-mobile md:p-margin-desktop w-full max-w-container-max mx-auto pb-24 md:pb-margin-desktop">
            {children}
          </main>
          <BottomNavMobile />
        </div>
      )}
    </AuthProvider>
  );
}
