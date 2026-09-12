/// <reference types="vite/client" />

interface ImportMetaEnv {
  // "1" = use the in-browser mock of the order API (src/api/mock.ts). Set by `npm run dev:mock`.
  readonly VITE_MOCK_API?: string;
}
