/* Credenciales: imprime el sticker de 80 × 50 mm de cada persona en la Zebra (tanda previa o en la puerta). Uso interno, con el PIN del escáner. */
(function () {
  var $ = F.$, esc = F.esc;
  var S = null, D = { creds: [], roles: [], sitio: '' }, actual = null, vista = 'Puerta', imprimiendo = false, cancelar = false;
  var ANCHO = 640, ALTO = 400; // 80 × 50 mm a 203 dpi (8 puntos por mm)
  var CFG_DEF = { modo: 'zebra', qr: true, ribbon: true, oscuro: 0, dx: 0, dy: 0 };
  var cfg = Object.assign({}, CFG_DEF, leerJSON('cred_cfg') || {});

  function leerJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function guardarJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function toast(t, err) { var x = $('toast'); x.textContent = t; x.className = 'toast' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(function () { x.className = 'toast oculto'; }, err ? 7000 : 3500); }
  function api(op, datos) {
    return F.post('cred', Object.assign({ token: S.token, puerta: S.puerta, op: op }, datos || {})).catch(function (e) {
      if (/^SESION: /.test(e.message)) { salir(e.message.replace(/^SESION: /, '')); throw new Error('_sesion'); }
      throw e;
    });
  }
  function fallo(e) { if (e && e.message === '_sesion') return; var m = F.msg(e); toast('⚠ ' + (m && m !== 'undefined' ? m : 'Algo falló, probá de nuevo.'), true); try { console.error('[credenciales]', e); } catch (x) { } }

  // ── datos de cada persona ──
  function nombreCred(c) { return String(c.nomCred || c.nombre || '').trim(); }
  function empresaCred(c) { return String(c.empCred || c.empresaCompra || c.empresaFactura || '').trim(); }
  function apellido(c) { var p = nombreCred(c).split(/\s+/); return (p.length > 1 ? p.slice(1).join(' ') : p[0]).toLowerCase(); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  /** El lector USB escribe como un teclado: con teclado en español el guion puede salir como ' o ?. Nos quedamos con FZ + 10 caracteres. */
  function codigoLeido(t) {
    var s = String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var m = s.match(/FZ([A-Z0-9]{10})/);
    return m ? 'FZ-' + m[1] : '';
  }
  function buscarCod(cod) { return D.creds.find(function (c) { return c.cod === cod; }); }

  // ── sesión ──
  // Volver a la consola: solo si en esta compu hay una sesión de admin abierta en la consola
  function adminConsola() { try { var c = JSON.parse(localStorage.getItem('cons_s') || 'null'); return !!(c && c.yo && c.yo.rol === 'admin' && Number(String(c.token).split('.')[0]) > Date.now()); } catch (e) { return false; } }
  function leerS() { var s = leerJSON('cred_s'); if (!s || !s.token) return null; var v = Number(String(s.token).split('.')[0]); return v > Date.now() ? s : null; }
  function entrar() {
    var puerta = $('lPuerta').value.trim(), pin = $('lPin').value.trim();
    if (puerta.length < 2) { $('lErr').textContent = 'Poné un nombre para esta compu.'; return; }
    if (!pin) { $('lErr').textContent = 'Poné el PIN.'; return; }
    $('lEntrar').disabled = true; $('lErr').textContent = '';
    F.post('login', { puerta: puerta, pin: pin }, 60000).then(function (r) {
      S = { token: r.token, puerta: r.puerta, evento: r.evento && r.evento.nombre };
      guardarJSON('cred_s', S); try { localStorage.setItem('cred_puerta', r.puerta); } catch (e) { }
      $('lPin').value = ''; iniciar();
    }).catch(function (e) { $('lErr').textContent = F.msg(e); }).then(function () { $('lEntrar').disabled = false; });
  }
  function salir(msj) { try { localStorage.removeItem('cred_s'); } catch (e) { } S = null; $('vApp').classList.add('oculto'); $('vLogin').classList.remove('oculto'); $('lErr').textContent = msj || ''; try { $('lPuerta').value = localStorage.getItem('cred_puerta') || ''; } catch (e) { } }

  function iniciar() {
    $('vLogin').classList.add('oculto'); $('vApp').classList.remove('oculto');
    $('hEvento').textContent = 'Credenciales · ' + (S.evento || ''); $('hPuerta').textContent = 'Puerta: ' + S.puerta;
    $('hConsola').classList.toggle('oculto', !adminConsola());
    cargar().then(function () {
      ir(vista);
      // credenciales.html?cod=FZ-… (viene de la consola): abre a esa persona lista para imprimir
      var pc = codigoLeido(new URLSearchParams(location.search).get('cod'));
      if (pc) { ir('Puerta'); var c = buscarCod(pc); if (c) elegir(c, false); try { history.replaceState(null, '', location.pathname); } catch (e) { } }
    });
    detectarImpresora();
    clearInterval(iniciar.t);
    iniciar.t = setInterval(function () { if (document.visibilityState === 'visible' && !imprimiendo) cargar(true); }, 60000);
  }
  function cargar(callado) {
    return api('lista').then(function (r) {
      D.creds = r.creds || []; D.roles = r.roles || []; D.netOn = !!r.netOn; D.sitio = r.sitio || location.origin;
      if (actual) { var n = buscarCod(actual.cod); if (n) actual = Object.assign(n, { _edit: actual._edit }); }
      cuenta(); if (vista === 'Tanda') pintarTanda();
    }).catch(callado ? function () { } : fallo);
  }
  function cuenta() {
    var val = D.creds.filter(function (c) { return c.estado === 'Válida'; }), imp = val.filter(function (c) { return c.veces > 0; }).length;
    $('hCuenta').textContent = imp + ' / ' + val.length + ' stickers';
  }
  function ir(v) {
    vista = v;
    ['Puerta', 'Tanda', 'Impresora'].forEach(function (k) { $('v' + k).classList.toggle('oculto', k !== v); });
    Array.prototype.forEach.call(document.querySelectorAll('nav button'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); });
    if (v === 'Tanda') pintarTanda();
    if (v === 'Puerta') { pintarEditor(); setTimeout(function () { $('pLector').focus(); }, 50); }
    if (v === 'Impresora') pintarCfg();
  }

  // ── dibujo del sticker (igual al diseño aprobado: centrado, franja negra abajo) ──
  var fuenteLista = null;
  function fuente() {
    if (!fuenteLista) fuenteLista = Promise.all(['800', '700', '600', '500'].map(function (w) { return document.fonts.load(w + ' 60px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'); })).catch(function () { });
    return fuenteLista;
  }
  function ajustar(cx, texto, peso, max, ancho) {
    var t = max;
    for (; t > 20; t -= 2) { cx.font = peso + ' ' + t + 'px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; if (cx.measureText(texto).width <= ancho) break; }
    return t;
  }
  function partir(cx, texto, ancho) {
    var p = texto.split(/\s+/), mejor = null;
    for (var i = 1; i < p.length; i++) {
      var a = p.slice(0, i).join(' '), b = p.slice(i).join(' '), w = Math.max(cx.measureText(a).width, cx.measureText(b).width);
      if (!mejor || w < mejor.w) mejor = { a: a, b: b, w: w };
    }
    return mejor;
  }
  function datosSticker(c) {
    return { nombre: nombreCred(c).toUpperCase(), empresa: empresaCred(c), rubro: String(c.rubro || '').trim(), rol: String(c.rol || '').trim(), cargo: String(c.cargo || '').trim(), cargo2: String(c.cargo2 || '').trim(), empresa2: String(c.empCred2 || '').trim(),
      qr: cfg.qr && c.hola ? (D.sitio || location.origin).replace(/\/+$/, '') + '/a?h=' + c.hola : '' };
  }
  // Renglón con partes de distinto peso (ej: "Presidenta · " liviano + "AOFREP" negrita)
  var FUENTE = 'px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  function anchoSeg(cx, segs, t) { return segs.reduce(function (a, g) { cx.font = g.peso + ' ' + t + FUENTE; return a + cx.measureText(g.txt).width; }, 0); }
  function ajustarSeg(cx, segs, max, ancho) { var t = max; for (; t > 20; t -= 2) if (anchoSeg(cx, segs, t) <= ancho) break; return t; }
  function lineaEmpresa(cargo, empresa) {
    var segs = [];
    if (cargo && empresa) segs.push({ txt: cargo + ' · ', peso: 500 });
    else if (cargo) segs.push({ txt: cargo, peso: 600 });
    if (empresa) segs.push({ txt: empresa, peso: 700 });
    return segs;
  }
  function dibujar(canvas, d) {
    canvas.width = ANCHO; canvas.height = ALTO;
    var cx = canvas.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, ANCHO, ALTO);
    cx.fillStyle = '#000'; cx.textBaseline = 'alphabetic'; cx.textAlign = 'left';
    var margen = 32, qrLado = 0, qrX = 0, qrY = 0;
    // QR personal en la esquina inferior derecha, a 3,5 mm de los bordes (zona segura si la etiqueta se corre)
    if (d.qr && typeof qrcode === 'function') {
      var q = qrcode(0, 'L'); q.addData(d.qr); q.make();
      var n = q.getModuleCount(), m = 3; qrLado = n * m;
      qrX = ANCHO - 28 - qrLado; qrY = ALTO - 28 - qrLado;
      for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) cx.fillRect(qrX + k * m, qrY + r * m, m, m);
    }
    // Texto centrado en todo el ancho. Solo los renglones que bajan hasta la altura del QR se achican para no tocarlo.
    var izqA = (window.STICKER_ALINEAR || 'centro') === 'izq';
    var centro = izqA ? margen : ANCHO / 2, full = ANCHO - 2 * margen;
    var angosto = qrLado ? (izqA ? qrX - 14 - margen : Math.max(220, 2 * (qrX - 14 - centro))) : full, qTop = qrLado ? qrY - 14 : Infinity;
    // Nombre: hasta 100 px; si no entra, se achica; si sigue sin entrar (o es muy largo), dos renglones
    cx.font = '800 100' + FUENTE;
    var lineas = [d.nombre], tNom = ajustar(cx, d.nombre, 800, 100, full);
    if (tNom < 72 && d.nombre.indexOf(' ') > 0) {
      cx.font = '800 100' + FUENTE; var pr = partir(cx, d.nombre, full);
      if (pr) { var t2 = Math.min(ajustar(cx, pr.a, 800, 84, full), ajustar(cx, pr.b, 800, 84, full)); if (t2 > tNom) { lineas = [pr.a, pr.b]; tNom = t2; } }
    }
    var e1 = lineaEmpresa(d.cargo, d.empresa), e2 = lineaEmpresa(d.cargo2, d.empresa2), dos = e1.length && e2.length;
    var items = lineas.map(function (l) { return { segs: [{ txt: l, peso: 800 }], max: lineas.length > 1 ? 84 : 100, gap: 0, f: 0.95, nom: true, w: full }; });
    if (e1.length) items.push({ segs: e1, max: dos ? 50 : 60, gap: 14, f: 1, w: full });
    if (e2.length) items.push({ segs: e2, max: 50, gap: 6, f: 1, w: full });
    if (d.rubro) items.push({ segs: [{ txt: d.rubro, peso: 500 }], max: dos ? 36 : 42, gap: 6, f: 1, w: full });
    for (var vuelta = 0; vuelta < 5; vuelta++) {
      items.forEach(function (it) { it.t = ajustarSeg(cx, it.segs, it.max, it.w); });
      var tn = Math.min.apply(null, items.filter(function (it) { return it.nom; }).map(function (it) { return it.t; }));
      items.forEach(function (it) { if (it.nom) it.t = tn; });
      var alto = items.reduce(function (a, it) { return a + it.gap + it.t * it.f; }, 0);
      var yy = Math.round((ALTO - alto) / 2), cambio = false;
      items.forEach(function (it) { yy += it.gap + it.t * it.f; it.y = yy; if (yy - it.t * 0.17 > qTop && it.w !== angosto) { it.w = angosto; cambio = true; } });
      if (!cambio) break;
    }
    items.forEach(function (it) {
      var w = anchoSeg(cx, it.segs, it.t), x = izqA ? margen : centro - w / 2, base = it.y - it.t * 0.17;
      it.segs.forEach(function (g) { cx.font = g.peso + ' ' + it.t + FUENTE; cx.fillText(g.txt, x, base); x += cx.measureText(g.txt).width; });
    });
    return canvas;
  }

  // ── salida a la impresora ──
  /** Canvas → ZPL con la imagen en blanco y negro (^GFA). */
  function zpl(canvas) {
    var cx = canvas.getContext('2d'), px = cx.getImageData(0, 0, ANCHO, ALTO).data, bpr = ANCHO / 8, hex = [], HX = '0123456789ABCDEF';
    for (var y = 0; y < ALTO; y++) {
      for (var b = 0; b < bpr; b++) {
        var v = 0;
        for (var i = 0; i < 8; i++) { var o = (y * ANCHO + b * 8 + i) * 4, lum = px[o] * 0.299 + px[o + 1] * 0.587 + px[o + 2] * 0.114; if (lum < 140) v |= (128 >> i); }
        hex.push(HX[v >> 4] + HX[v & 15]);
      }
    }
    var total = bpr * ALTO, dx = Math.round((Number(cfg.dx) || 0) * 8), dy = Math.round((Number(cfg.dy) || 0) * 8), md = Math.max(-10, Math.min(10, Math.round(Number(cfg.oscuro) || 0)));
    return '^XA^PW' + ANCHO + '^LL' + ALTO + '^MN' + 'Y' + '^MT' + (cfg.ribbon ? 'T' : 'D') + '^MD' + md + '^LH' + Math.max(0, dx) + ',' + Math.max(0, dy) +
      '^FO' + Math.max(0, -dx) + ',' + Math.max(0, -dy) + '^GFA,' + total + ',' + total + ',' + bpr + ',' + hex.join('') + '^FS^PQ1^XZ';
  }
  // Zebra Browser Print (programa de Zebra en la Mac): http en 9100 o https en 9101
  var BP = { base: null, disp: null };
  function bpFetch(base, ruta, opciones) { return fetch(base + ruta, Object.assign({ mode: 'cors' }, opciones || {})); }
  function detectarImpresora() {
    if (cfg.modo === 'dialogo') { estadoImp('dialogo'); return Promise.resolve(false); }
    estadoImp('buscando');
    var bases = ['http://127.0.0.1:9100', 'https://127.0.0.1:9101'], i = 0;
    function probar() {
      if (i >= bases.length) { BP.base = null; BP.disp = null; estadoImp('no'); return false; }
      var base = bases[i++];
      // v1.12.2: primero la lista REAL de impresoras conectadas (/available). La "predeterminada" (/default) puede tener
      // guardada una dirección USB vieja (cambia si se desenchufa o se cambia de puerto) y ahí no imprime nada.
      var tiempo = function (pr) { return Promise.race([pr, new Promise(function (ok, mal) { setTimeout(function () { mal(new Error('tiempo')); }, 4000); })]); };
      return tiempo(bpFetch(base, '/available').then(function (r) { return r.json(); }))
        .then(function (j) {
          var lista = ((j && j.printer) || []).filter(function (x) { return x && x.uid; });
          var zebra = lista.filter(function (x) { return /zebra|zd2|zpl/i.test((x.manufacturer || '') + ' ' + (x.name || '') + ' ' + x.uid); });
          var p = (zebra.length ? zebra : lista)[0];
          if (p) { BP.base = base; BP.disp = p; estadoImp('ok'); return true; }
          // sin lista: probamos la predeterminada
          return tiempo(bpFetch(base, '/default?type=printer').then(function (r) { return r.text(); })).then(function (t) {
            var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { }
            if (d && d.uid) { BP.base = base; BP.disp = d; estadoImp('ok'); return true; }
            BP.base = base; BP.disp = null; estadoImp('sinzebra'); return false;
          });
        }).catch(probar);
    }
    return probar();
  }
  function estadoImp(e) {
    var p = $('hImpresora'), s = $('iEstado'), nom = BP.disp ? (BP.disp.name || 'Zebra') : '';
    var m = {
      buscando: ['Impresora: buscando…', '', 'Buscando la Zebra…', 'info'],
      ok: ['🖨️ ' + nom, 'ok', '✓ Conectada: ' + nom + '. Los stickers salen directo.', 'ok'],
      no: ['Zebra no encontrada', 'mal', 'No encuentro Zebra Browser Print. ¿Está instalado y abierto en esta Mac? En Chrome, si pregunta por acceso a la red local, tocá Permitir. Si lo acabás de abrir, tocá "Buscar impresora". Mientras tanto podés usar el cuadro de impresión.', 'mal'],
      sinzebra: ['Sin impresora', 'av', 'Browser Print está abierto pero no ve ninguna Zebra. Revisá que esté prendida y conectada por USB, y en el ícono de Browser Print elegila como predeterminada.', 'av'],
      dialogo: ['🖨️ Cuadro de impresión', 'av', 'Modo cuadro de impresión: en cada impresión se abre el diálogo de la Mac. Elegí la Zebra, tamaño 80 × 50 mm y escala 100 %.', 'info']
    }[e];
    p.textContent = m[0]; p.className = 'pill ' + m[1]; s.textContent = m[2]; s.className = 'aviso ' + m[3];
  }
  function enviarZebra1(datos) {
    return bpFetch(BP.base, '/write', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ device: BP.disp, data: datos }) })
      .then(function (r) { if (!r.ok) return r.text().catch(function () { return ''; }).then(function (t) { throw new Error('Browser Print respondió ' + r.status + (t ? ': ' + String(t).slice(0, 120) : '')); }); },
        function () { throw new Error('No hubo respuesta de Browser Print'); });
  }
  /** Si falla (ej: se desenchufó la Zebra y cambió su dirección USB), vuelve a buscarla y reintenta una vez. */
  function enviarZebra(datos) {
    var listo = BP.base && BP.disp ? Promise.resolve(true) : detectarImpresora();
    return listo.then(function (ok) {
      if (!ok) throw new Error('No encuentro la Zebra. Revisá que esté prendida y enchufada, y que Browser Print esté abierto. Después tocá "Buscar impresora".');
      return enviarZebra1(datos).catch(function (e1) {
        return detectarImpresora().then(function (ok2) {
          if (!ok2) throw new Error('No encuentro la Zebra (' + e1.message + '). Revisá el USB y que Browser Print esté abierto.');
          return enviarZebra1(datos).catch(function (e2) { throw new Error('No se pudo imprimir: ' + e2.message + '. Probá desenchufar y enchufar el USB de la Zebra y tocar "Buscar impresora".'); });
        });
      });
    });
  }
  /** Imprime una lista de stickers. Zebra: uno por uno. Diálogo: todos juntos en una ventana. */
  function imprimirStickers(lista, alAvanzar) {
    if (cfg.modo === 'dialogo') return imprimirDialogo(lista);
    var i = 0;
    function sig() {
      if (cancelar) return Promise.resolve(i);
      if (i >= lista.length) return Promise.resolve(i);
      var cv = dibujar(document.createElement('canvas'), datosSticker(lista[i]));
      return enviarZebra(zpl(cv)).then(function () { i++; if (alAvanzar) alAvanzar(i, lista[i - 1]); return new Promise(function (ok) { setTimeout(ok, 150); }); }).then(sig);
    }
    return fuente().then(sig);
  }
  function imprimirDialogo(lista) {
    return fuente().then(function () {
      var imgs = lista.map(function (c) { return dibujar(document.createElement('canvas'), datosSticker(c)).toDataURL('image/png'); });
      var w = window.open('', '_blank', 'width=500,height=400');
      if (!w) throw new Error('El navegador bloqueó la ventana de impresión. Permití ventanas emergentes para este sitio.');
      w.document.write('<!doctype html><html><head><title>Stickers</title><style>@page{size:80mm 50mm;margin:0}html,body{margin:0}img{display:block;width:80mm;height:50mm;page-break-after:always}</style></head><body>' +
        imgs.map(function (s) { return '<img src="' + s + '">'; }).join('') + '</body></html>');
      w.document.close();
      return new Promise(function (ok) { w.onload = function () { w.focus(); w.print(); ok(lista.length); }; setTimeout(function () { try { w.focus(); w.print(); } catch (e) { } ok(lista.length); }, 1500); });
    });
  }

  // ── puerta ──
  function buscar(txt) {
    var cod = codigoLeido(txt);
    if (cod) {
      var c = buscarCod(cod);
      $('pLector').value = '';
      if (!c) { // compra de último momento: se actualiza la lista sola y se vuelve a buscar
        $('pResultados').innerHTML = '<div class="ayuda">Buscando ' + esc(cod) + ' en las compras más recientes…</div>'; actual = null; pintarEditor();
        cargar(true).then(function () {
          var c2 = buscarCod(cod);
          if (!c2) { $('pResultados').innerHTML = '<div class="aviso mal">No encontré el ticket ' + esc(cod) + '. No es de este evento o el pago todavía no se acreditó.</div>'; return; }
          $('pResultados').innerHTML = ''; elegir(c2, true);
        });
        return;
      }
      $('pResultados').innerHTML = ''; elegir(c, true); return;
    }
    var q = norm(txt).trim();
    if (q.length < 2) { $('pResultados').innerHTML = ''; return; }
    var dq = q.replace(/\D/g, '');
    var r = D.creds.filter(function (c) {
      return norm(nombreCred(c)).indexOf(q) >= 0 || norm(c.nombre).indexOf(q) >= 0 || norm(empresaCred(c)).indexOf(q) >= 0 || (dq.length >= 5 && c.dni.indexOf(dq) >= 0);
    }).slice(0, 12);
    $('pResultados').innerHTML = r.length ? r.map(function (c) {
      return '<button class="res" data-cod="' + esc(c.cod) + '"><span><b>' + esc(nombreCred(c)) + '</b><br><small>' + esc([empresaCred(c), c.tipo, 'DNI ' + c.dni].filter(Boolean).join(' · ')) + '</small></span>' + chips(c) + '</button>';
    }).join('') : '<div class="ayuda">No encontré a nadie con eso.</div>';
  }
  function chips(c) {
    var h = '';
    if (c.estado !== 'Válida') h += '<span class="chip mal">' + (c.estado === 'En revisión' ? 'Socio sin validar' : esc(c.estado)) + '</span> ';
    if (c.veces) h += '<span class="chip ok">Sticker ✓</span> ';
    if (c.ingreso) h += '<span class="chip az">Ingresó</span>';
    return '<span>' + h + '</span>';
  }
  function elegir(c, desdeLector) {
    actual = Object.assign({}, c, { _edit: { nomCred: c.nomCred || '', empCred: empresaCred(c), rubro: c.rubro || '', rol: c.rol || '', cargo: c.cargo || '', cargo2: c.cargo2 || '', empCred2: c.empCred2 || '', net: c.net || '' }, _lector: !!desdeLector });
    pintarEditor();
  }
  function pintarEditor() {
    var cv = $('pCanvas');
    if (!actual) { $('pEditor').innerHTML = ''; fuente().then(function () { dibujar(cv, { nombre: 'NOMBRE APELLIDO', empresa: 'Empresa', rubro: 'Rubro', rol: '', cargo: 'Cargo', qr: '' }); }); return; }
    var c = actual, e = c._edit, bloqueo = c.estado !== 'Válida';
    var avisos = '';
    if (c.estado === 'En revisión') avisos += '<div class="aviso mal">Socio sin validar: todavía no tiene ticket válido. Validalo en el panel antes de darle la credencial.</div>';
    else if (bloqueo) avisos += '<div class="aviso mal">Ticket ' + esc(c.estado) + ': no corresponde credencial.</div>';
    var entregar = vista === 'Puerta' && c.veces && !bloqueo;
    if (entregar) avisos += '<div class="aviso ok" style="font-size:18px;font-weight:800">🏷️ Credencial ya impresa (' + esc(c.impresa) + '): buscala en la caja y entregala.</div><div class="ayuda">Reimprimí solo si se le perdió o hay que corregir algo.</div>';
    else if (c.veces) avisos += '<div class="aviso av">Ya tiene sticker (impreso ' + esc(c.impresa) + (c.veces > 1 ? ', ' + c.veces + ' veces' : '') + '). Imprimí de nuevo solo si se le perdió o salió mal.</div>';
    if (c.ingreso) avisos += '<div class="aviso info">Ya ingresó a las ' + F.hora(c.ingreso) + (c.puerta ? ' (' + esc(c.puerta) + ')' : '') + '.</div>';
    var roles = '<option value="">Asistente (sin franja)</option>' + D.roles.map(function (r) { return '<option' + (r === e.rol ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('');
    $('pEditor').innerHTML = '<div style="margin-top: 16px; border-top: 1px solid var(--borde); padding-top: 12px">' +
      '<div style="font-size: 20px; font-weight: 800">' + esc(c.nombre) + '</div><div class="ayuda" style="margin-top: 2px">' + esc(c.tipo) + ' · DNI ' + esc(c.dni) + ' · ' + esc(c.cod) + '</div>' + avisos +
      '<div class="dos">' +
      '<div><label class="et" for="eNom">Nombre en el sticker</label><input class="campo" id="eNom" maxlength="80" value="' + esc(e.nomCred) + '" placeholder="' + esc(c.nombre) + '"></div>' +
      '<div><label class="et" for="eEmp">Empresa</label><input class="campo" id="eEmp" maxlength="80" value="' + esc(e.empCred) + '"></div>' +
      '<div><label class="et" for="eCar">Cargo en esa empresa (opcional)</label><input class="campo" id="eCar" maxlength="60" value="' + esc(e.cargo) + '" placeholder="Ej: Presidenta"></div>' +
      '<div><label class="et" for="eEmp2">2ª empresa (opcional)</label><input class="campo" id="eEmp2" maxlength="80" value="' + esc(e.empCred2) + '" placeholder="Ej: Fonzi Events"></div>' +
      '<div><label class="et" for="eCar2">Cargo en la 2ª empresa</label><input class="campo" id="eCar2" maxlength="60" value="' + esc(e.cargo2) + '" placeholder="Ej: CEO"></div>' +
      '<div><label class="et" for="eRub">Rubro</label><input class="campo" id="eRub" maxlength="60" value="' + esc(e.rubro) + '" placeholder="Ej: Ambientación"></div>' +
      '<div><label class="et" for="eRol">Rol (no se imprime)</label><select class="campo" id="eRol">' + roles + '</select></div>' +
      '</div>' +
      (D.netOn ? '<div class="netQ" id="eNet" data-v="' + esc(e.net || '') + '"><span>🤝 ¿Comparte su contacto con otros asistentes?</span><button type="button" data-n="Sí"' + (e.net === 'Sí' ? ' class="on"' : '') + '>Sí</button><button type="button" data-n="No"' + (e.net === 'No' ? ' class="on"' : '') + '>No</button></div>' : '') +
      (vista === 'Puerta' ? '<label class="chk"><input type="checkbox" id="eIngreso"' + (c.ingreso ? '' : ' checked') + '> Marcar ingreso al imprimir</label>' : '') +
      '<div class="acc">' + (entregar ? '<button class="b grande verde" id="eEntregar">✓ Entregada' + (c.ingreso ? '' : ' · marcar ingreso') + '</button><button class="b sec" id="eImprimir">🖨️ Reimprimir</button>' :
      '<button class="b grande verde" id="eImprimir"' + (bloqueo ? ' disabled' : '') + '>🖨️ ' + (c.veces ? 'Reimprimir' : 'Imprimir') + ' sticker</button>') +
      '<button class="b sec" id="eGuardar">Guardar sin imprimir</button><button class="b sec" id="eCerrar">Cerrar</button></div></div>';
    if ($('eNet')) $('eNet').onclick = function (ev) { var b = ev.target.closest('button[data-n]'); if (!b) return; var v = b.getAttribute('data-n'); this.setAttribute('data-v', v); Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); }); leerEditor(); };
    ['eNom', 'eEmp', 'eRub', 'eRol', 'eCar', 'eEmp2', 'eCar2'].forEach(function (id) { $(id).addEventListener('input', leerEditor); $(id).addEventListener('change', leerEditor); });
    $('eImprimir').onclick = imprimirActual; if ($('eEntregar')) $('eEntregar').onclick = entregarActual; $('eGuardar').onclick = function () { guardarActual().then(function (ok) { if (ok) toast('✓ Guardado'); }).catch(fallo); };
    $('eCerrar').onclick = function () { actual = null; pintarEditor(); if (vista === 'Puerta') $('pLector').focus(); };
    previa();
    if (c._lector && !bloqueo && vista === 'Puerta') (entregar ? $('eEntregar') : $('eImprimir')).focus();
  }
  function leerEditor() {
    if (!actual) return;
    actual._edit = { nomCred: $('eNom').value.trim(), empCred: $('eEmp').value.trim(), rubro: $('eRub').value.trim(), rol: $('eRol').value, cargo: $('eCar').value.trim(), empCred2: $('eEmp2').value.trim(), cargo2: $('eCar2').value.trim(), net: $('eNet') ? $('eNet').getAttribute('data-v') || '' : (actual._edit.net || '') };
    previa();
  }
  function conEdicion(c) { var e = c._edit || {}; return Object.assign({}, c, { nomCred: e.nomCred, empCred: e.empCred, rubro: e.rubro, rol: e.rol, cargo: e.cargo, cargo2: e.cargo2, empCred2: e.empCred2 }); }
  function previa() { if (!actual) return; fuente().then(function () { dibujar($('pCanvas'), datosSticker(conEdicion(actual))); }); }
  function cambio(c) {
    var e = c._edit; if (!e) return false;
    return e.nomCred !== (c.nomCred || '') || e.empCred !== (c.empCred || empresaCred(c)) || e.rubro !== (c.rubro || '') || e.rol !== (c.rol || '') || e.cargo !== (c.cargo || '') || e.cargo2 !== (c.cargo2 || '') || e.empCred2 !== (c.empCred2 || '') || (e.net || '') !== (c.net || '') ||
      (e.empCred && !c.empCred);
  }
  function guardarActual() {
    if (!actual) return Promise.resolve(false);
    leerEditor();
    if (!cambio(actual)) return Promise.resolve(true);
    var e = actual._edit;
    return api('guardar', { cod: actual.cod, nomCred: e.nomCred, empCred: e.empCred, rubro: e.rubro, rol: e.rol, cargo: e.cargo, cargo2: e.cargo2, empCred2: e.empCred2, net: e.net }).then(function (r) {
      var i = D.creds.findIndex(function (x) { return x.cod === r.cred.cod; }); if (i >= 0) D.creds[i] = r.cred;
      actual = Object.assign({}, r.cred, { _edit: e, _lector: actual._lector }); return true;
    });
  }
  // Credencial preimpresa: solo se entrega y se marca el ingreso (no imprime nada)
  function entregarActual() {
    if (!actual) return;
    var c = actual, b = $('eEntregar'); b.disabled = true;
    var p = guardarActual().then(function () { return c.ingreso ? null : F.post('sync', { puerta: S.puerta, token: S.token, desde: 0, eventos: [{ id: 'ent-' + c.cod + '-' + Date.now(), c: c.cod, ts: Date.now(), tipo: 'in' }] }, 60000); });
    p.then(function () {
      toast('✓ Credencial entregada a ' + nombreCred(c));
      actual = null; $('pResultados').innerHTML = ''; pintarEditor(); cargar(true); $('pLector').focus();
    }).catch(function (e) { b.disabled = false; fallo(e); });
  }
  function imprimirActual() {
    if (!actual || imprimiendo) return;
    var b = $('eImprimir'), marcarIngreso = vista === 'Puerta' && $('eIngreso') && $('eIngreso').checked;
    b.disabled = true; imprimiendo = true; cancelar = false;
    guardarActual().then(function () {
      var c = conEdicion(actual);
      return imprimirStickers([c]).then(function () {
        return api('impresa', { cods: [c.cod] }).then(function () {
          if (marcarIngreso && !c.ingreso) return F.post('sync', { puerta: S.puerta, token: S.token, desde: 0, eventos: [{ id: 'cred-' + c.cod + '-' + Date.now(), c: c.cod, ts: Date.now(), tipo: 'in' }] }, 60000).catch(function () { toast('Sticker impreso, pero no se pudo marcar el ingreso. Hacelo desde el escáner.', true); });
        });
      }).then(function () {
        toast('✓ Sticker de ' + nombreCred(c) + ' impreso');
        actual = null; $('pResultados').innerHTML = ''; pintarEditor(); cargar(true);
        if (vista === 'Puerta') $('pLector').focus(); else pintarTanda();
      });
    }).catch(fallo).then(function () { imprimiendo = false; if ($('eImprimir')) $('eImprimir').disabled = false; });
  }

  // ── tanda previa ──
  var elegidos = {};
  function filtrados() {
    var f = $('tFiltro').value, q = norm($('tBuscar').value).trim();
    var l = D.creds.filter(function (c) { return c.estado === 'Válida'; }).filter(function (c) {
      if (f === 'sin' && c.veces) return false;
      if (f === 'rol' && !c.rol) return false;
      if (f === 'incompletos' && empresaCred(c) && c.rubro) return false;
      if (q && norm(nombreCred(c) + ' ' + empresaCred(c) + ' ' + c.rubro + ' ' + c.dni).indexOf(q) < 0) return false;
      return true;
    });
    var porApe = $('tOrden').value === 'apellido';
    l.sort(function (a, b) { var x = porApe ? apellido(a) : norm(nombreCred(a)), y = porApe ? apellido(b) : norm(nombreCred(b)); return x.localeCompare(y, 'es'); });
    return l;
  }
  function pintarTanda() {
    var l = filtrados(), n = 0;
    $('tLista').innerHTML = l.map(function (c) {
      if (elegidos[c.cod]) n++;
      return '<tr class="click" data-cod="' + esc(c.cod) + '"><td><input type="checkbox" data-chk="' + esc(c.cod) + '"' + (elegidos[c.cod] ? ' checked' : '') + ' aria-label="Elegir"></td>' +
        '<td><b>' + esc(nombreCred(c)) + '</b>' + (c.nomCred && c.nomCred !== c.nombre ? '<br><small style="color: var(--gris)">' + esc(c.nombre) + '</small>' : '') + '</td>' +
        '<td>' + (empresaCred(c) ? esc(empresaCred(c)) : '<span class="chip av">Falta</span>') + '</td><td>' + (c.rubro ? esc(c.rubro) : '<span class="chip av">Falta</span>') + '</td>' +
        '<td>' + (c.rol ? '<span class="chip az">' + esc(c.rol) + (c.cargo ? ' · ' + esc(c.cargo) : '') + '</span>' : '') + '</td>' +
        '<td>' + (c.veces ? '<span class="chip ok">✓ ' + esc(c.impresa) + '</span>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="ayuda">No hay nadie con ese filtro.</td></tr>';
    var sel = Object.keys(elegidos).filter(function (k) { return elegidos[k]; }).length;
    $('tResumen').textContent = l.length + ' en la lista · ' + sel + ' elegidos';
    $('tImprimir').disabled = !sel || imprimiendo; $('tImprimir').textContent = '🖨️ Imprimir ' + (sel || '') + ' seleccionados';
    $('tTodos').checked = l.length > 0 && l.every(function (c) { return elegidos[c.cod]; });
  }
  function imprimirTanda() {
    var orden = filtrados().map(function (c) { return c.cod; });
    var lista = D.creds.filter(function (c) { return elegidos[c.cod] && c.estado === 'Válida'; }).sort(function (a, b) { return orden.indexOf(a.cod) - orden.indexOf(b.cod); });
    if (!lista.length) return;
    var yaTienen = lista.filter(function (c) { return c.veces; }).length;
    if (!confirm('¿Imprimir ' + lista.length + ' stickers' + (yaTienen ? ' (' + yaTienen + ' ya tenían uno)' : '') + '?\nVerificá que haya etiquetas suficientes en el rollo.')) return;
    imprimiendo = true; cancelar = false; $('tProg').classList.remove('oculto'); $('tImprimir').disabled = true;
    var pend = [];
    function marcar(forzar) {
      if (!pend.length || (!forzar && pend.length < 10)) return Promise.resolve();
      var lote = pend.splice(0, pend.length);
      return api('impresa', { cods: lote }).catch(function (e) { pend = lote.concat(pend); throw e; });
    }
    imprimirStickers(lista, function (i, c) {
      $('tBarra').style.width = Math.round(100 * i / lista.length) + '%'; $('tEstado').textContent = i + ' de ' + lista.length + ' · ' + nombreCred(c);
      pend.push(c.cod); elegidos[c.cod] = false; marcar(false).catch(fallo);
    }).then(function (n) {
      return marcar(true).then(function () {
        toast(cancelar ? 'Detenido: se imprimieron ' + n + ' de ' + lista.length + '.' : (cfg.modo === 'dialogo' ? 'Se abrió el cuadro de impresión con ' + n + ' stickers.' : '✓ Listo: ' + n + ' stickers impresos.'));
      });
    }).catch(fallo).then(function () {
      imprimiendo = false; $('tProg').classList.add('oculto'); $('tBarra').style.width = '0'; cargar(true).then(pintarTanda);
    });
  }

  // ── impresora ──
  function pintarCfg() {
    $('iModo').value = cfg.modo; $('iQr').checked = !!cfg.qr; $('iRibbon').checked = !!cfg.ribbon;
    $('iOscuro').value = cfg.oscuro; $('iDx').value = cfg.dx; $('iDy').value = cfg.dy;
  }
  function leerCfg() {
    cfg = { modo: $('iModo').value, qr: $('iQr').checked, ribbon: $('iRibbon').checked, oscuro: Number($('iOscuro').value) || 0, dx: Number($('iDx').value) || 0, dy: Number($('iDy').value) || 0 };
    guardarJSON('cred_cfg', cfg); previa();
  }
  var PRUEBA = { cod: 'FZ-PRUEBA0000', nombre: 'Adriana Fonzi', nomCred: '', empCred: 'AOFREP', rubro: '', rol: 'Comisión Directiva', cargo: 'Presidenta', empCred2: 'Fonzi Events', cargo2: 'CEO', hola: 'PRUEBA0000' };

  // ── arranque ──
  Array.prototype.forEach.call(document.querySelectorAll('nav button'), function (b) { b.onclick = function () { ir(b.getAttribute('data-v')); }; });
  $('lEntrar').onclick = entrar; $('lPin').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
  $('hSalir').onclick = function () { if (confirm('¿Cerrar sesión en esta compu?')) salir(); };
  $('hRecargar').onclick = function () { cargar(false).then(function () { toast('✓ Lista actualizada'); }); detectarImpresora(); };
  $('pLector').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); buscar(this.value); } });
  $('pLector').addEventListener('input', function () { if (!codigoLeido(this.value) && this.value.trim().length >= 3) buscar(this.value); });
  $('pResultados').addEventListener('click', function (e) { var b = e.target.closest('[data-cod]'); if (!b) return; var c = buscarCod(b.getAttribute('data-cod')); if (c) { $('pResultados').innerHTML = ''; $('pLector').value = ''; elegir(c, false); } });
  ['tBuscar', 'tFiltro', 'tOrden'].forEach(function (id) { $(id).addEventListener('input', pintarTanda); $(id).addEventListener('change', pintarTanda); });
  $('tTodos').onchange = function () { var on = this.checked; filtrados().forEach(function (c) { elegidos[c.cod] = on; }); pintarTanda(); };
  $('tLista').addEventListener('click', function (e) {
    var chk = e.target.closest('[data-chk]'); if (chk) { elegidos[chk.getAttribute('data-chk')] = chk.checked; pintarTanda(); return; }
    var tr = e.target.closest('tr[data-cod]'); if (!tr) return;
    var c = buscarCod(tr.getAttribute('data-cod')); if (!c) return;
    elegir(c, false); ir('Puerta');
  });
  $('tImprimir').onclick = imprimirTanda; $('tCancelar').onclick = function () { cancelar = true; $('tEstado').textContent = 'Deteniendo…'; };
  ['iModo', 'iQr', 'iRibbon', 'iOscuro', 'iDx', 'iDy'].forEach(function (id) { $(id).addEventListener('change', function () { leerCfg(); if (id === 'iModo') detectarImpresora(); }); });
  $('iBuscar').onclick = function () { detectarImpresora().then(function (ok) { toast(ok ? '✓ Zebra encontrada' : 'No encontré la Zebra', !ok); }); };

  // ── Sticker manual: para alguien sin ticket (producción, acompañante de un speaker…). No crea cortesía ni marca ingreso. ──
  function stickerManual() {
    actual = null; $('pResultados').innerHTML = ''; $('pLector').value = '';
    var campo = function (id, et, ph) { return '<div><label class="et" for="' + id + '">' + et + '</label><input class="campo" id="' + id + '" maxlength="80" placeholder="' + esc(ph || '') + '"></div>'; };
    $('pEditor').innerHTML = '<div style="margin-top: 16px; border-top: 1px solid var(--borde); padding-top: 12px">' +
      '<div style="font-size: 20px; font-weight: 800">✏️ Sticker manual</div><div class="ayuda" style="margin-top: 2px">Sin ticket: no queda como cortesía ni marca ingreso, y sale sin QR personal. Queda anotado en Escaneos.</div>' +
      '<div class="dos">' + campo('mNom', 'Nombre y apellido', 'Ej: Juan Pérez') + campo('mEmp', 'Empresa', 'Ej: Fonzi Events') + campo('mCar', 'Cargo en esa empresa (opcional)', 'Ej: Producción') +
      campo('mEmp2', '2ª empresa (opcional)', '') + campo('mCar2', 'Cargo en la 2ª empresa', '') + campo('mRub', 'Rubro (opcional)', 'Ej: Acompañante') +
      '<div><label class="et" for="mCant">Cantidad</label><select class="campo" id="mCant"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></div></div>' +
      '<div class="acc"><button class="b grande verde" id="mImprimir">🖨️ Imprimir sticker</button><button class="b sec" id="mCerrar">Cerrar</button></div></div>';
    var datos = function () { var n = $('mNom').value.trim(); return { nombre: n, nomCred: n, empCred: $('mEmp').value.trim(), cargo: $('mCar').value.trim(), empCred2: $('mEmp2').value.trim(), cargo2: $('mCar2').value.trim(), rubro: $('mRub').value.trim(), hola: '' }; };
    var previaM = function () { var d = datos(); fuente().then(function () { dibujar($('pCanvas'), datosSticker(d.nombre ? d : Object.assign({}, d, { nombre: 'NOMBRE APELLIDO', nomCred: 'NOMBRE APELLIDO' }))); }); };
    ['mNom', 'mEmp', 'mCar', 'mEmp2', 'mCar2', 'mRub'].forEach(function (id) { $(id).addEventListener('input', previaM); });
    $('mCerrar').onclick = function () { pintarEditor(); $('pLector').focus(); };
    $('mImprimir').onclick = function () {
      var d = datos(), n = Number($('mCant').value) || 1, b = this;
      if (d.nombre.length < 2) { toast('Poné el nombre.', true); $('mNom').focus(); return; }
      if (imprimiendo) return; imprimiendo = true; cancelar = false; b.disabled = true;
      imprimirStickers(Array.apply(null, Array(n)).map(function () { return d; })).then(function () {
        toast('✓ Sticker manual de ' + d.nombre + ' impreso');
        F.post('sync', { puerta: S.puerta, token: S.token, desde: Date.now(), eventos: [{ id: 'man-' + Date.now(), tipo: 'log', c: 'MANUAL', res: ('Sticker manual: ' + d.nombre).slice(0, 40), ts: Date.now() }] }, 30000).catch(function () { });
        $('mNom').value = ''; $('mEmp').value = ''; $('mCar').value = ''; $('mEmp2').value = ''; $('mCar2').value = ''; $('mRub').value = ''; previaM(); $('mNom').focus();
      }).catch(fallo).then(function () { imprimiendo = false; b.disabled = false; });
    };
    previaM(); $('mNom').focus();
  }
  $('pManual').onclick = stickerManual;
  $('iPrueba').onclick = function () {
    var b = this; b.disabled = true;
    imprimirStickers([PRUEBA]).then(function () { toast('✓ Sticker de prueba enviado'); }).catch(fallo).then(function () { b.disabled = false; });
  };
  $('iCalibrar').onclick = function () {
    if (cfg.modo === 'dialogo') { toast('Para calibrar en modo cuadro de impresión: mantené apretado el botón de la Zebra hasta que parpadee 2 veces y soltalo.'); return; }
    enviarZebra('~JC').then(function () { toast('✓ Calibrando: la Zebra va a pasar unas etiquetas en blanco.'); }).catch(fallo);
  };
  // ── Lector USB en la puerta: el escaneo siempre termina en el lector, esté donde esté el foco ──
  // El lector "teclea" muy rápido (pocos ms entre teclas) y termina con Enter: así se distingue de una persona escribiendo.
  var rafaga = { txt: '', t: 0, campo: null, antes: '' };
  document.addEventListener('keydown', function (e) {
    if (vista !== 'Puerta' || !S) return;
    var t = e.target, lector = $('pLector');
    if (e.key === 'Escape' && actual) { actual = null; pintarEditor(); lector.focus(); return; }
    if (t === lector || e.ctrlKey || e.metaKey || e.altKey) return;
    var ahora = Date.now(), escribible = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /^(text|search|)$/.test(t.type || '')));
    if (e.key.length === 1) {
      if (!escribible) { lector.value = ''; lector.focus(); return; } // foco en un botón, casilla o la página: el escaneo va al lector
      if (ahora - rafaga.t > 60 || rafaga.campo !== t) rafaga = { txt: '', t: ahora, campo: t, antes: t.value };
      rafaga.txt += e.key; rafaga.t = ahora;
      return;
    }
    if (e.key === 'Enter' && escribible && rafaga.campo === t && ahora - rafaga.t < 120 && codigoLeido(rafaga.txt)) {
      // escanearon con el cursor en un campo del editor: se deshace lo tecleado y se busca el ticket
      e.preventDefault(); t.value = rafaga.antes; leerEditor();
      var txt = rafaga.txt; rafaga = { txt: '', t: 0, campo: null, antes: '' };
      lector.value = ''; lector.focus(); buscar(txt);
    }
  }, true);

  try { $('lPuerta').value = localStorage.getItem('cred_puerta') || 'Acreditación'; } catch (e) { }
  fuente().then(function () { if (!actual) pintarEditor(); });
  S = leerS();
  if (S) iniciar(); else salir();
})();
