# SampleDB · 智能样本库

[访问网页](https://nanyicc.github.io/SampleDB/) · [下载源码 ZIP](https://github.com/NanyiCc/SampleDB/archive/refs/heads/main.zip) · [发布与部署说明](docs/github-pages.md)

面向测序实验的样本与实验数据工作区，支持样本档案、来源链路、实验回填、跨记录参数与结果对比、对比快照和验证方案草稿。字体采用系统无衬线与中文苹方回退。

在线网页在各自浏览器保存数据；完整源码支持本机或服务器上的 Next.js + SQLite 运行方式。AI 调参与自动化设备接入仍在规划中。新版功能详见 [实现说明](docs/workspace-implementation.md)。

## 原始业务需求

需要构建一套实验室样本管理系统：

样本ID格式：项目id（1-9位字母或数字）-样本id（四位数字）
1. 生成需入库样本个数（填写样本所属项目，样本名称，收样时间，入库时间（自动），样本id（自动），样本类型（组织，cDNA），备注）-> 生成表格，内部含有X个新的编号，给一个按钮可以导出一个excel表，打印X个）（这个其实跟取样登记逻辑差不多）

2. 入库样本分为两种类型
	1. 填写组织样本基本信息（暂时先不考虑）
  2. 填写cDNA基本信息

3. cDNA基本信息（体积（µL），浓度（ng/µL），所属组织，技术类型，原始片段均值（bp），实验方式，备注，上样量（µL））

---
以下步骤4-7都需要在“取样登记”后，生成的小卡片点击后填写：

4. 富集结果（新字段T）（体积（µL），浓度（ng/µL），片段均值（bp），实验方式，备注）

5. 阵列生成 (新字段A)（体积（µL），浓度（ng/µL），片段均值（bp），生成策略（15连，16连, option），实验方式，备注，上样量（µL））
 
6. 连接结果 (新字段L)（投入量（ng），产出体积（µL），浓度（ng/µL），片段均值（bp），实验方式，备注）

7. 建库 (新字段LIB)（投入量（ng），建库时间，建库策略，体积（µL），浓度（ng/µL），片段均值（bp），紫外吸光度（A260/280, A260/230），包含barcode（option））

---

8. 测序上机 (建库id，直接加上测序芯片编号)（文库名称（multi），投入量（分别），测序策略，芯片编号，储存路径（option））

9. 测序下机（测序下机数据量，上传服务器路径，测序策略，barcode，备注）

App. 取样登记，（可以登记取用多个样本，每一个样本取用的时候需要输入样本id）（参与实验（用于在之前选用的样本之后生成一个新的字段和两位数字（如-T01），相应字段上述流程已经填写，用于为实验完成后生成的新的入库样本的id），上样量（质量ng），样本id，时间（自动生成），实验类型，操作员）：理论上所有的实验都要填写一个，填写完成后，根据参与实验的不同，生成新的ID，并生成可以导出的excel文件，里面有新的id，并且会有一个专门的界面像小卡片保存所有的取样登记，当实验结束后点击小卡片，填写

---

实验限制配置：根目录 `sample-experiment-rules.json` 可以限制某个样本或某类样本只能进入固定实验。修改后在取样登记页点击“重载实验限制”，后端提交登记时也会重新读取该文件并校验。

示例：

```json
{
  "version": 1,
  "rules": [
    {
      "sampleId": "ABC-0001",
      "allowedExperiments": ["ENRICHMENT", "ARRAY"]
    },
    {
      "sampleIdPrefix": "ABC-0001-LIB",
      "allowedExperiments": ["SEQUENCING"]
    }
  ]
}
```

---

## MVP 已实现

本仓库已实现一个本机运行的中文 Web 版样本管理系统：

- Next.js + TypeScript 前端和 API
- Prisma + SQLite 持久化数据库
- 样本入库页：先生成 `ABC-0001` 格式样本 ID，再补全每个样本信息并提交入库
- 新入库样本需要录入已有的冻存管 ID；冻存管 ID 与系统样本 ID 一一对应，可用于查询、取样和导出
- 血液冻存管类型分为全血、血浆、细胞；每管体积和备注可选，细胞管可选填质检细胞数量和细胞保存介质
- cDNA 基本信息录入
- 取样登记页：允许同一次登记重复取用同一个样本，自动生成 `-T01`、`-A01`、`-L01`、`-LIB01` 派生样本 ID
- 单细胞取样登记使用 `SINGLE_CELL` 类型，只允许按冻存管 ID 取样，并生成 `-SC01` 派生样本 ID
- 组织流程：支持组织样本入库、组织切片、实贴片、制取 cDNA 三步空转流程
- 每个原始样本和派生样本都会生成 8 位短码，可用完整样本 ID 或短码查询
- 取样登记支持填写登记标题和项目 ID，输入样本 ID/短码后会自动识别所属项目
- 实验回填页：支持暂存和提交；提交后表单从待回填页面移除，结果回存数据库
- 单细胞实验回填包含计数、活率、细胞浓度、上机、冻存、cDNA 和文库等台账字段
- 样本查询页：支持样本 ID 精确查询、样本 ID 包含查询、项目 ID 模糊筛选和项目详情查看
- 查询结果、项目详情、入库编号 list、入库完整信息、取样登记表 Excel 兼容导出
- 样本编号打印页面
- 页面导航会写入 `?page=inventory`、`?page=sampling`、`?page=experiments`、`?page=query`、`?page=edit`、`?page=users`，刷新后会留在当前页面

## 登录鉴权

系统现在默认要求登录后才能访问首页、打印页和所有业务 API。会话使用数据库会话表和 HttpOnly Cookie 保存，密码在 SQLite 中只保存为哈希值。

首次启动会在终端中要求设置管理员用户名、显示名称和密码。密码使用 scrypt 强哈希保存到项目目录以外的本机应用数据目录；密码明文不会写入 `.env`、SQLite 数据库或迁移包。

`.env` 只保留数据库和 Cookie 配置：

```text
DATABASE_URL="file:./dev.db"
AUTH_COOKIE_SECURE="false"
```

首次启动会创建并批准该管理员的 SQLite 用户记录；之后登录时会自动使用独立凭据中的哈希值核对管理员记录。普通用户可以从登录页进入“申请新账号”。注册申请初始为 `PENDING`，管理员在首页的“用户审批”页面批准后，用户才可以登录。管理员可以批准、拒绝、停用或重新启用普通用户；拒绝或停用会立即撤销该用户的已有会话。普通用户不能访问用户审批页面，也不能批准其他用户。

默认的独立凭据位置为：macOS 的 `~/Library/Application Support/SampleDB/admin-credential.json`、Windows 的 `%LOCALAPPDATA%\\SampleDB\\admin-credential.json`、Linux 的 `~/.local/state/sampledb/admin-credential.json`。文件权限会设为仅当前运行账户可读写；它只含用户名、显示名称和不可逆的密码哈希。

如需遗忘/重设管理员密码，停止服务后先查看实际路径：

```bash
npm run admin:credential:path
```

然后由系统管理员使用 `sudo` 删除该单独文件，再重新启动项目即可重新设置账号：

```bash
sudo rm -f "上一步显示的完整路径"
```

也可以通过 `SAMPLEDB_ADMIN_CREDENTIAL_PATH` 将文件放在服务器专用目录。内网通过普通 HTTP 访问时，`AUTH_COOKIE_SECURE` 必须保持 `false`；只有在已经配置 HTTPS 时才改为 `true`。

## 页面名称修改

网页内已经移除了旧的项目名。当前页面标题显示为“实验室样本管理系统”。

如需改成你的正式系统名称，修改两个位置：

```text
app/layout.tsx
app/page.tsx
```

在 `app/layout.tsx` 中修改浏览器标签页标题；在 `app/page.tsx` 顶部标题区域修改页面内显示名称。

## 表单配置

根目录 `lab-form-config.json` 控制样本入库和实验回填中常改的表单字段：

- `storageLocations`：储存位置下拉候选项
- `sampleIntakeFields`：cDNA 入库信息字段
- `experimentResultFields`：富集、阵列、连接、建库等实验回填字段
- `sequencingResultFields`：测序下机回填字段

当前内置实验类型包括：

- `ENRICHMENT`：富集结果，编号后缀 `T`
- `ARRAY`：阵列生成，编号后缀 `A`
- `LIGATION`：连接结果，编号后缀 `L`
- `LIBRARY`：建库，编号后缀 `LIB`
- `SEQUENCING`：测序上机，编号后缀 `SEQ`
- `TISSUE_SECTION`：组织切片，编号后缀 `SEC`
- `SECTION_PLACEMENT`：实贴片，编号后缀 `SLD`
- `CDNA_PREP`：制取 cDNA，编号后缀 `CDNA`

字段只能使用数据库已经预留的 key。这样做的边界是：可以通过配置调整“显示哪些字段、标签、类型、必填、选项”，但如果要新增数据库从未预留的新字段，需要同步修改 Prisma schema 和 API。

取样登记页里的“参与实验”选项来自代码中的 `lib/domain.ts`，其中配置了实验类型、中文名称、短名称、派生样本编号后缀和界面颜色。每一种实验回填时需要填写哪些字段，来自 `lab-form-config.json` 的 `experimentResultFields`；测序下机字段来自 `sequencingResultFields`。如果只是调整某个实验回填表单显示哪些已预留字段、字段名称、是否必填、填写类型或候选项，优先改 `lab-form-config.json`。如果要新增一种实验类型，才需要同步修改 `lib/domain.ts`、`prisma/schema.prisma` 和相关 API。

`sample-experiment-rules.json` 只用于限制“某个样本或某类样本允许进入哪些实验”，不负责控制入库表单字段，也不能新增数据库字段。

储存位置支持手动输入。提交入库、实验回填或手动修改后，新的储存位置会自动写回 `lab-form-config.json`；后端读取配置有 1 秒缓存，避免频繁读文件，但点击刷新或下一次提交后会拿到最新配置。

组织切片使用专门交互：先填写切片张数，页面会按张数展开每张切片的切片刀数、切片厚度、总厚度、容器编号、采样组织区域、切片类型和备注。提交时切片刀数和切片厚度必填。

## 本地运行

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

打开浏览器访问：

```text
http://localhost:3000
```

## Git 和 GitHub 上传

仓库只建议上传源码、锁定依赖文件、Prisma schema 和默认配置文件。不要上传本机数据库、依赖目录、构建产物或真实环境文件。

建议上传：

```text
app/
lib/
prisma/schema.prisma
package.json
package-lock.json
next.config.ts
tsconfig.json
next-env.d.ts
Readme.md
TODO.md
lab-form-config.json
sample-experiment-rules.json
.gitignore
.env.example
```

不要上传：

```text
node_modules/
.next/
prisma/dev.db
.env
```

GitHub 仓库不一定需要预先创建。如果本机已经安装并登录 GitHub CLI，可以直接在项目目录中创建远端仓库并推送：

```bash
git init
git branch -M main
git add .
git commit -m "chore: initial SampleDB project"
gh repo create SampleDB --private --source=. --remote=origin --push
```

如果已经在 GitHub 网页上创建了空仓库，则在本地绑定远端后推送：

```bash
git remote add origin https://github.com/你的账号/SampleDB.git
git branch -M main
git push -u origin main
```

## 内网访问

如果要让内网其他主机通过“服务器静态 IP + 端口”访问，需要在服务器机器上用 LAN 脚本启动：

开发模式：

```bash
npm run dev:lan
```

生产模式：

```bash
npm run build
npm run start:lan
```

`dev:lan` 监听 `0.0.0.0:3000`，`start:lan` 监听 `0.0.0.0:3002`。`0.0.0.0` 表示服务绑定到本机所有网卡；内网用户访问时仍然输入这台服务器的真实静态 IP，例如：

```text
http://服务器静态IP:3002
```

如果仍无法访问，需要检查服务器防火墙是否放行对应端口，并确认其他主机和服务器在同一内网。

SQLite 数据库文件位于：

```text
prisma/dev.db
```

## 迁移和部署

当前系统是本机/内网 Web 版，数据保存在项目内的 SQLite 文件中。以“少装软件、少手动配置”为目标，推荐直接迁移整个项目目录，但不要迁移安装产物。

### 一键打包与恢复（推荐）

项目已提供跨设备迁移脚本。它会将当前代码、SQLite 数据库、表单配置和实验限制配置打包为一个 `.tar.gz` 文件；不会打包 `.env`，避免管理员密码随压缩包或 U 盘泄露。

在**旧设备**上，先停止正在运行的网页服务，再在项目根目录运行：

```bash
npm run portable:pack
```

确认提示后，会在 `portable-packages/` 下生成两个文件：

- `SampleDB-portable-日期时间.tar.gz`：可复制到新设备的迁移包
- 同名 `.sha256`：用于确认复制后的文件没有损坏

在**新设备**上安装 Node.js 20 LTS 或更高版本，解压迁移包并进入解压后的目录。首次恢复推荐运行：

```bash
npm run portable:restore
```

该命令会安装依赖、生成 Prisma Client、核对数据库结构、构建生产版本；如果没有 `.env`，会由 `.env.example` 自动创建一份。首次启动时会在终端设置独立的管理员账号和密码；`.env` 至少保留：

```text
DATABASE_URL="file:./dev.db"
AUTH_COOKIE_SECURE="false"
```

然后运行以下命令，并在提示时选择“仅本机”或“内网开放”：

```bash
npm run portable:start
```

也可以省略交互，直接指定模式和端口：

```bash
npm run portable:start -- --local --port 3000
npm run portable:start -- --lan --port 3000
```

`--local` 只监听 `127.0.0.1`，其他设备不能访问；`--lan` 监听 `0.0.0.0`，脚本会显示可供内网其他电脑访问的 IP 地址。内网模式下请确认操作系统防火墙允许该端口访问。若已妥善配置 `.env`，也可在新设备上一条命令完成恢复后启动：

```bash
npm run portable:restore:start
```

为确保数据库快照完整，打包前必须先停止旧设备上的服务；不要在他人正在录入数据时执行打包。

### 需要转移哪些数据

建议转移整个 `SampleDB` 项目目录，并排除这些目录：

```text
node_modules
.next
out
dist
```

这些目录是依赖和构建产物，到新机器后重新生成即可，复制它们反而容易因为系统不同导致问题。

必须确认以下文件已经带到新机器：

```text
package.json
package-lock.json
next.config.ts
tsconfig.json
app/
lib/
prisma/schema.prisma
prisma/dev.db
.env
lab-form-config.json
sample-experiment-rules.json
```

其中最关键的是运行数据和配置：

- `prisma/dev.db`：现有全部样本、登记、结果数据
- `.env`：数据库路径配置，当前应为 `DATABASE_URL="file:./dev.db"`
- `lab-form-config.json`：表单字段和储存位置配置
- `sample-experiment-rules.json`：实验限制规则配置

迁移前先停止旧机器上的应用，避免复制数据库时仍有人提交数据。正常迁移已有数据时，不要删除或重新创建 `prisma/dev.db`。

不需要单独安装 SQLite 服务。SQLite 数据库就是这个文件：

```text
prisma/dev.db
```

### Windows 部署

Windows 上最省事的方式是把它当作一台内网服务器：安装 Node.js，复制项目，执行 npm 命令，然后让其他电脑通过这台 Windows 电脑的 IP 访问。

需要安装的软件：

- Node.js 20 LTS 或更高版本，安装时勾选 npm
- Git 可选：如果代码用压缩包或 U 盘复制，就不需要 Git
- VS Code 可选：只在需要编辑代码或配置时安装

推荐项目路径使用纯英文路径，例如：

```text
C:\SampleDB
```

部署步骤：

1. 在旧机器上停止应用。

2. 把项目目录复制到 Windows，例如 `C:\SampleDB`。复制前可以直接删掉旧目录里的 `node_modules` 和 `.next`，减少体积。

3. 打开 PowerShell，进入项目目录：

```powershell
cd C:\SampleDB
```

4. 安装依赖：

```powershell
npm ci
```

如果没有 `package-lock.json`，改用：

```powershell
npm install
```

5. 确认 `.env` 文件存在，内容保持：

```text
DATABASE_URL="file:./dev.db"
```

这个路径会由 Prisma 对应到：

```text
prisma/dev.db
```

6. 生成 Prisma Client 并同步数据库结构：

```powershell
npx prisma generate
npx prisma db push
```

7. 构建生产版本：

```powershell
npm run build
```

8. 启动内网访问：

```powershell
npm run start:lan
```

Windows 服务器本机访问：

```text
http://localhost:3002
```

内网其他电脑访问：

```text
http://Windows电脑的内网IP:3002
```

如果其他电脑打不开，优先检查两件事：

- Windows 防火墙是否允许 Node.js 或端口 `3002`
- Windows 电脑和访问电脑是否在同一内网

最简单的长期运行方式是保持这个 PowerShell 窗口打开。关闭窗口或重启电脑后，需要重新执行：

```powershell
cd C:\SampleDB
npm run start:lan
```

### Linux 部署

Linux 上推荐用命令行复制，适合放在固定内网服务器上长期运行。

需要安装的软件：

- Node.js 20 LTS 或更高版本
- npm
- rsync 或 scp，用于从旧机器复制项目
- Git 可选：只有通过 Git 拉代码时才需要

推荐项目路径：

```text
/opt/SampleDB
```

部署步骤：

1. 在旧机器上停止应用。

2. 把项目复制到 Linux，并排除依赖和构建产物：

```bash
rsync -av --exclude node_modules --exclude .next --exclude out --exclude dist /旧机器路径/SampleDB/ 用户名@Linux服务器IP:/opt/SampleDB/
```

如果代码已经在 Linux 上，只需要覆盖数据库和配置文件：

```bash
scp prisma/dev.db 用户名@Linux服务器IP:/opt/SampleDB/prisma/dev.db
scp .env lab-form-config.json sample-experiment-rules.json 用户名@Linux服务器IP:/opt/SampleDB/
```

3. 登录 Linux 服务器，进入项目目录：

```bash
cd /opt/SampleDB
```

4. 安装依赖：

```bash
npm ci
```

如果没有 `package-lock.json`，改用：

```bash
npm install
```

5. 确认 `.env` 文件存在，内容保持：

```text
DATABASE_URL="file:./dev.db"
```

6. 生成 Prisma Client 并同步数据库结构：

```bash
npx prisma generate
npx prisma db push
```

7. 构建并以内网模式启动：

```bash
npm run build
npm run start:lan
```

默认访问地址：

```text
http://Linux服务器IP:3002
```

如果无法访问，检查服务器防火墙是否放行端口 `3002`，并确认其他主机和服务器在同一内网。

### 迁移后验证

打开网页后建议检查：

- 首页统计数量是否和旧机器一致
- 样本查询中能否查到旧样本 ID
- `lab-form-config.json` 中的储存位置选项是否出现在表单里
- 取样登记和实验回填能否正常提交
- 查询结果和项目结果能否正常导出 Excel

### 日常备份建议

最重要的备份文件是：

```text
prisma/dev.db
lab-form-config.json
sample-experiment-rules.json
.env
```

备份前最好先停止应用，或者确认没有人在提交数据。最简单的备份方式是复制这些文件到另一个目录、U 盘或另一台机器。
