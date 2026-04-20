const { chromium } = require('playwright');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk').default;
const { Pool } = require('pg');

const os = require('os');

const CHROME_EXE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_PROFILE = `${ process.env.HOME }/Library/Application Support/Google/Chrome`;

// File session yang perlu dicopy (tanpa Cache agar cepat)
const SESSION_FILES = ['Cookies', 'Login Data', 'Preferences', 'Bookmarks', 'Web Data', 'Local Storage', 'Session Storage'];

function copyProfileToTemp(profileDir) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-session-'));

  // Copy Local State (root level)
  const localState = path.join(CHROME_PROFILE, 'Local State');
  if (fs.existsSync(localState)) fs.copyFileSync(localState, path.join(tmpDir, 'Local State'));

  // Copy file session dari profil yang dipilih ke folder "Default"
  const srcDir = path.join(CHROME_PROFILE, profileDir);
  const dstDir = path.join(tmpDir, 'Default');
  fs.mkdirSync(dstDir, { recursive: true });

  for (const item of SESSION_FILES) {
    const src = path.join(srcDir, item);
    const dst = path.join(dstDir, item);
    try {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        fs.cpSync(src, dst, { recursive: true });
      } else {
        fs.copyFileSync(src, dst);
      }
    } catch (_) { }
  }

  return tmpDir;
}
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

let browser = null;
let context = null;
let page = null;

// ─────────────────────────── TRIGGERS ───────────────────────────────────────

const TRIGGERS = {
  help: cmdHelp,
  open: cmdOpen,
  profile: cmdProfile,
  connect: cmdConnect,
  goto: cmdGoto,
  tabs: cmdTabs,
  title: cmdTitle,
  screenshot: cmdScreenshot,
  links: cmdLinks,
  scrape: cmdScrape,
  click: cmdClick,
  type: cmdType,
  fill: cmdFill,
  scroll: cmdScroll,
  wait: cmdWait,
  reload: cmdReload,
  back: cmdBack,
  forward: cmdForward,
  eval: cmdEval,
  chat: cmdChat,
  readquiz: cmdReadQuiz,
  answerquiz: cmdAnswerQuiz,
  otomatisquiz: cmdOtomatisQuiz,
  cookies: cmdCookies,
  close: cmdClose,
  exit: cmdExit,
};

function printBanner() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   Playwright Testing Bot  v2.0       ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('Ketik  help  untuk melihat semua perintah.\n');
}

function cmdHelp() {
  console.log(`
┌──────────────┬──────────────────────────────────────────────┐
│  BROWSER                                                     │
├──────────────┼──────────────────────────────────────────────┤
│  open        │ Buka browser baru (tanpa akun)               │
│  profile     │ Buka Chrome dengan akun yang sudah login     │
│  connect     │ Connect ke Chrome via CDP (port 9222)        │
│  close       │ Tutup browser                                │
├──────────────┼──────────────────────────────────────────────┤
│  NAVIGASI                                                    │
├──────────────┼──────────────────────────────────────────────┤
│  goto        │ Navigasi ke URL                              │
│  reload      │ Reload halaman                               │
│  back        │ Halaman sebelumnya                           │
│  forward     │ Halaman berikutnya                           │
├──────────────┼──────────────────────────────────────────────┤
│  INFO & TAB                                                  │
├──────────────┼──────────────────────────────────────────────┤
│  tabs        │ Lihat semua tab & pilih tab aktif            │
│  title       │ Judul tab aktif                              │
│  links       │ Semua link di halaman                        │
│  cookies     │ Cookies halaman aktif                        │
├──────────────┼──────────────────────────────────────────────┤
│  INTERAKSI                                                   │
├──────────────┼──────────────────────────────────────────────┤
│  screenshot  │ Ambil screenshot (full page)                 │
│  scrape      │ Scrape teks dari CSS selector                │
│  click       │ Klik elemen                                  │
│  type        │ Ketik ke input (karakter per karakter)       │
│  fill        │ Isi input langsung (cepat)                   │
│  scroll      │ Scroll (top / bottom / px)                   │
│  wait        │ Tunggu N detik                               │
│  eval        │ Jalankan JavaScript di halaman               │
├──────────────┼──────────────────────────────────────────────┤
│  exit        │ Keluar                                       │
└──────────────┴──────────────────────────────────────────────┘
`);
}

// ─────────────────────────── BROWSER COMMANDS ───────────────────────────────

async function cmdOpen() {
  if (context) { console.log('[INFO] Browser sudah terbuka. Gunakan  close  dulu.'); return; }
  console.log('[...] Membuka browser baru...');
  browser = await chromium.launch({ executablePath: CHROME_EXE, headless: false });
  context = await browser.newContext();
  page = await context.newPage();
  console.log('[OK]  Browser siap.');
  const url = await ask('[?]  URL (kosongkan untuk skip): ');
  if (url.trim()) await navigateTo(url.trim());
}

function listChromeProfiles() {
  const profiles = [];
  const dirs = fs.readdirSync(CHROME_PROFILE).filter((d) => d === 'Default' || d.startsWith('Profile '));
  for (const dir of dirs) {
    try {
      const prefs = JSON.parse(fs.readFileSync(path.join(CHROME_PROFILE, dir, 'Preferences'), 'utf8'));
      const name = prefs?.profile?.name || dir;
      const email = prefs?.account_info?.[0]?.email || '';
      profiles.push({ dir, name, email });
    } catch (_) {
      profiles.push({ dir, name: dir, email: '' });
    }
  }
  return profiles;
}

async function cmdProfile() {
  if (context) { console.log('[INFO] Browser sudah terbuka. Gunakan  close  dulu.'); return; }

  // Tampilkan list profil
  const profiles = listChromeProfiles();
  console.log('\n[PROFILES] Pilih profil Chrome:');
  profiles.forEach((p, i) => {
    const email = p.email ? ` — ${ p.email }` : '';
    console.log(`  [${ i + 1 }] ${ p.name }${ email }  (${ p.dir })`);
  });

  const pick = await ask('\n[?]  Nomor profil: ');
  const idx = parseInt(pick.trim()) - 1;
  if (isNaN(idx) || !profiles[idx]) { console.log('[!]  Pilihan tidak valid.'); return; }
  const selected = profiles[idx];
  console.log(`[OK]  Profil dipilih: ${ selected.name } ${ selected.email ? `(${ selected.email })` : '' }`);

  // Cek apakah Chrome sedang berjalan
  let chromeRunning = false;
  try { chromeRunning = execSync('pgrep -x "Google Chrome"', { encoding: 'utf8' }).trim().length > 0; } catch (_) { }

  if (chromeRunning) {
    console.log('[!]  Chrome sedang berjalan — profil sedang dikunci.');
    const kill = await ask('[?]  Tutup Chrome otomatis sekarang? (y/n): ');
    if (kill.trim().toLowerCase() !== 'y') {
      console.log('[INFO] Tutup Chrome manual lalu jalankan  profile  lagi.');
      return;
    }
    execSync('pkill -x "Google Chrome"', { stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 1500));
    console.log('[OK]  Chrome ditutup.');
  }

  console.log('[...] Menyiapkan sesi profil (copy cookies)...');
  const tmpDir = copyProfileToTemp(selected.dir);
  console.log('[...] Membuka Chrome, harap tunggu...');
  try {
    context = await chromium.launchPersistentContext(tmpDir, {
      executablePath: CHROME_EXE,
      headless: false,
      timeout: 60000,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-sync',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-service-autorun',
        '--password-store=basic',
      ],
    });
    const pages = context.pages();
    page = pages[0] || await context.newPage();
    console.log(`[OK]  Chrome terbuka — ${ selected.name } ${ selected.email ? `(${ selected.email })` : '' }`);
    const url = await ask('[?]  URL (kosongkan untuk skip): ');
    if (url.trim()) await navigateTo(url.trim());
  } catch (e) {
    context = null;
    console.log(`[ERROR] ${ e.message }`);
  }
}

async function cmdConnect() {
  if (context) { console.log('[INFO] Sudah terhubung. Gunakan  close  dulu.'); return; }
  console.log('[...] Mencoba connect ke Chrome di port 9222...');
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    context = browser.contexts()[0];
    const pages = context.pages();
    page = pages[0] || await context.newPage();
    const title = await page.title();
    console.log(`[OK]  Terhubung! Tab aktif: "${ title }"`);
  } catch (_) {
    browser = null; context = null;
    console.log('[!]  Gagal connect. Chrome harus dijalankan dengan:');
    console.log('     /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
    console.log('');
    const go = await ask('[?]  Gunakan  profile  saja? (y/n): ');
    if (go.trim().toLowerCase() === 'y') await cmdProfile();
  }
}

async function cmdClose() {
  if (!context) { console.log('[INFO] Tidak ada browser yang terbuka.'); return; }
  await context.close();
  if (browser) await browser.close();
  browser = null; context = null; page = null;
  console.log('[OK]  Browser ditutup.');
}

// ─────────────────────────── NAVIGASI ───────────────────────────────────────

async function cmdGoto() {
  await ensurePage();
  const url = await ask('[?]  URL: ');
  if (url.trim()) await navigateTo(url.trim());
}

async function cmdReload() {
  await ensurePage();
  await page.reload();
  console.log('[OK]  Halaman di-reload.');
}

async function cmdBack() {
  await ensurePage();
  await page.goBack();
  console.log('[OK]  Kembali.');
}

async function cmdForward() {
  await ensurePage();
  await page.goForward();
  console.log('[OK]  Maju.');
}

// ─────────────────────────── INFO & TABS ────────────────────────────────────

async function cmdTabs() {
  if (!context) { console.log('[INFO] Belum terhubung. Gunakan: open / profile / connect'); return; }
  const pages = context.pages();
  if (!pages.length) { console.log('[INFO] Tidak ada tab terbuka.'); return; }

  console.log(`\n[TABS] ${ pages.length } tab terbuka:`);
  for (let i = 0; i < pages.length; i++) {
    const t = await pages[i].title();
    const u = pages[i].url();
    const active = pages[i] === page ? ' ◀ aktif' : '';
    console.log(`  [${ i + 1 }] ${ t || '(no title)' }${ active }`);
    console.log(`       ${ u }`);
  }

  if (pages.length > 1) {
    const pick = await ask('\n[?]  Pilih tab (nomor) atau Enter tetap di tab ini: ');
    const idx = parseInt(pick.trim()) - 1;
    if (!isNaN(idx) && pages[idx]) {
      page = pages[idx];
      console.log(`[OK]  Tab aktif: "${ await page.title() }"`);
    }
  }
}

async function cmdTitle() {
  await ensurePage();
  console.log(`[TITLE] ${ await page.title() }`);
  console.log(`[URL]   ${ page.url() }`);
}

async function cmdLinks() {
  await ensurePage();
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map((a) => ({
      text: a.innerText.trim().slice(0, 60),
      href: a.href,
    }))
  );
  if (!links.length) { console.log('[INFO] Tidak ada link.'); return; }
  console.log(`\n[LINKS] ${ links.length } link ditemukan:`);
  links.slice(0, 30).forEach((l, i) => console.log(`  ${ i + 1 }. ${ l.text || '(no text)' } → ${ l.href }`));
  if (links.length > 30) console.log(`  ... dan ${ links.length - 30 } lainnya.`);
}

async function cmdCookies() {
  await ensurePage();
  const cookies = await context.cookies();
  if (!cookies.length) { console.log('[INFO] Tidak ada cookie.'); return; }
  console.log(`\n[COOKIES] ${ cookies.length } cookie:`);
  cookies.slice(0, 20).forEach((c) => console.log(`  ${ c.name } = ${ c.value }`));
  if (cookies.length > 20) console.log(`  ... dan ${ cookies.length - 20 } lainnya.`);
}

// ─────────────────────────── INTERAKSI ──────────────────────────────────────

async function cmdScreenshot() {
  await ensurePage();
  const timestamp = Date.now();
  const file = path.join(SCREENSHOT_DIR, `screenshot_${ timestamp }.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`[OK]  Disimpan: screenshots/screenshot_${ timestamp }.png`);
}

async function cmdScrape() {
  await ensurePage();
  const selector = await ask('[?]  CSS Selector (contoh: h1, .content): ');
  if (!selector.trim()) return;
  try {
    const texts = await page.$$eval(selector.trim(), (els) => els.map((el) => el.innerText.trim()));
    if (!texts.length) { console.log('[INFO] Elemen tidak ditemukan.'); return; }
    console.log(`\n[SCRAPE] ${ texts.length } elemen:`);
    texts.forEach((t, i) => console.log(`  [${ i + 1 }] ${ t.slice(0, 200) }`));
  } catch (e) { console.log(`[ERROR] ${ e.message }`); }
}

async function cmdClick() {
  await ensurePage();
  const selector = await ask('[?]  Selector: ');
  if (!selector.trim()) return;
  try {
    await page.click(selector.trim());
    console.log(`[OK]  Diklik: ${ selector }`);
  } catch (e) { console.log(`[ERROR] ${ e.message }`); }
}

async function cmdType() {
  await ensurePage();
  const selector = await ask('[?]  Selector input: ');
  if (!selector.trim()) return;
  const text = await ask('[?]  Teks: ');
  try {
    await page.click(selector.trim());
    await page.keyboard.type(text, { delay: 50 });
    console.log(`[OK]  Diketik ke: ${ selector }`);
  } catch (e) { console.log(`[ERROR] ${ e.message }`); }
}

async function cmdFill() {
  await ensurePage();
  const selector = await ask('[?]  Selector input: ');
  if (!selector.trim()) return;
  const value = await ask('[?]  Value: ');
  try {
    await page.fill(selector.trim(), value);
    console.log(`[OK]  Terisi: ${ selector }`);
  } catch (e) { console.log(`[ERROR] ${ e.message }`); }
}

async function cmdScroll() {
  await ensurePage();
  const dir = await ask('[?]  Scroll ke (top / bottom / angka px): ');
  const d = dir.trim().toLowerCase();
  if (d === 'top') {
    await page.evaluate(() => window.scrollTo(0, 0));
  } else if (d === 'bottom') {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  } else {
    const px = parseInt(d);
    if (!isNaN(px)) await page.evaluate((y) => window.scrollBy(0, y), px);
  }
  console.log('[OK]  Scroll selesai.');
}

async function cmdWait() {
  const sec = await ask('[?]  Tunggu berapa detik? ');
  const ms = (parseFloat(sec) || 1) * 1000;
  console.log(`[...] Menunggu ${ ms / 1000 }s...`);
  await page.waitForTimeout(ms);
  console.log('[OK]  Selesai.');
}

async function cmdEval() {
  await ensurePage();
  const code = await ask('[?]  JavaScript: ');
  if (!code.trim()) return;
  try {
    const result = await page.evaluate(new Function(`return (${ code.trim() })`));
    console.log('[RESULT]', result);
  } catch (e) { console.log(`[ERROR] ${ e.message }`); }
}

async function cmdReadQuiz() {
  await ensurePage();
  try {
    const data = await page.evaluate(() => {
      // Nomor soal
      const current = document.querySelector('[data-cy="current-question-number"]')?.innerText?.trim() || '?';
      const total = document.querySelector('[data-cy="total-question-number"]')?.innerText?.trim() || '?';

      // Teks soal
      const questionEl = document.querySelector('[data-testid="question-container-text"] .content-slot p');
      const question = questionEl?.innerText?.trim() || '(soal tidak ditemukan)';

      // Pilihan jawaban
      const options = [];
      document.querySelectorAll('button[data-cy^="option-"]').forEach((btn) => {
        const label = btn.querySelector('.gesture-ed')?.innerText?.trim() || '?';
        const text = btn.querySelector('#optionText .content-slot p')?.innerText?.trim()
          || btn.querySelector('.content-slot p')?.innerText?.trim()
          || '(kosong)';
        options.push({ label, text });
      });

      return { current, total, question, options };
    });

    console.log(`\n[SOAL ${ data.current }/${ data.total }]`);
    console.log(`  ${ data.question }\n`);
    data.options.forEach((o) => console.log(`  [${ o.label }] ${ o.text }`));
    console.log('');
  } catch (e) {
    console.log(`[ERROR] ${ e.message }`);
  }
}

// ─────────────────────────── CLAUDE API ─────────────────────────────────────

const chatHistory = [];
let _claudeClient = null;

async function getClaudeClient() {
  if (_claudeClient) return _claudeClient;

  let apiKey = process.env.ANTHROPIC_API_KEY;

  // Coba baca dari file .env jika ada
  const envFile = path.join(__dirname, '.env');
  if (!apiKey && fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^ANTHROPIC_API_KEY=(.+)/);
      if (match) { apiKey = match[1].trim(); break; }
    }
  }

  // Minta input jika masih kosong
  if (!apiKey) {
    console.log('\n[!]  ANTHROPIC_API_KEY belum di-set.');
    console.log('[!]  Dapatkan API key di: https://console.anthropic.com');
    apiKey = await ask('[?]  Masukkan API key (sk-ant-...): ');
    apiKey = apiKey.trim();
    if (!apiKey) throw new Error('API key tidak boleh kosong.');

    // Simpan ke .env agar tidak perlu input ulang
    const save = await ask('[?]  Simpan ke .env? (y/n): ');
    if (save.trim().toLowerCase() === 'y') {
      fs.writeFileSync(envFile, `ANTHROPIC_API_KEY=${ apiKey }\n`);
      console.log('[OK]  Tersimpan di .env');
    }
  }

  _claudeClient = new Anthropic({ apiKey });
  return _claudeClient;
}

async function askClaude(message) {
  const client = await getClaudeClient();
  chatHistory.push({ role: 'user', content: message });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: chatHistory,
  });

  const reply = response.content.find((b) => b.type === 'text')?.text || '';
  chatHistory.push({ role: 'assistant', content: reply });
  return reply;
}

async function cmdAnswerQuiz() {
  await ensurePage();
  try {
    const data = await page.evaluate(() => {
      // Nomor soal
      const current = document.querySelector('[data-cy="current-question-number"]')?.innerText?.trim() || '?';
      const total = document.querySelector('[data-cy="total-question-number"]')?.innerText?.trim() || '?';

      // Teks soal
      const questionEl = document.querySelector('[data-testid="question-container-text"] .content-slot p');
      const question = questionEl?.innerText?.trim() || '(soal tidak ditemukan)';

      // Pilihan jawaban
      const options = [];
      document.querySelectorAll('button[data-cy^="option-"]').forEach((btn) => {
        const label = btn.querySelector('.gesture-ed')?.innerText?.trim() || '?';
        const text = btn.querySelector('#optionText .content-slot p')?.innerText?.trim()
          || btn.querySelector('.content-slot p')?.innerText?.trim()
          || '(kosong)';
        options.push({ label, text });
      });

      return { current, total, question, options };
    });

    let text = ''

    text += `\n[SOAL ${ data.current }/${ data.total }]`
    text += `  ${ data.question }\n`

    console.log(`\n[SOAL ${ data.current }/${ data.total }]`);
    console.log(`  ${ data.question }\n`);
    data.options.forEach((o) => {
      text += `  [${ o.label }] ${ o.text }`
      console.log(`  [${ o.label }] ${ o.text }`)
    });
    console.log('');

    text += `\nJawab soal berikut dengan mengisi jawabannya saja`

    let reply = await askClaude(text)

    console.log(`Berikut jawabannya : ${ reply }`)
  } catch (e) {
    console.log(`[ERROR] ${ e.message }`);
  }
}

async function editTampilan(jawaban) {
  await page.evaluate((answer) => {
    const clean = (answer || '')
      .replace(/\*+/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .trim()
      .toLowerCase();
    const buttons = document.querySelectorAll('button[data-cy^="option-"]');
    buttons.forEach((btn) => {
      const label = btn.querySelector('.gesture-ed')?.innerText?.trim().toLowerCase() || '';
      const text = btn.querySelector('#optionText .content-slot p')?.innerText?.trim().toLowerCase()
        || btn.querySelector('.content-slot p')?.innerText?.trim().toLowerCase()
        || '';

      const isMatch = (text && (clean === text || clean.includes(text) || text.includes(clean)))
        || (label && clean === label);

      if (isMatch) {
        btn.style.outline = '5px solid #22c55e';
        btn.style.boxShadow = '0 0 25px #22c55e, 0 0 50px #22c55e';
        btn.style.transform = 'scale(1.05)';
        btn.style.transition = 'all 0.3s ease';
        btn.style.zIndex = '999';
        btn.style.position = 'relative';
      } else {
        btn.style.opacity = '0.35';
        btn.style.filter = 'grayscale(60%)';
        btn.style.transition = 'all 0.3s ease';
      }
    });
  }, jawaban);
}




async function cmdOtomatisQuiz() {
  await ensurePage();
  try {

    let lastQuiz = ""
    async function loopReadQuiz() {
      const data = await page.evaluate(() => {
        const current = document.querySelector('[data-cy="current-question-number"]')?.innerText?.trim() || '?';
        const total = document.querySelector('[data-cy="total-question-number"]')?.innerText?.trim() || '?';

        const questionEl = document.querySelector('[data-testid="question-container-text"] .content-slot p');
        const question = questionEl?.innerText?.trim() || '(soal tidak ditemukan)';

        const options = [];
        document.querySelectorAll('button[data-cy^="option-"]').forEach((btn) => {
          const label = btn.querySelector('.gesture-ed')?.innerText?.trim() || '?';
          const text = btn.querySelector('#optionText .content-slot p')?.innerText?.trim()
            || btn.querySelector('.content-slot p')?.innerText?.trim()
            || '(kosong)';
          options.push({ label, text });
        });

        return { current, total, question, options };
      });

      data.run = lastQuiz !== data.question
      if(data.question == '(soal tidak ditemukan)') data.run = false
      lastQuiz = data.question

      return data
    }


    let data = await loopReadQuiz()

    const answer = async () => {

      let text = ''

      text += `\n[SOAL ${ data.current }/${ data.total }]`
      text += `  ${ data.question }\n`

      console.log(`\n[SOAL ${ data.current }/${ data.total }]`);
      console.log(`  ${ data.question }\n`);
      data.options.forEach((o) => {
        text += `  [${ o.label }] ${ o.text }`
        console.log(`  [${ o.label }] ${ o.text }`)
      });
      console.log('');

      text += `\nJawab soal berikut dengan mengisi jawabannya saja`

      let reply = await askClaude(text)

      console.log(`Berikut jawabannya : ${ reply }`)

      await editTampilan(reply)
      console.log('[OK]  Tampilan jawaban di-highlight.')
    }

    while (true) {
      if (!data?.run) {
        await sleep(100)
        data = await loopReadQuiz()
      } else {
        await answer()
        data = await loopReadQuiz()
      }
    }

  } catch (e) {
    console.log(`[ERROR] ${ e.message }`);
  }
}

async function cmdChat() {
  const message = await ask('[?]  Pesan ke Claude: ');
  if (!message.trim()) return;

  process.stdout.write('[Claude] ');
  try {
    const reply = await askClaude(message.trim());
    console.log(reply);
    console.log(`\n[INFO] Riwayat chat: ${ chatHistory.length / 2 } pesan`);
  } catch (e) {
    if (e.message?.includes('API key')) {
      console.log('[ERROR] Set ANTHROPIC_API_KEY dulu: export ANTHROPIC_API_KEY=sk-...');
    } else {
      console.log(`[ERROR] ${ e.message }`);
    }
  }
}

async function cmdExit() {
  if (context) await context.close();
  if (browser) await browser.close();
  console.log('\n[BYE]  Sampai jumpa!\n');
  rl.close();
  process.exit(0);
}

// ─────────────────────────── HELPERS ────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePage() {
  if (!context) {
    console.log('[INFO] Browser belum terbuka. Membuka dengan profil...');
    await cmdProfile();
    return;
  }
  if (!page) page = await context.newPage();
}

async function navigateTo(url) {
  const fullUrl = url.startsWith('http') ? url : `https://${ url }`;
  console.log(`[...] Navigasi ke: ${ fullUrl }`);
  try {
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`[OK]  "${ await page.title() }"`);
  } catch (e) { console.log(`[ERROR] ${ e.message }`); }
}

// ─────────────────────────── MAIN LOOP ──────────────────────────────────────

async function main() {
  printBanner();
  while (true) {
    const input = await ask('\n> Trigger: ');
    const cmd = input.trim().toLowerCase();
    if (!cmd) continue;
    if (TRIGGERS[cmd]) {
      try { await TRIGGERS[cmd](); } catch (e) { console.log(`[ERROR] ${ e.message }`); }
    } else {
      console.log(`[!] Tidak dikenal: "${ cmd }". Ketik  help  untuk bantuan.`);
    }
  }
}

main();
