import type { GeneratorSettings } from './types/studio'
import { iconSet } from './icons'
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
    '创作一个鼠标箭头光标素材：单个箭头，尖端朝向左上角，主体位于方形画布中央且完整可见，保留小幅透明边距。使用粗而清晰的外轮廓、大色块和极简细节，保证缩小到32至64像素后仍可识别。透明背景，无阴影、无底板、无场景，不要光标合集、文字、字母或水印。',
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
}
export function iconPrompt(config: GeneratorSettings, key: string) {
  const icon = iconSet.find((item) => item.key === key)!
  return `${config.prompt}\n\n本次只绘制「${icon.label}」的单个图标。用途：${icon.purpose}。\n专属要求：${config.iconPrompts?.[key]?.trim() || icon.subject}。\n沿用共同的画风、配色、线条粗细和原参考图风格；保持简洁清晰，主体居中、完整可见，透明背景。不要图标合集、其他菜单的符号、文字、字母或水印。`
}
export function generationMetadata(config: GeneratorSettings, key: string) {
  return {
    target: config.target,
    model: config.model,
    style: config.style,
    prompt: config.target === 'icon' ? iconPrompt(config, key) : config.prompt,
    ...(config.target === 'icon'
      ? {
          iconKey: key,
          basePrompt: config.prompt,
          iconSubject:
            config.iconPrompts?.[key]?.trim() || iconSet.find((icon) => icon.key === key)!.subject,
        }
      : {}),
  }
}
