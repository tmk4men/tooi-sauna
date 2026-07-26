const puppeteer = require("puppeteer-core");
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: ["--autoplay-policy=no-user-gesture-required"]
  });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  const errs = [];
  p.on("pageerror", e => errs.push("PAGEERROR: " + e.message));
  p.on("console", m => { if (m.type() === "error") errs.push("CONSOLE: " + m.text()); });
  p.on("requestfailed", r => errs.push("REQFAIL: " + r.url()));
  p.on("response", r => { if (r.status() >= 400) errs.push("HTTP " + r.status() + ": " + r.url()); });

  await p.goto("https://tmk4men.github.io/tooi-sauna/?open=1&fast=1", { waitUntil: "load" });
  await sleep(1200);
  console.log("入口:", await p.evaluate(() => App.screen));

  await p.mouse.click(195, 422);
  await sleep(1500);
  // 回の頭に揃える（回の間だと操作は効かないのが正しい挙動なので、走っている時に測る）
  for (let i = 0; i < 60; i++){
    const r = await p.evaluate(() => { const s = roundState(serverNow()); return { running: s.running, left: s.left, total: ROUND_MS }; });
    if (r.running && r.left > r.total * 0.7) break;
    await sleep(500);
  }
  console.log("回:", await p.evaluate(() => { const s = roundState(serverNow()); return { running: s.running, leftSec: Math.round(s.left / 1000) }; }));
  console.log("入室後:", await p.evaluate(() => ({
    screen: App.screen, people: Net.present().length, live: Net.live,
    stam: Math.round(Me.stam), heat: Math.round(Me.heat), tiers: Seats.tiers, seats: Seats.cap
  })));
  console.log("操作ボタン:", await p.evaluate(() => Object.keys(Btn).filter(k => Btn[k]).join(", ")));

  // ロウリュを1発。予兆→着弾まで通るか
  const bt = await p.evaluate(() => ({ x: Btn.loyly.x + Btn.loyly.w / 2, y: Btn.loyly.y + Btn.loyly.h / 2 }));
  await p.mouse.click(bt.x, bt.y);
  await sleep(300);
  console.log("予兆中:", await p.evaluate(() => ({ events: App.events.loyly.length, applied: App.events.loyly.map(e => e.applied) })));
  await sleep(2000);
  console.log("着弾後:", await p.evaluate(() => ({ applied: App.events.loyly.map(e => e.applied), heat: Math.round(Me.heat) })));

  await p.screenshot({ path: __dirname + "/live.png" });
  console.log("errors:", errs.length ? errs.join(" | ") : "(none)");
  await b.close();
})();
