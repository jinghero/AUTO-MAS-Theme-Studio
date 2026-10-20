"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeAppearance = exports.isAppearanceGone = exports.listAppearances = exports.readAppearancePackage = exports.validateAppearanceManifest = exports.getAppearanceRoot = exports.AppearanceError = exports.APPEARANCE_LIMITS = void 0;
exports.inspectAppearancePackage = inspectAppearancePackage;
exports.importAppearancePackage = importAppearancePackage;
exports.getAppearance = getAppearance;
const path = require("path");
const assetPackageService_1 = require("./assetPackageService");
const mascotManifest_1 = require("./mascotManifest");
var assetPackageService_2 = require("./assetPackageService");
Object.defineProperty(exports, "APPEARANCE_LIMITS", { enumerable: true, get: function () { return assetPackageService_2.ASSET_PACKAGE_LIMITS; } });
Object.defineProperty(exports, "AppearanceError", { enumerable: true, get: function () { return assetPackageService_2.AssetPackageError; } });
const APPEARANCE_MENU_ICON_KEYS = [
    'home',
    'scripts',
    'plans',
    'emulators',
    'queue',
    'scheduler',
    'gameSign',
    'history',
    'tools',
    'themeStore',
    'settings',
    'testRouter',
    'ocrDev',
    'overlayMaskDev',
    'updateDownloadDev',
];
const APPEARANCE_CURSOR_KEYS = ['default', 'pointer', 'text'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const APPEARANCE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const POSITION = /^(?:left|center|right)(?:\s+(?:top|center|bottom))?$/;
function assertOptionalHex(value, name) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || !HEX_COLOR.test(value))
        (0, assetPackageService_1.fail)(`${name} 必须是 #rrggbb 颜色`);
    return value.toLowerCase();
}
function assertHotspot(value, name) {
    if (value === undefined ||
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > 63) {
        if (value === undefined)
            return 0;
        (0, assetPackageService_1.fail)(`${name} 必须是 0 到 63 的整数`);
    }
    return value;
}
function normalizeManifest(value) {
    const raw = (0, assetPackageService_1.assertPlainObject)(value, 'theme.json');
    if (raw.formatVersion !== 1)
        (0, assetPackageService_1.fail)('不支持的外观包版本');
    const id = (0, assetPackageService_1.assertString)(raw.id, 'id', 64);
    if (!APPEARANCE_ID.test(id))
        (0, assetPackageService_1.fail)('id 只能包含小写字母、数字、下划线和短横线');
    if (WINDOWS_DEVICE_NAME.test(id))
        (0, assetPackageService_1.fail)('id 不能使用 Windows 保留名');
    const name = (0, assetPackageService_1.assertString)(raw.name, 'name', 80);
    const description = raw.description === undefined ? undefined : (0, assetPackageService_1.assertString)(raw.description, 'description', 300);
    if (raw.mode !== 'light' && raw.mode !== 'dark')
        (0, assetPackageService_1.fail)('mode 必须是 light 或 dark');
    const rawTokens = (0, assetPackageService_1.assertPlainObject)(raw.tokens, 'tokens');
    const colorPrimary = assertOptionalHex(rawTokens.colorPrimary, 'tokens.colorPrimary');
    if (!colorPrimary)
        (0, assetPackageService_1.fail)('tokens.colorPrimary 是必填项');
    const tokens = {
        colorPrimary,
        colorBgLayout: assertOptionalHex(rawTokens.colorBgLayout, 'tokens.colorBgLayout'),
        colorBgContainer: assertOptionalHex(rawTokens.colorBgContainer, 'tokens.colorBgContainer'),
        colorBgElevated: assertOptionalHex(rawTokens.colorBgElevated, 'tokens.colorBgElevated'),
        colorText: assertOptionalHex(rawTokens.colorText, 'tokens.colorText'),
        colorTextSecondary: assertOptionalHex(rawTokens.colorTextSecondary, 'tokens.colorTextSecondary'),
        colorBorder: assertOptionalHex(rawTokens.colorBorder, 'tokens.colorBorder'),
        colorBorderSecondary: assertOptionalHex(rawTokens.colorBorderSecondary, 'tokens.colorBorderSecondary'),
        borderRadius: (0, assetPackageService_1.assertOptionalNumber)(rawTokens.borderRadius, 'tokens.borderRadius', 0, 32),
    };
    const background = normalizeBackground(raw.background);
    const mascot = (0, mascotManifest_1.normalizeMascot)(raw.mascot);
    const preview = raw.preview === undefined ? undefined : (0, assetPackageService_1.assertAssetPath)(raw.preview, false);
    const menuIcons = normalizeMenuIcons(raw.menuIcons);
    const cursors = normalizeCursors(raw.cursors);
    return {
        formatVersion: 1,
        id,
        name,
        ...(description === undefined ? {} : { description }),
        mode: raw.mode,
        tokens,
        ...(background === undefined ? {} : { background }),
        ...(mascot === undefined ? {} : { mascot }),
        ...(preview === undefined ? {} : { preview }),
        ...(menuIcons === undefined ? {} : { menuIcons }),
        ...(cursors === undefined ? {} : { cursors }),
    };
}
function normalizeMenuIcons(value) {
    if (value === undefined)
        return undefined;
    const raw = (0, assetPackageService_1.assertPlainObject)(value, 'menuIcons');
    const menuIcons = {};
    for (const [key, assetPath] of Object.entries(raw)) {
        if (key !== 'default' && !APPEARANCE_MENU_ICON_KEYS.includes(key)) {
            (0, assetPackageService_1.fail)(`menuIcons 包含未知菜单键: ${key}`);
        }
        menuIcons[key] = (0, assetPackageService_1.assertAssetPath)(assetPath, true);
    }
    return menuIcons;
}
function normalizeCursors(value) {
    if (value === undefined)
        return undefined;
    const raw = (0, assetPackageService_1.assertPlainObject)(value, 'cursors');
    const cursors = {};
    for (const [key, cursorValue] of Object.entries(raw)) {
        if (!APPEARANCE_CURSOR_KEYS.includes(key)) {
            (0, assetPackageService_1.fail)(`cursors 包含未知光标键: ${key}`);
        }
        const cursor = (0, assetPackageService_1.assertPlainObject)(cursorValue, `cursors.${key}`);
        const assetPath = (0, assetPackageService_1.assertAssetPath)(cursor.path, true);
        if (path.posix.extname(assetPath).toLowerCase() !== '.png') {
            (0, assetPackageService_1.fail)(`cursors.${key}.path 必须是 PNG 图片`);
        }
        cursors[key] = {
            path: assetPath,
            hotspotX: assertHotspot(cursor.hotspotX, `cursors.${key}.hotspotX`),
            hotspotY: assertHotspot(cursor.hotspotY, `cursors.${key}.hotspotY`),
        };
    }
    return cursors;
}
function normalizeBackground(value) {
    if (value === undefined)
        return undefined;
    const raw = (0, assetPackageService_1.assertPlainObject)(value, 'background');
    const pathValue = (0, assetPackageService_1.assertAssetPath)(raw.path, true);
    const opacity = (0, assetPackageService_1.assertOptionalNumber)(raw.opacity, 'background.opacity', 0, 1);
    const surfaceOpacity = (0, assetPackageService_1.assertOptionalNumber)(raw.surfaceOpacity, 'background.surfaceOpacity', 0, 1);
    const position = raw.position === undefined ? undefined : (0, assetPackageService_1.assertString)(raw.position, 'background.position', 32);
    if (position !== undefined && !POSITION.test(position))
        (0, assetPackageService_1.fail)('background.position 不受支持');
    const size = raw.size === undefined ? undefined : raw.size;
    if (size !== undefined && size !== 'cover' && size !== 'contain' && size !== 'auto') {
        (0, assetPackageService_1.fail)('background.size 不受支持');
    }
    return {
        path: pathValue,
        ...(opacity === undefined ? {} : { opacity }),
        ...(surfaceOpacity === undefined ? {} : { surfaceOpacity }),
        ...(position === undefined ? {} : { position }),
        ...(size === undefined ? {} : { size }),
    };
}
function pngDimensions(relativePath, data) {
    if ((path.posix.extname(relativePath).toLowerCase() === '.png' ? 'image/png' : '') !== 'image/png') {
        (0, assetPackageService_1.fail)(`光标资源必须是 PNG 图片: ${relativePath}`);
    }
    if (data.length < 33 ||
        data.readUInt32BE(8) !== 13 ||
        data.subarray(12, 16).toString('ascii') !== 'IHDR') {
        (0, assetPackageService_1.fail)(`PNG 缺少有效 IHDR: ${relativePath}`);
    }
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    if (width < 1 || width > 64 || height < 1 || height > 64) {
        (0, assetPackageService_1.fail)(`光标图片尺寸必须在 1 到 64 像素之间: ${relativePath}`);
    }
    return { width, height };
}
function validateCursorData(key, cursor, data) {
    const { width, height } = pngDimensions(cursor.path, data);
    if (cursor.hotspotX >= width || cursor.hotspotY >= height) {
        (0, assetPackageService_1.fail)(`cursors.${key} 的热点必须位于图片范围内`);
    }
}
function referencedPaths(manifest) {
    return [
        manifest.background?.path,
        manifest.mascot?.path,
        manifest.mascot?.animation?.path,
        manifest.mascot?.animation?.lookPath,
        manifest.mascot?.animation?.resultPath,
        manifest.mascot?.animation?.dragPath,
        manifest.preview,
        ...Object.values(manifest.menuIcons ?? {}),
        ...Object.values(manifest.cursors ?? {}).map(cursor => cursor.path),
    ].filter((value) => Boolean(value));
}
function serializeAppearance({ manifest, assets, }) {
    const getAsset = (assetPath) => assetPath ? assets[assetPath] : undefined;
    const menuIconUrls = {};
    for (const [key, assetPath] of Object.entries(manifest.menuIcons ?? {})) {
        const url = getAsset(assetPath);
        if (url)
            menuIconUrls[key] = url;
    }
    const cursorUrls = {};
    for (const [key, cursor] of Object.entries(manifest.cursors ?? {})) {
        const url = getAsset(cursor.path);
        if (url)
            cursorUrls[key] = url;
    }
    return {
        ...manifest,
        ...(manifest.preview ? { previewUrl: getAsset(manifest.preview) } : {}),
        ...(manifest.background ? { backgroundUrl: getAsset(manifest.background.path) } : {}),
        ...(manifest.mascot ? { mascotUrl: getAsset(manifest.mascot.path) } : {}),
        ...(manifest.mascot?.animation
            ? { mascotAnimationUrl: getAsset(manifest.mascot.animation.path) }
            : {}),
        ...(manifest.mascot?.animation?.lookPath
            ? { mascotLookUrl: getAsset(manifest.mascot.animation.lookPath) }
            : {}),
        ...(manifest.mascot?.animation?.resultPath
            ? { mascotResultUrl: getAsset(manifest.mascot.animation.resultPath) }
            : {}),
        ...(manifest.mascot?.animation?.dragPath
            ? { mascotDragUrl: getAsset(manifest.mascot.animation.dragPath) }
            : {}),
        ...(manifest.menuIcons ? { menuIconUrls } : {}),
        ...(manifest.cursors ? { cursorUrls } : {}),
    };
}
const store = new assetPackageService_1.AssetPackageStore({
    directoryName: 'appearances',
    manifestName: 'theme.json',
    normalize: normalizeManifest,
    referencedPaths,
    validateAssets(manifest, read) {
        for (const [key, cursor] of Object.entries(manifest.cursors ?? {}))
            validateCursorData(key, cursor, read(cursor.path));
        (0, mascotManifest_1.validateMascotAssets)(manifest.mascot, read);
    },
});
const getAppearanceRoot = (userDataPath) => store.root(userDataPath);
exports.getAppearanceRoot = getAppearanceRoot;
exports.validateAppearanceManifest = normalizeManifest;
const readAppearancePackage = (zipPath) => store.readArchive(zipPath);
exports.readAppearancePackage = readAppearancePackage;
/** 与安装共用校验，只读预览，不写用户目录。 */
function inspectAppearancePackage(zipPath) {
    const { manifest, files } = store.readArchive(zipPath);
    const preview = files.find(file => file.path.toLowerCase() === manifest.preview?.toLowerCase());
    return {
        manifest,
        ...(preview
            ? { previewUrl: `data:${preview.mime};base64,${preview.data.toString('base64')}` }
            : {}),
    };
}
function importAppearancePackage(userDataPath, zipPath, replace = false) {
    try {
        const { item, existing, ...result } = store.install(userDataPath, store.readArchive(zipPath), replace);
        return {
            ...result,
            ...(item ? { appearance: serializeAppearance(item) } : {}),
            ...(existing ? { existing: serializeAppearance(existing) } : {}),
        };
    }
    catch (error) {
        return {
            success: false,
            code: error instanceof assetPackageService_1.AssetPackageError ? error.code : 'IMPORT_FAILED',
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
const listAppearances = (userDataPath) => store.list(userDataPath).map(serializeAppearance);
exports.listAppearances = listAppearances;
function getAppearance(userDataPath, id) {
    const item = store.get(userDataPath, id);
    return item ? serializeAppearance(item) : null;
}
const isAppearanceGone = (userDataPath, id) => store.isGone(userDataPath, id);
exports.isAppearanceGone = isAppearanceGone;
const removeAppearance = (userDataPath, id) => store.remove(userDataPath, id);
exports.removeAppearance = removeAppearance;
