/** Browser event handlers return void; surface transport failures instead of dropping rejections. */
export function uiTask(
  action: () => Promise<unknown>,
  report: (error: unknown) => void,
): () => void {
  return () => {
    void Promise.resolve().then(action).catch(report)
  }
}
