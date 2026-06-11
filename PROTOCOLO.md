# PROTOCOLO — Añadir nuevo sector al CRM Factor Energía

> Versión: 10/06/2026  
> Repo: `carboalvaro-dotcom/agente-fe`  
> CRM: `https://carboalvaro-dotcom.github.io/agente-fe/`

---

## 1. ANTES DE EMPEZAR — Preguntas obligatorias

Antes de escribir una sola línea de código, necesito que me confirmes:

### 1.1 Nombre del sector
¿Cómo se llama? (ej: "Hoteles", "Gimnasios", "Notarías")  
Esto determina el **prefijo** de todas las variables internas.

### 1.2 Emoji e icono
¿Qué emoji representa este sector en la cabecera del acordeón?  
Ejemplos actuales: 🏪 Supermercados · 🦷 Salud · 🔧 Talleres · 🏢 Administradores

### 1.3 Speech de llamada (OBLIGATORIO — te lo pido siempre)
¿Qué dice Carla al teléfono?  
Necesito el texto exacto para las siguientes partes:
- **firstMessage**: "Buenos días, ¿hablo con [nombre negocio]?"
- **systemPrompt**: el flujo completo de la llamada
- **Reglas específicas del sector** (qué no decir, cómo responder preguntas de precio, etc.)

El speech actual para referencia es:
```
"Le llamo porque detectamos desajustes de potencia en los negocios de su zona.
Nosotros nos encargamos de solucionar ese problema sin coste para usted.
Diez minutos de revisión, ¿le encaja esta semana?"
```

### 1.4 Datos de las empresas
¿Tienes el listado? Formato mínimo por empresa:
```json
{
  "id": "prefijo_nombre_municipio",
  "nombre": "Nombre Empresa",
  "telefono": "930000000",
  "direccion": "Calle...",
  "cp": "08000",
  "municipio": "Barcelona",
  "tipo": "tipo_negocio"
}
```

### 1.5 Municipios que aparecerán en el filtro
¿Cuáles son los municipios del sector?

---

## 2. NOMENCLATURA — Naming obligatorio

Con el nombre del sector (ej: "HOT" para Hoteles) se definen todos los identificadores:

| Elemento | Patrón | Ejemplo |
|----------|--------|---------|
| ID módulo HTML | `{XXX}-section` | `hot-section` |
| Script tag | `id="{xxx}-module"` | `id="hot-module"` |
| Variable datos | `var {XXX}` | `var HOT` |
| Campo datos | `{xxx}s` o nombre natural | `hoteles` |
| Estado localStorage | `fe_{xxx}_v1` | `fe_hot_v1` |
| Variable estado | `{xxx}St` | `hotSt` |
| Variable selección | `{xxx}Sel` | `hotSel` |
| window._id | `window._{xxx}Id` | `window._hotId` |
| Prefijo campaña | `{XXX}:` | `HOT:` |
| Función render | `{xxx}RenderList()` | `hotRenderList()` |
| Función open | `{xxx}Open2(id)` | `hotOpen2(id)` |
| Función estado | `{xxx}SetEstado(id,est)` | `hotSetEstado(id,est)` |
| Función save | `{xxx}Save()` | `hotSave()` |
| Función llamar | `{xxx}Llamar(id)` | `hotLlamar(id)` |
| Función selección | `sel{Xxx}(id)` | `selHot(id)` |
| Filtro municipio | `{xxx}-muni-filter` | `hot-muni-filter` |
| Lista HTML | `{xxx}-list` | `hot-list` |
| Clase item | `{xxx}-item` | `hot-item` |
| data-id | `data-{xxx}id` | `data-hotid` |
| Header count | `{xxx}-hdr-count` | `hot-hdr-count` |
| selMob wrapper | `_sm{Xxx}` | `_smHot` |

---

## 3. ESTRUCTURA DEL MÓDULO — Checklist técnico

### 3.1 HTML — Sección acordeón
Añadir en el body, junto a las otras secciones:

```html
<div class="acc-section" id="{xxx}-section">
  <div class="acc-header" onclick="openSector('{xxx}-section')">
    <span style="display:flex;align-items:center;gap:5px">
      <span class="acc-title">{EMOJI} {Nombre sector}</span>
      <span class="acc-count" id="{xxx}-hdr-count"></span>
    </span>
    <span class="acc-header-arrow">&#9660;</span>
  </div>
  <div class="acc-body">
    <!-- Filtro municipio -->
    <div style="padding:5px 10px 6px;border-bottom:1px solid var(--bd);background:var(--s1);">
      <select id="{xxx}-muni-filter" onchange="{xxx}RenderList()" 
        style="width:100%;font-size:11px;padding:3px 6px;border:1px solid var(--bd);
               border-radius:4px;background:var(--s0);color:var(--tx);">
        <option value="">Todos los municipios</option>
        <option value="Municipio1">Municipio1</option>
        <!-- ... -->
      </select>
    </div>
    <!-- Lista -->
    <div id="{xxx}-list" class="acc-list"></div>
  </div>
</div>
```

### 3.2 openSector — Añadir el sector
En la función `openSector()` del script principal, añadir:
```js
if(id==='{xxx}-section'&&typeof {xxx}RenderList==='function'){xxx}RenderList();
```

### 3.3 setFechaHoy — Añadir al conteo
En `setFechaHoy()`, añadir la variable del nuevo módulo al conteo de llamadas de hoy:
```js
var _{xxx}St=JSON.parse(localStorage.getItem('fe_{xxx}_v1')||'{}');
var _c{Xxx}=_filt(_{xxx}St);
```
Y añadirlo a la lógica de `_best`.

### 3.4 autoBackupAll — Incluir en backup
En `autoBackupAll()`, añadir en el objeto `d`:
```js
{xxx}:JSON.parse(localStorage.getItem('fe_{xxx}_v1')||'{}'),
```

### 3.5 syncToGitHub — Incluir en sync
En `syncToGitHub()`, añadir en `saveData`:
```js
{xxx}:JSON.parse(localStorage.getItem('fe_{xxx}_v1')||'{}'),
```

### 3.6 loadFromGitHub / auto-restore — Incluir en restore
En `loadFromGitHub()` y en el bloque de auto-restore al inicio:
```js
if(bk.{xxx}&&Object.keys(bk.{xxx}).length>0)
  localStorage.setItem('fe_{xxx}_v1',JSON.stringify(bk.{xxx}));
```

### 3.7 showCampaignSummary — Añadir modo
```js
var is{Xxx}=q0.startsWith('{XXX}:');
// ...
} else if(is{Xxx}){
  var _st=JSON.parse(localStorage.getItem('fe_{xxx}_v1')||'{}');
  done=campaignQueue.slice(0,campaignIdx).map(function(id){
    return _st[id.substring(4)]||{estado:'sinLlamar'};
  });
}
```

---

## 4. EL SCRIPT DEL MÓDULO — Template completo

El script sigue **exactamente** esta estructura (copiar de DEN y sustituir):

```
<script id="{xxx}-module">
var {XXX}={"items":[...datos...]};
var {xxx}St=JSON.parse(localStorage.getItem('fe_{xxx}_v1')||'{}'),
    {xxx}Sel=null,{xxx}Open=true;

// === INIT: datos precargados del último sync ===
(function(){ /* datos iniciales hardcodeados si los hay */ }());

function {xxx}Save(){localStorage.setItem('fe_{xxx}_v1',JSON.stringify({xxx}St));}
function {xxx}Toggle(){openSector('{xxx}-section');}

function {xxx}RenderList(){
  // 1. Leer filtros (municipio, tipo, fecha, búsqueda, curF)
  // 2. Filtrar {XXX}.items
  // 3. Ordenar por ultimaLlamada DESC
  // 4. Actualizar {xxx}-hdr-count
  // 5. Renderizar HTML con clase {xxx}-item y data-{xxx}id
  // 6. el.onclick con closest('.{xxx}-item') → sel{Xxx}(item.dataset.{xxx}id)
}

function sel{Xxx}(id){
  // Abre la ficha estándar del panel derecho (#det)
  {xxx}Sel=id; window._{xxx}Id=id;
  var fw=document.getElementById('acc-ficha-wrap'); if(fw)fw.style.display='none';
  document.getElementById('empty').style.display='none';
  var det=document.getElementById('det');
  det.classList.add('vis'); det.style.display='flex';
  if(typeof openMobileDet==='function')openMobileDet();
  {xxx}Open2(id);
  {xxx}RenderList();
}

function {xxx}Open2(id){
  // Rellena el panel derecho (#det) con los datos del item
  // OBLIGATORIO incluir al final:
  renderCallsPanel(st, st.ultimaLlamada);  // ← player de audio
}

function {xxx}SetEstado(id,estado){
  if(!{xxx}St[id]){xxx}St[id]={};
  {xxx}St[id].estado=estado;
  {xxx}Save();{xxx}Open2(id);{xxx}RenderList();upStats();
  autoBackupAll();  // ← backup automático
  toast('Estado actualizado','ok');
}

function {xxx}SaveNotas(id,val){...}
function {xxx}SaveContacto(id,val){...}
function {xxx}UpdateField(id,field,val){...}

async function {xxx}Llamar(id){
  // Usa Vapi API con el speech del sector
  // OBLIGATORIO:
  // - customer.number = '+34' + telefono
  // - window._sectorActivePrefix = '{XXX}'
  // - pollCallStatus(rd.id, '{XXX}:'+id)
}

// selMob wrapper (para compatibilidad mobile)
var _sm{Xxx}=window.selMob;
window.selMob=function(id,el){
  if({xxx}Sel){var fw=document.getElementById('acc-ficha-wrap');
    if(fw)fw.style.display='none';{xxx}Sel=null;}
  if(_sm{Xxx})_sm{Xxx}(id,el);
};

// Auto-init
(function {xxx}Init(){
  var l=document.getElementById('{xxx}-list');
  if(l){{xxx}RenderList();}else{setTimeout({xxx}Init,300);}
})();
</script>
```

---

## 5. SPEECH — Template Carla para nuevo sector

```js
var systemPrompt = 
  'Eres CARLA, comercial de la empresa colaboradora de la distribuidora eléctrica de la zona.\n\n'
  +'NEGOCIO: '+t.nombre+' ('+t.municipio+', CP '+t.cp+')\n'
  +'SECTOR: '+t.tipo+'\n\n'
  +'FLUJO DE LA LLAMADA:\n'
  +'1. El sistema ya ha preguntado si habla con el negocio. Si confirman, preséntate:\n'
  +'   Hola, soy Carla, de la empresa colaboradora de la distribuidora eléctrica de su zona.\n'
  +'2. Motivo — [AQUÍ EL SPEECH ESPECÍFICO DEL SECTOR]\n'
  +'3. Si no has conseguido el nombre, pregunta de forma natural.\n'
  +'4. Si el responsable no está, pregunta su nombre y cuándo llamarle.\n\n'
  +'REGLAS ESTRICTAS:\n'
  +'- NUNCA menciones el tipo de negocio después de la primera apertura\n'
  +'- NUNCA digas asesoría energética\n'
  +'- Castellano, trato de usted, máximo 2 frases por turno\n'
  +'- Teléfono si lo piden: seiscientos diecinueve cero doce seiscientos ochenta\n'
  +'- No insistir más de 2 veces si no hay interés\n'
  +'- Buzón de voz: colgar inmediatamente sin dejar mensaje\n'
  +'- [REGLAS ESPECÍFICAS DEL SECTOR]';
```

---

## 6. CHECKLIST FINAL — Verificar antes de deploy

- [ ] `typeof {XXX} !== 'undefined'` — datos cargados
- [ ] `{xxx}RenderList()` — lista se renderiza
- [ ] Click en item → ficha abre (`#det` visible)
- [ ] `d-name` muestra el nombre correcto
- [ ] Botones de resultado cambian el estado
- [ ] Estado se ve en la lista con color correcto
- [ ] `renderCallsPanel()` genera player de audio
- [ ] `{xxx}Llamar()` hace llamada real con Vapi
- [ ] `pollCallStatus()` recibe resultado y actualiza estado
- [ ] `autoBackupAll()` se llama en `{xxx}SetEstado`
- [ ] `showCampaignSummary()` cuenta correctamente el módulo
- [ ] Filtro HOY muestra las llamadas del día
- [ ] `loadFromGitHub()` restaura `fe_{xxx}_v1`
- [ ] Auto-restore al cargar si localStorage vacío
- [ ] 0 surrogates en el JS del módulo (`node --check`)
- [ ] No hay referencias a otros módulos en el script

---

## 7. SECTORES ACTUALES — Para referencia

| Sector | Prefijo | localStorage | Script tag | Speech |
|--------|---------|-------------|-----------|--------|
| Supermercados | SUP | fe_sup_v1 | sup-module | Potencia desajustada |
| Salud/Dental | DEN | fe_den_v1 | den-module | Potencia desajustada |
| Talleres 26 | TAL | fe_tal_v1 | tal-module | Potencia desajustada |
| Administradores | ACC | fe_acc_v1 | acc-module | Colaboración CUPS |
| CP (Códigos Postales) | CP | fe_crm_v2 | script[1] | — |

---

## 8. FLUJO DE TRABAJO CONMIGO — Cuándo añadir un sector nuevo

1. **Me dices**: "quiero añadir [sector]"
2. **Te pregunto**:
   - ¿Tienes el listado de empresas? (CSV, Excel, texto)
   - ¿Cuál es el speech específico para este sector?
   - ¿Qué municipios incluye?
   - ¿Hay alguna regla especial en la llamada?
3. **Yo construyo** el módulo completo
4. **Verifico** los 16 puntos del checklist
5. **Deploy** y prueba en el CRM
6. **Backup** automático con el nuevo sector incluido

---

*Este documento está en el repo: `carboalvaro-dotcom/agente-fe/PROTOCOLO.md`*

---

## 9. SPEECH ESTÁNDAR — Detección de desajuste de potencia

Este es el speech aprobado para **todos los sectores** salvo que se indique lo contrario.

### Presentación
> *"Hola, soy Carla, le llamo de parte de la distribuidora eléctrica de su zona."*

### Motivo (primera frase)
> *"Le llamo para notificarle que hemos identificado que la potencia contratada no está ajustada al consumo real de su establecimiento. Esto puede estar provocando sobrecostes en su factura o incluso riesgo en el suministro. Nosotros nos encargamos de revisarlo y corregirlo sin coste. Son unos diez minutos, ¿le encaja esta semana?"*

### Si el cliente pregunta para qué sirve o duda
> *"Es importante para la optimización de costes en su factura de luz. El desajuste de potencia puede estar afectando su suministro eléctrico ahora mismo, y cuanto antes lo revisemos, antes lo solucionamos sin coste para usted."*

### Si sigue dudando — segunda insistencia
> *"Le llamamos precisamente porque lo hemos detectado en su zona. No es una oferta, es una revisión técnica necesaria."*

### Reglas de tono
- NUNCA decir "asesoría energética"
- NUNCA mencionar el tipo de negocio después de la primera apertura
- NUNCA repetir el nombre del negocio
- Trato de usted, máximo 2 frases por turno
- Insistir en que ES UN PROBLEMA DETECTADO, no una propuesta comercial
- Si no contesta el responsable: preguntar nombre y cuándo llamarle

---

## 10. PREGUNTA OBLIGATORIA AL AÑADIR NUEVO SECTOR

Cuando Álvaro diga "quiero añadir [sector]", ANTES de construir nada preguntar:

> **"¿Quieres usar el speech estándar de detección de desajuste de potencia, o tienes un speech específico para este sector?"**

Si dice "el estándar" → usar el template de la sección 9 tal cual, solo adaptar el nombre del sector en las variables.

Si tiene uno propio → construirlo según sus indicaciones respetando las reglas de tono.


---

## 11. PASOS EXTRA OBLIGATORIOS — Fácil de olvidar

Estos pasos NO están en la sección 3 del checklist técnico pero son OBLIGATORIOS:

### 11.1 openSector — array en acc-module
El módulo `acc-module` define su propia función `openSector` con un array de secciones.
**SIEMPRE añadir `'{xxx}-section'` a ese array.**

```js
// En acc-module, función openSector:
// ANTES:
['{prev}','tal-section','sup-section','den-section']
// DESPUÉS:
['{prev}','{xxx}-section','tal-section','sup-section','den-section']
```

Si no se hace: el acordeón del nuevo sector NO abre al hacer click.

### 11.1b runNextCampaignCall — CRÍTICO
**EL MÁS IMPORTANTE Y EL MÁS FÁCIL DE OLVIDAR.**

Añadir bloque `if(id.startsWith('{XXX}:'))` en `runNextCampaignCall`.
Si no se hace: la campaña muestra "Campaña completada" inmediatamente sin hacer ninguna llamada.

```js
// Copiar bloque SUP y sustituir SUP→{XXX}:
if(typeof id==='string'&&id.startsWith('{XXX}:')){
  const {xxx}IdC=id.substring(4);
  const items=typeof {XXX}!=='undefined'&&{XXX}.{items}?{XXX}.{items}:[];
  const tX=items.find(function(x){return x.id==={xxx}IdC;});
  if(!tX||!tX.telefono){campaignIdx++;runNextCampaignCall();return;}
  // ... progress bar ...
  {xxx}Sel={xxx}IdC; window._{xxx}Id={xxx}IdC;
  try{{xxx}Open2({xxx}IdC);}catch(e){}
  await {xxx}Llamar({xxx}IdC);
  await new Promise(r=>{campaignTimer=setTimeout(r,60000);});
  campaignIdx++;updateCampLiveStats();
  if(campaignRunning&&!campaignPaused){...await 45s...}
  runNextCampaignCall();return;
}
```

### 11.2 Campaña — getCampaignOrder
Añadir bloque `if(cpFilter==='{XXX}')` en `getCampaignOrder` siguiendo el patrón de SUP/DEN/TAL.

### 11.3 Campaña — select camp-cp
Añadir `<option value="{XXX}">{emoji} {Nombre} (todos)</option>` en el select `id="camp-cp"`.

### 11.4 Campaña — showCampaignSummary
Añadir bloque `isXxx` y su `else if` (ya cubierto en sección 3 pero repetido aquí por su importancia).

---

## 12. CHECKLIST FINAL COMPLETO — 20 puntos antes de deploy

Añadir estos 4 puntos al checklist de la sección 6:

- [ ] `'{xxx}-section'` añadido al array en `openSector` de **acc-module**
- [ ] Bloque `if(cpFilter==='{XXX}')` en `getCampaignOrder`
- [ ] `<option value="{XXX}">` en select `id="camp-cp"`
- [ ] Campaña completada muestra resumen correcto en `showCampaignSummary`

