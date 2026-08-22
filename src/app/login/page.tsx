'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import CustomerNavbar from '@/components/layout/CustomerNavbar';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/tienda';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email || !password) {
      setErrorMsg('Por favor ingresa tu correo electrónico y contraseña.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await login(email, password);

    if (error) {
      setIsSubmitting(false);
      if (error.message.includes('Invalid login credentials')) {
        setErrorMsg('Correo electrónico o contraseña incorrectos.');
      } else {
        setErrorMsg(error.message || 'Ocurrió un error al iniciar sesión.');
      }
    } else {
      router.push(redirectTo);
    }
  };

  return (
    <div className="w-full max-w-md bg-surface-container-lowest p-8 rounded-2xl shadow-xl border border-outline-variant/30 relative overflow-hidden backdrop-blur-lg">
      {/* Header */}
      <div className="text-center mb-8 space-y-2">
        <div className="w-14 h-14 bg-secondary-container text-on-secondary-container rounded-2xl flex items-center justify-center mx-auto mb-4 font-black text-2xl shadow-md">
          LW
        </div>
        <h1 className="font-display-lg text-headline-md font-extrabold text-primary">
          ¡Bienvenido de Nuevo!
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Ingresa a tu cuenta para gestionar tus números y consultar boletos.
        </p>
      </div>

      {/* Mensaje de error */}
      {errorMsg && (
        <div className="mb-6 p-4 bg-error-container text-on-error-container rounded-xl flex items-center gap-3 text-body-sm font-medium border border-error/30 animate-pulse">
          <span className="material-symbols-outlined text-[20px] text-error shrink-0">error</span>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email */}
        <div className="space-y-1.5">
          <label className="font-body-sm text-body-sm font-bold text-primary block">
            Correo Electrónico
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[20px]">
              mail
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ejemplo@correo.com"
              required
              className="w-full pl-11 pr-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Contraseña */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="font-body-sm text-body-sm font-bold text-primary block">
              Contraseña
            </label>
            <Link
              href="#"
              onClick={(e) => {
                e.preventDefault();
                alert('Si olvidaste tu contraseña, contacta al soporte técnico o solicita restablecimiento.');
              }}
              className="font-body-sm text-xs font-semibold text-primary hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[20px]">
              lock
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full pl-11 pr-12 py-3 bg-surface-container-low border border-outline-variant rounded-xl font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors focus:outline-none"
            >
              <span className="material-symbols-outlined text-[20px]">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>

        {/* Botón de Enviar */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-primary text-on-primary py-3.5 rounded-xl font-body-md text-body-md font-extrabold flex items-center justify-center gap-2 hover:bg-primary-container transition-all shadow-md hover:shadow-lg disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Iniciando sesión...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[20px]">login</span>
              Iniciar Sesión
            </>
          )}
        </button>
      </form>

      {/* Footer registrarse */}
      <div className="mt-8 pt-6 border-t border-outline-variant/20 text-center font-body-sm text-body-sm text-on-surface-variant">
        ¿Aún no tienes una cuenta?{' '}
        <Link
          href="/registro"
          className="font-bold text-primary hover:underline hover:text-secondary-fixed-dim transition-colors"
        >
          Regístrate gratis
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col justify-between">
      <CustomerNavbar />
      <main className="flex-1 flex items-center justify-center p-4 py-12">
        <Suspense fallback={
          <div className="p-8 text-center text-primary font-bold">Cargando formulario...</div>
        }>
          <LoginForm />
        </Suspense>
      </main>
      <footer className="py-6 text-center text-xs text-outline border-t border-outline-variant/10">
        © 2026 Joche77 - Todos los derechos reservados.
      </footer>
    </div>
  );
}
