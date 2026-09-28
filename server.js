/**
 * 超シンプル・リアルタイム掲示板（写真＆文字 同時送信対応版）
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
  message: DEFAULT_MESSAGE,
  image: null // Base64画像データ
};

// 画像データ（Base64）も受け取れるようにボディのサイズ制限を 10MB に拡張
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/** 最新データ取得（表示画面が 3 秒ごとに呼ぶ） */
app.get('/api/message', (_req, res) => {
  res.json(currentData);
});

/** データ更新（管理画面からテキストや画像を送信） */
app.post('/api/message', (req, res) => {
  const { message, image } = req.body;
  const text = typeof message === 'string' ? message.trim() : '';

  if (text.length > 2000) {
    return res.status(400).json({ error: 'メッセージは 2000 文字以内にしてください' });
  }

  currentData = {
    message: text || '',
    image: typeof image === 'string' ? image : null
  };

  res.json({ ok: true, data: currentData });
});

/** 表示をクリア（管理画面の「現在の表示をクリア」） */
app.post('/api/message/clear', (_req, res) => {
  currentData = {
    message: DEFAULT_MESSAGE,
    image: null
  };
  res.json({ ok: true, data: currentData });
});

/** 表示用 HTML（黒背景・写真と文字の同時表示・3 秒ポーリング） */
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
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      padding: 2vmin;
      text-align: center;
      gap: 1.5rem;
    }
    .image-view {
      max-width: 100%;
      max-height: 55vh;
      object-fit: contain;
      border-radius: 8px;
    }
    .text-view {
      font-size: clamp(1.5rem, 6vw, 8rem);
      font-weight: 700;
      line-height: 1.25;
      word-break: break-word;
      white-space: pre-wrap;
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
    let lastDataStr = '';

    async function fetchMessage() {
      try {
        const res = await fetch('/api/message', { cache: 'no-store' });
        if (!res.ok) throw new Error('取得失敗');
        const data = await res.json();
        
        const dataStr = JSON.stringify(data);
        if (dataStr !== lastDataStr) {
          lastDataStr = dataStr;
          
          let html = '';
          if (data.image) {
            html += '<img src="' + data.image + '" class="image-view">';
          }
          if (data.message) {
            html += '<div class="text-view">' + escapeHtml(data.message) + '</div>';
          } else if (!data.image) {
            html += '<div class="text-view">読み込み中…</div>';
          }
          board.innerHTML = html;
        }
        statusEl.textContent = '更新: ' + new Date().toLocaleTimeString('ja-JP');
      } catch (e) {
        statusEl.textContent = '接続エラー（再試行中）';
      }
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    fetchMessage();
    setInterval(fetchMessage, 3000);
  </script>
</body>
</html>`;
}

/** 管理用 HTML（文字と写真を同時に設定して送信） */
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
    label { display: block; margin-bottom: 0.35rem; font-size: 0.9rem; color: #0cc; font-weight: bold; }
    textarea {
      width: 100%;
      min-height: 6rem;
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
      display: block;
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
  <p class="hint">文字と写真を同時に（または片方だけでも）送信できます。</p>

  <div class="section">
    <label for="msg">メッセージ（文字）</label>
    <textarea id="msg" maxlength="2000" placeholder="例：これ買ってきたよ！美味しいよ"></textarea>

    <label for="imageInput" style="margin-top: 1rem;">写真（スマホのカメラやアルバム）</label>
    <input type="file" id="imageInput" accept="image/*">

    <button type="button" id="send">文字と写真を一緒に送信する</button>
  </div>

  <button type="button" id="clear" class="secondary">現在の表示をクリア（初期状態に戻す）</button>
  <div id="toast" role="status"></div>

  <p style="margin-top:1.5rem;font-size:0.85rem;color:#666;">
    <a href="/">← 表示画面を開く</a>
  </p>

  <div id="preview" aria-label="現在サーバーに保存されている内容">読み込み中…</div>

  <script>
    const msgEl = document.getElementById('msg');
    const imageInput = document.getElementById('imageInput');
    const sendBtn = document.getElementById('send');
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
        let html = '現在の表示:<br>';
        if (data.image) {
          html += '<img src="' + data.image + '">';
        }
        html += '<div style="margin-top:0.5rem;">' + (data.message || '（文字なし）') + '</div>';
        preview.innerHTML = html;
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
      showToast('クリア中…', true);
      try {
        const res = await fetch('/api/message/clear', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(data.error || 'クリアに失敗しました', false);
          return;
        }
        showToast('表示をクリアしました', true);
        msgEl.value = '';
        imageInput.value = '';
        loadCurrent();
      } catch {
        showToast('ネットワークエラー', false);
      } finally {
        clearBtn.disabled = false;
        sendBtn.disabled = false;
      }
    });

    sendBtn.addEventListener('click', async () => {
      const message = msgEl.value.trim();
      const file = imageInput.files[0];

      if (!message && !file) {
        showToast('文字または写真のどちらかを入力してください', false);
        return;
      }

      sendBtn.disabled = true;
      showToast('送信中…', true);

      const postData = async (imageBase64) => {
        try {
          const res = await fetch('/api/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: message,
              image: imageBase64
            })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            showToast(data.error || '送信に失敗しました', false);
            return;
          }
          showToast('送信しました！', true);
          msgEl.value = '';
          imageInput.value = '';
          loadCurrent();
        } catch {
          showToast('ネットワークエラー', false);
        } finally {
          sendBtn.disabled = false;
        }
      };

      if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
          postData(event.target.result);
        };
        reader.readAsDataURL(file);
      } else {
        postData(null);
      }
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