/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  // GitHub Pages では https://oshiro17.github.io/chamber-designer/ に置くため、ビルド時だけサブパスにする
  base: command === 'build' ? '/chamber-designer/' : '/',
  plugins: [react(), tailwindcss()],
  test: {
    include: ['src/**/*.test.ts'],
  },
}))
