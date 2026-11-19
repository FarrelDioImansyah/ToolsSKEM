const sharp = require('sharp');
const { execFile } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { clean } = require('./util');

const MAX_PDF_PAGES = 4;

async function toJpeg(buffer, label) {
  try {
    const { data, info } = await sharp(buffer, { limitInputPixels: 100e6 })
      .rotate() // hormati orientasi EXIF dari kamera HP
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { buf: data, w: info.width, h: info.height };
  } catch {
    throw Object.assign(new Error(`Berkas "${label}" tidak bisa dibaca sebagai gambar.`), { status: 400 });
  }
}

async function pdfToImages(buffer, label) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skem-pdf-'));
  try {
    await fs.writeFile(path.join(dir, 'a.pdf'), buffer);
    await new Promise((resolve, reject) =>
      execFile('pdftoppm', ['-jpeg', '-r', '130', '-l', String(MAX_PDF_PAGES), path.join(dir, 'a.pdf'), path.join(dir, 'p')],
        { timeout: 60000 }, (e) => (e ? reject(e) : resolve())));
    const names = (await fs.readdir(dir)).filter((n) => n.startsWith('p') && n.endsWith('.jpg')).sort();
    if (!names.length) throw new Error('kosong');
    return await Promise.all(names.map(async (n) => fs.readFile(path.join(dir, n))));
  } catch {
    throw Object.assign(new Error(`PDF "${label}" tidak bisa diproses.`), { status: 400 });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** files: hasil multer (memory), captions: array string sejajar dengan files. */
async function prepareAttachments(files, captions) {
  const out = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const label = clean(f.originalname, 60);
    const caption = clean(captions[i], 80);
    if (f.mimetype === 'application/pdf') {
      const pages = await pdfToImages(f.buffer, label);
      for (let p = 0; p < pages.length; p++) {
        const img = await toJpeg(pages[p], label);
        out.push({ ...img, caption: caption ? (pages.length > 1 ? `${caption} (hal. ${p + 1})` : caption) : '' });
      }
    } else {
      out.push({ ...(await toJpeg(f.buffer, label)), caption });
    }
  }
  return out;
}

async function prepareSignature(file) {
  if (!file) return null;
  const label = clean(file.originalname, 60);
  if (file.mimetype === 'application/pdf') {
    throw Object.assign(new Error('Tanda tangan harus berupa gambar (PNG, JPG, atau WebP).'), { status: 400 });
  }
  try {
    const { data, info } = await sharp(file.buffer, { limitInputPixels: 40e6 })
      .rotate()
      .resize({ width: 900, height: 450, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    return { buf: data, w: info.width, h: info.height };
  } catch {
    throw Object.assign(new Error(`Tanda tangan "${label}" tidak bisa dibaca sebagai gambar.`), { status: 400 });
  }
}

module.exports = { prepareAttachments, prepareSignature };
