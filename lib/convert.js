const { execFile } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const SOFFICE = process.env.SOFFICE_BIN || 'soffice';
const PDF_ENGINE = (process.env.PDF_ENGINE || 'auto').toLowerCase();
const MAX_PARALLEL = Number(process.env.MAX_PARALLEL || 2);
const TIMEOUT_MS = Number(process.env.CONVERT_TIMEOUT_MS || 90000);

// Antrian sederhana: konversi Office cukup berat, batasi jumlah proses paralel.
let running = 0;
const waiting = [];
const acquire = () =>
  new Promise((res) => (running < MAX_PARALLEL ? (running++, res()) : waiting.push(res)));
const release = () => {
  const next = waiting.shift();
  if (next) next();
  else running--;
};

function convertWithLibreOffice(input, dir) {
  return new Promise((resolve, reject) => {
    const profileUrl = pathToFileURL(path.join(dir, 'profile')).href;
    execFile(
      SOFFICE,
      [
        '--headless', '--norestore', '--nologo', '--nolockcheck',
        `-env:UserInstallation=${profileUrl}`, // profil unik per proses
        '--convert-to', 'pdf', '--outdir', dir, input,
      ],
      { timeout: TIMEOUT_MS, env: { ...process.env, HOME: dir } },
      (err, _out, stderr) => (err ? reject(new Error(`Konversi LibreOffice gagal: ${err.message} ${stderr}`)) : resolve()),
    );
  });
}

const WORD_VBS = `Option Explicit
Dim args, inPath, outPath, word, doc, errNum, errDesc
Set args = WScript.Arguments
inPath = args(0)
outPath = args(1)

On Error Resume Next
Set word = CreateObject("Word.Application")
If Err.Number <> 0 Then
  WScript.StdErr.WriteLine "Word.Application error (" & Err.Number & "): " & Err.Description
  WScript.Quit 1
End If

word.Visible = False
word.DisplayAlerts = 0
Set doc = word.Documents.Open(inPath, False, True)
If Err.Number = 0 Then
  doc.ExportAsFixedFormat outPath, 17
End If

errNum = Err.Number
errDesc = Err.Description
Err.Clear

If Not doc Is Nothing Then doc.Close False
If Not word Is Nothing Then word.Quit False

If errNum <> 0 Then
  WScript.StdErr.WriteLine "Word export error (" & errNum & "): " & errDesc
  WScript.Quit 1
End If
`;

async function convertWithWord(input, output, dir) {
  const scriptPath = path.join(dir, 'convert.vbs');
  await fs.writeFile(scriptPath, WORD_VBS, 'utf8');
  return new Promise((resolve, reject) => {
    execFile(
      'cscript.exe',
      ['//Nologo', '//B', scriptPath, input, output],
      { timeout: TIMEOUT_MS },
      (err, _out, stderr) => (err ? reject(new Error(`Konversi Microsoft Word gagal: ${err.message} ${stderr}`)) : resolve()),
    );
  });
}

function shouldUseWord() {
  if (PDF_ENGINE === 'word') return true;
  if (PDF_ENGINE === 'libreoffice') return false;
  return process.platform === 'win32' && !process.env.SOFFICE_BIN;
}

/** Konversi buffer .docx -> buffer .pdf memakai Microsoft Word (Windows) atau LibreOffice headless. */
async function docxToPdf(docxBuffer) {
  await acquire();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skem-'));
  try {
    const input = path.join(dir, 'in.docx');
    const output = path.join(dir, 'in.pdf');
    await fs.writeFile(input, docxBuffer);
    if (shouldUseWord()) {
      await convertWithWord(input, output, dir);
    } else {
      await convertWithLibreOffice(input, dir);
    }
    return await fs.readFile(output);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    release();
  }
}

module.exports = { docxToPdf };
