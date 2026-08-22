import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado ningún archivo' }, { status: 400 });
    }

    const fileExt = file.name.split('.').pop() || 'png';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
      const supabase = await createClient();

      // Intentar subir al bucket de storage 'comprobantes'
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('comprobantes')
        .upload(fileName, buffer, {
          contentType: file.type || 'image/jpeg',
          cacheControl: '3600',
          upsert: true,
        });

      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage
          .from('comprobantes')
          .getPublicUrl(fileName);

        return NextResponse.json({
          success: true,
          publicUrl: publicUrlData.publicUrl,
          fileName,
        });
      }

      console.warn('Storage upload error, usando fallback base64:', uploadError.message);
    } catch (storageErr) {
      console.warn('Excepción en storage upload, usando fallback base64:', storageErr);
    }

    // Fallback: Si el bucket aún no tiene las políticas RLS ejecutadas, generar Data URL en Base64
    const base64Data = buffer.toString('base64');
    const dataUrl = `data:${file.type || 'image/jpeg'};base64,${base64Data}`;

    return NextResponse.json({
      success: true,
      publicUrl: dataUrl,
      fileName,
    });
  } catch (err: any) {
    console.error('Error general en /api/upload-proof:', err);
    return NextResponse.json(
      { error: 'Error procesando archivo', message: err.message },
      { status: 500 }
    );
  }
}
