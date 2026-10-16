/* Fonzi Entradas — funciones compartidas por todas las páginas */
(function () {
  var F = window.F = {};
  F.$ = function (id) { return document.getElementById(id); };
  F.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  F.plata = function (n) { return '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 }); };
  F.param = function (k) { return new URLSearchParams(location.search).get(k) || ''; };
  F.hora = function (ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };

  function apiUrl() {
    var u = window.FONZI_API || '';
    if (!/^https?:\/\/[^\s]+\/exec$/.test(u)) throw new Error('Falta configurar el sitio (config.js).');
    return u;
  }
  function conTiempo(promesa, ms) {
    return new Promise(function (ok, mal) {
      var t = setTimeout(function () { mal(new Error('RED: La conexión está tardando demasiado.')); }, ms);
      promesa.then(function (x) { clearTimeout(t); ok(x); }, function (e) { clearTimeout(t); mal(e); });
    });
  }
  function leer(r) {
    return r.text().then(function (t) {
      var j; try { j = JSON.parse(t); } catch (e) { throw new Error('RED: Respuesta inesperada del servidor.'); }
      if (!j.ok) throw new Error(j.error || 'Error');
      return j;
    });
  }
  /** GET (idempotente): reintenta solo si falla la red. */
  F.get = function (accion, params, intentos) {
    intentos = intentos == null ? 3 : intentos;
    var q = new URLSearchParams(Object.assign({ a: accion, _: Date.now() }, params || {}));
    var url; try { url = apiUrl(); } catch (e) { return Promise.reject(e); }
    return conTiempo(fetch(url + '?' + q.toString(), { redirect: 'follow' }), 30000).then(leer).catch(function (e) {
      var red = /^RED:|Failed to fetch|NetworkError|Load failed/i.test(e.message);
      if (red && intentos > 1) return new Promise(function (ok) { setTimeout(ok, 1500); }).then(function () { return F.get(accion, params, intentos - 1); });
      throw e;
    });
  };
  /** POST (texto plano, sin preflight). No reintenta solo: lo decide quien llama. */
  F.post = function (accion, datos, ms) {
    var url; try { url = apiUrl(); } catch (e) { return Promise.reject(e); }
    return conTiempo(fetch(url, { method: 'POST', body: JSON.stringify(Object.assign({ a: accion }, datos || {})), redirect: 'follow' }), ms || 40000).then(leer);
  };
  F.esRed = function (e) { return /^RED:|Failed to fetch|NetworkError|Load failed|network/i.test(String(e && e.message)); };
  F.msg = function (e) { return String(e && e.message || e).replace(/^RED: /, ''); };

  /** Texto en renglones: acepta una lista o un texto separado por " · ". */
  F.renglones = function (x) {
    var l = Array.isArray(x) ? x : String(x || '').split(/\s+·\s+/);
    return l.filter(function (t) { return t && String(t).trim(); }).map(function (t) { return '<span class="renglon">' + F.esc(String(t).trim()) + '</span>'; }).join('');
  };
  F.color = function (c) {
    if (/^#[0-9a-f]{6}$/i.test(c || '')) document.documentElement.style.setProperty('--marca', c);
  };

  // ── Logos (se cargan una vez; si falla alguno, se usa texto) ──
  F.logos = {};
  F.cargarLogos = function () {
    var lista = { eyn: 'assets/logo-eyn.png', aofrep: 'assets/logo-aofrep.png', hitOsc: 'assets/logo-hit-oscuro.png' };
    return Promise.all(Object.keys(lista).map(function (k) {
      return new Promise(function (ok) { var im = new Image(); im.onload = function () { F.logos[k] = im; ok(); }; im.onerror = function () { ok(); }; im.src = lista[k]; setTimeout(ok, 5000); });
    }));
  };
  F.cuitOk = function (c) {
    c = String(c || '').replace(/\D/g, ''); if (!/^(20|23|24|25|26|27|30|33|34)\d{9}$/.test(c)) return false;
    var m = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2], s = 0; for (var i = 0; i < 10; i++) s += m[i] * Number(c[i]);
    var v = 11 - (s % 11); if (v === 11) v = 0; if (v === 10) v = 9; return v === Number(c[10]);
  };

  /** Dibuja la entrada completa (encabezado con logos, QR, datos). Es lo que se ve y lo que se descarga. */
  F.dibujarEntrada = function (canvas, ent, ev) {
    var W = 720, Hh = 1140, cx = canvas.getContext('2d'), L = F.logos;
    canvas.width = W; canvas.height = Hh;
    var marca = getComputedStyle(document.documentElement).getPropertyValue('--marca').trim() || '#071A33';
    cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, W, Hh);
    var g = cx.createLinearGradient(0, 0, 0, 320); g.addColorStop(0, '#0E3A73'); g.addColorStop(1, marca);
    cx.fillStyle = g; cx.fillRect(0, 0, W, 320);
    cx.textAlign = 'center';
    if (L.aofrep) { var ha = 34, wa = L.aofrep.width * ha / L.aofrep.height; cx.drawImage(L.aofrep, (W - wa) / 2, 30, wa, ha); }
    if (L.eyn) { var we = 400, he = L.eyn.height * we / L.eyn.width; cx.drawImage(L.eyn, (W - we) / 2, 82, we, he); }
    else { cx.fillStyle = '#FFF5CC'; cx.font = 'bold 50px Montserrat, Arial'; cx.fillText(recortar(cx, ev.nombre || '', W - 80), W / 2, 170); }
    cx.fillStyle = '#FFF5CC'; cx.font = 'bold 24px Arial';
    cx.fillText(recortar(cx, (ev.fecha || '') + (ev.horario ? ' · ' + ev.horario : ''), W - 80), W / 2, 290);
    // QR
    var q = qrcode(0, 'M'); q.addData(ent.cod); q.make();
    var n = q.getModuleCount(), lado = 470, cel = Math.floor(lado / (n + 8)), tam = cel * n, x0 = (W - tam) / 2, y0 = 370;
    cx.fillStyle = ent.estado === 'Anulada' ? '#C9CED0' : '#000';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) cx.fillRect(x0 + c * cel, y0 + r * cel, cel, cel);
    if (ent.estado === 'Anulada') { cx.save(); cx.translate(W / 2, y0 + tam / 2); cx.rotate(-0.4); cx.fillStyle = '#B42318'; cx.font = 'bold 80px Arial'; cx.fillText('ANULADA', 0, 25); cx.restore(); }
    var yb = y0 + tam + 60;
    cx.fillStyle = '#1E6FD9'; cx.font = 'bold 22px Montserrat, Arial'; cx.fillText(recortar(cx, String(ent.tipo || '').toUpperCase(), W - 80), W / 2, yb);
    cx.fillStyle = '#13233A'; cx.font = 'bold 40px Montserrat, Arial'; cx.fillText(recortar(cx, ent.nombre || '', W - 80), W / 2, yb + 52);
    var y2 = yb + 52;
    if (ent.empresa) { y2 += 38; cx.fillStyle = '#3B4A60'; cx.font = '26px Arial'; cx.fillText(recortar(cx, ent.empresa, W - 80), W / 2, y2); }
    cx.fillStyle = '#5F6B7D'; cx.font = '26px monospace'; cx.fillText(ent.cod, W / 2, y2 + 46);
    cx.font = '22px Arial'; cx.fillText(recortar(cx, [ev.lugar, ev.direccion].filter(Boolean).join(' · '), W - 80), W / 2, y2 + 86);
    if (L.hitOsc) { var hh = 30, wh = L.hitOsc.width * hh / L.hitOsc.height; cx.globalAlpha = 0.85; cx.drawImage(L.hitOsc, (W - wh) / 2, Hh - (ev.prueba ? 110 : 64), wh, hh); cx.globalAlpha = 1; }
    if (ev.prueba) { cx.fillStyle = '#FFF1C2'; cx.fillRect(0, Hh - 54, W, 54); cx.fillStyle = '#8A5A00'; cx.font = 'bold 22px Arial'; cx.fillText('MODO PRUEBA · NO VÁLIDA', W / 2, Hh - 20); }
    cx.textAlign = 'left';
  };
  function recortar(cx, t, max) { t = String(t); if (cx.measureText(t).width <= max) return t; while (t.length > 1 && cx.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; }
  function envolver(cx, t, x, y, max, lh, maxL) {
    var p = String(t).split(' '), l = [], act = '';
    p.forEach(function (w) { var s = act ? act + ' ' + w : w; if (cx.measureText(s).width > max && act) { l.push(act); act = w; } else act = s; });
    if (act) l.push(act);
    if (l.length > maxL) { l = l.slice(0, maxL); l[maxL - 1] = recortar(cx, l[maxL - 1] + '…', max); }
    return l;
  }
  F.descargar = function (canvas, nombre) {
    var a = document.createElement('a'); a.download = nombre; a.href = canvas.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove();
  };
})();
