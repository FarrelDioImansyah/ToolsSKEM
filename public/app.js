(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const form = $('#f');
  const MAX_FILES = 12, MAX_MB = 12, MAX_SIG_MB = 5;
  const OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  const OK_SIG = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const IDENTITY = ['nama', 'nrp', 'prodi', 'departemen'];

  let files = []; // { id, file, url, caption }
  let sig = null; // { file, url }
  let nextId = 1;
  let pdf = null; // { blob, name, url }
  let stale = true;
  let busy = false;

  /* ---------- util ---------- */
  const status = (msg, kind = '') => { const el = $('#status'); el.textContent = msg; el.className = `status ${kind}`; };
  const localIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const markStale = () => { if (pdf && !stale) status('Isian berubah. Buat pratinjau lagi untuk memperbarui PDF.'); stale = true; };

  /* ---------- data diri tersimpan di browser ---------- */
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('skem.identity') || 'null'); } catch { return null; } },
    set(v) { try { localStorage.setItem('skem.identity', JSON.stringify(v)); } catch { /* abaikan */ } },
    clear() { try { localStorage.removeItem('skem.identity'); } catch { /* abaikan */ } },
  };
  const saved = store.get();
  if (saved) IDENTITY.forEach((k) => { if (saved[k]) form[k].value = saved[k]; });
  form.tanggalPengajuan.value = localIso();

  /* ---------- lampiran ---------- */
  function renderFiles() {
    const ul = $('#files');
    ul.replaceChildren();
    files.forEach((f, i) => {
      const li = document.createElement('li');
      let thumb;
      if (f.file.type === 'application/pdf') { thumb = document.createElement('div'); thumb.className = 'thumb'; thumb.textContent = 'PDF'; }
      else { thumb = document.createElement('img'); thumb.className = 'thumb'; thumb.src = f.url; thumb.alt = ''; }
      const meta = document.createElement('div'); meta.className = 'meta';
      const name = document.createElement('div'); name.className = 'name'; name.textContent = f.file.name;
      const cap = document.createElement('input'); cap.maxLength = 80; cap.placeholder = 'Keterangan (opsional)'; cap.value = f.caption; cap.setAttribute('aria-label', `Keterangan untuk ${f.file.name}`);
      cap.addEventListener('input', () => { f.caption = cap.value; markStale(); });
      meta.append(name, cap);
      const acts = document.createElement('div'); acts.className = 'acts';
      const btn = (txt, label, fn, off) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.setAttribute('aria-label', label); b.disabled = off; b.addEventListener('click', fn); return b; };
      acts.append(
        btn('↑', 'Naikkan', () => move(i, -1), i === 0),
        btn('↓', 'Turunkan', () => move(i, 1), i === files.length - 1),
        btn('×', 'Hapus', () => remove(i), false),
      );
      li.append(thumb, meta, acts);
      ul.append(li);
    });
    hint();
  }
  function hint() {
    const per = Number(form.perPage.value);
    const n = files.length;
    $('#pageHint').textContent = n ? `${Math.ceil(n / per)} halaman lampiran${files.some((f) => f.file.type === 'application/pdf') ? ' atau lebih (PDF dihitung per halaman)' : ''}` : '';
  }
  function move(i, d) { [files[i], files[i + d]] = [files[i + d], files[i]]; renderFiles(); markStale(); }
  function remove(i) { URL.revokeObjectURL(files[i].url); files.splice(i, 1); renderFiles(); markStale(); }
  function addFiles(list) {
    const err = [];
    for (const file of list) {
      if (files.length >= MAX_FILES) { err.push(`Maksimal ${MAX_FILES} berkas.`); break; }
      if (!OK.includes(file.type)) { err.push(`“${file.name}” bukan JPG, PNG, WebP, atau PDF.`); continue; }
      if (file.size > MAX_MB * 1024 * 1024) { err.push(`“${file.name}” melebihi ${MAX_MB} MB.`); continue; }
      files.push({ id: nextId++, file, url: URL.createObjectURL(file), caption: '' });
    }
    $('#fileErr').textContent = err.join(' ');
    renderFiles(); markStale();
  }
  const picker = $('#picker'), drop = $('#drop');
  picker.addEventListener('change', () => { addFiles([...picker.files]); picker.value = ''; });
  ['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (ev) => addFiles([...ev.dataTransfer.files]));
  form.querySelectorAll('input[name=perPage]').forEach((r) => r.addEventListener('change', hint));

  /* ---------- tanda tangan ---------- */
  const sigPicker = $('#sigPicker'), sigDrop = $('#sigDrop'), sigPreview = $('#sigPreview');
  function renderSig() {
    if (sig) {
      $('#sigImg').src = sig.url;
      $('#sigName').textContent = sig.file.name;
      sigPreview.hidden = false;
      sigDrop.hidden = true;
    } else {
      $('#sigImg').removeAttribute('src');
      sigPreview.hidden = true;
      sigDrop.hidden = false;
    }
  }
  function setSig(file) {
    $('#sigErr').textContent = '';
    if (!file) return;
    if (!OK_SIG.includes(file.type)) { $('#sigErr').textContent = 'Tanda tangan harus berupa PNG, JPG, atau WebP.'; return; }
    if (file.size > MAX_SIG_MB * 1024 * 1024) { $('#sigErr').textContent = `Ukuran tanda tangan maksimal ${MAX_SIG_MB} MB.`; return; }
    if (sig) URL.revokeObjectURL(sig.url);
    sig = { file, url: URL.createObjectURL(file) };
    renderSig(); markStale();
  }
  function clearSig() {
    if (sig) URL.revokeObjectURL(sig.url);
    sig = null; $('#sigErr').textContent = '';
    renderSig(); markStale();
  }
  sigPicker.addEventListener('change', () => { setSig(sigPicker.files[0]); sigPicker.value = ''; });
  ['dragenter', 'dragover'].forEach((e) => sigDrop.addEventListener(e, (ev) => { ev.preventDefault(); sigDrop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => sigDrop.addEventListener(e, (ev) => { ev.preventDefault(); sigDrop.classList.remove('over'); }));
  sigDrop.addEventListener('drop', (ev) => setSig(ev.dataTransfer.files[0]));
  $('#sigRemove').addEventListener('click', clearSig);

  /* ---------- kirim ke server ---------- */
  function jenisValue() {
    const picked = [...document.querySelectorAll('#chips input:checked')].map((c) => c.value);
    const other = form.jenisLain.value.trim();
    return [...picked, ...(other ? [other] : [])].join(', ');
  }
  function clearErrors() {
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    document.querySelectorAll('.err[data-for]').forEach((p) => (p.textContent = ''));
  }
  function showErrors(fields) {
    let first = null;
    for (const [k, msg] of Object.entries(fields)) {
      const p = document.querySelector(`.err[data-for="${k}"]`);
      if (p) p.textContent = msg;
      const el = form.elements[k === 'jenis' ? 'jenisLain' : k];
      if (el) { el.setAttribute('aria-invalid', 'true'); first = first || el; }
    }
    if (first) first.focus();
  }
  function setBusy(v) { busy = v; ['btnPreview', 'btnPdf', 'btnDocx'].forEach((id) => ($(`#${id}`).disabled = v)); }

  async function generate(format) {
    clearErrors();
    const fd = new FormData();
    for (const k of ['nama', 'nrp', 'prodi', 'departemen', 'kegiatan', 'tanggalMulai', 'tanggalSelesai', 'lokasi', 'penyelenggara', 'tanggalPengajuan']) fd.append(k, form[k].value);
    fd.append('jenis', jenisValue());
    fd.append('perPage', form.perPage.value);
    fd.append('pernyataan', String(form.pernyataan.checked));
    fd.append('format', format);
    fd.append('captions', JSON.stringify(files.map((f) => f.caption)));
    files.forEach((f) => fd.append('lampiran', f.file, f.file.name));
    if (sig) fd.append('tandaTangan', sig.file, sig.file.name);

    const res = await fetch('/api/generate', { method: 'POST', body: fd });
    if (!res.ok) {
      let body = {};
      try { body = await res.json(); } catch { /* bukan JSON */ }
      if (body.fields) showErrors(body.fields);
      throw new Error(body.error || 'Terjadi kesalahan di server.');
    }
    return { blob: await res.blob(), name: res.headers.get('X-Filename') || `SKEM.${format}` };
  }

  function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function run(format, { download }) {
    if (busy) return;
    setBusy(true);
    status(format === 'pdf' ? 'Menyusun formulir dan mengonversi ke PDF…' : 'Menyusun dokumen Word…');
    try {
      if (format === 'pdf' && download && pdf && !stale) { save(pdf.blob, pdf.name); status('PDF diunduh.', 'ok'); return; }
      const out = await generate(format);
      if (format === 'pdf') {
        if (pdf) URL.revokeObjectURL(pdf.url);
        pdf = { ...out, url: URL.createObjectURL(out.blob) };
        stale = false;
        const view = $('#view');
        view.src = `${pdf.url}#view=FitH`;
        view.hidden = false; $('#empty').hidden = true;
        const tab = $('#openTab'); tab.href = pdf.url; tab.hidden = false;
        if (!download) status('Pratinjau siap. Periksa tiap halaman sebelum dicetak.', 'ok');
      }
      if (download) { save(out.blob, out.name); status(`${format === 'pdf' ? 'PDF' : 'Word'} diunduh.`, 'ok'); }
      if ($('#remember').checked) {
        const v = {}; IDENTITY.forEach((k) => (v[k] = form[k].value.trim())); store.set(v);
      } else store.clear();
    } catch (e) {
      status(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  $('#btnPreview').addEventListener('click', () => run('pdf', { download: false }));
  $('#btnPdf').addEventListener('click', () => run('pdf', { download: true }));
  $('#btnDocx').addEventListener('click', () => run('docx', { download: true }));
  form.addEventListener('input', markStale);
  form.addEventListener('submit', (e) => e.preventDefault());
  $('#remember').addEventListener('change', (e) => { if (!e.target.checked) store.clear(); });
  renderFiles();
})();
