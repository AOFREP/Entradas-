/* Panel del celular: validar socios, tickets, números y venta. Uso interno, con clave. */
(function () {
  var $ = F.$, esc = F.esc, plata = F.plata;
  var S = null, D = { socios: null, resumen: null, tipos: [] }, tabSoc = 'p', vista = 'Socios', timer = null;

  // ── sesión (solo en este celular; vence a las 12 h) ──
  function leerS() { try { var s = JSON.parse(localStorage.getItem('panel_s') || 'null'); return s && s.vence > Date.now() ? s : null; } catch (e) { return null; } }
  function guardarS(s) { try { localStorage.setItem('panel_s', JSON.stringify(s)); } catch (e) { } }
  function borrarS() { try { localStorage.removeItem('panel_s'); } catch (e) { } }
  function recordarQuien(q) { try { localStorage.setItem('panel_quien', q); } catch (e) { } }
  function quienGuardado() { try { return localStorage.getItem('panel_quien') || ''; } catch (e) { return ''; } }

  function toast(t, err) {
    var x = $('toast'); x.textContent = t; x.className = 'toast' + (err ? ' err' : '');
    clearTimeout(toast.t); toast.t = setTimeout(function () { x.className = 'toast oculto'; }, err ? 7000 : 4500);
  }
  function api(op, datos) {
    return F.post('panel', Object.assign({ token: S.token, quien: S.quien, op: op }, datos || {})).catch(function (e) {
      if (/^SESION: /.test(e.message)) { salir(e.message.replace(/^SESION: /, '')); throw new Error('_sesion'); }
      throw e;
    });
  }
  function fallo(e) { if (e && e.message === '_sesion') return; toast('⚠ ' + F.msg(e), true); }
  function ocupado(el, si) { if (el) el.classList.toggle('cargando', !!si); }

  // ── login ──
  function mostrarLogin(msj) {
    $('pApp').classList.add('oculto'); $('pLogin').classList.remove('oculto');
    $('lQuien').value = quienGuardado(); $('lErr').textContent = msj || '';
    (quienGuardado() ? $('lClave') : $('lQuien')).focus();
  }
  function entrar() {
    var quien = $('lQuien').value.trim(), clave = $('lClave').value;
    if (quien.length < 2) { $('lErr').textContent = 'Poné tu nombre.'; return; }
    if (!clave) { $('lErr').textContent = 'Poné la clave.'; return; }
    $('lEntrar').disabled = true; $('lErr').textContent = '';
    F.post('panelLogin', { quien: quien, clave: clave }).then(function (r) {
      S = { token: r.token, quien: r.quien, vence: Date.now() + r.horas * 3600000 - 60000, evento: r.evento && r.evento.nombre };
      guardarS(S); recordarQuien(r.quien); $('lClave').value = '';
      iniciar();
    }).catch(function (e) { $('lErr').textContent = F.msg(e); }).then(function () { $('lEntrar').disabled = false; });
  }
  function salir(msj) { borrarS(); S = null; clearInterval(timer); cerrarHoja(); mostrarLogin(msj); }

  // ── app ──
  function iniciar() {
    $('pLogin').classList.add('oculto'); $('pApp').classList.remove('oculto');
    $('aEvento').textContent = S.evento || 'Panel'; $('aQuien').textContent = 'Hola, ' + S.quien;
    $('vVer').href = './';
    ir('Socios');
    ocupado($('sLista'), true);
    api('inicio').then(function (r) { D.socios = r.socios; D.resumen = r.resumen; D.tipos = r.tipos || []; pintarSocios(); pintarResumen(); })
      .catch(fallo).then(function () { ocupado($('sLista'), false); });
    clearInterval(timer);
    timer = setInterval(function () { if (document.visibilityState === 'visible' && S) refrescar(true); }, 60000);
  }
  function ir(v) {
    vista = v;
    ['Socios', 'Tickets', 'Numeros', 'Venta'].forEach(function (k) { $('v' + k).classList.toggle('oculto', k !== v); });
    Array.prototype.forEach.call(document.querySelectorAll('.nav button'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); });
    window.scrollTo(0, 0);
    if (v === 'Numeros' || v === 'Venta') refrescar(true);
    if (v === 'Socios' && D.socios) refrescar(true);
  }
  function refrescar(callado) {
    if (vista === 'Socios') return api('socios').then(function (r) { D.socios = r.socios; pintarSocios(); }).catch(callado ? function () { } : fallo);
    if (vista === 'Numeros' || vista === 'Venta') return api('resumen').then(function (r) { D.resumen = r.resumen; pintarResumen(); }).catch(callado ? function () { } : fallo);
  }

  // ── socios ──
  function pintarSocios() {
    var s = D.socios; if (!s) return;
    var nDev = s.resueltas.filter(function (x) { return x.estado === 'A devolver'; }).length;
    $('sNP').textContent = s.pendientes.length ? '(' + s.pendientes.length + ')' : '';
    $('sND').textContent = nDev ? '· ' + nDev + ' 💸' : '';
    var bd = $('navBadge'); bd.textContent = s.pendientes.length; bd.style.display = s.pendientes.length ? 'block' : 'none';
    var l = tabSoc === 'p' ? s.pendientes : s.resueltas;
    if (!l.length) { $('sLista').innerHTML = '<div class="vacio">' + (tabSoc === 'p' ? 'No hay socios para validar. 🎉' : 'Todavía no hay validaciones resueltas.') + '</div>'; return; }
    $('sLista').innerHTML = l.map(function (x) {
      var dev = x.estado === 'A devolver', cl = x.estado === 'Aprobada' ? 'ok' : dev ? 'dev' : x.estado === 'Anulada' ? 'mal' : '';
      return '<div class="sol' + (dev ? ' dev' : '') + '">' +
        '<div style="display:flex;justify-content:space-between;gap:10px"><div><div class="emp">' + esc(x.empresa) + '</div><div class="cuit">CUIT ' + esc(x.cuit) + '</div></div>' +
        (tabSoc === 'r' ? '<div><span class="chip ' + cl + '">' + esc(x.estado) + '</span></div>' : '') + '</div>' +
        '<div class="linea"><b>' + esc(x.detalle) + '</b> · ' + plata(x.total) + '<br><small>Pagó ' + esc(x.pagada || x.creada) + ' · ' + esc(x.id) + '</small></div>' +
        '<div class="linea">Compró: ' + esc(x.nombre) + '<br><small>' + esc(x.mail) + (x.tel ? ' · <a href="tel:' + esc(x.tel) + '">' + esc(x.tel) + '</a>' : '') + '</small></div>' +
        (x.revision.length ? '<div class="linea">Socios a validar (' + plata(x.montoRev) + '):<br><small>' + x.revision.map(esc).join('<br>') + '</small></div>' : '') +
        (tabSoc === 'r' ? '<div class="linea"><small>' + [x.aprobadas ? x.aprobadas + ' validada(s)' : '', x.rechazadas ? x.rechazadas + ' rechazada(s) · a devolver ' + plata(x.devolver) : '', x.notas].filter(Boolean).map(esc).join('<br>') + '</small></div>' : '') +
        (tabSoc === 'p' && x.okEmpresa ? '<div class="aviso">Esta empresa ya tiene ' + x.okEmpresa + ' ticket(s) de socio validado(s)</div>' : '') +
        (tabSoc === 'p' ? '<div class="acc"><button class="b verde" data-val="' + esc(x.id) + '">✓ Validar</button><button class="b rojo" data-rec="' + esc(x.id) + '">Rechazar</button></div>' : '') +
        (tabSoc === 'r' && dev ? '<div class="linea" style="color:#8A3A00;font-weight:700">💸 Devolvé ' + plata(x.devolver) + ' en Mercado Pago' + (x.mpPago ? ' (pago ' + esc(x.mpPago) + ')' : '') + '</div><div class="acc"><button class="b marron" data-dev="' + esc(x.id) + '">Devolución hecha</button></div>' : '') +
        '</div>';
    }).join('');
  }
  function buscarSol(id) { return D.socios.pendientes.concat(D.socios.resueltas).find(function (x) { return x.id === id; }); }
  function accionSocio(op, id, extra, el) {
    ocupado(el, true);
    return api(op, Object.assign({ id: id }, extra || {})).then(function (r) { D.socios = r.socios; pintarSocios(); toast(r.msj); cerrarHoja(); })
      .catch(fallo).then(function () { ocupado(el, false); });
  }
  $('sLista').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var card = b.closest('.sol'), id;
    if ((id = b.getAttribute('data-val'))) {
      var x = buscarSol(id);
      if (!confirm('¿Validar a ' + x.empresa + '?\nLe llegan los QR por mail al instante.')) return;
      accionSocio('validar', id, null, card);
    } else if ((id = b.getAttribute('data-rec'))) {
      var y = buscarSol(id);
      abrirHoja('<div class="cab"><b>Rechazar socio</b><button class="cerrar" data-cerrar>✕</button></div>' +
        '<p style="margin:4px 0 0"><b>' + esc(y.empresa) + '</b> · CUIT ' + esc(y.cuit) + '</p>' +
        '<p style="font-size:14px;color:var(--gris)">Le llega un mail amable avisando que la membresía no está al día y que se le devuelve ' + plata(y.montoRev) + '. La orden queda "A devolver".</p>' +
        '<label class="et">Nota para el mail (opcional)</label><textarea class="campo" id="hNota" maxlength="300"></textarea>' +
        '<button class="b rojo full" id="hRech" style="margin-top:14px">Rechazar y avisar</button>');
      $('hRech').onclick = function () { accionSocio('rechazar', id, { nota: $('hNota').value }, $('hojaCaja')); };
    } else if ((id = b.getAttribute('data-dev'))) {
      if (!confirm('¿Ya hiciste la devolución en Mercado Pago?')) return;
      accionSocio('devuelto', id, null, card);
    }
  });
  Array.prototype.forEach.call(document.querySelectorAll('.seg button'), function (b) {
    b.onclick = function () { tabSoc = b.getAttribute('data-s'); Array.prototype.forEach.call(document.querySelectorAll('.seg button'), function (x) { x.classList.toggle('on', x === b); }); pintarSocios(); };
  });

  // ── tickets ──
  var R = [];
  function buscar() {
    var q = $('tQ').value.trim(); if (q.length < 2) { toast('Escribí al menos 2 letras.', true); return; }
    $('tQ').blur(); $('tLista').innerHTML = '<div class="vacio">Buscando…</div>';
    api('buscar', { q: q }).then(function (r) {
      R = r.tickets;
      if (!R.length) { $('tLista').innerHTML = '<div class="vacio">No encontré tickets con eso.</div>'; return; }
      $('tLista').innerHTML = R.map(function (x, i) {
        var cl = x.estado === 'Válida' ? 'ok' : x.estado === 'En revisión' ? 'rev' : 'mal', et = x.estado === 'En revisión' ? 'Socio sin validar' : x.estado === 'Válida' ? 'Válido' : x.estado;
        return '<div class="res" data-i="' + i + '"><div class="i"><b>' + esc(x.nombre) + '</b><small>' + esc(x.tipo) + ' · DNI ' + esc(x.dni) + (x.empresa ? ' · ' + esc(x.empresa) : '') +
          '<br>' + esc(x.cod) + (x.ingreso ? ' · ingresó ' + esc(x.ingreso) : '') + '</small></div><span class="chip ' + cl + '">' + esc(et) + '</span></div>';
      }).join('');
    }).catch(function (e) { $('tLista').innerHTML = ''; fallo(e); });
  }
  $('tBuscar').onclick = buscar;
  $('tQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') buscar(); });
  $('tLista').addEventListener('click', function (e) {
    var d = e.target.closest('.res'); if (!d) return;
    var x = R[+d.getAttribute('data-i')];
    if (!x.valida) {
      abrirHoja('<div class="cab"><b>' + esc(x.nombre) + '</b><button class="cerrar" data-cerrar>✕</button></div>' +
        '<p>Este ticket está <b>' + esc(x.estado === 'En revisión' ? 'esperando validación de socio' : x.estado) + '</b>: no se puede enviar.' +
        (x.estado === 'En revisión' ? ' Validalo en la pestaña Socios.' : '') + '</p>' +
        '<p style="font-size:14px;color:var(--gris)">' + esc(x.tipo) + ' · ' + esc(x.cod) + ' · orden ' + esc(x.orden) + '</p>');
      return;
    }
    ocupado(d, true);
    api('ticket', { cod: x.cod }).then(function (r) { abrirTicket(x, r.ticket); }).catch(fallo).then(function () { ocupado(d, false); });
  });
  function telWa(t) {
    var d = String(t || '').replace(/\D/g, ''); if (!d) return '';
    if (/^54/.test(d)) { d = d.slice(2); if (d[0] === '9') d = d.slice(1); }
    d = d.replace(/^0/, '');
    if (d.length === 12) for (var k = 2; k <= 4; k++) if (d.substr(k, 2) === '15') { d = d.slice(0, k) + d.slice(k + 2); break; }
    if (d.length === 8) d = '11' + d;
    return d.length === 10 ? '549' + d : '';
  }
  function abrirTicket(x, t) {
    abrirHoja('<div class="cab"><b>' + esc(t.nombre) + '</b><button class="cerrar" data-cerrar>✕</button></div>' +
      '<img class="qr" src="' + t.qr + '" alt="QR">' +
      '<div style="text-align:center;font-family:monospace;color:var(--gris)">' + esc(t.cod) + '</div>' +
      '<div style="text-align:center;font-size:14px;color:var(--gris);margin-top:2px">' + esc(x.tipo) + (x.empresa ? ' · ' + esc(x.empresa) : '') + (x.ingreso ? ' · ingresó ' + esc(x.ingreso) : '') + '</div>' +
      '<label class="et">Celular</label><input class="campo" id="hTel" inputmode="tel" value="' + esc(x.tel) + '" placeholder="11 5555 5555">' +
      '<div style="font-size:12px;color:var(--gris);margin-top:4px" id="hTelAy"></div>' +
      '<label class="et">Mensaje</label><textarea class="campo" id="hTxt" style="min-height:150px">' + esc(t.mensaje) + '</textarea>' +
      '<div class="acc"><a class="b wa" id="hWa" target="_blank" rel="noopener">💬 Mandar por WhatsApp</a></div>' +
      '<div class="acc"><button class="b linea" id="hMail" style="flex:1">✉️ Reenviar mail</button><button class="b linea" id="hCopiar" style="flex:1">Copiar link</button></div>' +
      '<div class="acc"><a class="b linea full" href="' + esc(t.link) + '" target="_blank" rel="noopener">Ver el ticket</a></div>');
    var armar = function () {
      var n = telWa($('hTel').value);
      $('hTelAy').textContent = $('hTel').value.trim() ? (n ? '✓ Abre el chat con +' + n : 'No reconozco el número: WhatsApp te deja elegir el contacto.') : 'Sin celular: WhatsApp te deja elegir el contacto.';
      $('hWa').href = 'https://wa.me/' + (n || '') + '?text=' + encodeURIComponent($('hTxt').value);
    };
    $('hTel').oninput = armar; $('hTxt').oninput = armar; armar();
    $('hMail').onclick = function () {
      if (!confirm('¿Reenviar los tickets de la orden ' + x.orden + ' al mail del comprador?')) return;
      var b = $('hMail'); b.disabled = true;
      api('reenviar', { id: x.orden }).then(function (r) { toast(r.msj); }).catch(fallo).then(function () { b.disabled = false; });
    };
    $('hCopiar').onclick = function () {
      var ok = function () { toast('✓ Link copiado'); };
      try { navigator.clipboard.writeText(t.link).then(ok, function () { prompt('Copiá el link:', t.link); }); } catch (e) { prompt('Copiá el link:', t.link); }
    };
  }

  // ── cortesía rápida ──
  $('tCort').onclick = function () {
    var tipos = D.tipos || [];
    abrirHoja('<div class="cab"><b>Cortesía rápida</b><button class="cerrar" data-cerrar>✕</button></div>' +
      '<p style="font-size:14px;color:var(--gris);margin:0">Para invitados, prensa o staff. El ticket sale válido al instante y usa un lugar del cupo.</p>' +
      '<label class="et">Tipo de ticket</label><select class="campo" id="cTipo">' + tipos.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.nombre) + '</option>'; }).join('') + '</select>' +
      '<label class="et">Nombre y apellido</label><input class="campo" id="cNom" maxlength="80" autocomplete="off">' +
      '<div class="dos"><div><label class="et">DNI</label><input class="campo" id="cDni" inputmode="numeric" maxlength="12"></div>' +
      '<div><label class="et">Mail (opcional)</label><input class="campo" id="cMail" type="email" maxlength="120" autocomplete="off"></div></div>' +
      '<label class="et">Motivo (opcional)</label><input class="campo" id="cNota" maxlength="60" placeholder="Ej: prensa, orador, staff">' +
      '<label style="display:flex;gap:8px;align-items:center;margin-top:14px;font-size:15px"><input type="checkbox" id="cMandar" checked style="width:20px;height:20px"> Mandarle el ticket por mail</label>' +
      '<button class="b azul full" id="cCrear" style="margin-top:16px">Crear cortesía</button>');
    $('cCrear').onclick = function () {
      var d = { tipo: $('cTipo').value, nombre: $('cNom').value.trim(), dni: $('cDni').value.trim(), mail: $('cMail').value.trim(), nota: $('cNota').value.trim(), mandar: $('cMandar').checked };
      if (d.nombre.length < 3) { toast('Poné nombre y apellido.', true); return; }
      if (!confirm('¿Crear una cortesía para ' + d.nombre + '?')) return;
      ocupado($('hojaCaja'), true);
      api('cortesia', d).then(function (r) {
        toast(r.msj); cerrarHoja();
        if (r.cod) { $('tQ').value = r.cod; buscar(); }
      }).catch(fallo).then(function () { ocupado($('hojaCaja'), false); });
    };
  };

  // ── números y venta ──
  function pintarResumen() {
    var r = D.resumen; if (!r) return;
    $('aPrueba').classList.toggle('oculto', !r.prueba);
    var k = function (t, v, al) { return '<div class="kpi' + (al ? ' alerta' : '') + '"><small>' + t + '</small><b>' + v + '</b></div>'; };
    $('nKpis').innerHTML = k('Tickets válidos', r.validos + (r.cupo ? '<small style="font-size:14px;color:var(--suave);text-transform:none"> / ' + r.cupo + '</small>' : '')) +
      k('Cobrado', plata(r.cobrado)) + k('Adentro', r.adentro) + k('Socios a validar', r.revision, r.revision > 0) +
      k('A devolver', r.aDevolver, r.aDevolver > 0) + k('Pagando ahora', r.pagando);
    $('nTabla').innerHTML = '<tr><th>Tipo</th><th>Vendidos</th><th>Cort.</th><th>Disp.</th></tr>' + r.tipos.map(function (t) {
      var est = t.estado === 'agotado' ? 'Agotado' : t.estado === 'proximamente' ? 'Próximamente' : t.estado === 'finalizado' ? 'Finalizado' : t.estado === 'reservado' ? 'Reservado' : '';
      return '<tr><td><b>' + esc(t.nombre) + '</b>' + (t.revision ? '<small>' + t.revision + ' en revisión</small>' : '') + (t.adentro ? '<small>' + t.adentro + ' adentro</small>' : '') + '</td>' +
        '<td>' + t.vendidos + '</td><td>' + t.cortesias + '</td><td>' + (t.disp == null ? '—' : t.disp) + (est ? '<small>' + est + '</small>' : '') + '</td></tr>';
    }).join('');
    $('nHora').textContent = 'Actualizado ' + r.hora;
    $('vAbierta').checked = r.abierta; $('vAgotado').checked = r.agotado;
    $('vInfo').innerHTML = (r.prueba ? '🧪 <b>Modo prueba</b> activado (se cambia desde la planilla).<br>' : '') +
      'Estado ahora: ' + (r.abierta ? (r.agotado ? '🔴 Todo agotado' : '🟢 Vendiendo') : '🔴 Venta cerrada') + ' · ' + r.hora + ' hs';
  }
  $('nAct').onclick = function (e) { e.preventDefault(); ocupado($('vNumeros'), true); refrescar(false).then(function () { ocupado($('vNumeros'), false); }); };
  function cambiarVenta(campo, input, texto) {
    var valor = input.checked;
    if (!confirm(texto(valor))) { input.checked = !valor; return; }
    ocupado($('vVenta'), true);
    api('venta', { campo: campo, valor: valor }).then(function (r) { D.resumen = r.resumen; pintarResumen(); toast('✓ Listo. La página ya lo muestra.'); })
      .catch(function (e) { input.checked = !valor; fallo(e); }).then(function () { ocupado($('vVenta'), false); });
  }
  $('vAbierta').onchange = function () { cambiarVenta('VENTA_ABIERTA', this, function (v) { return v ? '¿Abrir la venta? La página empieza a vender.' : '¿Cerrar la venta? Nadie más va a poder comprar.'; }); };
  $('vAgotado').onchange = function () { cambiarVenta('AGOTADO', this, function (v) { return v ? '¿Marcar TODO como agotado? Nadie más va a poder comprar.' : '¿Quitar el agotado? Vuelven a venderse los tickets con lugar.'; }); };

  // ── hoja inferior ──
  function abrirHoja(html) { $('hojaCaja').innerHTML = html; $('hoja').classList.remove('oculto'); document.body.style.overflow = 'hidden'; }
  function cerrarHoja() { $('hoja').classList.add('oculto'); $('hojaCaja').innerHTML = ''; document.body.style.overflow = ''; }
  $('hoja').addEventListener('click', function (e) { if (e.target === $('hoja') || e.target.closest('[data-cerrar]')) cerrarHoja(); });

  // ── arranque ──
  Array.prototype.forEach.call(document.querySelectorAll('.nav button'), function (b) { b.onclick = function () { ir(b.getAttribute('data-v')); }; });
  $('lEntrar').onclick = entrar;
  $('lClave').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
  $('aSalir').onclick = function () { if (confirm('¿Cerrar sesión en este celular?')) salir(); };
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S) { if (!leerS()) salir('La sesión venció. Entrá de nuevo.'); else refrescar(true); } });
  S = leerS();
  if (S) iniciar(); else mostrarLogin();
})();
