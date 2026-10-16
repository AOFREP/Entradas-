/* Fonzi Entradas — escáner de puerta.
 * Valida contra la lista guardada en el dispositivo (instantáneo, funciona sin internet)
 * y sincroniza con el servidor cada pocos segundos. */
(function () {
  var $ = F.$;
  var K = { ses: 'fz_esc_sesion', lista: 'fz_esc_lista', cola: 'fz_esc_cola', conf: 'fz_esc_conf', pref: 'fz_esc_pref' };
  var S = { ses: null, version: 0, m: {}, cola: [], conflictos: [], ultimo: { c: '', t: 0 }, ultIngreso: null, mostrando: false, sincronizando: false, ultSync: 0, ultCompleta: 0, online: true };
  var pref = { dur: 1800, sonido: true };

  // ── Guardado local (con try/catch: nunca debe romper el escaneo) ──
  function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function leer(k, def) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; } catch (e) { return def; } }
  function guardarLista() { guardar(K.lista, { version: S.version, m: S.m, ultCompleta: S.ultCompleta }); }
  function guardarCola() { guardar(K.cola, S.cola); }

  function norm(c) {
    var s = String(c || '').trim().toUpperCase(), m = s.match(/FZ-?([A-Z0-9]{10})/);
    return m ? 'FZ-' + m[1] : s.slice(0, 60);
  }
  function sinAcentos(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  // fila: [nombre, dni, tipo, valida(1/0), ingresoMs, puerta]
  function aplicarLista(lista, completa) {
    var pend = {}; S.cola.forEach(function (ev) { if (ev.tipo === 'in') pend[ev.c] = ev; if (ev.tipo === 'undo') delete pend[ev.c]; });
    if (completa) {
      var nuevo = {};
      lista.forEach(function (r) { nuevo[r[0]] = [r[1], r[2], r[3], r[4], r[5], r[6], r[7] || '', r[8] || '']; });
      Object.keys(pend).forEach(function (c) { if (nuevo[c] && !nuevo[c][4]) { nuevo[c][4] = pend[c].ts; nuevo[c][5] = S.ses.puerta; } });
      S.m = nuevo;
    } else {
      lista.forEach(function (r) {
        var c = r[0], loc = S.m[c], fila = [r[1], r[2], r[3], r[4], r[5], r[6], r[7] || '', r[8] || ''];
        if (!r[5] && pend[c] && loc && loc[4]) { fila[4] = loc[4]; fila[5] = loc[5]; } // ingreso local aún no subido: se respeta
        S.m[c] = fila;
      });
    }
    contar();
  }
  function contar() {
    var t = 0, a = 0;
    for (var c in S.m) { var r = S.m[c]; if (r[3]) { t++; if (r[4]) a++; } }
    $('cAdentro').textContent = a; $('cTotal').textContent = t; $('mLista').textContent = Object.keys(S.m).length;
    $('mPend').textContent = S.cola.length;
  }
  function estadoRed(tipo, txt) {
    $('punto').className = 'punto' + (tipo === 'ok' ? '' : tipo === 'off' ? ' off' : ' err');
    $('tEstado').textContent = txt;
  }

  // ── Sonido y vibración ──
  var ac = null;
  function audio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { } }
  function tono(f, d, cuando) {
    if (!pref.sonido || !ac) return;
    try { var o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
      var t = ac.currentTime + (cuando || 0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.start(t); o.stop(t + d + 0.02); } catch (e) { }
  }
  function sonar(tipo) {
    if (tipo === 'v') { tono(1320, 0.15); try { navigator.vibrate && navigator.vibrate(80); } catch (e) { } }
    else { tono(220, 0.22); tono(180, 0.3, 0.26); try { navigator.vibrate && navigator.vibrate([200, 80, 200]); } catch (e) { } }
  }

  // ── Resultado en pantalla completa ──
  var timerRes = null;
  function mostrar(clase, ico, tit, nom, det) {
    S.mostrando = true;
    var r = $('res'); r.className = clase; $('rIco').textContent = ico; $('rTit').textContent = tit; $('rNom').textContent = nom || ''; $('rDet').textContent = det || '';
    sonar(clase === 'v' ? 'v' : 'x');
    clearTimeout(timerRes);
    timerRes = setTimeout(ocultarRes, clase === 'v' ? pref.dur : Math.max(pref.dur, 2600));
  }
  function ocultarRes() { clearTimeout(timerRes); $('res').className = 'oculto'; S.mostrando = false; }
  $('res').onclick = ocultarRes;

  // ── Procesar una lectura ──
  function procesar(raw, manual) {
    var c = norm(raw), ahora = Date.now();
    if (!c) return;
    if (!manual && c === S.ultimo.c && ahora - S.ultimo.t < 3500) return; // la cámara lee el mismo QR varias veces
    S.ultimo = { c: c, t: ahora };
    var r = S.m[c];
    if (!r) {
      encolar({ tipo: 'log', c: c, res: 'No existe' });
      mostrar('g', '?', 'NO ENCONTRADA', c.length > 20 ? c.slice(0, 20) + '…' : c, 'No es de este evento o se compró hace segundos: tocá 🔄 Sincronizar y volvé a escanear.');
      sincronizarPronto(300);
      return;
    }
    var dniTxt = r[1] ? ' · DNI •••' + String(r[1]).slice(-3) : '';
    if (!r[3]) {
      if (r[7] === 'En revisión') { encolar({ tipo: 'log', c: c, res: 'En revisión' }); mostrar('r', '⏳', 'SOCIO SIN VALIDAR', r[0], 'Esta entrada de socio todavía no fue validada. Derivá a la mesa de acreditación.'); return; }
      encolar({ tipo: 'log', c: c, res: r[7] || 'Anulada' }); mostrar('r', '⛔', r[7] === 'Rechazada' ? 'RECHAZADA' : 'ANULADA', r[0], 'Esta entrada no es válida. No puede ingresar.'); return;
    }
    if (r[4]) {
      encolar({ tipo: 'log', c: c, res: 'Repetida' });
      mostrar('r', '✋', 'YA INGRESÓ', r[0], 'A las ' + F.hora(r[4]) + (r[5] ? ' por ' + r[5] : '') + ' · ' + r[2]);
      return;
    }
    r[4] = ahora; r[5] = S.ses.puerta;
    S.ultIngreso = { c: c, ts: ahora };
    encolar({ tipo: 'in', c: c, ts: ahora });
    guardarLista(); contar();
    mostrar('v', '✓', 'PASA', r[0], (r[6] ? r[6] + ' · ' : '') + r[2] + dniTxt);
    sincronizarPronto(400);
  }
  function encolar(ev) {
    ev.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); ev.ts = ev.ts || Date.now();
    S.cola.push(ev); if (S.cola.length > 5000) S.cola = S.cola.slice(-5000);
    guardarCola(); $('mPend').textContent = S.cola.length;
  }

  $('bDeshacer').onclick = function () {
    var u = S.ultIngreso;
    if (!u || Date.now() - u.ts > 10 * 60000) { toast('No hay un ingreso reciente para deshacer.'); return; }
    var r = S.m[u.c]; if (!r) return;
    if (!confirm('¿Deshacer el ingreso de ' + r[0] + '?')) return;
    r[4] = 0; r[5] = ''; S.ultIngreso = null;
    encolar({ tipo: 'undo', c: u.c }); guardarLista(); contar(); toast('Ingreso deshecho: ' + r[0]); sincronizarPronto(300);
  };

  // ── Sincronización ──
  var timerSync = null;
  function sincronizarPronto(ms) { clearTimeout(timerSync); timerSync = setTimeout(sincronizar, ms || 0); }
  function sincronizar() {
    clearTimeout(timerSync);
    if (!S.ses) return;
    if (S.sincronizando) { timerSync = setTimeout(sincronizar, 1500); return; }
    S.sincronizando = true;
    var lote = S.cola.slice(0, 250), completa = Date.now() - S.ultCompleta > 5 * 60000;
    var desde = completa ? 0 : Math.max(0, S.version - 180000); // 3 min de solapamiento: nunca se pierde un cambio
    F.post('sync', { token: S.ses.token, puerta: S.ses.puerta, eventos: lote, desde: desde }, 30000).then(function (r) {
      var ap = {}; (r.aplicados || []).forEach(function (id) { ap[id] = 1; });
      S.cola = S.cola.filter(function (ev) { return !ap[ev.id]; }); guardarCola();
      if (r.version > S.version) S.version = r.version;
      if (r.completa) S.ultCompleta = Date.now();
      aplicarLista(r.lista || [], !!r.completa); guardarLista();
      (r.conflictos || []).forEach(function (x) {
        if (x.motivo === 'repetida') { var m = '⚠ ' + (x.nombre || x.c) + ' ya había ingresado por ' + (x.puerta || 'otra puerta') + (x.cuando ? ' a las ' + F.hora(x.cuando) : '') + '. Pasó dos veces.'; S.conflictos.unshift(m); toast(m, 6000); }
        if (x.motivo === 'anulada') { var m2 = '⚠ ' + x.c + ' estaba ANULADA y se escaneó sin conexión.'; S.conflictos.unshift(m2); toast(m2, 6000); }
      });
      pintarConflictos();
      S.ultSync = Date.now(); S.online = true;
      estadoRed('ok', 'Conectado');
      $('mUlt').textContent = F.hora(S.ultSync);
    }).catch(function (e) {
      var msg = F.msg(e);
      if (/^SESION:/.test(msg)) { estadoRed('err', 'Sesión vencida'); verLogin(msg.replace('SESION: ', '')); return; }
      S.online = false;
      estadoRed('off', F.esRed(e) ? 'Sin conexión · sigue funcionando' : 'Error: ' + msg.slice(0, 40));
    }).then(function () {
      S.sincronizando = false; contar();
      timerSync = setTimeout(sincronizar, S.cola.length ? 3000 : (S.online ? 6000 : 10000));
    });
  }
  window.addEventListener('online', function () { sincronizarPronto(200); });
  $('bSync').onclick = function () { toast('Sincronizando…', 1200); sincronizarPronto(0); };

  function toast(t, ms) { var x = $('toast'); x.textContent = t; x.classList.remove('oculto'); clearTimeout(x._t); x._t = setTimeout(function () { x.classList.add('oculto'); }, ms || 2500); }
  function pintarConflictos() {
    $('mConf').innerHTML = S.conflictos.length ? '<div style="font-weight:800;margin:10px 0 6px">Avisos</div>' + S.conflictos.slice(0, 30).map(function (c) { return '<div class="fila"><div class="i"><small>' + F.esc(c) + '</small></div></div>'; }).join('') : '';
  }

  // ── Cámara y lectura de QR ──
  var stream = null, track = null, detector = null, lienzo = document.createElement('canvas'), cx = lienzo.getContext('2d', { willReadFrequently: true }), camaras = [], camIdx = -1, leyendo = false, linterna = false;
  function iniciarCamara(deviceId) {
    audio();
    $('camErr').textContent = '';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('camErr').textContent = 'Este navegador no permite usar la cámara. Usá Chrome (Android) o Safari (iPhone) y abrí el link con https.'; return; }
    detenerCamara();
    var v = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } };
    v.width = { ideal: 1280 }; v.height = { ideal: 720 };
    navigator.mediaDevices.getUserMedia({ video: v, audio: false }).then(function (st) {
      stream = st; track = st.getVideoTracks()[0];
      var video = $('video'); video.srcObject = st; video.setAttribute('playsinline', ''); return video.play();
    }).then(function () {
      $('arrancar').classList.add('oculto');
      try { var cap = track.getCapabilities ? track.getCapabilities() : {}; $('bLinterna').classList.toggle('oculto', !cap.torch); } catch (e) { }
      navigator.mediaDevices.enumerateDevices().then(function (ds) { camaras = ds.filter(function (d) { return d.kind === 'videoinput'; }); $('bCambiar').classList.toggle('oculto', camaras.length < 2); }).catch(function () { });
      pedirPantalla();
      if (!leyendo) { leyendo = true; bucle(); }
    }).catch(function (e) {
      $('arrancar').classList.remove('oculto');
      $('camErr').textContent = /NotAllowed|Permission/i.test(e.name + e.message) ? 'Permiso de cámara denegado. Habilitalo en la configuración del navegador para este sitio y tocá de nuevo.' : 'No se pudo abrir la cámara: ' + (e.message || e.name);
    });
  }
  function detenerCamara() { if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; track = null; } }
  if ('BarcodeDetector' in window) {
    try { BarcodeDetector.getSupportedFormats().then(function (f) { if (f.indexOf('qr_code') >= 0) detector = new BarcodeDetector({ formats: ['qr_code'] }); }).catch(function () { }); } catch (e) { }
  }
  function bucle() {
    var video = $('video');
    if (!stream || S.mostrando || video.readyState < 2 || $('tScan').classList.contains('oculto')) { setTimeout(bucle, 150); return; }
    if (detector) {
      detector.detect(video).then(function (cods) { if (cods && cods.length) procesar(cods[0].rawValue); }).catch(function () { detector = null; }).then(function () { setTimeout(bucle, 90); });
      return;
    }
    try {
      var vw = video.videoWidth, vh = video.videoHeight, lado = Math.min(vw, vh) * 0.85, sx = (vw - lado) / 2, sy = (vh - lado) / 2, T = 520;
      lienzo.width = T; lienzo.height = T;
      cx.drawImage(video, sx, sy, lado, lado, 0, 0, T, T);
      var img = cx.getImageData(0, 0, T, T), r = jsQR(img.data, T, T, { inversionAttempts: 'dontInvert' });
      if (r && r.data) procesar(r.data);
    } catch (e) { }
    setTimeout(bucle, 110);
  }
  $('bCam').onclick = function () { iniciarCamara(); };
  $('bCambiar').onclick = function () {
    if (camaras.length < 2) return;
    camIdx = (camIdx + 1) % camaras.length; iniciarCamara(camaras[camIdx].deviceId);
  };
  $('bLinterna').onclick = function () { if (!track) return; linterna = !linterna; track.applyConstraints({ advanced: [{ torch: linterna }] }).catch(function () { toast('Esta cámara no tiene linterna.'); }); };
  var wake = null;
  function pedirPantalla() { try { if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () { }); } catch (e) { } }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      pedirPantalla(); sincronizarPronto(200);
      if (S.ses && track && track.readyState === 'ended') iniciarCamara(); // iOS corta la cámara al minimizar
    }
  });

  // ── Pestañas ──
  document.querySelector('.tabs').onclick = function (e) {
    var b = e.target.closest('button'); if (!b) return;
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (x) { x.classList.toggle('on', x === b); });
    var t = b.getAttribute('data-tab');
    $('tScan').classList.toggle('oculto', t !== 'scan'); $('tBuscar').classList.toggle('oculto', t !== 'buscar'); $('tMas').classList.toggle('oculto', t !== 'mas');
    if (t === 'buscar') { $('q').focus(); buscar(); }
  };

  // ── Búsqueda manual ──
  function buscar() {
    var q = sinAcentos($('q').value.trim());
    if (q.length < 2) { $('resultados').innerHTML = '<div style="opacity:.6;padding:14px 4px">Escribí al menos 2 letras del nombre, el DNI o el código.</div>'; return; }
    var res = [];
    for (var c in S.m) { var r = S.m[c]; if (sinAcentos(r[0]).indexOf(q) >= 0 || String(r[1]).indexOf(q) >= 0 || sinAcentos(c).indexOf(q) >= 0 || sinAcentos(r[6]).indexOf(q) >= 0) res.push([c, r]); if (res.length >= 40) break; }
    res.sort(function (a, b) { return String(a[1][0]).localeCompare(String(b[1][0]), 'es'); });
    $('resultados').innerHTML = res.map(function (x) {
      var c = x[0], r = x[1], acc = !r[3] ? '<span class="chipE an">' + (r[7] === 'En revisión' ? 'SIN VALIDAR' : r[7] === 'Rechazada' ? 'RECHAZADA' : 'ANULADA') + '</span>' : r[4] ? '<span class="chipE in">ADENTRO ' + F.hora(r[4]) + '</span>' : '<button data-c="' + F.esc(c) + '">Dar ingreso</button>';
      return '<div class="fila"><div class="i"><b>' + F.esc(r[0]) + '</b><small>' + (r[6] ? F.esc(r[6]) + ' · ' : '') + F.esc(r[2]) + (r[1] ? ' · DNI ' + F.esc(r[1]) : '') + ' · ' + F.esc(c) + '</small></div>' + acc + '</div>';
    }).join('') || '<div style="opacity:.6;padding:14px 4px">Sin resultados.</div>';
  }
  $('q').oninput = buscar;
  $('resultados').onclick = function (e) {
    var b = e.target.closest('button[data-c]'); if (!b) return;
    var c = b.getAttribute('data-c'), r = S.m[c];
    if (!confirm('¿Dar ingreso a ' + r[0] + '?')) return;
    audio(); procesar(c, true); setTimeout(buscar, 50);
  };

  // ── Más ──
  $('mDur').onchange = function () { pref.dur = Number(this.value); guardar(K.pref, pref); };
  $('mSonido').onchange = function () { pref.sonido = this.checked; guardar(K.pref, pref); audio(); };
  $('mSalir').onclick = function () {
    if (S.cola.length && !confirm('Hay ' + S.cola.length + ' ingresos sin sincronizar. Si cerrás sesión se van a subir cuando vuelvas a entrar en ESTE dispositivo. ¿Cerrar igual?')) return;
    S.ses = null; guardar(K.ses, null); detenerCamara(); verLogin('');
  };

  // ── Login ──
  function verLogin(msg) {
    $('app').classList.add('oculto'); $('login').classList.remove('oculto');
    var ult = leer(K.ses, null) || {}; $('lPuerta').value = $('lPuerta').value || ult.puerta || leer('fz_esc_ultpuerta', '');
    if (msg) { $('lErr').textContent = msg; $('lErr').classList.remove('oculto'); }
  }
  $('lOk').onclick = function () {
    var puerta = $('lPuerta').value.trim(), pin = $('lPin').value.trim(), b = this;
    if (!puerta) { $('lErr').textContent = 'Poné un nombre para esta puerta.'; $('lErr').classList.remove('oculto'); return; }
    b.disabled = true; b.textContent = 'Descargando lista…'; $('lErr').classList.add('oculto');
    audio();
    F.post('login', { puerta: puerta, pin: pin }, 45000).then(function (r) {
      S.ses = { token: r.token, puerta: r.puerta, evento: r.evento }; guardar(K.ses, S.ses); guardar('fz_esc_ultpuerta', r.puerta);
      S.version = r.version || 0; S.ultCompleta = Date.now(); aplicarLista(r.lista || [], true); guardarLista();
      $('lPin').value = ''; entrarApp(); sincronizarPronto(500);
    }).catch(function (e) { $('lErr').textContent = F.msg(e); $('lErr').classList.remove('oculto'); }).then(function () { b.disabled = false; b.textContent = 'Entrar'; });
  };
  $('lPin').onkeydown = function (e) { if (e.key === 'Enter') $('lOk').click(); };
  function entrarApp() {
    $('login').classList.add('oculto'); $('app').classList.remove('oculto');
    $('tEv').textContent = (S.ses.evento && S.ses.evento.nombre) || 'Evento'; $('tPuerta').textContent = S.ses.puerta;
    $('avisoPrueba').classList.toggle('oculto', !(S.ses.evento && S.ses.evento.prueba));
    contar(); pintarConflictos();
  }

  // ── Arranque ──
  pref = Object.assign(pref, leer(K.pref, {})); $('mDur').value = String(pref.dur); $('mSonido').checked = pref.sonido;
  S.cola = leer(K.cola, []) || [];
  var l = leer(K.lista, null); if (l) { S.version = l.version || 0; S.m = l.m || {}; S.ultCompleta = l.ultCompleta || 0; }
  S.ses = leer(K.ses, null);
  if (S.ses && S.ses.token) { entrarApp(); sincronizarPronto(300); } else verLogin('');
  window.FZ_ESC = { procesar: procesar, S: S }; // para pruebas
})();
