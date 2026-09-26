const $ = (s) => document.querySelector(s);
let token = localStorage.getItem('ad_token') || null;
let me = null; // {id, name, role}
let office = { name: 'Kantor', lat: 0, lng: 0, radiusMeters: 150 };
let activeTab = 'absen';
let pendingPhotoBlob = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}));
}

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch('/api' + path, { ...opts, headers });
  let data = null;
  try { data = await res.json(); } catch (e) { /* csv/text responses handled by caller */ }
  if (!res.ok) throw new Error((data && data.error) || 'Terjadi kesalahan');
  return data;
}

function fmtTime(iso) { return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }
function fmtDateShort(iso) { return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function thisMonth() { return new Date().toISOString().slice(0, 7); }

function getPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('GPS tidak tersedia di perangkat ini'));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => rej(new Error('Gagal mengambil lokasi: ' + e.message)),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });
}

/* ---------------- AUTH ---------------- */
let authMode = 'login';
function setupAuthScreen() {
  $('#tabLogin').onclick = () => { authMode = 'login'; $('#tabLogin').classList.add('active'); $('#tabRegister').classList.remove('active'); $('#registerFields').classList.add('hidden'); $('#authSubmit').textContent = 'Masuk'; };
  $('#tabRegister').onclick = () => { authMode = 'register'; $('#tabRegister').classList.add('active'); $('#tabLogin').classList.remove('active'); $('#registerFields').classList.remove('hidden'); $('#authSubmit').textContent = 'Daftar'; };
  $('#authSubmit').onclick = async () => {
    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    const msg = $('#authMsg');
    msg.textContent = '';
    if (!email || !password) { msg.textContent = 'Email dan password wajib diisi'; return; }
    $('#authSubmit').disabled = true;
    try {
      let data;
      if (authMode === 'login') {
        data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      } else {
        const name = $('#regName').value.trim();
        if (!name) { msg.textContent = 'Nama wajib diisi'; $('#authSubmit').disabled = false; return; }
        data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
      }
      token = data.token; me = data.user;
      localStorage.setItem('ad_token', token);
      await startApp();
    } catch (e) {
      msg.textContent = e.message;
    } finally {
      $('#authSubmit').disabled = false;
    }
  };
}

function showAuthScreen() {
  $('#authScreen').classList.remove('hidden');
  $('#frame').classList.add('hidden');
}

function logout() {
  token = null; me = null;
  localStorage.removeItem('ad_token');
  showAuthScreen();
}

/* ---------------- BOOTSTRAP ---------------- */
async function startApp() {
  try {
    me = await api('/auth/me');
  } catch (e) {
    return logout();
  }
  office = await api('/settings/office');
  $('#authScreen').classList.add('hidden');
  $('#frame').classList.remove('hidden');
  $('#roleBadge').textContent = me.role === 'admin' ? 'Admin/HR' : 'Karyawan';
  $('#hdrSub').textContent = (me.name || 'Selamat datang') + (me.role === 'admin' ? ' · panel admin aktif' : '');
  renderNav();
  await switchTab('absen');
}

function renderNav() {
  const tabs = [
    { id: 'absen', ic: '📍', label: 'Absen' },
    { id: 'cuti', ic: '🗓️', label: 'Cuti' },
    { id: 'timesheet', ic: '📝', label: 'Timesheet' },
    { id: 'laporan', ic: '📊', label: 'Laporan' },
  ];
  if (me.role === 'admin') tabs.push({ id: 'admin', ic: '⚙️', label: 'Admin' });
  $('#navInner').innerHTML = tabs
    .map((t) => `<button data-tab="${t.id}" class="${activeTab === t.id ? 'active' : ''}"><span class="ic">${t.ic}</span>${t.label}</button>`)
    .join('');
  document.querySelectorAll('nav.bottom button').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
}

async function switchTab(tab) {
  activeTab = tab; renderNav();
  const main = $('#main');
  main.innerHTML = '<div class="card">Memuat data...</div>';
  try {
    if (tab === 'absen') await renderAbsen();
    else if (tab === 'cuti') await renderCuti();
    else if (tab === 'timesheet') await renderTimesheet();
    else if (tab === 'laporan') await renderLaporan();
    else if (tab === 'admin') await renderAdmin();
  } catch (e) {
    main.innerHTML = `<div class="card"><div class="err">${e.message}</div></div>`;
  }
}

/* ---------------- ABSEN ---------------- */
async function renderAbsen() {
  const todays = await api('/attendance/today');
  const lastIn = todays.find((r) => r.type === 'in');
  const lastOut = todays.find((r) => r.type === 'out');
  const nextType = lastIn && !lastOut ? 'out' : 'in';
  const label = nextType === 'in' ? 'Absen Masuk' : 'Absen Pulang';
  $('#main').innerHTML = `
    <div class="card" style="text-align:center;">
      <div class="muted">${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
      <button id="clockBtn" class="clock-btn" style="background:${nextType === 'in' ? 'var(--primary)' : 'var(--danger)'};">
        <span style="font-size:26px;">${nextType === 'in' ? '🟢' : '🔴'}</span>${label}
      </button>
      <div class="muted" style="margin-top:6px;">Lokasi &amp; selfie akan diverifikasi otomatis</div>
      <div id="clockMsg"></div>
    </div>
    <div class="card">
      <h2 class="sec">Status Hari Ini</h2>
      <div class="row-between"><span>Jam Masuk</span><b>${lastIn ? fmtTime(lastIn.ts) : '-'}</b></div>
      <div class="row-between" style="margin-top:6px;"><span>Jam Pulang</span><b>${lastOut ? fmtTime(lastOut.ts) : '-'}</b></div>
      ${lastIn ? `<div style="margin-top:8px;"><span class="status-pill ${lastIn.within_zone ? 'pill-ok' : 'pill-bad'}">${lastIn.within_zone ? 'Dalam zona kantor' : 'Di luar zona kantor'}</span></div>` : ''}
    </div>
    <div class="card">
      <h2 class="sec">Zona Kantor</h2>
      <div class="muted">${office.name} · radius ${office.radiusMeters} m</div>
    </div>
  `;
  $('#clockBtn').onclick = () => openCaptureModal(nextType);
}

function openCaptureModal(type) {
  pendingPhotoBlob = null;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h2 class="sec">${type === 'in' ? 'Absen Masuk' : 'Absen Pulang'} · Verifikasi Wajah</h2>
      <video id="cam" autoplay playsinline muted></video>
      <canvas id="camCanvas" class="hidden"></canvas>
      <img id="camShot" class="hidden" style="width:100%;border-radius:12px;">
      <div id="capMsg" class="err"></div>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-ghost btn-sm" id="closeCap" style="flex:1;">Batal</button>
        <button class="btn btn-primary btn-sm" id="shotBtn" style="flex:2;">📸 Ambil Foto</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  let stream;
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
    .then((s) => { stream = s; $('#cam').srcObject = s; })
    .catch(() => { $('#capMsg').textContent = 'Kamera tidak dapat diakses. Periksa izin kamera browser.'; });

  function stopCam() { if (stream) stream.getTracks().forEach((t) => t.stop()); }
  $('#closeCap').onclick = () => { stopCam(); bg.remove(); };
  $('#shotBtn').onclick = async () => {
    if (pendingPhotoBlob) {
      stopCam(); bg.remove();
      await doClock(type, pendingPhotoBlob);
      return;
    }
    const video = $('#cam'), canvas = $('#camCanvas');
    canvas.width = video.videoWidth || 360; canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      pendingPhotoBlob = blob;
      $('#cam').classList.add('hidden'); canvas.classList.add('hidden');
      const img = $('#camShot'); img.src = URL.createObjectURL(blob); img.classList.remove('hidden');
      $('#shotBtn').textContent = '✅ Kirim Absen';
    }, 'image/jpeg', 0.85);
  };
}

async function doClock(type, photoBlob) {
  const msg = $('#clockMsg');
  msg.innerHTML = '<div class="muted">Mengambil lokasi...</div>';
  try {
    const pos = await getPosition();
    const fd = new FormData();
    fd.append('type', type);
    fd.append('lat', pos.lat);
    fd.append('lng', pos.lng);
    if (photoBlob) fd.append('photo', photoBlob, 'selfie.jpg');
    const result = await api('/attendance/clock', { method: 'POST', body: fd });
    msg.innerHTML = `<div class="status-pill ${result.within_zone ? 'pill-ok' : 'pill-warn'}">Berhasil · ${result.within_zone ? 'dalam zona (' + result.distance_m + 'm)' : 'di luar zona (' + result.distance_m + 'm)'}</div>`;
    await renderAbsen();
  } catch (e) {
    msg.innerHTML = `<div class="err">${e.message}</div>`;
  }
}

/* ---------------- CUTI ---------------- */
function leaveStatusPill(s) {
  if (s === 'approved') return '<span class="status-pill pill-ok">Disetujui</span>';
  if (s === 'rejected') return '<span class="status-pill pill-bad">Ditolak</span>';
  return '<span class="status-pill pill-warn">Menunggu</span>';
}
async function renderCuti() {
  const mine = await api('/leave/me');
  $('#main').innerHTML = `
    <div class="card">
      <h2 class="sec">Ajukan Cuti / Izin</h2>
      <div class="field"><label>Jenis</label>
        <select id="lvType"><option value="Cuti Tahunan">Cuti Tahunan</option><option value="Sakit">Sakit</option><option value="Izin">Izin</option></select>
      </div>
      <label>Mulai</label><input type="date" id="lvStart" value="${todayStr()}">
      <label>Selesai</label><input type="date" id="lvEnd" value="${todayStr()}">
      <label>Alasan</label><textarea id="lvReason" rows="2" placeholder="Contoh: keperluan keluarga"></textarea>
      <div id="lvMsg" class="err"></div>
      <button class="btn btn-primary" style="margin-top:12px;" id="lvSubmit">Kirim Pengajuan</button>
    </div>
    <div class="card">
      <h2 class="sec">Riwayat Pengajuan Saya</h2>
      ${mine.length ? mine.map((l) => `
        <div class="list-item">
          <div class="row-between"><b>${l.type}</b>${leaveStatusPill(l.status)}</div>
          <div class="muted">${l.start_date} s/d ${l.end_date}</div>
          <div class="muted">${l.reason || ''}</div>
        </div>`).join('') : '<div class="muted">Belum ada pengajuan.</div>'}
    </div>
  `;
  $('#lvSubmit').onclick = async () => {
    const startDate = $('#lvStart').value, endDate = $('#lvEnd').value;
    if (!startDate || !endDate) { $('#lvMsg').textContent = 'Tanggal wajib diisi'; return; }
    $('#lvSubmit').disabled = true; $('#lvSubmit').textContent = 'Mengirim...';
    try {
      await api('/leave', { method: 'POST', body: JSON.stringify({ type: $('#lvType').value, startDate, endDate, reason: $('#lvReason').value.trim() }) });
      await renderCuti();
    } catch (e) {
      $('#lvMsg').textContent = e.message; $('#lvSubmit').disabled = false; $('#lvSubmit').textContent = 'Kirim Pengajuan';
    }
  };
}

/* ---------------- TIMESHEET ---------------- */
async function renderTimesheet() {
  const sheets = await api('/timesheet/me');
  $('#main').innerHTML = `
    <div class="card">
      <h2 class="sec">Catat Aktivitas Harian</h2>
      <label>Tanggal</label><input type="date" id="tsDate" value="${todayStr()}">
      <label>Deskripsi Tugas</label><textarea id="tsTask" rows="2" placeholder="Contoh: kunjungan klien area Bandung"></textarea>
      <label>Jam Kerja</label><input type="number" id="tsHours" min="0" max="24" step="0.5" value="8">
      <div id="tsMsg" class="err"></div>
      <button class="btn btn-primary" style="margin-top:12px;" id="tsSubmit">Simpan Timesheet</button>
    </div>
    <div class="card">
      <h2 class="sec">Riwayat Timesheet</h2>
      ${sheets.length ? sheets.map((s) => `
        <div class="list-item">
          <div class="row-between"><b>${fmtDateShort(s.date + 'T00:00:00')}</b><span class="muted">${s.hours} jam</span></div>
          <div class="muted">${s.task}</div>
        </div>`).join('') : '<div class="muted">Belum ada catatan.</div>'}
    </div>
  `;
  $('#tsSubmit').onclick = async () => {
    const task = $('#tsTask').value.trim();
    if (!task) { $('#tsMsg').textContent = 'Deskripsi tugas wajib diisi'; return; }
    $('#tsSubmit').disabled = true; $('#tsSubmit').textContent = 'Menyimpan...';
    try {
      await api('/timesheet', { method: 'POST', body: JSON.stringify({ date: $('#tsDate').value, task, hours: parseFloat($('#tsHours').value) || 0 }) });
      await renderTimesheet();
    } catch (e) {
      $('#tsMsg').textContent = e.message; $('#tsSubmit').disabled = false; $('#tsSubmit').textContent = 'Simpan Timesheet';
    }
  };
}

/* ---------------- LAPORAN ---------------- */
async function downloadCSV(path, filename) {
  const res = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) { alert('Gagal mengunduh laporan'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
async function renderLaporan() {
  const month = thisMonth();
  const mine = await api('/reports/me?month=' + month);
  let adminBlock = '';
  if (me.role === 'admin') {
    const all = await api('/reports/all?month=' + month);
    adminBlock = `
      <div class="card">
        <div class="row-between"><h2 class="sec" style="margin:0;">Rekap Semua Karyawan (bulan ini)</h2>
          <button class="btn btn-ghost btn-sm" id="expAll">Unduh CSV</button></div>
        ${all.employees.length ? all.employees.map((e) => `
          <div class="list-item row-between">
            <span>${e.name}</span>
            <span class="muted">${e.hadir || 0} hadir · ${e.luar_zona || 0} di luar zona</span>
          </div>`).join('') : '<div class="muted">Belum ada data.</div>'}
      </div>`;
  }
  $('#main').innerHTML = `
    <div class="card">
      <h2 class="sec">Rekap Saya · ${new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</h2>
      <div class="row-between"><span>Hari Hadir</span><b>${mine.hadirDays}</b></div>
      <div class="row-between" style="margin-top:6px;"><span>Absen di Luar Zona</span><b>${mine.luarZona}</b></div>
      <div class="row-between" style="margin-top:6px;"><span>Cuti/Izin Disetujui</span><b>${mine.cutiDisetujui}</b></div>
      <button class="btn btn-ghost btn-sm" style="margin-top:12px;" id="expMine">Unduh Riwayat Saya (CSV)</button>
    </div>
    ${adminBlock}
  `;
  $('#expMine').onclick = () => downloadCSV(`/reports/export?month=${month}&scope=me`, `absensi-saya-${month}.csv`);
  const expAll = $('#expAll');
  if (expAll) expAll.onclick = () => downloadCSV(`/reports/export?month=${month}&scope=all`, `rekap-semua-${month}.csv`);
}

/* ---------------- ADMIN ---------------- */
async function renderAdmin() {
  const pending = await api('/leave/all?status=pending');
  $('#main').innerHTML = `
    <div class="card">
      <h2 class="sec">Pengaturan Zona Kantor</h2>
      <label>Nama Lokasi</label><input id="ofName" value="${office.name}">
      <label>Latitude</label><input id="ofLat" type="number" step="0.000001" value="${office.lat}">
      <label>Longitude</label><input id="ofLng" type="number" step="0.000001" value="${office.lng}">
      <label>Radius (meter)</label><input id="ofRad" type="number" value="${office.radiusMeters}">
      <div id="ofMsg" class="err"></div>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-ghost btn-sm" style="flex:1;" id="ofGps">Pakai Lokasi Saya</button>
        <button class="btn btn-primary btn-sm" style="flex:1;" id="ofSave">Simpan</button>
      </div>
    </div>
    <div class="card">
      <h2 class="sec">Persetujuan Cuti/Izin (${pending.length} menunggu)</h2>
      ${pending.length ? pending.map((l) => `
        <div class="list-item">
          <div class="row-between"><b>${l.user_name}</b>${leaveStatusPill(l.status)}</div>
          <div class="muted">${l.type} · ${l.start_date} s/d ${l.end_date}</div>
          <div class="muted">${l.reason || ''}</div>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button class="btn btn-primary btn-sm" style="flex:1;" data-approve="${l.id}">Setujui</button>
            <button class="btn btn-out btn-sm" style="flex:1;" data-reject="${l.id}">Tolak</button>
          </div>
        </div>`).join('') : '<div class="muted">Tidak ada pengajuan menunggu.</div>'}
    </div>
  `;
  $('#ofGps').onclick = async () => {
    $('#ofMsg').textContent = 'Mengambil lokasi...';
    try { const p = await getPosition(); $('#ofLat').value = p.lat.toFixed(6); $('#ofLng').value = p.lng.toFixed(6); $('#ofMsg').textContent = ''; }
    catch (e) { $('#ofMsg').textContent = e.message; }
  };
  $('#ofSave').onclick = async () => {
    try {
      office = await api('/settings/office', { method: 'PUT', body: JSON.stringify({ name: $('#ofName').value, lat: parseFloat($('#ofLat').value), lng: parseFloat($('#ofLng').value), radiusMeters: parseInt($('#ofRad').value) || 100 }) });
      $('#ofMsg').style.color = 'var(--success)'; $('#ofMsg').textContent = 'Tersimpan.';
    } catch (e) { $('#ofMsg').textContent = e.message; }
  };
  document.querySelectorAll('[data-approve]').forEach((b) => (b.onclick = async () => { await api(`/leave/${b.dataset.approve}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) }); await renderAdmin(); }));
  document.querySelectorAll('[data-reject]').forEach((b) => (b.onclick = async () => { await api(`/leave/${b.dataset.reject}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) }); await renderAdmin(); }));
}

/* ---------------- INIT ---------------- */
setupAuthScreen();
$('#logoutBtn').onclick = logout;
if (token) { startApp().catch(showAuthScreen); } else { showAuthScreen(); }
