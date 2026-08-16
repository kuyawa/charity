const fs = require('node:fs');
const path = require('node:path')
const util = require('node:util')

if(process.env.NODE_ENV=='development'){
    const rawEnvText = fs.readFileSync('.env', 'utf8')
    const parsedVars = util.parseEnv(rawEnvText)
    for (const key in parsedVars) {
        process.env[key] = parsedVars[key]
    }
    console.log('Env vars loaded')
}

module.exports = {
  appName:    'Charity',
  acctBank:   'Example Bank',
  acctHolder: 'Example Foundation',
  acctNumber: 'CH-000-0001',
  allowedExts: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  cookieName: 'charity_session',
  cookieSecret: process.env.COOKIE_SECRET || '0E572AFB-2D9D-4BCE-BE45-A317A7FB9185',
  databaseUrl: process.env.DATABASE_URL,
  maxCampaignImages: 10,
  port: parseInt(process.env.PORT || '3000', 10),
  postFee: 5, // 5%
  recentClosedLimit: 8,
  recentOpenLimit: 8,
  uploadLimitMB: 2, // 2 mb max
  uploadsDir: path.join(__dirname, 'public', 'uploads'),
  urgentLimit: 4
}