import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LSUPERAGENT',
    short_name: 'LSUPERAGENT',
    description: 'Your AI. Your rules.',
    start_url: '/',
    display: 'standalone',
    background_color: '#05070b',
    theme_color: '#05070b',
  }
}
