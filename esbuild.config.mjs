import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

// 构建配置
const buildOptions = {
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: ["obsidian"],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
};

// 根据是否生产模式选择构建方式
if (prod) {
    // 生产模式：单次构建
    await esbuild.build(buildOptions);
    console.log("构建完成！");
} else {
    // 开发模式：监听文件变化
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("正在监听文件变化...");
}