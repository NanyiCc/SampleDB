# GitHub 网页发布

- 网页：https://nanyicc.github.io/SampleDB/
- 源码：https://github.com/NanyiCc/SampleDB
- 下载：https://github.com/NanyiCc/SampleDB/archive/refs/heads/main.zip

## 两种运行方式

GitHub Pages 运行浏览器工作区：内置样本和测序实验记录，支持入库、取样、结果回填、联合对比、保存快照与验证方案。更改保存在访问者自己的浏览器，刷新可保留，不会上传或同步给其他访问者。界面使用普通实验记录名称，不显示 Demo 或示例数据标记。

完整源码还包含 Next.js API、Prisma/SQLite、登录与用户审批、完整登记表单。下载源码后，按根目录 Readme 的本地部署步骤运行。GitHub Pages 不运行这些服务端功能；多人共享数据库需自行部署完整应用。

## 自动发布

仓库 Settings → Pages 使用 GitHub Actions。推送到 `main` 后，`.github/workflows/pages.yml` 执行依赖安装、模型测试、静态构建和部署；也可以在 Actions 手动运行 Publish SampleDB。

```sh
npm ci
npm test
npm run build:pages
```

产物位于 `dist/pages`，默认地址前缀 `/SampleDB`。部署到域名根路径时使用 `PAGES_BASE_PATH='' npm run build:pages`。构建脚本在忽略目录 `.pages-build` 中组装前端，不修改正式应用入口，也不读取或复制 `.env`、SQLite 数据库或管理员凭据。

网页右上角菜单和页脚提供源码与 ZIP 下载入口。源码可公开浏览、下载；仓库暂未新增软件许可证，公开可下载不等于授予任意商业再分发许可。

## 实现依据

- [GitHub 官方 Pages 工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Next.js 静态导出](https://nextjs.org/docs/app/guides/static-exports)
