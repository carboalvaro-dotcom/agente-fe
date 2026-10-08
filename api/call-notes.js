export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const VAPI_KEY = '96d7565b-f657-42e2-b144-670153ff65eb';

  // ── GET handlers ──────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const _q = req.query || {};

    // GET ?proxyRecording={callId} — proxy audio to avoid browser CORS issues with R2
    if (_q.proxyRecording) {
      const callId = _q.proxyRecording;
      try {
        const callData = await fetch(`https://api.vapi.ai/call/${callId}`, {
          headers: { Authorization: `Bearer ${VAPI_KEY}` }
        }).then(r => r.json()).catch(() => ({}));
        const art = callData.artifact || {};
        // IMPORTANTE: recordingUrl es la URL cruda del bucket R2 y siempre da 400
        // (InvalidArgument: Authorization). Hay que usar las presignedUrl, que
        // caducan a los 30 min — por eso se piden en cada peticion.
        const recUrl = art.presignedMonoUrl
          || art.presignedStereoUrl
          || (art.recording && art.recording.mono && art.recording.mono.combinedUrl)
          || callData.recordingUrl
          || art.recordingUrl
          || '';
        if (!recUrl) return res.status(404).json({ error: 'No recording found' });
        // Sin Authorization: la URL ya va firmada; el header rompe la firma S3.
        const recResp = await fetch(recUrl);
        if (!recResp.ok) return res.status(502).json({ error: 'Recording fetch failed: ' + recResp.status });
        const ct = recResp.headers.get('content-type') || 'audio/wav';
        const buf = Buffer.from(await recResp.arrayBuffer());
        res.setHeader('Content-Type', ct);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'max-age=3600');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
        // Chrome pide 'Range: bytes=0-' para <audio>. Si respondemos 200 sin
        // Content-Range el reproductor se queda colgado: hay que devolver 206.
        const range = req.headers.range;
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          let start = m && m[1] ? parseInt(m[1], 10) : 0;
          let end = m && m[2] ? parseInt(m[2], 10) : buf.length - 1;
          if (!isFinite(start) || start < 0) start = 0;
          if (!isFinite(end) || end >= buf.length) end = buf.length - 1;
          if (start > end) {
            res.setHeader('Content-Range', 'bytes */' + buf.length);
            return res.status(416).end();
          }
          const chunk = buf.subarray(start, end + 1);
          res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + buf.length);
          res.setHeader('Content-Length', chunk.length);
          return res.status(206).send(chunk);
        }
        res.setHeader('Content-Length', buf.length);
        return res.status(200).send(buf);
      } catch(e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // GET ?listToday=1 — list today's calls (for bulk sync / recovery)
    if (_q.listToday) {
      try {
        const today = new Date();
        today.setHours(0,0,0,0);
        const listResp = await fetch(
          `https://api.vapi.ai/call?limit=100&createdAtGt=${today.toISOString()}`,
          { headers: { Authorization: `Bearer ${VAPI_KEY}` } }
        );
        if (!listResp.ok) return res.status(500).json({ error: 'Vapi list failed', status: listResp.status });
        const allCalls = await listResp.json();
        const calls = (Array.isArray(allCalls) ? allCalls : allCalls.data || []).map(c => ({
          id: c.id,
          phone: (c.customer && c.customer.number) || '',
          recordingUrl: c.recordingUrl || (c.artifact && c.artifact.recordingUrl) || '',
          duration: c.endedAt && c.startedAt
            ? Math.round((new Date(c.endedAt) - new Date(c.startedAt)) / 1000)
            : 0,
          endedReason: c.endedReason || '',
          transcript: c.transcript || '',
          createdAt: c.createdAt || ''
        }));
        return res.status(200).json({ calls });
      } catch(e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // GET ?listAssistants=1 — list all Vapi assistants with their full config
    if (_q.listAssistants) {
      try {
        const r = await fetch('https://api.vapi.ai/assistant?limit=20', {
          headers: { Authorization: `Bearer ${VAPI_KEY}` }
        });
        if (!r.ok) return res.status(500).json({ error: 'Vapi assistants failed', status: r.status });
        const data = await r.json();
        return res.status(200).json({ assistants: Array.isArray(data) ? data : data.data || data });
      } catch(e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // GET ?getRecentCalls=10 — get last N calls with full details
    if (_q.getRecentCalls) {
      try {
        const limit = parseInt(_q.getRecentCalls) || 5;
        const r = await fetch(`https://api.vapi.ai/call?limit=${limit}`, {
          headers: { Authorization: `Bearer ${VAPI_KEY}` }
        });
        if (!r.ok) return res.status(500).json({ error: 'Vapi calls failed', status: r.status });
        const data = await r.json();
        const calls = (Array.isArray(data) ? data : data.data || []).map(c => ({
          id: c.id,
          phone: (c.customer && c.customer.number) || '',
          assistantId: c.assistantId || (c.assistant && c.assistant.id) || '',
          status: c.status,
          endedReason: c.endedReason || '',
          duration: c.endedAt && c.startedAt
            ? Math.round((new Date(c.endedAt) - new Date(c.startedAt)) / 1000)
            : 0,
          transcript: c.transcript || '',
          recordingUrl: c.recordingUrl || (c.artifact && c.artifact.recordingUrl) || '',
          createdAt: c.createdAt || '',
          messages: (c.messages || []).slice(0, 5)
        }));
        return res.status(200).json({ calls });
      } catch(e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // GET ?fixAssistant=assistantId — patch backgroundSound to off
    if (_q.fixAssistant) {
      const assistantId = _q.fixAssistant;
      try {
        // First get current config
        const getR = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
          headers: { Authorization: `Bearer ${VAPI_KEY}` }
        });
        if (!getR.ok) return res.status(500).json({ error: 'Could not get assistant', status: getR.status });
        const current = await getR.json();

        // Patch: remove backgroundSound, ensure voice/model are intact
        const patch = { backgroundSound: 'off' };

        const patchR = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(patch)
        });
        if (!patchR.ok) {
          const errBody = await patchR.text();
          return res.status(500).json({ error: 'Patch failed', status: patchR.status, body: errBody });
        }
        const updated = await patchR.json();
        return res.status(200).json({
          ok: true,
          before: { backgroundSound: current.backgroundSound },
          after: { backgroundSound: updated.backgroundSound },
          assistantId
        });
      } catch(e) {
        return res.status(500).json({ error: e.message });
      }
    }

    return res.status(400).json({ error: 'Unknown GET query' });
  }

  // ── POST: analyze a single call ───────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // POST webhook de Vapi: herramienta "esperar" de Carla (v2.1). Solo confirma; no hace nada.
  if (req.body && req.body.message && req.body.message.type === 'tool-calls') {
    const list = req.body.message.toolCallList || req.body.message.toolCalls || [];
    return res.status(200).json({ results: list.map(tc => ({ toolCallId: tc.id, result: 'EN ESPERA. No digas nada: tu respuesta debe estar vacía. Vuelve a hablar solo cuando te hable una PERSONA (no una locución ni un menú).' })) });
  }

  // POST action=makeCall — proxy outbound call (browser can't call Vapi directly due to CORS)
  if (req.body.action === 'makeCall') {
    const { payload } = req.body;
    if (!payload) return res.status(400).json({ error: 'payload required' });
    try {
      const r = await fetch('https://api.vapi.ai/call/phone', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const text = await r.text();
      if (!r.ok) return res.status(200).json({ error: 'Vapi ' + r.status + ': ' + text.slice(0, 300) });
      let data;
      try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
      return res.status(200).json(data);
    } catch(e) {
      return res.status(200).json({ error: e.message });
    }
  }

  const { callId } = req.body;
  if (!callId) return res.status(400).json({ error: 'callId required' });

  try {
    const r = await fetch(`https://api.vapi.ai/call/${callId}`, {
      headers: { Authorization: `Bearer ${VAPI_KEY}` }
    });
    if (!r.ok) return res.status(200).json({ notas: '', resultado: 'duda', retry: true });

    const data = await r.json();

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

    // ── v2.1: datos estructurados de Vapi (si existen mandan sobre las heurísticas) ──
    const endedAgo = data.endedAt ? (Date.now() - new Date(data.endedAt).getTime()) : 1e9;
    const sd = (data.analysis && data.analysis.structuredData) || null;
    if (!sd && data.assistant && data.assistant.analysisPlan && endedAgo < 90000) {
      return res.status(200).json({ notas: '', resultado: 'duda', retry: true });
    }
    let sdNombre = null, sdTel = null, sdEmail = null, sdCuando = null, sdVisita = null, sdExtra = '';
    if (sd && sd.resultado) {
      const map = { visita:'visitaOK', contacto_responsable:'rellamar', pide_persona:'rellamar', rellamar:'rellamar',
        no_interesa:'noInteresa', numero_erroneo:'noInteresa', no_contesta:'noContesta', maquina:'noContesta', otro:'duda' };
      if (map[sd.resultado]) resultado = map[sd.resultado];
      const clean = v => (typeof v === 'string' && v.trim() && !/^(n\/a|null|ninguno|no)$/i.test(v.trim())) ? v.trim() : null;
      sdNombre = clean(sd.nombre_responsable);
      sdTel = clean(sd.telefono_contacto); if (sdTel) { sdTel = sdTel.replace(/[^0-9+]/g,''); if (sdTel.length < 9) sdTel = null; }
      sdEmail = clean(sd.email_contacto); if (sdEmail && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(sdEmail)) sdEmail = null;
      sdCuando = clean(sd.cuando_llamar);
      sdVisita = clean(sd.fecha_visita);
      const dep = clean(sd.departamento);
      if (sd.resultado === 'numero_erroneo') sdExtra += '❌ NÚMERO EQUIVOCADO — no volver a llamar a este teléfono\n';
      if (sd.resultado === 'pide_persona') sdExtra += '🙋 QUIERE HABLAR CON UNA PERSONA — llamar tú' + (sdCuando ? ' (' + sdCuando + ')' : '') + '\n';
      if (sd.resultado === 'contacto_responsable') sdExtra += '⭐ CONTACTO DEL RESPONSABLE CONSEGUIDO\n';
      if (dep) sdExtra += '🏢 ' + dep + '\n';
      if (sdTel) sdExtra += '📱 ' + sdTel + '\n';
      if (sdCuando && sd.resultado !== 'pide_persona') sdExtra += '🕐 ' + sdCuando + '\n';
      if (clean(sd.resumen)) sdExtra += '📝 ' + clean(sd.resumen) + '\n';
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
    let rellamarHora = null;
    if (resultado === 'rellamar') {
      const horaM = rawTranscript.match(/(?:a las?|las?)\s*(\d{1,2}(?::\d{2})?)/i);
      const diaM = rawTranscript.match(/\b(esta tarde|esta noche|ma[ñn]ana|pasado|lunes|martes|mi[ée]rcoles|jueves|viernes)\b/i);
      if (horaM || diaM) rellamarHora = [diaM?.[1], horaM?.[1]].filter(Boolean).join(' a las ');
    }

    const labels = {
      visitaOK:'🟢 VISITA CONCERTADA', noInteresa:'🔴 No interesa',
      rellamar:'🟡 Rellamar', noContesta:'⚫ No contestó', duda:'❓ Duda — revisar'
    };

    let notas = `📞 ${now}${duration?' · '+duration+'s':''}\n`;
    notas += `${labels[resultado]}${rellamarHora ? ' — ' + rellamarHora : ''}\n`;
    if (sdExtra) notas += sdExtra;
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

    if (sdNombre) nombreContacto = sdNombre;
    if (sdEmail) emailContacto = sdEmail;
    if (sdVisita && !fechaVisita) fechaVisita = sdVisita;
    return res.status(200).json({
      notas, resultado, nombreContacto, fechaVisita, emailContacto, telefonoContacto: sdTel, recordingUrl, duration, retry: false
    });

  } catch (e) {
    return res.status(200).json({ notas: '', resultado: 'duda', retry: true, error: e.message });
  }
}
