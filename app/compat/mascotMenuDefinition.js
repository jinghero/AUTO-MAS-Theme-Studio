"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MASCOT_MENU = void 0;
exports.normalizeMascotMenu = normalizeMascotMenu;
const assetPackageService_1 = require("./assetPackageService");
/** 旧包使用同一协议的内置布局，不要求重新制作素材包。 */
exports.DEFAULT_MASCOT_MENU = {
    protocolVersion: 1,
    layout: 'list',
    items: [
        { capability: 'task.start', icon: '▶' },
        { capability: 'task.stop', icon: '■' },
        { separator: true },
        { capability: 'idle.refresh', icon: '↻' },
        { capability: 'idle.toggle', icon: '✉' },
        { capability: 'animation.toggle', icon: '❚❚' },
    ],
};
function normalizeMascotMenu(value) {
    if (value === undefined)
        return undefined;
    const raw = (0, assetPackageService_1.assertPlainObject)(value, 'mascot.menu');
    if (raw.protocolVersion !== 1)
        (0, assetPackageService_1.fail)('mascot.menu.protocolVersion 不受支持');
    if (raw.layout !== undefined && raw.layout !== 'list' && raw.layout !== 'grid')
        (0, assetPackageService_1.fail)('mascot.menu.layout 不受支持');
    if (!Array.isArray(raw.items) || !raw.items.length || raw.items.length > 24)
        (0, assetPackageService_1.fail)('mascot.menu.items 需要 1 到 24 个菜单项');
    const seen = new Set();
    const items = raw.items.map((value) => {
        const item = (0, assetPackageService_1.assertPlainObject)(value, 'mascot.menu.items');
        if (item.separator === true)
            return { separator: true };
        if (typeof item.capability !== 'string' ||
            !/^[a-z][a-z0-9.-]{0,63}$/.test(item.capability) ||
            seen.has(item.capability))
            (0, assetPackageService_1.fail)('mascot.menu.items.capability 无效或重复');
        seen.add(item.capability);
        if (item.icon !== undefined && (typeof item.icon !== 'string' || item.icon.length > 8))
            (0, assetPackageService_1.fail)('mascot.menu.items.icon 需要不超过 8 个字符的文本');
        return { capability: item.capability, ...(item.icon === undefined ? {} : { icon: item.icon }) };
    });
    if (!seen.size)
        (0, assetPackageService_1.fail)('mascot.menu.items 至少需要一个能力项');
    let style;
    if (raw.style !== undefined) {
        const input = (0, assetPackageService_1.assertPlainObject)(raw.style, 'mascot.menu.style');
        style = {};
        const ranges = { width: [160, 480], radius: [0, 32], fontSize: [12, 20], itemHeight: [32, 64] };
        for (const [key, [min, max]] of Object.entries(ranges)) {
            const value = (0, assetPackageService_1.assertOptionalNumber)(input[key], `mascot.menu.style.${key}`, min, max);
            if (value !== undefined)
                Object.assign(style, { [key]: value });
        }
        for (const key of ['background', 'text', 'border', 'accent']) {
            const color = input[key];
            if (color === undefined)
                continue;
            if (typeof color !== 'string' || !/^#[\da-f]{6}([\da-f]{2})?$/i.test(color))
                (0, assetPackageService_1.fail)(`mascot.menu.style.${key} 需要十六进制颜色`);
            style[key] = color;
        }
    }
    return {
        protocolVersion: 1,
        layout: raw.layout ?? 'list',
        items,
        ...(style ? { style } : {}),
    };
}
