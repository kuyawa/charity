const { Pool } = require('pg');

class Database {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString });
  }

  // ---------- users ----------

  async findByEmail(email) {
    const r = await this.pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return r.rows[0] || null;
  }

  async findByUserid(userid) {
    const r = await this.pool.query('SELECT * FROM users WHERE userid = $1', [userid]);
    return r.rows[0] || null;
  }

  async findById(id) {
    const r = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return r.rows[0] || null;
  }

  async findByToken(token) {
    if (!token) return null;
    const r = await this.pool.query('SELECT * FROM users WHERE token = $1', [token]);
    return r.rows[0] || null;
  }

  async findByResetToken(token) {
    const r = await this.pool.query('SELECT * FROM users WHERE resettoken = $1', [token]);
    return r.rows[0] || null;
  }

  async createUser({ userid, name, govid, address, email, phone, country, password }) {
    const r = await this.pool.query(
      `INSERT INTO users (userid, name, govid, address, email, phone, country, password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userid, name, govid || '', address || '', email, phone || '', country || '', password]
    );
    return r.rows[0];
  }

  async updatePassword(id, password) {
    await this.pool.query(
      'UPDATE users SET password = $1, updated = NOW() WHERE id = $2',
      [password, id]
    );
  }

  async setToken(id, token) {
    await this.pool.query(
      'UPDATE users SET token = $1, updated = NOW() WHERE id = $2',
      [token, id]
    );
  }

  async clearToken(id) {
    await this.pool.query(
      'UPDATE users SET token = NULL, updated = NOW() WHERE id = $1',
      [id]
    );
  }

  async setResetToken(id, resettoken, resetexp) {
    await this.pool.query(
      'UPDATE users SET resettoken = $1, resetexp = $2, updated = NOW() WHERE id = $3',
      [resettoken, resetexp, id]
    );
  }

  async clearResetToken(id) {
    await this.pool.query(
      'UPDATE users SET resettoken = NULL, resetexp = 0, updated = NOW() WHERE id = $1',
      [id]
    );
  }

  async countUsers() {
    const r = await this.pool.query('SELECT count(*) AS c FROM users');
    return parseInt(r.rows[0].c, 10);
  }

  async latestUsers(limit) {
    const r = await this.pool.query('SELECT * FROM users ORDER BY created DESC LIMIT $1', [limit]);
    return r.rows;
  }

  // ---------- campaigns ----------

  async createCampaign({ control, userid, title, description, goalamount, commission, bankname, bankaccount, bankholder, enddate }) {
    const r = await this.pool.query(
      `INSERT INTO campaigns (control, userid, title, description, goalamount, commission, bankname, bankaccount, bankholder, enddate, status, urgent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 0) RETURNING *`,
      [control, userid, title, description, goalamount, commission, bankname || '', bankaccount || '', bankholder || '', enddate]
    );
    return r.rows[0];
  }

  async findCampaignById(id) {
    const r = await this.pool.query(
      `SELECT c.*, u.name AS ownername, u.userid AS ownerid, u.country AS ownercountry, u.govid, u.phone
       FROM campaigns c JOIN users u ON u.userid = c.userid
       WHERE c.id = $1`,
      [id]
    );
    return r.rows[0] || null;
  }

  async findCampaignByControl(control) {
    const r = await this.pool.query(
      `SELECT c.*, u.name AS ownername, u.userid AS ownerid, u.country AS ownercountry, u.govid, u.phone
       FROM campaigns c JOIN users u ON u.userid = c.userid
       WHERE c.control = $1`,
      [control]
    );
    return r.rows[0] || null;
  }

  async updateCampaign(id, { title, description, goalamount, bankname, bankaccount, bankholder, enddate }) {
    const r = await this.pool.query(
      `UPDATE campaigns SET title = $1, description = $2, goalamount = $3, bankname = $4,
       bankaccount = $5, bankholder = $6, enddate = $7, updated = NOW()
       WHERE id = $8 RETURNING *`,
      [title, description, goalamount, bankname || '', bankaccount || '', bankholder || '', enddate, id]
    );
    return r.rows[0] || null;
  }

  async listCampaigns(filter, limit) {
    const base = `SELECT c.*, u.name AS ownername FROM campaigns c JOIN users u ON u.userid = c.userid`;
    let sql = base + ' ORDER BY c.created DESC';
    const params = [];
    if (filter === 'open')   { sql = base + ' WHERE c.status = 0 ORDER BY c.created DESC'; }
    if (filter === 'closed') { sql = base + ' WHERE c.status = 1 ORDER BY c.updated DESC'; }
    if (filter === 'urgent') { sql = base + ' WHERE c.urgent = 1 AND c.status = 0 ORDER BY c.created DESC'; }
    if (limit) { params.push(limit); sql += ' LIMIT $' + params.length; }
    const r = await this.pool.query(sql, params);
    return r.rows;
  }

  async listUrgent(limit) {
    return this.listCampaigns('urgent', limit);
  }

  async listRecentOpen(limit=8) {
    let sql = `SELECT c.*, u.name AS ownername FROM campaigns c JOIN users u ON u.userid = c.userid
                  WHERE c.status = 0 AND c.urgent = 0 ORDER BY c.created DESC LIMIT $1`;
    const params = [limit];
    const r = await this.pool.query(sql, params);
    return r.rows;
  }

  async listRecentClosed(limit) {
    return this.listCampaigns('closed', limit);
  }

  async listByUser(userid) {
    const r = await this.pool.query(
      'SELECT * FROM campaigns WHERE userid = $1 ORDER BY created DESC',
      [userid]
    );
    return r.rows;
  }

  async updateStatus(id, status) {
    await this.pool.query(
      'UPDATE campaigns SET status = $1, updated = NOW() WHERE id = $2',
      [status, id]
    );
  }

  async setUrgent(id, urgent) {
    await this.pool.query(
      'UPDATE campaigns SET urgent = $1, updated = NOW() WHERE id = $2',
      [urgent, id]
    );
  }

  async setCover(id, coverimg) {
    await this.pool.query('UPDATE campaigns SET coverimg = $1 WHERE id = $2', [coverimg, id]);
  }

  async deleteCampaign(id) {
    await this.pool.query('DELETE FROM campaigns WHERE id = $1', [id]);
  }

  async deleteProgress(id) {
    await this.pool.query('DELETE FROM progress WHERE id = $1', [id]);
  }

  async touch(id) {
    await this.pool.query('UPDATE campaigns SET updated = NOW() WHERE id = $1', [id]);
  }

  async countCampaigns() {
    const r = await this.pool.query('SELECT count(*) AS c FROM campaigns');
    return parseInt(r.rows[0].c, 10);
  }

  async countByStatus(status) {
    const r = await this.pool.query('SELECT count(*) AS c FROM campaigns WHERE status = $1', [status]);
    return parseInt(r.rows[0].c, 10);
  }

  async countUrgent() {
    const r = await this.pool.query('SELECT count(*) AS c FROM campaigns WHERE urgent = 1 AND status = 0');
    return parseInt(r.rows[0].c, 10);
  }

  async raisedByCampaigns(ids) {
    if (!ids.length) return {};
    const r = await this.pool.query(
      'SELECT campaignid, sum(amount) AS total FROM donations WHERE status = 1 AND campaignid = ANY($1) GROUP BY campaignid',
      [ids]
    );
    const map = {};
    for (const row of r.rows) map[row.campaignid] = parseFloat(row.total);
    return map;
  }

  async raisedByCampaign(id) {
    const r = await this.pool.query(
      'SELECT coalesce(sum(amount), 0) AS total FROM donations WHERE status = 1 AND campaignid = $1',
      [id]
    );
    return parseFloat(r.rows[0].total);
  }

  // ---------- campaign images ----------

  async addCampaignImage(campaignid, image, sort) {
    const r = await this.pool.query(
      'INSERT INTO campaignimages (campaignid, image, sort) VALUES ($1, $2, $3) RETURNING *',
      [campaignid, image, sort]
    );
    return r.rows[0];
  }

  async listCampaignImages(campaignid) {
    const r = await this.pool.query(
      'SELECT * FROM campaignimages WHERE campaignid = $1 ORDER BY sort ASC',
      [campaignid]
    );
    return r.rows;
  }

  async countCampaignImages(campaignid) {
    const r = await this.pool.query(
      'SELECT count(*) AS c FROM campaignimages WHERE campaignid = $1',
      [campaignid]
    );
    return parseInt(r.rows[0].c, 10);
  }

  // ---------- donations ----------

  async createDonation({ campaignid, userid, amount, bankname, confirmation, donorname, anonymous }) {
    const r = await this.pool.query(
      `INSERT INTO donations (campaignid, userid, amount, bankname, confirmation, donorname, anonymous, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0) RETURNING *`,
      [campaignid, userid, amount, bankname || '', confirmation || '', donorname || '', anonymous]
    );
    return r.rows[0];
  }

  async listDonationsByCampaign(campaignid) {
    const r = await this.pool.query(
      `SELECT d.*, u.name AS uname
       FROM donations d LEFT JOIN users u ON u.userid = d.userid
       WHERE d.campaignid = $1 ORDER BY d.created DESC`,
      [campaignid]
    );
    return r.rows;
  }

  async listDonationsByUser(userid) {
    const r = await this.pool.query(
      `SELECT d.*, c.title AS ctitle, c.coverimg AS ccover
       FROM donations d JOIN campaigns c ON c.id = d.campaignid
       WHERE d.userid = $1 ORDER BY d.created DESC`,
      [userid]
    );
    return r.rows;
  }

  async listRecentDonations(limit) {
    const r = await this.pool.query(
      `SELECT d.*, c.title AS ctitle, u.name AS uname
       FROM donations d
       LEFT JOIN campaigns c ON c.id = d.campaignid
       LEFT JOIN users u ON u.userid = d.userid
       ORDER BY d.created DESC LIMIT $1`,
      [limit]
    );
    return r.rows;
  }

  async updateDonationStatus(id, status) {
    await this.pool.query('UPDATE donations SET status = $1 WHERE id = $2', [status, id]);
  }

  async countDonations() {
    const r = await this.pool.query('SELECT count(*) AS c FROM donations');
    return parseInt(r.rows[0].c, 10);
  }

  async sumConfirmedDonations() {
    const r = await this.pool.query(
      'SELECT coalesce(sum(amount), 0) AS total FROM donations WHERE status = 1'
    );
    return parseFloat(r.rows[0].total);
  }

  // ---------- progress ----------

  async createProgress({ campaignid, title, description }) {
    const r = await this.pool.query(
      'INSERT INTO progress (campaignid, title, description) VALUES ($1, $2, $3) RETURNING *',
      [campaignid, title, description]
    );
    return r.rows[0];
  }

  async addProgressImage(progressid, image, sort) {
    await this.pool.query(
      'INSERT INTO progressimages (progressid, image, sort) VALUES ($1, $2, $3)',
      [progressid, image, sort]
    );
  }

  async listProgress(campaignid) {
    const posts = await this.pool.query(
      'SELECT * FROM progress WHERE campaignid = $1 ORDER BY created DESC',
      [campaignid]
    );
    for (const p of posts.rows) {
      const imgs = await this.pool.query(
        'SELECT * FROM progressimages WHERE progressid = $1 ORDER BY sort ASC',
        [p.id]
      );
      p.images = imgs.rows;
    }
    return posts.rows;
  }
}

module.exports = Database;
