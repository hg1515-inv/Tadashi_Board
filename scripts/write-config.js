/**
 * Render ビルド時など: 環境変数から public/js/config.js を生成
 */
const fs = require('fs');
const path = require('path');

const outPath = path.join(__dirname, '..', 'public', 'js', 'config.js');
const examplePath = path.join(__dirname, '..', 'public', 'js', 'config.example.js');

const url = process.env.SUPABASE_URL || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';

if (url && anonKey) {
  const body = `/** ビルド時自動生成 — 手編集しない */\nwindow.SUPABASE_CONFIG = {\n  url: ${JSON.stringify(url)},\n  anonKey: ${JSON.stringify(anonKey)}\n};\n`;
  fs.writeFileSync(outPath, body, 'utf8');
  console.log('config.js を環境変数から生成しました');
} else if (!fs.existsSync(outPath) && fs.existsSync(examplePath)) {
  fs.copyFileSync(examplePath, outPath);
  console.warn('SUPABASE_URL / SUPABASE_ANON_KEY 未設定 — config.example.js を config.js にコピーしました');
} else {
  console.log('config.js は既存のまま利用します');
}
