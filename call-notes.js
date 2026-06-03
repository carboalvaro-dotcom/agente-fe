export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { callId, checkStatus } = req.body;
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

      if (checkStatus) {
        return res.status(200).json({ callStatus: data.status, callEndedReason: data.endedReason });
      }

      if (data.status === 'in-progress') continue;

      const transcript = data.transcript || '';
      const lines = transcript.split('\n');
      const low = transcript.toLowerCase();

      if (transcript.length < 10 && attempt < 3) continue;

      const duration = data.endedAt && data.startedAt
        ? Math.round((new Date(data.endedAt) - new Date(data.startedAt)) / 1000)
        : null;

      // ── DETECCIÓN DE RESULTADO ──────────────────────────────────────────────
      // Prioridad: noContesta > noInteresa > visitaOK > rellamar > duda
      // DEFAULT si no encaja nada: DUDA (nunca pendiente)

      let resultado = 'duda'; // ← DEFAULT siempre duda, nunca pendiente

      // 1. NO CONTESTA
      const noContestaTriggers = [
        data.endedReason === 'customer-did-not-answer',
        data.endedReason === 'no-answer',
        data.endedReason === 'voicemail',
        low.includes('deje su mensaje'),
        low.includes('no está disponible'),
        low.includes('buzón de voz'),
        low.includes('fuera de cobertura'),
        low.includes('número no existe'),
        low.includes('en estos momentos no podemos atender'),
        low.includes('deja un mensaje'),
        (duration !== null && duration < 8 && !low.includes('user:')),
      ];
      if (noContestaTriggers.some(Boolean)) {
        resultado = 'noContesta';
      }

      // 2. NO INTERESA
      else if (
        low.includes('no me interesa') || low.includes('no nos interesa') ||
        low.includes('no estamos interesados') || low.includes('no tenemos interés') ||
        low.includes('no necesitamos') || low.includes('no necesito') ||
        low.includes('no gracias') || low.includes('no, gracias') ||
        low.includes('ya estamos bien') || low.includes('ya tenemos') ||
        low.includes('estamos contentos') || low.includes('no queremos') ||
        low.includes('no quiero') || low.includes('no me llame') ||
        low.includes('no vuelva a llamar') || low.includes('no llame más') ||
        low.includes('quíteme de su lista') || low.includes('bórrenos') ||
        low.includes('no me moleste') || low.includes('no nos llame')
      ) {
        resultado = 'noInteresa';
      }

      // 3. VISITA — confirmación + referencia temporal
      else if (
        (low.includes('de acuerdo') || low.includes('está bien') || low.includes('perfecto') ||
         low.includes('vale') || low.includes('quedamos') || low.includes('nos vemos') ||
         low.includes('venga') || low.includes('sí, puede venir') || low.includes('puede pasar') ||
         low.includes('me parece bien') || low.includes('confirmado')) &&
        (low.includes('lunes') || low.includes('martes') || low.includes('miércoles') ||
         low.includes('jueves') || low.includes('viernes') || low.includes('mañana') ||
         low.includes('esta semana') || low.includes('la semana que viene') ||
         /a las \d/.test(low) || /\d{1,2}[h:]\d{2}/.test(low))
      ) {
        resultado = 'visitaOK';
      }

      // 4. RELLAMAR
      else if (
        low.includes('llame más tarde') || low.includes('llámeme') ||
        low.includes('vuelva a llamar') || low.includes('llame después') ||
        low.includes('ahora no puedo') || low.includes('ahora no es buen momento') ||
        low.includes('no es buen momento') || low.includes('estoy ocupado') ||
        low.includes('estoy ocupada') || low.includes('ahora estoy') ||
        low.includes('luego le llamo') || low.includes('le llamo yo') ||
        low.includes('esta tarde') || low.includes('esta mañana no') ||
        low.includes('mañana me llama') || low.includes('llame el') ||
        low.includes('llámeme el') || low.includes('en otro momento') ||
        low.includes('otro momento') || low.includes('no tengo tiempo') ||
        low.includes('ahora no tengo') || low.includes('pasado mañana') ||
        low.includes('cuando pueda') || low.includes('la semana que viene me llama') ||
        low.includes('la semana próxima')
      ) {
        resultado = 'rellamar';
      }

      // 5. DUDA explícita (ya es el default pero lo dejamos por claridad)
      else if (
        low.includes('me lo pienso') || low.includes('lo pensaré') ||
        low.includes('déjeme pensarlo') || low.includes('lo consultaré') ||
        low.includes('lo consulto') || low.includes('hablaré con') ||
        low.includes('le digo algo') || low.includes('ya le llamaré') ||
        low.includes('mándeme información') || low.includes('envíeme') ||
        low.includes('interesante') || low.includes('puede ser') ||
        low.includes('a lo mejor') || low.includes('quizás') ||
        low.includes('no sé') || low.includes('tendría que')
      ) {
        resultado = 'duda';
      }

      // ── RESUMEN INTELIGENTE DE LA LLAMADA ───────────────────────────────────
      // Extraer líneas del agente y del cliente para construir un resumen real
      const agentLines = lines
        .filter(l => l.toLowerCase().startsWith('assistant:') || l.toLowerCase().startsWith('bot:') || l.toLowerCase().startsWith('ai:'))
        .map(l => l.replace(/^(assistant|bot|ai):\s*/i, '').trim())
        .filter(l => l.length > 10);

      const userLines = lines
        .filter(l => l.toLowerCase().startsWith('user:') || l.toLowerCase().startsWith('usuario:') || l.toLowerCase().startsWith('human:'))
        .map(l => l.replace(/^(user|usuario|human):\s*/i, '').trim())
        .filter(l => l.length > 2);

      // Resumen: primeras frases del cliente (lo que dijo)
      const clienteSummary = userLines.slice(0, 5).join(' / ').slice(0, 300);

      // Extract name
      let nombreContacto = null;
      const namePatterns = [
        /me llamo ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/i,
        /soy ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/i,
        /habla ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/i,
        /mi nombre es ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/i,
      ];
      for (const p of namePatterns) {
        const m = transcript.match(p);
        if (m && !['del','de','la','el','un','una','con','que','lo','le','carla','carlos'].includes(m[1].toLowerCase())) {
          nombreContacto = m[1]; break;
        }
      }

      // Detect responsible
      const esResponsable =
        low.includes('soy yo') || low.includes('soy el responsable') ||
        low.includes('soy la responsable') || low.includes('soy el encargado') ||
        low.includes('soy la encargada') || low.includes('soy el dueño') ||
        low.includes('soy la dueña') || low.includes('soy el gerente') ? true
        : low.includes('no está') || low.includes('no se encuentra') ||
          low.includes('está fuera') || low.includes('no es el responsable') ||
          low.includes('no soy yo') ? false
        : null;

      // Extract visit date
      let fechaVisita = null;
      const dateMatch = transcript.match(/(lunes|martes|miércoles|miercoles|jueves|viernes|mañana|pasado mañana)(\s+a las?\s+\d+[:.h]\d*|\s+por la [a-záéíóúñ]+)?/i);
      if (dateMatch && resultado === 'visitaOK') fechaVisita = dateMatch[0];

      // Extract rellamar time
      let cuandoLlamar = null;
      const whenMatch = transcript.match(/(a las \d+|el (lunes|martes|miércoles|jueves|viernes)|mañana|esta tarde|pasado mañana|la semana (que viene|próxima))/i);
      if (whenMatch && resultado === 'rellamar') cuandoLlamar = whenMatch[0];

      // Extract email
      let emailContacto = null;
      const emailMatch = transcript.match(/([a-záéíóúñA-ZÁÉÍÓÚÑ0-9._-]+)\s+arroba\s+([a-záéíóúñA-ZÁÉÍÓÚÑ0-9.-]+)\s+punto\s+([a-z]{2,})/i);
      if (emailMatch) emailContacto = `${emailMatch[1]}@${emailMatch[2]}.${emailMatch[3]}`;

      // ── CONSTRUIR NOTAS CON RESUMEN REAL ────────────────────────────────────
      const now = new Date().toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      let notas = `📞 ${now}${duration ? ' · ' + duration + 's' : ''}\n`;

      // Resultado con color
      if      (resultado === 'noContesta') notas += `⚫ No contestó\n`;
      else if (resultado === 'visitaOK')   notas += `🟢 VISITA CONCERTADA${fechaVisita ? ' — ' + fechaVisita : ''}\n`;
      else if (resultado === 'noInteresa') notas += `🔴 No interesa\n`;
      else if (resultado === 'rellamar')   notas += `🟡 Rellamar${cuandoLlamar ? ' — ' + cuandoLlamar : ''}\n`;
      else if (resultado === 'duda')       notas += `🟣 Duda / sin decisión\n`;

      // Responsable
      if (esResponsable === true) {
        notas += `👤 ${nombreContacto ? 'Responsable: ' + nombreContacto : 'Era el responsable'}\n`;
      } else if (esResponsable === false) {
        notas += `⚠️ No era el responsable${nombreContacto ? ' (contacto: ' + nombreContacto + ')' : ''}\n`;
      }

      // Resumen de lo que dijo el cliente
      if (clienteSummary) {
        notas += `💬 Cliente: "${clienteSummary}"\n`;
      }

      if (emailContacto) notas += `📧 ${emailContacto}\n`;

      notas += `🔗 ${callId}`;

      const recordingUrl = data.recordingUrl || data.artifact?.recordingUrl || data.artifact?.videoRecordingUrl || '';
      return res.status(200).json({
        notas, resultado, nombreContacto, fechaVisita, emailContacto,
        esResponsable, cuandoLlamar, duration, transcript, recordingUrl
      });

    } catch (e) {
      console.error('Attempt', attempt, e.message);
    }
  }

  // Fallback: transcript no disponible → DUDA, no pendiente
  return res.status(200).json({
    notas: `📞 Llamada completada\n🟣 Duda / sin decisión (transcript no disponible)\n🔗 ${callId}`,
    resultado: 'duda'
  });
}
