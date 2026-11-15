# 自己修改、测试和发布这个项目

本地项目是工作副本，GitHub 保存提交和审阅记录，GitHub Pages 发布合并后的网页。
保存本地文件、推送分支、合并 PR、网页部署完成，是四个不同的状态。

## 这次采用的流程

从最新 `main` 建立 `fix/versioned-deployment` 分支，在电脑上完成代码、测试和浏览器
检查，再提交并推送分支，创建 PR。你审阅并合并后，GitHub 自动测试、构建、发布，
随后核对线上页面及全部资源是否与这次提交一致。最后这项通过，才算完成发布验证。

本次三项改动是资源文件名随内容改变、旧标签页的新版本刷新提示、发布后的自动核对。
发布包也保留历史页面引用的旧资源，避免缓存的页面突然找不到脚本或样式。
模型和研究结果仍是 v0.2；具体发布提交另外记录在 `version.json` 中。

## 以后每次修改

1. **同步最新主分支，再开一个新分支。** 先确认没有未保存或未提交的旧改动。
2. **修改本地文件。** 网站源文件在 `web/`。不要直接修改生成的 `dist/`，下次构建会覆盖。
3. **本地测试和预览。** 测试通过后，检查桌面和手机宽度。涉及更新提示时，保留旧预览
   标签页，构建下一版本并切回旧标签页，确认提示、Later 不打断操作、Refresh now
   打开新版。明确点击刷新后，队列筛选会重置，所在页面的地址片段会保留。
4. **提交，再推送分支。** 提交保存本地历史；推送才上传到 GitHub。推送前检查文件列表，
   排除密码、令牌、私人数据和本地环境。
5. **创建 PR。** 写清改动、测试、截图和限制，等待 **Verify research prototype** 通过。
6. **审阅并合并。** 本项目沿用 **Create a merge commit**，保留清楚的历史关系。
7. **等待发布检查。** 到 Actions 看 **Deploy demo to GitHub Pages**，确认最后的线上核对
   通过。缓存传播可能需要几分钟。失败时看 `pages-publication-check` 报告。
8. **打开正式网页确认。** 已安装这次更新提示的旧标签页会提示刷新；本次上线前打开的
   旧标签页需要手动刷新一次。Mac Chrome 必要时用 `Command + Shift + R`；离线 HTML 重新下载。

可以用 GitHub Desktop 完成分支、提交、推送和打开 PR；测试仍在项目终端运行。
下面是命令版，分支名每次换成描述实际改动的新名字：

```sh
# 在自己的 engagement-to-support-lab 项目文件夹内
git status
git switch main
git pull --ff-only
git switch -c fix/describe-your-change

# 第一次配置环境时执行
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
# 另需安装 Node.js 24；它只用于开发检查，网页访问者不需要安装。

# 修改后执行；后续每次先激活已有的 .venv
python -m pytest -q tests
node --test tests/test_*.cjs
python build_reference.py
git diff --exit-code -- artifacts web/data.js web/reference-data.js
python build_site.py
python preserve_assets.py
python package_demo.py

# 预览发布版本；保持终端运行，结束按 Ctrl+C
python -m http.server 8765 --bind 127.0.0.1 --directory dist/site
```

打开 `http://127.0.0.1:8765/`。另开终端，进入同一项目并激活环境：

```sh
source .venv/bin/activate
python check_deployment.py --url http://127.0.0.1:8765/ --timeout 0
git diff
git status
# 核对后，只暂存实际修改的文件；这是单个文件示例，按实际情况替换。
git add web/styles.css
git commit -m "Describe the change and its purpose"
git push -u origin HEAD
```

GitHub 仓库页面会给出创建 PR 的入口。使用 GitHub CLI 时也可运行
`gh pr create --base main`，填写标题和描述。电脑未登录时先完成官方登录授权，
不要把密码或令牌写进文件或提交记录。

本地构建使用当时的提交编号。正式网站由 GitHub 从合并提交重新构建，编号不同是正常的。
未提交的本地修改不能当作可复现的正式发布记录。

## 出问题怎么退回

在已合并 PR 页面选择 **Revert**，审阅生成的回滚 PR，测试通过后合并。
再等待 Pages 发布并确认网页。回滚产生新记录，不删除原来的工作。

本次修改前的主分支编号为 `c648e192fa9dd629cb70ff4fb61c11296e506ca1`，对应已合并的 v0.2。
完整回滚本次维护也会移除新增的版本提示和发布检查，需要手工确认网页。
原始 v0.1.0 标签保持不变。只切换本地分支或修改 Release 名称不会改变线上网页。

详细发布机制和检查报告说明见 [deployment.md](deployment.md)。
