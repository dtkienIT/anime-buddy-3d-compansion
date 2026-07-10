import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

const globals = {
  AbortController: "readonly",
  AbortSignal: "readonly",
  AnalyserNode: "readonly",
  AudioContext: "readonly",
  AudioBufferSourceNode: "readonly",
  AudioWorkletNode: "readonly",
  Blob: "readonly",
  Buffer: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  crypto: "readonly",
  CustomEvent: "readonly",
  document: "readonly",
  DOMException: "readonly",
  Event: "readonly",
  EventTarget: "readonly",
  fetch: "readonly",
  File: "readonly",
  FormData: "readonly",
  Headers: "readonly",
  HTMLAudioElement: "readonly",
  HTMLButtonElement: "readonly",
  HTMLCanvasElement: "readonly",
  HTMLElement: "readonly",
  HTMLFormElement: "readonly",
  HTMLTextAreaElement: "readonly",
  Image: "readonly",
  localStorage: "readonly",
  MessageEvent: "readonly",
  MutationObserver: "readonly",
  navigator: "readonly",
  performance: "readonly",
  process: "readonly",
  requestAnimationFrame: "readonly",
  Request: "readonly",
  ReadableStream: "readonly",
  ReadableStreamDefaultReader: "readonly",
  Response: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
  window: "readonly",
  HTMLInputElement: "readonly",
  IDBDatabase: "readonly",
  indexedDB: "readonly",
  confirm: "readonly",
  prompt: "readonly"
};

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "**/dist/**",
      "coverage/**",
      "app.bundle.js",
      "vendor/**",
      ".uv-cache/**",
      "apps/web/public/**",
      "apps/tts/.venv/**",
      "apps/tts/cache/**",
      "apps/tts/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      },
      globals
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "args": "none" }],
      "no-unused-vars": "off",
      "no-console": "off"
    }
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals
    },
    rules: {
      "no-console": "off"
    }
  }
];
