import nextTs from 'eslint-config-next/typescript';
import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig, globalIgnores } from 'eslint/config';

const syntaxRules = [
  {
    selector: 'JSXOpeningElement[name.name="head"]',
    message:
      '禁止使用 head 标签，优先使用 metadata。三方 CSS、字体等资源可以在 globals.css 中顶部通过 @import 引入或者使用 next/font；preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入；json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld',
  },
];

const nextConfigRestrictedSyntaxRules = [
  {
    selector:
      'Property[key.name=/^(root|outputFileTracingRoot)$/] > Literal[value=/^\\//]',
    message:
      '禁止在 next.config 中写死绝对路径，请改用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。',
  },
];

// 可用 no-restricted-syntax 表达的静态语法规则
const perfSyntaxRules = [
  {
    selector:
      'CallExpression[callee.object.name="fs"][callee.property.name=/Sync$/]',
    message:
      '禁止在请求路径使用同步 fs API，会阻塞事件循环线程；请改用 fs/promises 并加缓存。',
  },
];

// 需要「上下文判断/数值比较」的性能规则：no-restricted-syntax 无法表达「force-dynamic 豁免」与「< 300 阈值」，
// 改用本地自定义规则。
const perfPlugin = {
  rules: {
    'no-cache-no-store': {
      meta: {
        type: 'problem',
        docs: { description: '禁止默认使用 cache: "no-store"' },
        messages: {
          noStore:
            '禁止默认使用 cache: "no-store"。优先 SSG/ISR，确需实时数据请在页面级声明 dynamic = "force-dynamic" 并说明原因。',
        },
        schema: [],
      },
      create(context) {
        const source = context.sourceCode.getText();
        const hasForceDynamic = /(?:const|let|var)\s+dynamic\s*=\s*['"]force-dynamic['"]/.test(
          source,
        );
        return {
          Property(node) {
            if (
              node.key?.type === 'Identifier' &&
              node.key.name === 'cache' &&
              node.value?.type === 'Literal' &&
              node.value.value === 'no-store'
            ) {
              // 同文件已声明 dynamic = "force-dynamic" 时豁免：这是显式的页面级实时决策，不再视为误用
              if (hasForceDynamic) return;
              context.report({ node, messageId: 'noStore' });
            }
          },
        };
      },
    },
    'revalidate-min-300': {
      meta: {
        type: 'problem',
        docs: { description: 'revalidate 建议 >= 300 秒' },
        schema: [],
      },
      create(context) {
        return {
          VariableDeclarator(node) {
            if (
              node.id?.type === 'Identifier' &&
              node.id.name === 'revalidate' &&
              node.init?.type === 'Literal' &&
              typeof node.init.value === 'number' &&
              node.init.value < 300
            ) {
              context.report({
                node,
                message:
                  'revalidate 建议 >= 300 秒，过短会在资源受限环境频繁触发后台重建。数据变更后请改用 revalidatePath()/revalidateTag()。',
              });
            }
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'import/no-cycle': ['error', { ignoreExternal: true }],
      'react-hooks/set-state-in-effect': 'off',
      'no-restricted-syntax': ['error', ...syntaxRules],
    },
  },
  {
    files: ['next.config.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...nextConfigRestrictedSyntaxRules],
    },
  },
  {
    // 性能规范即代码：渲染策略与服务端约束落到 src/app，避免只写在文档里被无视
    files: ['src/app/**/*.tsx', 'src/app/**/*.ts'],
    plugins: { perf: perfPlugin },
    rules: {
      'no-restricted-syntax': ['error', ...syntaxRules, ...perfSyntaxRules],
      // no-store 降为 warn + force-dynamic 豁免，避免 AI 生成合法实时页面被直接阻断
      'perf/no-cache-no-store': 'warn',
      'perf/revalidate-min-300': 'error',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Build artifacts:
    'server.js',
    'dist/**',
    // Script files (CommonJS):
    'scripts/**/*.js',
  ]),
]);

export default eslintConfig;
