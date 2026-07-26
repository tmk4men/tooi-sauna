// OGPカードを「実際のゲーム描画」から組む。モックではない
// 1) 縦長で本物を1枚撮る 2) 1200x630 に配置して文字を置く
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = "C:/Users/tomok/OneDrive/デスクトップ/とおいサウナ/ogp.png";
const SHOT_W = 470, SHOT_H = 630;

(async () => {
  const b = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: ["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"]
  });
  const errs = [];

  // ---- 1) 本物のゲーム画面を1枚 ----
  const p = await b.newPage();
  p.on("pageerror", e => errs.push("PAGEERROR: " + e.message));
  await p.setViewport({ width: SHOT_W, height: SHOT_H, deviceScaleFactor: 2 });
  await p.goto("file:///C:/Users/tomok/OneDrive/デスクトップ/とおいサウナ/index.html?open=1&fast=1&room=ogp", { waitUntil: "load" });
  await sleep(600);
  await p.mouse.click(SHOT_W / 2, SHOT_H / 2);
  await sleep(700);

  // 回が始まった直後を狙う（回の間の案内が出ていると絵にならない）
  let aligned = false;
  for (let i = 0; i < 200; i++){
    const r = await p.evaluate(() => { const s = roundState(serverNow()); return { run: s.running, left: s.left, total: ROUND_MS }; });
    if (r.run && r.left > r.total * 0.55){ aligned = true; break; }
    await sleep(300);
  }
  console.log("回に合わせた:", aligned);

  await p.evaluate(() => {
    const now = serverNow(), r = roundState(now).idx;
    Net.members = {};
    Net.members[me] = { t: now, j: now, s: "i", tier: 1, heat: 52, st: 66, out: 0, r };
    [0,0,0,1,1,1,1,2,2].forEach((tier, i) => {
      Net.members["og" + i] = { t: now, j: now - i * 4000, s: "i", tier,
                                heat: 36 + i * 6, st: 90 - i * 7, out: 0, r };
    });
    Me.heat = 52; Me.dHeat = 52; Me.stam = 66; Me.dStam = 66; Me.calm = 0.85;
    Me.bPhase = 0.03; Me.out = false; Me.played = 1;      // 案内文は出さない
    App.pressedAt = serverNow() - LOYLY_ROOM - 400;        // 石が赤熱＝打てる状態
  });
  await sleep(900);
  const state = await p.evaluate(() => ({ running: roundState(serverNow()).running, people: Net.present().length }));
  console.log("撮影時:", state);
  const shot = await p.screenshot({ encoding: "base64" });

  // ---- 2) カードに組む ----
  const q = await b.newPage();
  q.on("pageerror", e => errs.push("PAGEERROR(card): " + e.message));
  await q.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await q.goto("about:blank");
  const png = await q.evaluate(async (b64, sw, sh) => {
    const W = 1200, H = 630;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");

    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#0b0806"); bg.addColorStop(0.55, "#150e0a"); bg.addColorStop(1, "#241609");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    const img = new Image();
    await new Promise(res => { img.onload = res; img.src = "data:image/png;base64," + b64; });

    // 右側に本物の画面。左端はぼかして地に溶かす
    const dw = Math.round(H * (sw / sh)), dx = W - dw, dy = 0;   // 右端に寄せる
    g.save();
    g.beginPath(); g.rect(dx, dy, dw, H); g.clip();
    g.drawImage(img, dx, dy, dw, H);
    const fade = g.createLinearGradient(dx, 0, dx + dw * 0.42, 0);
    fade.addColorStop(0, "rgba(13,9,6,1)"); fade.addColorStop(1, "rgba(13,9,6,0)");
    g.fillStyle = fade; g.fillRect(dx, 0, dw * 0.42, H);
    g.restore();
    const warm = g.createRadialGradient(dx + dw * 0.5, H * 0.78, 10, dx + dw * 0.5, H * 0.78, dw * 0.9);
    warm.addColorStop(0, "rgba(255,140,50,0.16)"); warm.addColorStop(1, "rgba(255,110,30,0)");
    g.fillStyle = warm; g.fillRect(0, 0, W, H);

    // 左に文字
    const F = "'Hiragino Sans','Yu Gothic UI','Noto Sans JP',sans-serif";
    const L = 78;
    g.strokeStyle = "rgba(255,170,90,0.9)"; g.lineWidth = 4; g.lineCap = "round";
    g.beginPath(); g.moveTo(L, 196); g.lineTo(L + 66, 196); g.stroke();

    g.textAlign = "left";
    g.fillStyle = "#f4ebe1";
    g.font = "600 82px " + F;
    g.fillText("とおいサウナ", L, 286);

    g.fillStyle = "rgba(244,235,225,0.88)";
    g.font = "500 30px " + F;
    g.fillText("喋らずに熱さを競うオンラインサウナ", L, 340);

    g.fillStyle = "rgba(255,176,100,0.96)";
    g.font = "500 24px " + F;
    g.fillText("全員が本当に同じ炎を見ている", L, 392);
    g.fillStyle = "rgba(244,235,225,0.55)";
    g.font = "500 22px " + F;
    g.fillText("毎時00分と30分に、15分だけ開く", L, 428);

    return cv.toDataURL("image/png").split(",")[1];
  }, shot, SHOT_W * 2, SHOT_H * 2);

  fs.writeFileSync(OUT, Buffer.from(png, "base64"));
  console.log("wrote:", OUT);
  console.log("errors:", errs.length ? errs.join(" | ") : "(none)");
  await b.close();
})();
