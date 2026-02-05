import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import * as tar from 'tar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// 检查是否是 CI 环境 (Cloudflare Pages 会自动设置 CI=true)
// 或者检查命令行是否传入了 --force 参数
const IS_CI = process.env.CI === 'true' || process.env.CF_PAGES === '1';
const FORCE_UPDATE = process.argv.includes('--force') || IS_CI;

/**
 * 从官方 URL 下载并解压 tar.gz 包
 * @param {string} url - tar.gz 文件的 URL
 * @param {string} targetDir - 解压目标目录
 */
async function downloadAndExtract(url, targetDir) {
    // 确保目标目录存在
    await fs.mkdir(targetDir, { recursive: true });

    // 下载文件
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 获取 ArrayBuffer 并转换为 Buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 创建临时文件
    const tempFile = path.join(targetDir, '..', `temp-${Date.now()}.tar.gz`);
    await fs.writeFile(tempFile, buffer);

    try {
        // 解压 tar.gz 到目标目录
        await tar.x({
            file: tempFile,
            cwd: targetDir,
            strip: 0, // 不剥离目录层级
        });
    } finally {
        // 清理临时文件
        await fs.unlink(tempFile).catch(() => { });
    }
}

async function main() {
    const universeRoot = path.join(ROOT_DIR, 'src/universe/preview');
    const configPath = path.join(ROOT_DIR, 'typst-packages.json');

    console.log('🌌 DeepPrint Universe 同步程序\n');

    let packages = [];
    try {
        const rawData = await fs.readFile(configPath, 'utf-8');
        packages = JSON.parse(rawData);
    } catch (error) {
        console.error(`❌ 找不到配置文件: ${configPath}`);
        process.exit(1);
    }

    for (const pkg of packages) {
        const targetDir = path.join(universeRoot, pkg.name, pkg.version);

        // 🔍 智能检查逻辑
        // 如果不是强制更新模式，且文件夹已存在，则跳过
        if (!FORCE_UPDATE && existsSync(targetDir)) {
            console.log(`⚡️ [${pkg.name} v${pkg.version}] 本地已存在，跳过下载。`);
            continue; // 直接进入下一次循环
        }

        // 开始下载
        console.log(`📥 [${pkg.name} v${pkg.version}] 正在从官方源下载...`);
        console.log(`   🔗 ${pkg.source}`);
        try {
            await downloadAndExtract(pkg.source, targetDir);
            const relativePath = path.relative(ROOT_DIR, targetDir);
            console.log(`   ✅ 更新完成 -> ${relativePath}`);
        } catch (err) {
            console.error(`   ❌ 下载失败: ${err.message}`);
        }
    }

    console.log('\n✨ 同步检查完毕！\n');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});