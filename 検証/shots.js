// 評価用に、現在のビルドの代表画面を撮る
const puppeteer = require("puppeteer-core");
const path = require("path");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = "C:/Users/tomok/AppData/Local/Temp/claude/C--Users-tomok-OneDrive------------/1c5375a7-4688-4227-8353-051bec862c5d/scratchpad/shots";
const APP = "file:///C:/Users/tomok/OneDrive/デスクトップ/とおいサウナ/index.html";

(async () => {
  require("fs").mkdirSync(OUT, { recursive: true });
  const b = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: ["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"]
  });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  // 1) 入口
  await p.goto(APP + "?open=1&fast=1&room=shots", { waitUntil: "load" });
  await sleep(900);
  await p.screenshot({ path: path.join(OUT, "1-entrance.png") });

  await p.mouse.click(195, 422);
  await sleep(800);
  for (let i = 0; i < 120; i++){
    const r = await p.evaluate(() => { const s = roundState(serverNow()); return s.running && s.left > ROUND_MS * 0.5; });
    if (r) break;
    await sleep(300);
  }

  const fill = (n) => p.evaluate((n) => {
    const now = serverNow(), r = roundState(now).idx;
    Net.members = {};
    Net.members[me] = { t: now, j: now, s: "i", tier: 1, heat: 50, st: 64, out: 0, r };
    for (let i = 0; i < n; i++)
      Net.members["s" + i] = { t: now, j: now - i * 5000, s: "i", tier: i % 3,
                               heat: 32 + i * 5, st: 92 - i * 6, out: 0, r };
    Me.heat = 50; Me.dHeat = 50; Me.stam = 64; Me.dStam = 64; Me.calm = 0.8;
    Me.out = false; Me.played = 1; Me.bPhase = 0.04;
  }, n);

  // 2) 部屋（通常）
  await fill(9);
  await p.evaluate(() => { App.pressedAt = serverNow() - LOYLY_ROOM - 400; });  // 石が赤熱
  await sleep(700);
  await p.screenshot({ path: path.join(OUT, "2-room.png") });

  // 3) 予兆（ひしゃくが持ち上がる）
  await p.evaluate(() => { const t = serverNow() - 900; Net.loyly["tell" + t] = { t }; });
  await sleep(250);
  await p.screenshot({ path: path.join(OUT, "3-tell.png") });

  // 4) 着弾（蒸気が降りる）
  await sleep(1500);
  await p.screenshot({ path: path.join(OUT, "4-hit.png") });

  // 5) 満室＋高温（歪み）
  await fill(20);
  await p.evaluate(() => {
    const now = serverNow();
    for (let i = 0; i < 6; i++) App.events.loyly.push({ t: now - i * 500, applied: true });
    Me.heat = 92; Me.dHeat = 92; Me.stam = 22; Me.dStam = 22;
  });
  await sleep(700);
  await p.screenshot({ path: path.join(OUT, "5-crowd-hot.png") });

  // 6) 脱衣所
  await p.evaluate(() => { window.isOpen = () => false; });
  await sleep(800);
  await p.screenshot({ path: path.join(OUT, "6-locker.png") });

  console.log("shots written to", OUT);
  await b.close();
})();
