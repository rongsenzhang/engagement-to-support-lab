# 项目使用与继续开发说明

当前[在线 Demo](https://rongsenzhang.github.io/engagement-to-support-lab/) 已是 **v0.4**。
2026 年 11 月 15 日，PR #10 合并到主分支并成功部署。v0.3 分析已实际运行，
v0.4 系统和材料已发布；真人试用尚未开展，参与者由你之后安排。

## 文件在哪里，怎样运行

当前电脑上的主要项目目录是：

`/Users/rongsen/Documents/Codex/2026-11-08/new-chat/engagement-to-support-lab`

这里的 `web/` 是网页，`src/` 是分析与试用汇总代码，`docs/` 是研究方案、结果与使用材料，
`tests/` 是功能检查，`artifacts/` 是已生成的公开分析结果。不要把其他工作目录误当成主项目。

在项目目录打开终端后运行：

```sh
python3 run_demo.py
```

浏览器会打开本机页面。浏览现有结果不需要下载原始数据、重新训练、登录或 API 密钥。
也可以直接打开 `web/index.html`，或运行 `python3 package_demo.py` 后打开
`dist/Engagement_Lab_v0.4.html`。打包文件包含全部网页资源。

## 应用版本和旧实验编号有什么区别

顶部 v0.4 指现在运行的整个应用。旧方案、结果文件中的 v0.1、v0.2、v0.3
标明那些研究工作在哪个阶段完成。新版保留这些证据，因此旧实验编号不会全部改成 v0.4。
例如首页的 121、162、157 来自已保存的历史比较，不能说成 v0.4 重新跑出的新结果。

GitHub 的 Releases 下载区目前仍只有 v0.1.0 历史发布包。要使用当前系统，请打开
在线 Demo，或从当前项目运行、打包；网站更新不会自动产生新的 Release 下载文件。

## 这两次更新做了什么

| 阶段 | 新增工作 | 实际意义 |
|---|---|---|
| v0.3 | 每门课程的比较、课程先验基线、留出整门课程验证、受控非线性模型、数据延迟模拟 | 检查整体提升能否迁移，显示失败与数据质量风险 |
| v0.4 | 50 条虚构案例、四个导师任务、初判与修订、五条复核名单、导出恢复、主持与汇总材料 | 让未来真人试用可以按一致流程进行并留存记录 |

v0.3 的关键结果不是“模型全面更好”：增加考核特征在 BBB、DDD、FFF 有帮助，但
EEE、GGG 的排序反而下降。非线性模型的平均排序指标更好，概率误差却不如 C。
因此原来的 C 默认模型继续保留，结果页同时展示正面和负面发现。

v0.4 的案例和分数全部编造并明确标记。软件测试、自己练习和 AI 预演都不能算作
参与者反馈。真实试用的结果与依据反馈进行的修改，需要之后实际完成。

## 怎样演示

1. Research question：说明研究问题和原始同等工作量比较。
2. Course robustness：看全体结果，再选 EEE 或 GGG，说明课程之间并不一致。
3. Held-out courses：看平均结果与单门课程，比较排序指标和概率误差。
4. Simulated delays：选择 Submission events，查看 60 条提交记录延迟如何替换
   637 条名单中的 54 条。强调记录变化并不等于学习情况变化。
5. Tutor practice：选择 Practice，完成四个任务；查看初判、背景披露和修订如何分开保存。

## 怎样进行 v0.4 试用

先阅读 `docs/study/README.md` 和中文 `facilitator_guide.md`。未来安排有相关经验的
成年志愿者，实际说明并取得同意、约定退出期限后，才使用 Facilitated 模式。

四个任务分别是：比较相同总点击量下的不同轨迹；先记录对未提交作业的判断，再披露
获批延期；从 50 条中手动选 5 条进一步核实；解释虚构概率和一个没有退出的例子。
任务没有自动学生联系或真实支持决策。

切换实验页面会暂停任务计时并保留当前笔记。**刷新或关闭前需要主动导出 JSON。**
JSON 可恢复完整记录，CSV 便于人工整理。不要在练习中填写真实学生或参与者身份信息。

真实记录放在私有 `private_study/sessions/`，该目录已排除在 Git 和源码包之外。
不要放进 `web/`、公开截图或 PR。汇总命令是：

```sh
python3 src/study_summary.py --input-dir private_study/sessions --output private_study/summary.json
```

空目录显示零参与者；练习和未结束场次被排除。结果只提供描述性计数，观点、误解与
设计修改需要根据真实记录人工分析。按参与者说明执行撤回和记录保留安排。

## 自己修改时需要做什么

我们先在电脑上修改文件、运行分析与测试，再将改动提交到 Git 分支并推送 GitHub，
最后建立 PR。Git 保存改动和历史；不用每次手动上传整个文件夹，也不用重搭框架。

通常只修改对应部分，例如网页说明改 `web/`，研究方法改 `src/` 与方案文档。
涉及算法、导出或页面之间配合时，要连同受影响的文件一起调整和测试。

以后从最新主分支开始一个新任务，可以使用：

```sh
git switch main
git pull --ff-only
git switch -c research/your-next-change
# 修改对应文件后，查看差异
git status
git diff
# 在已安装项目依赖的 Python 环境中运行检查
python -m pytest -q tests
node --test tests/test_*.cjs
python package_demo.py
# 只添加本次修改的具体文件；把下面路径换成实际文件
git add path/to/changed-file
git commit -m "Describe the actual change"
git push -u origin research/your-next-change
```

然后在 GitHub 打开该分支的 PR，说明改了什么、如何验证、还没证明什么。
研究方案应先提交再运行新实验。保留方案提交的 PR 使用 **Create a merge commit**。
**以后的交付 PR 默认直接以 `main` 为目标分支。** 如果开发工作依赖另一个分支，
由实施者先处理依赖、确认目标及实际改动，再交给你合并；不再把改目标分支的步骤留给你。
这次 v0.3 已通过 #8 发布，v0.4 已通过 #10 发布，相关合并步骤已结束，无需再次操作 #9。
维护 PR #5 可继续不合并；它不是当前功能的前提。

合并以后查看 GitHub Actions 的 Pages 发布是否成功，再打开在线 Demo 确认版本和
主要功能。分支推送、PR 通过和在线发布是三个不同阶段。旧页还开着时需要重新加载；
未合并的维护 PR 所提供的自动更新提示，当前线上版本还没有。

需要回退时使用 GitHub 的 Revert 建立回退 PR，经过检查后合并。它增加一条回退记录，
不会删除之前的成果。详细规则见 `CONTRIBUTING.md`。
