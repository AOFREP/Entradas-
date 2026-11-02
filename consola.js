/* Consola web · Eventos y Negocios
 * Todo lo de la planilla, con usuario y contraseña. La planilla sigue siendo la base: esto solo la lee y la escribe por el API.
 * Admin: todo. Operador: acreditación (escáner, ingreso manual, credenciales). */
(function () {
  var $ = F.$, esc = F.esc, plata = F.plata;
  var S = null, vista = '', cache = {};
  var K = 'cons_s';

  // ── utilidades ──
  function leerJ(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function guardarJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function toast(t, err) { var x = $('toast'); x.textContent = t; x.className = err ? 'err' : ''; clearTimeout(toast.t); toast.t = setTimeout(function () { x.className = 'oculto'; }, err ? 7000 : 3500); }
  function fallo(e) { toast(F.msg(e), true); }
  function fecha(ms, conAnio) { if (!ms) return ''; var d = new Date(ms); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + (conAnio ? '/' + d.getFullYear() : '') + ' ' + F.hora(ms); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function api(op, datos, ms) {
    return F.post('consola', Object.assign({ token: S.token, op: op }, datos || {}), ms || 60000).catch(function (e) {
      var m = F.msg(e); if (/^SESION:/.test(m)) { salir(m.replace('SESION: ', '')); throw new Error(m.replace('SESION: ', '')); } throw e;
    });
  }
  function boton(b, prom, txt) { // deshabilita el botón mientras trabaja
    var antes = b.innerHTML; b.disabled = true; b.innerHTML = txt || 'Un momento…';
    return prom.then(function (r) { b.disabled = false; b.innerHTML = antes; return r; }, function (e) { b.disabled = false; b.innerHTML = antes; throw e; });
  }
  function chipEstado(e) {
    var c = { 'Válida': 'ok', 'Aprobada': 'ok', 'Cortesía': 'az', 'En revisión': 'am', 'A validar': 'am', 'Pendiente': '', 'Anulada': 'mal', 'Rechazada': 'mal', 'Vencida': '', 'A devolver': 'nar', 'Revisar': 'am' }[e];
    return '<span class="chip ' + (c || '') + '">' + esc(e || '—') + '</span>';
  }
  function csv(nombre, filas) {
    var t = filas.map(function (f) { return f.map(function (c) { c = String(c == null ? '' : c); return /[",;\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + t], { type: 'text/csv;charset=utf-8' })); a.download = nombre + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  }
  function modal(html) { $('mCont').innerHTML = html; $('modal').classList.remove('oculto'); document.body.style.overflow = 'hidden'; $('modal').scrollTop = 0; }
  function cerrarModal() { $('modal').classList.add('oculto'); $('mCont').innerHTML = ''; document.body.style.overflow = ''; }
  $('mCerrar').onclick = cerrarModal;
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) cerrarModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('modal').classList.contains('oculto')) cerrarModal(); });
  function cab(tit, sub, extra) { return '<div class="cab"><h2>' + tit + '</h2>' + (extra || '') + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>'; }
  function cargando() { $('main').innerHTML = '<div class="cargandoV">Cargando…</div>'; }
  function waLink(tel, txt) { return tel ? 'https://wa.me/' + tel + '?text=' + encodeURIComponent(txt || '') : ''; }

  // ── secciones ──
  var SECC = [
    { id: 'inicio', i: '📊', t: 'Inicio', admin: true },
    { id: 'puerta', i: '🚪', t: 'Acreditación' },
    { g: 'Venta', admin: true },
    { id: 'socios', i: '✅', t: 'Socios', admin: true },
    { id: 'tickets', i: '🎟️', t: 'Tickets', admin: true },
    { id: 'ordenes', i: '🧾', t: 'Órdenes', admin: true },
    { id: 'tipos', i: '🏷️', t: 'Tickets y grupos', admin: true },
    { id: 'facturar', i: '💼', t: 'Facturación', admin: true },
    { g: 'Evento', admin: true, tec: true },
    { id: 'pantallas', i: '📺', t: 'Pantallas', admin: true, tec: true },
    { id: 'personal', i: '📱', t: 'App del asistente', admin: true },
    { id: 'celulares', i: '🔗', t: 'Celulares vinculados', admin: true },
    { id: 'sorteo', i: '🎁', t: 'Sorteo', admin: true, tec: true },
    { id: 'comunicacion', i: '✉️', t: 'Mails y certificados', admin: true },
    { id: 'actividad', i: '🕑', t: 'Actividad', admin: true },
    { id: 'ajustes', i: '⚙️', t: 'Ajustes', admin: true },
    { id: 'usuarios', i: '👥', t: 'Usuarios', admin: true },
    { id: 'herramientas', i: '🩺', t: 'Diagnóstico', admin: true }
  ];
  function esAdmin() { return S && S.yo.rol === 'admin'; }
  function esTec() { return S && S.yo.rol === 'tecnica'; }
  function puede(s) { return esAdmin() || (esTec() ? !!s.tec : !s.admin); }
  function inicioDe() { return esAdmin() ? 'inicio' : esTec() ? 'pantallas' : 'puerta'; }
  function pintarNav() {
    $('nav').innerHTML = SECC.filter(puede).map(function (s) {
      if (s.g) return '<div class="grupo">' + esc(s.g.toUpperCase()) + '</div>';
      return '<button data-v="' + s.id + '"' + (s.id === vista ? ' class="on"' : '') + '><span class="i">' + s.i + '</span>' + esc(s.t) + (s.id === 'socios' && cache.nSocios ? '<span class="n">' + cache.nSocios + '</span>' : '') + '</button>';
    }).join('');
  }
  $('nav').onclick = function (e) { var b = e.target.closest('button[data-v]'); if (b) { ir(b.getAttribute('data-v')); document.body.classList.remove('menu'); } };
  $('bMenu').onclick = function () { document.body.classList.toggle('menu'); };
  document.addEventListener('click', function (e) { if (document.body.classList.contains('menu') && !e.target.closest('.lado') && !e.target.closest('#bMenu')) document.body.classList.remove('menu'); });
  function ir(v) {
    var s = SECC.find(function (x) { return x.id === v; });
    if (!s || !puede(s)) v = inicioDe();
    vista = v; try { history.replaceState(null, '', '#' + v); } catch (e) { }
    pintarNav(); $('hTit').textContent = (SECC.find(function (x) { return x.id === v; }) || {}).t || 'Consola';
    window.scrollTo(0, 0); cargando();
    (V[v] || V.inicio)();
  }

  var V = {};

  // ── Inicio ──
  V.inicio = function () {
    api('inicio').then(function (r) {
      var x = r.resumen, p = r.puerta; cache.nSocios = r.socios.pendientes; pintarNav();
      var tipos = x.tipos.map(function (t) {
        return '<tr><td><b>' + esc(t.nombre) + '</b><small>' + esc({ venta: 'En venta', agotado: 'Agotado', finalizado: 'Terminó', proximamente: 'Próximamente', reservado: 'Reservado', oculto: 'Oculto' }[t.estado] || t.estado || '') + '</small></td>' +
          '<td class="num">' + t.vendidos + '</td><td class="num">' + t.cortesias + '</td><td class="num">' + t.revision + '</td><td class="num">' + (t.disp == null ? '—' : t.disp) + '</td><td class="num">' + t.adentro + '</td></tr>';
      }).join('');
      $('main').innerHTML = (x.prueba ? '<div class="bannerP">🧪 Modo prueba activado (Ajustes)</div>' : '') +
        cab('Inicio', 'Actualizado ' + esc(x.hora) + ' · información interna', '<button class="b sec chico" id="bAct">↻ Actualizar</button>') +
        '<div class="grilla">' +
        '<div class="kpi"><small>Tickets válidos</small><b>' + x.validos + (x.cupo ? '<span> / ' + x.cupo + '</span>' : '') + '</b><span>' + x.ordenes + ' compras</span></div>' +
        '<div class="kpi"><small>Cobrado</small><b>' + plata(x.cobrado) + '</b><span>confidencial</span></div>' +
        '<div class="kpi link" data-ir="puerta"><small>Adentro</small><b>' + p.adentro + '<span> / ' + p.total + '</span></b><span>' + p.impresas + ' credenciales impresas</span></div>' +
        '<div class="kpi ' + (r.socios.pendientes ? 'alerta' : 'link') + '" data-ir="socios"><small>Socios a validar</small><b>' + r.socios.pendientes + '</b><span>' + x.revision + ' tickets en revisión</span></div>' +
        (r.socios.devolver ? '<div class="kpi alerta" data-ir="socios"><small>A devolver</small><b>' + r.socios.devolver + '</b><span>devolución en Mercado Pago</span></div>' : '') +
        '<div class="kpi ' + (r.facturar ? 'alerta' : 'link') + '" data-ir="facturar"><small>Para facturar</small><b>' + r.facturar + '</b><span>sin facturar</span></div>' +
        '<div class="kpi"><small>Pagando ahora</small><b>' + x.pagando + '</b><span>en Mercado Pago</span></div>' +
        '</div>' +
        '<div class="tarj"><h3>Venta</h3>' +
        '<div class="interr"><div class="t"><b>Venta abierta</b><small>Apagada: la tienda muestra "venta cerrada".</small></div><label class="sw"><input type="checkbox" id="swAbierta"' + (x.abierta ? ' checked' : '') + '><span></span></label></div>' +
        '<div class="interr"><div class="t"><b>Todo agotado</b><small>Muestra todos los tickets "Agotado" y no deja comprar.</small></div><label class="sw rojo"><input type="checkbox" id="swAgotado"' + (x.agotado ? ' checked' : '') + '><span></span></label></div></div>' +
        '<div class="tarj"><h3>Por tipo</h3><div class="scroll" style="max-height:none"><table class="tabla"><thead><tr><th>Tipo</th><th class="num">Vendidos</th><th class="num">Cortesías</th><th class="num">En revisión</th><th class="num">Disponibles</th><th class="num">Adentro</th></tr></thead><tbody>' + tipos + '</tbody></table></div></div>';
      $('bAct').onclick = V.inicio;
      Array.prototype.forEach.call(document.querySelectorAll('[data-ir]'), function (k) { k.onclick = function () { ir(k.getAttribute('data-ir')); }; });
      [['swAbierta', 'VENTA_ABIERTA', '¿Cerrar la venta? La tienda va a mostrar "venta cerrada".', '¿Abrir la venta?'], ['swAgotado', 'AGOTADO', '¿Marcar todo como AGOTADO?', '¿Volver a vender (sacar el agotado)?']].forEach(function (s) {
        $(s[0]).onchange = function () {
          var el = this, v = el.checked;
          if (!confirm(s[1] === 'VENTA_ABIERTA' ? (v ? s[3] : s[2]) : (v ? s[2] : s[3]))) { el.checked = !v; return; }
          api('venta', { campo: s[1], valor: v }).then(function () { toast('✓ Listo'); }).catch(function (e) { el.checked = !v; fallo(e); });
        };
      });
    }).catch(function (e) { $('main').innerHTML = '<div class="vacio">' + esc(F.msg(e)) + '</div>'; });
  };

  // ── Acreditación (todos) ──
  function abrirEn(pagina, k, ses) {
    if (!S.escaner) { toast('Falta el PIN del escáner (se configura en la planilla, menú 🔢).', true); return; }
    guardarJ(k, ses); location.href = pagina;
  }
  V.puerta = function () {
    $('main').innerHTML = cab('Acreditación', 'Se entra con tu usuario: el escáner y la página de credenciales se abren ya logueados.') +
      '<div class="gran">' +
      '<button class="accion" id="aEsc"><div class="i">📷</div><b>Escanear tickets</b><small>Tablet o celular con la cámara. Funciona sin internet.</small></button>' +
      '<button class="accion" id="aCred"><div class="i">🖨️</div><b>Credenciales</b><small>Compu con lector USB y la Zebra: entregar o imprimir.</small></button>' +
      '</div>' +
      '<div class="grilla" style="margin-top:14px" id="pNums"></div>' +
      '<div class="tarj"><h3>Ingreso manual</h3><input class="campo2" id="pQ" placeholder="Buscar por nombre, DNI, empresa o código" autocomplete="off"><div id="pRes"></div></div>';
    $('aEsc').onclick = function () { abrirEn('escaner.html', 'fz_esc_sesion', { token: S.escaner.token, puerta: S.escaner.puerta, evento: S.evento }); };
    $('aCred').onclick = function () { abrirEn('credenciales.html', 'cred_s', { token: S.escaner.token, puerta: S.escaner.puerta, evento: S.evento && S.evento.nombre }); };
    function nums() { api('puerta').then(function (r) { var p = r.puerta; $('pNums').innerHTML = '<div class="kpi"><small>Adentro</small><b>' + p.adentro + '<span> / ' + p.total + '</span></b><span>' + esc(p.hora) + '</span></div><div class="kpi"><small>Faltan llegar</small><b>' + (p.total - p.adentro) + '</b></div><div class="kpi"><small>Credenciales impresas</small><b>' + p.impresas + '</b></div>' + (p.revision ? '<div class="kpi alerta"><small>Socios sin validar</small><b>' + p.revision + '</b></div>' : ''); }).catch(function () { }); }
    nums();
    var t = null;
    function buscar() {
      var q = $('pQ').value.trim();
      if (q.length < 2) { $('pRes').innerHTML = ''; return; }
      api('buscarPuerta', { q: q }).then(function (r) {
        if ($('pQ').value.trim() !== q) return;
        $('pRes').innerHTML = r.tickets.length ? '<div class="scroll" style="margin-top:10px"><table class="tabla"><tbody>' + r.tickets.map(function (x) {
          var est = x.estado !== 'Válida' ? chipEstado(x.estado) : x.ingreso ? '<span class="chip az">Adentro ' + F.hora(x.ingreso) + '</span> <button class="b sec chico" data-des="' + esc(x.cod) + '">Deshacer</button>' : '<button class="b ok chico" data-in="' + esc(x.cod) + '">Dar ingreso</button>';
          return '<tr><td><b>' + esc(x.nombre) + '</b><small>' + esc([x.empresa, x.tipo, x.dni ? 'DNI ' + x.dni : '', x.rol].filter(Boolean).join(' · ')) + (x.impresa ? ' · 🏷️ credencial impresa' : '') + '</small></td><td class="num">' + est + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="vacio">Sin resultados.</div>';
      }).catch(fallo);
    }
    $('pQ').oninput = function () { clearTimeout(t); t = setTimeout(buscar, 300); };
    $('pRes').onclick = function (e) {
      var b = e.target.closest('button[data-in],button[data-des]'); if (!b) return;
      var des = b.hasAttribute('data-des'), cod = b.getAttribute(des ? 'data-des' : 'data-in');
      if (des && !confirm('¿Deshacer el ingreso?')) return;
      boton(b, api(des ? 'deshacerIngreso' : 'ingreso', { cod: cod })).then(function (r) { toast(r.msj); buscar(); nums(); }).catch(fallo);
    };
    setTimeout(function () { $('pQ').focus(); }, 50);
  };

  // ── Socios ──
  V.socios = function () {
    api('socios').then(function (r) {
      cache.motivos = r.motivos; var s = r.socios; cache.nSocios = s.pendientes.length; pintarNav();
      var tarjeta = function (x, pend) {
        return '<div class="socio' + (x.estado === 'A devolver' ? ' dev' : '') + '"><div class="fila"><div class="crece"><div class="emp">' + esc(x.empresa || x.nombre) + '</div><div class="l" style="font-family:monospace">CUIT ' + esc(x.cuit) + '</div></div>' + chipEstado(x.estado) + '</div>' +
          '<div class="l">' + esc(x.nombre) + ' · ' + esc(x.mail) + (x.tel ? ' · ' + esc(x.tel) : '') + '</div>' +
          '<div class="l"><small>' + esc(x.detalle) + ' · ' + plata(x.total) + ' · pagó ' + esc(x.pagada || x.creada) + ' · orden ' + esc(x.id) + '</small></div>' +
          (x.revision.length ? '<div class="l"><b>En revisión:</b> ' + x.revision.map(esc).join(', ') + '</div>' : '') +
          (x.okEmpresa ? '<div class="l"><small>Esta empresa ya tiene ' + x.okEmpresa + ' ticket(s) de socio validado(s).</small></div>' : '') +
          (x.notas ? '<div class="l"><small>' + esc(x.notas) + '</small></div>' : '') +
          (pend ? '<div class="acc"><button class="b ok" data-val="' + esc(x.id) + '">✓ Validar y mandar QR</button><button class="b mal" data-rech="' + esc(x.id) + '">Rechazar…</button></div>' :
            x.estado === 'A devolver' ? '<div class="acc"><span class="chip nar">Devolver ' + plata(x.devolver) + ' en Mercado Pago</span><button class="b sec" data-dev="' + esc(x.id) + '">Ya hice la devolución</button></div>' : '') + '</div>';
      };
      $('main').innerHTML = cab('Socios AOFREP', 'Validá la membresía de cada empresa. Al validar se mandan los QR; al rechazar, el mail según el motivo.') +
        '<div class="tarj"><h3>Para validar (' + s.pendientes.length + ')</h3>' + (s.pendientes.length ? s.pendientes.map(function (x) { return tarjeta(x, true); }).join('') : '<div class="vacio">No hay socios esperando validación 🎉</div>') + '</div>' +
        '<div class="tarj"><h3>Resueltos</h3>' + (s.resueltas.length ? s.resueltas.map(function (x) { return tarjeta(x, false); }).join('') : '<div class="vacio">Todavía nada.</div>') + '</div>';
      $('main').onclick = function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.hasAttribute('data-val')) { var id = b.getAttribute('data-val'); if (!confirm('¿Validar la membresía y mandar los QR?')) return; boton(b, api('validar', { id: id })).then(function (r) { toast(r.msj); V.socios(); }).catch(fallo); }
        if (b.hasAttribute('data-dev')) { var id2 = b.getAttribute('data-dev'); if (!confirm('¿Confirmás que ya hiciste la devolución en Mercado Pago?')) return; boton(b, api('devuelto', { id: id2 })).then(function (r) { toast(r.msj); V.socios(); }).catch(fallo); }
        if (b.hasAttribute('data-rech')) rechazar(b.getAttribute('data-rech'));
      };
    }).catch(fallo);
  };
  function rechazar(id) {
    var m = cache.motivos || {};
    modal('<h3>Rechazar socio</h3><div class="meta">Orden ' + esc(id) + ' · se le manda un mail explicando el motivo y la orden queda "A devolver".</div>' +
      '<label class="et2">Motivo</label><select class="campo2" id="rMot">' + Object.keys(m).map(function (k) { return '<option value="' + k + '">' + esc(m[k]) + '</option>'; }).join('') + '</select>' +
      '<label class="et2">Nota (obligatoria con "Otro")</label><textarea class="campo2" id="rNota"></textarea>' +
      '<div class="acc"><button class="b mal" id="rOk">Rechazar y avisar</button><button class="b sec" id="rNo">Cancelar</button></div>');
    $('rNo').onclick = cerrarModal;
    $('rOk').onclick = function () { boton(this, api('rechazar', { id: id, motivo: $('rMot').value, nota: $('rNota').value })).then(function (r) { cerrarModal(); toast(r.msj); V.socios(); }).catch(fallo); };
  }

  // ── Tickets ──
  var fT = { q: '', estado: 'todos', tipo: '', ingreso: 'todos' };
  V.tickets = function () {
    api('tickets').then(function (r) {
      cache.tickets = r.tickets; cache.tipos = r.tipos; cache.roles = r.roles;
      $('main').innerHTML = cab('Tickets', '', '<button class="b ok" id="bCort">🎁 Cortesías</button><button class="b sec" id="bLis">📋 Listado en Drive</button><button class="b sec" id="bCsv">⬇︎ Exportar</button>') +
        '<div class="tarj"><div class="fila"><input class="campo2 crece" id="tQ" placeholder="Buscar nombre, DNI, mail, empresa, código u orden" value="' + esc(fT.q) + '">' +
        '<select class="campo2" id="tTipo" style="width:auto"><option value="">Todos los tipos</option>' + r.tipos.map(function (t) { return '<option value="' + esc(t.id) + '"' + (fT.tipo === t.id ? ' selected' : '') + '>' + esc(t.nombre) + '</option>'; }).join('') + '</select></div>' +
        '<div class="fila" style="margin-top:10px"><div class="seg" id="tEst">' + [['todos', 'Todos'], ['Válida', 'Válidos'], ['En revisión', 'En revisión'], ['Anulada', 'Anulados'], ['Rechazada', 'Rechazados']].map(function (x) { return '<button data-v="' + x[0] + '"' + (fT.estado === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>' +
        '<div class="seg" id="tIng">' + [['todos', 'Todos'], ['si', 'Adentro'], ['no', 'Sin ingresar']].map(function (x) { return '<button data-v="' + x[0] + '"' + (fT.ingreso === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div></div></div>' +
        '<div class="cont" id="tCont"></div><div class="scroll"><table class="tabla"><thead><tr><th>Nombre</th><th>Tipo</th><th>Estado</th><th>Ingreso</th><th>Código</th></tr></thead><tbody id="tBody"></tbody></table></div>';
      $('tQ').oninput = function () { fT.q = this.value; pintarT(); };
      $('tTipo').onchange = function () { fT.tipo = this.value; pintarT(); };
      $('tEst').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; fT.estado = b.getAttribute('data-v'); Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); }); pintarT(); };
      $('tIng').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; fT.ingreso = b.getAttribute('data-v'); Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); }); pintarT(); };
      $('tBody').onclick = function (e) { var tr = e.target.closest('tr[data-cod]'); if (tr) verTicket(tr.getAttribute('data-cod')); };
      $('bCort').onclick = function () { cortesias(); };
      $('bLis').onclick = function () {
        if (!confirm('¿Armar un listado nuevo en Drive? (nombre, DNI, categoría y empresa, una pestaña por categoría)')) return;
        boton(this, api('listado', {}, 170000), 'Armando… (puede tardar)').then(function (r) {
          modal('<h3>📋 Listado listo</h3><div class="meta">' + esc(r.nombre) + '</div><div class="cont" style="margin-top:8px"><b>' + r.total + ' personas</b> · ' +
            Object.keys(r.cuenta).filter(function (k) { return r.cuenta[k]; }).map(function (k) { return esc(k) + ': ' + r.cuenta[k]; }).join(' · ') +
            (r.sinDni ? '<br>⚠ ' + r.sinDni + ' sin DNI (completalo en la planilla y volvé a armarlo)' : '') + '</div>' +
            '<div class="acc"><a class="b ok" href="' + esc(r.url) + '" target="_blank" rel="noopener">Abrir el listado</a><a class="b sec" href="' + esc(r.carpeta) + '" target="_blank" rel="noopener">Ver la carpeta</a><button class="b sec" id="lisNo">Cerrar</button></div>');
          $('lisNo').onclick = cerrarModal;
        }).catch(fallo);
      };
      $('bCsv').onclick = function () { csv('tickets', [['Código', 'Nombre', 'DNI', 'Mail', 'Empresa', 'Tipo', 'Estado', 'Origen', 'Orden', 'Comprador', 'Teléfono', 'Rubro', 'Rol', 'Cargo', 'Ingreso', 'Puerta', 'Credencial impresa']].concat(filtrarT().map(function (x) { return [x.cod, x.nombre, x.dni, x.mail, x.empresa, x.tipo, x.estado, x.origen, x.orden, x.comprador, x.tel, x.rubro, x.rol, x.cargo, fecha(x.ingreso), x.puerta, x.impresa ? 'Sí' : '']; }))); };
      pintarT(); $('tQ').focus();
    }).catch(fallo);
  };
  function filtrarT() {
    var q = norm(fT.q).trim(), dq = fT.q.replace(/\D/g, '');
    return (cache.tickets || []).filter(function (x) {
      if (fT.estado !== 'todos' && x.estado !== fT.estado) return false;
      if (fT.tipo && x.tipoId !== fT.tipo) return false;
      if (fT.ingreso === 'si' && !x.ingreso) return false; if (fT.ingreso === 'no' && x.ingreso) return false;
      if (!q) return true;
      return norm(x.nombre).indexOf(q) >= 0 || norm(x.mail).indexOf(q) >= 0 || norm(x.empresa).indexOf(q) >= 0 || norm(x.cod).indexOf(q) >= 0 || norm(x.orden) === q || norm(x.comprador).indexOf(q) >= 0 || (dq.length >= 4 && x.dni.indexOf(dq) >= 0);
    });
  }
  function pintarT() {
    var l = filtrarT(), max = 300;
    $('tCont').textContent = l.length + ' ticket(s)' + (l.length > max ? ' · mostrando los primeros ' + max + ' (usá la búsqueda)' : '');
    $('tBody').innerHTML = l.slice(0, max).map(function (x) {
      return '<tr class="click" data-cod="' + esc(x.cod) + '"><td><b>' + esc(x.nombre) + '</b><small>' + esc([x.empresa, x.dni ? 'DNI ' + x.dni : '', x.rol].filter(Boolean).join(' · ')) + '</small></td><td>' + esc(x.tipo) + '<small>' + esc(x.origen) + '</small></td><td>' + chipEstado(x.estado) + '</td><td>' + (x.ingreso ? '<span class="chip az">' + fecha(x.ingreso) + '</span>' : '') + (x.impresa ? '<small>🏷️ impresa</small>' : '') + '</td><td style="font-family:monospace;font-size:13px">' + esc(x.cod) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="vacio">Sin resultados.</td></tr>';
  }
  function verTicket(cod) {
    modal('<div class="cargandoV">Cargando…</div>');
    api('ticket', { cod: cod }).then(function (r) {
      var x = r.ticket, roles = r.roles, val = x.estado === 'Válida';
      var campo = function (id, et, v, ph, ancho) { return '<div' + (ancho ? ' class="ancho"' : '') + '><label class="et2" for="' + id + '">' + et + '</label><input class="campo2" id="' + id + '" value="' + esc(v) + '" placeholder="' + esc(ph || '') + '"></div>'; };
      modal('<h3>' + esc(x.nombre) + '</h3><div class="meta">' + chipEstado(x.estado) + ' · ' + esc(x.tipo) + ' · ' + esc(x.origen) + ' · <span style="font-family:monospace">' + esc(x.cod) + '</span></div>' +
        '<div class="acc">' + (val ? (x.ingreso ? '<button class="b sec" id="xDes">↩️ Deshacer ingreso (' + fecha(x.ingreso) + ')</button>' : '<button class="b ok" id="xIn">✓ Dar ingreso</button>') : '') +
        (val ? '<button class="b sec" id="xImp">🖨️ Imprimir credencial</button><button class="b wa" id="xWa">WhatsApp</button><button class="b sec" id="xLink">🔗 Copiar link del ticket</button>' : '') +
        (x.orden ? '<button class="b sec" id="xOrden">🧾 Ver orden ' + esc(x.orden) + '</button>' : '') + '</div>' +
        (val ? '<div class="cont">📱 App: ' + (x.cel ? 'vinculada a un celular · <a href="" id="xLibCel">Liberar celular</a> (si cambió de celular o no puede entrar)' : 'todavía no escaneó su credencial con el celular') + (x.dni ? ' · DNI ' + esc(x.dni) : '') + '</div>' : '') +
        '<div class="bloque"><h4>Datos del ticket</h4><div class="form">' + campo('xNom', 'Nombre y apellido', x.nombre) + campo('xDni', 'DNI', x.dni) + campo('xMail', 'Mail', x.mail) + campo('xEmp', 'Empresa', x.empresa) + '</div></div>' +
        '<div class="bloque"><h4>Credencial</h4><div class="form">' + campo('xNomC', 'Nombre en la credencial', x.nomCred, x.nombre) + campo('xEmpC', 'Empresa en la credencial', x.empCred, x.empresa) + campo('xCar', 'Cargo en esa empresa', x.cargo, 'Ej: Presidenta') + campo('xEmpC2', '2ª empresa (opcional)', x.empCred2, 'Ej: Fonzi Events') + campo('xCar2', 'Cargo en la 2ª empresa', x.cargo2, 'Ej: CEO') + campo('xRub', 'Rubro', x.rubro) +
        '<div><label class="et2" for="xRol">Rol (no se imprime)</label><select class="campo2" id="xRol"><option value="">Asistente (sin franja)</option>' + roles.map(function (k) { return '<option' + (k === x.rol ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select></div></div>' +
        (x.veces ? '<div class="cont">🏷️ Sticker impreso ' + esc(x.impresa) + (x.veces > 1 ? ' (' + x.veces + ' veces)' : '') + '</div>' : '') + '</div>' +
        '<div class="bloque"><h4>Networking</h4><div class="form"><div><label class="et2" for="xNet">Comparte su contacto</label><select class="campo2" id="xNet"><option value="">Sin respuesta</option><option' + (x.net === 'Sí' ? ' selected' : '') + '>Sí</option><option' + (x.net === 'No' ? ' selected' : '') + '>No</option></select></div>' + campo('xIg', 'Instagram', x.ig, '@cuenta') + campo('xLi', 'LinkedIn', x.li) + campo('xWeb', 'Web', x.web) + campo('xNmail', 'Mail de contacto', x.nmail) + '</div>' + '</div>' +
        '<div class="acc"><button class="b pri" id="xGuardar">Guardar cambios</button></div>' +
        '<div class="bloque"><h4>Compra</h4><div class="datos"><div><small>Comprador</small>' + esc(x.comprador) + '</div><div><small>Mail de la compra</small>' + esc(x.mailCompra) + '</div><div><small>Teléfono</small>' + esc(x.tel) + '</div><div><small>Emitido</small>' + esc(x.emitida) + '</div><div><small>Precio</small>' + plata(x.precio) + '</div><div><small>Estado de la orden</small>' + esc(x.estadoOrden) + '</div></div></div>' +
        '<div class="bloque"><h4>Historial</h4>' + (x.historial.length ? x.historial.map(function (h) { return '<div class="cont">' + fecha(h.fecha) + ' · <b>' + esc(h.res) + '</b> · ' + esc(h.puerta) + '</div>'; }).join('') : '<div class="cont">Sin movimientos.</div>') + '</div>' +
        (val || x.estado === 'En revisión' ? '<div class="bloque"><button class="b mal" id="xAnular">Anular este ticket</button> <span class="cont">Primero hacé la devolución en Mercado Pago si corresponde.</span></div>' : ''));
      var recargar = function () { verTicket(cod); if (vista === 'tickets') api('tickets').then(function (r2) { cache.tickets = r2.tickets; pintarT(); }).catch(function () { }); };
      if ($('xIn')) $('xIn').onclick = function () { boton(this, api('ingreso', { cod: cod })).then(function (r2) { toast(r2.msj); recargar(); }).catch(fallo); };
      if ($('xDes')) $('xDes').onclick = function () { if (!confirm('¿Deshacer el ingreso?')) return; boton(this, api('deshacerIngreso', { cod: cod })).then(function (r2) { toast(r2.msj); recargar(); }).catch(fallo); };
      if ($('xLibCel')) $('xLibCel').onclick = function (ev) { ev.preventDefault(); if (!confirm('¿Liberar el celular? El próximo que escanee su credencial queda vinculado.')) return; api('liberarCel', { cod: x.cod }).then(function (r2) { toast(r2.msj); verTicket(x.cod); }).catch(fallo); };
      if ($('xLink')) $('xLink').onclick = function () { try { navigator.clipboard.writeText(x.link); toast('✓ Link copiado'); } catch (e) { prompt('Link del ticket:', x.link); } };
      if ($('xWa')) $('xWa').onclick = function () {
        var w = window.open('', '_blank');
        api('whatsapp', { cod: cod }).then(function (r2) {
          var tel = (x.tel || '').replace(/\D/g, ''); var u = 'https://wa.me/' + (tel ? waNum(tel) : '') + '?text=' + encodeURIComponent(r2.ticket.mensaje);
          if (w) w.location = u; else location.href = u;
        }).catch(function (e) { if (w) w.close(); fallo(e); });
      };
      if ($('xOrden')) $('xOrden').onclick = function () { verOrden(x.orden); };
      if ($('xImp')) $('xImp').onclick = function () { // guarda lo que se haya cambiado y abre la página de credenciales con esta persona
        var d = { nombre: $('xNom').value, dni: $('xDni').value, mail: $('xMail').value, empresa: $('xEmp').value, nomCred: $('xNomC').value, empCred: $('xEmpC').value, rubro: $('xRub').value, rol: $('xRol').value, cargo: $('xCar').value, cargo2: $('xCar2').value, empCred2: $('xEmpC2').value, net: $('xNet').value, ig: $('xIg').value, li: $('xLi').value, web: $('xWeb').value, nmail: $('xNmail').value };
        boton(this, api('ticketGuardar', { cod: cod, datos: d })).then(function () { abrirEn('credenciales.html?cod=' + encodeURIComponent(cod), 'cred_s', { token: S.escaner && S.escaner.token, puerta: S.escaner && S.escaner.puerta, evento: S.evento && S.evento.nombre }); }).catch(fallo);
      };
      if ($('xAnular')) $('xAnular').onclick = function () { if (!confirm('¿Anular el ticket de ' + x.nombre + '? El escáner lo va a rechazar.')) return; boton(this, api('anular', { ref: cod })).then(function (r2) { toast(r2.msj); recargar(); }).catch(fallo); };
      $('xGuardar').onclick = function () {
        var d = { nombre: $('xNom').value, dni: $('xDni').value, mail: $('xMail').value, empresa: $('xEmp').value, nomCred: $('xNomC').value, empCred: $('xEmpC').value, rubro: $('xRub').value, rol: $('xRol').value, cargo: $('xCar').value, cargo2: $('xCar2').value, empCred2: $('xEmpC2').value, net: $('xNet').value, ig: $('xIg').value, li: $('xLi').value, web: $('xWeb').value, nmail: $('xNmail').value };
        boton(this, api('ticketGuardar', { cod: cod, datos: d })).then(function (r2) { toast(r2.msj); recargar(); }).catch(fallo);
      };
    }).catch(function (e) { cerrarModal(); fallo(e); });
  }
  function waNum(d) { // mismo criterio que el servidor: 549 + característica + número
    if (/^54/.test(d)) { d = d.slice(2); if (d[0] === '9') d = d.slice(1); }
    d = d.replace(/^0/, ''); if (d.length === 8) d = '11' + d;
    return d.length === 10 ? '549' + d : '';
  }
  function cortesias(tipoId, alTerminar) {
    var tipos = cache.tipos || [];
    modal('<h3>🎁 Cortesías / invitados</h3><div class="meta">Una persona por renglón: <b>Nombre y apellido, DNI, mail</b> (DNI y mail opcionales). Podés pegar desde una planilla.</div>' +
      '<label class="et2">Tipo de ticket</label><select class="campo2" id="cTipo">' + tipos.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.nombre) + '</option>'; }).join('') + '</select>' +
      '<label class="et2">Personas</label><textarea class="campo2" id="cFilas" style="min-height:160px" placeholder="Juan Pérez, 30111222, juan@mail.com&#10;María Gómez, 28999111"></textarea><div class="cont" id="cCuenta"></div>' +
      '<label class="et2">Nota (opcional)</label><input class="campo2" id="cNota" placeholder="Ej: invitados de HIT">' +
      '<label class="chk2"><input type="checkbox" id="cMandar" checked> Mandar el ticket por mail a quien tenga mail</label>' +
      '<div class="acc"><button class="b ok" id="cOk">Crear cortesías</button><button class="b sec" id="cNo">Cancelar</button></div>');
    var leer = function () {
      return $('cFilas').value.split('\n').map(function (l) { var p = l.split(/\t|,|;/).map(function (s) { return s.trim(); }); return { nombre: p[0] || '', dni: p[1] || '', mail: p[2] || '' }; }).filter(function (f) { return f.nombre.length >= 3; });
    };
    $('cFilas').oninput = function () { $('cCuenta').textContent = leer().length + ' persona(s)'; };
    $('cNo').onclick = cerrarModal;
    $('cOk').onclick = function () {
      var filas = leer(); if (!filas.length) { toast('Cargá al menos una persona.', true); return; }
      if (!confirm('¿Crear ' + filas.length + ' cortesía(s)?')) return;
      boton(this, api('cortesias', { tipo: $('cTipo').value, filas: filas, mandar: $('cMandar').checked, nota: $('cNota').value }, 120000), 'Creando…').then(function (r) { cerrarModal(); toast(r.msj); if (alTerminar) alTerminar(); else if (vista === 'tickets') V.tickets(); }).catch(fallo);
    };
    if (tipoId) { $('cTipo').value = tipoId; var t0 = tipos.filter(function (x) { return x.id === tipoId; })[0]; if (t0) { $('mCont').querySelector('h3').textContent = '＋ Agregar personas · ' + t0.nombre; } }
  }

  // ── Órdenes ──
  var fO = { q: '', estado: 'pagas' };
  V.ordenes = function () {
    api('ordenes').then(function (r) {
      cache.ordenes = r.ordenes;
      $('main').innerHTML = cab('Órdenes', 'Cada compra. Las pendientes y vencidas son las que no se pagaron.', '<button class="b sec" id="bRev">🔍 Revisar pagos pendientes</button><button class="b sec" id="bCsvO">⬇︎ Exportar</button>') +
        '<div class="tarj"><div class="fila"><input class="campo2 crece" id="oQ" placeholder="Buscar comprador, mail, empresa u orden" value="' + esc(fO.q) + '"></div>' +
        '<div class="fila" style="margin-top:10px"><div class="seg" id="oEst">' + [['pagas', 'Pagas'], ['A validar', 'A validar'], ['A devolver', 'A devolver'], ['Pendiente', 'Pendientes'], ['otras', 'Vencidas / rechazadas / anuladas'], ['todas', 'Todas']].map(function (x) { return '<button data-v="' + x[0] + '"' + (fO.estado === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div></div></div>' +
        '<div class="cont" id="oCont"></div><div class="scroll"><table class="tabla"><thead><tr><th>Fecha</th><th>Comprador</th><th>Detalle</th><th class="num">Total</th><th>Estado</th></tr></thead><tbody id="oBody"></tbody></table></div>';
      $('oQ').oninput = function () { fO.q = this.value; pintarO(); };
      $('oEst').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; fO.estado = b.getAttribute('data-v'); Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); }); pintarO(); };
      $('oBody').onclick = function (e) { var tr = e.target.closest('tr[data-id]'); if (tr) verOrden(tr.getAttribute('data-id')); };
      $('bRev').onclick = function () { boton(this, api('revisarPagos', {}, 280000), 'Revisando…').then(function (r2) { toast(r2.msj); V.ordenes(); }).catch(fallo); };
      $('bCsvO').onclick = function () { csv('ordenes', [['Orden', 'Fecha', 'Estado', 'Comprador', 'Mail', 'Teléfono', 'Empresa', 'Detalle', 'Total', 'Tickets', 'Notas']].concat(filtrarO().map(function (o) { return [o.id, fecha(o.creada, true), o.estado, o.nombre, o.mail, o.tel, o.empresa, o.detalle, o.total, o.tickets, o.notas]; }))); };
      pintarO();
    }).catch(fallo);
  };
  function filtrarO() {
    var q = norm(fO.q).trim(), pagas = ['Aprobada', 'Cortesía', 'Revisar', 'A validar', 'A devolver'];
    return (cache.ordenes || []).filter(function (o) {
      if (fO.estado === 'pagas' && pagas.indexOf(o.estado) < 0) return false;
      if (fO.estado === 'otras' && ['Vencida', 'Rechazada', 'Anulada'].indexOf(o.estado) < 0) return false;
      if (['pagas', 'otras', 'todas'].indexOf(fO.estado) < 0 && o.estado !== fO.estado) return false;
      return !q || norm(o.nombre).indexOf(q) >= 0 || norm(o.mail).indexOf(q) >= 0 || norm(o.empresa).indexOf(q) >= 0 || norm(o.id).indexOf(q) >= 0;
    });
  }
  function pintarO() {
    var l = filtrarO(), tot = l.reduce(function (a, o) { return a + o.total; }, 0);
    $('oCont').textContent = l.length + ' orden(es) · ' + plata(tot);
    $('oBody').innerHTML = l.slice(0, 400).map(function (o) {
      return '<tr class="click" data-id="' + esc(o.id) + '"><td>' + fecha(o.creada) + '<small style="font-family:monospace">' + esc(o.id) + '</small></td><td><b>' + esc(o.nombre) + '</b><small>' + esc([o.empresa, o.mail].filter(Boolean).join(' · ')) + '</small></td><td>' + esc(o.detalle) + '</td><td class="num">' + plata(o.total) + '</td><td>' + chipEstado(o.estado) + (o.mailEnv ? '' : (['Aprobada', 'Cortesía'].indexOf(o.estado) >= 0 ? '<small>mail sin enviar</small>' : '')) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="vacio">Sin resultados.</td></tr>';
  }
  function verOrden(id) {
    modal('<div class="cargandoV">Cargando…</div>');
    api('orden', { id: id }).then(function (r) {
      var o = r.orden;
      modal('<h3>' + esc(o.nombre) + '</h3><div class="meta">' + chipEstado(o.estado) + ' · <span style="font-family:monospace">' + esc(o.id) + '</span> · ' + esc(o.creada) + '</div>' +
        '<div class="acc">' + (o.pagada ? '<button class="b pri" id="oRe">✉️ Reenviar tickets</button>' : '') + (o.telWa ? '<a class="b wa" target="_blank" rel="noopener" href="https://wa.me/' + esc(o.telWa) + '">WhatsApp al comprador</a>' : '') +
        (o.link ? '<button class="b sec" id="oLink">🔗 Copiar link de la compra</button>' : '') + (!o.pagada || o.estado === 'Pendiente' ? '<button class="b sec" id="oMp">🔍 Revisar en Mercado Pago</button>' : '') + '</div>' +
        '<div class="bloque"><h4>Compra</h4><div class="datos"><div><small>Mail</small>' + esc(o.mail) + '</div><div><small>Teléfono</small>' + esc(o.tel) + '</div><div><small>DNI</small>' + esc(o.dni) + '</div><div><small>Detalle</small>' + esc(o.detalle) + '</div>' +
        '<div><small>Total</small>' + plata(o.total) + (o.cargo ? ' (cargo ' + plata(o.cargo) + ')' : '') + '</div><div><small>Pago MP</small>' + esc(o.pago || '—') + ' ' + esc(o.mpEstado) + '</div><div><small>Aprobada</small>' + esc(o.aprobada || '—') + '</div><div><small>Mail enviado</small>' + esc(o.mailEnv || '—') + '</div>' +
        (o.empresa ? '<div><small>Empresa (socio)</small>' + esc(o.empresa) + ' · ' + esc(o.cuitEmp) + '</div>' : '') + (o.recordatorio ? '<div><small>Recordatorio</small>' + esc(o.recordatorio) + '</div>' : '') + '</div></div>' +
        (o.iva ? '<div class="bloque"><h4>Facturación</h4><div class="datos"><div><small>Condición</small>' + esc(o.iva) + '</div><div><small>Razón social</small>' + esc(o.razon) + '</div><div><small>CUIT / DNI</small>' + esc(o.doc) + '</div><div><small>Domicilio</small>' + esc(o.domicilio) + '</div></div></div>' : '') +
        '<div class="bloque"><h4>Tickets (' + o.tickets.length + ')</h4>' + (o.tickets.length ? '<table class="tabla"><tbody>' + o.tickets.map(function (t) { return '<tr class="click" data-cod="' + esc(t.cod) + '"><td><b>' + esc(t.nombre) + '</b><small>' + esc(t.tipo) + (t.dni ? ' · DNI ' + esc(t.dni) : '') + '</small></td><td>' + chipEstado(t.estado) + (t.ingreso ? ' <span class="chip az">adentro</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="cont">Sin tickets.</div>') + '</div>' +
        '<div class="bloque"><h4>Notas</h4><div class="cont" style="white-space:pre-wrap">' + esc(o.notas || '—') + '</div><div class="fila" style="margin-top:8px"><input class="campo2 crece" id="oNota" placeholder="Agregar una nota (queda con tu nombre y la hora)"><button class="b sec" id="oNotaOk">Agregar</button></div></div>' +
        (o.pagada && o.estado !== 'Anulada' ? '<div class="bloque"><button class="b mal" id="oAnular">Anular la orden entera</button> <span class="cont">Anula todos sus tickets. La devolución se hace aparte en Mercado Pago.</span></div>' : ''));
      $('mCont').querySelector('.bloque table') && ($('mCont').querySelector('.bloque table').onclick = function (e) { var tr = e.target.closest('tr[data-cod]'); if (tr) verTicket(tr.getAttribute('data-cod')); });
      if ($('oRe')) $('oRe').onclick = function () { var m = prompt('¿A qué mail? (podés corregirlo)', o.mail || ''); if (m == null) return; boton(this, api('reenviar', { id: id, mail: m.trim() }, 90000)).then(function (r2) { toast(r2.msj); verOrden(id); }).catch(fallo); };
      if ($('oLink')) $('oLink').onclick = function () { try { navigator.clipboard.writeText(o.link); toast('✓ Link copiado'); } catch (e) { prompt('Link de la compra:', o.link); } };
      if ($('oMp')) $('oMp').onclick = function () { boton(this, api('revisarPago', { id: id }, 90000)).then(function (r2) { toast(r2.msj); verOrden(id); }).catch(fallo); };
      $('oNotaOk').onclick = function () { var n = $('oNota').value.trim(); if (!n) return; boton(this, api('ordenNota', { id: id, nota: n })).then(function () { toast('✓ Nota agregada'); verOrden(id); }).catch(fallo); };
      if ($('oAnular')) $('oAnular').onclick = function () { if (!confirm('¿Anular la orden ' + id + ' y TODOS sus tickets?')) return; boton(this, api('anular', { ref: id })).then(function (r2) { toast(r2.msj); verOrden(id); }).catch(fallo); };
    }).catch(function (e) { cerrarModal(); fallo(e); });
  }

  // ── Tipos ──
  // v1.12: copiar al portapapeles con plan B (en algunos celulares el portapapeles falla)
  function copiarTxt(txt, ok) {
    var plan = function () { prompt('Copiá este texto:', txt); };
    try { var pr = navigator.clipboard && navigator.clipboard.writeText(txt); if (pr && pr.then) pr.then(function () { toast(ok); }, plan); else plan(); } catch (e) { plan(); }
  }
  var ALFA_C = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function generarCodigo(nombre) {
    var pal = String(nombre || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(function (w) { return w.length >= 3 && ['BENEFICIO', 'ESPECIAL', 'INVITADOS', 'INVITADAS', 'TICKET', 'TICKETS', 'PARA', 'LOS', 'LAS', 'DEL', 'SOCIOS', 'MIEMBROS'].indexOf(w) < 0; });
    var base = (pal.length ? pal[pal.length - 1] : 'EYN').slice(0, 10), r = '';
    var a = new Uint32Array(4); try { crypto.getRandomValues(a); } catch (e) { for (var j = 0; j < 4; j++) a[j] = Math.floor(Math.random() * 1e9); }
    for (var i = 0; i < 4; i++) r += ALFA_C[a[i] % ALFA_C.length];
    return base + '-' + r;
  }
  function linkBenef(cod) { return (S.sitio || location.origin).replace(/\/$/, '') + '/?codigo=' + encodeURIComponent(cod); }
  function mensajeBenef(t) {
    var ev = S.evento || {}, donde = [ev.fecha, ev.lugar].filter(Boolean).join(' · ');
    if (!(t.precio > 0)) return '¡Hola! 🎟️ Tenés una *invitación sin cargo* para *' + (ev.nombre || 'el evento') + '*' + (donde ? ' (' + donde + ')' : '') + '.\n\n' +
      'Entrá acá, completá tus datos y te llega tu QR al instante:\n' + linkBenef(t.codigo) + '\n\nSi te lo pide, tu código es: *' + t.codigo + '*';
    return '¡Hola! 🎟️ Tenés un *beneficio especial* para *' + (ev.nombre || 'el evento') + '*' + (donde ? ' (' + donde + ')' : '') + '.\n\n' +
      'Tu ticket a *' + F.plata(t.precio) + '*' + (t.tachado > t.precio ? ' en lugar de ~' + F.plata(t.tachado) + '~' : '') + '.\n\n' +
      'Entrá acá y ya te aparece desbloqueado:\n' + linkBenef(t.codigo) + '\n\nSi te lo pide, tu código es: *' + t.codigo + '*';
  }
  // ── Tickets y grupos (v1.17) ──
  // Pocos tickets "de verdad" (venta general, socio) y, adentro, grupos: precio especial con código, invitaciones y cortesías.
  // Por dentro sigue siendo una fila por tipo en la planilla: no cambia nada de lo vendido.
  function claseT(t) { if (t.cort) return 'socio'; if (t.precio > 0) return t.codigo ? 'beneficio' : 'venta'; return t.codigo ? 'invitacion' : 'interna'; }
  var CLASES = { venta: '🎟️ Ticket a la venta', socio: '🤝 Ticket de socio (se valida)', beneficio: '⭐ Grupo con precio especial (código)', invitacion: '✉️ Invitación / cortesía' };
  var famAbiertas = {};
  V.tipos = function () {
    api('tipos').then(function (r) {
      var T = r.tipos; cache.tipos = T.map(function (t) { return { id: t.id, nombre: t.nombre }; }); cache.tiposFull = T;
      var est = { venta: ['ok', 'En venta'], agotado: ['mal', 'Agotado'], finalizado: ['', 'Terminó'], proximamente: ['az', 'Próximamente'], reservado: ['am', 'Reservado'], oculto: ['', 'No se ve en la tienda'] };
      var chipE = function (t) { var e = est[t.estadoWeb] || ['', t.estadoWeb]; if (!(t.precio > 0) && t.estadoWeb === 'venta') e = ['ok', 'Inscripción abierta']; return '<span class="chip ' + e[0] + '">' + e[1] + '</span>'; };
      var nums = function (t) { return '<span class="nums"><b>' + t.vendidas + '</b>' + (t.cupo ? ' / ' + t.cupo : '') + ' <small>' + (t.precio > 0 ? 'vendidos' : 'inscriptos') + '</small>' + (t.reservadas ? ' <small>· ' + t.reservadas + ' pagando</small>' : '') + ' · <b>' + (t.adentro || 0) + '</b> <small>vinieron</small></span>'; };
      var ventas = T.filter(function (t) { return claseT(t) === 'venta' || claseT(t) === 'socio'; });
      var vigentes = ventas.filter(function (t) { return t.activo && t.estadoWeb !== 'finalizado'; }), viejos = ventas.filter(function (t) { return !(t.activo && t.estadoWeb !== 'finalizado'); });
      var padreDe = function (g) { var p = vigentes.filter(function (v) { return !v.cort && v.precio === g.tachado; })[0]; if (!p) p = vigentes.filter(function (v) { return !v.cort; }).sort(function (a, b) { return b.precio - a.precio; })[0]; return p ? p.id : ''; };
      var benef = T.filter(function (t) { return claseT(t) === 'beneficio'; }), gratis = T.filter(function (t) { return claseT(t) === 'invitacion' || claseT(t) === 'interna'; });
      var acc = function (t) { return (t.codigo ? '<button class="b sec chico" data-cl="' + esc(t.id) + '">🔗 Link</button><button class="b sec chico" data-cm="' + esc(t.id) + '">💬 Mensaje</button>' : '') + '<button class="b sec chico" data-ed="' + esc(t.id) + '">Editar</button>'; };
      var fila = function (t, hijo, verNombre) {
        var precio = t.precio > 0 ? F.plata(t.precio) + (t.tachado > t.precio ? ' <s class="cont">' + F.plata(t.tachado) + '</s>' : '') : 'Sin cargo';
        var chips = (t.codigo ? '<span class="chip am">🔑 ' + esc(t.codigo) + '</span>' : '') + (claseT(t) === 'interna' ? '<span class="chip">📋 La cargás vos</span>' : '') + (claseT(t) === 'invitacion' ? '<span class="chip az">🔗 Se inscriben con el link</span>' : '') +
          (t.credTexto ? '<span class="chip az">🏷️ ' + esc(t.credTexto) + '</span>' : '') + (t.socio || t.cort ? '<span class="chip ok">Cuenta como socio</span>' : '') + (t.agotado ? '<span class="chip mal">Agotado a mano</span>' : '');
        return '<div class="gFila' + (hijo ? ' hijo' : '') + '"><div class="gInfo"><b>' + (hijo ? '↳ ' : '') + esc(verNombre || t.nombre) + '</b> ' + chipE(t) + '<div class="cont" style="margin:4px 0 0">' + precio + ' · ' + nums(t) + '</div>' + (chips ? '<div class="gChips">' + chips + '</div>' : '') + '</div>' +
          '<div class="gAcc">' + (claseT(t) === 'interna' || claseT(t) === 'invitacion' ? '<button class="b ok chico" data-ap="' + esc(t.id) + '">＋ Agregar personas</button>' : '') + acc(t) + '</div></div>';
      };
      var h = cab('Tickets y grupos', 'Pocos tickets y, adentro, grupos con su propio código, cupo y precio. El tope real del salón es el "Cupo total" de Ajustes.', '<button class="b sec" id="bNuevoV">＋ Ticket a la venta</button>');
      h += '<div class="tarj" id="urgBox"><h3>🔥 Urgencia en la tienda</h3><div class="cont">Cargando…</div></div>';
      h += '<div class="tarj"><h3>🎟️ Tickets a la venta</h3>' + (vigentes.length ? vigentes.map(function (v) {
        var hijos = benef.filter(function (g) { return padreDe(g) === v.id; });
        return '<div class="gGrupo">' + fila(v) + hijos.map(function (g) { return fila(g, true); }).join('') + (v.cort ? '' : '<button class="b sec chico gMas" data-nb="' + esc(v.id) + '">＋ Grupo con precio especial (ej: invitados de un speaker)</button>') + '</div>';
      }).join('') : '<div class="cont">No hay tickets a la venta.</div>') +
        (function () { var sueltos = benef.filter(function (g) { return !padreDe(g); }); return sueltos.length ? '<div class="gGrupo">' + sueltos.map(function (g) { return fila(g, true); }).join('') + '</div>' : ''; })() + '</div>';
      // v1.21 · familias: "Speakers · Lucas Dalto" se agrupa en el desplegable "Speakers"
      var famDe = function (g) { var i = String(g.nombre).indexOf(' · '); return i > 0 ? String(g.nombre).slice(0, i).trim() : ''; };
      var fams = {}, ordenF = [], sueltosI = [];
      gratis.forEach(function (g) { var f = famDe(g); if (!f) { sueltosI.push(g); return; } if (!fams[f]) { fams[f] = []; ordenF.push(f); } fams[f].push(g); });
      var famHtml = ordenF.map(function (f) {
        var L = fams[f], ins = L.reduce(function (a, g) { return a + (g.vendidas || 0); }, 0), cup = L.reduce(function (a, g) { return a + (Number(g.cupo) || 0); }, 0), vin = L.reduce(function (a, g) { return a + (g.adentro || 0); }, 0);
        return '<details class="gGrupo gFam"' + (famAbiertas[f] ? ' open' : '') + ' data-fam="' + esc(f) + '"><summary><b>' + esc(f) + '</b> <span class="cont">· ' + L.length + ' grupo' + (L.length === 1 ? '' : 's') + ' · <b>' + ins + '</b>' + (cup ? ' / ' + cup : '') + ' inscriptos · <b>' + vin + '</b> vinieron</span></summary>' +
          L.map(function (g) { return fila(g, true, String(g.nombre).slice(String(g.nombre).indexOf(' · ') + 3)); }).join('') +
          '<button class="b sec chico gMas" data-nf="' + esc(f) + '">＋ Agregar a ' + esc(f) + '</button></details>';
      }).join('');
      h += '<div class="tarj"><div class="fila" style="flex-wrap:wrap;gap:8px"><h3 class="crece" style="margin:0">✉️ Invitaciones y cortesías (sin cargo)</h3><button class="b sec" id="bNuevaFam">＋ Nueva familia (ej: Speakers)</button><button class="b ok" id="bNuevoI">＋ Grupo de invitados</button></div>' +
        '<div class="cont">Cada grupo: la lista la cargás vos (＋ Agregar personas) y, si le ponés código, también se pueden inscribir solos con el link. Sin código nunca se ven en la tienda. Los grupos que se llaman "Familia · Nombre" (ej: "Speakers · Lucas Dalto") se agrupan solos en un desplegable.</div>' +
        famHtml + sueltosI.map(function (g) { return '<div class="gGrupo">' + fila(g) + '</div>'; }).join('') + (gratis.length ? '' : '<div class="cont">Todavía no hay grupos.</div>') + '</div>';
      if (viejos.length) h += '<details class="tarj"><summary><b>Terminados o pausados (' + viejos.length + ')</b></summary>' + viejos.map(function (v) { return '<div class="gGrupo">' + fila(v) + '</div>'; }).join('') + '</details>';
      $('main').innerHTML = h; pintarUrg();
      var porId = {}; T.forEach(function (t) { porId[t.id] = t; });
      $('bNuevoV').onclick = function () { editarTipo({ nombre: '', precio: '', cupo: 100, activo: true }, 'venta'); };
      $('bNuevoI').onclick = function () { editarTipo({ nombre: '', precio: 0, cupo: 20, activo: true }, 'invitacion'); };
      var nuevoEnFam = function (f) { famAbiertas[f] = true; editarTipo({ nombre: f + ' · ', precio: 0, cupo: 5, activo: true, _auto: true }, 'invitacion'); };
      $('bNuevaFam').onclick = function () { var f = prompt('Nombre de la familia (ej: Speakers, Prensa, Comisión):', 'Speakers'); f = String(f || '').replace(/·/g, '').trim(); if (f) nuevoEnFam(f); };
      Array.prototype.forEach.call($('main').querySelectorAll('details.gFam'), function (d) { d.addEventListener('toggle', function () { famAbiertas[d.getAttribute('data-fam')] = d.open; }); });
      $('main').onclick = function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.hasAttribute('data-ed')) return editarTipo(porId[b.getAttribute('data-ed')]);
        if (b.hasAttribute('data-nb')) { var p = porId[b.getAttribute('data-nb')]; return editarTipo({ nombre: '', precio: '', tachado: p.precio, cupo: 20, activo: true, codigo: '' }, 'beneficio'); }
        if (b.hasAttribute('data-ap')) return cortesias(b.getAttribute('data-ap'), V.tipos);
        if (b.hasAttribute('data-nf')) return nuevoEnFam(b.getAttribute('data-nf'));
        if (b.hasAttribute('data-cl')) return copiarTxt(linkBenef(porId[b.getAttribute('data-cl')].codigo), '✓ Link copiado');
        if (b.hasAttribute('data-cm')) return copiarTxt(mensajeBenef(porId[b.getAttribute('data-cm')]), '✓ Mensaje copiado: pegalo en WhatsApp');
      };
    }).catch(fallo);
  };
  // v1.20 · banner de urgencia en la tienda (cuenta regresiva REAL: a esa hora la venta online se cierra sola)
  function pintarUrg(u) {
    if (!u) { api('urgencia').then(function (r) { pintarUrg(r.urgencia); }).catch(function () { if ($('urgBox')) $('urgBox').hidden = true; }); return; }
    var box = $('urgBox'); if (!box) return;
    var loc = function (ms) { if (!ms) return ''; var d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
    box.innerHTML = '<div class="interr"><div class="t"><b>🔥 Banner "Últimos días" en la tienda</b><small>Arriba de los tickets: animado, con cuenta regresiva hasta el cierre. En los tickets con 15 lugares o menos ya aparece "¡Últimos lugares!" (siempre real).</small></div><label class="sw"><input type="checkbox" id="urgOn"' + (u.on ? ' checked' : '') + '><span></span></label></div>' +
      '<div class="fila" style="margin-top:10px;gap:8px;flex-wrap:wrap"><label class="et2" for="urgCierre" style="margin:0">Cierre de la venta online</label><input class="campo2" type="datetime-local" id="urgCierre" value="' + loc(u.cierre) + '" style="width:auto"><button class="b sec chico" id="urgG">Guardar hora</button><button class="b sec chico" id="urgSin">Sin hora</button></div>' +
      '<div class="cont">⚠️ La cuenta regresiva es de verdad: <b>a esa hora la venta online se cierra sola</b>. Sin hora, el banner dice "Últimos días para inscribirte · Cupos limitados".</div>';
    $('urgOn').onchange = function () { var el = this; api('urgenciaGuardar', { on: el.checked }).then(function (r) { toast(el.checked ? '✓ Banner prendido' : '✓ Banner apagado'); pintarUrg(r.urgencia); }).catch(function (e) { el.checked = !el.checked; fallo(e); }); };
    $('urgG').onclick = function () { var v = $('urgCierre').value; if (!v) { toast('Elegí día y hora.', true); return; } var ms = new Date(v).getTime(); if (!confirm('¿La venta online se cierra sola el ' + new Date(ms).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) + '?')) return; boton(this, api('urgenciaGuardar', { cierre: ms })).then(function (r) { toast(r.msj); pintarUrg(r.urgencia); }).catch(fallo); };
    $('urgSin').onclick = function () { boton(this, api('urgenciaGuardar', { cierre: 0 })).then(function (r) { toast('✓ Sin hora de cierre'); pintarUrg(r.urgencia); }).catch(fallo); };
  }
  /** Formulario de un ticket o grupo: según "qué es", muestra solo los campos que corresponden. */
  function editarTipo(t, claseNueva) {
    var nuevo = !t.id, cl = claseNueva || claseT(t);
    var gen = (cache.tiposFull || []).filter(function (x) { return claseT(x) === 'venta' && x.activo; }).sort(function (a, b) { return b.precio - a.precio; })[0];
    var opc = Object.keys(CLASES).map(function (k) { return '<option value="' + k + '"' + (k === (cl === 'interna' ? 'invitacion' : cl) ? ' selected' : '') + '>' + CLASES[k] + '</option>'; }).join('');
    var ck = function (k, txt, v, sub) { return '<label class="chk2" data-c="' + k + '"><input type="checkbox" data-k="' + k + '"' + (v ? ' checked' : '') + '> ' + txt + (sub ? ' <small class="cont">' + sub + '</small>' : '') + '</label>'; };
    var cp = function (k, et, v, extra, cls) { return '<div data-c="' + k + '"' + (cls ? ' class="' + cls + '"' : '') + '><label class="et2">' + et + '</label><input class="campo2" data-k="' + k + '" value="' + esc(v == null ? '' : v) + '"' + (extra || '') + '></div>'; };
    modal('<h3>' + (nuevo ? 'Nuevo' : 'Editar') + ': ' + esc(t.nombre || '') + '</h3>' +
      '<label class="et2">¿Qué es?</label><select class="campo2" id="tClase"' + (nuevo ? '' : ' disabled') + '>' + opc + '</select>' +
      '<div class="form" id="tForm">' + cp('nombre', 'Nombre', t.nombre, ' placeholder="Ej: Invitados de Natt"', 'ancho') + cp('desc', 'Texto en la tienda (opcional)', t.desc, ' placeholder="Ej: Ticket con beneficio para la comunidad de Natt"', 'ancho') +
      cp('precio', 'Precio', t.precio, ' type="number" min="0" step="500"') + cp('tachado', 'Precio tachado (antes)', t.tachado || '', ' type="number" min="0" step="500" placeholder="' + (gen ? gen.precio : '') + '"') + cp('cupo', 'Cupo', t.cupo, ' type="number" min="0"') +
      '<div data-c="codigo" class="ancho"><label class="et2" id="tCodEt">Código de acceso</label><div class="fila" style="gap:6px;flex-wrap:nowrap"><input class="campo2" data-k="codigo" value="' + esc(t.codigo || '') + '" style="text-transform:uppercase;font-family:monospace;font-weight:700"><button class="b sec" type="button" id="tGen">Generar</button></div></div>' +
      cp('credTexto', 'Credencial: texto en vez de la empresa (opcional)', t.credTexto, ' placeholder="Ej: Prensa · Eventos y Negocios"', 'ancho') +
      cp('desde', 'Venta desde (opcional)', t.desde, ' type="datetime-local"') + cp('hasta', 'Venta hasta (opcional)', t.hasta, ' type="datetime-local"') + '</div>' +
      '<div class="fila" style="gap:16px;flex-wrap:wrap;margin-top:8px">' + ck('autoins', 'Se pueden inscribir solos con un link/código', !!t.codigo || !!t._auto, '') + ck('activo', 'Activo', t.activo !== false) + ck('agotado', 'Agotado', t.agotado) + ck('socio', 'Cuenta como socio', t.socio, '(sin punto en la credencial)') + '</div>' +
      '<div class="cont" id="tAyuda"></div><div class="acc"><button class="b pri" id="tGuardar">Guardar</button><button class="b sec" id="tCancelar">Cancelar</button></div>');
    var vis = { venta: ['nombre', 'desc', 'precio', 'cupo', 'desde', 'hasta', 'activo', 'agotado', 'socio'], socio: ['nombre', 'desc', 'precio', 'cupo', 'activo', 'agotado'],
      beneficio: ['nombre', 'desc', 'precio', 'tachado', 'cupo', 'codigo', 'credTexto', 'activo', 'agotado', 'socio'], invitacion: ['nombre', 'desc', 'cupo', 'autoins', 'codigo', 'credTexto', 'socio', 'agotado'] };
    var ayuda = { venta: 'Lo ve todo el público en la tienda.', socio: 'Se pide empresa + CUIT y queda "En revisión" hasta que validás la membresía.', beneficio: 'Solo lo ven quienes tienen el código o el link. El precio tachado aparece al lado.',
      invitacion: 'Sin cargo. La lista la cargás vos con "＋ Agregar personas". Si tildás "Se pueden inscribir solos", con el link completan sus datos y reciben el QR al instante.' };
    var q = function (k) { return $('mCont').querySelector('[data-k="' + k + '"]'); };
    function mostrar() {
      var c = $('tClase').value, v = vis[c], auto = q('autoins').checked;
      Array.prototype.forEach.call($('mCont').querySelectorAll('[data-c]'), function (el) { var k = el.getAttribute('data-c'); el.hidden = v.indexOf(k) < 0 || (k === 'codigo' && c === 'invitacion' && !auto); });
      $('tAyuda').textContent = ayuda[c];
    }
    $('tClase').onchange = mostrar; q('autoins').onchange = function () { if (this.checked && !q('codigo').value) q('codigo').value = generarCodigo(q('nombre').value); mostrar(); };
    $('tGen').onclick = function () { if (q('codigo').value.trim() && !confirm('¿Reemplazar el código actual? El link viejo deja de funcionar.')) return; q('codigo').value = generarCodigo(q('nombre').value); };
    if (cl === 'beneficio' && nuevo && !q('codigo').value) q('codigo').value = '';
    mostrar(); $('tCancelar').onclick = cerrarModal;
    var nm = q('nombre'), alFinal = function () { if (/·\s*$/.test(nm.value)) setTimeout(function () { nm.setSelectionRange(nm.value.length, nm.value.length); }, 0); };
    nm.addEventListener('focus', alFinal); nm.addEventListener('mouseup', alFinal);
    if (t._auto) setTimeout(function () { nm.focus(); nm.setSelectionRange(nm.value.length, nm.value.length); }, 50);
    $('tGuardar').onclick = function () {
      var c = $('tClase').value, val = function (k) { var el = q(k); return el.type === 'checkbox' ? el.checked : el.value; };
      var d = { nombre: val('nombre').trim(), desc: val('desc'), cupo: val('cupo'), activo: c === 'invitacion' ? true : val('activo'), agotado: val('agotado'), socio: c === 'socio' ? false : val('socio'),
        cort: c === 'socio', precio: c === 'invitacion' ? 0 : val('precio'), tachado: c === 'beneficio' ? val('tachado') : '', codigo: (c === 'beneficio' || (c === 'invitacion' && val('autoins'))) ? val('codigo') : '',
        credTexto: (c === 'beneficio' || c === 'invitacion') ? val('credTexto') : '', desde: c === 'venta' ? val('desde') : (t.desde || ''), hasta: c === 'venta' ? val('hasta') : (t.hasta || '') };
      if (!d.nombre) return toast('Poné el nombre.', true);
      if (/·\s*$/.test(d.nombre)) { q('nombre').focus(); return toast('Completá el nombre después de "·" (ej: Speakers · Lucas Dalto).', true); }
      if (c === 'invitacion' && val('autoins') && !String(d.codigo).trim()) { d.codigo = generarCodigo(d.nombre); q('codigo').value = d.codigo; }
      if (c === 'beneficio' && !String(d.codigo).trim()) return toast('Un grupo con precio especial necesita código (tocá Generar).', true);
      if ((c === 'venta' || c === 'beneficio' || c === 'socio') && !(Number(d.precio) > 0)) return toast('Poné el precio.', true);
      var antes = t.codigo || '';
      if (antes && String(d.codigo).trim().toUpperCase().replace(/\s+/g, '-') !== antes && !confirm(d.codigo ? '¿Cambiar el código? El link viejo deja de funcionar (los tickets ya emitidos siguen valiendo).' : '¿Sacar el código? Ya no se van a poder inscribir solos con el link.')) return;
      boton(this, api('tipoGuardar', { tipoId: t.id || '', datos: d })).then(function (r2) { cerrarModal(); toast(r2.msj); V.tipos(); }).catch(fallo);
    };
  }

  // ── Facturación ──
  var fF = 'pend';
  V.facturar = function () {
    api('facturar').then(function (r) {
      cache.facturas = r.facturas;
      $('main').innerHTML = cab('Facturación', 'Una fila por compra pagada. Marcá "Facturada" y anotá el número cuando la emitas.', '<button class="b sec" id="bCsvF">⬇︎ Exportar</button>') +
        '<div class="fila" style="margin-bottom:10px"><div class="seg" id="fSeg"><button data-v="pend"' + (fF === 'pend' ? ' class="on"' : '') + '>Sin facturar</button><button data-v="todas"' + (fF === 'todas' ? ' class="on"' : '') + '>Todas</button></div></div>' +
        '<div class="cont" id="fCont"></div><div class="scroll"><table class="tabla"><thead><tr><th>Fecha</th><th>Razón social</th><th>Detalle</th><th class="num">Total</th><th>Facturada</th><th>N° factura</th><th>Notas</th><th></th></tr></thead><tbody id="fBody"></tbody></table></div>';
      $('fSeg').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; fF = b.getAttribute('data-v'); Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); }); pintarF(); };
      $('bCsvF').onclick = function () { csv('facturacion', [['Orden', 'Fecha', 'Cond. IVA', 'Razón social', 'CUIT/DNI', 'Domicilio', 'Detalle', 'Total', 'Mail', 'Pago MP', 'Facturada', 'N° factura', 'Notas']].concat(listaF().map(function (f) { return [f.orden, fecha(f.fecha, true), f.iva, f.razon, f.cuit, f.domicilio, f.detalle, f.total, f.mail, f.pago, f.facturada ? 'Sí' : 'No', f.nro, f.notas]; }))); };
      $('fBody').onclick = function (e) {
        var b = e.target.closest('button[data-g]'); if (!b) return;
        var tr = b.closest('tr');
        boton(b, api('facturarGuardar', { id: tr.getAttribute('data-o'), facturada: tr.querySelector('[data-f]').checked, nro: tr.querySelector('[data-n]').value, notas: tr.querySelector('[data-t]').value })).then(function (r2) { cache.facturas = r2.facturas; toast(r2.msj); pintarF(); }).catch(fallo);
      };
      pintarF();
    }).catch(fallo);
  };
  function listaF() { return (cache.facturas || []).filter(function (f) { return fF === 'todas' || !f.facturada; }); }
  function pintarF() {
    var l = listaF();
    $('fCont').textContent = l.length + ' · ' + plata(l.reduce(function (a, f) { return a + f.total; }, 0));
    $('fBody').innerHTML = l.map(function (f) {
      return '<tr data-o="' + esc(f.orden) + '"><td>' + fecha(f.fecha) + '<small style="font-family:monospace">' + esc(f.orden) + '</small></td><td><b>' + esc(f.razon) + '</b><small>' + esc(f.iva) + ' · ' + esc(f.cuit) + '</small><small>' + esc(f.domicilio || '') + '</small></td><td>' + esc(f.detalle) + '<small>' + esc(f.mail) + '</small></td><td class="num">' + plata(f.total) + '</td>' +
        '<td><input type="checkbox" data-f style="width:18px;height:18px"' + (f.facturada ? ' checked' : '') + '></td><td><input class="campo2" data-n style="width:130px" value="' + esc(f.nro) + '"></td><td><input class="campo2" data-t style="width:160px" value="' + esc(f.notas) + '"></td><td><button class="b sec chico" data-g>Guardar</button></td></tr>';
    }).join('') || '<tr><td colspan="8" class="vacio">' + (fF === 'pend' ? 'Todo facturado 🎉' : 'Sin compras todavía.') + '</td></tr>';
  }


  // ── Página personal (lo que abre el QR del sticker) ──
  var tPreg = null, fP = { charla: '', estado: 'activas' };
  // ── v1.18 · Reporte para compartir (se abre en una pestaña y se guarda como PDF con Imprimir) ──
  function reporte(modo) {
    var w = window.open('', '_blank'); if (!w) { toast('Permití ventanas emergentes para ver el reporte.', true); return; }
    w.document.write('<p style="font-family:Arial;padding:30px">Armando el reporte…</p>');
    Promise.all([api('inicio'), api('personal')]).then(function (rs) {
      var I = rs[0].resumen, Pu = rs[0].puerta, P = rs[1].personal, ev = S.evento || {}, interno = modo !== 'speakers';
      var estr = function (n) { n = Math.round(n || 0); return '★★★★★'.slice(0, n) + '<span style="color:#ccc">' + '★★★★★'.slice(n) + '</span>'; };
      var charlas = {}; (P.cal || []).forEach(function (c) { charlas[c.charla] = { cal: c, preg: [] }; });
      (P.preguntas || []).forEach(function (q) { if (q.estado === 'Oculta') return; (charlas[q.charla] = charlas[q.charla] || { cal: null, preg: [] }).preg.push(q); });
      var bloqueCharla = function (nombre, x) {
        var c = x.cal, h = '<section><h2>🎤 ' + esc(nombre) + '</h2>';
        if (c) h += '<div class="kpis"><div><b>' + c.prom + ' ★</b><small>promedio</small></div><div><b>' + c.n + '</b><small>calificaciones</small></div><div><b>' + x.preg.length + '</b><small>preguntas</small></div></div>' +
          '<p class="dist">' + c.dist.map(function (n, k) { return (k + 1) + '★ ' + n; }).join(' · ') + '</p>';
        else h += '<p class="dist">Sin calificaciones · ' + x.preg.length + ' preguntas</p>';
        var com = c ? c.resp.filter(function (r) { return r.comentario; }) : [];
        if (com.length) h += '<h3>Comentarios</h3><ul>' + com.map(function (r) { return '<li>' + estr(r.estrellas) + ' ' + esc(r.comentario) + (interno ? ' <small>— ' + esc(r.nombre) + (r.empresa ? ', ' + esc(r.empresa) : '') + '</small>' : '') + '</li>'; }).join('') + '</ul>';
        if (x.preg.length) h += '<h3>Preguntas del público</h3><ul>' + x.preg.map(function (q) { return '<li>' + esc(q.texto) + (interno && q.nombre ? ' <small>— ' + esc(q.nombre) + (q.empresa ? ', ' + esc(q.empresa) : '') + '</small>' : '') + (q.estado === 'Respondida' ? ' <small class="ok">✓ respondida</small>' : '') + '</li>'; }).join('') + '</ul>';
        return h + '</section>';
      };
      var h = '<!doctype html><html><head><meta charset="utf-8"><title>Reporte · ' + esc(ev.nombre || 'Evento') + '</title><style>' +
        'body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#13233A;max-width:820px;margin:0 auto;padding:28px}h1{margin:0;font-size:26px}h2{font-size:19px;margin:0 0 8px;color:#0B2240}h3{font-size:14px;margin:14px 0 6px;color:#5F6B7D;text-transform:uppercase;letter-spacing:1px}' +
        'section{border:1px solid #DCE3EC;border-radius:14px;padding:16px 18px;margin-top:16px;page-break-inside:avoid}.kpis{display:flex;gap:12px;flex-wrap:wrap}.kpis div{background:#F3F6FA;border-radius:10px;padding:10px 14px;min-width:110px}.kpis b{display:block;font-size:22px}.kpis small,.sub{color:#5F6B7D}' +
        'ul{margin:0;padding-left:18px}li{margin:4px 0;line-height:1.4}small{color:#5F6B7D}.dist{color:#5F6B7D;font-size:13px;margin:8px 0 0}table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:6px 4px;border-bottom:1px solid #EEF1F5;text-align:left}td.n,th.n{text-align:right}.ok{color:#11663A}' +
        '.bar{display:flex;gap:8px;justify-content:flex-end}.bar button{font:inherit;font-weight:700;padding:10px 16px;border-radius:10px;border:0;background:#1E6FD9;color:#fff;cursor:pointer}@media print{.bar{display:none}body{padding:0}}</style></head><body>' +
        '<div class="bar"><button onclick="window.print()">Guardar como PDF / Imprimir</button></div>' +
        '<h1>' + esc(ev.nombre || 'Evento') + '</h1><div class="sub">' + esc([ev.fecha, ev.lugar].filter(Boolean).join(' · ')) + ' · ' + (interno ? 'Reporte interno' : 'Reporte para speakers (sin datos personales)') + ' · ' + esc(I.hora || '') + '</div>';
      h += '<section><h2>👥 Asistencia</h2><div class="kpis"><div><b>' + I.validos + '</b><small>inscriptos</small></div><div><b>' + Pu.adentro + '</b><small>vinieron</small></div>' +
        (interno && P.net ? '<div><b>' + P.net.comparten + '</b><small>en el directorio</small></div><div><b>' + ((P.net.dir || {}).conexiones || 0) + '</b><small>conexiones</small></div>' : '') + '</div>' +
        (interno ? '<h3>Por ticket y grupo</h3><table><tr><th>Ticket / grupo</th><th class="n">Inscriptos</th><th class="n">Vinieron</th></tr>' + I.tipos.filter(function (t) { return t.vendidos + t.cortesias + t.revision > 0; }).map(function (t) { return '<tr><td>' + esc(t.nombre) + '</td><td class="n">' + (t.vendidos + t.cortesias + t.revision) + '</td><td class="n">' + t.adentro + '</td></tr>'; }).join('') + '</table>' : '') + '</section>';
      var nombres = Object.keys(charlas); if (!nombres.length) h += '<section><p>Todavía no hay calificaciones ni preguntas.</p></section>';
      nombres.forEach(function (n) { h += bloqueCharla(n, charlas[n]); });
      if (interno && P.encuesta && P.encuesta.resultados && P.encuesta.resultados.length) {
        h += '<section><h2>⭐ Encuesta de satisfacción</h2><p class="sub">' + P.encuesta.respuestas + ' personas respondieron</p>' + P.encuesta.resultados.map(function (r) {
          var d = r.tipo === 'estrellas' ? (r.promedio == null ? '—' : r.promedio + ' ★ · ' + r.dist.map(function (n, k) { return (k + 1) + '★ ' + n; }).join(' · ')) : r.tipo === 'opciones' ? r.dist.map(function (x) { return esc(x.op) + ': ' + x.n; }).join(' · ') : '<ul>' + r.textos.slice(0, 40).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
          return '<h3>' + esc(r.texto) + '</h3><div>' + d + '</div>'; }).join('') + '</section>';
      }
      if (interno && P.net && P.net.dir) { var a = P.net.dir.acciones || {}; h += '<section><h2>🤝 Directorio</h2><div class="kpis"><div><b>' + (a.whatsapp || 0) + '</b><small>WhatsApp</small></div><div><b>' + (a.agendar || 0) + '</b><small>agendados</small></div><div><b>' + (a.destacar || 0) + '</b><small>destacados</small></div></div>' + (P.net.dir.top && P.net.dir.top.length ? '<p class="dist">Más destacados: ' + P.net.dir.top.map(function (x) { return esc(x.nombre) + ' (' + x.n + ')'; }).join(' · ') + '</p>' : '') + '</section>'; }
      w.document.open(); w.document.write(h + '</body></html>'); w.document.close();
    }).catch(function (e) { w.close(); fallo(e); });
  }
  V.personal = function () {
    clearInterval(tPreg);
    api('personal').then(function (r) { pintarPersonal(r.personal); tPreg = setInterval(function () { if (vista !== 'personal') { clearInterval(tPreg); return; } if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; api('personal').then(function (r2) { cache.personal = r2.personal; pintarPreguntas(); }).catch(function () { }); }, 20000); }).catch(fallo);
  };
  function pintarPersonal(P) {
    cache.personal = P; var a = P.ajustes;
    var sw = function (k, t, sub) { return '<div class="interr"><div class="t"><b>' + t + '</b><small>' + sub + '</small></div><label class="sw"><input type="checkbox" data-aj="' + k + '"' + (a[k] ? ' checked' : '') + '><span></span></label></div>'; };
    var calCard = (function (L) {
      if (!L || !L.length) return '<div class="tarj"><h3>⭐ Calificación de las charlas</h3><div class="cont">Todavía nadie calificó. Al terminar cada charla, a los asistentes les aparece la pregunta en su página.</div></div>';
      return '<div class="tarj"><h3>⭐ Calificación de las charlas</h3><div class="cont">Confidencial para los asistentes (no se comparte con los speakers). Acá ves quién calificó.</div>' + L.map(function (c, i) {
        return '<details class="bloque" style="margin-top:8px"><summary><b>' + esc(c.charla) + '</b> · ' + (c.prom == null ? '—' : c.prom + ' ★') + ' · ' + c.n + ' calificación' + (c.n === 1 ? '' : 'es') + ' <span class="cont">(' + c.dist.map(function (n, k) { return (k + 1) + '★ ' + n; }).join(' · ') + ')</span></summary>' +
          '<table class="tabla"><tbody>' + c.resp.map(function (x) { return '<tr><td><b>' + esc(x.nombre) + '</b><small>' + esc(x.empresa || '') + '</small></td><td style="white-space:nowrap">' + '★★★★★'.slice(0, x.estrellas) + '<span style="opacity:.25">' + '★★★★★'.slice(x.estrellas) + '</span></td><td>' + esc(x.comentario || '') + '</td></tr>'; }).join('') + '</tbody></table></details>';
      }).join('') + '<div class="acc"><button class="b sec" id="calCsv">⬇︎ Exportar calificaciones</button></div></div>';
    })(P.cal);
    $('main').innerHTML = cab('App del asistente', 'Lo que ve cada asistente al escanear el QR de su sticker (página personal). Se prende y se apaga desde acá.', '<button class="b pri" id="bRep">📄 Reporte del evento</button><button class="b sec" id="bRepS">📄 Reporte para speakers</button>') +
      '<div class="tarj"><h3>Qué se muestra</h3>' + sw('PREG_ON', 'Preguntas a las charlas', 'Mandan preguntas al speaker desde el celular. Las moderás abajo.') + sw('CAL_ON', 'Calificar cada charla', 'Al terminar cada charla se les pregunta qué les pareció (1 a 5 ★ y comentario). Confidencial.') + sw('NET_ON', 'Directorio (networking)', 'Se suman al directorio y ven a quienes también se sumaron. En la puerta se les pregunta.') + sw('ENC_ON', 'Encuesta de satisfacción', 'Prendela al final de la jornada.') + '</div>' + calCard +
      '<div class="tarj"><h3>Wifi y aviso</h3><div class="form"><div><label class="et2" for="aWr">Red wifi</label><div class="fila"><input class="campo2 crece" id="aWr" value="' + esc(a.WIFI_RED) + '" placeholder="Nombre de la red"><button class="b sec chico" data-g="WIFI_RED" data-i="aWr">Guardar</button></div></div>' +
      '<div><label class="et2" for="aWc">Clave wifi</label><div class="fila"><input class="campo2 crece" id="aWc" value="' + esc(a.WIFI_CLAVE) + '" placeholder="Contraseña"><button class="b sec chico" data-g="WIFI_CLAVE" data-i="aWc">Guardar</button></div></div>' +
      '<div class="ancho"><label class="et2" for="aAv">Aviso arriba de la agenda</label><div class="fila"><input class="campo2 crece" id="aAv" value="' + esc(a.AVISO) + '" placeholder="Ej: Empezamos 10 minutos tarde"><button class="b sec chico" data-g="AVISO" data-i="aAv">Guardar</button></div><div class="cont">Lo ven todos (QR del dorso y del sticker). Borralo y guardá para sacarlo.</div></div></div></div>' +
      '<div class="tarj"><div class="fila"><h3 class="crece" style="margin:0">🎤 Preguntas</h3><select class="campo2" id="pfCharla" style="width:auto"></select><div class="seg" id="pfEst"><button data-v="activas"' + (fP.estado === 'activas' ? ' class="on"' : '') + '>Para moderar</button><button data-v="Elegida"' + (fP.estado === 'Elegida' ? ' class="on"' : '') + '>Elegidas</button><button data-v="todas"' + (fP.estado === 'todas' ? ' class="on"' : '') + '>Todas</button></div></div><div class="cont">Se actualiza sola cada 20 segundos.</div><div id="pfLista"></div></div>' +
      '<div class="tarj"><h3>⭐ Encuesta</h3><div class="cont">' + P.encuesta.respuestas + ' persona(s) respondieron.</div><div id="encRes"></div><h3 style="margin-top:18px">Preguntas de la encuesta</h3><div id="encEd"></div><div class="acc"><button class="b sec" id="encMas">＋ Agregar pregunta</button><button class="b pri" id="encGuardar">Guardar preguntas</button></div></div>' +
      '<div class="tarj"><h3>🤝 Directorio Eventos y Negocios</h3><div class="grilla"><div class="kpi"><small>En el directorio</small><b>' + P.net.comparten + '</b></div><div class="kpi"><small>No quisieron</small><b>' + P.net.noComparten + '</b></div><div class="kpi"><small>Sin responder</small><b>' + P.net.sinRespuesta + '</b></div></div>' +
      (function (d) { if (!d) return ''; var a = d.acciones || {};
        return '<div class="grilla" style="margin-top:10px"><div class="kpi"><small>Conexiones</small><b>' + (d.conexiones || 0) + '</b></div><div class="kpi"><small>Lo usaron</small><b>' + (d.activos || 0) + '</b></div><div class="kpi"><small>WhatsApp</small><b>' + (a.whatsapp || 0) + '</b></div><div class="kpi"><small>Agendados</small><b>' + (a.agendar || 0) + '</b></div><div class="kpi"><small>Destacados</small><b>' + (a.destacar || 0) + '</b></div></div>' +
          '<div class="cont">Conexiones = pares de personas en las que una destacó, agendó o le escribió a la otra. El detalle queda en la pestaña <b>Directorio</b> de la planilla.</div>' +
          (d.top && d.top.length ? '<div class="cont"><b>Más destacados:</b> ' + d.top.map(function (x) { return esc(x.nombre) + ' (' + x.n + ')'; }).join(' · ') + '</div>' : ''); })(P.net.dir) + '</div>';
    $('main').onchange = function (e) {
      var i = e.target; if (!i.hasAttribute('data-aj')) return; var k = i.getAttribute('data-aj'), v = i.checked;
      api('personalAjuste', { clave: k, valor: v }).then(function () { toast(v ? '✓ Prendido' : '✓ Apagado'); }).catch(function (e2) { i.checked = !v; fallo(e2); });
    };
    $('main').onclick = function (e) {
      var rb = e.target.closest('#bRep, #bRepS'); if (rb) { reporte(rb.id === 'bRepS' ? 'speakers' : 'interno'); return; }
      var b = e.target.closest('button[data-g]'); if (b) { boton(b, api('personalAjuste', { clave: b.getAttribute('data-g'), valor: $(b.getAttribute('data-i')).value })).then(function () { toast('✓ Guardado'); }).catch(fallo); return; }
      var pe = e.target.closest('button[data-pf]'); if (pe) { boton(pe, api('pregEstado', { fila: pe.getAttribute('data-pf'), estado: pe.getAttribute('data-e') })).then(function (r) { cache.personal = r.personal; pintarPreguntas(); }).catch(fallo); return; }
    };
    $('pfEst').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; fP.estado = b.getAttribute('data-v'); Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); }); pintarPreguntas(); };
    $('pfCharla').onchange = function () { fP.charla = this.value; pintarPreguntas(); };
    pintarPreguntas(); pintarEncuesta();
  }
  function pintarPreguntas() {
    var P = cache.personal, ch = {}; P.preguntas.forEach(function (q) { ch[q.charla] = (ch[q.charla] || 0) + (q.estado === 'Nueva' ? 1 : 0); });
    var sel = $('pfCharla'); if (!sel) return;
    sel.innerHTML = '<option value="">Todas las charlas</option>' + Object.keys(ch).map(function (c) { return '<option value="' + esc(c) + '"' + (fP.charla === c ? ' selected' : '') + '>' + esc(c) + (ch[c] ? ' (' + ch[c] + ' nuevas)' : '') + '</option>'; }).join('');
    var l = P.preguntas.filter(function (q) { return (!fP.charla || q.charla === fP.charla) && (fP.estado === 'todas' || (fP.estado === 'activas' ? (q.estado === 'Nueva' || q.estado === 'Elegida') : q.estado === fP.estado)); });
    var col = { 'Nueva': '', 'Elegida': 'ok', 'Respondida': 'az', 'Oculta': 'mal' };
    $('pfLista').innerHTML = l.length ? '<div class="scroll" style="margin-top:10px;max-height:60vh"><table class="tabla"><tbody>' + l.map(function (q) {
      var bs = ['Elegida', 'Respondida', 'Oculta'].filter(function (e) { return e !== q.estado; }).map(function (e) { return '<button class="b sec chico" data-pf="' + q.fila + '" data-e="' + e + '">' + { Elegida: '⭐ Elegir', Respondida: '✓ Respondida', Oculta: 'Ocultar' }[e] + '</button>'; }).join(' ');
      return '<tr><td style="width:60%"><b style="font-size:15px">' + esc(q.texto) + '</b><small>' + esc(q.nombre ? q.nombre + (q.empresa ? ' · ' + q.empresa : '') : 'Anónima') + ' · ' + esc(q.charla) + ' · ' + F.hora(q.fecha) + '</small></td><td><span class="chip ' + col[q.estado] + '">' + esc(q.estado) + '</span></td><td class="num">' + bs + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="vacio">' + (P.preguntas.length ? 'No hay preguntas con este filtro.' : 'Todavía no llegaron preguntas.') + '</div>';
  }
  function pintarEncuesta() {
    var E = cache.personal.encuesta, ed = E.preguntas.map(function (q) { return { id: q.id, tipo: q.tipo, texto: q.texto, opciones: (q.opciones || []).join(', ') }; });
    $('encRes').innerHTML = E.resultados.length ? E.resultados.map(function (r) {
      var c = '<div class="socio"><b>' + esc(r.texto) + '</b> <span class="cont">(' + r.n + ' respuestas)</span>';
      if (r.tipo === 'estrellas') c += '<div style="font-size:22px;margin-top:4px">' + (r.promedio == null ? '—' : r.promedio + ' ★') + '</div><div class="cont">' + r.dist.map(function (n, i) { return (i + 1) + '★: ' + n; }).join(' · ') + '</div>';
      else if (r.tipo === 'opciones') c += '<div class="cont">' + r.dist.map(function (d) { return esc(d.op) + ': <b>' + d.n + '</b>'; }).join(' · ') + '</div>';
      else c += r.textos.length ? '<div style="max-height:200px;overflow:auto;margin-top:6px">' + r.textos.map(function (t) { return '<div class="cont">“' + esc(t) + '”</div>'; }).join('') + '</div>' : '<div class="cont">Sin respuestas todavía.</div>';
      return c + '</div>';
    }).join('') + '<div class="acc"><button class="b sec chico" id="encCsv">⬇︎ Exportar textos y puntajes</button></div>' : '<div class="cont">Todavía no armaste preguntas.</div>';
    if ($('calCsv')) $('calCsv').onclick = function () { var f = [['Charla', 'Nombre', 'Empresa', 'Estrellas', 'Comentario']]; (cache.personal.cal || []).forEach(function (c) { c.resp.forEach(function (x) { f.push([c.charla, x.nombre, x.empresa, x.estrellas, x.comentario]); }); }); csv('calificaciones', f); };
    if ($('encCsv')) $('encCsv').onclick = function () { csv('encuesta', [['Pregunta', 'Tipo', 'Respuestas', 'Promedio / detalle']].concat(E.resultados.map(function (r) { return [r.texto, r.tipo, r.n, r.tipo === 'estrellas' ? r.promedio : r.tipo === 'opciones' ? r.dist.map(function (d) { return d.op + ': ' + d.n; }).join(' | ') : r.textos.join(' | ')]; }))); };
    function pintarEd() {
      $('encEd').innerHTML = ed.map(function (q, i) {
        return '<div class="socio" data-i="' + i + '"><div class="fila"><select class="campo2" data-k="tipo" style="width:auto"><option value="estrellas"' + (q.tipo === 'estrellas' ? ' selected' : '') + '>Estrellas (1 a 5)</option><option value="opciones"' + (q.tipo === 'opciones' ? ' selected' : '') + '>Opciones</option><option value="texto"' + (q.tipo === 'texto' ? ' selected' : '') + '>Texto libre</option></select>' +
          '<input class="campo2 crece" data-k="texto" value="' + esc(q.texto) + '" placeholder="Ej: ¿Qué te pareció la jornada?"><button class="b sec chico" data-sub="' + i + '" title="Subir">↑</button><button class="b mal chico" data-del="' + i + '">Quitar</button></div>' +
          (q.tipo === 'opciones' ? '<input class="campo2" data-k="opciones" style="margin-top:8px" value="' + esc(q.opciones) + '" placeholder="Opciones separadas por coma: Sí, No, Tal vez">' : '') + '</div>';
      }).join('') || '<div class="cont">Sin preguntas. Agregá la primera.</div>';
    }
    function leerEd() { Array.prototype.forEach.call($('encEd').querySelectorAll('[data-i]'), function (box) { var q = ed[Number(box.getAttribute('data-i'))]; Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (i) { q[i.getAttribute('data-k')] = i.value; }); }); }
    pintarEd();
    $('encEd').onchange = function (e) { if (e.target.getAttribute('data-k') === 'tipo') { leerEd(); pintarEd(); } };
    $('encEd').onclick = function (e) {
      var d = e.target.closest('[data-del]'), u = e.target.closest('[data-sub]'); if (!d && !u) return; leerEd();
      if (d) ed.splice(Number(d.getAttribute('data-del')), 1);
      if (u) { var i = Number(u.getAttribute('data-sub')); if (i > 0) { var x = ed[i]; ed[i] = ed[i - 1]; ed[i - 1] = x; } }
      pintarEd();
    };
    $('encMas').onclick = function () { leerEd(); ed.push({ tipo: 'estrellas', texto: '', opciones: '' }); pintarEd(); };
    $('encGuardar').onclick = function () {
      leerEd();
      var out = ed.filter(function (q) { return q.texto.trim(); }).map(function (q) { return { id: q.id, tipo: q.tipo, texto: q.texto, opciones: q.tipo === 'opciones' ? q.opciones.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [] }; });
      if (E.respuestas && !confirm('Ya hay respuestas. Si cambiás el texto de una pregunta, sus respuestas viejas quedan aparte. ¿Guardar igual?')) return;
      boton(this, api('encGuardar', { preguntas: out })).then(function (r) { toast(r.msj); cache.personal = r.personal; pintarEncuesta(); }).catch(fallo);
    };
  }

  // ── Mails y certificados ──
  // ── v1.20 · Pantallas del evento ──
  var PANT = [['grandes', 'Pantallas grandes', '2112 × 880'], ['chicas', 'Pantallas chicas', '1056 × 704'], ['foyer', 'TVs del foyer', '1920 × 1080'], ['banner', 'Banner LED', '256 × 768']];
  var VISTAS = [['auto', '🤖', 'Automático', 'Sigue la agenda sola: bienvenida, "ahora habla", breaks con countdown y cierre.'], ['bienvenida', '👋', 'Bienvenida', 'Con countdown a la hora de arranque.'], ['agenda', '📅', 'Agenda', 'Ahora y lo que sigue.'],
    ['completa', '🗓️', 'Agenda completa', 'Todo el día en una placa.'],
    ['ahora', '🎤', 'Ahora habla', 'Placa grande del speaker.'], ['break', '☕', 'Break', 'Con "volvemos a las…" y countdown.'], ['sorteo', '🎁', 'Sorteo', 'Premios, ruleta y ganador (se maneja en 🎁 Sorteo).'], ['aviso', '📣', 'Aviso', 'Texto libre, con countdown opcional.'],
    ['pregunta', '❓', 'Pregunta', 'La última pregunta puesta al aire.'], ['sponsors', '⭐', 'Sponsors', 'Rotan: HIT (main sponsor), El Piave y Bacigaluppi, con AOFREP · Eventos y Negocios entre cada uno.'], ['gracias', '🙏', 'Gracias', 'Cierre del evento.'], ['credencial', '📱', 'Tu credencial', 'Cómo usar la credencial y la app (escaneá el QR).']];
  var SPK = [['', 'El que está hablando ahora'], ['dalto', 'Lucas Dalto'], ['sol', 'Sol Espasandín'], ['bonetto', 'Daniela Bonetto'], ['natt', 'Natt La Regina'], ['piacentini', 'Elisabet Piacentini']];
  var tPant = null, pDest = 'todas', fPg = 'activas';
  V.pantallas = function () {
    clearInterval(tPant);
    Promise.all([api('pantallas'), api('pregLista').catch(function () { return { preguntas: [] }; })]).then(function (rr) {
      cache.pant = rr[0].pantallas; cache.preg = rr[1].preguntas || []; pintarPantallas();
      tPant = setInterval(function () { if (vista !== 'pantallas') { clearInterval(tPant); return; } if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; api('pregLista').then(function (r) { cache.preg = r.preguntas; pintarPregPant(); }).catch(function () { }); }, 20000);
    }).catch(fallo);
  };
  function urlPant(p, extra) { return 'pantalla.html?p=' + p + (extra || ''); }
  function nomVista(v) { var x = VISTAS.find(function (y) { return y[0] === v; }); return x ? x[1] + ' ' + x[2] : v; }
  function pintarPantallas() {
    var C = cache.pant.canales;
    var botones = function (dest) { return '<div class="vBtns">' + VISTAS.map(function (x) { return '<button class="b sec chico" data-vis="' + x[0] + '" data-dest="' + dest + '" title="' + esc(x[3]) + '">' + x[1] + ' ' + esc(x[2]) + '</button>'; }).join('') + '</div>'; };
    $('main').innerHTML = cab('📺 Pantallas', 'Elegí qué muestra cada pantalla: cambia sola en unos 3 segundos, con animación. Lo normal es dejarlas en 🤖 Automático y tocar solo para avisos, preguntas y el sorteo.') +
      '<div class="tarj"><h3>Todas las pantallas a la vez</h3>' + botones('todas') + '</div>' +
      '<div class="tarj"><h3>⚙️ Datos para las placas</h3><div class="form">' +
        '<div><label class="et2" for="pkSpk">Ahora habla</label><select class="campo2" id="pkSpk">' + SPK.map(function (x) { return '<option value="' + x[0] + '">' + esc(x[1]) + '</option>'; }).join('') + '</select></div>' +
        '<div><label class="et2" for="pkBien">Bienvenida: comenzamos a las</label><input class="campo2" id="pkBien" value="10:15" placeholder="10:15"></div>' +
        '<div><label class="et2" for="pkBt">Break: título</label><input class="campo2" id="pkBt" value="" placeholder="Vacío = el de la agenda (Coffee break / Break)"></div>' +
        '<div><label class="et2" for="pkBh">Break: volvemos a las</label><input class="campo2" id="pkBh" value="" placeholder="Vacío = el de la agenda"></div>' +
        '<div class="ancho"><label class="et2" for="pkAt">Aviso: texto grande</label><input class="campo2" id="pkAt" maxlength="90" placeholder="Ej: Volvemos a las 15 hs"></div>' +
        '<div><label class="et2" for="pkAs">Aviso: texto chico (opcional)</label><input class="campo2" id="pkAs" maxlength="160" placeholder="Ej: Gracias por la paciencia"></div>' +
        '<div><label class="et2" for="pkAh">Aviso: countdown hasta (opcional)</label><input class="campo2" id="pkAh" placeholder="15:00"></div></div>' +
        '<div class="cont">Se usan al tocar el botón de esa placa. Las horas van así: 15:30.</div></div>' +
      '<div class="tarj"><h3>🧩 Pixel map · una sola salida para técnica (grande + 2 chicas)</h3>' +
        '<div class="cont" style="margin-bottom:8px">Técnica saca esta salida por una sola HDMI y recorta cada pantalla con estas coordenadas. Lo que elijas acá arriba (por pantalla o "todas") se ve en el pixel map al instante.</div><div class="form">' +
        '<div><label class="et2" for="pmL">Salida (ancho × alto)</label><select class="campo2" id="pmL" onchange="__pm()"><option value="3840x2160">3840 × 2160 (4K)</option><option value="2112x1584">2112 × 1584 (justo)</option><option value="2560x1600">2560 × 1600</option></select></div>' +
        '<div><label class="et2" for="pmG">Grande (x,y) · 2112 × 880</label><input class="campo2" id="pmG" value="0,0" oninput="__pm()"></div>' +
        '<div><label class="et2" for="pmC1">Chica 1 (x,y) · 1056 × 704</label><input class="campo2" id="pmC1" value="0,880" oninput="__pm()"></div>' +
        '<div><label class="et2" for="pmC2">Chica 2 (x,y) · 1056 × 704</label><input class="campo2" id="pmC2" value="1056,880" oninput="__pm()"></div></div>' +
        '<div id="pmTxt" class="cont" style="font-family:ui-monospace,Menlo,monospace;font-size:12.5px;margin:8px 0"></div>' +
        '<div class="acc"><a class="b chico" id="pmA" target="_blank" href="#">↗ Abrir pixel map (para la compu de técnica)</a><a class="b sec chico" id="pmGuia" target="_blank" href="#">🧭 Ver con guía (bordes y medidas, para mapear)</a></div></div>' +
      '<div class="gPant">' + PANT.map(function (x) {
        var c = C[x[0]] || { v: 'auto' };
        return '<div class="tarj pCard" data-p="' + x[0] + '"><div class="fila"><h3 class="crece" style="margin:0">' + esc(x[1]) + ' <small style="font-weight:500;color:var(--suave)">' + x[2] + '</small></h3><span class="chip az" data-ch="' + x[0] + '">' + esc(nomVista(c.v)) + '</span></div>' +
          '<div class="pPrev ' + x[0] + '"><iframe src="' + urlPant(x[0], '&previa=1') + '" tabindex="-1" title="Vista previa ' + esc(x[1]) + '"></iframe></div>' + botones(x[0]) +
          '<div class="acc"><a class="b sec chico" target="_blank" href="' + urlPant(x[0]) + '">↗ Abrir esta pantalla</a><button class="b sec chico" data-png="' + x[0] + '">⬇ Descargar PNG de lo que se ve</button><button class="b sec chico" data-vid="' + x[0] + '">🎬 Descargar video con animación</button></div></div>';
      }).join('') + '</div>' +
      '<div class="tarj"><div class="fila" style="flex-wrap:wrap;gap:8px"><h3 class="crece" style="margin:0">❓ Preguntas del público</h3><label class="et2" style="margin:0">Mandar a</label><select class="campo2" id="pgDest" style="width:auto"><option value="todas">Todas las pantallas</option>' + PANT.map(function (x) { return '<option value="' + x[0] + '"' + (pDest === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>' +
        '<div class="seg" id="pgEst"><button data-v="activas"' + (fPg === 'activas' ? ' class="on"' : '') + '>Para elegir</button><button data-v="todas"' + (fPg === 'todas' ? ' class="on"' : '') + '>Todas</button></div><button class="b sec chico" id="pgRe">↻</button></div>' +
        '<div class="cont">"📺 Al aire" la muestra grande con el nombre de quien preguntó (o "Anónima"). Se actualiza cada 20 segundos.</div><div id="pgLista"></div></div>';
    ajustarPrev(); addEventListener('resize', ajustarPrev);
    $('pgDest').value = pDest; $('pgDest').onchange = function () { pDest = this.value; };
    $('pgEst').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; fPg = b.getAttribute('data-v'); Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); }); pintarPregPant(); };
    $('pgRe').onclick = function () { boton(this, api('pregLista')).then(function (r) { cache.preg = r.preguntas; pintarPregPant(); }).catch(fallo); };
    pintarPregPant();
    $('main').onclick = function (e) {
      var b = e.target.closest('button[data-vis]');
      if (b) {
        var v = b.getAttribute('data-vis'), dest = b.getAttribute('data-dest'), est = { v: v };
        if (v === 'ahora') est.speaker = $('pkSpk').value;
        if (v === 'bienvenida') est.hasta = $('pkBien').value.trim();
        if (v === 'break') { est.titulo = $('pkBt').value.trim(); est.hasta = $('pkBh').value.trim(); }
        if (v === 'aviso') { est.titulo = $('pkAt').value.trim(); est.sub = $('pkAs').value.trim(); est.hasta = $('pkAh').value.trim(); if (!est.titulo) { toast('Escribí el texto del aviso arriba (Datos para las placas).', true); $('pkAt').focus(); return; } }
        boton(b, api('pantallaSet', { canales: dest, estado: est })).then(function (r) { cache.pant = r.pantallas; marcarChips(); toast('✓ ' + (dest === 'todas' ? 'Todas' : (PANT.find(function (x) { return x[0] === dest; }) || [])[1]) + ': ' + nomVista(v)); }).catch(fallo); return;
      }
      var pg = e.target.closest('button[data-png]');
      var vd = e.target.closest('button[data-vid]');
      if (vd) { var pv = vd.getAttribute('data-vid'), cvv = cache.pant.canales[pv] || { v: 'auto' }; window.open(urlPant(pv, '&video=1' + (cvv.v === 'auto' ? '' : '&v=' + encodeURIComponent(cvv.v) + '&titulo=' + encodeURIComponent(cvv.titulo || '') + '&sub=' + encodeURIComponent(cvv.sub || '') + '&hasta=' + encodeURIComponent(cvv.hasta || '') + '&speaker=' + encodeURIComponent(cvv.speaker || ''))), '_blank'); return; }
      if (pg) { var p = pg.getAttribute('data-png'), c = cache.pant.canales[p] || { v: 'auto' }; window.open(urlPant(p, '&descargar=1&quieto=1&sinentrada=1&v=' + encodeURIComponent(c.v === 'auto' ? 'agenda' : c.v) + '&titulo=' + encodeURIComponent(c.titulo || '') + '&sub=' + encodeURIComponent(c.sub || '') + '&hasta=' + encodeURIComponent(c.hasta || '') + '&speaker=' + encodeURIComponent(c.speaker || '') + (c.pregunta ? '&pt=' + encodeURIComponent(c.pregunta.texto) + '&pn=' + encodeURIComponent(c.pregunta.nombre || '') + '&pe=' + encodeURIComponent(c.pregunta.empresa || '') + '&pc=' + encodeURIComponent(c.pregunta.charla || '') : '')), '_blank'); return; }
      var al = e.target.closest('button[data-aire]');
      if (al) { boton(al, api('pantallaPregunta', { fila: Number(al.getAttribute('data-aire')), canales: pDest })).then(function (r) { cache.pant = r.pantallas; marcarChips(); toast('✓ Pregunta al aire'); var q = cache.preg.find(function (x) { return x.fila === Number(al.getAttribute('data-aire')); }); if (q && q.estado === 'Nueva') { q.estado = 'Elegida'; pintarPregPant(); } }).catch(fallo); return; }
      var pe = e.target.closest('button[data-pe]');
      if (pe) { boton(pe, api('pregEstado', { fila: pe.getAttribute('data-pe'), estado: pe.getAttribute('data-e'), liviano: true })).then(function (r) { cache.preg = r.preguntas; pintarPregPant(); }).catch(fallo); }
    };
  }
  function marcarChips() { PANT.forEach(function (x) { var el = document.querySelector('[data-ch="' + x[0] + '"]'); if (el) el.textContent = nomVista((cache.pant.canales[x[0]] || {}).v || 'auto'); }); }
  function ajustarPrev() {
    Array.prototype.forEach.call(document.querySelectorAll('.pPrev'), function (d) {
      var p = PANT.find(function (x) { return d.classList.contains(x[0]); }), wh = { grandes: [2112, 880], chicas: [1056, 704], foyer: [1920, 1080], banner: [256, 768] }[p[0]];
      var f = d.querySelector('iframe'), ancho = d.clientWidth, k = p[0] === 'banner' ? Math.min(ancho, 160) / wh[0] : ancho / wh[0];
      f.style.width = wh[0] + 'px'; f.style.height = wh[1] + 'px'; f.style.transform = 'scale(' + k + ')'; d.style.height = Math.round(wh[1] * k) + 'px';
    });
  }
  function pintarPregPant() {
    var L = (cache.preg || []).filter(function (q) { return fPg === 'todas' || q.estado === 'Nueva' || q.estado === 'Elegida'; });
    if (!$('pgLista')) return;
    $('pgLista').innerHTML = L.length ? '<div class="scroll" style="margin-top:10px;max-height:60vh"><table class="tabla"><tbody>' + L.map(function (q) {
      return '<tr><td style="width:62%"><b style="font-size:15px">' + esc(q.texto) + '</b><small>' + esc(q.nombre ? q.nombre + (q.empresa ? ' · ' + q.empresa : '') : 'Anónima') + ' · ' + esc(q.charla) + ' · ' + F.hora(q.fecha) + '</small></td><td><span class="chip ' + ({ Elegida: 'ok', Respondida: 'az' }[q.estado] || '') + '">' + esc(q.estado) + '</span></td>' +
        '<td class="num"><button class="b pri chico" data-aire="' + q.fila + '">📺 Al aire</button> ' + (q.estado !== 'Respondida' ? '<button class="b sec chico" data-pe="' + q.fila + '" data-e="Respondida">✓ Respondida</button> ' : '') + '<button class="b sec chico" data-pe="' + q.fila + '" data-e="Oculta">Ocultar</button></td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="vacio">' + ((cache.preg || []).length ? 'No hay preguntas con este filtro.' : 'Todavía no llegaron preguntas (se prenden en 📱 App del asistente).') + '</div>';
  }

  // ── v1.19 · Sorteo ──
  var tSor = null, edSor = null;
  V.sorteo = function () {
    clearInterval(tSor); edSor = null;
    api('sorteo').then(function (r) { pintarSorteo(r.sorteo);
      tSor = setInterval(function () { if (vista !== 'sorteo') { clearInterval(tSor); return; } if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; api('sorteo').then(function (r2) { pintarSorteo(r2.sorteo, true); }).catch(function () { }); }, 15000);
    }).catch(fallo);
  };
  function pintarSorteo(Z, soloDatos) {
    cache.sorteo = Z; var c = Z.conteo, rq = Z.req;
    if (!edSor) edSor = Z.premios.map(function (p) { return { id: p.id, nombre: p.nombre, de: p.de || '', cant: p.cant || 1 }; });
    var sw = function (id, on, t, sub) { return '<div class="interr"><div class="t"><b>' + t + '</b><small>' + sub + '</small></div><label class="sw"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span></span></label></div>'; };
    var ck = function (id, on, t) { return '<label class="fila" style="gap:8px;margin-top:8px;cursor:pointer"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + ' style="width:18px;height:18px"> ' + t + '</label>'; };
    var girando = Z.actual && Z.actual.rev > Z.ahora;
    var htmlSortear = Z.premios.length ? '<table class="tabla" style="margin-top:6px"><tbody>' + Z.premios.map(function (p) {
      var gan = Z.ganadores.filter(function (g) { return g.p === p.id && g.estado !== 'ausente'; });
      return '<tr><td><b style="font-size:15px">' + esc(p.nombre) + '</b><small>' + (p.de ? 'Gentileza de ' + esc(p.de) + ' · ' : '') + (p.cant > 1 ? p.cant + ' unidades · ' : '') + (gan.length ? '🏆 ' + gan.map(function (g) { return esc(g.nombre); }).join(', ') : 'Sin sortear') + '</small></td>' +
        '<td class="num">' + (p.quedan > 0 ? '<button class="b pri" data-sortear="' + esc(p.id) + '"' + (girando ? ' disabled' : '') + '>🎲 Sortear' + (p.cant > 1 ? ' (' + p.quedan + ')' : '') + '</button>' : '<span class="chip ok">✓ Sorteado</span>') + '</td></tr>';
    }).join('') + '</tbody></table>' : '<div class="vacio">Primero cargá los premios (abajo).</div>';
    var est = { '': '<span class="chip am">A entregar</span>', entregado: '<span class="chip ok">✓ Entregado</span>', ausente: '<span class="chip mal">No estaba</span>' };
    var htmlGan = Z.ganadores.length ? '<div class="scroll" style="margin-top:8px"><table class="tabla"><thead><tr><th>Premio</th><th>Ganador</th><th>Hora</th><th>Estado</th><th></th></tr></thead><tbody>' + Z.ganadores.map(function (g) {
      return '<tr><td>' + esc(g.premio) + '</td><td><b>' + esc(g.nombre) + '</b><small>' + esc(g.empresa || '') + '</small></td><td>' + F.hora(g.ts) + '</td><td>' + (est[g.estado] || '') + '</td><td class="num">' +
        (g.estado !== 'entregado' ? '<button class="b sec chico" data-marca="' + g.ts + '" data-e="entregado">✓ Entregado</button> ' : '') + (g.estado === '' ? '<button class="b sec chico" data-marca="' + g.ts + '" data-e="ausente">✗ No está</button>' : '') +
        (g.estado !== '' ? ' <button class="b sec chico" data-marca="' + g.ts + '" data-e="">Deshacer</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div><div class="cont">"No está" libera el premio para volver a sortearlo (esa persona ya no participa).</div>' : '<div class="cont">Todavía no hubo ganadores.</div>';
    var kpis = '<div class="grilla"><div class="kpi"><small>Asistentes (sin equipo)</small><b>' + c.validas + '</b></div><div class="kpi"><small>Ya ingresaron</small><b>' + c.ingresaron + '</b></div><div class="kpi"><small>Con la app abierta</small><b>' + c.conApp + '</b></div><div class="kpi"><small>Participan ahora</small><b style="color:var(--ok)">' + c.participan + '</b><span>cumplen los requisitos y no ganaron</span></div></div>';
    if (soloDatos && $('sorKpis')) { $('sorKpis').innerHTML = kpis; $('sorSortear').innerHTML = htmlSortear; $('sorGan').innerHTML = htmlGan; return; }
    $('main').innerHTML = cab('🎁 Sorteo', 'Se sortea desde acá. La pantalla del proyector y los celulares de los asistentes se actualizan solos.', '<button class="b pri" id="sorPantalla">📺 Abrir pantalla para proyectar</button>') +
      '<div id="sorKpis">' + kpis + '</div>' +
      '<div class="tarj"><h3>🎲 Sortear</h3><div class="cont">Al tocar Sortear, en la pantalla gira la ruleta de nombres ~15 segundos y aparece el ganador; en los celulares sale "Sorteando…" y al ganador, <b>¡GANASTE!</b></div><div id="sorSortear">' + htmlSortear + '</div>' +
      '<div class="acc"><button class="b sec" id="sorVerPremios">📺 Pantalla: mostrar premios</button><button class="b sec" id="sorVerGan">📺 Pantalla: mostrar último ganador</button></div></div>' +
      '<div class="tarj"><h3>🏆 Ganadores</h3><div id="sorGan">' + htmlGan + '</div></div>' +
      '<div class="tarj"><h3>Cómo se ve</h3>' + sw('sorOn', Z.on, 'Mostrar el sorteo en la app', 'Cada asistente ve en su página si participa y qué le falta. Prendelo un rato antes.') +
        sw('sorVivo', Z.vivo, 'En vivo', 'Los celulares consultan más seguido (cada ~10 s) para mostrar "Sorteando…". Se prende solo al sortear; apagalo al terminar.') +
        '<div class="form" style="margin-top:10px"><div class="ancho"><label class="et2" for="sorTit">Título en la pantalla</label><div class="fila"><input class="campo2 crece" id="sorTit" value="' + esc(Z.titulo) + '" maxlength="60"><button class="b sec chico" id="sorTitG">Guardar</button></div></div></div></div>' +
      '<div class="tarj"><h3>🎁 Premios</h3><div id="sorEd"></div><div class="acc"><button class="b sec" id="sorMas">＋ Agregar premio</button><button class="b pri" id="sorGuardarP">Guardar premios</button></div></div>' +
      '<div class="tarj"><h3>✅ Quiénes participan</h3>' + ck('rqVin', rq.vinieron, 'Solo quienes <b>ingresaron</b> (acreditados en la puerta)') + ck('rqApp', rq.app, 'Solo quienes <b>escanearon el QR de su credencial</b> (así les llega el ¡GANASTE! al celu)') +
        ck('rqDir', rq.directorio, 'Solo quienes se sumaron al <b>directorio</b>') + ck('rqEq', rq.equipo, 'Excluir al <b>equipo</b>: producción, staff, prensa, comisión directiva, speakers e invitaciones con texto fijo') +
        '<div class="fila" style="margin-top:10px;gap:8px">Calificar al menos <input class="campo2" id="rqCal" type="number" min="0" max="10" value="' + (rq.charlas || 0) + '" style="width:70px"> charla(s) <span class="cont">(0 = no hace falta)</span></div>' +
        '<div class="acc"><button class="b pri" id="sorGuardarR">Guardar requisitos</button></div></div>' +
      '<div class="tarj"><h3>Prueba</h3><div class="cont">Para ensayar antes del evento: sorteá, mirá la pantalla y después borrá los ganadores.</div><div class="acc"><button class="b sec" id="sorBorrar">🗑 Borrar ganadores</button></div></div>';
    pintarEdSor();
    var guardar = function (b, cfg, ok) { return boton(b, api('sorteoGuardar', { cfg: cfg })).then(function (r2) { toast(ok || r2.msj); edSor = null; pintarSorteo(r2.sorteo); }).catch(fallo); };
    $('sorPantalla').onclick = function () { window.open('sorteo.html', 'sorteo'); };
    $('sorOn').onchange = function () { var el = this; api('sorteoGuardar', { cfg: { on: el.checked } }).then(function (r2) { toast(el.checked ? '✓ Visible en la app' : '✓ Oculto en la app'); pintarSorteo(r2.sorteo, true); $('sorVivo').checked = r2.sorteo.vivo; }).catch(function (e2) { el.checked = !el.checked; fallo(e2); }); };
    $('sorVivo').onchange = function () { var el = this; api('sorteoGuardar', { cfg: { vivo: el.checked } }).then(function () { toast(el.checked ? '✓ En vivo' : '✓ Fin del en vivo'); }).catch(function (e2) { el.checked = !el.checked; fallo(e2); }); };
    $('sorTitG').onclick = function () { guardar(this, { titulo: $('sorTit').value }); };
    $('sorMas').onclick = function () { leerEdSor(); edSor.push({ id: '', nombre: '', de: '', cant: 1 }); pintarEdSor(); var l = $('sorEd').querySelectorAll('[data-k="nombre"]'); if (l.length) l[l.length - 1].focus(); };
    $('sorGuardarP').onclick = function () { leerEdSor(); guardar(this, { premios: edSor.filter(function (p) { return p.nombre.trim(); }) }, '✓ Premios guardados'); };
    $('sorGuardarR').onclick = function () { guardar(this, { req: { vinieron: $('rqVin').checked, app: $('rqApp').checked, directorio: $('rqDir').checked, equipo: $('rqEq').checked, charlas: Number($('rqCal').value) || 0 } }, '✓ Requisitos guardados'); };
    $('sorBorrar').onclick = function () { if (!confirm('¿Borrar TODOS los ganadores? Usalo solo para pruebas.')) return; boton(this, api('sorteoBorrar')).then(function (r2) { toast(r2.msj); pintarSorteo(r2.sorteo); }).catch(fallo); };
    $('sorVerPremios').onclick = function () { boton(this, api('sorteoPantalla', { modo: 'premios' })).then(function () { toast('✓ La pantalla muestra los premios'); }).catch(fallo); };
    $('sorVerGan').onclick = function () { boton(this, api('sorteoPantalla', { modo: 'ganador' })).then(function () { toast('✓ La pantalla muestra al último ganador'); }).catch(fallo); };
    $('main').onclick = function (e) {
      var s = e.target.closest('button[data-sortear]');
      if (s) {
        var nom = s.closest('tr').querySelector('b').textContent; if (!confirm('¿Sortear "' + nom + '" ahora? Va a salir en la pantalla y en los celulares.')) return;
        boton(s, api('sortear', { premio: s.getAttribute('data-sortear') }), '🎲 Sorteando…').then(function (r2) {
          toast('🎲 Girando en la pantalla… ganó ' + r2.ganador.nombre + ' (se revela en unos segundos)'); pintarSorteo(r2.sorteo, true);
          setTimeout(function () { if (vista === 'sorteo') api('sorteo').then(function (r3) { pintarSorteo(r3.sorteo, true); }).catch(function () { }); }, 10000);
        }).catch(fallo); return;
      }
      var m = e.target.closest('button[data-marca]');
      if (m) { var es = m.getAttribute('data-e'); if (es === 'ausente' && !confirm('¿Marcar que no está? El premio vuelve a quedar para sortear.')) return; boton(m, api('sorteoMarcar', { ts: Number(m.getAttribute('data-marca')), estado: es })).then(function (r2) { pintarSorteo(r2.sorteo, true); }).catch(fallo); return; }
      var q = e.target.closest('button[data-quitar]'); if (q) { leerEdSor(); edSor.splice(Number(q.getAttribute('data-quitar')), 1); pintarEdSor(); }
    };
  }
  function pintarEdSor() {
    $('sorEd').innerHTML = edSor.length ? edSor.map(function (p, i) {
      return '<div class="fila" data-i="' + i + '" style="margin-top:8px;gap:8px;flex-wrap:wrap"><input class="campo2 crece" data-k="nombre" placeholder="Premio (ej: Kit de mate)" value="' + esc(p.nombre) + '" maxlength="80" style="min-width:200px">' +
        '<input class="campo2" data-k="de" placeholder="Gentileza de (opcional)" value="' + esc(p.de) + '" maxlength="60" style="width:200px"><input class="campo2" data-k="cant" type="number" min="1" max="20" value="' + (p.cant || 1) + '" title="Cantidad" style="width:70px"><button class="b sec chico" data-quitar="' + i + '" title="Quitar">✕</button></div>';
    }).join('') : '<div class="cont">Sin premios todavía.</div>';
  }
  function leerEdSor() {
    Array.prototype.forEach.call($('sorEd').querySelectorAll('[data-i]'), function (f) { var p = edSor[Number(f.getAttribute('data-i'))]; f.querySelectorAll('[data-k]').forEach(function (x) { p[x.getAttribute('data-k')] = x.getAttribute('data-k') === 'cant' ? Number(x.value) || 1 : x.value; }); });
  }

  V.comunicacion = function () {
    api('comunicacion').then(function (r) {
      var c = r.cert;
      $('main').innerHTML = cab('Mails y certificados', 'Siempre con OK manual: primero te mandás una prueba, después enviás.') +
        '<div class="tarj"><h3>⏰ Recordatorio previo al evento</h3><div class="cont">Pendientes de recibirlo: <b>' + r.recordatorio.pendientes + '</b> compra(s). No se repite a quien ya lo recibió.</div>' +
        '<div class="fila" style="margin-top:10px"><input class="campo2 crece" id="rMail" type="email" placeholder="Mail para la prueba" value="' + esc(S.yo.mail) + '"><button class="b sec" id="rPrueba">Enviarme una prueba</button><button class="b pri" id="rTodos"' + (r.recordatorio.pendientes ? '' : ' disabled') + '>Enviar a todos</button></div></div>' +
        '<div class="tarj"><h3>🎓 Certificados</h3>' +
        '<div class="interr"><div class="t"><b>Descarga desde la agenda</b><small>Prendido: cada uno baja su certificado con el QR de su credencial. Prendelo después de revisar la lista.</small></div><label class="sw"><input type="checkbox" id="cWeb"' + (c.web ? ' checked' : '') + '><span></span></label></div>' +
        '<div class="cont">Lista: <b>' + c.total + '</b> asistente(s) · enviados por mail: <b>' + c.enviados + '</b>' + (c.sinMail ? ' · sin mail: <b>' + c.sinMail + '</b>' : '') + '</div>' +
        '<div class="acc"><button class="b sec" id="cPrep">1 · Preparar / actualizar lista</button><button class="b sec" id="cMuestra">2 · Enviarme una muestra</button><button class="b pri" id="cEnviar"' + (c.total ? '' : ' disabled') + '>3 · Enviar por mail</button></div>' +
        (c.lista.length ? '<div class="scroll" style="margin-top:12px"><table class="tabla"><thead><tr><th>Nombre</th><th>DNI</th><th>Empresa</th><th>Mail</th><th>Enviado</th><th></th></tr></thead><tbody id="cBody">' + c.lista.map(function (x) {
          return '<tr data-cod="' + esc(x.cod) + '"><td><input class="campo2" data-k="nombre" value="' + esc(x.nombre) + '"></td><td><input class="campo2" data-k="dni" style="width:110px" value="' + esc(x.dni) + '"></td><td><input class="campo2" data-k="empresa" value="' + esc(x.empresa) + '"></td><td><input class="campo2" data-k="mail" value="' + esc(x.mail) + '"></td><td>' + esc(x.enviado || '—') + '</td><td><button class="b sec chico" data-g>Guardar</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '') + '</div>';
      var mail = function () { return $('rMail').value.trim(); };
      $('rPrueba').onclick = function () { boton(this, api('recPrueba', { mail: mail() }, 90000)).then(function (r2) { toast(r2.msj); }).catch(fallo); };
      $('rTodos').onclick = function () { if (!confirm('¿Enviar el recordatorio a ' + r.recordatorio.pendientes + ' compra(s)?')) return; boton(this, api('recEnviar', {}, 290000), 'Enviando… (puede tardar)').then(function (r2) { toast(r2.msj); V.comunicacion(); }).catch(fallo); };
      $('cWeb').onchange = function () { var el = this, v = el.checked; if (!confirm(v ? '¿Habilitar la descarga del certificado desde la agenda?' : '¿Deshabilitar la descarga desde la agenda?')) { el.checked = !v; return; } api('ajusteGuardar', { clave: 'CERT_WEB', valor: v }).then(function () { toast('✓ Listo'); }).catch(function (e) { el.checked = !v; fallo(e); }); };
      $('cPrep').onclick = function () { boton(this, api('certPreparar', {}, 120000)).then(function (r2) { toast(r2.msj); V.comunicacion(); }).catch(fallo); };
      $('cMuestra').onclick = function () { var m = prompt('¿A qué mail te mando la muestra?', S.yo.mail || ''); if (!m) return; boton(this, api('certMuestra', { mail: m.trim() }, 120000)).then(function (r2) { toast(r2.msj); }).catch(fallo); };
      $('cEnviar').onclick = function () { if (!confirm('¿Enviar los certificados pendientes por mail?')) return; boton(this, api('certEnviar', {}, 290000), 'Enviando… (puede tardar)').then(function (r2) { toast(r2.msj); V.comunicacion(); }).catch(fallo); };
      if ($('cBody')) $('cBody').onclick = function (e) {
        var b = e.target.closest('button[data-g]'); if (!b) return; var tr = b.closest('tr'), d = { cod: tr.getAttribute('data-cod') };
        Array.prototype.forEach.call(tr.querySelectorAll('[data-k]'), function (i) { d[i.getAttribute('data-k')] = i.value; });
        boton(b, api('certFila', d)).then(function (r2) { toast(r2.msj); }).catch(fallo);
      };
    }).catch(fallo);
  };

  // ── Actividad ──
  // ── v1.20.2 · Celulares vinculados ──
  var fC = { q: '', f: 'todos' };
  V.celulares = function () {
    var D = null;
    $('main').innerHTML = cab('Celulares vinculados', 'La página personal de cada asistente queda atada al primer celular que escanea su credencial. Si alguien cambió de celular o se la escaneó otra persona, liberala y que la vuelva a escanear con el suyo.', '<button class="b sec chico" id="cAct">↻ Actualizar</button>') +
      '<div id="cKpi" class="grilla"></div><div id="cComp"></div>' +
      '<div class="tarj"><div class="fila"><input class="campo2 crece" id="cQ" placeholder="Buscar nombre, empresa, código o celular" value="' + esc(fC.q) + '">' +
      '<div class="seg" id="cFil">' + [['todos', 'Todos'], ['con', 'Con celular'], ['sin', 'Sin celular'], ['comp', 'Celular compartido']].map(function (x) { return '<button data-v="' + x[0] + '"' + (fC.f === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div></div></div>' +
      '<div class="cont" id="cCont"></div><div class="scroll"><table class="tabla"><thead><tr><th>Nombre</th><th>Tipo</th><th>Ingresó</th><th>Celular</th><th></th></tr></thead><tbody id="cBody"><tr><td colspan="5" class="vacio">Cargando…</td></tr></tbody></table></div>';
    function filtrar() {
      var q = fC.q.trim().toLowerCase();
      return D.lista.filter(function (x) {
        if (fC.f === 'con' && !x.cel) return false; if (fC.f === 'sin' && x.cel) return false; if (fC.f === 'comp' && x.comparte < 2) return false;
        return !q || (x.nombre + ' ' + x.empresa + ' ' + x.cod + ' ' + x.cel + ' ' + x.tipo).toLowerCase().indexOf(q) >= 0;
      });
    }
    function pintar() {
      var L = filtrar();
      $('cCont').textContent = L.length + ' de ' + D.total;
      $('cBody').innerHTML = L.map(function (x) {
        return '<tr><td><b>' + esc(x.nombre) + '</b><small>' + esc([x.empresa, x.rol].filter(Boolean).join(' · ')) + '</small></td><td>' + esc(x.tipo) + '</td>' +
          '<td>' + (x.ingreso ? '✓ ' + esc(fecha(x.ingreso).slice(-5)) : '—') + '</td>' +
          '<td>' + (x.cel ? '<span style="font-family:monospace">📱 ' + esc(x.cel) + '</span>' + (x.comparte > 1 ? ' <span class="chip mal">compartido ×' + x.comparte + '</span>' : '') + (x.desde ? '<small>desde ' + esc(fecha(x.desde)) + '</small>' : '') : '<span style="color:#8A94A6">Sin vincular</span>') + '</td>' +
          '<td>' + (x.cel ? '<button class="b sec chico" data-lib="' + esc(x.cod) + '">Liberar</button>' : '') + '</td></tr>';
      }).join('') || '<tr><td colspan="5" class="vacio">Nadie con ese filtro.</td></tr>';
    }
    function mostrar(c) {
      D = c;
      $('cKpi').innerHTML = '<div class="kpi"><small>Con celular vinculado</small><b>' + c.conCel + '<span> / ' + c.total + '</span></b><span>tickets válidos</span></div>' +
        '<div class="kpi"><small>Sin vincular</small><b>' + (c.total - c.conCel) + '</b><span>todavía no escanearon su credencial</span></div>' +
        '<div class="kpi' + (c.compartidos ? ' alerta' : '') + '"><small>Celulares con varias credenciales</small><b>' + c.compartidos + '</b><span>' + (c.compartidos ? 'revisar abajo' : 'todo bien') + '</span></div>';
      var g = {}; c.lista.forEach(function (x) { if (x.comparte > 1) (g[x.cel] = g[x.cel] || []).push(x); });
      var ks = Object.keys(g);
      $('cComp').innerHTML = ks.length ? '<div class="tarj"><h3>⚠️ Un mismo celular con varias credenciales</h3><div class="cont">Puede ser alguien del staff que escaneó con su teléfono, o una persona que escaneó la de un acompañante. Cada credencial tiene que quedar en el celular de su dueño.</div>' +
        ks.map(function (k) { return '<div class="fila" style="margin-top:10px;align-items:center"><div class="crece"><b style="font-family:monospace">📱 ' + esc(k) + '</b> · ' + g[k].map(function (x) { return esc(x.nombre); }).join(', ') + '</div><button class="b sec chico" data-libs="' + esc(g[k].map(function (x) { return x.cod; }).join(',')) + '">Liberar las ' + g[k].length + '</button></div>'; }).join('') + '</div>' : '';
      pintar();
    }
    function cargar() { api('celulares').then(function (r) { mostrar(r.celulares); }).catch(fallo); }
    function liberar(cods, btn, txt) {
      if (!confirm(txt)) return;
      boton(btn, api('liberarCels', { cods: cods }), 'Liberando…').then(function (r) { toast(r.msj); mostrar(r.celulares); }).catch(fallo);
    }
    $('main').onclick = function (e) {
      var b = e.target.closest('button[data-lib]');
      if (b) { var x = D.lista.filter(function (y) { return y.cod === b.getAttribute('data-lib'); })[0]; liberar([x.cod], b, '¿Liberar el celular de ' + x.nombre + '? El próximo celular que escanee su credencial queda vinculado.'); return; }
      var m = e.target.closest('button[data-libs]');
      if (m) { var cs = m.getAttribute('data-libs').split(','); liberar(cs, m, '¿Liberar estas ' + cs.length + ' credenciales? Cada persona la vuelve a escanear con su propio celular.'); }
    };
    $('cQ').oninput = function () { fC.q = this.value; if (D) pintar(); };
    $('cFil').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; fC.f = b.getAttribute('data-v'); Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); }); if (D) pintar(); };
    $('cAct').onclick = cargar; cargar();
  };
  V.actividad = function () {
    $('main').innerHTML = cab('Actividad', 'Escaneos de la puerta y todo lo que hace cada usuario (consola y panel).', '<button class="b sec" id="aAct">↻ Actualizar</button>') +
      '<div class="tarj"><input class="campo2" id="aQ" placeholder="Filtrar por nombre, código, acción o usuario"></div><div class="scroll" style="margin-top:12px"><table class="tabla"><thead><tr><th>Cuándo</th><th>Qué</th><th>Quién / dónde</th><th>Detalle</th></tr></thead><tbody id="aBody"><tr><td colspan="4" class="vacio">Cargando…</td></tr></tbody></table></div>';
    var t = null;
    function cargar() {
      api('actividad', { n: 400, q: $('aQ').value.trim() }).then(function (r) {
        $('aBody').innerHTML = r.actividad.map(function (a) { return '<tr><td style="white-space:nowrap">' + fecha(a.fecha) + '</td><td><b>' + esc(a.accion) + '</b><small style="font-family:monospace">' + esc(a.ref) + '</small></td><td>' + esc(a.quien) + '</td><td>' + esc(a.detalle) + '</td></tr>'; }).join('') || '<tr><td colspan="4" class="vacio">Sin movimientos.</td></tr>';
      }).catch(fallo);
    }
    $('aQ').oninput = function () { clearTimeout(t); t = setTimeout(cargar, 400); };
    $('aAct').onclick = cargar; cargar();
  };

  // ── Ajustes ──
  var GRUPOS_AJ = [
    ['El evento', ['EVENTO', 'SUBTITULO', 'FECHA_TXT', 'HORARIO', 'LUGAR', 'DIRECCION', 'DESCRIPCION', 'INCLUYE', 'IMAGEN', 'ORGANIZA', 'COLOR']],
    ['Venta', ['VENTA_ABIERTA', 'AGOTADO', 'CUPO_TOTAL', 'MAX_COMPRA', 'NOMINAL', 'CARGO_PCT', 'RESERVA_MIN', 'CONDICIONES', 'PRUEBA']],
    ['Socios', ['CORT_TEXTO', 'CORT_MAX', 'ASOCIARSE_WA', 'ASOCIARSE_LINK']],
    ['Mails', ['REMITENTE', 'RESPONDER_A', 'AVISO_VENTAS', 'BREVO_FROM']],
    ['Certificados', ['CERT_FIRMA', 'CERT_WEB']],
    ['Página personal', ['NET_ON', 'PREG_ON', 'ENC_ON', 'WIFI_RED', 'WIFI_CLAVE', 'AVISO']],
    ['Sistema', ['SITIO', 'API']]
  ];
  V.ajustes = function () {
    api('ajustes').then(function (r) {
      var por = {}; r.ajustes.forEach(function (a) { por[a.clave] = a; });
      var usados = {}; GRUPOS_AJ.forEach(function (g) { g[1].forEach(function (k) { usados[k] = 1; }); });
      var resto = r.ajustes.filter(function (a) { return !usados[a.clave]; }).map(function (a) { return a.clave; });
      var grupos = GRUPOS_AJ.concat(resto.length ? [['Otros', resto]] : []);
      var campo = function (a) {
        if (!a) return '';
        if (a.tipo === 'bool') return '<div class="interr" data-k="' + a.clave + '"><div class="t"><b>' + esc(a.etiqueta) + '</b></div><label class="sw' + (a.clave === 'AGOTADO' ? ' rojo' : '') + '"><input type="checkbox"' + (a.valor === true ? ' checked' : '') + '><span></span></label></div>';
        var inp = a.tipo === 'largo' ? '<textarea class="campo2 crece" ' + (a.soloLectura ? 'readonly' : '') + '>' + esc(a.valor) + '</textarea>' : '<input class="campo2 crece"' + (a.tipo === 'num' ? ' type="number" min="0"' : '') + ' value="' + esc(a.valor) + '"' + (a.soloLectura ? ' readonly' : '') + '>';
        return '<div data-k="' + a.clave + '" style="margin-bottom:6px"><label class="et2">' + esc(a.etiqueta) + '</label><div class="fila">' + inp + (a.soloLectura ? '' : '<button class="b sec chico" data-g>Guardar</button>') + '</div></div>';
      };
      $('main').innerHTML = cab('Ajustes', 'Lo mismo que la pestaña Ajustes de la planilla. Las claves (Mercado Pago, PIN, Brevo) se siguen cargando desde la planilla.') +
        grupos.map(function (g) { return '<div class="tarj"><h3>' + esc(g[0]) + '</h3>' + g[1].map(function (k) { return campo(por[k]); }).join('') + '</div>'; }).join('');
      $('main').onclick = function (e) {
        var b = e.target.closest('button[data-g]'); if (!b) return;
        var box = b.closest('[data-k]'), k = box.getAttribute('data-k'), i = box.querySelector('input,textarea');
        boton(b, api('ajusteGuardar', { clave: k, valor: i.value })).then(function (r2) { toast(r2.msj); }).catch(fallo);
      };
      $('main').onchange = function (e) {
        var i = e.target; if (i.type !== 'checkbox') return;
        var box = i.closest('[data-k]'), k = box.getAttribute('data-k'), v = i.checked;
        if (k === 'PRUEBA' && !v && !confirm('¿Sacar el modo prueba?')) { i.checked = !v; return; }
        if ((k === 'VENTA_ABIERTA' || k === 'AGOTADO') && !confirm('¿Confirmás el cambio? Se ve en la tienda en el momento.')) { i.checked = !v; return; }
        api('ajusteGuardar', { clave: k, valor: v }).then(function () { toast('✓ Guardado'); }).catch(function (e2) { i.checked = !v; fallo(e2); });
      };
    }).catch(fallo);
  };

  // ── Usuarios ──
  V.usuarios = function () {
    api('usuarios').then(function (r) {
      $('main').innerHTML = cab('Usuarios', '<b>Admin</b>: todo. <b>Operador</b>: solo acreditación (escanear, dar ingreso e imprimir credenciales).', '<button class="b pri" id="uNuevo">＋ Usuario nuevo</button>') +
        '<div class="scroll"><table class="tabla"><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>' + r.usuarios.map(function (u) {
          return '<tr><td><b>' + esc(u.nombre) + '</b><small>' + esc(u.mail) + '</small></td><td style="font-family:monospace">' + esc(u.usuario) + '</td><td>' + (u.rol === 'admin' ? '<span class="chip az">Admin</span>' : '<span class="chip">Operador</span>') + '</td><td>' + (u.activo ? '<span class="chip ok">Activo</span>' : '<span class="chip mal">Desactivado</span>') + '</td><td class="num"><button class="b sec chico" data-u="' + esc(u.usuario) + '">Editar</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      $('uNuevo').onclick = function () { editarUsuario(null); };
      $('main').querySelector('tbody').onclick = function (e) { var b = e.target.closest('button[data-u]'); if (b) editarUsuario(r.usuarios.find(function (u) { return u.usuario === b.getAttribute('data-u'); })); };
    }).catch(fallo);
  };
  function editarUsuario(u) {
    var nuevo = !u; u = u || { usuario: '', nombre: '', mail: '', rol: 'operador', activo: true };
    modal('<h3>' + (nuevo ? 'Usuario nuevo' : esc(u.nombre)) + '</h3><div class="form">' +
      '<div><label class="et2">Nombre</label><input class="campo2" id="uNom" value="' + esc(u.nombre) + '"></div>' +
      '<div><label class="et2">Usuario (para entrar)</label><input class="campo2" id="uUsu" value="' + esc(u.usuario) + '"' + (nuevo ? '' : ' readonly') + ' autocapitalize="none" placeholder="sin espacios"></div>' +
      '<div><label class="et2">Mail (opcional)</label><input class="campo2" id="uMail" type="email" value="' + esc(u.mail) + '"></div>' +
      '<div><label class="et2">Rol</label><select class="campo2" id="uRol"><option value="operador"' + (u.rol === 'operador' ? ' selected' : '') + '>Operador (acreditación)</option><option value="tecnica"' + (u.rol === 'tecnica' ? ' selected' : '') + '>Técnica (pantallas, preguntas y sorteo)</option><option value="admin"' + (u.rol === 'admin' ? ' selected' : '') + '>Admin (todo)</option></select></div>' +
      '<div><label class="et2">' + (nuevo ? 'Contraseña' : 'Nueva contraseña (vacío = no cambia)') + '</label><input class="campo2" id="uClave" type="text" autocomplete="off" placeholder="8+ con letras y números"></div></div>' +
      (nuevo ? '' : '<label class="chk2"><input type="checkbox" id="uAct"' + (u.activo ? ' checked' : '') + '> Activo (destildado: no puede entrar y se le cierra la sesión)</label>') +
      '<div class="acc"><button class="b pri" id="uOk">Guardar</button>' + (nuevo ? '' : '<button class="b mal" id="uBorrar">Borrar usuario</button>') + '<button class="b sec" id="uNo">Cancelar</button></div>' +
      '<div class="cont">Pasale el link <b>' + esc(location.origin + location.pathname) + '</b> con su usuario y contraseña.</div>');
    $('uNo').onclick = cerrarModal;
    $('uOk').onclick = function () {
      var d = { usuario: $('uUsu').value, nombre: $('uNom').value, mail: $('uMail').value, rol: $('uRol').value, clave: $('uClave').value, activo: nuevo ? true : $('uAct').checked };
      boton(this, api('usuarioGuardar', d)).then(function (r) { cerrarModal(); toast(r.msj); V.usuarios(); }).catch(fallo);
    };
    if ($('uBorrar')) $('uBorrar').onclick = function () { if (!confirm('¿Borrar a ' + u.nombre + '?')) return; boton(this, api('usuarioGuardar', { usuario: u.usuario, borrar: true })).then(function (r) { cerrarModal(); toast(r.msj); V.usuarios(); }).catch(fallo); };
  }

  // ── Diagnóstico ──
  V.herramientas = function () {
    api('diagnostico').then(function (r) {
      var sitio = S.sitio || location.origin;
      $('main').innerHTML = cab('Diagnóstico') + '<div class="tarj diag">' + r.diagnostico.map(function (d) { return '<div>' + (d.ok ? '✅' : '⚠️') + ' ' + esc(d.txt) + '</div>'; }).join('') + '</div>' +
        '<div class="tarj"><h3>Links</h3><div class="acc">' + [['Tienda', '/'], ['Agenda', '/agenda.html'], ['Escáner', '/escaner.html'], ['Credenciales', '/credenciales.html'], ['Panel del celular', '/panel.html']].map(function (l) { return '<a class="b sec" target="_blank" rel="noopener" href="' + esc(sitio + l[1]) + '">' + esc(l[0]) + ' ↗</a>'; }).join('') + '</div></div>' +
        '<div class="tarj"><h3>Pagos</h3><div class="cont">El sistema revisa los pagos pendientes solo cada 10 minutos. Si alguien dice que pagó y no le llegó, forzalo acá.</div><div class="acc"><button class="b sec" id="dRev">🔍 Revisar pagos pendientes ahora</button></div></div>';
      $('dRev').onclick = function () { boton(this, api('revisarPagos', {}, 280000), 'Revisando…').then(function (r2) { toast(r2.msj); }).catch(fallo); };
    }).catch(fallo);
  };

  // ── Mi contraseña ──
  $('bCuenta').onclick = function () {
    modal('<h3>Cambiar mi contraseña</h3><label class="et2">Contraseña actual</label><input class="campo2" id="cA" type="password" autocomplete="current-password"><label class="et2">Nueva (8+ con letras y números)</label><input class="campo2" id="cN" type="password" autocomplete="new-password"><div class="acc"><button class="b pri" id="cOk">Cambiar</button></div>');
    $('cOk').onclick = function () { boton(this, api('miClave', { actual: $('cA').value, nueva: $('cN').value })).then(function (r) { S = Object.assign(S, { token: r.token, escaner: r.escaner }); guardarJ(K, S); cerrarModal(); toast(r.msj); }).catch(fallo); };
  };

  // ── sesión ──
  function entrar(r) {
    S = { token: r.token, yo: r.yo, evento: r.evento, sitio: r.sitio, escaner: r.escaner }; guardarJ(K, S);
    $('lClave').value = ''; iniciar();
  }
  function iniciar() {
    $('vLogin').classList.add('oculto'); $('vApp').classList.remove('oculto');
    $('hEvento').textContent = (S.evento && S.evento.nombre) || 'Eventos y Negocios';
    $('hYo').textContent = S.yo.nombre; $('hRol').textContent = S.yo.rol === 'admin' ? 'Admin' : S.yo.rol === 'tecnica' ? 'Técnica' : 'Operador';
    ir((location.hash || '').slice(1) || inicioDe());
  }
  function salir(msj) {
    try { localStorage.removeItem(K); } catch (e) { } S = null; cerrarModal();
    $('vApp').classList.add('oculto'); $('vLogin').classList.remove('oculto'); $('lForm').classList.remove('oculto'); $('lAlta').classList.add('oculto'); $('lErr').textContent = msj || '';
  }
  $('bSalir').onclick = function () { salir(''); };
  $('lEntrar').onclick = function () {
    var u = $('lUsu').value.trim(), c = $('lClave').value; if (!u || !c) { $('lErr').textContent = 'Poné usuario y contraseña.'; return; }
    $('lErr').textContent = '';
    boton(this, F.post('consolaLogin', { usuario: u, clave: c }, 45000), 'Entrando…').then(function (r) {
      if (r.primeraVez) { $('lForm').classList.add('oculto'); $('lAlta').classList.remove('oculto'); $('aUsu').value = u; return; }
      try { localStorage.setItem('cons_usu', u); } catch (e) { } entrar(r);
    }).catch(function (e) { $('lErr').textContent = F.msg(e); });
  };
  $('lClave').onkeydown = function (e) { if (e.key === 'Enter') $('lEntrar').click(); };
  $('lUsu').onkeydown = function (e) { if (e.key === 'Enter') $('lClave').focus(); };
  $('aCrear').onclick = function () {
    $('lErr').textContent = '';
    boton(this, F.post('consolaAlta', { maestra: $('aMaestra').value, nombre: $('aNombre').value, usuario: $('aUsu').value, mail: $('aMail').value, clave: $('aClave').value }, 45000), 'Creando…')
      .then(entrar).catch(function (e) { $('lErr').textContent = F.msg(e); });
  };

  try { $('lUsu').value = localStorage.getItem('cons_usu') || ''; } catch (e) { }
  var s0 = leerJ(K);
  if (s0 && s0.token && Number(String(s0.token).split('.')[0]) > Date.now()) { S = s0; iniciar(); } else salir('');
  window.addEventListener('hashchange', function () { var v = location.hash.slice(1); if (S && v && v !== vista) ir(v); });
})();

// v1.20.9 · pixel map (consola → Pantallas)
window.__pm = function () {
  var g = function (id) { var e = document.getElementById(id); return e ? e.value.replace(/\s/g, '') : ''; };
  var a = document.getElementById('pmA'); if (!a) return;
  var L = g('pmL') || '3840x2160', G = g('pmG') || '0,0', C1 = g('pmC1') || '0,880', C2 = g('pmC2') || '1056,880';
  var u = 'pantalla.html?p=mosaico&lienzo=' + L + '&grandes=' + G + '&chicas=' + C1 + ';' + C2;
  a.href = u; document.getElementById('pmGuia').href = u + '&guia=1';
  var xy = function (s, w, h) { var c = s.split(',').map(Number); return 'x ' + c[0] + ' · y ' + c[1] + ' · ' + w + ' × ' + h; };
  document.getElementById('pmTxt').innerHTML = 'Salida ' + L.replace('x', ' × ') + '<br>Grande: ' + xy(G, 2112, 880) + '<br>Chica 1: ' + xy(C1, 1056, 704) + '<br>Chica 2: ' + xy(C2, 1056, 704);
};
setInterval(function () { var a = document.getElementById('pmA'); if (a && a.getAttribute('href') === '#') window.__pm(); }, 400);
