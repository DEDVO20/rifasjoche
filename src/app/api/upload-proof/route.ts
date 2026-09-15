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
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No se ha proporcionado ningún archivo' },
        { status: 400 }
      );
    }

    const originalName = file.name || 'comprobante.pdf';
    const ext = originalName.split('.').pop()?.toLowerCase() || (file.type === 'application/pdf' ? 'pdf' : 'jpg');
    const cleanExt = ext.replace(/[^a-z0-9]/gi, '') || 'pdf';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${cleanExt}`;
    const mimeType = getMimeType(originalName, file.type);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let uploadedToStorage = false;
    let storagePublicUrl = '';

    // 1. Intentar subir con Supabase Service Role si está disponible
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceRoleKey) {
      try {
        const adminClient = createSupabaseAdminClient(supabaseUrl, serviceRoleKey);
        const { error: uploadErr } = await adminClient.storage
          .from('comprobantes')
          .upload(fileName, buffer, {
            contentType: mimeType,
            cacheControl: '3600',
            upsert: true,
          });

        if (!uploadErr) {
          const { data: urlData } = adminClient.storage
            .from('comprobantes')
            .getPublicUrl(fileName);
          if (urlData?.publicUrl) {
            storagePublicUrl = urlData.publicUrl;
            uploadedToStorage = true;
          }
        } else {
          console.warn('Admin storage upload error:', uploadErr.message);
        }
      } catch (adminErr) {
        console.warn('Error subiendo con admin client a storage:', adminErr);
      }
    }

    // 2. Si no subió con admin client, intentar con createClient standard
    if (!uploadedToStorage) {
      try {
        const supabase = await createClient();
        const { error: uploadError } = await supabase.storage
          .from('comprobantes')
          .upload(fileName, buffer, {
            contentType: mimeType,
            cacheControl: '3600',
            upsert: true,
          });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('comprobantes')
            .getPublicUrl(fileName);

          if (publicUrlData?.publicUrl) {
            storagePublicUrl = publicUrlData.publicUrl;
            uploadedToStorage = true;
          }
        } else {
          console.warn('Supabase storage standard upload error:', uploadError.message);
        }
      } catch (storageErr) {
        console.warn('Excepción en Supabase storage standard:', storageErr);
      }
    }

    if (uploadedToStorage && storagePublicUrl) {
      return NextResponse.json({
        success: true,
        publicUrl: storagePublicUrl,
        fileName,
      });
    }

    // 3. Fallback Local en public/uploads/proofs para garantizar que siempre funcione sin fallo de tamaño
    try {
      const publicDir = path.join(process.cwd(), 'public', 'uploads', 'proofs');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      const filePath = path.join(publicDir, fileName);
      fs.writeFileSync(filePath, buffer);

      return NextResponse.json({
        success: true,
        publicUrl: `/uploads/proofs/${fileName}`,
        fileName,
      });
    } catch (fsErr) {
      console.warn('Error guardando localmente en public/uploads/proofs:', fsErr);
    }

    // 4. Último Fallback: Base64 data URL
    const base64Data = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    return NextResponse.json({
      success: true,
      publicUrl: dataUrl,
      fileName,
    });
  } catch (err: any) {
    console.error('Error general en /api/upload-proof:', err);
    return NextResponse.json(
      { error: 'Error procesando comprobante', message: err.message },
      { status: 500 }
    );
  }
}
