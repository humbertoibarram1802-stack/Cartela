/* Cartela · app.js
   PWA sin dependencias. Rutas por hash, datos por museo en data/<id>/catalogo.json,
   descarga de "paquetes" (JSON + imágenes) a Cache Storage para uso sin conexión. */

const MUSEOS = [
  { id: 'prado',      skin: 'prado',      nombre: 'Museo del Prado',          corto: 'Museo del Prado',         en: 'en el Prado',       ciudad: 'Madrid',    theme: '#7A1F2B' },
  { id: 'reinasofia', skin: 'reinasofia', nombre: 'Museo Reina Sofía',        corto: 'Reina Sofía',             en: 'en el Reina Sofía', ciudad: 'Madrid',    theme: '#F7F7F5' },
  { id: 'uffizi',     skin: 'uffizi',     nombre: 'Galleria degli Uffizi',    corto: 'Galleria degli Uffizi',   en: 'en los Uffizi',     ciudad: 'Florencia', theme: '#6E7B86' },
  { id: 'accademia',  skin: 'accademia',  nombre: 'Galleria dell’Accademia',  corto: 'Galleria dell’Accademia', en: 'en la Accademia',   ciudad: 'Florencia', theme: '#E3E2DD' },
];
const NIVELES = {
  completa: 'Ficha completa',
  oficial:  'Basada en la ficha oficial',
  tecnica:  'Ficha técnica',
};

const $app = document.getElementById('app');
const catalogos = {};           // id -> datos cargados
const state = { q: '' };

/* ---------- utilidades ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
// "012" → "Sala 012"; "10–14" → "Salas 10–14"; "Tribuna del David" → tal cual
const salaLabel = s => { s = String(s ?? ''); if (!/^\d/.test(s)) return s; return (/[–-]/.test(s) ? 'Salas ' : 'Sala ') + s; };
const nowrap = t => `<span class="nowrap">${esc(t)}</span>`;
// "Sevilla, 1599 – Madrid, 1660"; años aproximados como "c. 1488"
const fechaVida = d => d ? [d.lugar, d.anio != null ? (d.anio_aprox ? 'c. ' + d.anio : String(d.anio)) : null].filter(Boolean).join(', ') : '';
const vida = a => a ? `${esc(fechaVida(a.nacimiento))}${a.muerte ? ' – ' + esc(fechaVida(a.muerte)) : ''}` : '';
const ICON = {
  back:   '<svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  chev:   '<svg class="ic chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  search: '<svg class="ic" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  room:   '<svg class="ic" viewBox="0 0 24 24"><path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6"/></svg>',
  person: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>',
  star:   '<svg class="ic" viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  starOn: '<svg class="ic" viewBox="0 0 24 24" style="fill:currentColor"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  down:   '<svg class="ic" viewBox="0 0 24 24"><path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"/></svg>',
  check:  '<svg class="ic" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>',
};
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
}
function setSkin(skin, theme) {
  document.documentElement.dataset.skin = skin || '';
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = theme || '#151414';
}
function go(hash) { location.hash = hash; }

/* ---------- favoritos ---------- */
const favKey = id => `cartela:fav:${id}`;
function getFavs(mid) { try { return JSON.parse(localStorage.getItem(favKey(mid)) || '[]'); } catch { return []; } }
function toggleFav(mid, oid) {
  const f = getFavs(mid); const i = f.indexOf(oid);
  i >= 0 ? f.splice(i, 1) : f.push(oid);
  try { localStorage.setItem(favKey(mid), JSON.stringify(f)); } catch {}
  return i < 0;
}

/* ---------- datos ---------- */
async function loadCatalogo(mid) {
  if (catalogos[mid]) return catalogos[mid];
  const res = await fetch(`data/${mid}/catalogo.json`);
  if (!res.ok) throw new Error(`No se pudo cargar el catálogo de ${mid}`);
  const data = await res.json();
  data.obras = data.obras || []; data.artistas = data.artistas || [];
  data.byId = Object.fromEntries(data.obras.map(o => [o.id, o]));
  data.artistaById = Object.fromEntries(data.artistas.map(a => [a.id, a]));
  catalogos[mid] = data; return data;
}
const imgUrl = (mid, o) => o.imagen ? `data/${mid}/${o.imagen}` : '';

/* ---------- paquetes offline ---------- */
const packKey = id => `cartela:pack:${id}`;
function packStatus(mid) { try { return JSON.parse(localStorage.getItem(packKey(mid)) || 'null'); } catch { return null; } }
async function downloadPack(mid, onProgress) {
  if (!('caches' in window)) throw new Error('Este navegador no permite guardar sin conexión.');
  const data = await loadCatalogo(mid);
  const cache = await caches.open(`cartela-pack-${mid}`);
  const urls = [`data/${mid}/catalogo.json`, ...data.obras.map(o => imgUrl(mid, o)).filter(Boolean)];
  let done = 0, failed = 0;
  const lote = 6;
  for (let i = 0; i < urls.length; i += lote) {
    await Promise.all(urls.slice(i, i + lote).map(async u => {
      try {
        if (!(await cache.match(u))) { const r = await fetch(u); if (r.ok) await cache.put(u, r); else failed++; }
      } catch { failed++; }
      done++; onProgress?.(done, urls.length);
    }));
  }
  const status = { fecha: new Date().toISOString(), archivos: urls.length - failed, fallidos: failed, obras: data.obras.length };
  try { localStorage.setItem(packKey(mid), JSON.stringify(status)); } catch {}
  return status;
}

/* ---------- vistas ---------- */
function vHome() {
  setSkin('', '#151414');
  return `<section class="screen home">
    <div class="brand">
      <div class="eyebrow">Tu guía, sin conexión</div>
      <h1>Cartela</h1>
      <p>Elige un museo. Cada guía se descarga una vez y queda en tu teléfono.</p>
    </div>
    <div class="tiles">
      ${MUSEOS.map(m => {
        const st = packStatus(m.id);
        return `<a class="tile tile-${m.id}" href="#/m/${m.id}">
          <div><div class="city">${esc(m.ciudad)}</div><div class="name">${esc(m.corto)}</div></div>
          <div class="state">${st ? `<span class="dot"></span>Guía descargada · ${plural(st.obras, 'obra', 'obras')}` : `${ICON.down}Descargar guía`}</div>
        </a>`; }).join('')}
    </div>
  </section>`;
}

function head(m, backHash, backLabel, title, metaHtml) {
  return `<header class="head">
    <div class="top">
      <a class="back tap" href="${backHash}">${ICON.back}<span>${esc(backLabel)}</span></a>
    </div>
    ${title ? `<h1 class="display">${title}</h1>` : ''}
    ${metaHtml || ''}
  </header>`;
}

function workCard(m, o) {
  const src = imgUrl(m.id, o);
  return `<a class="work-card" href="#/m/${m.id}/obra/${encodeURIComponent(o.id)}">
    ${src ? `<img class="img" src="${src}" alt="" loading="lazy">` : '<div class="img"></div>'}
    <div class="t"><b>${esc(o.titulo)}</b><span>${esc(o.autor)}${o.fecha ? ' · ' + nowrap(o.fecha) : ''}</span>${o.sala ? `<small>${esc(salaLabel(o.sala))}</small>` : ''}</div>
  </a>`;
}
function workRow(m, o) {
  const src = imgUrl(m.id, o);
  return `<a class="row" href="#/m/${m.id}/obra/${encodeURIComponent(o.id)}">
    ${src ? `<img class="th" src="${src}" alt="" loading="lazy">` : '<div class="th"></div>'}
    <div class="t txt"><b>${esc(o.titulo)}</b><span>${esc(o.autor)}${o.fecha ? ' · ' + nowrap(o.fecha) : ''}</span></div>
    ${o.sala ? `<div class="sala">${esc(salaLabel(o.sala))}</div>` : ''}
  </a>`;
}

function vMuseo(m, data) {
  setSkin(m.skin, m.theme);
  const st = packStatus(m.id);
  const imperdibles = data.obras.filter(o => o.imperdible).slice(0, 12);
  const meta = st
    ? `<div class="meta"><span class="dot"></span>Guía descargada · funciona sin conexión</div>`
    : `<div class="meta">${plural(data.obras.length, 'obra', 'obras')} en el catálogo</div>`;
  return `<section class="screen">
    ${head(m, '#/', 'Museos', esc(m.nombre), meta)}
    <form class="search" id="searchForm" role="search">${ICON.search}<input id="q" type="search" placeholder="Busca por obra, artista o sala" autocomplete="off" aria-label="Buscar"></form>
    ${st ? '' : `<div class="pack" id="pack">
      <div class="l"><div><b>Guía sin conexión</b><br><small>${plural(data.obras.length, 'obra', 'obras')} con imagen y ficha</small></div><button class="btn" id="dl">Descargar</button></div>
      <div class="bar" hidden><i></i></div>
    </div>`}
    ${imperdibles.length ? `<h2 class="section-title">Imperdibles</h2><div class="strip">${imperdibles.map(o => workCard(m, o)).join('')}</div>` : ''}
    <h2 class="section-title">Explora</h2>
    <nav class="list pad-b">
      <a class="row" href="#/m/${m.id}/salas"><div class="ico">${ICON.room}</div><div class="txt"><b>Por sala</b><span>Encuentra la obra que tienes enfrente</span></div>${ICON.chev}</a>
      <a class="row" href="#/m/${m.id}/artistas"><div class="ico">${ICON.person}</div><div class="txt"><b>Por artista</b><span>${esc(data.artistas.slice(0, 5).map(a => a.nombre).join(', '))}${data.artistas.length > 5 ? '…' : ''}</span></div>${ICON.chev}</a>
      <a class="row" href="#/m/${m.id}/favoritos"><div class="ico">${ICON.star}</div><div class="txt"><b>Mis favoritas</b><span>Las que marques durante la visita</span></div>${ICON.chev}</a>
      <a class="row" href="#/m/${m.id}/todas"><div class="ico">${ICON.search}</div><div class="txt"><b>Todas las obras</b><span>${plural(data.obras.length, 'obra', 'obras')} en orden alfabético</span></div>${ICON.chev}</a>
    </nav>
  </section>`;
}

function vLista(m, data, titulo, obras, sub, vacio) {
  setSkin(m.skin, m.theme);
  return `<section class="screen">
    ${head(m, `#/m/${m.id}`, m.nombre, esc(titulo))}
    ${sub && obras.length ? `<div class="count">${sub}</div>` : ''}
    <div class="list pad-b">${obras.length ? obras.map(o => workRow(m, o)).join('') : `<p class="empty">${vacio || 'No hay obras aquí todavía.'}</p>`}</div>
  </section>`;
}

function vSalas(m, data) {
  setSkin(m.skin, m.theme);
  const salas = {};
  data.obras.forEach(o => { if (o.sala) (salas[o.sala] = salas[o.sala] || []).push(o); });
  const keys = Object.keys(salas).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  return `<section class="screen">
    ${head(m, `#/m/${m.id}`, m.nombre, 'Por sala')}
    <div class="count">${plural(keys.length, 'sala', 'salas')} con obras en el catálogo</div>
    <nav class="list pad-b">${keys.map(k => `<a class="row" href="#/m/${m.id}/sala/${encodeURIComponent(k)}"><div class="ico">${ICON.room}</div><div class="txt"><b>${esc(salaLabel(k))}</b><span>${plural(salas[k].length, 'obra', 'obras')} · ${esc(salas[k].slice(0, 3).map(o => o.autor).filter((v, i, a) => a.indexOf(v) === i).join(', '))}</span></div>${ICON.chev}</a>`).join('')}</nav>
  </section>`;
}

function vArtistas(m, data) {
  setSkin(m.skin, m.theme);
  const n = {}; data.obras.forEach(o => { if (o.autor_id) n[o.autor_id] = (n[o.autor_id] || 0) + 1; });
  const arts = [...data.artistas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return `<section class="screen">
    ${head(m, `#/m/${m.id}`, m.nombre, 'Por artista')}
    <div class="count">${plural(arts.length, 'artista', 'artistas')}</div>
    <nav class="list pad-b">${arts.map(a => `<a class="row" href="#/m/${m.id}/artista/${encodeURIComponent(a.id)}"><div class="ico">${ICON.person}</div><div class="txt"><b>${esc(a.nombre)}</b><span>${plural(n[a.id] || 0, 'obra', 'obras')} en este museo</span></div>${ICON.chev}</a>`).join('')}</nav>
  </section>`;
}

function vObra(m, data, o) {
  setSkin(m.skin, m.theme);
  const src = imgUrl(m.id, o);
  const fav = getFavs(m.id).includes(o.id);
  const a = o.autor_id ? data.artistaById[o.autor_id] : null;
  const tech = [o.tecnica, o.dimensiones].filter(Boolean).join(' · ');
  const loc = [o.sala ? salaLabel(o.sala) : null, o.num_catalogo ? (/^(inv|n\.|cat|reg)/i.test(o.num_catalogo) ? o.num_catalogo : `Cat. ${o.num_catalogo}`) : null].filter(Boolean).join(' · ');
  const nivel = NIVELES[o.nivel] || NIVELES.tecnica;
  const fuente = o.fuente_principal ? `<br>Fuente: ${esc(o.fuente_principal)}` : '';
  // Párrafos: respeta saltos de línea; un bloque largo (texto oficial) se parte cada ~3 oraciones para leer de pie.
  const trocear = p => { if (p.length < 650) return [p]; const fr = p.match(/[^.!?]+[.!?]+(\s|$)/g) || [p]; const out = []; let cur = ''; for (const f of fr) { cur += f; if (cur.length > 450) { out.push(cur.trim()); cur = ''; } } if (cur.trim()) out.push(cur.trim()); return out; };
  const parrafos = t => (t || '').split(/\n+/).filter(Boolean).flatMap(trocear).map(p => `<p>${esc(p)}</p>`).join('');
  return `<article class="screen">
    <div class="hero">
      ${src ? `<img src="${src}" alt="${esc(o.titulo)}">` : '<div style="height:200px"></div>'}
      <div class="bar">
        <a class="btn" href="#/m/${m.id}" aria-label="Volver">${ICON.back}</a>
        <button class="btn ${fav ? 'on' : ''}" id="fav" aria-pressed="${fav}" aria-label="${fav ? 'Quitar de favoritas' : 'Guardar en favoritas'}">${fav ? ICON.starOn : ICON.star}</button>
      </div>
    </div>
    <div class="body">
      <div class="cartela">
        <h1 class="display title">${esc(o.titulo)}</h1>
        ${o.titulo_original && norm(o.titulo_original) !== norm(o.titulo) ? `<div class="orig">${esc(o.titulo_original)}</div>` : ''}
        <div class="author">${esc(o.autor)}${o.fecha ? ' · ' + esc(o.fecha) : ''}</div>
        <div class="tech">${tech ? `<b>${esc(o.tecnica || '')}</b>${o.dimensiones ? ' · ' + esc(o.dimensiones) : ''}` : ''}${loc ? `<br>${esc(loc)}` : ''}${fuente}</div>
        <div class="level"><span class="d"></span>${nivel}</div>
      </div>
      ${o.que_ves ? `<h4>Qué estás viendo</h4>${parrafos(o.que_ves)}` : ''}
      ${o.historia ? `<h4>Historia</h4>${parrafos(o.historia)}` : ''}
      ${o.fun_fact ? `<div class="fun"><h4>Fun fact</h4>${parrafos(o.fun_fact)}</div>` : ''}
      ${!o.que_ves && !o.historia && o.texto_oficial ? `<h4>Sobre la obra</h4>${parrafos(o.texto_oficial)}` : ''}
      ${a ? `<a class="artist-card" href="#/m/${m.id}/artista/${encodeURIComponent(a.id)}"><div class="av">${esc(a.nombre[0])}</div><div class="txt"><b>${esc(a.nombre)}</b><span>${vida(a)}</span></div>${ICON.chev}</a>` : ''}
      ${o.fuentes?.length ? `<div class="sources">Fuentes: ${[...new Map(o.fuentes.map(f => [f.startsWith('http') ? f.replace(/^https?:\/\//, '').split('/')[0] : f, f])).entries()].map(([h, f]) => f.startsWith('http') ? `<a href="${esc(f)}" target="_blank" rel="noopener">${esc(h)}</a>` : esc(f)).join(' · ')}</div>` : ''}
    </div>
  </article>`;
}

function vArtista(m, data, a, backHash, backLabel) {
  setSkin(m.skin, m.theme);
  const obras = data.obras.filter(o => o.autor_id === a.id).sort((x, y) => String(x.fecha_orden ?? x.fecha ?? '').localeCompare(String(y.fecha_orden ?? y.fecha ?? ''), 'es', { numeric: true }));
  const dates = vida(a);
  return `<section class="screen">
    ${head(m, backHash, backLabel, '', `<div class="eyebrow" style="color:var(--head-ink2);margin-top:10px">Artista</div><h1 class="display" style="font-style:normal">${esc(a.nombre)}</h1>${a.nombre_completo && a.nombre_completo !== a.nombre ? `<div class="dates" style="margin-top:6px">${esc(a.nombre_completo)}</div>` : ''}<div class="dates">${dates}</div>`)}
    <div class="body">
      ${a.bio ? `<h4>En breve</h4>${a.bio.split(/\n+/).map(p => `<p>${esc(p)}</p>`).join('')}` : ''}
      ${a.obras_clave_otros?.length ? `<h4>Obras clave en otros museos</h4><p>${esc(a.obras_clave_otros.join(' · '))}</p>` : ''}
      <h4>Sus obras ${esc(m.en)}</h4>
    </div>
    <div class="list pad-b" style="margin-top:-10px">${obras.map(o => workRow(m, o)).join('') || '<p class="empty">Sin obras en el catálogo.</p>'}</div>
  </section>`;
}

function buscar(data, q) {
  const nq = norm(q).trim(); if (!nq) return [];
  const terms = nq.split(/\s+/);
  return data.obras.filter(o => {
    const hay = norm([o.titulo, o.titulo_original, o.autor, o.sala ? 'sala ' + o.sala : '', o.num_catalogo].join(' '));
    return terms.every(t => hay.includes(t));
  }).slice(0, 200);
}

/* ---------- router ---------- */
async function render() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent).filter(Boolean);
  window.scrollTo(0, 0);
  if (parts[0] !== 'm') { $app.innerHTML = vHome(); return; }
  const m = MUSEOS.find(x => x.id === parts[1]);
  if (!m) { go('#/'); return; }
  let data;
  try { data = await loadCatalogo(m.id); }
  catch (e) {
    setSkin(m.skin, m.theme);
    $app.innerHTML = `<section class="screen">${head(m, '#/', 'Museos', esc(m.nombre))}<p class="empty">Esta guía aún no tiene catálogo cargado.<br>Conéctate a internet para descargarla.</p></section>`;
    return;
  }
  const [, , vista, arg] = parts;
  if (!vista) { $app.innerHTML = vMuseo(m, data); wireMuseo(m, data); return; }
  if (vista === 'obra') { const o = data.byId[arg]; if (!o) return go(`#/m/${m.id}`); $app.innerHTML = vObra(m, data, o); wireObra(m, o); return; }
  if (vista === 'artista') { const a = data.artistaById[arg]; if (!a) return go(`#/m/${m.id}`); $app.innerHTML = vArtista(m, data, a, `#/m/${m.id}`, m.nombre); return; }
  if (vista === 'salas') { $app.innerHTML = vSalas(m, data); return; }
  if (vista === 'sala') { $app.innerHTML = vLista(m, data, salaLabel(arg), data.obras.filter(o => o.sala === arg)); return; }
  if (vista === 'artistas') { $app.innerHTML = vArtistas(m, data); return; }
  if (vista === 'favoritos') { const f = getFavs(m.id); $app.innerHTML = vLista(m, data, 'Mis favoritas', f.map(id => data.byId[id]).filter(Boolean), plural(f.length, 'obra', 'obras'), 'Todavía no tienes favoritas.<br>Marca la estrella en una obra para guardarla aquí.'); return; }
  if (vista === 'todas') { $app.innerHTML = vLista(m, data, 'Todas las obras', [...data.obras].sort((a, b) => a.titulo.localeCompare(b.titulo, 'es')), plural(data.obras.length, 'obra', 'obras')); return; }
  if (vista === 'buscar') { const r = buscar(data, arg || ''); $app.innerHTML = vLista(m, data, 'Resultados', r, `${plural(r.length, 'resultado', 'resultados')} para “${esc(arg)}”`, `Nada para “${esc(arg)}”.<br>Prueba con el título, el autor o el número de sala.`); return; }
  go(`#/m/${m.id}`);
}

function wireMuseo(m, data) {
  const form = document.getElementById('searchForm'), q = document.getElementById('q');
  form?.addEventListener('submit', e => { e.preventDefault(); if (q.value.trim()) go(`#/m/${m.id}/buscar/${encodeURIComponent(q.value.trim())}`); });
  const dl = document.getElementById('dl');
  dl?.addEventListener('click', async () => {
    const pack = document.getElementById('pack'), bar = pack.querySelector('.bar'), fill = bar.querySelector('i'), small = pack.querySelector('small');
    dl.disabled = true; dl.textContent = 'Descargando…'; bar.hidden = false;
    try {
      const st = await downloadPack(m.id, (d, t) => { fill.style.width = `${Math.round(d / t * 100)}%`; small.textContent = `${d} de ${t} archivos`; });
      toast(st.fallidos ? `Guía descargada con ${st.fallidos} archivos pendientes` : 'Guía descargada. Ya funciona sin conexión.');
      render();
    } catch (e) { toast(e.message || 'No se pudo descargar'); dl.disabled = false; dl.textContent = 'Reintentar'; }
  });
}
function wireObra(m, o) {
  document.getElementById('fav')?.addEventListener('click', e => {
    const on = toggleFav(m.id, o.id);
    e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-pressed', on); e.currentTarget.setAttribute('aria-label', on ? 'Quitar de favoritas' : 'Guardar en favoritas');
    e.currentTarget.innerHTML = on ? ICON.starOn : ICON.star;
    toast(on ? 'Guardada en favoritas' : 'Quitada de favoritas');
  });
}

window.addEventListener('hashchange', render);
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
