/** Serialize writes; an older completion must not replace the newest save status. */
export function createDraftQueue<T>(
  persist: (snapshot: T) => Promise<void>,
  status: (error?: unknown) => void,
) {
  let queue = Promise.resolve(),
    revision = 0
  return {
    save(snapshot: T): Promise<void> {
      const current = ++revision
      queue = queue
        .catch(() => {})
        .then(async () => {
          try {
            await persist(snapshot)
            if (current === revision) status()
          } catch (error) {
            if (current === revision) status(error)
            throw error
          }
        })
      return queue
    },
  }
}
