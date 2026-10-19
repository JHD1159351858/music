const description = `Next.js（复杂项目）：\`coder init \${CODER_PROJECTS_PATH} --template nextjs\`
- 适用：全栈应用、复杂多页面等复杂项目
- 使用默认nextjs项目规范
    - **目录规范**： 默认开启src目录（打开--src-dir选项）：项目文件（如 app 目录、pages 目录、components 等）初始化到 src/ 目录下。
    - **项目理解加速**：初始可以依赖项目下 \`package.json\` 文件理解项目类型，如果没有或无法理解退化成阅读其他文件。
    - **UI设计与组件规范**：Next.js项目**必须默认**采用 shadcn/ui 风格和规范，\`shadcn/ui\`组件默认完整的预装在\`src/components/ui/\`目录下`;

export const paramsSchema = {
  type: "object",
  properties: {
    appName: {
      type: "string",
      minLength: 1,
      pattern: "^[a-z0-9-]+$",
      description:
        "Application name (lowercase, alphanumeric and hyphens only)",
    },
    port: {
      type: "number",
      default: 5000,
      minimum: 1024,
      maximum: 65535,
      description: "Development server port (for Next.js dev server)",
    },
  },
  required: [],
  additionalProperties: false,
};

const config = {
  description: description,
  paramsSchema,

  // 显式定义默认参数，确保在渲染时可用
  defaultParams: {
    port: 5000,
    appName: "projects",
  },

  onBeforeRender: async (context) => {
    console.log(`Creating Next.js project: ${context.appName}`);
    return context;
  },

  onAfterRender: async (_context, _outputPath) => {
    // 输出由 init 命令统一处理
  },

  onComplete: async (_context, _outputPath) => {},
};

export default config;
