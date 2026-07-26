const puppeteer = require("puppeteer-core");
const path = require("path");
const APP = "file:///C:/Users/tomok/OneDrive/デスクトップ/とおいサウナ/index.html";
const OUT = __dirname;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (n, c, e) => console.log((c ? "PASS  " : "FAIL  ") + n + (e !== undefined ? "  " + JSON.stringify(e) : ""));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: ["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });

  await page.goto(APP + "?open=1&room=breath", { waitUntil: "load" });   // FASTなしで本来の周期を測る
  await sleep(500);
  await page.mouse.click(195, 422);
  await sleep(800);

  const freshRound = async () => {
    for (let i = 0; i < 200; i++){
      const r = await page.evaluate(() => { const s = roundState(serverNow()); return { running: s.running, left: s.left, total: ROUND_MS }; });
      if (r.running && r.left > r.total * 0.9) return true;
      await sleep(500);
    }
    return false;
  };

  // 回の間は呼吸が止まるのが正しい挙動なので、走っている間に測る
  for (let i = 0; i < 150; i++){
    if (await page.evaluate(() => roundState(serverNow()).running)) break;
    await sleep(400);
  }

  // 呼吸が常に進んでいるか
  const p1 = await page.evaluate(() => Me.bPhase);
  await sleep(600);
  const p2 = await page.evaluate(() => ({ phase: Me.bPhase, cycle: Me.bCycle }));
  ok("呼吸は常に進んでいる", p2.phase !== p1, { p1: +p1.toFixed(3), p2: +p2.phase.toFixed(3) });

  // 位相0付近で叩くと整い、外すと落ちる（時刻を直接いじって判定だけ検証）
  const judge = await page.evaluate(() => {
    const res = {};
    Me.calm = 0.5; Me.bPhase = 0.01; Me.bJudged = -1; App.breathe(serverNow());
    res.onBeat = +Me.calm.toFixed(3);
    Me.calm = 0.5; Me.bPhase = 0.5; Me.bJudged = -1; App.breathe(serverNow());
    res.offBeat = +Me.calm.toFixed(3);
    return res;
  });
  ok("合わせると整い、外すと乱れる", judge.onBeat > 0.5 && judge.offBeat < 0.5, judge);

  // 1周期に判定は1回だけ（連打で稼げない）
  const spam = await page.evaluate(() => {
    Me.calm = 0.5; Me.bPhase = 0.01; Me.bJudged = -1;
    for (let i = 0; i < 20; i++) App.breathe(serverNow());
    return +Me.calm.toFixed(3);
  });
  ok("連打では稼げない（1周期1回）", Math.abs(spam - (0.5 + 0.22)) < 0.001, { calm: spam });

  // 整っていると体力の減りが遅い
  const drains = await page.evaluate(() => ({
    calm0: +drainRate(70, 0).toFixed(4), calm1: +drainRate(70, 1).toFixed(4)
  }));
  ok("整っていると体力の減りが遅い", drains.calm1 < drains.calm0 * 0.75, drains);

  // 上段は呼吸が速い（難しい）／下段は遅い
  const pers = await page.evaluate(() => ({
    top: +breathPeriod(0, Seats.tiers, 0).toFixed(2),
    bottom: +breathPeriod(Seats.tiers - 1, Seats.tiers, 0).toFixed(2),
    topDisturbed: +breathPeriod(0, Seats.tiers, 1).toFixed(2)
  }));
  ok("上段は呼吸が速く、乱れるとさらに速い",
     pers.top < pers.bottom && pers.topDisturbed < pers.top, pers);

  // ロウリュは上段ほど効く
  const bites = await page.evaluate(() => ({
    top: +loylyBite(0, Seats.tiers).toFixed(2),
    bottom: +loylyBite(Seats.tiers - 1, Seats.tiers).toFixed(2)
  }));
  ok("ロウリュは上段ほど効く", bites.top > bites.bottom * 3, bites);

  // ロウリュを食らうと呼吸が飛んで、合わせ直しになる
  if (!await freshRound()) console.log("(回の頭に揃えられなかった)");
  await page.evaluate(() => { Me.stam = STAM_MAX; Me.out = false; Me.calm = 0.8; });
  const before = await page.evaluate(() => ({ phase: Me.bPhase, judged: Me.bJudged }));
  await page.evaluate(() => {                       // 他人が打った状況を注入
    const t = serverNow() - LOYLY_TELL - 10;
    Net.loyly["inj" + t] = { t };
  });
  await sleep(400);
  const after = await page.evaluate(() => ({
    phase: Me.bPhase, judged: Me.bJudged, disturb: +App.disturb(serverNow()).toFixed(2),
    heat: Math.round(Me.heat)
  }));
  ok("ロウリュで呼吸が飛び、乱れが立つ",
     after.disturb > 0.5 && after.judged === -1 && after.phase !== before.phase,
     { before: { phase: +before.phase.toFixed(3) }, after: { phase: +after.phase.toFixed(3), disturb: after.disturb, heat: after.heat } });
  await page.screenshot({ path: path.join(OUT, "c1-disturbed.png") });

  // 腕で生存時間が変わるか（整え続ける vs 放置）を実測に近い形で比較
  const sim = await page.evaluate(() => {
    const run = calm => {
      let stam = STAM_MAX, heat = 0, t = 0;
      const eq = heatEquilibrium(1, Seats.tiers, false);
      while (stam > 0 && t < 600){
        heat += (eq - heat) * HEAT_K * 0.1;
        stam -= drainRate(heat, calm) * 0.1;
        t += 0.1;
      }
      return Math.round(t);
    };
    return { 整え続ける: run(1), 半端: run(0.5), 放置: run(0) };
  });
  ok("腕で生存時間が大きく変わる", sim.整え続ける > sim.放置 * 1.6, sim);

  // ボタン以外をタップすると呼吸になる（ボタンは呼吸にしない）
  // 回の間は操作を受けないのが正しい挙動なので、走っている間に測る
  for (let i = 0; i < 120; i++){
    if (await page.evaluate(() => roundState(serverNow()).running)) break;
    await sleep(500);
  }
  const tapTest = await page.evaluate(() => {
    Me.out = false; Me.bJudged = -1; Me.bPhase = 0.01;
    const j0 = Me.bJudged;
    App.tap(W / 2, H * 0.5);                          // 部屋の中＝呼吸
    const afterRoom = Me.bJudged !== j0;
    Me.bJudged = -1; const w0 = Me.water;
    App.tap(Btn.water.x + 5, Btn.water.y + 5);        // 水ボタン＝呼吸にはならない
    return { afterRoom, breathedOnButton: Me.bJudged !== -1, waterUsed: Me.water < w0 };
  });
  ok("部屋のどこでも呼吸／ボタンは呼吸にしない",
     tapTest.afterRoom && !tapTest.breathedOnButton && tapTest.waterUsed, tapTest);

  // ひとりでも自分が部屋から消えないこと（心拍が止まると STALE_MS で居ない人になる）
  await sleep(9000);                                  // STALE_MS(7秒) を跨いで待つ
  const stillHere = await page.evaluate(() => ({
    present: Net.present().length,
    ageMs: Math.round(serverNow() - (Net.members[me] ? Net.members[me].t : 0))
  }));
  ok("ひとりでも9秒後に自分が居る（心拍が生きている）",
     stillHere.present === 1 && stillHere.ageMs < 7000, stillHere);

  await page.screenshot({ path: path.join(OUT, "c2-room.png") });
  console.log("\n--- errors ---");
  console.log(errors.length ? errors.join("\n") : "(none)");
  await browser.close();
})();
