const puppeteer = require("puppeteer-core");
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new", args: ["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"]
  });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await p.goto("file:///C:/Users/tomok/OneDrive/デスクトップ/とおいサウナ/index.html?open=1&fast=1&room=perf", { waitUntil: "load" });
  await sleep(500); await p.mouse.click(195, 422); await sleep(700);
  for (let i = 0; i < 100; i++){ if (await p.evaluate(() => roundState(serverNow()).running)) break; await sleep(300); }
  await p.evaluate(() => {                        // 満室にして最悪ケースを測る
    const now = serverNow(), r = roundState(now).idx;
    for (let i = 0; i < 20; i++)
      Net.members["pf" + i] = { t: now, j: now - i * 900, s: "i", tier: i % 3, heat: 30 + i * 3, st: 90 - i * 3, out: 0, r };
  });
  await sleep(600);
  const fps = await p.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
    requestAnimationFrame(tick);
  }));
  console.log("people:", await p.evaluate(() => Net.present().length), " fps:", fps);
  await b.close();
})();
