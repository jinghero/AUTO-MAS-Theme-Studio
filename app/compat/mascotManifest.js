"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeMascot = normalizeMascot;
exports.mascotAssetPaths = mascotAssetPaths;
exports.validateMascotAssets = validateMascotAssets;
const path = require("path");
const mascotMenuDefinition_1 = require("./mascotMenuDefinition");
const assetPackageService_1 = require("./assetPackageService");
// 与桌宠设置的范围保持一致；主进程与渲染进程独立编译。
const MASCOT_MIN_FPS = 1;
const MASCOT_MAX_FPS = 120;
function normalizeMascot(value) {
    if (value === undefined)
        return undefined;
    const raw = (0, assetPackageService_1.assertPlainObject)(value, 'mascot');
    const pathValue = (0, assetPackageService_1.assertAssetPath)(raw.path, true);
    const width = (0, assetPackageService_1.assertOptionalNumber)(raw.width, 'mascot.width', 16, 1024);
    const opacity = (0, assetPackageService_1.assertOptionalNumber)(raw.opacity, 'mascot.opacity', 0, 1);
    const animation = normalizeMascotAnimation(raw.animation);
    const menu = (0, mascotMenuDefinition_1.normalizeMascotMenu)(raw.menu);
    const position = raw.position === undefined ? undefined : raw.position;
    if (position !== undefined &&
        position !== 'top-left' &&
        position !== 'top-right' &&
        position !== 'bottom-left' &&
        position !== 'bottom-right') {
        (0, assetPackageService_1.fail)('mascot.position 不受支持');
    }
    return {
        path: pathValue,
        ...(width === undefined ? {} : { width }),
        ...(opacity === undefined ? {} : { opacity }),
        ...(position === undefined ? {} : { position }),
        ...(animation === undefined ? {} : { animation }),
        ...(menu === undefined ? {} : { menu }),
    };
}
function normalizeMascotAnimation(value) {
    if (value === undefined)
        return undefined;
    try {
        const raw = (0, assetPackageService_1.assertPlainObject)(value, 'mascot.animation');
        const assetPath = (0, assetPackageService_1.assertAssetPath)(raw.path, true);
        const columns = (0, assetPackageService_1.assertOptionalNumber)(raw.columns, 'mascot.animation.columns', 2, 120);
        const frameCount = (0, assetPackageService_1.assertOptionalNumber)(raw.frameCount, 'mascot.animation.frameCount', 2, 120);
        const idleFps = (0, assetPackageService_1.assertOptionalNumber)(raw.idleFps, 'mascot.animation.idleFps', MASCOT_MIN_FPS, MASCOT_MAX_FPS);
        const workingFps = (0, assetPackageService_1.assertOptionalNumber)(raw.workingFps, 'mascot.animation.workingFps', MASCOT_MIN_FPS, MASCOT_MAX_FPS);
        const lookPath = raw.lookPath === undefined ? undefined : (0, assetPackageService_1.assertAssetPath)(raw.lookPath, true);
        const resultPath = raw.resultPath === undefined ? undefined : (0, assetPackageService_1.assertAssetPath)(raw.resultPath, true);
        const dragPath = raw.dragPath === undefined ? undefined : (0, assetPackageService_1.assertAssetPath)(raw.dragPath, true);
        if (lookPath && path.posix.extname(lookPath).toLowerCase() !== '.png') {
            throw new Error('mascot.animation.lookPath requires a PNG sprite sheet');
        }
        if (resultPath && path.posix.extname(resultPath).toLowerCase() !== '.png') {
            throw new Error('mascot.animation.resultPath requires a PNG sprite sheet');
        }
        if (dragPath && path.posix.extname(dragPath).toLowerCase() !== '.png') {
            throw new Error('mascot.animation.dragPath requires a PNG sprite sheet');
        }
        if (path.posix.extname(assetPath).toLowerCase() !== '.png' ||
            !columns ||
            !Number.isInteger(columns)) {
            throw new Error('mascot.animation requires a PNG sprite sheet and an integer column count');
        }
        if (frameCount !== undefined && (!Number.isInteger(frameCount) || frameCount < columns)) {
            throw new Error('mascot.animation.frameCount must be an integer no smaller than columns');
        }
        return {
            path: assetPath,
            columns,
            ...(frameCount === undefined ? {} : { frameCount }),
            ...(idleFps === undefined ? {} : { idleFps }),
            ...(workingFps === undefined ? {} : { workingFps }),
            ...(lookPath === undefined ? {} : { lookPath }),
            ...(resultPath === undefined ? {} : { resultPath }),
            ...(dragPath === undefined ? {} : { dragPath }),
        };
    }
    catch (error) {
        throw new assetPackageService_1.AssetPackageError('INVALID_ANIMATION', error instanceof Error ? error.message : String(error));
    }
}
function validateMascotAnimationData(columns, data, rows = 2) {
    if (data.length < 33 || data.subarray(12, 16).toString('ascii') !== 'IHDR') {
        throw new assetPackageService_1.AssetPackageError('INVALID_ANIMATION', 'mascot.animation: invalid PNG dimensions');
    }
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    if (!width ||
        !height ||
        width > 8192 ||
        height > 8192 ||
        width % columns !== 0 ||
        height % rows !== 0) {
        throw new assetPackageService_1.AssetPackageError('INVALID_ANIMATION', `mascot.animation: expected ${rows} row(s) of equal-size frames`);
    }
}
function mascotAssetPaths(mascot) {
    return [
        mascot.path,
        mascot.animation?.path,
        mascot.animation?.lookPath,
        mascot.animation?.resultPath,
        mascot.animation?.dragPath,
    ].filter((value) => Boolean(value));
}
function validateMascotAssets(mascot, read) {
    if (!mascot?.animation)
        return;
    const animation = mascot.animation;
    const rows = Math.ceil((animation.frameCount ?? animation.columns) / animation.columns);
    validateMascotAnimationData(animation.columns, read(animation.path), rows * 2);
    if (animation.lookPath)
        validateMascotAnimationData(3, read(animation.lookPath), 3);
    if (animation.resultPath)
        validateMascotAnimationData(animation.columns, read(animation.resultPath), rows * 2);
    if (animation.dragPath)
        validateMascotAnimationData(animation.columns, read(animation.dragPath), rows);
}
