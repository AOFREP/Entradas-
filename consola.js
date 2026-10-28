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
    { id: 'tipos', i: '🏷️', t: 'Tipos y precios', admin: true },
    { id: 'facturar', i: '💼', t: 'Facturación', admin: true },
    { g: 'Evento', admin: true },
    { id: 'personal', i: '📱', t: 'Página personal', admin: true },
    { id: 'comunicacion', i: '✉️', t: 'Mails y certificados', admin: true },
    { id: 'actividad', i: '🕑', t: 'Actividad', admin: true },
    { id: 'ajustes', i: '⚙️', t: 'Ajustes', admin: true },
    { id: 'usuarios', i: '👥', t: 'Usuarios', admin: true },
    { id: 'herramientas', i: '🩺', t: 'Diagnóstico', admin: true }
  ];
  function esAdmin() { return S && S.yo.rol === 'admin'; }
  function pintarNav() {
    $('nav').innerHTML = SECC.filter(function (s) { return !s.admin || esAdmin(); }).map(function (s) {
      if (s.g) return '<div class="grupo">' + esc(s.g.toUpperCase()) + '</div>';
      return '<button data-v="' + s.id + '"' + (s.id === vista ? ' class="on"' : '') + '><span class="i">' + s.i + '</span>' + esc(s.t) + (s.id === 'socios' && cache.nSocios ? '<span class="n">' + cache.nSocios + '</span>' : '') + '</button>';
    }).join('');
  }
  $('nav').onclick = function (e) { var b = e.target.closest('button[data-v]'); if (b) { ir(b.getAttribute('data-v')); document.body.classList.remove('menu'); } };
  $('bMenu').onclick = function () { document.body.classList.toggle('menu'); };
  document.addEventListener('click', function (e) { if (document.body.classList.contains('menu') && !e.target.closest('.lado') && !e.target.closest('#bMenu')) document.body.classList.remove('menu'); });
  function ir(v) {
    var s = SECC.find(function (x) { return x.id === v; });
    if (!s || (s.admin && !esAdmin())) v = esAdmin() ? 'inicio' : 'puerta';
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
      $('main').innerHTML = cab('Tickets', '', '<button class="b ok" id="bCort">🎁 Cortesías</button><button class="b sec" id="bCsv">⬇︎ Exportar</button>') +
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
      $('bCort').onclick = cortesias;
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
  function cortesias() {
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
      boton(this, api('cortesias', { tipo: $('cTipo').value, filas: filas, mandar: $('cMandar').checked, nota: $('cNota').value }, 120000), 'Creando…').then(function (r) { cerrarModal(); toast(r.msj); if (vista === 'tickets') V.tickets(); }).catch(fallo);
    };
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
  V.tipos = function () {
    api('tipos').then(function (r) {
      var est = { venta: ['ok', 'En venta'], agotado: ['mal', 'Agotado'], finalizado: ['', 'Terminó'], proximamente: ['az', 'Próximamente'], reservado: ['am', 'Reservado'], oculto: ['', 'Oculto'] };
      var tarjeta = function (t) {
        var e = est[t.estadoWeb] || ['', t.estadoWeb];
        return '<div class="tarj tipoT" data-id="' + esc(t.id || '') + '"><div class="cabT"><b>' + esc(t.nombre || 'Tipo nuevo') + '</b>' + (t.id ? '<span class="chip ' + e[0] + '">' + e[1] + '</span>' : '') + '</div>' +
          (t.id ? '<div class="stats"><span>Vendidas <b>' + t.vendidas + '</b></span><span>Reservadas <b>' + t.reservadas + '</b></span><span>Disponibles <b>' + (t.disp == null ? '—' : t.disp) + '</b></span><span style="font-family:monospace">' + esc(t.id) + '</span></div>' : '') +
          '<div class="form"><div><label class="et2">Nombre</label><input class="campo2" data-k="nombre" value="' + esc(t.nombre || '') + '"></div>' +
          '<div><label class="et2">Precio</label><input class="campo2" data-k="precio" type="number" min="0" step="500" value="' + esc(t.precio == null ? '' : t.precio) + '"></div>' +
          '<div><label class="et2">Cupo</label><input class="campo2" data-k="cupo" type="number" min="0" value="' + esc(t.cupo == null ? '' : t.cupo) + '"></div>' +
          '<div class="ancho"><label class="et2">Descripción</label><input class="campo2" data-k="desc" value="' + esc(t.desc || '') + '"></div>' +
          '<div><label class="et2">Venta desde</label><input class="campo2" data-k="desde" type="datetime-local" value="' + esc(t.desde || '') + '"></div>' +
          '<div><label class="et2">Venta hasta</label><input class="campo2" data-k="hasta" type="datetime-local" value="' + esc(t.hasta || '') + '"></div></div>' +
          '<div class="fila" style="gap:18px"><label class="chk2"><input type="checkbox" data-k="activo"' + (t.activo ? ' checked' : '') + '> Activo (se ve en la tienda)</label>' +
          '<label class="chk2"><input type="checkbox" data-k="cort"' + (t.cort ? ' checked' : '') + '> Socio (se valida)</label>' +
          '<label class="chk2"><input type="checkbox" data-k="agotado"' + (t.agotado ? ' checked' : '') + '> Agotado</label></div>' +
          '<div class="acc"><button class="b pri" data-guardar>Guardar</button></div></div>';
      };
      $('main').innerHTML = cab('Tipos y precios', 'Los cambios se ven en la tienda en el momento. El tope real del salón es el "Cupo total" de Ajustes.', '<button class="b sec" id="bNuevoT">＋ Tipo nuevo</button>') + r.tipos.map(tarjeta).join('') + '<div id="tNuevo"></div>';
      $('bNuevoT').onclick = function () { $('tNuevo').innerHTML = tarjeta({ nombre: '', precio: 0, cupo: 0, activo: false }); $('tNuevo').scrollIntoView({ behavior: 'smooth' }); };
      $('main').onclick = function (e) {
        var b = e.target.closest('button[data-guardar]'); if (!b) return;
        var card = b.closest('.tipoT'), d = {};
        Array.prototype.forEach.call(card.querySelectorAll('[data-k]'), function (i) { d[i.getAttribute('data-k')] = i.type === 'checkbox' ? i.checked : i.value; });
        boton(b, api('tipoGuardar', { tipoId: card.getAttribute('data-id'), datos: d })).then(function (r2) { toast(r2.msj); V.tipos(); }).catch(fallo);
      };
    }).catch(fallo);
  };

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
  V.personal = function () {
    clearInterval(tPreg);
    api('personal').then(function (r) { pintarPersonal(r.personal); tPreg = setInterval(function () { if (vista !== 'personal') { clearInterval(tPreg); return; } if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; api('personal').then(function (r2) { cache.personal = r2.personal; pintarPreguntas(); }).catch(function () { }); }, 20000); }).catch(fallo);
  };
  function pintarPersonal(P) {
    cache.personal = P; var a = P.ajustes;
    var sw = function (k, t, sub) { return '<div class="interr"><div class="t"><b>' + t + '</b><small>' + sub + '</small></div><label class="sw"><input type="checkbox" data-aj="' + k + '"' + (a[k] ? ' checked' : '') + '><span></span></label></div>'; };
    $('main').innerHTML = cab('Página personal', 'Lo que ve cada asistente al escanear el QR de su sticker. Se prende y se apaga desde acá.') +
      '<div class="tarj"><h3>Qué se muestra</h3>' + sw('PREG_ON', 'Preguntas a las charlas', 'Mandan preguntas al speaker desde el celular. Las moderás abajo.') + sw('NET_ON', 'Networking', 'Comparten su contacto y ven a quienes también comparten. En la puerta se les pregunta.') + sw('ENC_ON', 'Encuesta de satisfacción', 'Prendela al final de la jornada.') + '</div>' +
      '<div class="tarj"><h3>Wifi y aviso</h3><div class="form"><div><label class="et2" for="aWr">Red wifi</label><div class="fila"><input class="campo2 crece" id="aWr" value="' + esc(a.WIFI_RED) + '" placeholder="Nombre de la red"><button class="b sec chico" data-g="WIFI_RED" data-i="aWr">Guardar</button></div></div>' +
      '<div><label class="et2" for="aWc">Clave wifi</label><div class="fila"><input class="campo2 crece" id="aWc" value="' + esc(a.WIFI_CLAVE) + '" placeholder="Contraseña"><button class="b sec chico" data-g="WIFI_CLAVE" data-i="aWc">Guardar</button></div></div>' +
      '<div class="ancho"><label class="et2" for="aAv">Aviso arriba de la agenda</label><div class="fila"><input class="campo2 crece" id="aAv" value="' + esc(a.AVISO) + '" placeholder="Ej: Empezamos 10 minutos tarde"><button class="b sec chico" data-g="AVISO" data-i="aAv">Guardar</button></div><div class="cont">Lo ven todos (QR del dorso y del sticker). Borralo y guardá para sacarlo.</div></div></div></div>' +
      '<div class="tarj"><div class="fila"><h3 class="crece" style="margin:0">🎤 Preguntas</h3><select class="campo2" id="pfCharla" style="width:auto"></select><div class="seg" id="pfEst"><button data-v="activas"' + (fP.estado === 'activas' ? ' class="on"' : '') + '>Para moderar</button><button data-v="Elegida"' + (fP.estado === 'Elegida' ? ' class="on"' : '') + '>Elegidas</button><button data-v="todas"' + (fP.estado === 'todas' ? ' class="on"' : '') + '>Todas</button></div></div><div class="cont">Se actualiza sola cada 20 segundos.</div><div id="pfLista"></div></div>' +
      '<div class="tarj"><h3>⭐ Encuesta</h3><div class="cont">' + P.encuesta.respuestas + ' persona(s) respondieron.</div><div id="encRes"></div><h3 style="margin-top:18px">Preguntas de la encuesta</h3><div id="encEd"></div><div class="acc"><button class="b sec" id="encMas">＋ Agregar pregunta</button><button class="b pri" id="encGuardar">Guardar preguntas</button></div></div>' +
      '<div class="tarj"><h3>🤝 Networking</h3><div class="grilla"><div class="kpi"><small>Comparten</small><b>' + P.net.comparten + '</b></div><div class="kpi"><small>No comparten</small><b>' + P.net.noComparten + '</b></div><div class="kpi"><small>Sin responder</small><b>' + P.net.sinRespuesta + '</b></div></div></div>';
    $('main').onchange = function (e) {
      var i = e.target; if (!i.hasAttribute('data-aj')) return; var k = i.getAttribute('data-aj'), v = i.checked;
      api('personalAjuste', { clave: k, valor: v }).then(function () { toast(v ? '✓ Prendido' : '✓ Apagado'); }).catch(function (e2) { i.checked = !v; fallo(e2); });
    };
    $('main').onclick = function (e) {
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
      '<div><label class="et2">Rol</label><select class="campo2" id="uRol"><option value="operador"' + (u.rol === 'operador' ? ' selected' : '') + '>Operador (acreditación)</option><option value="admin"' + (u.rol === 'admin' ? ' selected' : '') + '>Admin (todo)</option></select></div>' +
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
    $('hYo').textContent = S.yo.nombre; $('hRol').textContent = S.yo.rol === 'admin' ? 'Admin' : 'Operador';
    ir((location.hash || '').slice(1) || (esAdmin() ? 'inicio' : 'puerta'));
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
