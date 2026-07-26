// 製品の中心「他人がいると成立するか」の初回検証。2窓を繋いで撃ち合う
const puppeteer = require("puppeteer-core");
const path = require("path");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (n, c, e) => console.log((c ? "PASS  " : "FAIL  ") + n + (e !== undefined ? "  " + JSON.stringify(e) : ""));
const URL = "http://localhost:8731/index.html?open=1&fast=1&room=duo";   // BroadcastChannel は同一オリジンが必要

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: ["--autoplay-policy=no-user-gesture-required"]
  });
  const errs = [];
  const open = async label => {
    const p = await browser.newPage();
    p.on("pageerror", e => errs.push(label + " PAGEERROR: " + e.message));
    p.on("console", m => { if (m.type() === "error") errs.push(label + " CONSOLE: " + m.text()); });
    await p.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await p.goto(URL, { waitUntil: "load" });
    await sleep(500);
    await p.mouse.click(195, 422);                 // ふれて入る
    await sleep(800);
    return p;
  };

  const A = await open("A");
  const B = await open("B");
  await sleep(1500);

  // 互いを認識しているか
  const seen = async (p) => p.evaluate(() => ({
    people: Net.present().length,
    ids: Net.present().map(x => x.id).length,
    bus: !!Net.bus
  }));
  const sa = await seen(A), sb = await seen(B);
  ok("2窓が互いを認識する", sa.people === 2 && sb.people === 2 && sa.bus && sb.bus, { A: sa, B: sb });

  // 回が走るのを待つ
  for (let i = 0; i < 120; i++){
    const r = await A.evaluate(() => { const s = roundState(serverNow()); return s.running && s.left > ROUND_MS * 0.5; });
    if (r) break;
    await sleep(300);
  }

  // Bを上段に上げて、食らいやすくする
  await B.evaluate(() => { Me.tier = 0; Net.push(); });
  await sleep(600);

  // Aが打つ → Bに予兆と着弾が届くか（これが製品の中心）
  const before = await B.evaluate(() => ({ heat: Me.heat, phase: Me.bPhase, calm: Me.calm }));
  const btn = await A.evaluate(() => ({ x: Btn.loyly.x + Btn.loyly.w / 2, y: Btn.loyly.y + Btn.loyly.h / 2 }));
  await A.mouse.click(btn.x, btn.y);
  await sleep(350);

  const bTell = await B.evaluate(() => ({
    events: App.events.loyly.length,
    telling: serverNow() - App.pressedAt < LOYLY_TELL,
    applied: App.events.loyly.map(e => e.applied)
  }));
  ok("打っていない側にも予兆が届く", bTell.events === 1 && bTell.telling && bTell.applied[0] === false, bTell);
  await B.screenshot({ path: path.join(__dirname, "duo-b-tell.png") });

  await sleep(1800);
  const bLand = await B.evaluate(() => ({
    applied: App.events.loyly.map(e => e.applied), heat: Me.heat, surge: Me.surge,
    disturb: +App.disturb(serverNow()).toFixed(2), phase: Me.bPhase
  }));
  ok("打っていない側の熱が上がり、呼吸が乱れる",
     bLand.applied[0] === true && bLand.heat > before.heat + 5 && bLand.disturb > 0.5,
     { beforeHeat: +before.heat.toFixed(1), afterHeat: +bLand.heat.toFixed(1), disturb: bLand.disturb });
  await B.screenshot({ path: path.join(__dirname, "duo-b-hit.png") });

  // 上段のBの方が下段寄りのAより大きく食らっているか（狙いが成立しているか）
  const aHeat = await A.evaluate(() => ({ heat: Me.heat, tier: Seats.tierOf(me) }));
  const bTier = await B.evaluate(() => Seats.tierOf(me));
  ok("上段の人ほど大きく食らう（狙いが成立する）", bTier < aHeat.tier || bLand.heat > aHeat.heat,
     { A: { tier: aHeat.tier, heat: +aHeat.heat.toFixed(1) }, B: { tier: bTier, heat: +bLand.heat.toFixed(1) } });

  // Aは連続で打てない（部屋の共有クールダウン）
  await A.mouse.click(btn.x, btn.y);
  await sleep(300);
  ok("部屋で共有のクールダウンが効く", await B.evaluate(() => App.events.loyly.length === 1));

  // 片方が閉じたら、もう片方から消えるか
  await B.close();
  await sleep(1200);
  const afterClose = await A.evaluate(() => Net.present().length);
  ok("退出が相手に伝わる", afterClose === 1, { people: afterClose });

  console.log("errors:", errs.length ? errs.join(" | ") : "(none)");
  await browser.close();
})();
