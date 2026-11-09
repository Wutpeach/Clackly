import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import black from 'starlight-theme-black';
export default defineConfig({
  site: 'https://wutpeach.github.io', base: '/Clackly', trailingSlash: 'always',
  integrations: [starlight({
    title: 'Clackly', description: 'Clackly · A keyboard-first command palette for DaVinci Resolve. 使用指南与 AI 扩展开发。',
    favicon: '/favicon.ico?v=252b7f13',
    head: [{ tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: '/Clackly/favicon.svg?v=e4fe9146' } }],
    plugins: [black({ docs: { showMarkdownActions: false } })], customCss: ['./src/styles/docs.css'],
    logo: { src: './public/clackly-compact.svg', alt: '' },
    components: { MarkdownContent: './src/components/MarkdownContent.astro' },
    defaultLocale: 'root',
    locales: { root: { label: '简体中文', lang: 'zh-CN' }, en: { label: 'English', lang: 'en' } },
    social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/Wutpeach/Clackly' }],
    sidebar: [
      { label: '开始使用', translations: { en: 'Get started' }, items: [
        { slug: 'docs', label: '文档概览', translations: { en: 'Overview' } },
        { slug: 'docs/install', label: '下载与安装', translations: { en: 'Download & install' } },
        { slug: 'docs/first-use', label: '首次使用', translations: { en: 'First use' } },
      ] },
      { label: '日常工作流', translations: { en: 'Everyday workflows' }, items: [
        { slug: 'docs/launcher', label: 'Launcher 与搜索', translations: { en: 'Launcher & search' } },
        { slug: 'docs/settings', label: 'Settings', translations: { en: 'Settings' } },
        { slug: 'docs/extensions', label: '扩展管理', translations: { en: 'Manage extensions' } },
        { slug: 'docs/command-ui-views', label: 'Command UI 与 Views', translations: { en: 'Command UI & Views' } },
        { slug: 'docs/updates', label: '升级', translations: { en: 'Updates' } },
        { slug: 'docs/troubleshooting', label: '常见问题与排错', translations: { en: 'Troubleshooting' } },
        { slug: 'docs/releases', label: '发行历史', translations: { en: 'Release history' } },
      ] },
      { label: 'Build with AI', items: [
        { slug: 'docs/developer', label: '开发入门', translations: { en: 'Build with AI' } },
        { slug: 'docs/developer/skill', label: '安装 Developer Skill', translations: { en: 'Install the Skill' } },
        { slug: 'docs/developer/prompts', label: 'Agent 提示词', translations: { en: 'Agent prompts' } },
        { slug: 'docs/developer/examples', label: '官方示例', translations: { en: 'Official examples' } },
        { slug: 'docs/developer/verify', label: '验证与打包', translations: { en: 'Verify & package' } },
      ] },
      { label: '协议参考', translations: { en: 'Protocol reference' }, items: [
        { slug: 'docs/developer/reference/extension-v1', label: 'Manifest 与生命周期', translations: { en: 'Manifest & lifecycle' } },
        { slug: 'docs/developer/reference/command-ui', label: 'Command UI' },
        { slug: 'docs/developer/reference/prepare', label: '动态 Prepare', translations: { en: 'Dynamic Prepare' } },
        { slug: 'docs/developer/reference/views', label: 'Extension Views' },
      ] },
    ],
  })],
});
