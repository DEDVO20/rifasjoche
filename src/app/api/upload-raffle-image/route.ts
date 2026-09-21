import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function getMimeType(fileName: string, providedType?: string): string {
  if (providedType && providedType !== 'application/octet-stream' && providedType.trim() !== '') {
    return providedType;
  }
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'image/jpeg';
  }
}

export async function POST(req: NextRequest) {
  try {
    let buffer: Buffer | null = null;
    let originalName = 'rifa.jpg';
    let mimeType = 'image/jpeg';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => null);
      if (!body) {
        return NextResponse.json({ error: 'Cuerpo de solicitud inválido.' }, { status: 400 });
      }

      const rawBase64 = body.imageBase64 || body.dataUrl || body.file;
      if (!rawBase64 || typeof rawBase64 !== 'string') {
        return NextResponse.json({ error: 'No se ha proporcionado imagen en base64.' }, { status: 400 });
      }

      originalName = body.fileName || 'rifa.jpg';
      if (rawBase64.includes(';base64,')) {
        const parts = rawBase64.split(';base64,');
        mimeType = parts[0].replace('data:', '') || 'image/jpeg';
        buffer = Buffer.from(parts[1], 'base64');
      } else {
        buffer = Buffer.from(rawBase64, 'base64');
        mimeType = getMimeType(originalName);
      }
    } else {
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch (streamErr: any) {
        console.warn('Error leyendo stream formData:', streamErr);
        return NextResponse.json(
          { error: 'Error al procesar la transferencia de la imagen. Por favor reintente.' },
          { status: 400 }
        );
      }

      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json(
          { error: 'No se ha proporcionado ninguna imagen' },
          { status: 400 }
        );
      }

      // Validar tipo de archivo
      if (!file.type.startsWith('image/') && !file.name.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i)) {
        return NextResponse.json(
          { error: 'El archivo debe ser una imagen válida (JPG, PNG, WEBP, GIF o SVG).' },
          { status: 400 }
        );
      }

      // Validar tamaño (máximo 15 MB)
      if (file.size > 15 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'La imagen no debe superar los 15 MB.' },
          { status: 400 }
        );
      }

      originalName = file.name || 'rifa.jpg';
      mimeType = getMimeType(originalName, file.type);
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ error: 'El archivo de imagen está vacío.' }, { status: 400 });
    }

    const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg';
    const cleanExt = ext.replace(/[^a-z0-9]/gi, '') || 'jpg';
    const fileName = `raffle-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${cleanExt}`;

    let uploadedToStorage = false;
    let storagePublicUrl = '';

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 1. Intentar subir con Supabase Admin Client si está disponible (primero 'rifas', luego 'comprobantes')
    if (supabaseUrl && serviceRoleKey) {
      try {
        const adminClient = createSupabaseAdminClient(supabaseUrl, serviceRoleKey);
        for (const bucketName of ['rifas', 'comprobantes']) {
          const { error: uploadErr } = await adminClient.storage
            .from(bucketName)
            .upload(fileName, buffer, {
              contentType: mimeType,
              cacheControl: '3600',
              upsert: true,
            });

          if (!uploadErr) {
            const { data: urlData } = adminClient.storage
              .from(bucketName)
              .getPublicUrl(fileName);
            if (urlData?.publicUrl) {
              storagePublicUrl = urlData.publicUrl;
              uploadedToStorage = true;
              break;
            }
          }
        }
      } catch (adminErr) {
        console.warn('Error subiendo imagen con admin client a storage:', adminErr);
      }
    }

    // 2. Intentar subir a Supabase Storage con cliente estándar
    if (!uploadedToStorage) {
      try {
        const supabase = await createClient();
        for (const bucketName of ['rifas', 'comprobantes']) {
          const { error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(fileName, buffer, {
              contentType: mimeType,
              cacheControl: '3600',
              upsert: true,
            });

          if (!uploadError) {
            const { data: publicUrlData } = supabase.storage
              .from(bucketName)
              .getPublicUrl(fileName);

            if (publicUrlData?.publicUrl) {
              storagePublicUrl = publicUrlData.publicUrl;
              uploadedToStorage = true;
              break;
            }
          }
        }
      } catch (storageErr) {
        console.warn('Excepción en Supabase storage para rifas:', storageErr);
      }
    }

    if (uploadedToStorage && storagePublicUrl) {
      return NextResponse.json({
        success: true,
        publicUrl: storagePublicUrl,
        fileName,
      });
    }

    // 3. Fallback Local en public/uploads/raffles
    try {
      const publicDir = path.join(process.cwd(), 'public', 'uploads', 'raffles');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      const filePath = path.join(publicDir, fileName);
      fs.writeFileSync(filePath, buffer);

      return NextResponse.json({
        success: true,
        publicUrl: `/uploads/raffles/${fileName}`,
        fileName,
      });
    } catch (fsErr) {
      console.warn('Error guardando imagen localmente en public/uploads/raffles:', fsErr);
    }

    // 4. Fallback Infalible: Data URL Base64 para garantizar que nunca falle
    const base64Data = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    return NextResponse.json({
      success: true,
      publicUrl: dataUrl,
      fileName,
    });
  } catch (err: any) {
    console.error('Error procesando subida de imagen de rifa:', err);
    return NextResponse.json(
      { error: err.message || 'Error al procesar la imagen' },
      { status: 500 }
    );
  }
}
