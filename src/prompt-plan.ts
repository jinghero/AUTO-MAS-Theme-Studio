import type { PromptPlan, TargetPrompt } from './types/studio'
import { targetKeys, targets } from './generation'
import { iconSet } from './icons'
import { cursorSet } from './cursors'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('整套提示词格式无效，请重新生成')
  return value as Record<string, unknown>
}
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new Error(`${label}需要在 1–${max} 字以内，请补齐后重试`)
  return value.trim()
}
export function parsePromptPlan(value: unknown): PromptPlan {
  const raw = object(value),
    source = object(raw.targets),
    icons = object(raw.iconPrompts)
  const prompts = Object.fromEntries(
    targetKeys.map((key) => {
      const item = object(source[key])
      return [
        key,
        {
          style: text(item.style, `${targets[key]}的灵感风格`, 800),
          prompt: text(item.prompt, `${targets[key]}的提示词`, 16000),
        } satisfies TargetPrompt,
      ]
    }),
  ) as PromptPlan['targets']
  return {
    targets: prompts,
    cursorPrompts: Object.fromEntries(
      cursorSet.map((cursor) => [
        cursor.key,
        text(object(raw.cursorPrompts)[cursor.key], `${cursor.label}的专属提示词`, 1200),
      ]),
    ),
    iconPrompts: Object.fromEntries(
      iconSet.map((icon) => [icon.key, text(icons[icon.key], `${icon.label}的专属提示词`, 1200)]),
    ),
  }
}
