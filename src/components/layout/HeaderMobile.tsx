'use client';

import Link from 'next/link';

export default function HeaderMobile() {
  return (
    <header className="md:hidden sticky top-0 w-full z-50 bg-surface h-16 flex justify-between items-center px-margin-mobile border-b border-outline-variant/20 shadow-sm">
      <button className="text-primary hover:bg-surface-container-low p-2 rounded-full transition-colors">
        <span className="material-symbols-outlined">menu</span>
      </button>
      <Link href="/" className="font-headline-md text-headline-md font-extrabold text-primary">
        Joche77
      </Link>
      <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center text-xs font-bold">
        AD
      </div>
    </header>
  );
}
