export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { callId } = req.body;
  if (!callId) return res.status(400).json({ error: 'callId required' });

  const VAPI_KEY = '96d7565b-f657-42e2-b144-670153ff65eb';

  // Poll until call ends and transcript ready — max 12 attempts x 10s = 2 min
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise(r => setTimeout(r, attempt === 0 ? 10000 : 10000));
    try {
      const r = await fetch(`https://api.vapi.ai/call/${callId}`, {
        headers: { Authorization: `Bearer ${VAPI_KEY}` }
      });
      if (!r.ok) continue;
      const data = await r.json();

      // Still in progress — keep waiting
      if (data.status === 'in-progress' || data.status === 'ringing') continue;

      const transcript = data.transcript || '';

      // Transcript not ready yet — wait more unless we've tried enough
      if (transcript.length < 20 && attempt < 6) continue;

      const duration = data.endedAt && data.startedAt
        ? Math.round((new Date(data.endedAt) - new Date(data.startedAt)) / 1000)
        : null;

      const low = transcript.toLowerCase();
      const lines = transcript.split('\n');

      // Detect if responsible
      const esResponsable =
        low.includes('soy yo') || low.includes('sí, soy yo') || low.includes('si, soy yo') ||
        low.includes('soy el responsable') || low.includes('soy la responsable') ||
        low.includes('soy el encargado') || low.includes('soy la encargada') ||
        low.includes('soy el dueño') || low.includes('soy la dueña') ? true
        : low.includes('no está') || low.includes('no se encuentra') ||
          low.includes('no soy') || low.includes('no es el responsable') ? false
        : null;

      // Detect result
      let resultado = 'pendiente';
      if (
        low.includes('de acuerdo') || low.includes('quedamos') ||
        low.includes('lunes') || low.includes('martes') || low.includes('miércoles') ||
        low.includes('jueves') || low.includes('viernes') ||
        low.includes('esta semana') || low.includes('la semana que viene') ||
        low.includes('mañana') || low.includes('pasado mañana') ||
        low.includes('a las 10') || low.includes('a las 11') || low.includes('a las 12') ||
        low.includes('a las diez') || low.includes('a las once') || low.includes('a las doce')
      ) resultado = 'visitaOK';
      else if (
        low.includes('no me interesa') || low.includes('no estamos interesados') ||
        low.includes('no necesito') || low.includes('no gracias') ||
        low.includes('ya estamos bien') || low.includes('no quiero')
      ) resultado = 'noInteresa';
      else if (
        low.includes('llame más tarde') || low.includes('llámenos') ||
        low.includes('ahora no puedo') || low.includes('no es buen momento') ||
        low.includes('vuelva a llamar') || low.includes('llame en otro momento')
      ) resultado = 'rellamar';
      else if (
        data.endedReason === 'customer-did-not-answer' ||
        data.endedReason === 'no-answer' ||
        data.endedReason === 'voicemail'
      ) resultado = 'noContesta';

      // Extract name - exclude agent name and common words
      let nombreContacto = null;
      const agentNames = ['carla','carlos','maria','carmen','rosa','ana'];
      const stopWords = ['del','de','la','el','un','una','con','por','que','hay','muy','usted','hola','buenos','dias'];
      const namePatterns = [
        /(?:me llamo|soy yo,? me llamo|mi nombre es) ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})/i,
        /(?:habla|con quien hablo.*?habla) ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})/i,
        /(?:el responsable es|hablar con) ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})/i
      ];
      for (const p of namePatterns) {
        const m = transcript.match(p);
        if (m && !stopWords.includes(m[1].toLowerCase()) && !agentNames.includes(m[1].toLowerCase())) {
          nombreContacto = m[1]; break;
        }
      }

      // Extract visit date
      let fechaVisita = null;
      const dateMatch = transcript.match(
        /(lunes|martes|miércoles|jueves|viernes|mañana|pasado mañana)(\s+a las?\s+\d+[:.h]?\d*|\s+por la [a-záéíóúñ]+)?/i
      );
      if (dateMatch) fechaVisita = dateMatch[0];

      // Extract email
      let emailContacto = null;
      const emailMatch = transcript.match(
        /([a-záéíóúñA-ZÁÉÍÓÚÑ0-9._-]+)\s+arroba\s+([a-záéíóúñA-ZÁÉÍÓÚÑ0-9.-]+)\s+punto\s+([a-z]{2,})/i
      );
      if (emailMatch) emailContacto = `${emailMatch[1]}@${emailMatch[2]}.${emailMatch[3]}`;

      // Extract cuando llamar if not responsible
      let cuandoLlamar = null;
      if (esResponsable === false) {
        const whenMatch = transcript.match(/(por la [a-záéíóúñ]+|a las \d+|el (lunes|martes|miércoles|jueves|viernes)|mañana|esta tarde)/i);
        if (whenMatch) cuandoLlamar = whenMatch[0];
      }

      // Build notes
      const now = new Date().toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      let notas = `📞 ${now}${duration ? ' · ' + duration + 's' : ''}\n`;

      if (esResponsable === true) {
        notas += `✅ Responsable confirmado${nombreContacto ? ': ' + nombreContacto : ''}`;
      } else if (esResponsable === false) {
        notas += `⚠️ No era el responsable`;
        if (nombreContacto) notas += ` — Responsable: ${nombreContacto}`;
        if (cuandoLlamar) notas += `\n🕐 Mejor momento: ${cuandoLlamar}`;
      } else {
        notas += `❓ No confirmado si era el responsable`;
        if (nombreContacto) notas += ` (${nombreContacto})`;
      }
      notas += '\n';

      if (resultado === 'visitaOK') notas += `🟢 VISITA CONCERTADA${fechaVisita ? ' — ' + fechaVisita : ''}\n`;
      else if (resultado === 'noInteresa') notas += `🔴 No interesa\n`;
      else if (resultado === 'rellamar') notas += `🟡 Rellamar${cuandoLlamar ? ' — ' + cuandoLlamar : ''}\n`;
      else if (resultado === 'noContesta') notas += `⚫ No contestó (${data.endedReason || ''})\n`;

      if (emailContacto) notas += `📧 Email: ${emailContacto}\n`;

      // Add key customer lines
      const userLines = lines
        .filter(l => /^(user|usuario|cliente):/i.test(l) && !l.toLowerCase().includes('soy carla') && !l.toLowerCase().includes('llama carla'))
        .slice(-3)
        .map(l => l.replace(/^(user|usuario|cliente):\s*/i, '').trim())
        .filter(l => l.length > 5);
      if (userLines.length > 0) {
        notas += `💬 "${userLines.join(' / ').slice(0, 250)}"\n`;
      }

      notas += `🔗 ${callId}`;

      return res.status(200).json({
        notas, resultado, nombreContacto, fechaVisita,
        emailContacto, esResponsable, cuandoLlamar, duration, transcript
      });

    } catch (e) {
      console.error('Attempt', attempt, e.message);
    }
  }

  // Timeout — return basic note
  return res.status(200).json({
    notas: `📞 Llamada completada\n❓ Transcript no disponible después de esperar\n🔗 ${callId}`,
    resultado: 'pendiente'
  });
}
