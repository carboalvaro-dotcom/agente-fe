export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { callId } = req.body;
  if (!callId) return res.status(400).json({ error: 'callId required' });

  const VAPI_KEY = '96d7565b-f657-42e2-b144-670153ff65eb';

  // Poll until call ends and transcript is ready (max 10 attempts x 10s = 100s)
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise(r => setTimeout(r, attempt === 0 ? 8000 : 10000));
    try {
      const r = await fetch(`https://api.vapi.ai/call/${callId}`, {
        headers: { Authorization: `Bearer ${VAPI_KEY}` }
      });
      if (!r.ok) continue;
      const data = await r.json();

      if (data.status === 'in-progress') continue;

      const transcript = data.transcript || '';
      const messages = data.messages || [];
      const duration = data.endedAt && data.startedAt
        ? Math.round((new Date(data.endedAt) - new Date(data.startedAt)) / 1000)
        : null;

      if (transcript.length < 10 && attempt < 3) continue;

      // Parse transcript
      const low = transcript.toLowerCase();
      const lines = transcript.split('\n');

      // Detect if responsible
      const esResponsable =
        low.includes('soy yo') || low.includes('soy el responsable') || low.includes('soy la responsable') ||
        low.includes('soy el encargado') || low.includes('soy la encargada') || low.includes('soy el dueño') ? true
        : low.includes('no está') || low.includes('no se encuentra') || low.includes('está fuera') ||
          low.includes('no es el responsable') || low.includes('no soy') ? false
        : null;

      // Detect result
      let resultado = 'pendiente';
      if (low.includes('de acuerdo') || low.includes('quedamos') || low.includes('lunes') ||
          low.includes('martes') || low.includes('miércoles') || low.includes('jueves') ||
          low.includes('viernes') || low.includes('esta semana') || low.includes('la semana') ||
          low.includes('pásate') || low.includes('pasate') || low.includes('mañana')) resultado = 'visitaOK';
      else if (low.includes('no me interesa') || low.includes('no estamos interesados') ||
               low.includes('no necesito') || low.includes('no gracias') ||
               low.includes('ya estamos bien')) resultado = 'noInteresa';
      else if (low.includes('llame más tarde') || low.includes('llámeme') ||
               low.includes('ahora no puedo') || low.includes('no es buen momento') ||
               low.includes('vuelva a llamar')) resultado = 'rellamar';
      else if (data.endedReason === 'customer-did-not-answer' ||
               data.endedReason === 'no-answer') resultado = 'noContesta';

      // Extract name
      let nombreContacto = null;
      const namePatterns = [/me llamo ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/i, /soy ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/i,
                            /habla ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/i, /con ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/i];
      for (const p of namePatterns) {
        const m = transcript.match(p);
        if (m && !['del','de','la','el','un','una','con'].includes(m[1].toLowerCase())) {
          nombreContacto = m[1]; break;
        }
      }

      // Extract visit date
      let fechaVisita = null;
      const dateMatch = transcript.match(/(lunes|martes|miércoles|jueves|viernes|sábado|mañana|pasado mañana)(\s+a las?\s+\d+[:.h]\d*|\s+por la [a-záéíóúñ]+)?/i);
      if (dateMatch) fechaVisita = dateMatch[0];

      // Extract email
      let emailContacto = null;
      const emailMatch = transcript.match(/([a-záéíóúñA-ZÁÉÍÓÚÑ0-9._-]+)\s+arroba\s+([a-záéíóúñA-ZÁÉÍÓÚÑ0-9.-]+)\s+punto\s+([a-z]{2,})/i);
      if (emailMatch) emailContacto = `${emailMatch[1]}@${emailMatch[2]}.${emailMatch[3]}`;

      // Extract cuando llamar (si no estaba responsable)
      let cuandoLlamar = null;
      const whenMatch = transcript.match(/(por la [a-záéíóúñ]+|a las \d+|el (lunes|martes|miércoles|jueves|viernes)|mañana|esta tarde)/i);
      if (whenMatch && esResponsable === false) cuandoLlamar = whenMatch[0];

      // Build notes
      const now = new Date().toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      let notas = `📞 ${now}${duration ? ' · ' + duration + 's' : ''}\n`;

      if (esResponsable === true) notas += `✅ Responsable: ${nombreContacto || 'confirmado'}`;
      else if (esResponsable === false) {
        notas += `⚠️ No era el responsable`;
        if (nombreContacto) notas += ` — Responsable: ${nombreContacto}`;
        if (cuandoLlamar) notas += `\n🕐 Mejor momento: ${cuandoLlamar}`;
      } else notas += `❓ No confirmado si era el responsable`;
      notas += '\n';

      if (resultado === 'visitaOK') notas += `🟢 VISITA CONCERTADA${fechaVisita ? ' — ' + fechaVisita : ''}\n`;
      else if (resultado === 'noInteresa') notas += `🔴 No interesa\n`;
      else if (resultado === 'rellamar') notas += `🟡 Rellamar${cuandoLlamar ? ' — ' + cuandoLlamar : ''}\n`;
      else if (resultado === 'noContesta') notas += `⚫ No contestó\n`;

      if (emailContacto) notas += `📧 Email: ${emailContacto}\n`;

      // Add key customer lines
      const userLines = lines.filter(l =>
        l.toLowerCase().startsWith('user:') || l.toLowerCase().startsWith('usuario:')
      ).slice(-3).map(l => l.replace(/^(user|usuario):\s*/i, '').trim());
      if (userLines.length > 0) {
        notas += `💬 "${userLines.join(' / ').slice(0, 200)}"\n`;
      }

      notas += `🔗 ${callId}`;

      return res.status(200).json({
        notas, resultado, nombreContacto, fechaVisita, emailContacto,
        esResponsable, cuandoLlamar, duration, transcript
      });

    } catch (e) {
      console.error('Attempt', attempt, e.message);
    }
  }

  return res.status(200).json({
    notas: `📞 Llamada completada\n❓ Transcript no disponible\n🔗 ${callId}`,
    resultado: 'pendiente'
  });
}
