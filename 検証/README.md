# 検証ハーネス

既存のChromeをヘッドレスで動かして、`../index.html` を自動で確かめる。
**目視では気づけない不具合を何度も拾っているので、手を入れたら回す。**

## 準備（初回だけ）

```
cd 検証
npm init -y
npm i puppeteer-core
```

Chrome は `C:\Program Files\Google\Chrome\Application\chrome.exe` を使う（各スクリプト先頭の `executablePath`）。

## 走らせる

| コマンド | 何を見るか |
| --- | --- |
| `node battle.js` | 19項目。熱・体力・水・段・ロウリュの予兆と着弾・回の進行・席の定員 |
| `node breath.js` | 10項目。呼吸のリズム判定、整いで体力の減りが変わるか、心拍が生きているか |
| `node duo.js` | **6項目。2窓を繋いで「他人がいると成立するか」を見る。製品の中心** |
| `node smooth.js` | 3項目。ゲージ表示が跳ねずに追いつくか |
| `node perf.js` | 満室21人でのfps（60前後なら可） |
| `node shots.js` | 代表画面を6枚撮る（UI評価に投げる用） |
| `node ogp.js` | `../ogp.png` を実際のゲーム描画から作り直す |
| `node live.js` | 公開URL（GitHub Pages）が実際に動くか |

**`duo.js` はローカルサーバーが必要**（同一オリジンでないと窓どうしが繋がらない）。

```
cd ..
python -m http.server 8731
```

## つまずいた点（同じ罠を踏まないため）

- **回と回の間（50秒）に測ると全部落ちる。**その間は呼吸も熱も止まるのが正しい挙動。
  判定の前に `roundState(serverNow()).running` を待つこと。これで3回テストを直している
- **着弾の瞬間は狙って測る。**熱はじんわり流れ込むので、少し待つと `surge` が流れ切って
  「じんわり」を検証できない。`applied` が立つまで50ms間隔で回して掴む
- **ヒアドキュメントでスクリプトを書くとバックスラッシュが食われる**（`C:\Program Files` が壊れる）。
  ファイルとして書くこと

## UIの評価を外に投げる

`codex`（ログイン済み・`-i` で画像を渡せる）で見てもらえる。

```
cd ..
codex exec --sandbox read-only --skip-git-repo-check \
  -i 検証/shots/1-entrance.png -i 検証/shots/2-room.png \
  - < 検証/UI評価プロンプト.md
```

※ コードと画像が外部に送られる。`shots.js` の出力先は一時フォルダなので、
渡す前に `-i` のパスを実際の出力先に合わせる。
