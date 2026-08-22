'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomNavMobile() {
  const pathname = usePathname();

  const items = [
    { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
    { href: '/rifas', label: 'Rifas', icon: 'qr_code_2' },
    { href: '/ventas', label: 'Ventas', icon: 'payments' },
    { href: '/loterias', label: 'Loterías', icon: 'casino' },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 w-full z-50 flex justify-around items-center px-margin-mobile py-2 bg-surface shadow-[0px_-4px_20px_rgba(15,23,42,0.05)] border-t border-outline-variant/20">
      {items.map((item) => {
        const isActive =
          item.href === '/'
            ? pathname === '/' || pathname === '/dashboard'
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center rounded-xl px-3 py-1 active:scale-95 transition-transform ${
              isActive
                ? 'bg-secondary-container text-on-secondary-container font-semibold'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="font-body-sm text-[12px]">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
