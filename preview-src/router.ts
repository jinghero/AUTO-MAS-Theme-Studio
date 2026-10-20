import { createRouter, createMemoryHistory } from 'vue-router'
import Home from './Home.vue'
import ComponentPreview from './ComponentPreview.vue'
export const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/home', component: Home },
    ...[
      'scripts',
      'plans',
      'emulators',
      'queue',
      'scheduler',
      'gamesign',
      'history',
      'theme-store',
      'settings',
    ].map((name) => ({ path: `/${name}`, component: ComponentPreview })),
  ],
})
export const navigateTo = (path: string) => router.push(path)
