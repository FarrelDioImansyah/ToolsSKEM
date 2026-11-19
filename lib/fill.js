/**
 * Mengisi template Formulir_SKEM_PENS.docx.
 *
 * Template ini hasil konversi dari PDF: kolom isian berada di dalam kotak teks
 * mengambang (setiap kotak ada dua salinan: mc:Choice dan mc:Fallback), jadi
 * pengisian dilakukan langsung di XML. Urutan tabel di document.xml:
 *   0 header | 1-2 label Verifikasi | 3-4 isian Identitas | 5-6 isian Kegiatan
 *   7-8 isian Verifikasi (sengaja DIKOSONGKAN, diisi verifikator)
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { fmtDate } = require('./util');

const TEMPLATE = fs.readFileSync(path.join(__dirname, '..', 'template', 'Formulir_SKEM_PENS.docx'));
const CM = 360000; // EMU per cm
const CONTENT_W = 10178; // lebar area lampiran (twips), menyisakan ruang dari bingkai

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Perkecil font bila teks panjang supaya tidak membuat baris melebar keluar kotak.
const sizeFor = (len, multiline) => (len <= 56 ? 22 : multiline ? (len <= 120 ? 20 : 18) : len <= 64 ? 20 : len <= 74 ? 18 : 16);

const run = (text, { sz = 22, bold = false } = {}) =>
  `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${bold ? '<w:b/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

function valueParagraph(text, multiline) {
  return `<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:spacing w:before="0" w:after="0"/><w:ind w:left="70"/></w:pPr>${run(text, { sz: sizeFor(text.length, multiline) })}</w:p>`;
}

function fillTables(xml, d) {
  const sets = {
    3: [d.nama, d.nrp, d.prodi, d.departemen],
    4: [d.nama, d.nrp, d.prodi, d.departemen],
    5: [d.kegiatan, d.tanggal, d.lokasi, d.penyelenggara, d.jenis],
    6: [d.kegiatan, d.tanggal, d.lokasi, d.penyelenggara, d.jenis],
  };
  let ti = 0;
  return xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    const values = sets[ti++];
    if (!values) return tbl;
    let ri = 0;
    return tbl.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (row) => {
      const rowIdx = ri++;
      const value = values[rowIdx];
      if (value === undefined) return row;
      let ci = 0;
      return row.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (tc) => {
        if (ci++ !== 2) return tc;
        return tc.replace(/<w:p>[\s\S]*<\/w:p>/, valueParagraph(value, rowIdx === 4 && values.length === 5));
      });
    });
  });
}

function signatureParagraph(sig) {
  const k = Math.min(4.6 / sig.w, 1.8 / sig.h);
  const cx = Math.round(sig.w * k * CM);
  const cy = Math.round(sig.h * k * CM);
  return `<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:spacing w:before="60" w:after="60"/><w:ind w:left="1500" w:right="1500"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1999" name="Tanda Tangan"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1999" name="ttd.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdTtd"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function fillSignature(xml, d, signature, zip, rels) {
  const namePara = (t, extra = '') =>
    `<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:ind w:left="1500" w:right="1500"/><w:jc w:val="center"/></w:pPr>${run(t, { bold: extra === 'b' })}</w:p>`;
  let out = xml.replace(/………………………/g, esc(d.tanggalPengajuan));
  const emptyGap = '(?:<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:rPr><w:rFonts w:ascii="Times New Roman"/><w:sz w:val="22"/></w:rPr></w:pPr></w:p>){4}';
  const nameBlock = '<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:spacing w:line="247" w:lineRule="auto"/><w:ind w:left="3866" w:right="4223"/>[\\s\\S]*?</w:p>';

  if (signature) {
    zip.file('word/media/ttd.png', signature.buf, { createFolders: false });
    rels.push('<Relationship Id="rIdTtd" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/ttd.png"/>');
    out = out.replace(
      new RegExp(`${emptyGap}(${nameBlock})`, 'g'),
      signatureParagraph(signature) + namePara(d.nama) + namePara(d.nrp),
    );
  } else {
    out = out.replace(new RegExp(nameBlock, 'g'), namePara(d.nama) + namePara(d.nrp));
  }
  return out;
}

/* ---------- Lampiran (halaman 2 dst.) ---------- */

const SLOTS = {
  1: { cols: 1, w: 17.0, h: 20.3 },
  2: { cols: 1, w: 17.0, h: 9.9 },
  4: { cols: 2, w: 8.2, h: 9.9 },
};

const titlePara = (text) =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="120"/><w:ind w:left="0" w:right="0" w:firstLine="0"/><w:jc w:val="center"/></w:pPr>${run(text, { bold: true })}</w:p>`;

function imageParagraph(rId, n, w, h, caption) {
  const cx = Math.round(w * CM), cy = Math.round(h * CM);
  const img = `<w:p><w:pPr><w:spacing w:before="100" w:after="30" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:right="0" w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${2000 + n}" name="Lampiran ${n}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${2000 + n}" name="lampiran${n}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  const cap = caption
    ? `<w:p><w:pPr><w:spacing w:before="0" w:after="60" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:right="0" w:firstLine="0"/><w:jc w:val="center"/></w:pPr>${run(caption, { sz: 18 })}</w:p>`
    : '';
  return img + cap;
}

function pageTable(items, slot) {
  const colW = Math.floor(CONTENT_W / slot.cols);
  const rows = [];
  for (let i = 0; i < items.length; i += slot.cols) {
    const cells = [];
    for (let c = 0; c < slot.cols; c++) {
      const it = items[i + c];
      const body = it
        ? (() => {
            const k = Math.min(slot.w / it.w, slot.h / it.h);
            return imageParagraph(it.rId, it.n, it.w * k, it.h * k, it.caption);
          })()
        : '<w:p/>';
      cells.push(`<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/></w:tcPr>${body}</w:tc>`);
    }
    rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.join('')}</w:tr>`);
  }
  const grid = Array.from({ length: slot.cols }, () => `<w:gridCol w:w="${colW}"/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${colW * slot.cols}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows.join('')}</w:tbl>`;
}

/** Salinan paragraf bingkai hitam halaman 2, agar halaman lampiran lanjutan juga berbingkai. */
function frameClone(framePara, k) {
  const id = 3000 + k;
  return framePara
    .replace(/id="13"/g, `id="${id}"`)
    .replace(/Graphic 13/g, `Graphic ${id}`)
    .replace(/docshape12/g, `docshape${id}`)
    .replace('<w:pStyle w:val="BodyText"/>', '<w:pStyle w:val="BodyText"/><w:pageBreakBefore/>');
}

function buildAttachments(xml, attachments, perPage, zip, rels) {
  const slot = SLOTS[perPage] || SLOTS[2];
  const per = perPage in SLOTS ? perPage : 2;

  // paragraf bingkai (milik halaman 2 di template)
  const at = xml.indexOf('name="Graphic 13"');
  const pStart = xml.lastIndexOf('<w:p>', at);
  const framePara = xml.slice(pStart, xml.indexOf('</w:p>', at) + 6);

  const items = attachments.map((a, i) => {
    const n = i + 1;
    const rId = `rIdLamp${n}`;
    zip.file(`word/media/lampiran${n}.jpeg`, a.buf, { createFolders: false });
    rels.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/lampiran${n}.jpeg"/>`);
    return { ...a, n, rId };
  });

  let out = '';
  for (let p = 0, k = 0; p < items.length; p += per, k++) {
    if (k > 0) out += frameClone(framePara, k) + titlePara('Lampiran Bukti Kegiatan (lanjutan)');
    out += pageTable(items.slice(p, p + per), slot);
  }
  if (out) out += '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>';

  const idx = xml.lastIndexOf('<w:sectPr>'); // sectPr terakhir (section lampiran)
  return { xml: xml.slice(0, idx) + out + xml.slice(idx), pages: Math.max(1, Math.ceil(items.length / per)) };
}

/**
 * data: { nama, nrp, prodi, departemen, kegiatan, tanggal, lokasi, penyelenggara, jenis, tanggalPengajuan(ISO) }
 * attachments: [{ buf, w, h, caption }]
 * signature: { buf, w, h } | null
 */
async function buildDocx(data, attachments = [], perPage = 2, signature = null) {
  const zip = await JSZip.loadAsync(TEMPLATE);

  let xml = await zip.file('word/document.xml').async('string');
  const d = { ...data, tanggalPengajuan: fmtDate(data.tanggalPengajuan) };
  const rels = [];

  xml = fillTables(xml, d);
  xml = fillSignature(xml, d, signature, zip, rels);

  const res = buildAttachments(xml, attachments, perPage, zip, rels);
  xml = res.xml;

  // "Halaman 1 dari 2" -> jumlah halaman sebenarnya
  xml = xml.replace(/(<w:t>1 dari<\/w:t><\/w:r><w:r>[\s\S]*?<w:t> <\/w:t><\/w:r><w:r>[\s\S]*?<w:t>)2(<\/w:t>)/, `$1${1 + res.pages}$2`);

  zip.file('word/document.xml', xml, { createFolders: false }); // tanpa entri folder di ZIP
  if (signature) {
    const ctPath = '[Content_Types].xml';
    const ct = await zip.file(ctPath).async('string');
    if (!ct.includes('Extension="png"')) {
      zip.file(ctPath, ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'), { createFolders: false });
    }
  }
  if (rels.length) {
    const relPath = 'word/_rels/document.xml.rels';
    const cur = await zip.file(relPath).async('string');
    zip.file(relPath, cur.replace('</Relationships>', rels.join('') + '</Relationships>'), { createFolders: false });
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { buildDocx };
