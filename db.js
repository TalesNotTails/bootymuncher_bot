const { Pool, Client } = require('pg');

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
    
    CREATE OR REPLACE FUNCTION notify_new_top_user()
    RETURNS TRIGGER AS $$
    DECLARE 
      payload JSON;
      prev_top_user_id TEXT;
      prev_top_user_level INTEGER;
    BEGIN

      SELECT user_id, level INTO prev_top_user_id, prev_top_user_level
      FROM user_levels
      WHERE guild_id = NEW.guild_id AND user_id <> NEW.user_id 
      ORDER BY level DESC
      LIMIT 1;

      payload = json_build_object(
        'guild_id', NEW.guild_id,
        'user_id', NEW.user_id,
        'level', NEW.level,
        'old_level', OLD.level,
        'prev_user_id', prev_top_user_id
      );

      IF NEW.level > OLD.level
        AND prev_top_user_level IS NOT NULL
        AND prev_top_user_level > 0
        AND NEW.level > prev_top_user_level
        AND OLD.level <= prev_top_user_level THEN
       PERFORM pg_notify('new_top_user', payload::text);
      END IF;

      RETURN NEW;

    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE TRIGGER new_top_user_trigger
    AFTER UPDATE OF level ON user_levels
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_top_user();

    CREATE TABLE IF NOT EXISTS watched_items (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      last_status TEXT NOT NULL DEFAULT 'unknown',
      last_checked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, url)
    );

    CREATE INDEX IF NOT EXISTS watched_items_url_idx ON watched_items (url);
  `);
}

function xpForLevel(level) {
  return 100 * level * level;
}

// Atomically awards XP under a row lock so concurrent messages can't race.
// Returns null if the user is still on cooldown (when cooldownMs is given).
async function addXp(userId, guildId, amount, cooldownMs = 0) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO user_levels (user_id, guild_id, xp, level)
       VALUES ($1, $2, 0, 0) ON CONFLICT (user_id, guild_id) DO NOTHING`,
      [userId, guildId],
    );
    const { rows } = await client.query(
      `SELECT xp, level, last_xp_at FROM user_levels
       WHERE user_id = $1 AND guild_id = $2 FOR UPDATE`,
      [userId, guildId],
    );
    const row = rows[0];
    if (cooldownMs > 0 && row.last_xp_at
      && Date.now() - new Date(row.last_xp_at).getTime() < cooldownMs) {
      await client.query('ROLLBACK');
      return null;
    }
    const newXp = row.xp + amount;
    const computed = Math.floor(Math.sqrt(newXp / 100));
    const newLevel = Math.max(row.level, computed);
    await client.query(
      `UPDATE user_levels SET xp = $3, level = $4, last_xp_at = NOW()
       WHERE user_id = $1 AND guild_id = $2`,
      [userId, guildId, newXp, newLevel],
    );
    await client.query('COMMIT');
    return { xp: newXp, level: newLevel, leveledUp: newLevel > row.level };
  }
  catch (error) {
    await client.query('ROLLBACK').catch((rollbackError) => {
      console.error('Rollback failed:', rollbackError);
    });
    throw error;
  }
  finally {
    client.release();
  }
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

// Returns the new row, or null if the user is already watching this URL.
async function addWatch(userId, url, title, status) {
  const result = await pool.query(
    `INSERT INTO watched_items (user_id, url, title, last_status, last_checked_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, url) DO NOTHING
     RETURNING id, url, title`,
    [userId, url, title, status],
  );
  return result.rows[0] || null;
}

async function countWatches(userId) {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS count FROM watched_items WHERE user_id = $1',
    [userId],
  );
  return result.rows[0].count;
}

// `identifier` is either a numeric watch id or a URL. Scoped to the user so
// nobody can remove someone else's watch. Returns the removed row or null.
async function removeWatch(userId, identifier) {
  const byId = /^\d{1,9}$/.test(identifier);
  const result = await pool.query(
    `DELETE FROM watched_items
     WHERE user_id = $1 AND ${byId ? 'id = $2::int' : 'url = $2'}
     RETURNING url, title`,
    [userId, identifier],
  );
  return result.rows[0] || null;
}

async function getUserWatches(userId) {
  const result = await pool.query(
    'SELECT id, url, title FROM watched_items WHERE user_id = $1 ORDER BY created_at',
    [userId],
  );
  return result.rows;
}

async function getWatchedUrls() {
  const result = await pool.query('SELECT DISTINCT url FROM watched_items');
  return result.rows.map((row) => row.url);
}

// Records the outcome of checking a URL and returns the ids of users who
// should be pinged: those whose last known status was not already in stock.
// An 'unknown' result (e.g. a page we couldn't parse) never overwrites the
// last known status, so a flaky page can't cause repeat pings.
async function recordWatchCheck(url, status, title) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT user_id, last_status FROM watched_items WHERE url = $1 FOR UPDATE',
      [url],
    );
    await client.query(
      `UPDATE watched_items
       SET last_checked_at = NOW(),
           title = COALESCE($2, title),
           last_status = CASE WHEN $3::text = 'unknown' THEN last_status ELSE $3::text END
       WHERE url = $1`,
      [url, title, status],
    );
    await client.query('COMMIT');
    if (status !== 'in_stock') return [];
    return rows.filter((row) => row.last_status !== 'in_stock').map((row) => row.user_id);
  }
  catch (error) {
    await client.query('ROLLBACK').catch((rollbackError) => {
      console.error('Rollback failed:', rollbackError);
    });
    throw error;
  }
  finally {
    client.release();
  }
}

// Dedicated connection (not from the pool) that LISTENs for top-user changes.
function listenForTopUser(onTopUser) {
  const client = new Client(pool.options);
  let retrying = false;

  const retry = () => {
    if (retrying) return;
    retrying = true;
    client.removeAllListeners();
    client.on('error', () => undefined);
    client.end().catch(() => undefined);
    setTimeout(() => listenForTopUser(onTopUser), 5000);
  };

  client.on('error', (err) => {
    console.error('Listener connection error:', err.message);
    retry();
  });
  client.on('end', retry);
  client.on('notification', (msg) => {
    try {
      onTopUser(JSON.parse(msg.payload));
    }
    catch (error) {
      console.error('Bad notification payload:', error);
    }
  });

  client.connect()
    .then(() => client.query('LISTEN new_top_user'))
    .catch((err) => {
      console.error('Failed to start listener:', err.message);
      retry();
    });
}

module.exports = {
  pool,
  init,
  listenForTopUser,
  addXp,
  getUser,
  getLeaderboard,
  getLastXpAt,
  xpForLevel,
  addWatch,
  countWatches,
  removeWatch,
  getUserWatches,
  getWatchedUrls,
  recordWatchCheck,
};
