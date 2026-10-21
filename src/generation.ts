import type { GeneratorSettings, StudioState, AssetBatch } from './types/studio'
import { iconSet } from './icons'
import { cursorSet } from './cursors'
export const targetKeys = ['background', 'cover', 'icon', 'mascot', 'cursor'] as const
export const targets = {
  background: '主题背景',
  cover: '主题封面',
  icon: '菜单图标',
  mascot: '静态桌宠',
  cursor: '鼠标光标',
}
export const templates = {
  background:
    '创作一张用于桌面管理软件的横向背景插画。画面宁静、低对比、层次柔和，细节适度。左侧约四分之一及中间区域留出干净、低细节的空间，方便覆盖导航和半透明卡片；视觉主体放在右侧或右下角。画面完整铺满，不画软件界面、按钮、边框和设备模型。无文字、无字母、无标志、无水印。',
  cover:
    '创作一张横向主题包展示封面。使用一个清晰的视觉主体和简洁的画面层次，构图完整，缩小后仍然有辨识度，延续同一主题的色彩与气质。只画艺术插画，不画软件截图、手机或电脑样机。无文字、无字母、无标志、无水印。',
  icon: '创作一个用于软件侧边栏的小图标，单个主体，居中，四周留出约15%的安全间距。轮廓简洁、粗线条、大色块、色彩统一，不堆砌小细节。缩小到24像素依然清晰可辨。透明背景，不要投影、底板、外框或场景；不要图标合集，不要文字、字母、标志或水印。',
  mascot:
    '创作一个单独的可爱桌宠角色，全身完整可见，正面或轻微四分之三视角，居中构图，四周留白，表情友好。造型简洁有辨识度、轮廓干净，适合缩小后显示在桌面角落。透明背景，不要地面、底板、场景或投影。只画一个角色的一张静态形象；不要动画图集、多视图、重复角色、文字、标志或水印。',
  cursor:
    '创作一套风格统一的鼠标光标素材，包含默认箭头、手形指针和 I 形文本光标，每次仅绘制指定的一项。主体居中完整可见，保留小幅透明边距。使用清晰外轮廓、大色块和极简细节，缩小到32至64像素仍可识别。透明背景，无阴影、底板或场景，不要光标合集、文字、标志或水印。',
}
export const defaults: GeneratorSettings = {
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-image-2',
  target: 'background',
  style: '清新森林、鼠尾草绿与奶油白、柔和手绘、安静温暖',
  size: '1536x1024',
  quality: '',
  responseFormat: '',
  transparent: false,
  visionModel: '',
  visionSeparate: false,
  visionBaseURL: 'https://api.openai.com/v1',
  iconBatch: false,
  iconKey: 'default',
  cursorBatch: false,
  cursorKey: 'default',
}
export function isBatch(result: StudioState['aiResult']): result is AssetBatch {
  return result?.kind === 'icon-batch' || result?.kind === 'cursor-batch'
}
export function rememberTargetPrompt(config: GeneratorSettings) {
  if (config.prompt === undefined) return
  config.targetPrompts ||= {}
  config.targetPrompts[config.target] = { style: config.style, prompt: config.prompt }
}
const referenceGuidance =
  '有参考图时，提取实际可见的主辅色、轮廓笔触、材质与代表性纹样，简化后应用到当前主体的具体部位；不直接复制整张参考画面，不臆造不可见细节。无参考图时按共同风格绘制。'
function composedPrompt(prompt: string, label: string) {
  if (prompt.trim().length > 16000)
    throw new Error(
      `${label}的完整提示词（含专属要求）超过 16000 字，请缩短共同提示词或该项专属提示词`,
    )
  return prompt
}
export function iconPrompt(config: GeneratorSettings, key: string) {
  const icon = iconSet.find((item) => item.key === key)!
  return composedPrompt(
    `${config.prompt}\n\n本次只绘制「${icon.label}」的单个图标。用途：${icon.purpose}。\n专属要求：${config.iconPrompts?.[key]?.trim() || icon.subject}。\n参考特征：${referenceGuidance}\n构图与辨识：主体居中约占画布七成，四周约15%留白，关键部件分离清楚，缩小至24像素仍可识别；沿用共同画风和线条粗细，透明背景。不要图标合集、其他菜单的符号、文字、字母或水印。`,
    icon.label,
  )
}
export function assetPrompt(config: GeneratorSettings, key: string) {
  if (config.target === 'icon') return iconPrompt(config, key)
  if (config.target !== 'cursor') return config.prompt || ''
  const cursor = cursorSet.find((item) => item.key === key)!
  return composedPrompt(
    `${config.prompt}\n\n本次只绘制「${cursor.label}」，用途：${cursor.purpose}。\n专属要求：${config.cursorPrompts?.[key]?.trim() || cursor.subject}。\n参考特征：${referenceGuidance}\n构图与辨识：保持当前光标的功能轮廓和朝向，装饰不遮挡尖端或中心；单个光标居中，四周少量透明留白，透明背景，缩小至32像素仍轮廓连贯。不要其他光标、合集、文字、热点标记或背景。`,
    cursor.label,
  )
}
export function generationMetadata(config: GeneratorSettings, key: string) {
  return {
    target: config.target,
    model: config.model,
    style: config.style,
    prompt: assetPrompt(config, key),
    ...(config.target === 'icon'
      ? {
          iconKey: key,
          basePrompt: config.prompt,
          iconSubject:
            config.iconPrompts?.[key]?.trim() || iconSet.find((icon) => icon.key === key)!.subject,
        }
      : {}),
    ...(config.target === 'cursor'
      ? {
          cursorKey: key,
          basePrompt: config.prompt,
          cursorSubject:
            config.cursorPrompts?.[key]?.trim() ||
            cursorSet.find((item) => item.key === key)!.subject,
        }
      : {}),
  }
}
