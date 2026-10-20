import { ref } from 'vue'
export const useRouteLock = () => ({
  isRouteLocked: ref(false),
  triggerBlockCallback: (_target?: string) => {},
})
