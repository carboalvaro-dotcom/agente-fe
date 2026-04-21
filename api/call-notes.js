export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { callId } = req.body;
  if (!callId) return res.status(400).json({ error: 'callId required' });

  const VAPI_KEY = '96d7565b-f657-42e2-b144-670153ff65eb';

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
      const duration = data.endedAt && data.startedAt
        ? Math.round((new Date(data.endedAt) - new Date(data.startedAt)) / 1000)
        : null;

      if (transcript.length < 10 && attempt < 3) continue;

      const low = transcript.toLowerCase();
      const lines = transcript.split('\n');

      const esResponsable =
        low.includes('soy yo') || low.includes('soy el responsable') ||
        low.includes('soy la responsable') || low.includes('soy el encargado') ||
        low.includes('soy la encargada') || low.includes('soy el dueno') ? true
        : low.includes('no esta') || low.includes('no se encuentra') ||
          low.includes('esta fuera') || low.includes('no es el responsable') ||
          low.includes('no soy') ? false : null;

      let resultado = 'pendiente';
      if (low.includes('de acuerdo') || low.includes('quedamos') ||
          low.includes('lunes') || low.includes('martes') ||
          low.includes('miercoles') || low.includes('jueves') ||
          low.includes('viernes') || low.includes('esta semana') ||
          low.includes('la semana') || low.includes('pasate') ||
          low.includes('manana') || low.includes('mañana'))
        resultado = 'visitaOK';
      else if (low.includes('no me interesa') || low.includes('no estamos interesados') ||
               low.includes('no necesito') || low.includes('no gracias') ||
               low.includes('ya estamos bien'))
        resultado = 'noInteresa';
      else if (low.includes('llame mas tarde') || low.includes('llameme') ||
               low.includes('ahora no puedo') || low.includes('no es buen momento') ||
               low.includes('vuelva a llamar'))
        resultado = 'rellamar';
      else if (data.endedReason === 'customer-did-not-answer' || data.endedReason === 'no-answer')
        resultado = 'noContesta';

      let nombreContacto = null;
      const namePatterns = [
        /me llamo ([A-Z\u00C0-\u017E][a-z\u00C0-\u017E]+)/i,
        /soy ([A-Z\u00C0-\u017E][a-z\u00C0-\u017E]+)/i,
        /habla ([A-Z\u00C0-\u017E][a-z\u00C0-\u017E]+)/i
      ];
      for (const p of namePatterns) {
                const m = transcript.match(p);
        if (m && !['del','de','la','el','un','una','con'].includes(m[1].toLowerCase())) {
          nombreContacto = m[1]; break;
}
}

      let fechaVisita = null;
      const dateMatch = transcript.match(/(lunes|martes|mi.rcoles|jueves|viernes|s.bado|ma.ana|pasado ma.ana)(\s+a las?\s+\d+[:.h]\d*|\s+por la [a-z]+)?/i);
      if (dateMatch) fechaVisita = dateMatch[0];

      let emailContacto = null;
      const emailMatch = transcript.match(/([a-z0-9._-]+)\s+arroba\s+([a-z0-9.-]+)\s+punto\s+([a-z]{2,})/i);
      if (emailMatch) emailContacto = `${emailMatch[1]}@${emailMatch[2]}.${emailMatch[3]}`;

      let cuandoLlamar = null;
      const whenMatch = transcript.match(/(por la [a-z]+|a las \d+|el (lunes|martes|miercoles|jueves|viernes)|manana|esta tarde)/i);
      if (whenMatch && esResponsable === false) cuandoLlamar = whenMatch[0];

      const now = new Date().toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
});

      let notas = `\uD83D\uDCDE ${now}${duration ? ' \u00B7 ' + duration + 's' : ''}\n`;
      if (esResponsable === true)
        notas += `\u2705 Responsable: ${nombreContacto || 'confirmado'}`;
      else if (esResponsable === false) {
        notas += `\u26A0\uFE0F No era el responsable`;
        if (nombreContacto) notas += ` \u2014 Responsable: ${nombreContacto}`;
        if (cuandoLlamar) notas += `\n\uD83D\uDD50 Mejor momento: ${cuandoLlamar}`;
} else notas += `\u2753 No confirmado si era el responsable`;

      notas += '\n';
      if (resultado === 'visitaOK') notas += `\uD83D\uDFE2 VISITA CONCERTADA${fechaVisita ? ' \u2014 ' + fechaVisita : ''}\n`;
      else if (resultado === 'noInteresa') notas += `\uD83D\uDD34 No interesa\n`;
      else if (resultado === 'rellamar') notas += `\uD83D\uDFE1 Rellamar${cuandoLlamar ? ' \u2014 ' + cuandoLlamar : ''}\n`;
      else if (resultado === 'noContesta') notas += `\u26AB No contesto\n`;

      if (emailContacto) notas += `\uD83D\uDCE7 Email: ${emailContacto}\n`;

          const userLines = lines
        .filter(l => /^(user|usuario|customer):/i.test(l))
        .slice(-3)
        .map(l => l.replace(/^(user|usuario|customer):\s*/i, '').trim());
      if (userLines.length > 0)
        notas += `\uD83D\uDCAC "${userLines.join(' / ').slice(0, 200)}"\n`;

      notas += `\uD83D\uDD17 ${callId}`;

      return res.status(200).json({
        notas, resultado, nombreContacto, fechaVisita,
        emailContacto, esResponsable, cuandoLlamar, duration, transcript
});
} catch (e) {
      console.error('Attempt', attempt, e.message);
}
}

  return res.status(200).json({
    notas: `\uD83D\uDCDE Llamada completada\n\u2753 Transcript no disponible\n\uD83D\uDD17 ${callId}`,
    resultado: 'pendiente'
});
}
