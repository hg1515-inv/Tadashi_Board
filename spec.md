# Tadashi Board 仕様書

## 概要

余った PC の大画面にメッセージ（＋任意で写真）を表示する、超シンプルな掲示板。

| フェーズ | ホスティング | データ |
|---------|-------------|--------|
| v1（完了） | Render Web Service（Node + Express） | サーバー メモリ |
| **v2（本番目標）** | **Render Static Site** | **Supabase（DB + Storage）** |

---

## v1 仕様（Express・メモリ保持）— 参考・レガシー

### 画面

- **表示** `/` … 黒背景・シアン文字。写真＋文字を同時表示。3 秒ごとに `GET /api/message` でポーリング。
- **管理** `/?mode=admin` … テキスト（最大 2000 字）・画像（Base64 で POST）。「現在の表示をクリア」で初期文言に戻す。

### API

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/message` | `{ message, image }`（image は Data URL または null） |
| POST | `/api/message` | body: `{ message, image }` |
| POST | `/api/message/clear` | 初期状態へ |

### 制約・課題

- 再起動でデータ消失。
- Render Web Service では Base64 画像をメモリに載せるため **メモリ・転送量が大きい**。
- 常時起動の Node プロセスが無料枠を圧迫しやすい。

実装ファイル: `legacy/server.js`（移行前の `server.js` を保管）。

---

## v2 仕様（Static Site + Supabase）— 本番

### 目的

- Render **Static Site** のみで配信（ビルド成果物は静的 HTML/JS/CSS）。
- 投稿の永続化と画像は **Supabase**（無料枠を意識し **最新 3 件のみ** DB に残す）。
- **表示側**は最新 3 件を **自動ループ**（スライドショー）で表示。

### 画面

- **表示** `/`（`index.html`）  
  - 黒背景・シアン。1 件ずつ全画面表示。  
  - 最新 3 件を一定秒数（例: 8 秒）ごとにローテーション。  
  - バックグラウンドで数秒ごとに Supabase から再取得し、新規投稿を反映。
- **管理** `/?mode=admin`（同一 `index.html`、クエリで切替）  
  - 文字・写真送信（写真は **Storage** にアップロード、DB には URL/パスのみ）。  
  - プレビュー（最新 3 件）。  
  - 「表示をクリア」… 全投稿削除（Storage 上の画像も削除）。

### データモデル（Supabase）

**テーブル `posts`**

| 列 | 型 | 説明 |
|----|-----|------|
| id | uuid PK | 自動 |
| message | text | 表示文言（空可） |
| image_path | text nullable | Storage オブジェクトパス |
| created_at | timestamptz | 降順で最新 3 件を利用 |

**Storage バケット `board-images`**（public 読取）

- 挿入後 DB トリガーで **4 件目以降の行を削除**し、削除行の `image_path` に紐づくオブジェクトを Storage から削除。

### セキュリティ（無料・静的サイト前提）

- ブラウザに **anon key** を埋め込むため、完全な秘匿は不可（v1 と同様、URL を知っていれば投稿可能）。
- RLS: **全員 SELECT**。**INSERT / DELETE** は anon に許可（個人・家庭内利用想定）。必要なら後から Auth や Edge Function で強化。

### 設定

| 変数 | 用途 |
|------|------|
| `SUPABASE_URL` | プロジェクト URL |
| `SUPABASE_ANON_KEY` | 公開 anon key |

ローカル: `public/js/config.js`（`config.example.js` をコピー）。  
Render: ビルド時 `scripts/write-config.js` が環境変数から `config.js` を生成。

### Render Static Site

- **Root Directory**: （リポジトリルート）
- **Build Command**: `npm run build`
- **Publish Directory**: `public`

### ローカル開発

#### 前提条件

- Node.js 18 以上（`node -v` で確認）
- Supabase プロジェクトを作成済みで `posts` テーブル・Storage バケット・RLS・トリガーをセットアップ済み  
  （未実施の場合は `supabase/schema.sql` を Supabase の SQL Editor で実行）

#### 初回セットアップ

```powershell
# 1. 依存パッケージのインストール
npm install

# 2. Supabase 設定ファイルの作成
#    config.example.js をコピーして config.js を生成（build スクリプトが自動実行）
npm run build
```

`public/js/config.js` を開き、Supabase ダッシュボードの  
**Project Settings → API** から取得した値を設定する:

```js
window.SUPABASE_CONFIG = {
  url: 'https://<プロジェクト参照ID>.supabase.co',  // Project URL
  anonKey: 'eyJ...'                                   // anon public（JWT 形式）
};
```

> **注意**: `anonKey` は `eyJ` で始まる長い JWT 文字列です。  
> 短い文字列が入っている場合は Supabase ダッシュボードで正しい値を確認してください。

#### 開発サーバーの起動

```powershell
npx serve public
```

ブラウザで以下を開く:

| URL | 説明 |
|-----|------|
| `http://localhost:3000/` | 表示画面（スライドショー） |
| `http://localhost:3000/?mode=admin` | 管理画面（投稿・クリア） |

#### 動作確認

1. 管理画面（`?mode=admin`）でメッセージを入力し「送信する」をクリック。
2. 表示画面（`/`）にリダイレクトして、ステータスバーに **「Supabase 接続 OK · 投稿 N 件」** と表示されれば成功。
3. ブラウザの開発者ツール（F12）→ **Console / Network** タブでエラーがないことを確認。

#### トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `Supabase 未設定` と表示 | `config.js` の URL / anonKey が未設定 | 正しい値を設定して再リロード |
| `401 Unauthorized` | `anonKey` が不正（非 JWT 形式など） | ダッシュボードから `anon public` キーを再コピー |
| `403 Forbidden` | RLS ポリシーが未設定 | `schema.sql` を SQL Editor で再実行 |
| `500 Internal Server Error` | DB トリガーのエラー | `trim_posts_keep_three` 関数をダッシュボードのログで確認 |
| 画像アップロード失敗 | Storage バケットが未作成 or ポリシー不足 | `schema.sql` の Storage 設定部分を再実行 |

---

## 非機能

- UI・コメントは日本語。
- 画像はクライアント側でリサイズ/圧縮してからアップロード（容量節約）。
