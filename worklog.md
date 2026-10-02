# Tadashi Board 作業ログ

## 2025-09-29（初版）

- Node.js + Express の単一 `server.js` / `package.json` を新規作成。
- `/` 表示画面（黒・シアン・特大文字）、`/?mode=admin` 管理画面。
- メッセージはメモリ変数のみ。3 秒ポーリングで `GET /api/message`。
- 管理から `POST /api/message`、日本語 UI・コメント。

## 2025-09-29（追記）

- 管理画面に **「現在の表示をクリア」** を追加。
- `POST /api/message/clear`、初期文言 `メッセージを待っています…` に復帰。

## 2025-09-29 〜 2026-03（機能拡張・未コミット履歴）

- **写真＋文字の同時送信** に拡張（Base64 をメモリ保持、JSON 10MB 制限）。
- 表示・管理双方で画像プレビュー対応。
- Render Web Service デプロイで **メモリ・容量消費が大きい** 問題が顕在化。

## 2026-10-01

- 要件整理: Render **Static Site** 化、**Supabase** 連携。
- 表示は **最新 3 件の自動ループ**、DB/Storage も **3 件超を自動削除** で無料枠節約。
- `spec.md` / `worklog.md` を作成。
- v2 実装:
  - `public/` 静的サイト（`index.html` + `js/app.js` + Supabase JS CDN）。
  - `supabase/schema.sql`（RLS、Storage、3 件トリム、 `clear_all_posts` RPC）。
  - `scripts/write-config.js` + Render 向け `npm run build`。
  - 旧 Express 版を `legacy/server.js` へ移動。

## 2026-10-02（追記）

- `spec.md` のローカル開発セクションを拡充。
  - 前提条件・初回セットアップ手順・`config.js` 設定方法を明記。
  - アクセス URL 一覧・動作確認手順・トラブルシューティング表を追加。
  - `anonKey` は JWT 形式（`eyJ...`）必須である旨を注意として記載。
