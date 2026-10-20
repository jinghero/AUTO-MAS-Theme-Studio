import { _electron } from '@playwright/test'

export async function launch(options: Parameters<typeof _electron.launch>[0]) {
  const application = await _electron.launch(options)
  application.context().setDefaultTimeout(30_000)
  const close = application.close.bind(application)
  application.close = async () => {
    let forced = false
    const timer = setTimeout(() => {
      forced = true
      application.process().kill()
    }, 5000)
    timer.unref()
    try {
      await close()
    } catch (error) {
      if (!forced) throw error
    } finally {
      clearTimeout(timer)
    }
  }
  return application
}
