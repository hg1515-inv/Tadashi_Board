/**
 * 超シンプル・リアルタイム掲示板（写真対応版）
 * - 表示画面: / ?mode=admin なし
 * - 管理画面: /?mode=admin
 * データはサーバー メモリ上のみ（再起動で消えます）
 */

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

/** クリア後・初期表示の文言 */
const DEFAULT_MESSAGE = 'メッセージを待っています…';

/** 現在表示するデータ（DB なし・メモリのみ） */
let currentData = {
  type: 'text', // 'text' または 'image'
  content: DEFAULT_MESSAGE
};

// 画像データ（Base64）も受け取れるようにボディのサイズ制限を 10MB に拡張
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/** 最新データ取得（表示画面が 3 秒ごとに呼ぶ） */
app.get('/api/message', (_req, res) => {
  res.json(currentData);
});

/** データ更新（管理画面からテキストまたは画像を送信） */
app.post('/api/message', (req, res) => {
  const { type, content } = req.body;

  // 画像の場合
  if (type === 'image') {
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: '画像データが不正です' });
    }
    currentData = { type: 'image', content };
    return res.json({ ok: true, data: currentData });
  }

  // テキストの場合
  const body = req.body?.message || content;
  const text = typeof body === 'string' ? body.trim() : '';

  if (!text) {
    return res.status(400).json({ error: 'メッセージが空です' });
  }

  if (text.length > 2000) {
    return res.status(400).json({ error: 'メッセージは 2000 文字以内にしてください' });
  }

  currentData = { type: 'text', content: text };
  res.json({ ok: true, data: currentData });
});

/** 表示をクリア（管理画面の「現在の表示をクリア」） */
app.post('/api/message/clear', (_req, res) => {
  currentData = { type: 'text', content: DEFAULT_MESSAGE };
  res.json({ ok: true, data: currentData });
});

/** 表示用 HTML（黒背景・シアン・特大文字 ＆ 写真全画面表示・3 秒ポーリング） */
function viewerPageHtml() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>掲示板（表示）</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
      color: #00ffff;
      font-family: "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif;
    }
    #board {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      padding: 2vmin;
      text-align: center;
    }
    .text-view {
      font-size: clamp(2rem, 8vw, 12rem);
      font-weight: 700;
      line-height: 1.25;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .image-view {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 8px;
    }
    #status {
      position: fixed;
      bottom: 0.5rem;
      right: 0.75rem;
      font-size: 0.75rem;
      color: #006666;
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <div id="board" aria-live="polite">読み込み中…</div>
  <div id="status">3 秒ごとに更新</div>
  <script>
    const board = document.getElementById('board');
    const statusEl = document.getElementById('status');
    let lastType = '';
    let lastContent = '';

    async function fetchMessage() {
      try {
        const res = await fetch('/api/message', { cache: 'no-store' });
        if (!res.ok) throw new Error('取得失敗');
        const data = await res.json();

        if (data.type !== lastType || data.content !== lastContent) {
          lastType = data.type;
          lastContent = data.content;

          if (data.type === 'image') {
            board.innerHTML = '<img src="' + data.content + '" class="image-view">';
          } else {
            board.innerHTML = '';
            const textDiv = document.createElement('div');
            textDiv.className = 'text-view';
            textDiv.textContent = data.content || '';
            board.appendChild(textDiv);
          }
        }
        statusEl.textContent = '更新: ' + new Date().toLocaleTimeString('ja-JP');
      } catch (e) {
        statusEl.textContent = '接続エラー（再試行中）';
      }
    }

    fetchMessage();
    setInterval(fetchMessage, 3000);
  </script>
</body>
</html>`;
}

/** 管理用 HTML（テキストエリア＋写真ファイル選択＋送信） */
function adminPageHtml() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>掲示板（管理）</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif;
      max-width: 40rem;
      margin: 0 auto;
      padding: 1.25rem;
      background: #111;
      color: #eee;
      min-height: 100vh;
    }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; color: #00ffff; }
    p.hint { font-size: 0.875rem; color: #888; margin-bottom: 1rem; }
    .section {
      background: #1a1a1a;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      border: 1px solid #333;
    }
    label { display: block; margin-bottom: 0.35rem; font-size: 0.9rem; color: #0cc; }
    textarea {
      width: 100%;
      min-height: 7rem;
      padding: 0.75rem;
      font-size: 1rem;
      border: 1px solid #333;
      border-radius: 6px;
      background: #222;
      color: #fff;
      resize: vertical;
    }
    input[type="file"] {
      width: 100%;
      padding: 0.5rem;
      background: #222;
      border: 1px solid #333;
      border-radius: 6px;
      color: #fff;
      margin-bottom: 0.5rem;
    }
    button {
      margin-top: 0.75rem;
      width: 100%;
      padding: 0.85rem;
      font-size: 1rem;
      font-weight: 600;
      border: none;
      border-radius: 6px;
      background: #00aaaa;
      color: #000;
      cursor: pointer;
    }
    button.image-btn { background: #28a745; color: #fff; }
    button:active { opacity: 0.85; }
    button:disabled { opacity: 0.5; cursor: wait; }
    button.secondary {
      background: #333;
      color: #ccc;
      border: 1px solid #555;
    }
    #preview {
      margin-top: 1.25rem;
      padding: 0.75rem;
      background: #000;
      color: #00ffff;
      border-radius: 6px;
      font-size: 0.95rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    #preview img {
      max-width: 100%;
      height: auto;
      margin-top: 0.5rem;
      border-radius: 4px;
    }
    #toast {
      margin-top: 0.75rem;
      font-size: 0.875rem;
      min-height: 1.25rem;
    }
    #toast.ok { color: #6f6; }
    #toast.err { color: #f66; }
    a { color: #0cc; }
  </style>
</head>
<body>
  <h1>掲示板・管理画面</h1>
  <p class="hint">文字や写真を送信すると、表示用 PC の画面が最大 3 秒以内に更新されます。</p>

  <!-- テキスト送信セクション -->
  <div class="section">
    <label for="msg">文字を送る</label>
    <textarea id="msg" maxlength="2000" placeholder="ここに文字を入力…"></textarea>
    <button type="button" id="send">文字を送信する</button>
  </div>

  <!-- 写真送信セクション -->
  <div class="section">
    <label for="imageInput">写真を送る（スマホの写真やカメラ）</label>
    <input type="file" id="imageInput" accept="image/*">
    <button type="button" id="sendImage" class="image-btn">写真を送信する</button>
  </div>

  <button type="button" id="clear" class="secondary">現在の表示をクリア（初期状態に戻す）</button>
  <div id="toast" role="status"></div>

  <p style="margin-top:1.5rem;font-size:0.85rem;color:#666;">
    <a href="/">← 表示画面を開く</a>
  </p>

  <div id="preview" aria-label="現在サーバーに保存されている内容">読み込み中…</div>

  <script>
    const msgEl = document.getElementById('msg');
    const sendBtn = document.getElementById('send');
    const imageInput = document.getElementById('imageInput');
    const sendImageBtn = document.getElementById('sendImage');
    const clearBtn = document.getElementById('clear');
    const toast = document.getElementById('toast');
    const preview = document.getElementById('preview');

    function showToast(text, ok) {
      toast.textContent = text;
      toast.className = ok ? 'ok' : 'err';
    }

    async function loadCurrent() {
      try {
        const res = await fetch('/api/message', { cache: 'no-store' });
        const data = await res.json();
        if (data.type === 'image') {
          preview.innerHTML = '現在の表示: [画像]<br><img src="' + data.content + '">';
        } else {
          preview.textContent = '現在の表示: ' + (data.content || '（空）');
        }
      } catch {
        preview.textContent = '現在の表示を取得できませんでした';
      }
    }

    clearBtn.addEventListener('click', async () => {
      if (!confirm('表示画面を初期状態に戻します。よろしいですか？')) {
        return;
      }
      clearBtn.disabled = true;
      sendBtn.disabled = true;
      sendImageBtn.disabled = true;
      showToast('クリア中…', true);
      try {
        const res = await fetch('/api/message/clear', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(data.error || 'クリアに失敗しました', false);
          return;
        }
        showToast('表示をクリアしました', true);
        loadCurrent();
      } catch {
        showToast('ネットワークエラー', false);
      } finally {
        clearBtn.disabled = false;
        sendBtn.disabled = false;
        sendImageBtn.disabled = false;
      }
    });

    // 文字送信
    sendBtn.addEventListener('click', async () => {
      const message = msgEl.value.trim();
      if (!message) {
        showToast('メッセージを入力してください', false);
        return;
      }
      sendBtn.disabled = true;
      showToast('送信中…', true);
      try {
        const res = await fetch('/api/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'text', content: message })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(data.error || '送信に失敗しました', false);
          return;
        }
        showToast('文字を送信しました', true);
        msgEl.value = '';
        loadCurrent();
      } catch {
        showToast('ネットワークエラー', false);
      } finally {
        sendBtn.disabled = false;
      }
    });

    // 写真送信
    sendImageBtn.addEventListener('click', async () => {
      if (imageInput.files.length === 0) {
        showToast('写真を選択してください', false);
        return;
      }
      const file = imageInput.files[0];

      sendImageBtn.disabled = true;
      showToast('写真を変換・送信中…', true);

      const reader = new FileReader();
      reader.onload = async function(event) {
        try {
          const base64Image = event.target.result;
          const res = await fetch('/api/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'image', content: base64Image })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            showToast(data.error || '写真の送信に失敗しました', false);
            return;
          }
          showToast('写真を送信しました', true);
          imageInput.value = '';
          loadCurrent();
        } catch {
          showToast('ネットワークエラー', false);
        } finally {
          sendImageBtn.disabled = false;
        }
      };
      reader.readAsDataURL(file);
    });

    loadCurrent();
    setInterval(loadCurrent, 5000);
  </script>
</body>
</html>`;
}

/** ルート: mode=admin で管理画面、それ以外は表示画面 */
app.get('/', (req, res) => {
  const mode = req.query.mode;
  if (mode === 'admin') {
    res.type('html').send(adminPageHtml());
  } else {
    res.type('html').send(viewerPageHtml());
  }
});

app.listen(PORT, () => {
  console.log(`掲示板サーバー起動: http://localhost:${PORT}`);
  console.log(`  表示画面: http://localhost:${PORT}/`);
  console.log(`  管理画面: http://localhost:${PORT}/?mode=admin`);
});