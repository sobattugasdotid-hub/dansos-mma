
(function () {
'use strict';

// ── Utilitas ─────────────────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rp = n => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const fd = s => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const rid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const gu = (id, w) => 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + w;
// Logo memakai berkas asli (bukan thumbnail) supaya latar transparan PNG tetap terjaga
const logoUrl = id => 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(id);
const todayJkt = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Makassar' });
const parseJ = (s, d) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : d; } catch (e) { return d; } };
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const IC = {
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 13h2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6"/>',
  pig: '<path d="M5 12a7 7 0 0 1 14 0v4H5z"/><path d="M8 20v-4M16 20v-4"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M7 4l12 8-12 8z"/>',
  out: '<path d="M9 4H4v16h5M16 8l4 4-4 4M20 12H9"/>'
};
const ic = n => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (IC[n] || '') + '</svg>';

// ── Komunikasi dengan server ──────────────────────────────────────────────
const S = { v: 'home', pub: null, adm: null, usr: null, tok: null, me: '', nama: '', tab: 'dash', per: 'tahun', vf: 'Menunggu', sel: null, dr: null, jd: null, t: 0, qd: '', qadm: '' };
const LS = {
  g(k) { try { return JSON.parse(localStorage.getItem('dm2:' + k)); } catch (e) { return null; } },
  s(k, v) { try { localStorage.setItem('dm2:' + k, JSON.stringify(v)); } catch (e) { /* storage tidak tersedia di iframe */ } }
};
const SS = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* abaikan */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* abaikan */ } }
};
// Panggilan ke backend lewat fetch (gas-pro-api). Fungsi baca publik memakai GET,
// sisanya POST dengan text/plain agar tidak memicu preflight CORS.
const API_URL = (window.APP_CONFIG && window.APP_CONFIG.GAS_URL) || '';
const API_GET_OK = { pub: 1, jadwal: 1 };
function call(fn, ...a) {
  const req = API_GET_OK[fn]
    ? fetch(API_URL + '?fn=' + encodeURIComponent(fn) + '&args=' + encodeURIComponent(JSON.stringify(a)))
    : fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ fn: fn, args: a })
      });
  return req
    .then(r => {
      if (!r.ok) throw new Error('Server tidak merespons (' + r.status + ').');
      return r.json();
    }, () => { throw new Error('Gagal terhubung ke server. Periksa koneksi internet.'); })
    .catch(e => { throw new Error(e && e.message ? e.message : 'Respons server tidak valid.'); });
}
// Hanya untuk fungsi baca: coba ulang 2 kali bila gagal sementara
async function read(fn, ...a) {
  for (let i = 0; ; i++) {
    try { return await call(fn, ...a); }
    catch (e) { if (i >= 2) throw e; await new Promise(r => setTimeout(r, 600 * (i + 1))); }
  }
}
// Panggilan admin: memperbarui token sesi dan keluar otomatis bila sesi berakhir
async function ac(fn, ...a) {
  const r = await call(fn, S.tok, ...a);
  if (r.tok) { S.tok = r.tok; S.me = r.me || S.me; S.nama = r.nama || S.nama; SS.set('dm.t', r.tok); }
  if (!r.ok) {
    if (r.sesi) logout(true);
    throw new Error(r.msg || 'Terjadi kesalahan.');
  }
  return r;
}

// ── Tampilan umum: notifikasi, dialog, animasi ───────────────────────────
let PEND = null, timer = null, tickTimer = null, paused = reduceMotion(), SL = [], si = 0, CH = [];
function toast(m, er) {
  const t = $('#toast');
  t.textContent = m;
  t.className = 'on' + (er ? ' er' : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.className = ''; }, 3200);
}
function dlg(html) {
  const d = $('#dlg');
  d.innerHTML = html;
  if (!d.open) d.showModal();
}
function closeDlg() { const d = $('#dlg'); if (d.open) d.close(); PEND = null; }
function ask(msg, fn) {
  PEND = fn;
  dlg('<p>' + esc(msg) + '</p><div class="row"><button class="btn danger" data-act="dlgClose">Batal</button><button class="btn" data-act="dlgYes">Ya, lanjutkan</button></div>');
}
function anim(e) {
  e.classList.remove('enter');
  e.querySelectorAll('.card,.kpi>*,.hero .wrap>*').forEach((c, i) => c.style.setProperty('--d', Math.min(i, 10)));
  void e.offsetWidth;
  e.classList.add('enter');
}
function imgEl(src, alt) {
  const i = document.createElement('img');
  i.src = src;
  i.alt = alt || '';
  i.loading = 'lazy';
  i.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
  return i;
}
function theme() {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  LS.s('theme', t);
  ti();
  if (S.v === 'transparansi') drawCharts();
}
function ti() { $('#thm').innerHTML = ic(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'); }

// ── Navigasi (SPA, tanpa perubahan URL, aman di iframe) ───────────────────
function go(v) {
  if (v === 'admin' && !S.tok) v = 'login';
  S.v = v;
  document.querySelectorAll('.view').forEach(e => {
    e.hidden = e.id !== 'v-' + v;
    if (!e.hidden) anim(e);
  });
  document.querySelectorAll('#tabs [data-v]').forEach(b => b.setAttribute('aria-current', b.dataset.v === v ? 'page' : 'false'));
  window.scrollTo(0, 0);
  if (v !== 'home') { clearInterval(timer); }
  if (v === 'home') { startSl(); tick(); countUp(); }
  if (v === 'transparansi') drawCharts();
  if (v === 'admin') {
    if (!S.adm) loadAdm();
    renderAdm(true);
  }
}
function pengurus() { go(S.tok ? 'admin' : 'login'); }
function logout(exp) {
  S.tok = null; S.adm = null; S.usr = null; S.me = ''; S.nama = '';
  SS.del('dm.t');
  go('home');
  toast(exp ? 'Sesi berakhir, silakan masuk lagi.' : 'Anda telah keluar.', !!exp);
}

// ── Data publik: tampilkan cache lokal dulu, lalu segarkan di latar belakang ─────
async function boot() {
  ti();
  const c = LS.g('pub');
  if (c) { S.pub = c; try { renderPub(); } catch (e) { S.pub = null; } }
  if (!S.pub) $('#v-home').innerHTML = '<div class="wrap"><div class="card sk">Memuat…</div></div>';
  S.tok = SS.get('dm.t');
  go('home');
  try {
    const p = await read('pub');
    S.t = Date.now();
    if (!S.pub || p.ts !== S.pub.ts) { S.pub = p; LS.s('pub', p); renderPub(); }
  } catch (e) {
    if (!S.pub) $('#v-home').innerHTML = '<div class="wrap"><div class="card">Gagal memuat data. <button class="btn sm" data-act="boot">Coba lagi</button></div></div>';
  }
  read('jadwal').then(j => { S.jd = j; renderSholat(); }).catch(() => { S.jd = null; renderSholat(); });
}
function refreshPub() {
  read('pub').then(p => { S.pub = p; S.t = Date.now(); LS.s('pub', p); renderPub(); }).catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.pub && Date.now() - S.t > 60000) refreshPub();
});
function renderPub() {
  const c = S.pub.cfg;
  $('#bn').textContent = c.namaApp || 'Dansos MMA';
  $('#bo').textContent = c.namaOrg || '';
  document.title = c.namaApp || 'Dansos MMA';
  const logo = $('#logo');
  logo.textContent = '';
  if (c.logoData) logo.appendChild(imgEl(c.logoData, 'Logo'));
  else if (c.logo) logo.appendChild(imgEl(logoUrl(c.logo), 'Logo'));
  else logo.textContent = 'DM';
  renderHome();
  renderDonasi();
  renderTrans();
  renderAjuan();
  $('#ft').innerHTML = '<div class="wrap"><b>' + esc(c.namaApp) + '</b><p>' + esc(c.deskripsi) + '</p><p>' +
    esc(c.kontakEmail) + ' • ' + esc(c.kontakTelp) + ' • ' + esc(c.alamat) + '</p><small>© ' + new Date().getFullYear() +
    ' ' + esc(c.namaApp) + '. Keterbukaan &amp; amanah untuk umat.</small></div>';
}
function tgl() {
  const d = new Date(), o = { timeZone: 'Asia/Makassar' };
  let h = '';
  try { h = new Intl.DateTimeFormat('id-u-ca-islamic-umalqura', Object.assign({}, o, { day: 'numeric', month: 'long', year: 'numeric' })).format(d); }
  catch (e) { h = ''; }
  const m = new Intl.DateTimeFormat('id-ID', Object.assign({}, o, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })).format(d);
  return h ? m + ' • ' + h : m;
}

// ── Beranda ───────────────────────────────────────────────────────────────
function renderHome() {
  const p = S.pub, c = p.cfg;
  SL = parseJ(c.slides, []);
  const kpi = [
    ['Total Donasi', p.total, 'wallet', true],
    ['Bulan Ini', p.bulanIni, 'cal', true],
    ['Jumlah Donatur', p.donatur + ' orang', 'users', false],
    ['Saldo Kas', p.saldo, 'pig', true]
  ].map(k => '<div class="card"><div><b class="num"' + (k[3] ? ' data-n="' + Number(k[1]) + '"' : '') + '>' +
    (k[3] ? rp(k[1]) : esc(k[1])) + '</b><small>' + esc(k[0]) + '</small></div><span class="ico">' + ic(k[2]) + '</span></div>').join('');
  const programs = p.komposisi.slice().sort((a, b) => b.v - a.v).slice(0, 3).map(k =>
    '<div class="card" style="margin:0"><b>' + esc(k.k) + '</b><div class="num in">' + rp(k.v) +
    '</div><small>' + (p.keluar ? Math.round(k.v * 100 / p.keluar) : 0) + '% dari total penyaluran</small></div>').join('')
    || '<p class="mut">Belum ada penyaluran tercatat.</p>';

  $('#v-home').innerHTML =
    '<section class="hero" id="hero"><div class="hov"></div><div class="wrap">' +
      '<div class="ar" lang="ar" dir="rtl">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>' +
      '<div id="sl"><h1 id="sj"></h1><p id="sd"></p></div>' +
      '<span class="pill">' + ic('cal') + '<span>' + esc(tgl()) + '</span></span>' +
      '<div class="glass"><small style="color:#dcefe4">TOTAL DONASI TERKUMPUL</small><strong class="gold num">' + rp(p.total) + '</strong></div>' +
      '<div class="cta"><button class="btn gold" data-act="go" data-v="donasi">Donasi Sekarang</button>' +
      '<button class="btn ghost" data-act="go" data-v="transparansi">Lihat Laporan</button></div>' +
      '<div class="dots" id="dots"></div>' +
    '</div></section>' +
    '<div class="wrap">' +
      '<div class="kpi">' + kpi + '</div>' +
      '<div id="sh" class="card"></div>' +
      '<blockquote class="card quote" style="margin-inline:0"><div class="ar" lang="ar" dir="rtl">' + esc(c.quoteArab) + '</div>' +
      '<p class="mut">“' + esc(c.quoteTerjemahan) + '”</p><b>' + esc(c.quoteSumber) + '</b></blockquote>' +
      '<h2>Program Sosial &amp; Penyaluran</h2><div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">' + programs + '</div>' +
      '<div class="card rowb" style="background:var(--g);color:#fff"><div><b>Ingin memeriksa arus kas lengkap?</b><br>' +
      '<small style="color:#dcefe4">Mutasi kas masuk dan keluar tercatat terbuka.</small></div>' +
      '<button class="btn gold" data-act="go" data-v="transparansi">Buka Kas Terbuka</button></div>' +
    '</div>';

  const hero = $('#hero');
  const ov = hero.querySelector('.hov');
  SL.forEach(s => {
    const b = document.createElement('div');
    b.className = 'hbg';
    if (s.img) b.style.backgroundImage = 'url("' + gu(s.img, 1600) + '")';
    hero.insertBefore(b, ov);
  });
  ['mouseenter', 'touchstart', 'focusin'].forEach(ev => hero.addEventListener(ev, () => clearInterval(timer), { passive: true }));
  ['mouseleave', 'touchend', 'focusout'].forEach(ev => hero.addEventListener(ev, () => { if (!paused) startSl(); }, { passive: true }));
  showSlide(0, true);
  renderSholat();
}
function countUp() {
  if (reduceMotion()) return;
  document.querySelectorAll('#v-home [data-n]').forEach(e => {
    const n = Number(e.dataset.n);
    if (!n) return;
    const t0 = performance.now();
    const f = t => {
      const p = Math.min(1, (t - t0) / 800);
      e.textContent = rp(n * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
}

// Slider: pindah otomatis tiap 5 detik, berhenti saat disentuh/diarahkan/fokus, tombol jeda, dan navigasi keyboard
function showSlide(i, instant) {
  // Beranda belum dirender (data belum datang): jangan menyentuh elemen yang belum ada
  if (!$('#sj')) return;
  if (!SL.length) {
    $('#sj').textContent = 'Portal Dana Sosial';
    $('#sd').textContent = '';
    return;
  }
  si = ((i % SL.length) + SL.length) % SL.length;
  document.querySelectorAll('.hbg').forEach((e, k) => e.classList.toggle('on', k === si));
  const sl = $('#sl'), apply = () => {
    $('#sj').textContent = SL[si].j || '';
    $('#sd').textContent = SL[si].d || '';
    sl.classList.remove('out');
  };
  if (instant || reduceMotion()) apply();
  else { sl.classList.add('out'); setTimeout(apply, 250); }
  renderDots();
}
function renderDots() {
  const dots = $('#dots');
  if (!dots) return;
  dots.innerHTML = SL.map((_, k) =>
    '<i role="button" tabindex="0" data-act="slide" data-i="' + k + '" aria-label="Slide ' + (k + 1) + '"' + (k === si ? ' class="on"' : '') + '></i>'
  ).join('') + '<button data-act="pause" aria-label="' + (paused ? 'Putar' : 'Jeda') + ' slider">' + ic(paused ? 'play' : 'pause') + '</button>';
}
function startSl() {
  clearInterval(timer);
  if (!paused && S.v === 'home') {
    timer = setInterval(() => { if (!document.hidden && S.v === 'home') showSlide(si + 1); }, 5000);
  }
}

// ── Jadwal sholat & hitung mundur (mengikuti zona waktu kota) ─────────────
const NM = [['subuh', 'Subuh'], ['syuruq', 'Syuruq'], ['dzuhur', 'Dzuhur'], ['ashar', 'Ashar'], ['maghrib', 'Maghrib'], ['isya', 'Isya']];
function nowSec() {
  const zona = S.pub && S.pub.cfg.zona ? S.pub.cfg.zona : 'Asia/Jakarta';
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .formatToParts(new Date()).reduce((o, x) => (o[x.type] = x.value, o), {});
  return (Number(p.hour) % 24) * 3600 + Number(p.minute) * 60 + Number(p.second);
}
const toSec = s => { const parts = String(s || '').split(':').map(Number); return parts[0] * 3600 + parts[1] * 60; };
function renderSholat() {
  const e = $('#sh');
  if (!e || !S.pub) return;
  const j = S.jd;
  if (!j) { e.innerHTML = '<p class="mut">Jadwal sholat belum tersedia saat ini.</p>'; return; }
  e.innerHTML = '<h2>Jadwal Sholat Hari Ini — ' + esc(S.pub.cfg.lokasi || S.pub.cfg.kota) + '</h2>' +
    '<div style="margin:6px 0 12px"><span class="pill" id="cd2" style="max-width:100%;white-space:normal"></span></div><div class="pt">' +
    NM.map(n => '<div class="pc" data-k="' + n[0] + '"><small>' + n[1] + '</small><b class="num">' + esc(j[n[0]]) + '</b></div>').join('') + '</div>';
  tick();
}
function tick() {
  const j = S.jd, cd = $('#cd2');
  if (!j || !cd) return;
  const n = nowSec();
  let x = null;
  for (const [k, l] of NM) {
    if (k === 'syuruq') continue;
    const t = toSec(j[k]);
    if (t > n) { x = { k: k, l: l, t: t }; break; }
  }
  if (!x) x = { k: 'subuh', l: 'Subuh', t: toSec(j.subuh) + 86400 };
  const d = x.t - n;
  document.querySelectorAll('.pc').forEach(e => e.classList.toggle('on', e.dataset.k === x.k));
  cd.textContent = 'Menuju ' + x.l + ': ' + Math.floor(d / 3600) + ' jam ' + Math.floor((d % 3600) / 60) + ' menit lagi';
}
setInterval(() => { if (S.v === 'home' && !document.hidden) tick(); }, 30000);

// ── Donasi ─────────────────────────────────────────────────────────────
// Tautan WhatsApp Humas. Kosong bila nomor belum diatur di editor Konten.
function waLink(text) {
  const n = String(S.pub.cfg.waHumas || '').replace(/\D/g, '');
  return n ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(text) : '';
}
function laporForm() {
  const td = todayJkt();
  return '<form data-form="lapor"><label>Tanggal transfer<input name="Tanggal" type="date" max="' + td + '" value="' + td + '" required></label>' +
    '<label>Nominal (Rp)<input name="Nominal" type="number" min="1" step="1" required></label>' +
    '<label>Metode<select name="Metode"><option>Transfer</option><option>QRIS</option><option>Tunai</option></select></label>' +
    '<label>Nama donatur (opsional)<input name="Nama Donatur" maxlength="60" placeholder="Kosongkan jika tidak ingin ditulis"></label>' +
    '<label><input type="checkbox" name="Anonim" value="1"> Sembunyikan nama (tampil sebagai Hamba Allah)</label>' +
    '<label>Bukti transfer (JPG/PNG/PDF, maks 5 MB, opsional)<input name="file" type="file" accept="image/jpeg,image/png,application/pdf"></label>' +
    '<input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">' +
    '<div class="row" style="margin-top:0"><button class="btn" type="submit" id="sl">Kirim Laporan</button></div></form>';
}
function renderDonasi() {
  const c = S.pub.cfg, st = parseJ(c.tataCara, []), rk = parseJ(c.rekening, []);
  $('#v-donasi').innerHTML =
    '<div class="wrap"><h1 style="margin-top:20px">Donasi &amp; Sedekah</h1><div class="grid2"><div>' +
      '<div class="card"><h2>Tata Cara Berdonasi</h2><ol class="steps">' +
        st.map(x => '<li><b>' + esc(x.j) + '</b><span>' + esc(x.d) + '</span></li>').join('') + '</ol></div>' +
      '<div class="card"><h2>Kanal Pembayaran Resmi</h2>' +
        rk.map(r => '<div class="rek"><div><small>' + esc(r.bank) + '</small><div class="num" style="font-size:1.2rem">' + esc(r.no) +
          '</div><small>a.n. ' + esc(r.an) + '</small></div><button class="btn sm" data-act="copy" data-copy="' + esc(r.no) + '">Salin</button></div>').join('') +
        '<p class="mut">' + esc(c.catatan) + '</p></div>' +
      '<div class="card" id="lapor-card"><h2>Lapor Donasi Anda</h2>' +
        '<p class="mut">Sudah berdonasi? Isi data berikut. Donasi tampil di laporan setelah diverifikasi Humas.</p>' + laporForm() + '</div>' +
    '</div>' +
    '<div class="card"><h2>Donatur Terverifikasi</h2><label for="qd" class="mut">Cari nama donatur</label>' +
      '<input id="qd" type="search" data-in="qd" value="' + esc(S.qd) + '"><div id="ld"></div></div></div></div>';
  listDon();
}
// ── Ajuan donasi (publik) ───────────────────────────────────────────────
const STATUS_PENGAJU = ['Peserta didik', 'Orangtua/wali', 'Wali kelas', 'Pengasuh ribath', 'Guru', 'Pihak lain'];
const STATUS_AJUAN = ['Baru', 'Diproses', 'Selesai', 'Ditolak'];
const unduhUrl = id => 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(id);
function renderAjuan() {
  const el = $('#v-ajuan');
  if (!el || !S.pub) return;
  const c = S.pub.cfg;
  const daftar = dokAwal(c);
  const docs = daftar.map(d => '<div class="li"><div><b>' + esc(d.judul) + '</b></div><a class="btn sm" href="' +
    esc(unduhUrl(d.id)) + '" target="_blank" rel="noopener">Unduh</a></div>').join('')
    || '<p class="mut">Dokumen belum tersedia. Silakan hubungi Humas MMA.</p>';
  const langkah = parseJ(c.tataCaraAjuan, []);
  const tata = langkah.length
    ? '<div class="card"><h2>Tata Cara Pengajuan Donasi</h2><ol class="steps">' +
      langkah.map(x => '<li><b>' + esc(x.j) + '</b><span>' + esc(x.d) + '</span></li>').join('') + '</ol></div>'
    : '';
  el.innerHTML = '<div class="wrap"><h1 style="margin-top:20px">Ajuan Donasi</h1>' +
    tata + '<div class="card"><h2>Unduh Dokumen</h2>' + docs + '</div>' +
    '<div class="card" id="ajuan-card"><h2>Formulir Pengajuan</h2>' +
    '<p class="mut">Isi data berikut, lalu unggah formulir pengajuan yang sudah ditandatangani.</p>' + ajuanForm() + '</div></div>';
}
function ajuanForm() {
  return '<form data-form="ajuan">' +
    '<label>Nama pengaju<input name="NamaPengaju" required maxlength="80"></label>' +
    '<label>Status pengaju<select name="StatusPengaju" required>' +
      STATUS_PENGAJU.map(x => '<option>' + esc(x) + '</option>').join('') + '</select></label>' +
    '<label>Nama yang diajukan<input name="NamaDiajukan" required maxlength="80"></label>' +
    '<label>Formulir pengajuan (PDF, JPG, atau PNG, maks 5 MB)<input name="file" type="file" required accept="image/jpeg,image/png,application/pdf"></label>' +
    '<input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">' +
    '<div class="row" style="margin-top:0"><button class="btn" type="submit" id="sa">Kirim Pengajuan</button></div></form>';
}
async function saveAjuan(f) {
  const fdat = new FormData(f), x = {};
  ['NamaPengaju', 'StatusPengaju', 'NamaDiajukan'].forEach(k => { x[k] = String(fdat.get(k) || ''); });
  x.website = fdat.get('website') || '';
  const btn = f.querySelector('#sa');
  btn.disabled = true;
  btn.textContent = 'Mengirim…';
  try {
    x.file = await readFile(fdat.get('file'));
    const r = await call('ajukanDonasi', x, rid());
    if (!r.ok) throw new Error(r.msg || 'Pengajuan gagal dikirim.');
    showAjuanOk(r.id, x);
  } catch (e) {
    toast(e.message, true);
    btn.disabled = false;
    btn.textContent = 'Kirim Pengajuan';
  }
}
function pesanAjuan(id, d) {
  return [
    "Assalamu'alaikum, saya sudah mengajukan donasi untuk Dansos MMA. Mohon ditindaklanjuti.",
    '',
    'Kode pengajuan : ' + (id || '-'),
    'Nama pengaju   : ' + (d.NamaPengaju || '-'),
    'Status         : ' + (d.StatusPengaju || '-'),
    'Nama diajukan  : ' + (d.NamaDiajukan || '-'),
    'Formulir       : ' + (d.file ? 'terlampir di formulir' : 'akan saya kirim di chat ini'),
    '',
    'Terima kasih.'
  ].join('\n');
}
function showAjuanOk(id, d) {
  const card = $('#ajuan-card');
  if (!card) return;
  const data = Object.assign({}, d || {}, { file: !!(d && d.file) });
  const wa = waLink(pesanAjuan(id, data));
  card.innerHTML = '<h2>Terima kasih</h2><p>Pengajuan Anda sudah diterima' + (id ? ' dengan kode <b>' + esc(id) + '</b>' : '') +
    '. Humas akan memprosesnya dan menghubungi Anda.</p>' +
    '<p class="mut">Kirim pesan berikut ke WhatsApp Humas agar mudah ditindaklanjuti:</p>' +
    '<pre style="white-space:pre-wrap;background:var(--bg);padding:12px;border-radius:12px;font:inherit;font-size:14px">' + esc(pesanAjuan(id, data)) + '</pre>' +
    (wa ? '<a class="btn" href="' + esc(wa) + '" target="_blank" rel="noopener">Kirim ke WhatsApp Humas</a>' : '');
}

async function saveLapor(f) {
  const fdat = new FormData(f), x = {};
  ['Tanggal', 'Nominal', 'Metode', 'Nama Donatur'].forEach(k => { x[k] = fdat.get(k) || ''; });
  x.Anonim = !!fdat.get('Anonim');
  x.website = fdat.get('website') || '';
  const btn = f.querySelector('#sl');
  btn.disabled = true;
  btn.textContent = 'Mengirim…';
  try {
    x.file = await readFile(fdat.get('file'));
    const r = await call('laporDonasi', x, rid());
    if (!r.ok) throw new Error(r.msg || 'Laporan gagal dikirim.');
    showLaporOk(r.id, x);
  } catch (e) {
    toast(e.message, true);
    btn.disabled = false;
    btn.textContent = 'Kirim Laporan';
  }
}
// Pesan WhatsApp disusun dari data yang diisi pengunjung, supaya Humas langsung bisa mencocokkan transfer
function pesanLapor(id, d) {
  const baris = [
    "Assalamu'alaikum, saya sudah berdonasi untuk Dansos MMA. Mohon konfirmasinya.",
    '',
    'Kode laporan : ' + (id || '-'),
    'Tanggal      : ' + (d.Tanggal ? fd(d.Tanggal) : '-'),
    'Nominal      : ' + rp(d.Nominal),
    'Metode       : ' + (d.Metode || '-'),
    'Nama         : ' + (String(d['Nama Donatur'] || '').trim() || '-') + (d.Anonim ? ' (disembunyikan di publik)' : ''),
    'Bukti        : ' + (d.adaBukti ? 'terlampir di formulir' : 'akan saya kirim di chat ini'),
    '',
    'Terima kasih.'
  ];
  return baris.join('\n');
}
function showLaporOk(id, d) {
  const card = $('#lapor-card');
  if (!card) return;
  const data = Object.assign({}, d || {}, { adaBukti: !!(d && d.file) });
  const wa = waLink(pesanLapor(id, data));
  card.innerHTML = '<h2>Terima kasih</h2><p>Laporan Anda sudah diterima' + (id ? ' dengan kode <b>' + esc(id) + '</b>' : '') +
    '. Humas akan memverifikasinya maksimal 1x24 jam, lalu donasi tampil di laporan.</p>' +
    '<p class="mut">Kirim pesan berikut ke WhatsApp Humas agar mudah dicocokkan:</p>' +
    '<pre style="white-space:pre-wrap;background:var(--bg);padding:12px;border-radius:12px;font:inherit;font-size:14px">' + esc(pesanLapor(id, data)) + '</pre>' +
    (wa ? '<a class="btn" href="' + esc(wa) + '" target="_blank" rel="noopener">Kirim ke WhatsApp Humas</a>' : '');
}

function listDon() {
  const el = $('#ld');
  if (!el || !S.pub) return;
  const q = S.qd.trim().toLowerCase();
  const L = S.pub.donasi.filter(r => r.nama.toLowerCase().indexOf(q) >= 0).slice(0, 60);
  el.innerHTML = L.map(r =>
    '<div class="li"><span class="av" aria-hidden="true">' + esc(r.nama.charAt(0)) + '</span>' +
    '<div style="flex:1;min-width:0"><b>' + esc(r.nama) + '</b><br><small>' + esc(r.m) + ' • ' + fd(r.t) + '</small></div>' +
    '<div style="text-align:right"><span class="num in">+' + rp(r.n) + '</span></div></div>').join('') || '<p class="mut">Belum ada donatur.</p>';
}
function copy(t) {
  const fallback = () => {
    const a = document.createElement('textarea');
    a.value = t;
    a.setAttribute('readonly', '');
    a.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(a);
    a.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    a.remove();
    toast(ok ? 'Nomor disalin.' : 'Gagal menyalin. Salin manual.', !ok);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => toast('Nomor disalin.'), fallback);
  else fallback();
}
async function showBukti(tipe, id, pub) {
  dlg('<p>Memuat bukti…</p>');
  try {
    const r = await call('bukti', pub ? '' : S.tok, tipe, id);
    if (!r.ok) throw new Error(r.msg || 'Bukti tidak tersedia.');
    if (r.pdf) {
      dlg('<h2>Bukti ' + esc(id) + '</h2><p class="mut">Bukti berupa PDF dan tidak dapat ditampilkan di sini.</p><div class="row"><button class="btn" data-act="dlgClose">Tutup</button></div>');
      return;
    }
    dlg('<h2>Bukti ' + esc(id) + '</h2><div id="bimg"></div><div class="row"><button class="btn" data-act="dlgClose">Tutup</button></div>');
    const i = document.createElement('img');
    i.alt = 'Bukti ' + id;
    i.src = r.img;
    i.style.maxWidth = '100%';
    $('#bimg').appendChild(i);
  } catch (e) {
    dlg('<p>' + esc(e.message) + '</p><div class="row"><button class="btn" data-act="dlgClose">Tutup</button></div>');
  }
}

// ── Transparansi ─────────────────────────────────────────────────────────
// Periode: bulan berjalan, 3 bulan, 6 bulan, atau tahun berjalan (format YYYY-MM sebagai batas awal)
function cut() {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  const back = n => { const x = new Date(y, m - n, 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
  return { bulan: back(0), '3': back(2), '6': back(5), tahun: y + '-01' }[S.per];
}
function renderTrans() {
  CH.forEach(c => c.destroy());
  CH = [];
  const el = $('#v-transparansi');
  if (!el || !S.pub) return;
  const p = S.pub, k = cut();
  const b = p.bulanan.filter(x => x.b >= k);
  const mi = b.reduce((a, x) => a + x.in, 0), mo = b.reduce((a, x) => a + x.out, 0);
  const sl = p.salur.filter(r => r.t.slice(0, 7) >= k);
  const dn = p.donasi.filter(r => r.t.slice(0, 7) >= k).slice(0, 8);
  const per = [['bulan', 'Bulan Ini'], ['3', '3 Bulan'], ['6', '6 Bulan'], ['tahun', 'Tahun Ini']];
  el.innerHTML =
    '<div class="wrap"><h1 style="margin-top:20px">Transparansi Dana Sosial</h1>' +
    '<p class="mut">Laporan arus kas masuk dan penyaluran dana secara terbuka dan akuntabel.</p>' +
    '<div class="seg" role="group" aria-label="Filter periode">' +
      per.map(x => '<button aria-pressed="' + (S.per === x[0]) + '" data-act="per" data-per="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
    '<div class="kpi" style="margin-top:8px">' +
      [['Total Pemasukan', rp(mi)], ['Total Penyaluran', rp(mo)], ['Saldo Kas Berjalan', rp(p.saldo)], ['Transaksi Terverifikasi', String(p.trx)]]
        .map(x => '<div class="card"><div><small>' + x[0] + '</small><b class="num">' + esc(x[1]) + '</b></div></div>').join('') + '</div>' +
    '<div class="grid2"><div class="card"><h2>Pemasukan vs Pengeluaran</h2><div class="cv"><canvas id="cb" role="img" aria-label="Diagram batang pemasukan dan pengeluaran per bulan"></canvas></div></div>' +
      '<div class="card"><h2>Komposisi Program</h2><div class="cv"><canvas id="cd" role="img" aria-label="Diagram donat penyaluran per kategori"></canvas></div></div></div>' +
    '<div class="grid2"><div class="card"><h2>Penyaluran Dana Terbaru</h2>' +
      (sl.slice(0, 6).map(r => '<div class="li"><div style="min-width:0"><b>' + esc(r.ket) + '</b><br><small>' + esc(r.k) + ' • ' + fd(r.t) +
        '</small></div><span class="num out">− ' + rp(r.n) + '</span></div>').join('') || '<p class="mut">Belum ada.</p>') + '</div>' +
    '<div class="card"><h2>Donatur Terbaru</h2>' +
      (dn.map(r => '<div class="li"><span class="av" aria-hidden="true">' + esc(r.nama.charAt(0)) + '</span><div style="flex:1;min-width:0"><b>' +
        esc(r.nama) + '</b><br><small>' + fd(r.t) + '</small></div><span class="num in">+ ' + rp(r.n) + '</span></div>').join('') || '<p class="mut">Belum ada.</p>') +
    '</div></div></div>';
  if (S.v === 'transparansi') drawCharts();
}
let chartP = null;
function loadChart() {
  if (window.Chart) return Promise.resolve();
  if (!chartP) {
    chartP = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
      s.onload = ok;
      s.onerror = () => { chartP = null; no(new Error('Grafik gagal dimuat.')); };
      document.head.appendChild(s);
    });
  }
  return chartP;
}
async function drawCharts() {
  try { await loadChart(); } catch (e) { return; }
  if (S.v !== 'transparansi' || !S.pub || !$('#cb')) return;
  CH.forEach(c => c.destroy());
  CH = [];
  const cs = getComputedStyle(document.documentElement);
  const mut = cs.getPropertyValue('--mut').trim(), card = cs.getPropertyValue('--card').trim();
  const b = S.pub.bulanan.filter(x => x.b >= cut()), kom = S.pub.komposisi;
  Chart.defaults.color = mut;
  Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
  CH.push(new Chart($('#cb'), {
    type: 'bar',
    data: { labels: b.map(x => x.b), datasets: [
      { label: 'Pemasukan', data: b.map(x => x.in), backgroundColor: '#40916C' },
      { label: 'Pengeluaran', data: b.map(x => x.out), backgroundColor: '#D4A62A' }
    ] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => (v / 1e6) + ' jt' } } } }
  }));
  CH.push(new Chart($('#cd'), {
    type: 'doughnut',
    data: { labels: kom.map(x => x.k), datasets: [{ data: kom.map(x => x.v), backgroundColor: ['#1B4332', '#40916C', '#74C69D', '#D4A62A', '#9A7415', '#D8F3DC'], borderColor: card }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '62%' }
  }));
}

// ── Login & data admin ───────────────────────────────────────────────────
async function doLogin(f) {
  const b = $('#lb');
  b.disabled = true;
  b.textContent = 'Memproses…';
  try {
    const r = await call('login', f.elements.e.value, f.elements.p.value);
    if (!r.ok) throw new Error(r.msg);
    S.tok = r.tok; S.me = r.me; S.nama = r.nama;
    S.adm = { donasi: r.donasi, salur: r.salur, hitung: r.hitung };
    SS.set('dm.t', r.tok);
    f.reset();
    go('admin');
    toast('Selamat datang, ' + r.nama);
  } catch (x) {
    toast(x.message, true);
  } finally {
    b.disabled = false;
    b.textContent = 'Masuk';
  }
}
async function loadAdm() {
  try {
    const r = await ac('aData');
    S.adm = { donasi: r.donasi, salur: r.salur, hitung: r.hitung };
    renderAdm();
  } catch (e) { toast(e.message, true); }
}
async function loadUsr() {
  try {
    const r = await ac('aPengguna');
    S.usr = r.pengguna;
    renderAdm();
  } catch (e) { toast(e.message, true); }
}
const TABS = [['dash', 'Dashboard'], ['ver', 'Verifikasi Donasi'], ['don', 'Kelola Donasi'], ['sal', 'Penyaluran Dana'], ['ajuan', 'Ajuan Donasi'], ['kon', 'Konten & Tampilan'], ['usr', 'Pengguna']];
function renderAdm(anim_) {
  if (!S.tok) return;
  const n = S.adm ? S.adm.hitung.nw : 0, open = !!S.menu;
  $('#adm').innerHTML = '<div class="adm">' +
    '<button class="btn sm menu-btn" data-act="menu" aria-expanded="' + open + '" aria-controls="sidebar-admin">☰ Menu</button>' +
    '<div class="scrim' + (open ? ' on' : '') + '" data-act="menu" aria-hidden="true"></div>' +
    '<nav class="side' + (open ? ' open' : '') + '" id="sidebar-admin" role="tablist" aria-label="Menu pengurus">' +
    TABS.map(t => '<button role="tab" aria-selected="' + (S.tab === t[0]) + '" data-act="tab" data-tab="' + t[0] + '">' + t[1] +
      (t[0] === 'ver' && n ? ' <i class="bdg">' + n + '</i>' : '') + '</button>').join('') +
    '<button data-act="logout">' + ic('out') + ' Keluar</button></nav>' +
    '<div id="ab">' + (S.adm ? AB[S.tab]() : '<div class="card sk">Memuat…</div>') + '</div></div>';
  if (anim_) anim($('#ab'));
}
const AB = {};
AB.ajuan = () => {
  if (!S.ajuan) return '<div class="card sk">Memuat…</div>';
  const L = S.ajuan.slice().reverse();
  return '<div class="card"><h2>Laporan Pengajuan Donasi</h2>' +
    (L.length ? '<div class="tbl"><table><thead><tr><th>ID</th><th>Tanggal</th><th>Pengaju</th><th>Status</th><th>Nama diajukan</th><th>Formulir</th><th>Status ajuan</th></tr></thead><tbody>' +
      L.map(r => '<tr><td data-l="ID">' + esc(r.ID) + '</td><td data-l="Tanggal">' + fd(r.Tanggal) + '</td><td data-l="Pengaju">' + esc(r['Nama Pengaju']) +
        '</td><td data-l="Status">' + esc(r['Status Pengaju']) + '</td><td data-l="Diajukan">' + esc(r['Nama Diajukan']) +
        '</td><td data-l="Formulir"><a href="' + esc(unduhUrl(r['ID Formulir'])) + '" target="_blank" rel="noopener">Unduh</a></td>' +
        '<td data-l="Status ajuan"><select data-chg="stAjuan" data-id="' + esc(r.ID) + '">' +
        STATUS_AJUAN.map(x => '<option' + (r.Status === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></td></tr>').join('') +
      '</tbody></table></div>' : '<p class="mut">Belum ada pengajuan.</p>') + '</div>';
};
async function loadAjuan() {
  try {
    const r = await ac('aAjuan');
    S.ajuan = r.ajuan;
    renderAdm();
  } catch (e) { toast(e.message, true); }
}
async function statusAjuan(id, st) {
  try {
    await ac('aStatusAjuan', id, st, rid());
    toast('Status pengajuan diperbarui.');
    loadAjuan();
  } catch (e) { toast(e.message, true); loadAjuan(); }
}
async function uploadDok(input) {
  const f = input.files && input.files[0];
  if (!f || !S.dr || !S.dr.dokumen) return;
  const i = Number(input.dataset.i);
  if (!S.dr.dokumen[i]) return;
  try {
    toast('Mengunggah dokumen…');
    const bukti = await readFile(f, DOK_RE);
    const r = await ac('aUnggahDokumen', bukti, rid());
    S.dr.dokumen[i].id = r.id;
    if (!S.dr.dokumen[i].judul) S.dr.dokumen[i].judul = f.name.replace(/\.[^.]+$/, '');
    renderAdm();
    toast('Berkas terunggah. Tekan Simpan Perubahan untuk menerapkan.');
  } catch (e) { toast(e.message, true); }
}
const byTgl = (a, b) => String(a.Tanggal).localeCompare(String(b.Tanggal));

AB.dash = () => {
  const h = S.adm.hitung;
  const pending = S.adm.donasi.filter(r => r.Status === 'Menunggu').sort(byTgl).slice(0, 5);
  return '<div class="card rowb"><div><h1 style="font-size:1.4rem">Ahlan wa Sahlan, ' + esc(S.nama || 'Admin') + '</h1><small>' + esc(S.me) + '</small></div>' +
    '<div class="row" style="margin:0"><button class="btn gold" data-act="form" data-tipe="donasi">+ Input Donasi Baru</button>' +
    '<button class="btn" data-act="form" data-tipe="salur">+ Catat Penyaluran</button></div></div>' +
    '<div class="kpi" style="margin-top:0">' +
      [['Total Donasi Terkumpul', rp(h.in)], ['Total Penyaluran', rp(h.out)], ['Saldo Kas Tersedia', rp(h.saldo)], ['Menunggu Verifikasi', h.nw + ' transaksi (' + rp(h.sw) + ')']]
        .map(x => '<div class="card"><div><small>' + x[0] + '</small><b class="num">' + esc(x[1]) + '</b></div></div>').join('') + '</div>' +
    '<div class="card"><h2>Donasi Menunggu Verifikasi</h2>' +
      (pending.map(r => '<div class="li"><div style="min-width:0"><b>' + esc(r.ID) + '</b> ' + esc(r['Nama Donatur']) +
        '<br><small>' + fd(r.Tanggal) + ' • ' + esc(r.Metode) + '</small></div><div class="row" style="margin:0;align-items:center">' +
        '<span class="num">' + rp(r.Nominal) + '</span>' +
        '<button class="btn sm" data-act="stat" data-id="' + esc(r.ID) + '" data-s="Terverifikasi">Verifikasi</button>' +
        '<button class="btn sm danger" data-act="stat" data-id="' + esc(r.ID) + '" data-s="Ditolak">Tolak</button></div></div>').join('')
        || '<p class="mut">Antrean kosong.</p>') + '</div>';
};

AB.ver = () => {
  const D = S.adm.donasi;
  const L = D.filter(r => r.Status === S.vf).sort(byTgl);
  const o = L.find(r => r.ID === S.sel) || L[0];
  const btn = (s, cls) => '<button class="btn ' + cls + '" data-act="stat" data-id="' + esc(o.ID) + '" data-s="' + s + '">' + (s === 'Ditolak' ? 'Tolak Donasi' : 'Verifikasi &amp; Catat ke Kas') + '</button>';
  return '<div class="seg">' + STATUS3.map(s => '<button aria-pressed="' + (S.vf === s) + '" data-act="vf" data-vf="' + s + '">' + s + ' (' + D.filter(r => r.Status === s).length + ')</button>').join('') + '</div>' +
    '<div class="grid2"><div>' +
      (L.map(r => '<button class="item" aria-pressed="' + (!!o && o.ID === r.ID) + '" data-act="sel" data-id="' + esc(r.ID) + '"><b>' + esc(r.ID) + '</b> ' +
        esc(r['Nama Donatur']) + '<span class="num">' + rp(r.Nominal) + '</span><br><small>' + fd(r.Tanggal) + ' • ' + esc(r.Metode) + '</small></button>').join('') ||
      '<div class="card">Tidak ada data.</div>') + '</div>' +
    (o ? '<div class="card"><h2>Tinjau ' + esc(o.ID) + '</h2><p><b class="num" style="font-size:1.6rem">' + rp(o.Nominal) + '</b><br>' +
      esc(o['Nama Donatur']) + ' • ' + fd(o.Tanggal) + ' • ' + esc(o.Metode) + '<br><small>Dicatat: ' + esc(o['Dicatat Oleh']) +
      (o['Diverifikasi Oleh'] ? ' • Diverifikasi: ' + esc(o['Diverifikasi Oleh']) : '') + '</small></p>' +
      '<button class="btn sm" data-act="bukti" data-tipe="donasi" data-id="' + esc(o.ID) + '"' + (o['ID Bukti'] ? '' : ' disabled') + '>' +
      (o['ID Bukti'] ? 'Lihat bukti' : 'Bukti belum diunggah') + '</button>' +
      '<p><label><input type="checkbox" id="pb"' + (o['Tampil Publik'] === 'Tidak' ? '' : ' checked') + '> Tampil di daftar donatur publik</label></p>' +
      '<div class="row">' + (o.Status !== 'Ditolak' ? btn('Ditolak', 'danger') : '') + (o.Status !== 'Terverifikasi' ? btn('Terverifikasi', '') : '') + '</div></div>' : '') + '</div>';
};
const STATUS3 = ['Menunggu', 'Terverifikasi', 'Ditolak'];

function tblHtml(tipe) {
  const q = S.qadm.trim().toLowerCase();
  const isD = tipe === 'donasi';
  const L = (isD ? S.adm.donasi : S.adm.salur).slice().reverse().filter(r =>
    !q || [r.ID, r['Nama Donatur'], r.Kategori, r.Keterangan].some(v => String(v || '').toLowerCase().indexOf(q) >= 0));
  const head = isD ? ['ID', 'Tanggal', 'Donatur', 'Nominal', 'Status'] : ['ID', 'Tanggal', 'Kategori — Keterangan', 'Nominal'];
  // data-l: label kolom untuk tampilan HP (kartu), lihat aturan .tbl di Stylesheet
  return '<div class="tbl"><table><thead><tr>' + head.map(h => '<th>' + esc(h) + '</th>').join('') + '<th>Aksi</th></tr></thead><tbody>' +
    L.map(r => '<tr><td data-l="ID">' + esc(r.ID) + '</td><td data-l="Tanggal">' + fd(r.Tanggal) + '</td><td data-l="' + (isD ? 'Donatur' : 'Keterangan') + '">' +
      (isD ? esc(r['Nama Donatur']) : esc(r.Kategori) + ' — ' + esc(r.Keterangan)) + '</td><td data-l="Nominal">' + rp(r.Nominal) + '</td>' +
      (isD ? '<td data-l="Status"><span class="st">' + esc(r.Status) + '</span></td>' : '') +
      '<td class="aksi" data-l="Aksi"><button class="btn sm" data-act="form" data-tipe="' + tipe + '" data-id="' + esc(r.ID) + '">Ubah</button> ' +
      '<button class="btn sm danger" data-act="del" data-tipe="' + tipe + '" data-id="' + esc(r.ID) + '">Hapus</button></td></tr>').join('') +
    '</tbody></table></div>';
}
function listHtml(tipe, title) {
  return '<div class="card"><div class="rowb"><h2>' + title + '</h2><div class="row" style="margin:0">' +
    '<button class="btn sm" data-act="csv" data-tipe="' + tipe + '">Unduh CSV (Excel)</button>' +
    '<button class="btn" data-act="form" data-tipe="' + tipe + '">' + (tipe === 'donasi' ? '+ Catat Manual' : '+ Catat Penyaluran') + '</button></div></div>' +
    '<input type="search" aria-label="Cari" placeholder="Cari ID, nama, atau keterangan" data-in="qadm" value="' + esc(S.qadm) + '">' +
    '<div id="tblwrap">' + tblHtml(tipe) + '</div></div>';
}
AB.don = () => listHtml('donasi', 'Kelola Donasi');
AB.sal = () => listHtml('salur', 'Penyaluran Dana');

const KV = [
  ['namaApp', 'Nama aplikasi'], ['namaOrg', 'Nama lembaga'], ['kota', 'Kota jadwal sholat'], ['lokasi', 'Label lokasi sholat'],
  ['quoteArab', 'Ayat / kaligrafi (Arab)', 1], ['quoteTerjemahan', 'Terjemahan ayat', 1], ['quoteSumber', 'Sumber ayat'],
  ['deskripsi', 'Deskripsi footer', 1], ['kontakEmail', 'Email kontak'], ['kontakTelp', 'Telepon / WA'], ['alamat', 'Alamat'],
  ['catatan', 'Catatan penting (halaman Donasi)', 1], ['waHumas', 'Nomor WhatsApp Humas (contoh 6281234567890). Kosongkan untuk menyembunyikan tombol'], ['zona', 'Zona waktu kota (WIB: Asia/Jakarta, WITA: Asia/Makassar, WIT: Asia/Jayapura)']
];
const LIST = {
  slides: { t: 'Hero Slider (foto, judul, caption)', f: [['j', 'Judul'], ['d', 'Caption']], img: true },
  tataCara: { t: 'Tata Cara Berdonasi', f: [['j', 'Langkah'], ['d', 'Penjelasan']] },
  rekening: { t: 'Rekening / Kanal Pembayaran', f: [['bank', 'Bank / kanal'], ['no', 'Nomor'], ['an', 'Atas nama']] },
  tataCaraAjuan: { t: 'Tata Cara Pengajuan Donasi (halaman Ajuan)', f: [['j', 'Langkah'], ['d', 'Penjelasan']] }
};
// Daftar dokumen ajuan: dari dokumenAjuan; jika belum ada, pakai kunci lama (SK dan formulir) sebagai awal
function dokAwal(c) {
  const L = parseJ(c.dokumenAjuan, []).filter(x => x && x.id);
  if (L.length) return L;
  const lama = [];
  if (c.skDonasi) lama.push({ judul: 'Ketentuan dan Prosedur Kaleng Donasi', id: c.skDonasi });
  if (c.formulirDonasi) lama.push({ judul: 'Formulir Kaleng Donasi', id: c.formulirDonasi });
  return lama;
}
function loadDraft() {
  const c = S.pub.cfg, kv = {};
  KV.forEach(k => { kv[k[0]] = c[k[0]] || ''; });
  const d = { logo: c.logo || '', logoData: c.logoData || '', kv: kv };
  d.dokumen = dokAwal(c).map(x => ({ judul: x.judul, id: x.id }));
  Object.keys(LIST).forEach(k => { d[k] = parseJ(c[k], []); });
  S.dr = d;
}
const DOK_ACCEPT = 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png';
const DOK_RE = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image\/(jpeg|png))$/;
function dokHtml() {
  const L = S.dr && S.dr.dokumen ? S.dr.dokumen : [];
  const tombol = 'display:inline-flex;align-items:center;justify-content:center;margin:0;min-width:44px;min-height:44px;padding:0 14px';
  return '<h2 style="margin-top:16px">Dokumen Ajuan Donasi</h2>' +
    '<p class="mut">Tambah dokumen, ubah judul, atau ganti berkas. Tekan Simpan Perubahan untuk menerapkan.</p>' +
    L.map((r, i) => '<div class="card" style="margin:8px 0;background:var(--bg)">' +
      '<label>Judul dokumen<input value="' + esc(r.judul) + '" data-in="li" data-k="dokumen" data-i="' + i + '" data-f="judul"></label>' +
      '<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px">' +
        '<small>' + (r.id ? 'Berkas sudah diunggah' : 'Belum ada berkas') + '</small>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
          '<label class="btn sm" style="' + tombol + '">' + (r.id ? 'Ganti berkas' : 'Unggah berkas') +
          '<input type="file" accept="' + DOK_ACCEPT + '" hidden data-chg="dok" data-i="' + i + '"></label>' +
          '<button type="button" class="btn sm" style="' + tombol + '" data-act="mv" data-k="dokumen" data-i="' + i + '" data-d="-1"' + (i ? '' : ' disabled') + ' aria-label="Naikkan">↑</button>' +
          '<button type="button" class="btn sm" style="' + tombol + '" data-act="mv" data-k="dokumen" data-i="' + i + '" data-d="1"' + (i < L.length - 1 ? '' : ' disabled') + ' aria-label="Turunkan">↓</button>' +
          '<button type="button" class="btn sm danger" style="' + tombol + '" data-act="mv" data-k="dokumen" data-i="' + i + '" data-d="0">Hapus</button>' +
        '</div></div></div>').join('') +
    '<button type="button" class="btn sm" data-act="add" data-k="dokumen">+ Tambah dokumen</button>';
}
AB.kon = () => {
  if (!S.dr) loadDraft();
  const d = S.dr;
  const fields = KV.map(k => '<label>' + esc(k[1]) + (k[2]
    ? '<textarea rows="3" data-in="kv" data-k="' + k[0] + '"' + (k[0] === 'quoteArab' ? ' dir="rtl" lang="ar" style="font:22px Amiri,serif"' : '') + '>' + esc(d.kv[k[0]]) + '</textarea>'
    : '<input value="' + esc(d.kv[k[0]]) + '" data-in="kv" data-k="' + k[0] + '">') + '</label>').join('');
  const lists = Object.keys(LIST).map(k => {
    const L = LIST[k];
    const items = d[k].map((r, i) => '<div class="card" style="margin:8px 0;background:var(--bg)">' +
      (L.img ? '<div class="rowb" style="margin-bottom:8px">' + (r.img ? '<img src="' + gu(r.img, 300) + '" alt="Foto slide ' + (i + 1) + '" style="height:72px;border-radius:8px">' : '<small>Belum ada foto</small>') +
        '<label class="btn sm">' + (r.img ? 'Ganti foto' : 'Unggah foto') + '<input type="file" accept="image/jpeg,image/png" hidden data-chg="foto" data-k="' + k + '" data-i="' + i + '"></label></div>' : '') +
      L.f.map(f => '<label>' + esc(f[1]) + '<input value="' + esc(r[f[0]]) + '" data-in="li" data-k="' + k + '" data-i="' + i + '" data-f="' + f[0] + '"></label>').join('') +
      '<div class="row" style="margin:0"><button type="button" class="btn sm" data-act="mv" data-k="' + k + '" data-i="' + i + '" data-d="-1"' + (i ? '' : ' disabled') + ' aria-label="Naikkan">↑</button>' +
      '<button type="button" class="btn sm" data-act="mv" data-k="' + k + '" data-i="' + i + '" data-d="1"' + (i < d[k].length - 1 ? '' : ' disabled') + ' aria-label="Turunkan">↓</button>' +
      '<button type="button" class="btn sm danger" data-act="mv" data-k="' + k + '" data-i="' + i + '" data-d="0">Hapus</button></div></div>').join('');
    return '<h2 style="margin-top:24px">' + esc(L.t) + '</h2>' + items +
      '<button type="button" class="btn sm" data-act="add" data-k="' + k + '">+ Tambah</button>';
  }).join('');
  return '<form class="card" data-form="kon"><h2>Konten &amp; Tampilan</h2><p class="mut">Perubahan baru tampil di web publik setelah menekan Simpan.</p>' +
    '<h2 style="margin-top:16px">Logo</h2><div class="rowb"><span class="logo">' +
      (d.logoData ? '<img src="' + d.logoData + '" alt="Logo" style="width:100%;height:100%;object-fit:cover;border-radius:10px">' : 'DM') + '</span>' +
    '<label class="btn sm">Unggah logo<input type="file" accept="image/jpeg,image/png" hidden data-chg="foto" data-k="logo" data-i="-1"></label></div>' +
    lists + dokHtml() + '<h2 style="margin-top:24px">Teks, Ayat &amp; Kontak</h2>' + fields +
    '<div class="row"><button class="btn" type="submit" id="sk">Simpan Perubahan</button></div></form>';
};
function mv(k, i, dir) {
  const L = S.dr[k];
  if (dir === 0) L.splice(i, 1);
  else if (L[i + dir]) { const t = L[i]; L[i] = L[i + dir]; L[i + dir] = t; }
  renderAdm();
}
function shrink(f, png, maks) {
  return new Promise((ok, no) => {
    const im = new Image(), u = URL.createObjectURL(f);
    im.onload = () => {
      const s = Math.min(1, (maks || 1600) / Math.max(im.width, im.height));
      const c = document.createElement('canvas'), x = c.getContext('2d');
      c.width = Math.round(im.width * s);
      c.height = Math.round(im.height * s);
      if (!png) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
      x.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      ok(png
        ? { b64: c.toDataURL('image/png').split(',')[1], name: 'logo.png', mime: 'image/png' }
        : { b64: c.toDataURL('image/jpeg', 0.85).split(',')[1], name: 'foto.jpg', mime: 'image/jpeg' });
    };
    im.onerror = () => { URL.revokeObjectURL(u); no(new Error('Gambar tidak dapat dibaca.')); };
    im.src = u;
  });
}
async function uploadFoto(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const k = input.dataset.k, i = Number(input.dataset.i);
  try {
    if (k === 'logo') {
      // Logo disimpan langsung di Konten sebagai PNG kecil (transparansi tetap terjaga)
      toast('Memproses logo…');
      const d = await shrink(f, true, 160);
      const u = 'data:image/png;base64,' + d.b64;
      if (u.length > 49000) throw new Error('Logo terlalu besar. Gunakan gambar yang lebih sederhana atau lebih kecil.');
      S.dr.logoData = u;
      S.dr.logo = '';
      renderAdm();
      toast('Logo siap. Tekan Simpan Perubahan untuk menerapkan.');
      return;
    }
    toast('Mengunggah foto…');
    const data = await shrink(f, false);
    const r = await ac('aUnggah', data, rid());
    S.dr[k][i].img = r.id;
    renderAdm();
    toast('Foto terunggah. Tekan Simpan untuk menerapkan.');
  } catch (e) { toast(e.message, true); }
}
async function saveKon(f) {
  const d = S.dr, o = Object.assign({}, d.kv, { logo: d.logo || '', logoData: d.logoData || '' });
  o.dokumenAjuan = JSON.stringify((d.dokumen || []).filter(x => x.id).map(x => ({ judul: String(x.judul || '').trim() || 'Dokumen', id: x.id })));
  Object.keys(LIST).forEach(k => {
    o[k] = JSON.stringify(d[k].filter(r => Object.keys(r).some(x => String(r[x] || '').trim() !== '')));
  });
  const b = f.querySelector('#sk');
  b.disabled = true;
  b.textContent = 'Menyimpan…';
  try {
    await ac('aKonten', o, rid());
    Object.assign(S.pub.cfg, o);
    S.dr = null;
    renderPub();
    renderAdm();
    toast('Tampilan diperbarui.');
    refreshPub();
    read('jadwal').then(j => { S.jd = j; renderSholat(); }).catch(() => {});
  } catch (x) {
    toast(x.message, true);
  } finally {
    b.disabled = false;
    b.textContent = 'Simpan Perubahan';
  }
}

// Verifikasi: tampilan langsung berubah (optimistic), dibatalkan bila server menolak
async function setStatus(id, st) {
  const r = S.adm.donasi.find(x => x.ID === id);
  if (!r) return;
  const old = Object.assign({}, r), cb = $('#pb');
  const pb = cb ? (cb.checked ? 'Ya' : 'Tidak') : (r['Tampil Publik'] || 'Ya');
  Object.assign(r, { Status: st, 'Tampil Publik': pb });
  S.sel = null;
  renderAdm();
  toast(st === 'Ditolak' ? 'Donasi ditolak.' : 'Donasi terverifikasi.');
  try {
    await ac('aStatus', id, st, pb, rid());
    loadAdm();
    refreshPub();
  } catch (e) {
    Object.assign(r, old);
    renderAdm();
    toast(e.message, true);
  }
}
function readFile(f, jenis) {
  return new Promise((ok, no) => {
    if (!f || !f.size) return ok(null);
    if (!(jenis || /^(image\/(jpeg|png)|application\/pdf)$/).test(f.type) || f.size > 5242880) return no(new Error('Berkas tidak didukung atau lebih dari 5 MB.'));
    const r = new FileReader();
    r.onload = () => ok({ b64: String(r.result).split(',')[1], name: f.name, mime: f.type });
    r.onerror = () => no(new Error('Gagal membaca berkas.'));
    r.readAsDataURL(f);
  });
}
function form(tipe, id) {
  const d = tipe === 'donasi', L = d ? S.adm.donasi : S.adm.salur;
  const o = (id && L.find(r => r.ID === id)) || {}, td = todayJkt();
  dlg('<form data-form="rec" data-tipe="' + tipe + '" data-id="' + esc(id || '') + '"><h2>' + (id ? 'Ubah' : 'Catat') + ' ' + (d ? 'Donasi' : 'Penyaluran') + '</h2>' +
    '<label>Tanggal<input name="Tanggal" type="date" max="' + td + '" required value="' + esc(o.Tanggal || td) + '"></label>' +
    (d
      ? '<label>Nama donatur<input name="Nama Donatur" placeholder="Kosongkan = Hamba Allah" value="' + esc(o['Nama Donatur'] || '') + '"></label>' +
        '<label>Metode<select name="Metode">' + ['Transfer', 'Tunai', 'QRIS'].map(m => '<option' + (o.Metode === m ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></label>'
      : '<label>Kategori<input name="Kategori" required list="kat" value="' + esc(o.Kategori || '') + '"></label>' +
        '<datalist id="kat"><option value="Santunan"></option><option value="Operasional"></option><option value="Honor"></option><option value="Pembangunan"></option></datalist>' +
        '<label>Keterangan<input name="Keterangan" required value="' + esc(o.Keterangan || '') + '"></label>') +
    '<label>Nominal (Rp)<input name="Nominal" type="number" min="1" step="1" required value="' + esc(o.Nominal || '') + '"></label>' +
    '<label>Bukti (JPG/PNG/PDF, maks 5 MB)<input name="file" type="file" accept="image/jpeg,image/png,application/pdf"></label>' +
    '<div class="row"><button type="button" class="btn danger" data-act="dlgClose">Batal</button><button class="btn" type="submit" id="sv">Simpan</button></div></form>');
}
async function saveRec(f) {
  const tipe = f.dataset.tipe, id = f.dataset.id || '';
  const fdat = new FormData(f), x = {};
  fdat.forEach((v, k) => { if (k !== 'file') x[k] = v; });
  if (id) x.ID = id;
  const b = f.querySelector('#sv');
  b.disabled = true;
  b.textContent = 'Menyimpan…';
  try {
    const bukti = await readFile(fdat.get('file'));
    if (bukti) x.file = bukti;
    await ac('aSimpan', tipe, x, rid());
    closeDlg();
    toast('Tersimpan.');
    loadAdm();
    refreshPub();
  } catch (er) {
    b.disabled = false;
    b.textContent = 'Simpan';
    toast(er.message, true);
  }
}
function delRec(tipe, id) {
  ask('Hapus data ' + id + '? Tindakan ini tidak dapat dibatalkan.', async () => {
    const k = tipe === 'donasi' ? 'donasi' : 'salur';
    const L = S.adm[k], i = L.findIndex(r => r.ID === id);
    if (i < 0) return;
    const o = L[i];
    L.splice(i, 1);
    renderAdm();
    try {
      await ac('aHapus', tipe, id, rid());
      toast('Data dihapus.');
      loadAdm();
      refreshPub();
    } catch (e) {
      L.splice(i, 0, o);
      renderAdm();
      toast(e.message, true);
    }
  });
}
// Unduh CSV (bisa dibuka di Excel). Nilai yang diawali = + - @ diberi tanda ' agar tidak dibaca sebagai rumus.
function csv(tipe) {
  const L = tipe === 'donasi' ? S.adm.donasi : S.adm.salur;
  const cols = tipe === 'donasi'
    ? ['ID', 'Tanggal', 'Nama Donatur', 'Nominal', 'Bulan', 'Metode', 'Status', 'Tampil Publik', 'Dicatat Oleh', 'Diverifikasi Oleh']
    : ['ID', 'Tanggal', 'Kategori', 'Keterangan', 'Nominal'];
  const q = v => {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const text = '\ufeff' + [cols.join(',')].concat(L.map(r => cols.map(c => q(r[c])).join(','))).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = (tipe === 'donasi' ? 'donasi' : 'penyaluran') + '_' + todayJkt() + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ── Pengguna (Super Admin) ───────────────────────────────────────────────
AB.usr = () => {
  if (!S.usr) return '<div class="card sk">Memuat…</div>';
  return '<div class="card"><div class="rowb"><h2>Pengguna Super Admin</h2><div class="row" style="margin:0"><button class="btn sm" data-act="gantiSandi">Ganti sandi saya</button><button class="btn" data-act="usrForm">+ Tambah Pengguna</button></div></div>' +
    '<div class="tbl"><table><thead><tr><th>Nama</th><th>Email</th><th>Status</th><th>Aksi</th></tr></thead><tbody>' +
    S.usr.map(u => '<tr><td data-l="Nama">' + esc(u.Nama) + '</td><td data-l="Email">' + esc(u.Email) + '</td><td data-l="Status"><span class="st">' + esc(u.Status) + '</span></td>' +
      '<td class="aksi" data-l="Aksi"><button class="btn sm" data-act="usrForm" data-id="' + esc(u.ID) + '">Ubah</button> ' +
      '<button class="btn sm" data-act="usrReset" data-id="' + esc(u.ID) + '">Reset sandi</button></td></tr>').join('') +
    '</tbody></table></div></div>';
};
function usrForm(id) {
  const u = id && S.usr ? S.usr.find(x => x.ID === id) : null;
  dlg('<form data-form="usr" data-id="' + esc(id || '') + '"><h2>' + (u ? 'Ubah' : 'Tambah') + ' Pengguna</h2>' +
    '<label>Nama<input name="Nama" required value="' + esc(u ? u.Nama : '') + '"></label>' +
    '<label>Email<input name="Email" type="email" required value="' + esc(u ? u.Email : '') + '"></label>' +
    (u ? '' : '<label>Kata sandi awal (minimal 8 karakter)<input name="Sandi" type="password" minlength="8" required autocomplete="new-password"></label>') +
    '<label>Status<select name="Status"><option' + (!u || u.Status === 'Aktif' ? ' selected' : '') + '>Aktif</option>' +
      '<option' + (u && u.Status !== 'Aktif' ? ' selected' : '') + '>Nonaktif</option></select></label>' +
    '<div class="row"><button type="button" class="btn danger" data-act="dlgClose">Batal</button><button class="btn" type="submit" id="sv">Simpan</button></div></form>');
}
async function saveUsr(f) {
  const x = new FormData(f);
  const o = { ID: f.dataset.id || '', Nama: x.get('Nama'), Email: x.get('Email'), Sandi: x.get('Sandi') || '', Status: x.get('Status') };
  const b = f.querySelector('#sv');
  b.disabled = true;
  try {
    await ac('aSimpanPengguna', o, rid());
    closeDlg();
    toast('Pengguna tersimpan.');
    loadUsr();
  } catch (e) {
    toast(e.message, true);
  } finally {
    b.disabled = false;
  }
}
// Admin mengatur sandi pengguna lain: sandi dipilih sendiri, diketik dua kali
function usrReset(id) {
  const u = S.usr ? S.usr.find(x => x.ID === id) : null;
  if (!u) return;
  dlg('<form data-form="sandi" data-id="' + esc(id) + '"><h2>Atur kata sandi baru</h2>' +
    '<p class="mut">Untuk <b>' + esc(u.Email) + '</b></p>' +
    '<label>Kata sandi baru (minimal 8 karakter)<input name="Sandi" type="password" minlength="8" required autocomplete="new-password"></label>' +
    '<label>Ulangi kata sandi baru<input name="Ulang" type="password" minlength="8" required autocomplete="new-password"></label>' +
    '<div class="row"><button type="button" class="btn danger" data-act="dlgClose">Batal</button><button class="btn" type="submit" id="sv">Simpan</button></div></form>');
}
async function saveSandi(f) {
  const x = new FormData(f);
  const a = String(x.get('Sandi') || ''), b = String(x.get('Ulang') || '');
  if (a !== b) { toast('Kedua kata sandi tidak sama.', true); return; }
  const btn = f.querySelector('#sv');
  btn.disabled = true;
  try {
    await ac('aResetSandi', f.dataset.id, a);
    closeDlg();
    toast('Kata sandi pengguna diperbarui.');
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
  }
}
// Pengguna mengganti sandinya sendiri
function gantiSandi() {
  dlg('<form data-form="sandiSaya"><h2>Ganti kata sandi saya</h2>' +
    '<label>Kata sandi lama<input name="Lama" type="password" required autocomplete="current-password"></label>' +
    '<label>Kata sandi baru (minimal 8 karakter)<input name="Baru" type="password" minlength="8" required autocomplete="new-password"></label>' +
    '<label>Ulangi kata sandi baru<input name="Ulang" type="password" minlength="8" required autocomplete="new-password"></label>' +
    '<div class="row"><button type="button" class="btn danger" data-act="dlgClose">Batal</button><button class="btn" type="submit" id="sv">Simpan</button></div></form>');
}
async function saveSandiSaya(f) {
  const x = new FormData(f);
  const baru = String(x.get('Baru') || ''), ulang = String(x.get('Ulang') || '');
  if (baru !== ulang) { toast('Kedua kata sandi baru tidak sama.', true); return; }
  const btn = f.querySelector('#sv');
  btn.disabled = true;
  try {
    await ac('aGantiSandi', String(x.get('Lama') || ''), baru);
    closeDlg();
    toast('Kata sandi Anda sudah diganti.');
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
  }
}

// ── Aksi (event delegation: tidak ada onclick inline) ───────────────────
const ACT = {
  go: el => go(el.dataset.v),
  theme: () => theme(),
  pengurus: () => pengurus(),
  logout: () => logout(),
  boot: () => boot(),
  slide: el => { showSlide(Number(el.dataset.i)); },
  pause: () => {
    paused = !paused;
    if (paused) clearInterval(timer); else startSl();
    renderDots();
  },
  copy: el => copy(el.dataset.copy),
  bukti: el => showBukti(el.dataset.tipe, el.dataset.id, el.dataset.pub === '1'),
  per: el => { S.per = el.dataset.per; renderTrans(); drawCharts(); },
  menu: () => {
    S.menu = !S.menu;
    renderAdm();
  },
  tab: el => {
    S.tab = el.dataset.tab;
    S.menu = false;
    S.qadm = '';
    renderAdm(true);
    if (S.tab === 'usr' && !S.usr) loadUsr();
    if (S.tab === 'ajuan') { S.ajuan = null; loadAjuan(); }
  },
  vf: el => { S.vf = el.dataset.vf; S.sel = null; renderAdm(); },
  sel: el => { S.sel = el.dataset.id; renderAdm(); },
  stat: el => setStatus(el.dataset.id, el.dataset.s),
  form: el => form(el.dataset.tipe, el.dataset.id || null),
  del: el => delRec(el.dataset.tipe, el.dataset.id),
  mv: el => mv(el.dataset.k, Number(el.dataset.i), Number(el.dataset.d)),
  add: el => { S.dr[el.dataset.k].push({}); renderAdm(); },
  csv: el => csv(el.dataset.tipe),
  usrForm: el => usrForm(el.dataset.id || null),
  usrReset: el => usrReset(el.dataset.id),
  gantiSandi: () => gantiSandi(),
  dlgClose: () => closeDlg(),
  dlgYes: () => {
    const fn = PEND;
    closeDlg();
    if (fn) fn();
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (fn) fn(el);
});
document.addEventListener('keydown', e => {
  const t = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && t.dataset && t.dataset.act && t.tagName !== 'BUTTON' && t.tagName !== 'INPUT') {
    e.preventDefault();
    t.click();
  }
  if (S.v === 'home' && t.closest && t.closest('#hero')) {
    if (e.key === 'ArrowRight') showSlide(si + 1);
    if (e.key === 'ArrowLeft') showSlide(si - 1);
  }
});
document.addEventListener('input', e => {
  const t = e.target, k = t.dataset ? t.dataset.in : null;
  if (!k) return;
  if (k === 'qd') { S.qd = t.value; listDon(); }
  else if (k === 'qadm') {
    S.qadm = t.value;
    const w = document.getElementById('tblwrap');
    if (w) w.innerHTML = tblHtml(S.tab === 'sal' ? 'salur' : 'donasi');
  } else if (k === 'kv' && S.dr) S.dr.kv[t.dataset.k] = t.value;
  else if (k === 'li' && S.dr) S.dr[t.dataset.k][Number(t.dataset.i)][t.dataset.f] = t.value;
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset && t.dataset.chg === 'foto') uploadFoto(t);
  else if (t.dataset && t.dataset.chg === 'dok') uploadDok(t);
  else if (t.dataset && t.dataset.chg === 'stAjuan') statusAjuan(t.dataset.id, t.value);
});
document.addEventListener('submit', e => {
  const f = e.target;
  e.preventDefault();
  const k = f.dataset ? f.dataset.form : null;
  if (k === 'login') doLogin(f);
  else if (k === 'rec') saveRec(f);
  else if (k === 'usr') saveUsr(f);
  else if (k === 'kon') saveKon(f);
  else if (k === 'lapor') saveLapor(f);
  else if (k === 'ajuan') saveAjuan(f);
  else if (k === 'sandi') saveSandi(f);
  else if (k === 'sandiSaya') saveSandiSaya(f);
});

// Jam jadwal sholat: pengingat berjalan tiap 30 detik saat beranda terbuka
boot();
})();
