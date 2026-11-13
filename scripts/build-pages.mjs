import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

async function fetchSnapshot(url) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let failure;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (response.ok) return await response.text();
      failure = new Error(`Archive API returned HTTP ${response.status}`);
      await response.body?.cancel();
      if (![408, 429].includes(response.status) && response.status < 500) throw failure;
    } catch (error) {
      if (error === failure) throw error;
      failure = error;
    }
    if (attempt === maxAttempts) {
      throw new Error(`Could not fetch archive after ${attempt} attempts: ${failure.message}`, { cause: failure });
    }
    console.warn(`Archive request ${attempt}/${maxAttempts} failed: ${failure.message}. Retrying.`);
    await delay(attempt * 5000);
  }
}

const adapter = await readFile('archive-api.js', 'utf8');
const endpoint = adapter.match(/var endpoint = '(https:\/\/script\.google\.com\/[^']+)'/)[1];
const callback = 'archiveCallback_pagesBuild';
const url = new URL(endpoint);
url.search = new URLSearchParams({ action: 'archive-data', callback });
const body = (await fetchSnapshot(url)).trim();
if (!body.startsWith(callback + '(') || !body.endsWith(');')) {
  throw new Error('Archive API did not return the expected callback');
}
const data = JSON.parse(body.slice(callback.length + 1, -2));
if (!Array.isArray(data.items) || !data.items.length ||
    !data.items.every(row => row && typeof row.title === 'string')) {
  throw new Error('Archive API did not return a usable list');
}

const snapshot = JSON.stringify({ items: data.items, updatedAt: Date.now() }).replace(/</g, '\\u003c');
const revision = createHash('sha256').update(JSON.stringify(data.items)).digest('hex').slice(0, 16);
const index = await readFile('index.html', 'utf8');
const html = index.replace('src="./bootstrap.js"', `src="./bootstrap.js?v=${revision}"`);
if (html === index) throw new Error('Bootstrap script reference is missing');

await mkdir('_site', { recursive: true });
await writeFile('_site/bootstrap.js', `window.ARCHIVE_BOOTSTRAP=${snapshot};\n`);
await writeFile('_site/index.html', html);
await copyFile('archive-api.js', '_site/archive-api.js');
console.log(`Prepared ${data.items.length} archive entries (${revision})`);
