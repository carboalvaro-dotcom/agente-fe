export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { callId } = req.body;
  if (!callId) return res.status(400).json({ error: 'callId required' });

  const VAPI_KEY = '96d7565b-f657-42e2-b144-670153ff65eb';

  // Fast: just fetch the call data directly, no waiting loops
  // Frontend will retry if needed
  try {
    const r = await fetch(`https://api.vapi.ai/call/${callId}`, {
      headers: { Authorization: `Bearer ${VAPI_KEY}` }
    });
    if (!r.ok) return res.status(200).json({ notas: '', resultado: 'duda', retry: true });

    const data = await r.json();

    // Still in progress
    if (data.status === 'in-progress' || data.status === 'ringing') {
      return res.status(200).json({ notas: '', resultado: 'duda', retry: true });
    }

    const transcript = (data.transcript || '').toLowerCase();
    const rawTranscript = data.transcript || '';
    const recordingUrl = data.recordingUrl || data.artifact?.recordingUrl || null;
    const endedReason = data.endedReason || '';
    const duration = data.endedAt && data.startedAt
      ? Math.round((new Date(data.endedAt) - new Date(data.startedAt)) / 1000)
      : null;

    // Not enough data yet
    if (transcript.length < 20 && !endedReason) {
      return res.status(200).json({ notas: '', resultado: 'duda', retry: true });
    }

    // ── CLASIFICACIÓN ────────────────────────────────────────────
    let resultado = 'duda';

    const noContactReasons = ['customer-did-not-answer','no-answer','voicemail',
      'machine_end_beep','machine_end_silence','machine_end_other'];
    const shortCall = duration !== null && duration < 15;

    if (noContactReasons.includes(endedReason) || shortCall || transcript.length < 30) {
      resultado = 'noContesta';
    } else if (
      (transcript.includes('quedamos') || transcript.includes('de acuerdo') ||
       transcript.includes('nos vemos') || transcript.includes('le espero')) &&
      transcript.match(/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|ma[ñn]ana|pasado)\b/)
    ) {
      resultado = 'visitaOK';
    } else if (
      transcript.match(/\bno (me |nos )?(interesa|interesamos|queremos|necesitamos)\b/) ||
      transcript.match(/\bno (estamos|estoy) interesad/) ||
      transcript.match(/\b(no gracias|paso|no me llame|no nos llame|no moleste)\b/) ||
      transcript.match(/\bno (necesito|necesitamos) nada\b/)
    ) {
      resultado = 'noInteresa';
    } else if (
      transcript.match(/\b(no est[aá]|no se encuentra|ha salido|est[aá] fuera|est[aá] ausente)\b/) ||
      transcript.match(/\b(llame (m[aá]s tarde|luego|ma[ñn]ana|despu[eé]s|en otro momento))\b/) ||
      transcript.match(/\b(ahora no (puede|puedo)|no es buen momento)\b/) ||
      transcript.match(/\b(vuelva a llamar|ll[aá]menos)\b/) ||
      transcript.match(/\b(no soy (yo|el responsable)|no me encargo)\b/)
    ) {
      resultado = 'rellamar';
    }

    // ── NOMBRE ───────────────────────────────────────────────────
    const agentNames = ['carla','carlos'];
    const stopWords = ['del','de','la','el','un','una','con','por','que','hay',
      'muy','usted','hola','buenos','dias','tardes','perfecto','claro','vale','factor','energía'];
    let nombreContacto = null;
    const namePatterns = [
      /(?:me llamo|mi nombre es)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})/i,
      /(?:soy\s+)([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})(?:\s*[,.])/i,
    ];
    for (const p of namePatterns) {
      const m = rawTranscript.match(p);
      if (m && !stopWords.includes(m[1].toLowerCase()) && !agentNames.includes(m[1].toLowerCase())) {
        nombreContacto = m[1]; break;
      }
    }

    // ── FECHA VISITA ─────────────────────────────────────────────
    let fechaVisita = null;
    if (resultado === 'visitaOK') {
      const dm = rawTranscript.match(/(lunes|martes|mi[eé]rcoles|jueves|viernes|ma[ñn]ana|pasado ma[ñn]ana)(\s+a las?\s+\d+[:.h]?\d*)?/i);
      if (dm) fechaVisita = dm[0];
    }

    // ── EMAIL ────────────────────────────────────────────────────
    let emailContacto = null;
    const em = rawTranscript.match(/([a-z0-9._-]+)\s+arroba\s+([a-z0-9.-]+)\s+punto\s+([a-z]{2,})/i);
    if (em) emailContacto = `${em[1]}@${em[2]}.${em[3]}`;

    // ── NOTAS ────────────────────────────────────────────────────
    const now = new Date().toLocaleDateString('es-ES', {
      day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
    });
    const labels = {
      visitaOK:'🟢 VISITA CONCERTADA', noInteresa:'🔴 No interesa',
      rellamar:'🟡 Rellamar', noContesta:'⚫ No contestó', duda:'❓ Duda — revisar'
    };

    let notas = `📞 ${now}${duration?' · '+duration+'s':''}\n`;
    notas += `${labels[resultado]}\n`;
    if (fechaVisita) notas += `📅 ${fechaVisita}\n`;
    if (nombreContacto) notas += `👤 ${nombreContacto}\n`;
    if (emailContacto) notas += `📧 ${emailContacto}\n`;

    const lines = rawTranscript.split('\n');
    const userLines = lines
      .filter(l => /^(user|usuario|cliente):/i.test(l))
      .map(l => l.replace(/^(user|usuario|cliente):\s*/i,'').trim())
      .filter(l => l.length > 8 && !l.toLowerCase().includes('soy carla'))
      .slice(-3);
    if (userLines.length > 0) notas += `💬 "${userLines.join(' / ').slice(0,300)}"\n`;

    if (recordingUrl) notas += `🎧 ${recordingUrl}`;
    else notas += `🔗 https://dashboard.vapi.ai/calls/${callId}`;

    return res.status(200).json({
      notas, resultado, nombreContacto, fechaVisita, emailContacto, recordingUrl, duration, retry: false
    });

  } catch (e) {
    return res.status(200).json({ notas: '', resultado: 'duda', retry: true, error: e.message });
  }
}
