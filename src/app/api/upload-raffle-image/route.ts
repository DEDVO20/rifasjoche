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
    const formData = await req.formData();
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

    // Validar tamaño (máximo 10 MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'La imagen no debe superar los 10 MB.' },
        { status: 400 }
      );
    }

    const originalName = file.name || 'rifa.jpg';
    const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg';
    const cleanExt = ext.replace(/[^a-z0-9]/gi, '') || 'jpg';
    const fileName = `raffle-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${cleanExt}`;
    const mimeType = getMimeType(originalName, file.type);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let uploadedToStorage = false;
    let storagePublicUrl = '';

    // 1. Intentar subir a Supabase Storage con Service Role si está configurado
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceRoleKey) {
      try {
        const adminClient = createSupabaseAdminClient(supabaseUrl, serviceRoleKey);
        const { error: uploadErr } = await adminClient.storage
          .from('rifas')
          .upload(fileName, buffer, {
            contentType: mimeType,
            cacheControl: '3600',
            upsert: true,
          });

        if (!uploadErr) {
          const { data: urlData } = adminClient.storage
            .from('rifas')
            .getPublicUrl(fileName);
          if (urlData?.publicUrl) {
            storagePublicUrl = urlData.publicUrl;
            uploadedToStorage = true;
          }
        }
      } catch (adminErr) {
        console.warn('Error subiendo imagen con admin client a storage:', adminErr);
      }
    }

    // 2. Intentar subir a Supabase Storage estándar
    if (!uploadedToStorage) {
      try {
        const supabase = await createClient();
        const { error: uploadError } = await supabase.storage
          .from('rifas')
          .upload(fileName, buffer, {
            contentType: mimeType,
            cacheControl: '3600',
            upsert: true,
          });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('rifas')
            .getPublicUrl(fileName);

          if (publicUrlData?.publicUrl) {
            storagePublicUrl = publicUrlData.publicUrl;
            uploadedToStorage = true;
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

    return NextResponse.json(
      { error: 'No se pudo almacenar la imagen de la rifa.' },
      { status: 500 }
    );
  } catch (err: any) {
    console.error('Error procesando subida de imagen de rifa:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
