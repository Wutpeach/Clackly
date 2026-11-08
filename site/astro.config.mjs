import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import black from 'starlight-theme-black';
export default defineConfig({
  site: 'https://wutpeach.github.io', base: '/Clackly', trailingSlash: 'always',
  integrations: [starlight({
    title: 'Clackly', description: 'Clackly · A keyboard-first command palette for DaVinci Resolve. 使用指南与 AI 扩展开发。',
    favicon: '/mark.svg', plugins: [black({ docs: { showMarkdownActions: false } })], customCss: ['./src/styles/docs.css'],
    logo: { src: './public/mark.svg', alt: '' },
    components: { MarkdownContent: './src/components/MarkdownContent.astro' },
    locales: { root: { label: '简体中文', lang: 'zh-CN' }, en: { label: 'English', lang: 'en' } },
    social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/Wutpeach/Clackly' }],
    sidebar: [
      { label: '开始使用', translations: { en: 'Get started' }, items: ['docs', 'docs/install', 'docs/first-use'] },
      { label: '日常工作流', translations: { en: 'Everyday workflows' }, items: ['docs/launcher', 'docs/settings', 'docs/extensions', 'docs/command-ui-views', 'docs/updates', 'docs/troubleshooting', 'docs/releases'] },
      { label: 'Build with AI', items: ['docs/developer', 'docs/developer/skill', 'docs/developer/prompts', 'docs/developer/examples', 'docs/developer/verify'] },
      { label: '协议参考 · Developer Skill', translations: { en: 'Reference · Developer Skill' }, items: ['docs/developer/reference/extension-v1', 'docs/developer/reference/command-ui', 'docs/developer/reference/prepare', 'docs/developer/reference/views'] },
    ],
  })],
});
