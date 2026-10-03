/**
 * Tadashi Board v2 — Supabase 連携（表示ループ / 管理）
 */
(function () {
  const DEFAULT_MESSAGE = 'メッセージを待っています…';
  const MAX_POSTS = 3;
  const SLIDE_SECONDS = 8;
  const POLL_MS = 5000;
  const BUCKET = 'board-images';

  const isAdmin = new URLSearchParams(window.location.search).get('mode') === 'admin';

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /** Project URL のみ（/rest/v1 は付けない） */
  function normalizeSupabaseUrl(url) {
    return String(url || '')
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/rest\/v1\/?$/i, '');
  }

  function getConfig() {
    const c = window.SUPABASE_CONFIG || {};
    const url = normalizeSupabaseUrl(c.url);
    if (!url || !c.anonKey || url.includes('xxxxxxxx')) {
      return null;
    }
    return { url: url, anonKey: c.anonKey };
  }

  function createClient() {
    const cfg = getConfig();
    if (!cfg) return null;
    return window.supabase.createClient(cfg.url, cfg.anonKey);
  }

  function publicImageUrl(client, path) {
    if (!path) return null;
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  async function fetchLatestPosts(client) {
    const { data, error } = await client
      .from('posts')
      .select('id, message, image_path, created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_POSTS);
    if (error) throw error;
    return data || [];
  }

  /** 表示: 最新 3 件をスライドショー */
  function initViewer() {
    document.body.className = 'viewer-root';
    const board = document.getElementById('board');
    const statusEl = document.getElementById('status');
    const loopEl = document.getElementById('loop-indicator');

    const client = createClient();
    if (!client) {
      board.innerHTML = '<div class="text-view">Supabase 未設定（config.js を確認）</div>';
      return;
    }

    let posts = [];
    let slideIndex = 0;
    let slideTimer = null;
    let postsSignature = '';

    function renderSlide() {
      if (posts.length === 0) {
        board.innerHTML = '<div class="text-view">' + escapeHtml(DEFAULT_MESSAGE) + '</div>';
        loopEl.textContent = '';
        return;
      }
      const p = posts[slideIndex % posts.length];
      let html = '';
      const imgUrl = publicImageUrl(client, p.image_path);
      if (imgUrl) {
        html += '<img src="' + escapeHtml(imgUrl) + '" class="image-view" alt="">';
      }
      if (p.message) {
        html += '<div class="text-view">' + escapeHtml(p.message) + '</div>';
      } else if (!imgUrl) {
        html += '<div class="text-view">' + escapeHtml(DEFAULT_MESSAGE) + '</div>';
      }
      board.innerHTML = html;
      loopEl.textContent =
        posts.length > 1
          ? 'スライド ' + (slideIndex % posts.length + 1) + ' / ' + posts.length
          : '';
    }

    function restartSlideTimer() {
      if (slideTimer) clearInterval(slideTimer);
      slideTimer = setInterval(function () {
        if (posts.length <= 1) return;
        slideIndex = (slideIndex + 1) % posts.length;
        renderSlide();
      }, SLIDE_SECONDS * 1000);
    }

    async function refresh() {
      try {
        const next = await fetchLatestPosts(client);
        const sig = JSON.stringify(next.map(function (x) { return x.id; }));
        if (sig !== postsSignature) {
          postsSignature = sig;
          posts = next;
          slideIndex = 0;
          renderSlide();
          restartSlideTimer();
        }
        statusEl.textContent =
          'Supabase 接続 OK · 投稿 ' +
          next.length +
          ' 件 · ' +
          new Date().toLocaleTimeString('ja-JP');
      } catch (e) {
        statusEl.textContent =
          'Supabase 接続エラー: ' + (e && e.message ? e.message : '再試行中');
      }
    }

    refresh();
    setInterval(refresh, POLL_MS);
    restartSlideTimer();
  }

  /** 画像をリサイズして JPEG Blob に（容量節約） */
  function compressImage(file, maxWidth) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          function (blob) {
            if (blob) resolve(blob);
            else reject(new Error('画像の圧縮に失敗しました'));
          },
          'image/jpeg',
          0.82
        );
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('画像を読み込めませんでした'));
      };
      img.src = url;
    });
  }

  /** 管理画面 */
  function initAdmin() {
    document.body.className = 'admin-root';
    const warnEl = document.getElementById('config-warn');
    const msgEl = document.getElementById('msg');
    const imageInput = document.getElementById('imageInput');
    const sendBtn = document.getElementById('send');
    const clearBtn = document.getElementById('clear');
    const toast = document.getElementById('toast');
    const previewList = document.getElementById('preview-list');

    const client = createClient();
    if (!client) {
      warnEl.hidden = false;
      sendBtn.disabled = true;
      clearBtn.disabled = true;
      return;
    }
    warnEl.hidden = true;

    function showToast(text, ok) {
      toast.textContent = text;
      toast.className = ok ? 'ok' : 'err';
    }

    async function loadPreview() {
      try {
        const rows = await fetchLatestPosts(client);
        if (rows.length === 0) {
          previewList.innerHTML =
            '<div class="preview-item">（投稿なし — 表示画面は初期メッセージ）</div>';
          return;
        }
        previewList.innerHTML = rows
          .map(function (p, i) {
            const imgUrl = publicImageUrl(client, p.image_path);
            let inner = '<div class="preview-meta">#' + (i + 1) + ' · ' + new Date(p.created_at).toLocaleString('ja-JP') + '</div>';
            if (imgUrl) {
              inner += '<img src="' + escapeHtml(imgUrl) + '" alt="">';
            }
            inner += '<div>' + escapeHtml(p.message || '（文字なし）') + '</div>';
            return '<div class="preview-item">' + inner + '</div>';
          })
          .join('');
      } catch {
        previewList.innerHTML = '<div class="preview-item">一覧の取得に失敗しました</div>';
      }
    }

    clearBtn.addEventListener('click', async function () {
      if (!confirm('すべての投稿を削除し、表示を初期状態に戻します。よろしいですか？')) {
        return;
      }
      clearBtn.disabled = true;
      sendBtn.disabled = true;
      showToast('クリア中…', true);
      try {
        // 1. 全投稿を取得して image_path を収集
        const { data: allPosts, error: fetchErr } = await client
          .from('posts')
          .select('id, image_path');
        if (fetchErr) throw fetchErr;

        // 2. Storage 画像を Storage API で削除（直接 DB テーブル削除は不可）
        const paths = (allPosts || []).map(function (p) { return p.image_path; }).filter(Boolean);
        if (paths.length > 0) {
          const { error: storageErr } = await client.storage.from(BUCKET).remove(paths);
          if (storageErr) console.warn('Storage 削除エラー（続行）:', storageErr.message);
        }

        // 3. posts テーブルを全削除（RLS: anon DELETE 許可済み）
        const { error: delErr } = await client
          .from('posts')
          .delete()
          .gte('created_at', '1970-01-01T00:00:00Z'); // 全件対象
        if (delErr) throw delErr;

        showToast('表示をクリアしました', true);
        msgEl.value = '';
        imageInput.value = '';
        loadPreview();
      } catch (e) {
        showToast(e.message || 'クリアに失敗しました', false);
      } finally {
        clearBtn.disabled = false;
        sendBtn.disabled = false;
      }
    });

    sendBtn.addEventListener('click', async function () {
      const message = msgEl.value.trim();
      const file = imageInput.files[0];
      if (!message && !file) {
        showToast('文字または写真のどちらかを入力してください', false);
        return;
      }
      if (message.length > 2000) {
        showToast('メッセージは 2000 文字以内にしてください', false);
        return;
      }

      sendBtn.disabled = true;
      clearBtn.disabled = true;
      showToast('送信中…', true);

      try {
        let imagePath = null;
        if (file) {
          const blob = await compressImage(file, 1600);
          const name = crypto.randomUUID() + '.jpg';
          const { error: upErr } = await client.storage.from(BUCKET).upload(name, blob, {
            contentType: 'image/jpeg',
            upsert: false
          });
          if (upErr) throw upErr;
          imagePath = name;
        }

        const { error: insErr } = await client.from('posts').insert({
          message: message,
          image_path: imagePath
        });
        if (insErr) {
          if (imagePath) {
            await client.storage.from(BUCKET).remove([imagePath]);
          }
          throw insErr;
        }

        showToast('送信しました（最新 ' + MAX_POSTS + ' 件のみ保持）', true);
        msgEl.value = '';
        imageInput.value = '';
        loadPreview();
      } catch (e) {
        showToast(e.message || '送信に失敗しました', false);
      } finally {
        sendBtn.disabled = false;
        clearBtn.disabled = false;
      }
    });

    loadPreview();
    setInterval(loadPreview, POLL_MS);
  }

  if (isAdmin) {
    initAdmin();
  } else {
    initViewer();
  }
})();
