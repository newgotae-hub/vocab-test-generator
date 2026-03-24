import { defineConfig } from 'vite';
import { resolve } from 'path';
import fg from 'fast-glob';

import fs from 'fs';

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

function htmlPartials() {
  return {
    name: 'html-partials',
    enforce: 'pre',
    transformIndexHtml(html) {
      let newHtml = html;
      try {
        const marketingHeader = fs.readFileSync(resolve(__dirname, 'src/components/marketing-header.html'), 'utf-8');
        const appHeader = fs.readFileSync(resolve(__dirname, 'src/components/app-header.html'), 'utf-8');
        const marketingFooter = fs.readFileSync(resolve(__dirname, 'src/components/marketing-footer.html'), 'utf-8');
        
        newHtml = newHtml.replace(/<marketing-header><\/marketing-header>/g, marketingHeader);
        newHtml = newHtml.replace(/<app-header><\/app-header>/g, appHeader);
        newHtml = newHtml.replace(/<marketing-footer><\/marketing-footer>/g, marketingFooter);
      } catch (e) {
        // Ignore if components aren't ready
      }
      return newHtml;
    }
  }
}

export default defineConfig({
  plugins: [htmlPartials()],
  build: {
    rollupOptions: {
      input
    }
  }
});
