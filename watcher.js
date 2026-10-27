const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const zlib = require('node:zlib');
const cheerio = require('cheerio');
const db = require('./db');

const DEFAULT_INTERVAL_MINUTES = 10;
const REQUEST_TIMEOUT_MS = 15000;
const DELAY_BETWEEN_URLS_MS = 2000;
const FIRST_SWEEP_DELAY_MS = 30000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_URL_LENGTH = 2000;
const MAX_WATCHES_PER_USER = 10;

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

class WatchError extends Error {}

// ---------------------------------------------------------------------------
// SSRF protection
//
// Users hand us URLs that the bot then requests from inside our own network,
// so refuse anything that resolves to a private, loopback, link-local (cloud
// metadata) or otherwise non-public address.
// ---------------------------------------------------------------------------

const blockedAddresses = new net.BlockList();
[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) => blockedAddresses.addSubnet(address, prefix, 'ipv4'));
[
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].forEach(([address, prefix]) => blockedAddresses.addSubnet(address, prefix, 'ipv6'));

function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 0) return true;
  return blockedAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

// Used as the socket `lookup`, so the address we validate is the address we
// actually connect to (no DNS-rebinding gap between check and use).
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err);
    const resolved = Array.isArray(address) ? address : [{ address, family }];
    if (resolved.some((entry) => isBlockedAddress(entry.address))) {
      return callback(new WatchError('That address is not allowed.'));
    }
    return callback(null, address, family);
  });
}

// Parses and validates a user-supplied URL. Throws WatchError with a
// message that is safe to show to the user.
function normalizeUrl(input) {
  const trimmed = String(input).trim();
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new WatchError('That URL is too long.');
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  }
  catch {
    throw new WatchError('That doesn\'t look like a valid URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new WatchError('Only http and https links are supported.');
  }
  if (parsed.username || parsed.password) {
    throw new WatchError('URLs with embedded credentials are not supported.');
  }
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    throw new WatchError('Only the standard web ports (80 and 443) are supported.');
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw new WatchError('That address is not allowed.');
  }
  parsed.hash = '';
  return parsed;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const DECODERS = {
  gzip: zlib.createGunzip,
  'x-gzip': zlib.createGunzip,
  deflate: zlib.createInflate,
  br: zlib.createBrotliDecompress,
};

function decoderFor(encoding) {
  const create = DECODERS[(encoding || '').toLowerCase()];
  return create ? create() : null;
}

function requestOnce(url) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'GET',
      lookup: safeLookup,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    }, (res) => {
      const { statusCode, headers } = res;
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        res.resume();
        resolve({ statusCode, location: headers.location });
        return;
      }

      const decoder = decoderFor(headers['content-encoding']);
      const stream = decoder ? res.pipe(decoder) : res;
      const chunks = [];
      let size = 0;
      const fail = (error) => {
        res.destroy();
        reject(error);
      };
      res.on('error', fail);
      stream.on('error', fail);
      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          fail(new WatchError('That page is too large.'));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('end', () => {
        resolve({ statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchPage(url) {
  let current = url;
  for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
    const result = await requestOnce(current);
    if (result.location) {
      // Every hop goes through the same validation as the original URL.
      current = normalizeUrl(new URL(result.location, current).toString());
      continue;
    }
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new WatchError(`The store returned HTTP ${result.statusCode}.`);
    }
    return result.body;
  }
  throw new WatchError('Too many redirects.');
}

// ---------------------------------------------------------------------------
// Stock detection
//
// Strategy, most to least reliable:
//   1. schema.org Product markup in JSON-LD
//   2. availability meta tags / microdata
//   3. add-to-cart / sold-out wording on the page
// Returns 'in_stock', 'out_of_stock' or 'unknown'.
// ---------------------------------------------------------------------------

function classifyAvailability(raw) {
  const value = String(raw).toLowerCase().replace(/[^a-z]/g, '');
  if (/outofstock|soldout|unavailable|discontinued|preorder|backorder|presale/.test(value)) {
    return 'out_of_stock';
  }
  if (/instock|instoreonly|onlineonly|limitedavailability|available/.test(value)) {
    return 'in_stock';
  }
  return null;
}

function combine(statuses) {
  const known = statuses.filter(Boolean);
  if (known.length === 0) return null;
  return known.includes('in_stock') ? 'in_stock' : 'out_of_stock';
}

function isProductNode(node) {
  const types = [].concat(node['@type'] || []);
  return types.some((type) => type === 'Product' || type === 'ProductGroup');
}

function findProductNode(node) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProductNode(child);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  if (isProductNode(node)) return node;
  for (const child of Object.values(node)) {
    const found = findProductNode(child);
    if (found) return found;
  }
  return null;
}

function collectAvailability(node, found = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => collectAvailability(child, found));
  }
  else if (node && typeof node === 'object') {
    if (node.availability) found.push(...[].concat(node.availability));
    Object.values(node).forEach((child) => collectAvailability(child, found));
  }
  return found;
}

function fromJsonLd($) {
  const result = { status: null, title: null };
  $('script[type="application/ld+json"]').each((i, el) => {
    if (result.status) return;
    let data;
    try {
      data = JSON.parse($(el).contents().text());
    }
    catch {
      return;
    }
    const product = findProductNode(data);
    if (!product) return;
    result.title = typeof product.name === 'string' ? product.name : null;
    // For products with variants, any variant being in stock counts.
    result.status = combine(collectAvailability(product).map(classifyAvailability));
  });
  return result;
}

function fromMeta($) {
  const values = [];
  $('meta[property="product:availability"], meta[property="og:availability"], meta[name="availability"]')
    .each((i, el) => values.push($(el).attr('content')));
  $('[itemprop="availability"]')
    .each((i, el) => values.push($(el).attr('href') || $(el).attr('content') || $(el).text()));
  return combine(values.filter(Boolean).map(classifyAvailability));
}

const ADD_TO_CART = /add\s+to\s+(cart|bag|basket|trolley)|buy\s+(it\s+)?now|add\s+to\s+order/i;
const SOLD_OUT = /sold\s*out|out\s+of\s+stock|currently\s+unavailable|temporarily\s+unavailable|notify\s+me|email\s+me\s+when|back\s+in\s+stock/i;

function fromPageText($) {
  const buttons = $('button, input[type="submit"], input[type="button"], [role="button"]').toArray()
    .map((el) => ({
      text: `${$(el).text()} ${$(el).attr('value') || ''}`.trim(),
      disabled: $(el).is('[disabled], [aria-disabled="true"]'),
    }))
    .filter((button) => button.text);

  const purchasable = buttons.some((button) => ADD_TO_CART.test(button.text)
    && !button.disabled && !SOLD_OUT.test(button.text));
  if (purchasable) return 'in_stock';

  const blocked = buttons.some((button) => SOLD_OUT.test(button.text)
    || (ADD_TO_CART.test(button.text) && button.disabled));
  if (blocked) return 'out_of_stock';

  return null;
}

function parseAvailability(html) {
  const $ = cheerio.load(html);
  const jsonLd = fromJsonLd($);
  const rawTitle = jsonLd.title
    || $('meta[property="og:title"]').attr('content')
    || $('title').first().text();
  const title = rawTitle ? rawTitle.replace(/\s+/g, ' ').trim().slice(0, 200) : null;
  const status = jsonLd.status || fromMeta($) || fromPageText($) || 'unknown';
  return { status, title: title || null };
}

async function checkUrl(urlString) {
  const html = await fetchPage(normalizeUrl(urlString));
  return parseAvailability(html);
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

function getChannelId() {
  return process.env.WATCH_CHANNEL_ID;
}

function isConfigured() {
  return Boolean(getChannelId());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notify(client, userIds, url, title) {
  const channel = await client.channels.fetch(getChannelId());
  if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') {
    throw new Error(`WATCH_CHANNEL_ID ${getChannelId()} is not a text channel the bot can send to`);
  }
  const mentions = userIds.map((id) => `<@${id}>`).join(' ');
  const name = title ? `**${title.slice(0, 100)}**` : 'An item you\'re watching';
  await channel.send({
    content: `${mentions} ${name} is available! ${url}`,
    allowedMentions: { users: userIds },
  });
}

async function sweep(client) {
  const urls = await db.getWatchedUrls();
  for (const url of urls) {
    try {
      const { status, title } = await checkUrl(url);
      const userIds = await db.recordWatchCheck(url, status, title);
      if (userIds.length > 0) {
        await notify(client, userIds, url, title);
      }
    }
    catch (error) {
      console.error(`Watch check failed for ${url}:`, error.message);
    }
    await sleep(DELAY_BETWEEN_URLS_MS);
  }
}

// Self-rescheduling loop: the next sweep starts only after the previous one
// has finished, so slow stores can't cause overlapping sweeps.
function start(client) {
  if (!isConfigured()) {
    console.warn('WATCH_CHANNEL_ID is not set; the /watch feature is disabled.');
    return;
  }
  const minutes = parseFloat(process.env.WATCH_INTERVAL_MINUTES) || DEFAULT_INTERVAL_MINUTES;
  const intervalMs = Math.max(1, minutes) * 60 * 1000;

  const run = async () => {
    try {
      await sweep(client);
    }
    catch (error) {
      console.error('Watch sweep failed:', error);
    }
    setTimeout(run, intervalMs);
  };
  setTimeout(run, FIRST_SWEEP_DELAY_MS);
}

module.exports = {
  WatchError,
  MAX_WATCHES_PER_USER,
  normalizeUrl,
  parseAvailability,
  checkUrl,
  isConfigured,
  getChannelId,
  sweep,
  start,
};
