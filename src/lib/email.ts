import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY || 're_5SdC43cE_9turTZezf78xKybv2KL9arZj';
const resend = new Resend(resendApiKey);

interface TicketEmailParams {
  to: string;
  customerName: string;
  orderNumber: string;
  raffleName: string;
  lotteryName: string;
  drawDate: string;
  ticketNumbers: string[];
  totalAmount: number;
}

export async function sendTicketConfirmationEmail({
  to,
  customerName,
  orderNumber,
  raffleName,
  lotteryName,
  drawDate,
  ticketNumbers,
  totalAmount,
}: TicketEmailParams) {
  try {
    const formattedNumbersHtml = ticketNumbers
      .map(
        (num) =>
          `<span style="display:inline-block; padding:8px 16px; margin:4px; background-color:#1e3a8a; color:#ffffff; font-family:monospace, Courier; font-size:18px; font-weight:bold; border-radius:8px; letter-spacing:2px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">#${num}</span>`
      )
      .join(' ');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tus Boletos Oficiales</title>
      </head>
      <body style="margin:0; padding:0; background-color:#f8fafc; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#1e293b;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; padding:30px 10px;">
          <tr>
            <td align="center">
              <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.06); border:1px solid #e2e8f0;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); padding:35px 30px; text-align:center; color:#ffffff;">
                    <span style="font-size:12px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:#93c5fd;">Comprobante de Boletos Oficiales</span>
                    <h1 style="margin:10px 0 0 0; font-size:26px; font-weight:800; color:#ffffff;">¡Tu Pago ha Sido Aprobado!</h1>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding:35px 30px;">
                    <p style="font-size:16px; line-height:1.6; margin:0 0 20px 0;">
                      Hola <strong>${customerName}</strong>,
                    </p>
                    <p style="font-size:15px; line-height:1.6; color:#475569; margin:0 0 25px 0;">
                      Hemos verificado tu comprobante de pago exitosamente. Ya eres parte del sorteo oficial <strong>${raffleName}</strong>. A continuación encontrarás tus boletos asignados:
                    </p>

                    <!-- Ticket Numbers Box -->
                    <div style="background-color:#f1f5f9; border-radius:12px; padding:25px; text-align:center; margin-bottom:30px; border:2px dashed #cbd5e1;">
                      <span style="font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:1.5px; color:#64748b; display:block; margin-bottom:12px;">Tus Números de la Suerte</span>
                      <div style="margin:10px 0;">
                        ${formattedNumbersHtml}
                      </div>
                    </div>

                    <!-- Order Details -->
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; border-radius:12px; padding:20px; font-size:14px; margin-bottom:30px; border:1px solid #e2e8f0;">
                      <tr>
                        <td style="padding:8px 0; color:#64748b;">Número de Orden:</td>
                        <td align="right" style="padding:8px 0; font-weight:bold; color:#0f172a;">${orderNumber}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0; color:#64748b;">Sorteo / Rifa:</td>
                        <td align="right" style="padding:8px 0; font-weight:bold; color:#0f172a;">${raffleName}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0; color:#64748b;">Lotería de Referencia:</td>
                        <td align="right" style="padding:8px 0; font-weight:bold; color:#0f172a;">${lotteryName}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0; color:#64748b;">Fecha del Sorteo:</td>
                        <td align="right" style="padding:8px 0; font-weight:bold; color:#0f172a;">${drawDate}</td>
                      </tr>
                      <tr style="border-top:1px solid #e2e8f0;">
                        <td style="padding:12px 0 0 0; font-weight:bold; color:#0f172a; font-size:16px;">Total Pagado:</td>
                        <td align="right" style="padding:12px 0 0 0; font-weight:bold; color:#1e3a8a; font-size:18px;">$${totalAmount.toLocaleString('es-CO')} COP</td>
                      </tr>
                    </table>

                    <!-- Note -->
                    <p style="font-size:13px; color:#64748b; line-height:1.5; margin:0; text-align:center;">
                      Guarda este correo como constancia oficial de tu compra. También puedes consultar el estado de tus números en cualquier momento en nuestra plataforma.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color:#f8fafc; padding:20px 30px; text-align:center; border-top:1px solid #e2e8f0; font-size:12px; color:#94a3b8;">
                    © 2026 Rifas Oficiales Colombia. Todos los derechos reservados.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    // Intentar enviar con Resend
    const response = await resend.emails.send({
      from: 'Rifas Oficiales <onboarding@resend.dev>',
      to: [to],
      subject: `🎟️ ¡Pago Confirmado! Tus Boletos para ${raffleName} (${orderNumber})`,
      html: htmlContent,
    });

    console.log('Correo enviado exitosamente vía Resend:', response);
    return { success: true, response };
  } catch (err: any) {
    console.error('Error enviando correo con Resend:', err);
    return { success: false, error: err.message };
  }
}
