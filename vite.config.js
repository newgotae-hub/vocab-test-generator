import { defineConfig } from 'vite';
import { resolve } from 'path';
import fg from 'fast-glob';

const htmlFiles = fg.sync([
  '*.html',
  'auth/**/*.html',
  'author/**/*.html',
  'blog/**/*.html',
  'cards/**/*.html',
  'contact/**/*.html',
  'dashboard/**/*.html',
  'game/**/*.html',
  'generator/**/*.html',
  'mypage/**/*.html',
  'ranked/**/*.html',
  'signup/**/*.html',
  'stats/**/*.html',
  'test/**/*.html'
]);

const input = {};
htmlFiles.forEach((file) => {
  const name = file.replace(/\.html$/, '').replace(/\//g, '_');
  input[name] = resolve(__dirname, file);
});

export default defineConfig({
  build: {
    rollupOptions: {
      input
    }
  }
});
