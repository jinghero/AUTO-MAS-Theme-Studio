export function errorMessage(error: unknown, fallback = '操作失败'): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : fallback
}
