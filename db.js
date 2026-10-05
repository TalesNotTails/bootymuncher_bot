const { Pool } = require('pg');

// Railway exposes DATABASE_URL (and PG* vars) when a PostgreSQL service is linked;
// locally we fall back to POSTGRES_* / PG* vars (docker-compose sets these).
const pool = process.env.DATABASE_URL
  ? new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'require' || process.env.DATABASE_URL.includes('rlwy.net')
      ? { rejectUnauthorized: false }
      : false,
  })
  : new Pool({
    host: process.env.PGHOST || process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.PGPORT || process.env.POSTGRES_PORT, 10) || 5432,
    user: process.env.PGUSER || process.env.POSTGRES_USER || 'bot',
    password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD,
    database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'bootymuncherbot',
  });

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_levels (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 0,
      last_xp_at TIMESTAMPTZ,
      PRIMARY KEY (user_id, guild_id)
    );
  `);
}

function xpForLevel(level) {
  return 100 * level * level;
}

async function addXp(userId, guildId, amount) {
  const result = await pool.query(
    `INSERT INTO user_levels (user_id, guild_id, xp, level, last_xp_at)
     VALUES ($1, $2, $3, 0, NOW())
     ON CONFLICT (user_id, guild_id)
     DO UPDATE SET xp = user_levels.xp + $3, last_xp_at = NOW()
     RETURNING xp, level, last_xp_at`,
    [userId, guildId, amount],
  );
  const row = result.rows[0];
  const newLevel = Math.floor(Math.sqrt(row.xp / 100));
  if (newLevel !== row.level) {
    await pool.query(
      'UPDATE user_levels SET level = $3 WHERE user_id = $1 AND guild_id = $2',
      [userId, guildId, newLevel],
    );
    return { xp: row.xp, level: newLevel, leveledUp: true };
  }
  return { xp: row.xp, level: row.level, leveledUp: false };
}

async function getUser(userId, guildId) {
  const result = await pool.query(
    'SELECT xp, level FROM user_levels WHERE user_id = $1 AND guild_id = $2',
    [userId, guildId],
  );
  return result.rows[0] || { xp: 0, level: 0 };
}

async function getLeaderboard(guildId, limit = 10) {
  const result = await pool.query(
    'SELECT user_id, xp, level FROM user_levels WHERE guild_id = $1 ORDER BY xp DESC LIMIT $2',
    [guildId, limit],
  );
  return result.rows;
}

async function getLastXpAt(userId, guildId) {
  const result = await pool.query(
    'SELECT last_xp_at FROM user_levels WHERE user_id = $1 AND guild_id = $2',
    [userId, guildId],
  );
  return result.rows[0] ? result.rows[0].last_xp_at : null;
}

module.exports = { pool, init, addXp, getUser, getLeaderboard, getLastXpAt, xpForLevel };
