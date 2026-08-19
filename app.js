const path = require('node:path');
const express = require('express');
const ejs = require('ejs');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const config = require('./config');
const utils = require('./utils');
const package = require('./package.json');
//const appVersion = package.version.replaceAll('.','');

const lang = require('./lang');
const Database = require('./database');
const db = new Database(config.databaseUrl);

const ONEDAY   =  24 * 60 * 60 * 1000;
const ONEMONTH =  30 * ONEDAY;
const ONEYEAR  = 365 * ONEDAY;

const app = express();
app.engine('html', ejs.renderFile);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

// ---- static folders ----
//app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'+appVersion)));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.use('/media', express.static(path.join(__dirname, 'public', 'media')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ---- core middleware ----
app.use(cookieParser(config.cookieSecret));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(fileUpload({
  limits: { fileSize: config.uploadLimitMB * 1024 * 1024 * 2 },
  abortOnLimit: false,
  safeFileNames: true,
  preserveExtension: true
}));

// guarantee req.body is always an object
app.use((req, res, next) => {
  req.body = req.body || {};
  next();
});

// ---- language + user middleware ----
app.use((req, res, next) => {
  let code = req.cookies.lang;
  if (code !== 'es' && code !== 'en') {
    const header = req.headers['accept-language'] || '';
    code = /(^|,)\s*en(\b|-)/i.test(header) ? 'en' : 'es';
  }
  const translations = lang[code] || lang.es;
  res.locals.appName = config.appName;
  res.locals.language = code;
  res.locals.lang = translations;
  //res.locals.version = appVersion;
  res.locals.money = (v) => utils.money(v, code);
  res.locals.fmtDate = (ts) => utils.fmtDate(ts, code);
  res.locals.fmtDateInput = (ts) => utils.fmtDateInput(ts);
  res.locals.getCountry = (c) => utils.getCountry(c);
  res.locals.t = (key) => translations[key] || lang.es[key] || key;
  res.locals.path = req.path;
  res.locals.query = req.query;
  res.locals.currentYear = new Date().getFullYear();
  res.locals.bankName = config.acctBank;
  res.locals.bankAcct = config.acctNumber;
  res.locals.bankHolder = config.acctHolder;
  res.locals.postFee = config.postFee;
  next();
});

app.use(async (req, res, next) => {
  try {
    const token = req.cookies[config.cookieName];
    let user = null;
    if (token) {
      user = await db.findByToken(token);
    }
    res.locals.user = user;
    req.locals = req.locals || {};
    req.locals.user = user;
    res.locals.isAdmin = !!(user && user.isadmin);
  } catch (e) {
    console.error('user middleware error', e.message);
  }
  next();
});

function requireAuth(req, res, next) {
  if (!req.locals.user) {
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.locals.user) return res.redirect('/login?next=/dashboard');
  if (!req.locals.user.isadmin) return res.status(403).render('403', { title: res.locals.t('err_forbidden'), extraCss: ['error.css'] });
  next();
}

// enrich campaign rows with raised amounts and derived values
async function enrichCampaigns(campaigns, language) {
  if (!campaigns.length) return campaigns;
  const raised = await db.raisedByCampaigns(campaigns.map((c) => c.id));
  const nowTs = Date.now();
  for (const c of campaigns) {
    c.raised = raised[c.id] || 0;
    c.raisedmoney = utils.money(c.raised, language);
    c.goalmoney = utils.money(c.goalamount, language);
    c.percent = c.goalamount > 0 ? Math.min(100, Math.round((c.raised / c.goalamount) * 100)) : 0;
    c.daysleft = utils.daysLeft(c.enddate);
    c.createdate = utils.fmtDate(c.created, language);
    c.enddatefmt = utils.fmtDate(c.enddate, language);
    if (c.status === 0 && c.enddate <= nowTs) {
      await db.updateStatus(c.id, 1);
      c.status = 1;
    }
    c.isclosed = c.status === 1;
  }
  return campaigns;
}

// auto-close an expired campaign before showing it
async function maybeClose(campaign) {
  if (campaign && campaign.status === 0 && campaign.enddate <= Date.now()) {
    await db.updateStatus(campaign.id, 1);
    campaign.status = 1;
  }
  return campaign;
}

// ============================================================
// PUBLIC ROUTES
// ============================================================

app.get('/', async (req, res, next) => {
  try {
    const [urgent, recentOpen, recentClosed, countCampaigns, countDonations, countUsers, totalRaised] =
      await Promise.all([
        db.listUrgent(config.urgentLimit),
        db.listRecentOpen(config.recentOpenLimit),
        db.listRecentClosed(config.recentClosedLimit),
        db.countCampaigns(),
        db.countDonations(),
        db.countUsers(),
        db.sumConfirmedDonations()
      ]);
    await Promise.all([
      enrichCampaigns(urgent, res.locals.language),
      enrichCampaigns(recentOpen, res.locals.language),
      enrichCampaigns(recentClosed, res.locals.language)
    ]);
    res.render('index', {
      title: res.locals.t('hero_title'),
      extraCss: ['index.css'],
      urgent,
      recentOpen,
      recentClosed,
      stats: {
        campaigns: countCampaigns,
        donors: countUsers,
        raised: utils.money(totalRaised, res.locals.language)
      }
    });
  } catch (e) { next(e); }
});

// ============================================================
// AUTH ROUTES
// ============================================================

app.get('/register', (req, res) => {
  if (req.locals.user) return res.redirect('/');
  res.render('register', {
    title: res.locals.t('auth_register_title'),
    extraCss: ['auth.css'],
    extraScripts: ['auth.js'],
    form: {},
    err: req.query.err || ''
  });
});

app.post('/register', async (req, res, next) => {
  try {
    const body = req.body;
    const form = {
      name: String(body.name || '').trim(),
      userid: String(body.userid || '').trim().toLowerCase(),
      govid: String(body.govid || '').trim(),
      address: String(body.address || '').trim(),
      email: String(body.email || '').trim().toLowerCase(),
      phone: String(body.phone || '').trim(),
      country: String(body.country || '').trim(),
      password: String(body.password || ''),
      confirm: String(body.confirm || '')
    };
    if (!form.name || !form.userid || !form.email || !form.password) {
      return res.render('register', { title: res.locals.t('auth_register_title'), extraCss: ['auth.css'], extraScripts: ['auth.js'], form, err: 'auth_required' });
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(form.userid)) {
      return res.render('register', { title: res.locals.t('auth_register_title'), extraCss: ['auth.css'], extraScripts: ['auth.js'], form, err: 'auth_bad_userid' });
    }
    if (form.password !== form.confirm) {
      return res.render('register', { title: res.locals.t('auth_register_title'), extraCss: ['auth.css'], extraScripts: ['auth.js'], form, err: 'auth_pass_mismatch' });
    }
    if (form.password.length < 6) {
      return res.render('register', { title: res.locals.t('auth_register_title'), extraCss: ['auth.css'], extraScripts: ['auth.js'], form, err: 'auth_pass_short' });
    }
    const existingEmail = await db.findByEmail(form.email);
    if (existingEmail) {
      return res.render('register', { title: res.locals.t('auth_register_title'), extraCss: ['auth.css'], extraScripts: ['auth.js'], form, err: 'auth_email_used' });
    }
    const existingUser = await db.findByUserid(form.userid);
    if (existingUser) {
      return res.render('register', { title: res.locals.t('auth_register_title'), extraCss: ['auth.css'], extraScripts: ['auth.js'], form, err: 'auth_user_used' });
    }
    const user = await db.createUser({ ...form, password: utils.sha256(form.password) });
    const token = utils.randomToken();
    await db.setToken(user.id, token);
    res.cookie(config.cookieName, token, { httpOnly: true, sameSite: 'lax', maxAge: ONEMONTH });
    res.redirect('/');
  } catch (e) { next(e); }
});

app.get('/login', (req, res) => {
  if (req.locals.user) return res.redirect('/');
  res.render('login', {
    title: res.locals.t('auth_login_title'),
    extraCss: ['auth.css'],
    extraScripts: ['auth.js'],
    form: {},
    err: req.query.err || ''
  });
});

app.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const nextPath = req.body.next || '/';
    const user = await db.findByEmail(email);
    if (!user || user.password !== utils.sha256(password)) {
      console.log('NO')
      return res.render('login', {
        title: res.locals.t('auth_login_title'),
        extraCss: ['auth.css'],
        extraScripts: ['auth.js'],
        form: { email },
        err: 'auth_invalid'
      });
    }
    console.log('OK')
    const token = utils.randomToken();
    await db.setToken(user.id, token);
    res.cookie(config.cookieName, token, { httpOnly: true, sameSite: 'lax', maxAge: ONEMONTH });
    res.redirect(nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/');
  } catch (e) { next(e); }
});

app.get('/logout', async (req, res, next) => {
  try {
    const token = req.cookies[config.cookieName];
    if (token) {
      const user = await db.findByToken(token);
      if (user) await db.clearToken(user.id);
    }
    res.clearCookie(config.cookieName);
    res.redirect('/');
  } catch (e) { next(e); }
});

app.get('/forgot', (req, res) => {
  res.render('forgot', {
    title: res.locals.t('auth_forgot_title'),
    extraCss: ['auth.css'],
    extraScripts: ['auth.js'],
    sent: false
  });
});

app.post('/forgot', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await db.findByEmail(email);
    let resetLink = '';
    if (user) {
      const token = utils.randomToken();
      await db.setResetToken(user.id, token, Date.now() + 3600000);
      resetLink = '/reset?token=' + token;
    }
    // For now there is no mailer: the link is shown directly on screen.
    res.render('forgot', {
      title: res.locals.t('auth_forgot_title'),
      extraCss: ['auth.css'],
      extraScripts: ['auth.js'],
      sent: true,
      resetLink,
      email
    });
  } catch (e) { next(e); }
});

app.get('/reset', async (req, res, next) => {
  try {
    const token = String(req.query.token || '');
    const user = token ? await db.findByResetToken(token) : null;
    if (!user || user.resetexp < Date.now()) {
      return res.render('reset', { title: res.locals.t('auth_reset_title'), extraCss: ['auth.css'], extraScripts: ['auth.js'], valid: false, done: false, token: '' });
    }
    res.render('reset', { title: res.locals.t('auth_reset_title'), extraCss: ['auth.css'], extraScripts: ['auth.js'], valid: true, done: false, token });
  } catch (e) { next(e); }
});

app.post('/reset', async (req, res, next) => {
  try {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    const confirm = String(req.body.confirm || '');
    const user = token ? await db.findByResetToken(token) : null;
    if (!user || user.resetexp < Date.now()) {
      return res.render('reset', { title: res.locals.t('auth_reset_title'), extraCss: ['auth.css'], extraScripts: ['auth.js'], valid: false, done: false, token: '', err: 'auth_token_invalid' });
    }
    if (password.length < 6 || password !== confirm) {
      return res.render('reset', { title: res.locals.t('auth_reset_title'), extraCss: ['auth.css'], extraScripts: ['auth.js'], valid: true, done: false, token, err: password !== confirm ? 'auth_pass_mismatch' : 'auth_pass_short' });
    }
    await db.updatePassword(user.id, utils.sha256(password));
    await db.clearResetToken(user.id);
    res.render('reset', { title: res.locals.t('auth_reset_title'), extraCss: ['auth.css'], extraScripts: ['auth.js'], valid: false, token: '', done: true });
  } catch (e) { next(e); }
});

// language switcher
app.get('/lang/:code', (req, res) => {
  const code = req.params.code === 'en' ? 'en' : 'es';
  const back = req.get('Referer') || '/';
  res.cookie('lang', code, { maxAge: ONEYEAR, sameSite: 'lax' });
  res.redirect(back.startsWith('/') && !back.startsWith('//') ? back : '/');
});


// ============================================================
// FUNDRAISER ROUTES
// ============================================================

app.get('/campaigns', async (req, res, next) => {
  try {
    const filter = ['open', 'closed', 'urgent'].includes(req.query.f) ? req.query.f : 'all';
    let campaigns = await db.listCampaigns(filter, null);
    campaigns = await enrichCampaigns(campaigns, res.locals.language);
    res.render('campaigns', {
      title: res.locals.t('list_title'),
      extraCss: ['campaigns.css'],
      filter,
      campaigns
    });
  } catch (e) { next(e); }
});

app.get('/campaign/:control', async (req, res, next) => {
  try {
    const control = req.params.control;
    if (!control){ return res.status(404).render('404', { title: res.locals.t('err_404_title'), extraCss: ['error.css'] }); }
    let campaign = await db.findCampaignByControl(control);
    if (!campaign){ return res.status(404).render('404', { title: res.locals.t('err_404_title'), extraCss: ['error.css'] }); }
    const id = campaign.id
    campaign = await maybeClose(campaign);
    const [images, donations, progress, raised] = await Promise.all([
      db.listCampaignImages(id),
      db.listDonationsByCampaign(id),
      db.listProgress(id),
      db.raisedByCampaign(id)
    ]);
    //console.log('DONATIONS', donations)
    campaign.raised = raised;
    campaign.raisedmoney = utils.money(raised, res.locals.language);
    campaign.goalmoney = utils.money(campaign.goalamount, res.locals.language);
    campaign.percent = campaign.goalamount > 0 ? Math.min(100, Math.round((raised / campaign.goalamount) * 100)) : 0;
    campaign.daysleft = utils.daysLeft(campaign.enddate);
    campaign.createdate = utils.fmtDate(campaign.created, res.locals.language);
    campaign.enddatefmt = utils.fmtDate(campaign.enddate, res.locals.language);
    campaign.isclosed = campaign.status === 1;
    campaign.iscancelled = campaign.status === 2;
    campaign.isinvalid = campaign.status === 4;

    //const confirmed = donations.filter((d) => d.status === 1);
    const isOwner = res.locals.user && res.locals.user.userid === campaign.userid;

    res.render('campaign', {
      title: campaign.title,
      extraCss: ['campaign.css'],
      extraScripts: ['campaign.js'],
      campaign,
      images,
      donations,
      progress,
      isOwner,
      donated: req.query.donated === '1',
      created: req.query.created === '1',
      progressed: req.query.progressed === '1',
      updated: req.query.updated === '1'
    });
  } catch (e) { next(e); }
});

app.post('/campaign/:control/donate', async (req, res, next) => {
  try {
    const control = req.params.control
    const user = req.locals.user;
    if (!user) return res.redirect('/login?next=/campaign/' + control);
    const campaign = await db.findCampaignByControl(control);
    if (!campaign) return res.status(404).render('404', { title: res.locals.t('err_404_title'), extraCss: ['error.css'] });
    const id = campaign.id
    await maybeClose(campaign);
    if (campaign.status !== 0) {
      return res.redirect('/campaign/' + control + '?err=campaign_closed');
    }
    if (campaign.userid === user.userid) {
      return res.redirect('/campaign/' + control + '?err=campaign_own');
    }
    const amount = parseFloat(req.body.amount);
    const bankname = String(req.body.bankname || '').trim();
    const confirmation = String(req.body.confirmation || '').trim();
    const donorname = String(req.body.donorname || '').trim();
    const anonymous = req.body.anonymous == 'true' || !donorname;
    if (!amount || amount <= 0) return res.redirect('/campaign/' + control + '?err=amount');
    if (!bankname || !confirmation) return res.redirect('/campaign/' + control + '?err=bad_request');
    await db.createDonation({
      campaignid: id,
      userid: user.userid,
      amount,
      bankname,
      confirmation,
      donorname: anonymous ? '' : donorname,
      anonymous
    });
    await db.touch(id);
    res.redirect('/campaign/' + control + '?donated=1');
  } catch (e) { next(e); }
});

app.get('/create', requireAuth, (req, res) => {
  const control = utils.randomNumber()
  res.render('create', {
    title: res.locals.t('create_title'),
    extraCss: ['create.css'],
    extraScripts: ['create.js'],
    form: {control},
    err: ''
  });
});

app.post('/create', requireAuth, async (req, res, next) => {
  try {
    const body = req.body;
    console.log('BODY', body)
    const control = body.control;
    const form = {
      title: String(body.title || '').trim(),
      description: String(body.description || '').trim(),
      goalamount: parseFloat(body.goalamount),
      bankname: String(body.bankname || '').trim(),
      bankaccount: String(body.bankaccount || '').trim(),
      bankholder: String(body.bankholder || '').trim(),
      paypal: String(body.paypal || '').trim(),
      zelle: String(body.zelle || '').trim(),
      binance: String(body.binance || '').trim(),
      cryptonet: String(body.cryptonet || '').trim(),
      cryptocoin: String(body.cryptocoin || '').trim(),
      cryptoaddr: String(body.cryptoaddr || '').trim(),
      enddate: String(body.enddate || '')
    };
    const confirmFee = body.fee === '1';
    let err = '';
    if (!form.title || !form.description || !form.goalamount || !form.enddate) err = 'auth_required';
    if (!err && !confirmFee) err = 'create_fee_missing';
    if (!err && (!form.bankname || !form.bankaccount || !form.bankholder)) err = 'create_bank_required';
    if (!err && (form.goalamount <= 0)) err = 'err_amount';
    if (err) {
      return res.render('create', {
        title: res.locals.t('create_title'),
        extraCss: ['create.css'],
        extraScripts: ['create.js'],
        form,
        err
      });
    }
    const endTs = utils.parseDateInput(form.enddate);
    if (!endTs || endTs <= Date.now()) {
      return res.render('create', {
        title: res.locals.t('create_title'),
        extraCss: ['create.css'],
        extraScripts: ['create.js'],
        form,
        err: 'create_bad_date'
      });
    }
    const files = utils.toArray(req.files && req.files.images);
    if (files.length > config.maxCampaignImages) {
      return res.render('create', {
        title: res.locals.t('create_title'),
        extraCss: ['create.css'],
        extraScripts: ['create.js'],
        form,
        err: 'err_upload_max'
      });
    }
    try {
      utils.validateImages(files);
    } catch (e) {
      return res.render('create', {
        title: res.locals.t('create_title'),
        extraCss: ['create.css'],
        extraScripts: ['create.js'],
        form,
        err: e.code === 'UPLOAD_TYPE' ? 'err_upload_type' : 'err_upload_size'
      });
    }
    const campaign = await db.createCampaign({
      control,
      userid: req.locals.user.userid,
      title: form.title,
      description: form.description,
      goalamount: form.goalamount,
      commission: 0, // for now
      bankname: form.bankname,
      bankaccount: form.bankaccount,
      bankholder: form.bankholder,
      paypal: form.paypal || null,
      zelle: form.zelle || null,
      binance: form.binance || null,
      cryptonet: form.cryptonet || null,
      cryptocoin: form.cryptocoin || null,
      cryptoaddr: form.cryptoaddr || null,
      enddate: endTs
    });
    try {
      const saved = await utils.saveImages(files, 'campaigns', control);
      for (let i = 0; i < saved.length; i++) {
        await db.addCampaignImage(campaign.id, saved[i], i + 1);
      }
      if (saved.length) await db.setCover(campaign.id, saved[0]);
    } catch (e) {
      await db.deleteCampaign(campaign.id);
      throw e;
    }
    res.redirect('/campaign/' + control + '?created=1');
  } catch (e) {
    if (e.code === 'UPLOAD_TYPE' || e.code === 'UPLOAD_SIZE') {
      return res.render('create', { title: res.locals.t('create_title'), extraCss: ['create.css'], extraScripts: ['create.js'], form: req.body, err: e.code === 'UPLOAD_TYPE' ? 'err_upload_type' : 'err_upload_size' });
    }
    next(e);
  }
});

// ---- edit campaign (fundraiser) ----

async function canManageCampaign(campaign, user) {
  return !!(campaign && user && (campaign.userid === user.userid || user.isadmin));
}

app.get('/campaign/:control/edit', requireAuth, async (req, res, next) => {
  try {
    const control = req.params.control;
    const campaign = await db.findCampaignByControl(control);
    if (!campaign) return res.status(404).render('404', { title: res.locals.t('err_404_title'), extraCss: ['error.css'] });
    if (!await canManageCampaign(campaign, req.locals.user)) {
      return res.status(403).render('403', { title: res.locals.t('err_forbidden'), extraCss: ['error.css'] });
    }
    const images = await db.listCampaignImages(campaign.id);
    res.render('edit', {
      title: res.locals.t('edit_title'),
      extraCss: ['create.css'],
      extraScripts: ['create.js'],
      control,
      campaign,
      images,
      form: {
        title: campaign.title,
        description: campaign.description,
        goalamount: campaign.goalamount,
        enddate: utils.fmtDateInput(campaign.enddate),
        bankname: campaign.bankname,
        bankaccount: campaign.bankaccount,
        bankholder: campaign.bankholder,
        paypal: campaign.paypal,
        zelle: campaign.zelle,
        binance: campaign.binance,
        cryptonet: campaign.cryptonet,
        cryptocoin: campaign.cryptocoin,
        cryptoaddr: campaign.cryptoaddr
      },
      err: ''
    });
  } catch (e) { next(e); }
});

app.post('/campaign/:control/edit', requireAuth, async (req, res, next) => {
  try {
    const control = req.params.control;
    const campaign = await db.findCampaignByControl(control);
    if (!campaign) return res.status(404).render('404', { title: res.locals.t('err_404_title'), extraCss: ['error.css'] });
    if (!await canManageCampaign(campaign, req.locals.user)) {
      return res.status(403).render('403', { title: res.locals.t('err_forbidden'), extraCss: ['error.css'] });
    }

    const body = req.body;
    const form = {
      title: String(body.title || '').trim(),
      description: String(body.description || '').trim(),
      goalamount: parseFloat(body.goalamount),
      bankname: String(body.bankname || '').trim(),
      bankaccount: String(body.bankaccount || '').trim(),
      bankholder: String(body.bankholder || '').trim(),
      paypal: String(body.paypal || '').trim(),
      zelle: String(body.zelle || '').trim(),
      binance: String(body.binance || '').trim(),
      cryptonet: String(body.cryptonet || '').trim(),
      cryptocoin: String(body.cryptocoin || '').trim(),
      cryptoaddr: String(body.cryptoaddr || '').trim(),
      enddate: String(body.enddate || '')
    };

    let err = '';
    if (!form.title || !form.description || !form.goalamount || !form.enddate) err = 'auth_required';
    if (!err && (!form.bankname || !form.bankaccount || !form.bankholder)) err = 'create_bank_required';
    if (!err && (form.goalamount <= 0)) err = 'err_amount';

    const endTs = utils.parseDateInput(form.enddate);
    if (!err && (isNaN(endTs.getTime()))) err = 'create_bad_date';
    // keep the closing date in the future while the campaign is still open
    if (!err && campaign.status === 0 && endTs <= Date.now()) err = 'create_bad_date';

    const existingImages = await db.listCampaignImages(campaign.id);
    const files = utils.toArray(req.files && req.files.images);
    if (!err && files.length + existingImages.length > config.maxCampaignImages) err = 'err_upload_max';

    if (err) {
      return res.render('edit', {
        title: res.locals.t('edit_title'),
        extraCss: ['create.css'],
        extraScripts: ['create.js'],
        control,
        campaign,
        images: existingImages,
        form,
        err
      });
    }

    try {
      utils.validateImages(files);
    } catch (e) {
      return res.render('edit', {
        title: res.locals.t('edit_title'),
        extraCss: ['create.css'],
        extraScripts: ['create.js'],
        control,
        campaign,
        images: existingImages,
        form,
        err: e.code === 'UPLOAD_TYPE' ? 'err_upload_type' : 'err_upload_size'
      });
    }

    await db.updateCampaign(campaign.id, {
      title: form.title,
      description: form.description,
      goalamount: form.goalamount,
      bankname: form.bankname,
      bankaccount: form.bankaccount,
      bankholder: form.bankholder,
      paypal: form.paypal || null,
      zelle: form.zelle || null,
      binance: form.binance || null,
      cryptonet: form.cryptonet || null,
      cryptocoin: form.cryptocoin || null,
      cryptoaddr: form.cryptoaddr || null,
      enddate: endTs
    });

    if (files.length) {
      const saved = await utils.saveImages(files, 'campaigns', control);
      let sort = existingImages.length;
      for (let i = 0; i < saved.length; i++) {
        await db.addCampaignImage(campaign.id, saved[i], sort + i + 1);
      }
      if (!campaign.coverimg && saved.length) await db.setCover(campaign.id, saved[0]);
    }

    res.redirect('/campaign/' + control + '?updated=1');
  } catch (e) {
    if (e.code === 'UPLOAD_TYPE' || e.code === 'UPLOAD_SIZE') {
      return res.render('edit', { title: res.locals.t('edit_title'), extraCss: ['create.css'], extraScripts: ['create.js'], control, campaign, images: [], form: req.body, err: e.code === 'UPLOAD_TYPE' ? 'err_upload_type' : 'err_upload_size' });
    }
    next(e);
  }
});

app.get('/mycampaigns', requireAuth, async (req, res, next) => {
  try {
    const user = req.locals.user;
    let campaigns = await db.listByUser(user.userid);
    campaigns = await enrichCampaigns(campaigns, res.locals.language);
    const rows = [];
    for (const c of campaigns) {
      const donations = await db.listDonationsByCampaign(c.id);
      rows.push({ campaign: c, donations });
    }
    res.render('mycampaigns', {
      title: res.locals.t('my_title'),
      extraCss: ['mycampaigns.css'],
      rows
    });
  } catch (e) { next(e); }
});

app.post('/campaign/:control/close', requireAuth, async (req, res, next) => {
  try {
    const control = req.params.control
    const campaign = await db.findCampaignByControl(control);
    if (!campaign) return res.status(404).render('404', { title: res.locals.t('err_404_title'), extraCss: ['error.css'] });
    if (campaign.userid !== req.locals.user.userid && !req.locals.user.isadmin) {
      return res.status(403).render('403', { title: res.locals.t('err_forbidden'), extraCss: ['error.css'] });
    }
    await db.updateStatus(campaign.id, 1);
    res.redirect('/mycampaigns');
  } catch (e) { next(e); }
});

app.get('/campaign/:control/progress', requireAuth, async (req, res, next) => {
  try {
    const control = req.params.control
    const campaign = await db.findCampaignByControl(control);
    if (!campaign) return res.status(404).render('404', { title: res.locals.t('err_404_title'), extraCss: ['error.css'] });
    if (campaign.userid !== req.locals.user.userid && !req.locals.user.isadmin) {
      return res.status(403).render('403', { title: res.locals.t('err_forbidden'), extraCss: ['error.css'] });
    }
    res.render('progress', {
      title: res.locals.t('prog_title'),
      extraCss: ['create.css'],
      extraScripts: ['create.js'],
      campaign,
      err: ''
    });
  } catch (e) { next(e); }
});

app.post('/campaign/:control/progress', requireAuth, async (req, res, next) => {
  try {
    const control = req.params.control
    const campaign = await db.findCampaignByControl(control);
    if (!campaign) return res.status(404).render('404', { title: res.locals.t('err_404_title'), extraCss: ['error.css'] });
    if (campaign.userid !== req.locals.user.userid && !req.locals.user.isadmin) {
      return res.status(403).render('403', { title: res.locals.t('err_forbidden'), extraCss: ['error.css'] });
    }
    const id = campaign.id;
    const title = String(req.body.title || '').trim();
    const text = String(req.body.text || '').trim();
    if (!title || !text) {
      return res.render('progress', { title: res.locals.t('prog_title'), extraCss: ['create.css'], extraScripts: ['create.js'], campaign, err: 'auth_required' });
    }
    const post = await db.createProgress({ campaignid: id, title, description: text });
    const files = utils.toArray(req.files && req.files.images);
    try {
      utils.validateImages(files);
      const saved = await utils.saveImages(files, 'progress', control);
      for (let i = 0; i < saved.length; i++) {
        await db.addProgressImage(post.id, saved[i], i + 1);
      }
    } catch (e) {
      await db.deleteProgress(post.id);
      if (e.code === 'UPLOAD_TYPE' || e.code === 'UPLOAD_SIZE') {
        return res.render('progress', { title: res.locals.t('prog_title'), extraCss: ['create.css'], extraScripts: ['create.js'], campaign, err: e.code === 'UPLOAD_TYPE' ? 'err_upload_type' : 'err_upload_size' });
      }
      throw e;
    }
    await db.touch(id);
    res.redirect('/campaign/' + control + '?progressed=1');
  } catch (e) { next(e); }
});

app.post('/campaign/:control/donation/:did/status', requireAuth, async (req, res, next) => {
  try {
    const control = req.params.control
    const did = parseInt(req.params.did, 10);
    const status = parseInt(req.body.status, 10);
    const campaign = await db.findCampaignByControl(control);
    if (!campaign) return res.status(404).render('404', { title: res.locals.t('err_404_title'), extraCss: ['error.css'] });
    if (campaign.userid !== req.locals.user.userid && !req.locals.user.isadmin) {
      return res.status(403).render('403', { title: res.locals.t('err_forbidden'), extraCss: ['error.css'] });
    }
    if (![1, 2, 3, 4].includes(status)) return res.status(400).render('400', { title: res.locals.t('err_bad_request'), extraCss: ['error.css'] });
    await db.updateDonationStatus(did, status);
    res.redirect('/mycampaigns');
  } catch (e) { next(e); }
});

// ============================================================
// ADMIN ROUTES
// ============================================================

app.get('/dashboard', requireAdmin, async (req, res, next) => {
  try {
    const [campaigns, donations, users, countCampaigns, openCount, closedCount, urgentCount, countDonations, countUsers, totalRaised] =
      await Promise.all([
        db.listCampaigns('all', 10),
        db.listRecentDonations(10),
        db.latestUsers(10),
        db.countCampaigns(),
        db.countByStatus(0),
        db.countByStatus(1),
        db.countUrgent(),
        db.countDonations(),
        db.countUsers(),
        db.sumConfirmedDonations()
      ]);
    await enrichCampaigns(campaigns, res.locals.language);
    res.render('dashboard', {
      title: res.locals.t('dash_title'),
      extraCss: ['dashboard.css'],
      campaigns,
      donations,
      users,
      stats: {
        campaigns: countCampaigns,
        open: openCount,
        closed: closedCount,
        urgent: urgentCount,
        donations: countDonations,
        users: countUsers,
        raised: utils.money(totalRaised, res.locals.language)
      }
    });
  } catch (e) { next(e); }
});

app.post('/admin/campaign/:id/deactivate', requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.updateStatus(id, 4); // invalid
    res.redirect('/dashboard');
  } catch (e) { next(e); }
});

app.post('/admin/campaign/:id/activate', requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.updateStatus(id, 0); // open
    res.redirect('/dashboard');
  } catch (e) { next(e); }
});

app.post('/admin/campaign/:id/urgent', requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const campaign = await db.findCampaignById(id);
    if (campaign && campaign.status === 0) await db.setUrgent(id, 1);
    res.redirect('/dashboard');
  } catch (e) { next(e); }
});

app.post('/admin/campaign/:id/unurgent', requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.setUrgent(id, 0);
    res.redirect('/dashboard');
  } catch (e) { next(e); }
});

// ============================================================
// ERROR HANDLING
// ============================================================

app.use((req, res) => {
  res.status(404).render('404', { title: res.locals.t('err_404_title'), extraCss: ['error.css'] });
});

app.use((err, req, res, next) => {
  console.error('server error:', err);
  if (res.headersSent) return next(err);
  res.status(500).render('500', { title: res.locals.t('err_server'), extraCss: ['error.css'] });
});

app.listen(config.port, () => {
  console.log('App is running...');
});

module.exports = app;
