const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

function randomNumber() {
  return crypto.randomInt(100000000,999999999);
}

// parse a YYYY-MM-DD date input as local midnight so it round-trips correctly
function parseDateInput(str) {
  return new Date(String(str || '') + 'T00:00:00');
}

function money(value, language) {
  const n = Number(value || 0);
  const parts = n.toFixed(2).split('.');
  const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, language === 'es' ? '.' : ',');
  const dec = language === 'es' ? ',' : '.';
  return '$' + int;
  //return '$' + int + dec + parts[1];
}

function daysLeft(enddate) {
  return Math.max(0, Math.ceil((Number(enddate) - Date.now()) / 86000000));
}

function fmtDate(ts, language) {
  const locale = language === 'es' ? 'es-ES' : 'en-US';
  return new Date(Number(ts)).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase();
}

// local YYYY-MM-DD for date input values
function fmtDateInput(ts) {
  const d = new Date(Number(ts));
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// normalize uploaded files to an array
function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

// validate uploaded images without saving (throws on invalid files)
function validateImages(files) {
  const list = toArray(files);
  for (const file of list) {
    const ext = path.extname(file.name || '').toLowerCase();
    if (!config.allowedExts.includes(ext)) {
      const err = new Error('type');
      err.code = 'UPLOAD_TYPE';
      throw err;
    }
    if (file.size > config.uploadLimitMB * 1024 * 1024) {
      const err = new Error('size');
      err.code = 'UPLOAD_SIZE';
      throw err;
    }
  }
  return list;
}

// save uploaded images, returns array of relative paths under /uploads
// Filenames are kept short (max 20 chars) to fit the image columns (varchar(20)).
async function saveImages(files, folder, control) {
  const list = toArray(files);
  const saved = [];
  let index = 0;
  const stamp = Date.now().toString(36).slice(-4);
  for (const file of list) {
    const ext = path.extname(file.name || '').toLowerCase();
    const dir = path.join(config.uploadsDir, folder);
    //fs.mkdirSync(dir, { recursive: true });
    const name = `${control}-${stamp}${index++}${ext}`;
    await file.mv(path.join(dir, name));
    saved.push(name);
  }
  //console.log('IMGS', saved)
  return saved;
}

// Countries of the Americas with localized names (Spanish + English).
// Codes are stored in the database; names are shown in the user's language.
const COUNTRIES = {
  es: {
    AG: 'Antigua y Barbuda',
    AR: 'Argentina',
    BS: 'Bahamas',
    BB: 'Barbados',
    BZ: 'Belice',
    BO: 'Bolivia',
    BR: 'Brasil',
    CA: 'Canadá',
    CL: 'Chile',
    CO: 'Colombia',
    CR: 'Costa Rica',
    CU: 'Cuba',
    DM: 'Dominica',
    DO: 'República Dominicana',
    EC: 'Ecuador',
    SV: 'El Salvador',
    GD: 'Granada',
    GT: 'Guatemala',
    GY: 'Guyana',
    HT: 'Haití',
    HN: 'Honduras',
    JM: 'Jamaica',
    MX: 'México',
    NI: 'Nicaragua',
    PA: 'Panamá',
    PY: 'Paraguay',
    PE: 'Perú',
    KN: 'San Cristóbal y Nieves',
    LC: 'Santa Lucía',
    VC: 'San Vicente y las Granadinas',
    SR: 'Surinam',
    TT: 'Trinidad y Tobago',
    US: 'Estados Unidos',
    UY: 'Uruguay',
    VE: 'Venezuela'
  },
  en: {
    AG: 'Antigua and Barbuda',
    AR: 'Argentina',
    BS: 'Bahamas',
    BB: 'Barbados',
    BZ: 'Belize',
    BO: 'Bolivia',
    BR: 'Brazil',
    CA: 'Canada',
    CL: 'Chile',
    CO: 'Colombia',
    CR: 'Costa Rica',
    CU: 'Cuba',
    DM: 'Dominica',
    DO: 'Dominican Republic',
    EC: 'Ecuador',
    SV: 'El Salvador',
    GD: 'Grenada',
    GT: 'Guatemala',
    GY: 'Guyana',
    HT: 'Haiti',
    HN: 'Honduras',
    JM: 'Jamaica',
    MX: 'Mexico',
    NI: 'Nicaragua',
    PA: 'Panama',
    PY: 'Paraguay',
    PE: 'Peru',
    KN: 'Saint Kitts and Nevis',
    LC: 'Saint Lucia',
    VC: 'Saint Vincent and the Grenadines',
    SR: 'Suriname',
    TT: 'Trinidad and Tobago',
    US: 'United States',
    UY: 'Uruguay',
    VE: 'Venezuela'
  }
};

function getCountry(ctr, lng) {
  const language = String(lng || 'es').toLowerCase();
  const country = String(ctr || '').toUpperCase();
  return (COUNTRIES[language] || COUNTRIES.es)[country] || '';
}

// full localized country list (code + name), sorted by localized name
function getCountries(lng) {
  const language = String(lng || 'es').toLowerCase();
  const table = COUNTRIES[language] || COUNTRIES.es;
  return Object.keys(table)
    .map((code) => ({ code, name: table[code] }))
    .sort((a, b) => a.name.localeCompare(b.name, language === 'es' ? 'es' : 'en'));
}

module.exports = {
  daysLeft,
  escapeRegex,
  fmtDate,
  fmtDateInput,
  getCountries,
  getCountry,
  money,
  parseDateInput,
  randomNumber,
  randomToken,
  saveImages,
  sha256,
  toArray,
  validateImages
}