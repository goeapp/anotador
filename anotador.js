/* ============================================================
   anotador.js — v1.0.0 (13-nov-2026) · subir como anotador.js al repo goeapp/anotador
   Suma el Anotador a cualquier PWA del stack con una línea + una llamada:

     <script src="https://goeapp.github.io/anotador/anotador.js"></script>
     Anotador.iniciar({ sb, pwa: 'valedigital', despuesDe: '#btn-lapiz-toggle',
                        obra: () => ..., vale: () => ... });

   · Compu: el botón abre el Anotador completo (v1.2.0+) en una ventana sobre la PWA.
     La PWA le presta su sesión de Supabase: le pasa el token y es la ÚNICA que lo renueva
     (si renovaran las dos, la base puede cerrar la sesión por seguridad).
   · Celular (≤ 560 px): abre la LIBRETA dentro de la PWA: lista de notas (más nuevas primero)
     y un campo para anotar. Nota simple: amarilla, queda anclada sola, sin etiquetas
     (las automáticas, PWA y obra, se guardan igual). Sin señal: se guarda en el equipo y
     se sube sola.
   · Todo vive en este archivo: si se mejora, se actualiza en todas las PWA a la vez.
   ============================================================ */
(function () {
  'use strict';
  if (window.Anotador) return;
  const VERSION = 'v1.0.0';
  const BASE = 'https://goeapp.github.io/anotador/';
  const ORIGEN = new URL(BASE).origin;
  const CEL = window.matchMedia ? window.matchMedia('(max-width: 560px)') : { matches: false };
  const TZ = 'America/Argentina/Buenos_Aires';
  let op = null, sb = null, iframe = null, overlay = null, listo = false, abierto = false, libreta = null;

  // ── utilidades ──
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').trim().replace(/^#+/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9_\-]/g, '');
  const valor = v => { try { return typeof v === 'function' ? v() : v; } catch (e) { return null; } };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const fmtD = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: 'numeric', month: 'short' });
  const fmtH = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const fecha = iso => { const d = new Date(iso); return fmtD.format(d).replace('.', '') + ' · ' + fmtH.format(d); };
  const leer = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin storage */ } };
  const ICONO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/></svg>';
  const ATRAS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M5 12l6 6"/><path d="M5 12l6 -6"/></svg>';
  const NUBE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1"/><path d="M12 13v9"/><path d="M9 16l3 -3l3 3"/></svg>';

  function contexto() {
    const obra = valor(op.obra), vale = valor(op.vale);
    return { pwa: op.pwa, obra: obra ? String(obra) : null, vale: vale ? String(vale) : null, volver: valor(op.volver) || location.href };
  }
  async function sesion() {
    try { const r = await sb.auth.getSession(); return r && r.data && r.data.session; } catch (e) { return null; }
  }
  function actividad(evento, objeto) {
    try {
      if (!navigator.onLine) return;
      sb.from('goe_actividad').insert({ app: 'an', evento, objeto: objeto || null, resultado: 'OK', detalle: { pwa: op.pwa, via: 'anotador.js ' + VERSION } })
        .then(r => { if (r && r.error) console.warn('[anotador] actividad', r.error.message); }, () => { });
    } catch (e) { /* nunca frena la PWA */ }
  }

  // ── estilos (todo con prefijo an-) ──
  function estilos() {
    const css = `
.an-btn { display:inline-flex; align-items:center; gap:6px; }
.an-ov { position:fixed; inset:0; z-index:99000; background:rgba(15,23,42,.55); display:none; align-items:center; justify-content:center; }
.an-ov.an-vis { display:flex; animation:an-entra .18s ease-out; }
.an-ov iframe { width:min(1280px, 94vw); height:min(880px, 92vh); border:0; border-radius:16px; box-shadow:0 30px 80px rgba(0,0,0,.45); background:#f8fafc; }
@keyframes an-entra { from { opacity:0; } to { opacity:1; } }
.an-lib { position:fixed; inset:0; z-index:99000; background:#f8fafc; display:none; flex-direction:column; font-family:'DM Sans', system-ui, sans-serif; color:#1e293b; }
.an-lib.an-vis { display:flex; animation:an-sube .2s ease-out; }
@keyframes an-sube { from { transform:translateY(16px); opacity:0; } to { transform:none; opacity:1; } }
.an-lib-cab { background:#0f172a; display:flex; align-items:center; gap:6px; padding:6px 10px 6px 4px; padding-top:calc(6px + env(safe-area-inset-top)); }
.an-lib-cab button { width:44px; height:44px; border:0; background:transparent; color:#fff; display:inline-flex; align-items:center; justify-content:center; }
.an-lib-tit { font-family:'Bebas Neue', sans-serif; font-size:1.55rem; letter-spacing:.4px; color:#d97706; flex:1; display:flex; align-items:center; gap:6px; }
.an-lib-senal { font-size:.72rem; font-weight:700; background:#fef2f2; color:#991b1b; border:1px solid #fecaca; border-radius:99px; padding:2px 9px; }
.an-lib-nueva { padding:12px; display:flex; flex-direction:column; gap:8px; border-bottom:1px solid #e2e8f0; background:#fff; }
.an-lib-nueva textarea { width:100%; min-height:76px; resize:none; border:1px solid #eab308; background:#fef9c3; border-radius:6px 6px 6px 16px; padding:10px 12px; font:inherit; font-size:1rem; line-height:1.5; color:#1e293b; outline:none; box-sizing:border-box; }
.an-lib-nueva textarea:focus { box-shadow:0 0 0 2px rgba(217,119,6,.35); }
.an-lib-fila { display:flex; align-items:center; gap:10px; }
.an-lib-fila .an-lib-msg { flex:1; font-size:.78rem; color:#475569; }
.an-lib-listo { border:1px solid #92400e; background:#d97706; color:#fff; border-radius:8px; padding:0 22px; height:44px; font:inherit; font-weight:700; font-size:.9rem; }
.an-lib-listo:disabled { opacity:.45; }
.an-lib-lista { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:10px; padding-bottom:calc(16px + env(safe-area-inset-bottom)); }
.an-lib-nota { background:#fef9c3; border:1px solid #eab308; border-radius:5px 5px 5px 14px; padding:10px 12px 8px; box-shadow:0 1px 3px rgba(15,23,42,.10); text-align:left; font:inherit; color:inherit; width:100%; }
.an-lib-nota.c-verde { background:#dcfce7; border-color:#4ade80; } .an-lib-nota.c-rosa { background:#fce7f3; border-color:#f472b6; }
.an-lib-nota.c-celeste { background:#e0f2fe; border-color:#38bdf8; } .an-lib-nota.c-naranja { background:#ffedd5; border-color:#fb923c; } .an-lib-nota.c-lila { background:#f3e8ff; border-color:#c084fc; }
.an-lib-txt { font-size:.92rem; line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }
.an-lib-nota.an-abierta .an-lib-txt { -webkit-line-clamp:unset; display:block; }
.an-lib-pie { font-size:.72rem; color:#475569; margin-top:6px; display:flex; align-items:center; gap:6px; }
.an-lib-pie .an-pend { color:#b45309; display:inline-flex; }
.an-lib-vacio, .an-lib-nota-pie { font-size:.82rem; color:#64748b; text-align:center; padding:18px 10px; }
.an-entra { animation:an-sube .25s ease-out; }
@media (prefers-reduced-motion: reduce) { .an-ov.an-vis, .an-lib.an-vis, .an-entra { animation:none; } }`;
    const st = document.createElement('style'); st.id = 'an-estilos'; st.textContent = css; document.head.appendChild(st);
  }

  // ── botón en el encabezado ──
  function boton() {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'an-btn';
    b.className = (op.claseBoton || 'hdr-btn') + ' an-btn';
    b.title = 'Anotador — tus notas'; b.setAttribute('aria-label', 'Anotador');
    b.innerHTML = ICONO + '<span class="an-btn-txt">Anotador</span>';
    b.addEventListener('click', abrir);
    const ref = op.despuesDe && document.querySelector(op.despuesDe);
    if (ref && ref.parentNode) ref.parentNode.insertBefore(b, ref.nextSibling);
    else (document.querySelector(op.contenedor || 'header') || document.body).appendChild(b);
  }

  // ══════════ COMPU: ventana con el Anotador completo ══════════
  function crearVentana() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.className = 'an-ov'; overlay.id = 'an-ventana';
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', 'Anotador');
    iframe = document.createElement('iframe');
    iframe.title = 'Anotador';
    iframe.src = BASE + '?embed=1&pwa=' + encodeURIComponent(op.pwa);
    overlay.appendChild(iframe);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) cerrar(); });
    document.body.appendChild(overlay);
  }
  async function mandarSesion() {
    if (!iframe || !listo) return;
    const s = await sesion();
    if (s && s.access_token) iframe.contentWindow.postMessage({ tipo: 'an-sesion', access_token: s.access_token }, ORIGEN);
  }
  function mandarContexto(extra) {
    if (iframe && listo) iframe.contentWindow.postMessage(Object.assign({ tipo: 'an-contexto' }, contexto(), extra || {}), ORIGEN);
  }
  window.addEventListener('message', e => {
    if (e.origin !== ORIGEN || !iframe || e.source !== iframe.contentWindow) return;
    const d = e.data || {};
    if (d.tipo === 'an-listo') { listo = true; mandarContexto(); mandarSesion(); }
    else if (d.tipo === 'an-pedir-sesion') mandarSesion();
    else if (d.tipo === 'an-cerrar') cerrar();
    else if (d.tipo === 'an-ir' && d.url && /^https?:\/\//i.test(d.url)) { cerrar(); if (d.url !== location.href) location.href = d.url; }
  });
  function abrirVentana() {
    crearVentana();
    mandarContexto(); mandarSesion();
    overlay.classList.add('an-vis'); abierto = true;
    setTimeout(() => { try { iframe.focus(); } catch (e) { /* nada */ } }, 50);
    actividad('abrir', 'ventana');
  }

  // ══════════ CELULAR: libreta simple ══════════
  let uid = null, notasLib = [], colaLib = [];
  const kNotas = () => 'an_libreta_' + uid, kCola = () => 'an_libreta_cola_' + uid;
  function crearLibreta() {
    if (libreta) return;
    libreta = document.createElement('div'); libreta.className = 'an-lib'; libreta.id = 'an-libreta';
    libreta.setAttribute('role', 'dialog'); libreta.setAttribute('aria-label', 'Anotador');
    libreta.innerHTML =
      '<div class="an-lib-cab"><button type="button" class="an-lib-atras" aria-label="Volver">' + ATRAS + '</button>' +
      '<span class="an-lib-tit">' + ICONO + ' ANOTADOR</span><span class="an-lib-senal" hidden>Sin señal</span></div>' +
      '<div class="an-lib-nueva"><textarea class="an-lib-in" placeholder="Anotá algo…" aria-label="Nota nueva"></textarea>' +
      '<div class="an-lib-fila"><span class="an-lib-msg"></span><button type="button" class="an-lib-listo" disabled>Listo</button></div></div>' +
      '<div class="an-lib-lista" aria-live="polite"></div>';
    document.body.appendChild(libreta);
    const ta = libreta.querySelector('.an-lib-in'), bt = libreta.querySelector('.an-lib-listo');
    ta.addEventListener('input', () => { bt.disabled = !ta.value.trim(); });
    bt.addEventListener('click', anotar);
    libreta.querySelector('.an-lib-atras').addEventListener('click', () => history.back());
    libreta.querySelector('.an-lib-lista').addEventListener('click', e => { const n = e.target.closest('.an-lib-nota'); if (n) n.classList.toggle('an-abierta'); });
  }
  function pintarLibreta(nuevoId) {
    if (!libreta) return;
    libreta.querySelector('.an-lib-senal').hidden = navigator.onLine;
    const pend = new Set(colaLib.map(f => f.id));
    const lista = notasLib.slice().sort((a, b) => Date.parse(b.creada) - Date.parse(a.creada));
    libreta.querySelector('.an-lib-lista').innerHTML = lista.length
      ? lista.map(n => '<button type="button" class="an-lib-nota c-' + esc(n.color || 'amarillo') + (n.id === nuevoId ? ' an-entra' : '') + '">' +
          '<div class="an-lib-txt">' + esc(n.texto) + '</div>' +
          '<div class="an-lib-pie">' + fecha(n.creada) + (pend.has(n.id) ? ' <span class="an-pend" title="Falta subir">' + NUBE + '</span>' : '') + '</div></button>').join('') +
        '<div class="an-lib-nota-pie">Las notas completas, con colores y etiquetas, en la compu.</div>'
      : '<div class="an-lib-vacio">Todavía no hay notas. Escribí arriba y tocá Listo.</div>';
  }
  async function cargarLibreta() {
    notasLib = leer(kNotas(), []); colaLib = leer(kCola(), []);
    pintarLibreta();
    await subirLibreta();
    if (!navigator.onLine) return;
    try {
      const r = await sb.from('an_notas').select('id, texto, color, creada, borrada_at').is('borrada_at', null).order('creada', { ascending: false }).limit(100);
      if (r.error) throw r.error;
      const pend = new Set(colaLib.map(f => f.id));
      notasLib = (r.data || []).filter(n => !n.borrada_at && (n.texto || '').trim()).concat(notasLib.filter(n => pend.has(n.id) && !(r.data || []).some(x => x.id === n.id)));
      guardar(kNotas(), notasLib);
      pintarLibreta();
    } catch (e) { console.warn('[anotador] libreta', e && e.message); }
  }
  async function subirLibreta() {
    if (!colaLib.length || !navigator.onLine) return;
    const filas = colaLib.slice();
    try {
      const r = await sb.from('an_notas').upsert(filas, { onConflict: 'id' });
      if (r.error) throw r.error;
      const ya = new Set(filas.map(f => f.id));
      colaLib = colaLib.filter(f => !ya.has(f.id)); guardar(kCola(), colaLib);
      pintarLibreta();
    } catch (e) { console.warn('[anotador] subir', e && e.message); }
  }
  function anotar() {
    const ta = libreta.querySelector('.an-lib-in'), texto = ta.value.trim();
    if (!texto) return;
    const c = contexto();
    const fila = {
      id: uuid(), texto, color: 'amarillo', anclada: true, luz: false,
      etiquetas: [], etiquetas_auto: Array.from(new Set([norm(c.pwa), norm(c.obra)].filter(Boolean))).sort(),
      pwa: norm(c.pwa) || null, obra: c.obra, vale: c.vale, origen_url: c.volver, creada: new Date().toISOString(), borrada_at: null
    };
    notasLib.unshift({ id: fila.id, texto, color: 'amarillo', creada: fila.creada });
    colaLib.push(fila);
    guardar(kNotas(), notasLib); guardar(kCola(), colaLib);
    ta.value = ''; libreta.querySelector('.an-lib-listo').disabled = true;
    const msg = libreta.querySelector('.an-lib-msg');
    msg.textContent = navigator.onLine ? 'Anotada' : 'Anotada en este equipo: se sube sola';
    setTimeout(() => { msg.textContent = ''; }, 2500);
    pintarLibreta(fila.id);
    actividad('libreta_nota', fila.id);
    subirLibreta();
  }
  async function abrirLibreta() {
    const s = await sesion();
    if (!s) { alert('Para usar el Anotador, primero entrá a la app.'); return; }
    uid = s.user && s.user.id;
    crearLibreta();
    libreta.classList.add('an-vis'); abierto = true;
    document.documentElement.style.overflow = 'hidden';
    try { history.pushState({ anotador: 1 }, ''); } catch (e) { /* nada */ }
    cargarLibreta();
    actividad('abrir', 'libreta');
  }
  window.addEventListener('online', () => { if (libreta) { pintarLibreta(); subirLibreta(); } });
  window.addEventListener('offline', () => { if (libreta) pintarLibreta(); });
  window.addEventListener('popstate', () => { if (libreta && libreta.classList.contains('an-vis')) cerrar(true); });

  // ── abrir / cerrar ──
  function abrir() { if (CEL.matches) abrirLibreta(); else abrirVentana(); }
  function cerrar(porAtras) {
    abierto = false;
    if (overlay) overlay.classList.remove('an-vis');
    if (libreta && libreta.classList.contains('an-vis')) {
      libreta.classList.remove('an-vis'); document.documentElement.style.overflow = '';
      if (!porAtras && history.state && history.state.anotador) { try { history.back(); } catch (e) { /* nada */ } }
    }
    const b = document.getElementById('an-btn'); if (b && !CEL.matches) b.focus();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && abierto && overlay && overlay.classList.contains('an-vis')) { e.stopPropagation(); cerrar(); } }, true);

  // ── API ──
  window.Anotador = {
    version: VERSION,
    iniciar(opciones) {
      op = Object.assign({ pwa: 'app', claseBoton: 'hdr-btn' }, opciones || {});
      op.pwa = norm(op.pwa) || 'app';
      sb = op.sb;
      if (!sb || !sb.auth || !sb.from) { console.warn('[anotador] falta sb (el cliente de Supabase de la PWA)'); return; }
      if (document.getElementById('an-btn')) return;
      estilos(); boton();
      // La PWA es la única que renueva la sesión: cuando cambia, se la pasa al Anotador
      try { sb.auth.onAuthStateChange((ev, s) => { if (s && s.access_token && iframe && listo) iframe.contentWindow.postMessage({ tipo: 'an-sesion', access_token: s.access_token }, ORIGEN); }); } catch (e) { /* nada */ }
      // Compu: precargar la ventana para que abra rápido
      if (!CEL.matches) setTimeout(crearVentana, op.precargarMs == null ? 1500 : op.precargarMs);
    },
    abrir, cerrar,
    contexto: () => (op ? contexto() : null)
  };
})();
