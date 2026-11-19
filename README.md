# SKEM Autofill

Web app untuk mengisi **Formulir Kegiatan SKEM PENS** (`FM.MHS.PENGAJUANSKEM.2026`, rev. 1) secara otomatis,
lengkap dengan halaman lampiran bukti kegiatan, lalu mengunduhnya sebagai **PDF** atau **Word**.
Alat bantu tidak resmi; pastikan bagian kemahasiswaan menerima formulir hasil cetak mandiri.

## Cara kerja

```
Browser (form + foto lampiran + tanda tangan) ──POST /api/generate──▶  Express
                                                          │ 1. validasi isian
                                                          │ 2. foto/PDF lampiran → JPEG (sharp, pdftoppm)
                                                          │    tanda tangan → PNG (transparansi dipertahankan)
                                                          │ 3. isi template Word (template/Formulir_SKEM_PENS.docx)
                                                          │ 4. DOCX → PDF dengan Microsoft Word (Windows)
                                                          │    atau LibreOffice headless (Linux/macOS/Docker)
Browser  ◀────────────── PDF / DOCX ─────────────────────┘
```

- Bagian **I, II, IV** terisi otomatis. **III (Verifikasi)** sengaja dikosongkan untuk diisi verifikator.
- "Halaman 1 dari N" ikut diperbarui sesuai jumlah halaman lampiran; tiap halaman lampiran berbingkai seperti template.
- Tidak ada data pribadi yang disimpan di server: berkas diproses di memori/folder sementara lalu dihapus.
  Data diri (nama, NRP, prodi, departemen) hanya diingat di `localStorage` browser, dan bisa dimatikan.

## Tanda tangan otomatis

Di bagian **IV. Pernyataan Mahasiswa** ada kotak **Tanda tangan** (opsional):

- Tarik gambar tanda tangan ke kotak, atau klik untuk memilih berkas. Format: **PNG, JPG, WebP, GIF**, maks. 5 MB.
- Gambar dipasang otomatis di ruang kosong antara "Surabaya, …" dan nama/NRP, rata tengah,
  diperkecil proporsional hingga maks. **4,6 × 1,8 cm**.
- Gunakan **PNG berlatar transparan** agar garis formulir tidak tertutup. Foto JPG dari kertas akan ikut membawa latar putihnya.
- Bila dikosongkan, ruang tanda tangan dibiarkan kosong untuk ditandatangani manual setelah dicetak.
- Gambar tanda tangan tidak disimpan, baik di server maupun di browser; unggah ulang setiap membuat formulir.

## Menjalankan lokal

Syarat: Node.js 18+, salah satu pengonversi PDF di bawah, dan **poppler-utils** (`pdftoppm`, hanya untuk lampiran PDF).

```bash
npm install
npm start            # http://localhost:3000
npm run dev          # sama, tapi otomatis restart saat kode berubah
```

### Pengonversi PDF

| Sistem | Pengonversi | Catatan |
|---|---|---|
| **Windows** | **Microsoft Word** (default) | Tidak perlu pengaturan tambahan bila Word sudah terpasang. |
| Windows | LibreOffice | Set `SOFFICE_BIN="C:\Program Files\LibreOffice\program\soffice.exe"` atau `PDF_ENGINE=libreoffice`. |
| Linux / macOS / Docker | LibreOffice | Wajib. Word tidak tersedia di luar Windows. |

Pemasangan LibreOffice:
Ubuntu/Debian: `sudo apt install libreoffice-writer poppler-utils fonts-liberation`
macOS: `brew install --cask libreoffice && brew install poppler`
Windows: `winget install TheDocumentFoundation.LibreOffice`

### Konversi lewat Microsoft Word (Windows)

`lib/convert.js` menulis skrip VBScript sementara lalu menjalankannya dengan `cscript.exe`. Skrip itu membuka dokumen
di Word secara tersembunyi (*read-only*), mengekspor ke PDF (`ExportAsFixedFormat`), lalu menutup Word lagi.
VBScript dipakai (bukan PowerShell) karena memanggil Word lewat *late binding*, sehingga tidak terganggu bila
**WPS Office** menimpa registrasi COM Word (lihat [Catatan](#catatan)).

Pengecekan cepat dari terminal:

```bash
node -e "const fs=require('fs');require('./lib/convert').docxToPdf(fs.readFileSync('template/Formulir_SKEM_PENS.docx')).then(b=>console.log('OK',b.length,'bytes'))"
```

## Deploy

Karena butuh LibreOffice, gunakan server/container biasa (bukan serverless seperti Vercel):

```bash
docker build -t skem-autofill .
docker run -p 3000:3000 skem-autofill
```

Cocok untuk Railway, Render, Fly.io, atau VPS. Paket gratis biasanya cukup, tapi konversi pertama bisa terasa lambat.
Font `Liberation Sans` (sudah ada di Dockerfile) dipakai sebagai pengganti Arial agar tata letak tidak bergeser.
Di dalam container (Linux), aplikasi otomatis memakai LibreOffice; konversi lewat Word hanya untuk Windows.

Vercel tidak cocok karena tidak bisa menjalankan LibreOffice, membatasi ukuran unggahan (±4,5 MB), dan waktu eksekusinya pendek.

## Konfigurasi (opsional, environment variable)

| Variabel | Default | Fungsi |
|---|---|---|
| `PORT` | `3000` | Port server |
| `PDF_ENGINE` | `auto` | Pengonversi PDF: `auto`, `word`, atau `libreoffice` (lihat di bawah) |
| `SOFFICE_BIN` | `soffice` | Lokasi biner LibreOffice. Di Windows, mengisinya membuat mode `auto` memakai LibreOffice |
| `MAX_PARALLEL` | `2` | Konversi PDF yang berjalan bersamaan |
| `CONVERT_TIMEOUT_MS` | `90000` | Batas waktu satu konversi |
| `RATE_LIMIT` | `20` | Permintaan per menit per IP |

Cara `PDF_ENGINE` memilih pengonversi:

| Nilai | Perilaku |
|---|---|
| `auto` | Windows tanpa `SOFFICE_BIN` → **Microsoft Word**. Selain itu → **LibreOffice**. |
| `word` | Selalu Microsoft Word (hanya berjalan di Windows dengan Word terpasang). |
| `libreoffice` | Selalu LibreOffice (`SOFFICE_BIN` atau `soffice` di PATH). |

Contoh (PowerShell):

```powershell
$env:PDF_ENGINE="libreoffice"; $env:SOFFICE_BIN="C:\Program Files\LibreOffice\program\soffice.exe"; npm start
```

## Struktur

```
server.js            API (/api/generate), validasi, rate limit, header keamanan
lib/fill.js          mengisi template DOCX (XML), tanda tangan, halaman lampiran, bingkai, jumlah halaman
lib/attachments.js   foto/PDF → JPEG (orientasi EXIF dihormati), tanda tangan → PNG, batas ukuran
lib/convert.js       DOCX → PDF via Microsoft Word (VBScript/cscript) atau LibreOffice headless, dengan antrian
lib/util.js          format tanggal Indonesia, sanitasi teks
template/            Formulir_SKEM_PENS.docx (template asli)
public/              frontend (HTML, CSS, JS tanpa build step)
```

## Bila formulir SKEM direvisi

Ganti `template/Formulir_SKEM_PENS.docx` dengan versi baru. Template saat ini hasil konversi dari PDF: kolom isian berada di
kotak teks mengambang, jadi `lib/fill.js` memilih tabel berdasarkan **urutannya** (0 header, 1–2 label verifikasi,
3–4 identitas, 5–6 kegiatan, 7–8 isian verifikasi). Jika strukturnya berubah, sesuaikan indeks di `fillTables()`.
Teks "Halaman 1 dari 2" dan pola tanda tangan juga dicocokkan dengan pola di template. Tanda tangan disisipkan dengan
mengganti 4 paragraf kosong di atas blok "(Nama Mahasiswa) (NRP Mahasiswa)"; bila pola itu berubah, sesuaikan `fillSignature()`.

## Catatan

- Foto HEIC dari iPhone belum didukung; ubah ke JPG dulu (atau atur kamera ke "Most Compatible").
- Isian terlalu panjang diperkecil otomatis, tetapi tetap ada batas karakter agar tidak keluar dari kolom.
- Validasi NRP saat ini: angka 6–15 digit (`server.js`, fungsi `validate`).
- Setelah mengubah kode server, **restart server** (atau pakai `npm run dev`). Pesan seperti "Berkas tidak dikenali"
  biasanya berarti browser sudah memuat tampilan baru, tetapi server masih menjalankan kode lama.

### Masalah konversi lewat Microsoft Word

- **Pratinjau lama lalu gagal (timeout).** Biasanya ada proses `WINWORD.EXE` yang macet di latar belakang atau dialog Word
  yang terbuka. Tutup lewat Task Manager (*Background processes* → Microsoft Word → *End task*), lalu coba lagi.
- **Yang terbuka malah WPS Office.** WPS dapat menimpa registrasi COM `Word.Application` di akun pengguna
  (`HKCU\Software\Classes\CLSID\{000209FF-0000-0000-C000-000000000046}`). Matikan opsi kompatibilitas Microsoft Office di
  *WPS Office → Configuration Tools*, atau jalankan *Quick Repair* Microsoft Office.
- **Word belum pernah dibuka sebelumnya.** Buka Word sekali secara manual untuk menyelesaikan aktivasi/dialog awal.
- Tetap bermasalah? Pakai LibreOffice: `PDF_ENGINE=libreoffice` (lihat [Konfigurasi](#konfigurasi-opsional-environment-variable)).
