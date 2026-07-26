const puppeteer = require("puppeteer-core");
const path = require("path");

const APP = "file:///C:/Users/tomok/OneDrive/デスクトップ/とおいサウナ/index.html";
const OUT = __dirname;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (name, cond, extra) => console.log((cond ? "PASS  " : "FAIL  ") + name + (extra !== undefined ? "  " + JSON.stringify(extra) : ""));

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

  await page.goto(APP + "?open=1&fast=1&room=battle", { waitUntil: "load" });
  await sleep(600);
  await page.mouse.click(195, 422);                       // ふれて入る
  await sleep(700);

  // 回の頭に揃える。途中や回の間から始めると判定が当てにならない
  for (let i = 0; i < 120; i++){
    const rs = await page.evaluate(() => { const r = roundState(serverNow()); return { running: r.running, left: r.left, total: ROUND_MS }; });
    if (rs.running && rs.left > rs.total * 0.75) break;
    await sleep(500);
  }
  await page.evaluate(() => { Me.heat = 0; Me.stam = STAM_MAX; Me.water = WATER_MAX; Me.out = false; });

  const tapBtn = async which => {
    const b = await page.evaluate(w => Btn[w] && ({ x: Btn[w].x + Btn[w].w / 2, y: Btn[w].y + Btn[w].h / 2 }), which);
    if (!b) throw new Error("no button " + which);
    await page.mouse.click(b.x, b.y);
  };

  ok("入室して回が走っている", await page.evaluate(() => App.screen === "sauna" && roundState(serverNow()).running));

  // 熱が上がる
  const h0 = await page.evaluate(() => Me.heat);
  await sleep(1600);
  const h1 = await page.evaluate(() => Me.heat);
  ok("放っておくと熱が上がる", h1 > h0 + 0.5, { h0: +h0.toFixed(2), h1: +h1.toFixed(2) });

  // 水
  await tapBtn("water"); await sleep(120);
  const afterWater = await page.evaluate(() => ({ heat: Me.heat, water: Me.water }));
  ok("水で熱が下がり桶が減る", afterWater.heat < h1 && afterWater.water === 2, afterWater);

  // 段を下げると上昇が遅くなる
  const beforeTier = await page.evaluate(() => Seats.tierOf(me));
  await tapBtn("move"); await sleep(300);
  const afterTier = await page.evaluate(() => ({ want: Me.tier, got: Seats.tierOf(me), tiers: Seats.tiers }));
  ok("段を下げられる", afterTier.got > beforeTier, { beforeTier, ...afterTier });

  const s1 = await page.evaluate(() => Me.stam); await sleep(1500);
  const s2 = await page.evaluate(() => Me.stam);
  const lowDrain = (s1 - s2) / 1.5;
  const rates = await page.evaluate(() => {
    const hot = heatEquilibrium(0, Seats.tiers, false);           // 上段の落ち着き先
    const cool = heatEquilibrium(Seats.tiers - 1, Seats.tiers, false);
    return { hotEq: hot, coolEq: cool, hotDrain: drainRate(hot), coolDrain: drainRate(cool) };
  });
  ok("上段のほうが熱く、体力の減りも速い",
     rates.hotEq > rates.coolEq && rates.hotDrain > rates.coolDrain,
     { hotEq: +rates.hotEq.toFixed(1), coolEq: +rates.coolEq.toFixed(1),
       hotDrain: +rates.hotDrain.toFixed(3), coolDrain: +rates.coolDrain.toFixed(3) });
  ok("下段でも体力は減り続ける（安全地帯にしない）", lowDrain > 0, { lowDrain: +lowDrain.toFixed(3) });

  // 下段まで降りてから打つ → 手が届かない（段数は画面で変わるので最下段まで降りる）
  for (let i = 0; i < 6; i++){
    const atBottom = await page.evaluate(() => Seats.tierOf(me) === Seats.tiers - 1);
    if (atBottom) break;
    await tapBtn("move"); await sleep(300);
  }
  ok("最下段まで降りられる", await page.evaluate(() => Seats.tierOf(me) === Seats.tiers - 1),
     await page.evaluate(() => ({ got: Seats.tierOf(me), tiers: Seats.tiers })));
  await tapBtn("loyly"); await sleep(200);
  ok("下段からは打てない", await page.evaluate(() => App.events.loyly.length === 0));

  // 段を戻してからロウリュ → 予兆の間は熱が乗らない
  await tapBtn("move"); await sleep(300);
  const preHeat = await page.evaluate(() => Me.heat);
  await tapBtn("loyly"); await sleep(250);
  const telling = await page.evaluate(() => ({
    events: App.events.loyly.length,
    applied: App.events.loyly.map(e => e.applied),
    heat: Me.heat,
    tellActive: serverNow() - App.pressedAt < LOYLY_TELL
  }));
  ok("押した直後は予兆だけで熱は乗らない",
     telling.events === 1 && telling.applied[0] === false && telling.tellActive
     && telling.heat < preHeat + 3, { preHeat: +preHeat.toFixed(2), ...telling, heat: +telling.heat.toFixed(2) });
  await page.screenshot({ path: path.join(OUT, "b1-tell.png") });

  // 予兆中は誰も打てない（連打・二重取りの防止）
  await tapBtn("loyly"); await sleep(150);
  ok("予兆中は打てない", await page.evaluate(() => App.events.loyly.length === 1));

  // 予兆が切れたら降りてくる。熱は一気に乗らず、じんわり流れ込む
  // 着弾の瞬間を取り逃すと surge が流れ切ってしまうので、瞬間を狙って測る
  let justLanded = null;
  for (let i = 0; i < 80; i++){
    justLanded = await page.evaluate(() => ({
      applied: App.events.loyly.map(e => e.applied), heat: Me.heat, surge: Me.surge
    }));
    if (justLanded.applied[0]) break;
    await sleep(50);
  }
  ok("着弾した時点では熱がまだ乗り切っていない（じんわり）",
     justLanded.applied[0] === true && justLanded.surge > 5,
     { heat: +justLanded.heat.toFixed(2), surge: +justLanded.surge.toFixed(2) });
  await page.screenshot({ path: path.join(OUT, "b2-landed.png") });

  await sleep(1800);                                  // 流れ込みきるまで待つ
  const settled = await page.evaluate(() => ({ heat: Me.heat, surge: Me.surge }));
  ok("最終的にはロウリュぶんの熱が乗る",
     settled.heat > justLanded.heat + 6 && settled.surge < 1,
     { landed: +justLanded.heat.toFixed(2), settled: +settled.heat.toFixed(2), surge: +settled.surge.toFixed(2) });

  // ストーブの冷却中は打てない
  await tapBtn("loyly"); await sleep(150);
  ok("冷えるまで打てない", await page.evaluate(() => App.events.loyly.length === 1));

  // 体力は水では戻らない（延命であって解除ではない）
  const stamBefore = await page.evaluate(() => { Me.water = WATER_MAX; Me.heat = 80; return Me.stam; });
  await tapBtn("water"); await sleep(150);
  const afterW2 = await page.evaluate(() => ({ stam: Me.stam, heat: Me.heat }));
  ok("水は熱を下げるが体力は戻さない", afterW2.heat < 80 && afterW2.stam <= stamBefore,
     { stamBefore: +stamBefore.toFixed(2), ...afterW2 });

  // のぼせて床に座る（体力が尽きたとき）
  await page.evaluate(() => { Me.stam = 0.4; });
  await sleep(700);
  const outState = await page.evaluate(() => ({ out: Me.out, banner: App.banner && App.banner.text }));
  ok("体力が尽きたら出される", outState.out === true && outState.banner === "のぼせた", outState);
  await page.screenshot({ path: path.join(OUT, "b3-out.png") });
  ok("出されても部屋から消えない（床で観戦）", await page.evaluate(() => Net.present().length === 1));

  // 回の進行が時刻だけで決まる（通信なし）
  const rounds = await page.evaluate(() => {
    const cyc = ROUND_MS + GAP_MS;
    const base = Math.floor(serverNow() / cyc) * cyc;      // ある回の先頭
    const at = ms => roundState(base + ms);
    return {
      start: at(1000).running, nearEnd: at(ROUND_MS - 2000).running,
      inGap: at(ROUND_MS + 5000).running,
      gapCountsDown: at(ROUND_MS + 5000).toNext > 0,
      idxAdvances: at(cyc + 1000).idx === at(1000).idx + 1
    };
  });
  ok("回とその間が時刻だけで決まる",
     rounds.start && rounds.nearEnd && !rounds.inGap && rounds.gapCountsDown && rounds.idxAdvances, rounds);

  // 段ごとの定員。下段は席が少ないので溢れたら熱い段へ回される
  await page.evaluate(() => {
    const now = serverNow(), r = roundState(now).idx;
    Net.members = {};
    const last = Seats.tiers - 1;
    Net.members[me] = { t: now, j: now, s: "i", tier: last, heat: 10, st: 90, out: 0, r };
    for (let i = 0; i < 15; i++)                            // 全員が下段を希望する
      Net.members["p" + i] = { t: now, j: now - i * 1000, s: "i", tier: last,
                               heat: 20 + i * 4, st: 95 - i * 5, out: 0, r };
  });
  await sleep(500);
  const tiersOut = await page.evaluate(() => {
    const people = Net.present().filter(p => p.s === "i" && !p.out);
    const counts = {};
    for (const p of people){ const t = Seats.tierOf(p.id); counts[t] = (counts[t] || 0) + 1; }
    const capLast = Seats.byTier[Seats.tiers - 1].length;
    const seated = people.filter(p => Seats.tierOf(p.id) >= 0).length;
    return { people: people.length, counts, capLast, seated,
             lastWithinCap: (counts[Seats.tiers - 1] || 0) <= capLast, allSeated: seated === people.length };
  });
  ok("全員が席に着く", tiersOut.allSeated, tiersOut);
  ok("下段の定員を超えない（溢れたら熱い段へ）", tiersOut.lastWithinCap, tiersOut);
  await page.screenshot({ path: path.join(OUT, "b4-contention.png") });

  console.log("\n--- errors ---");
  console.log(errors.length ? errors.join("\n") : "(none)");
  await browser.close();
})();

