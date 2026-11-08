import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import type { Plugin, RollupOptions } from 'rollup'

// Dependencies contain U+2013 and U+2014 (mostly in comments). Writing them as \u escapes
// keeps the meaning of any string or regex literal and keeps the bundle free of them.
function escapeDashes(): Plugin {
  return {
    name: 'escape-dashes',
    renderChunk(code) {
      return {
        code: code.replace(/[\u2013\u2014]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16)}`),
        map: null
      }
    }
  }
}

const config: RollupOptions = {
  input: 'src/index.ts',
  // Optional native module that proxy-agent-negotiate loads with a guarded dynamic import, only
  // for Negotiate proxy authentication; it is never bundled.
  external: ['kerberos'],
  output: {
    file: 'dist/index.js',
    format: 'es',
    sourcemap: false,
    inlineDynamicImports: true
  },
  plugins: [
    typescript({ tsconfig: './tsconfig.build.json' }),
    nodeResolve({ preferBuiltins: true, exportConditions: ['node'] }),
    commonjs(),
    json(),
    escapeDashes()
  ],
  onwarn(warning, warn) {
    if (warning.code === 'CIRCULAR_DEPENDENCY' || warning.code === 'THIS_IS_UNDEFINED') return
    warn(warning)
  }
}

export default config
