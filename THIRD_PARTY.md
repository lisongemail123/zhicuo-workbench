# Third-party components

- **Tesseract.js 7.0.0** — Apache-2.0. Browser entry and worker are vendored in `dist/vendor/tesseract/`; the license is included there. Regenerate them with `npm run vendor:ocr` after `npm ci`.
- **Tesseract.js-core 7.0.0** and Tesseract language data are downloaded by the browser OCR worker when needed. Default core URL: `https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0`; language URL: `https://tessdata.projectnaptha.com/4.0.0_fast`. The selected photo is processed in the browser, not uploaded to these asset hosts. Language data is cached by Tesseract.js in the browser.
- **esbuild** is a build-time dependency. The hosted Worker bundles the application and static JavaScript assets; it has no Node.js runtime dependency.

Official implementation references: [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md), [OpenAI Chat API](https://platform.openai.com/docs/api-reference/chat/create), [DeepSeek API](https://api-docs.deepseek.com/), [Qwen compatibility](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope), [SiliconFlow Chat API](https://docs.siliconflow.cn/docs/api/chat-completions-post), [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create).
