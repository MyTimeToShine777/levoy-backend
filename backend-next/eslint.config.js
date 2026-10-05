// Minimal lint config: its job is to catch undefined identifiers (a missing
// require after moving code between files) — not to police style.
module.exports = [
  {
    files: ['src/**/*.js', 'scripts/**/*.js', 'test/**/*.js'],
    
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly', module: 'writable', exports: 'writable', process: 'readonly',
        console: 'readonly', __dirname: 'readonly', __filename: 'readonly', Buffer: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        setImmediate: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', fetch: 'readonly',
        FormData: 'readonly', Blob: 'readonly', AbortController: 'readonly', TextDecoder: 'readonly',
        TextEncoder: 'readonly', structuredClone: 'readonly', BigInt: 'readonly',
      },
    },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }] },
  },
];
