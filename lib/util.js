const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));
const parts = (iso) => iso.split('-').map(Number); // [y, m, d]

function fmtDate(iso) {
  const [y, m, d] = parts(iso);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

/** "12–14 November 2026", "28 Oktober – 2 November 2026", dst. */
function fmtRange(a, b) {
  if (!b || b === a) return fmtDate(a);
  if (b < a) [a, b] = [b, a];
  const [y1, m1, d1] = parts(a);
  const [y2, m2, d2] = parts(b);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${BULAN[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1} ${BULAN[m1 - 1]} – ${d2} ${BULAN[m2 - 1]} ${y1}`;
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}

/** Bersihkan karakter kontrol, rapikan spasi, batasi panjang. */
const clean = (s, max = 200) =>
  String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const slug = (s, max = 40) =>
  String(s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, max) || 'kegiatan';

const todayIso = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); // WIB

module.exports = { BULAN, isIso, fmtDate, fmtRange, clean, slug, todayIso };
