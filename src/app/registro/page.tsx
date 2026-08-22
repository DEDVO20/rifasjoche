'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import CustomerNavbar from '@/components/layout/CustomerNavbar';

export default function RegistroPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [documentType, setDocumentType] = useState('CC');
  const [documentNumber, setDocumentNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(true);

  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { signup } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!fullName || !email || !password || !confirmPassword) {
      setErrorMsg('Por favor completa todos los campos requeridos.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (!termsAccepted) {
      setErrorMsg('Debes aceptar los términos y condiciones para continuar.');
      return;
    }

    setIsSubmitting(true);

    const { error } = await signup({
      full_name: fullName,
      email,
      password,
      phone,
      document_type: documentType,
      document_number: documentNumber,
    });

    if (error) {
      setIsSubmitting(false);
      if (error.message.includes('already registered')) {
        setErrorMsg('El correo electrónico ya se encuentra registrado.');
      } else {
        setErrorMsg(error.message || 'Ocurrió un error al registrar la cuenta.');
      }
    } else {
      router.push('/tienda');
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col justify-between">
      <CustomerNavbar />

      <main className="flex-1 flex items-center justify-center p-4 py-12">
        <div className="w-full max-w-lg bg-surface-container-lowest p-8 rounded-2xl shadow-xl border border-outline-variant/30 relative overflow-hidden backdrop-blur-lg">
          {/* Header */}
          <div className="text-center mb-8 space-y-2">
            <div className="w-14 h-14 bg-secondary-container text-on-secondary-container rounded-2xl flex items-center justify-center mx-auto mb-4 font-black text-2xl shadow-md">
              LW
            </div>
            <h1 className="font-display-lg text-headline-md font-extrabold text-primary">
              Crea tu Cuenta Gratis
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Únete a Joche77 para comprar boletos y gestionar tus rifas ganadoras.
            </p>
          </div>

          {/* Mensaje de error */}
          {errorMsg && (
            <div className="mb-6 p-4 bg-error-container text-on-error-container rounded-xl flex items-center gap-3 text-body-sm font-medium border border-error/30">
              <span className="material-symbols-outlined text-[20px] text-error shrink-0">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nombre Completo */}
            <div className="space-y-1.5">
              <label className="font-body-sm text-body-sm font-bold text-primary block">
                Nombre Completo *
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[20px]">
                  person
                </span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Juan Pérez"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="font-body-sm text-body-sm font-bold text-primary block">
                Correo Electrónico *
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

            {/* Teléfono */}
            <div className="space-y-1.5">
              <label className="font-body-sm text-body-sm font-bold text-primary block">
                Teléfono / WhatsApp
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[20px]">
                  phone
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+57 300 123 4567"
                  className="w-full pl-11 pr-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Documento de Identidad */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-1">
                <label className="font-body-sm text-body-sm font-bold text-primary block">
                  Tipo Doc.
                </label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="w-full px-3 py-3 bg-surface-container-low border border-outline-variant rounded-xl font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="CC">C.C.</option>
                  <option value="CE">C.E.</option>
                  <option value="NIT">NIT</option>
                  <option value="PASAPORTE">Pasaporte</option>
                </select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="font-body-sm text-body-sm font-bold text-primary block">
                  Número de Documento
                </label>
                <input
                  type="text"
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  placeholder="1098765432"
                  className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Contraseñas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-body-sm text-body-sm font-bold text-primary block">
                  Contraseña *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 chars"
                    required
                    className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="font-body-sm text-body-sm font-bold text-primary block">
                  Confirmar Contraseña *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite contraseña"
                    required
                    className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="rounded border-outline-variant text-primary focus:ring-primary"
                />
                Mostrar contraseñas
              </label>
            </div>

            {/* Términos */}
            <div className="pt-2">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-outline-variant text-primary focus:ring-primary"
                />
                <span>
                  Acepto los Términos de Servicio y la Política de Tratamiento de Datos Personales.
                </span>
              </label>
            </div>

            {/* Botón Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary text-on-primary py-3.5 rounded-xl font-body-md text-body-md font-extrabold flex items-center justify-center gap-2 hover:bg-primary-container transition-all shadow-md hover:shadow-lg disabled:opacity-50 mt-4"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Creando cuenta...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">person_add</span>
                  Registrarme Ahora
                </>
              )}
            </button>
          </form>

          {/* Footer login */}
          <div className="mt-8 pt-6 border-t border-outline-variant/20 text-center font-body-sm text-body-sm text-on-surface-variant">
            ¿Ya tienes una cuenta registrada?{' '}
            <Link
              href="/login"
              className="font-bold text-primary hover:underline hover:text-secondary-fixed-dim transition-colors"
            >
              Iniciar Sesión
            </Link>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-outline border-t border-outline-variant/10">
        © 2026 Joche77 - Todos los derechos reservados.
      </footer>
    </div>
  );
}
