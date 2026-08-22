import { Resend } from 'resend';

export interface InstantWinningPrize {
  number: string;
  prizeName: string;
  prizeValue?: number;
}

interface TicketEmailParams {
  to: string;
  customerName: string;
  orderNumber: string;
  raffleName: string;
  lotteryName: string;
  drawDate: string;
  ticketNumbers: string[];
  totalAmount: number;
  instantWinningPrizes?: InstantWinningPrize[];
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
  instantWinningPrizes = [],
}: TicketEmailParams) {
  try {
    const apiKey = process.env.RESEND_API_KEY?.trim() || '';
    if (!apiKey) {
      console.warn('⚠️ RESEND_API_KEY no está configurada en el archivo .env');
      return { success: false, error: 'RESEND_API_KEY no configurada' };
    }

    const resend = new Resend(apiKey);

    const winningNumbersSet = new Set(instantWinningPrizes.map((p) => p.number));

    const formattedNumbersHtml = ticketNumbers
      .map((num) => {
        const isInstantWinner = winningNumbersSet.has(num);
        if (isInstantWinner) {
          return `<span style="display:inline-block; padding:10px 18px; margin:5px; background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color:#ffffff; font-family:monospace, Courier; font-size:20px; font-weight:900; border-radius:10px; letter-spacing:2px; box-shadow:0 4px 10px rgba(217,119,6,0.3); border:2px solid #fef3c7;">🌟 #${num}</span>`;
        }
        return `<span style="display:inline-block; padding:8px 16px; margin:4px; background-color:#1e3a8a; color:#ffffff; font-family:monospace, Courier; font-size:18px; font-weight:bold; border-radius:8px; letter-spacing:2px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">#${num}</span>`;
      })
      .join(' ');

    const instantWinningSection =
      instantWinningPrizes.length > 0
        ? `
        <div style="background-color:#fef3c7; border:2px solid #f59e0b; border-radius:12px; padding:20px; text-align:center; margin-bottom:25px;">
          <span style="font-size:13px; font-weight:900; text-transform:uppercase; letter-spacing:1px; color:#92400e; display:block; margin-bottom:8px;">
            🎉 ¡FELICIDADES! HAS GANADO PREMIO DIRECTO ANTICIPADO
          </span>
          ${instantWinningPrizes
            .map(
              (p) => `
            <div style="margin:6px 0; font-size:15px; color:#78350f;">
              Boleto <strong>#${p.number}</strong>: <strong>${p.prizeName}</strong> ${
                p.prizeValue ? `($${p.prizeValue.toLocaleString('es-CO')} COP)` : ''
              }
            </div>
          `
            )
            .join('')}
          <p style="font-size:12px; color:#b45309; margin:8px 0 0 0;">
            El equipo organizador se pondrá en contacto contigo para coordinar la entrega de tu premio.
          </p>
        </div>
      `
        : '';

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

                    ${instantWinningSection}

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

    const response = await resend.emails.send({
      from: 'Rifas Oficiales <boletos@rshubs.xyz>',
      to: [to],
      subject:
        instantWinningPrizes.length > 0
          ? `🎉 ¡FELICIDADES! Pago Confirmado y Boleto Premiado para ${raffleName} (${orderNumber})`
          : `🎟️ ¡Pago Confirmado! Tus Boletos para ${raffleName} (${orderNumber})`,
      html: htmlContent,
    });

    if (response.error) {
      console.warn('⚠️ Error devuelto por Resend API:', response.error.message);
      return { success: false, error: response.error.message };
    }

    console.log('✅ Correo enviado exitosamente vía Resend:', response);
    return { success: true, response };
  } catch (err: any) {
    console.error('Error enviando correo con Resend:', err);
    return { success: false, error: err.message };
  }
}
