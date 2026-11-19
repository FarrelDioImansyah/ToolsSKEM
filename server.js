const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { buildDocx } = require('./lib/fill');
const { docxToPdf } = require('./lib/convert');
const { prepareAttachments, prepareSignature } = require('./lib/attachments');
const { isIso, fmtRange, clean, slug, todayIso } = require('./lib/util');

const PORT = process.env.PORT || 3000;
const MAX_FILES = 12;
const MAX_MB = 12;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; " +
      "img-src 'self' blob: data:; frame-src blob:; object-src blob:; script-src 'self'; base-uri 'none'; form-action 'self'",
  );
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/health', (_req, res) => res.json({ ok: true }));

const upload = multer({
  storage: multer.memoryStorage(), // tidak ada berkas pribadi yang ditulis ke disk
  limits: { files: MAX_FILES + 1, fileSize: MAX_MB * 1024 * 1024, fields: 40 },
  fileFilter: (_req, file, cb) =>
    OK_TYPES.includes(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error('Tipe berkas tidak didukung (gunakan JPG, PNG, WebP, atau PDF).'), { status: 400 })),
});

const limiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' },
});

function validate(b) {
  const errors = {};
  const need = (key, label, max) => {
    const v = clean(b[key], max);
    if (!v) errors[key] = `${label} wajib diisi.`;
    return v;
  };
  const d = {
    nama: need('nama', 'Nama lengkap', 60),
    nrp: clean(b.nrp, 20),
    prodi: need('prodi', 'Program studi', 80),
    departemen: need('departemen', 'Departemen', 80),
    kegiatan: need('kegiatan', 'Nama kegiatan', 110),
    lokasi: need('lokasi', 'Lokasi / platform', 80),
    penyelenggara: need('penyelenggara', 'Penyelenggara', 80),
    jenis: need('jenis', 'Jenis lampiran', 130),
  };
  if (!/^\d{6,15}$/.test(d.nrp)) errors.nrp = 'NRP harus berupa angka (6–15 digit).';

  const mulai = clean(b.tanggalMulai, 10);
  const selesai = clean(b.tanggalSelesai, 10);
  if (!isIso(mulai)) errors.tanggalMulai = 'Tanggal kegiatan wajib diisi.';
  else if (selesai && !isIso(selesai)) errors.tanggalSelesai = 'Tanggal selesai tidak valid.';
  else d.tanggal = fmtRange(mulai, selesai);

  const ajuan = clean(b.tanggalPengajuan, 10) || todayIso();
  if (!isIso(ajuan)) errors.tanggalPengajuan = 'Tanggal pengajuan tidak valid.';
  d.tanggalPengajuan = ajuan;

  if (b.pernyataan !== 'true') errors.pernyataan = 'Centang pernyataan bahwa data yang Anda isi benar.';
  return { d, errors };
}

const uploadFields = upload.fields([
  { name: 'lampiran', maxCount: MAX_FILES },
  { name: 'tandaTangan', maxCount: 1 },
]);

app.post('/api/generate', limiter, uploadFields, async (req, res, next) => {
  try {
    const { d, errors } = validate(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Periksa kembali isian formulir.', fields: errors });

    let captions = [];
    try { captions = JSON.parse(req.body.captions || '[]'); } catch { /* abaikan */ }
    const perPage = [1, 2, 4].includes(Number(req.body.perPage)) ? Number(req.body.perPage) : 2;
    const format = req.body.format === 'docx' ? 'docx' : 'pdf';

    const lampiranFiles = (req.files && req.files.lampiran) || [];
    const ttdFile = (req.files && req.files.tandaTangan && req.files.tandaTangan[0]) || null;

    const attachments = await prepareAttachments(lampiranFiles, Array.isArray(captions) ? captions : []);
    if (attachments.length > 24) return res.status(400).json({ error: 'Terlalu banyak halaman lampiran (maks. 24).' });
    const signature = await prepareSignature(ttdFile);

    const docx = await buildDocx(d, attachments, perPage, signature);
    const out = format === 'docx' ? docx : await docxToPdf(docx);

    const filename = `SKEM_${d.nrp}_${slug(d.kegiatan)}.${format}`;
    res.set({
      'Content-Type': format === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'X-Filename': filename,
      'Cache-Control': 'no-store',
    });
    res.send(out);
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  const map = { LIMIT_FILE_SIZE: `Ukuran tiap berkas maksimal ${MAX_MB} MB.`, LIMIT_FILE_COUNT: `Maksimal ${MAX_FILES} berkas lampiran.`, LIMIT_UNEXPECTED_FILE: 'Berkas tidak dikenali.' };
  if (err.code && map[err.code]) return res.status(413).json({ error: map[err.code] });
  if (err.status === 400) return res.status(400).json({ error: err.message });
  console.error('[error]', err.message); // tanpa data pribadi
  res.status(500).json({ error: 'Gagal membuat dokumen. Coba lagi, atau unduh versi Word.' });
});

app.listen(PORT, () => console.log(`SKEM autofill berjalan di http://localhost:${PORT}`));
