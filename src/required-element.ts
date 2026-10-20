export function requiredElement<K extends keyof HTMLElementTagNameMap>(
  id: string,
  tag: K,
): HTMLElementTagNameMap[K] {
  const node = document.getElementById(id)
  if (!node || node.localName !== tag)
    throw new Error(`界面元素 ${id} 缺失或类型错误（需要 ${tag}）`)
  return node as HTMLElementTagNameMap[K]
}
export function validateElements(tags: Record<string, keyof HTMLElementTagNameMap>): void {
  for (const [id, tag] of Object.entries(tags)) requiredElement(id, tag)
}
