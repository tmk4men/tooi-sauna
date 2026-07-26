const puppeteer = require("puppeteer-core");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (n, c, e) => console.log((c ? "PASS  " : "FAIL  ") + n + (e !== undefined ? "  " + JSON.stringify(e) : ""));

(async () => {
  const b = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: ["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"]
  });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const errs = [];
  p.on("pageerror", e => errs.push("PAGEERROR: " + e.message));
  await p.goto("file:///C:/Users/tomok/OneDrive/デスクトップ/とおいサウナ/index.html?open=1&fast=1&room=smooth", { waitUntil: "load" });
  await sleep(500);
  await p.mouse.click(195, 422);
  await sleep(600);
  for (let i = 0; i < 120; i++){
    if (await p.evaluate(() => roundState(serverNow()).running)) break;
    await sleep(400);
  }

  // 実値を一気に動かしたとき、表示が遅れて追いつくか
  const jump = await p.evaluate(() => { Me.heat = 20; Me.dHeat = 20; Me.heat = 85; return { heat: Me.heat, dHeat: Me.dHeat }; });
  await sleep(90);
  const mid = await p.evaluate(() => ({ heat: Me.heat, dHeat: Me.dHeat }));
  await sleep(1200);
  const end = await p.evaluate(() => ({ heat: Me.heat, dHeat: Me.dHeat }));
  ok("表示は実値に遅れて追いつく（跳ねない）",
     mid.dHeat < mid.heat - 5 && Math.abs(end.dHeat - end.heat) < 3,
     { jumpTo: jump.heat, after90ms: +mid.dHeat.toFixed(1), after1_3s: +end.dHeat.toFixed(1) });

  // 熱の自然な上がり方が以前より緩いか（1秒あたりの上昇量）
  const rate = await p.evaluate(() => {
    const eq = heatEquilibrium(1, Seats.tiers, false);
    return { eq, perSecAtZero: +((eq - 0) * HEAT_K).toFixed(2), HEAT_K };
  });
  ok("熱はじんわり上がる（毎秒の伸びが小さい）", rate.perSecAtZero < 8, rate);

  // 他人の姿勢も滑らかに追従するか
  const look = await p.evaluate(() => {
    const now = serverNow(), r = roundState(now).idx;
    Net.members["sm1"] = { t: now, j: now, s: "i", tier: 1, heat: 10, st: 100, out: 0, r };
    return true;
  });
  await sleep(300);
  await p.evaluate(() => { Net.members["sm1"].heat = 95; Net.members["sm1"].st = 20; });
  await sleep(90);
  const l1 = await p.evaluate(() => { const o = Look.get("sm1"); return o ? { heat: +o.heat.toFixed(1), stam: +o.stam.toFixed(1) } : null; });
  await sleep(1500);
  const l2 = await p.evaluate(() => { const o = Look.get("sm1"); return o ? { heat: +o.heat.toFixed(1), stam: +o.stam.toFixed(1) } : null; });
  ok("他人の見た目も段階的に飛ばず追従する",
     l1 && l2 && l1.heat < 60 && l2.heat > 85, { after90ms: l1, after1_6s: l2 });

  console.log("errors:", errs.length ? errs.join(" | ") : "(none)");
  await b.close();
})();
