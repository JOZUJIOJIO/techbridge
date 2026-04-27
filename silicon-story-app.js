if (new URLSearchParams(window.location.search).get("fresh") === "1") {
  ["ss-questions", "ss-councils", "ss-plans", "ss-member", "ss-wecom"].forEach((key) => {
    localStorage.removeItem(key);
  });
  window.history.replaceState({}, "", window.location.pathname);
}

const appState = {
  activeTab: "scenes",
  selectedScene: "growth",
  diagnosisStep: 0,
  diagnosisAnswers: [],
  feedPosts: [],
  metrics: {
    questions: Number(localStorage.getItem("ss-questions") || 28),
    councils: Number(localStorage.getItem("ss-councils") || 16),
    plans: Number(localStorage.getItem("ss-plans") || 7)
  },
  membership: localStorage.getItem("ss-member") === "true",
  wecom: localStorage.getItem("ss-wecom") === "true"
};

const scenes = [
  {
    id: "growth",
    icon: "￥",
    color: "orange",
    title: "赚钱增长",
    subtitle: "商业模式、定价、流量、成交",
    kicker: "MONEY GROWTH",
    desc: "帮助你把“我想赚钱”拆成目标客户、付费理由、产品形态、定价和获客路径。",
    agents: ["马斯克", "巴菲特", "贝索斯", "芒格", "增长官"],
    result: "你的问题不是缺项目，而是价值包装和首个付费场景不够具体。建议先设计一个 699 元诊断产品，用 7 天验证成交。",
    questions: [
      {
        title: "你现在的主要收入来源是什么？",
        choices: ["专业服务", "内容流量", "产品销售", "会员社群", "还没有稳定收入"]
      },
      {
        title: "你最痛的赚钱卡点是什么？",
        choices: ["有能力但不会卖", "有流量但不成交", "不知道做什么", "定价太低", "缺少复购"]
      },
      {
        title: "你希望 30 天内先验证什么？",
        choices: ["第一个付费产品", "一次涨价", "一个获客渠道", "一套成交话术", "一个会员主题"]
      }
    ]
  },
  {
    id: "opc",
    icon: "OPC",
    color: "green",
    title: "OPC 一人公司",
    subtitle: "产品化、自动化、个人品牌",
    kicker: "ONE PERSON COMPANY",
    desc: "把个人能力、内容、AI 工作流和外包资源组合成轻资产的一人公司系统。",
    agents: ["Naval", "Paul Graham", "Sam Altman", "Tim Ferriss", "运营官"],
    result: "你需要先定义一个最小可行的一人公司系统：一个明确客户、一个结果型产品、一条内容获客路径、一个 AI 交付流程。",
    questions: [
      {
        title: "你的一人公司最想卖什么结果？",
        choices: ["帮客户获客", "帮客户提效", "帮客户做内容", "帮客户做 AI 转型", "还不清楚"]
      },
      {
        title: "你最不想被什么拖住？",
        choices: ["大量交付", "反复沟通", "招人管理", "低价客户", "没有稳定线索"]
      },
      {
        title: "你现在最有杠杆的资产是什么？",
        choices: ["专业技能", "内容影响力", "客户案例", "工具系统", "社群资源"]
      }
    ]
  },
  {
    id: "relationship",
    icon: "心",
    color: "dark",
    title: "关系与情感",
    subtitle: "关系模式、沟通、边界",
    kicker: "RELATIONSHIP",
    desc: "帮助你把情绪化困惑拆成沟通问题、边界问题、需求不匹配或价值观冲突。",
    agents: ["苏格拉底", "柏拉图", "弗洛姆", "沟通教练", "边界教练"],
    result: "这不是简单的“对方爱不爱你”，而是需求表达和边界管理没有被说清楚。先从一次低冲突表达开始。",
    questions: [
      {
        title: "你现在最想获得什么？",
        choices: ["确认关系", "减少争吵", "表达需求", "做出决定", "停止内耗"]
      },
      {
        title: "你们反复卡住的点是什么？",
        choices: ["沟通方式", "安全感", "边界感", "价值观", "未来规划"]
      },
      {
        title: "你希望下一步更接近什么？",
        choices: ["修复沟通", "明确底线", "温和分开", "重新协商", "看清自己"]
      }
    ]
  },
  {
    id: "ai",
    icon: "AI",
    color: "dark-orange",
    title: "AI 提效",
    subtitle: "工作流、提示词、知识系统",
    kicker: "AI WORKFLOW",
    desc: "把 AI 从工具收藏变成每天可复用的工作流、提示词和个人知识系统。",
    agents: ["Sam Altman", "Karpathy", "自动化架构师", "第二大脑", "效率教练"],
    result: "你不需要再收藏更多工具，而是要先选一个高频任务，做成稳定模板，再逐步自动化。",
    questions: [
      {
        title: "你每天最耗时间的任务是什么？",
        choices: ["写内容", "做销售", "做客服", "做资料整理", "做管理沟通"]
      },
      {
        title: "你现在用 AI 最大的问题是什么？",
        choices: ["不知道问什么", "输出不稳定", "工具太多", "无法复用", "没有工作流"]
      },
      {
        title: "你希望最快提升什么？",
        choices: ["内容产出", "客户沟通", "资料管理", "自动化交付", "个人知识库"]
      }
    ]
  }
];

const members = [
  { name: "林舟", tag: "OPC 实践者", need: "正在验证 199 元 AI 服务产品", icon: "L" },
  { name: "陈一", tag: "私域运营", need: "擅长社群 SOP 和训练营转化", icon: "C" },
  { name: "许行", tag: "独立顾问", need: "寻找内容获客和交付自动化伙伴", icon: "X" }
];

const feedSeeds = [
  {
    author: "马斯克",
    role: "第一性原理 / 产品增长 · AI 模拟",
    avatar: "M",
    tone: "直接、反常识、先拆物理约束",
    content: "很多人以为商业增长来自更努力地发内容。其实增长来自你是否把一个昂贵问题压缩成了一个便宜、清晰、可重复购买的解决方案。",
    tags: ["赚钱增长", "产品化", "第一性原理"],
    replies: [
      "如果用户不愿意今天付费，先别优化包装，回去重写问题定义。",
      "你应该删除一半功能，只留下最能证明价值的那个动作。",
      "不要问市场大不大，先问一个人会不会为这个结果立刻付钱。"
    ]
  },
  {
    author: "巴菲特",
    role: "长期价值 / 现金流 · AI 模拟",
    avatar: "B",
    tone: "慢、稳、重视复利",
    content: "真正好的知识付费产品，不是让用户兴奋三天，而是让用户三个月后发现自己积累了一套更值钱的判断系统。",
    tags: ["长期主义", "会员续费", "数字资产"],
    replies: [
      "如果一个会员越用越难离开，这才是好生意的迹象。",
      "不要追逐热闹，观察留存和复购，它们比掌声诚实。",
      "你的护城河不是内容数量，而是用户资产沉淀的深度。"
    ]
  },
  {
    author: "苏格拉底",
    role: "追问 / 自我认知 · AI 模拟",
    avatar: "S",
    tone: "不断追问真实动机",
    content: "当你说“我想赚钱”时，你真正想要的是钱、自由、证明自己，还是摆脱某种依赖？不同答案会导向完全不同的行动。",
    tags: ["自我认知", "关系", "问题识别"],
    replies: [
      "你问的是方法，但你回避的是动机。",
      "先回答你愿意为哪个结果承担代价。",
      "一个更好的问题，往往比一个更快的答案更值钱。"
    ]
  },
  {
    author: "Naval",
    role: "杠杆 / 一人公司 · AI 模拟",
    avatar: "N",
    tone: "简洁、强调自由和复利",
    content: "OPC 的关键不是一个人做所有事，而是一个人拥有清晰判断，再用代码、内容、资本、外包和 AI 放大自己。",
    tags: ["OPC", "杠杆", "自由"],
    replies: [
      "你的瓶颈不是人手，而是不可复制的交付方式。",
      "先找到能睡觉时也工作的资产。",
      "个人品牌不是人设，是你持续兑现同一种价值。"
    ]
  },
  {
    author: "Karpathy",
    role: "AI 直觉 / 工作流 · AI 模拟",
    avatar: "K",
    tone: "技术直觉、解释边界",
    content: "AI 工作流失败，通常不是模型不够强，而是任务没有被拆成可观察、可反馈、可复用的中间步骤。",
    tags: ["AI 提效", "工作流", "提示词"],
    replies: [
      "把一个大提示词拆成三个小步骤，稳定性通常会显著提升。",
      "你需要的不是更多工具，而是更好的任务边界。",
      "可复用的流程比一次惊艳输出更有价值。"
    ]
  },
  {
    author: "叶先生",
    role: "真人会员 / AI 内容创业者",
    avatar: "YU",
    human: true,
    content: "我发现社群里真正能长期留下的人，不是来听课的人，而是愿意把自己的问题反复打磨成行动的人。",
    tags: ["真人观点", "社群运营", "行动"],
    replies: [
      "马斯克：那就把社群设计成行动系统，而不是内容仓库。",
      "巴菲特：愿意复盘的人，是最值得长期服务的会员。",
      "苏格拉底：你是在服务用户，还是在筛选同路人？"
    ]
  }
];

const baseTimeline = [
  { title: "长期主题：个人能力产品化", text: "出现 6 次，建议进入 OPC 专项。" },
  { title: "最新行动：设计 699 元诊断产品", text: "剩余 3 个步骤未完成。" },
  { title: "能力刻度：成交表达提升", text: "从 42 提升到 61。" }
];

const planItems = [
  { title: "定义一个具体客户", text: "用一句话写清楚：谁在什么场景下愿意为你付费。" },
  { title: "设计 699 元诊断产品", text: "只承诺一个明确结果，不承诺长期陪伴和无限交付。" },
  { title: "写出 3 条成交表达", text: "分别面向痛点、结果和风险，用真实案例增强信任。" },
  { title: "找 5 个种子用户验证", text: "从熟人、社群和内容评论里找最接近目标客户的人。" },
  { title: "复盘成交阻力", text: "记录用户为什么买或不买，更新产品和话术。" },
  { title: "沉淀成案例卡", text: "把过程写入你的个人数字资产，后续可匿名分享。" },
  { title: "决定是否放大", text: "如果 7 天内有付费信号，再进入训练营或会员产品设计。" }
];

const commandOptions = [
  { label: "赚钱增长诊断", action: () => startDiagnosis("growth") },
  { label: "OPC 一人公司诊断", action: () => startDiagnosis("opc") },
  { label: "打开硅基朋友圈", action: () => showTab("feed") },
  { label: "打开圆桌议事", action: () => showTab("council") },
  { label: "查看我的数字资产", action: () => showTab("assets") },
  { label: "开通年度会员", action: () => showTab("membership") }
];

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function persistMetrics() {
  localStorage.setItem("ss-questions", String(appState.metrics.questions));
  localStorage.setItem("ss-councils", String(appState.metrics.councils));
  localStorage.setItem("ss-plans", String(appState.metrics.plans));
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function getScene(id = appState.selectedScene) {
  return scenes.find((scene) => scene.id === id) || scenes[0];
}

function showTab(tab) {
  appState.activeTab = tab;
  $all(".view").forEach((view) => view.classList.remove("active"));
  const target = $(`#view-${tab}`);
  if (target) target.classList.add("active");

  $all("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  const insight = $("#sideInsight");
  if (insight) {
    const copy = {
      scenes: "首页只保留四个高价值场景，让用户先进入具体问题，而不是面对一个泛问答输入框。",
      feed: "动态模块负责制造日常打开理由。名人风格发观点，真人会员参与，评论会触发人物风格回复。",
      council: "圆桌议事负责提供分歧和判断，最后必须沉淀成行动方案。",
      assets: "个人档案是续费核心。用户越用，问题库、方案库和案例库越完整。",
      social: "社交只围绕问题、项目和资源发生，不做无目的信息流。",
      membership: "会员不是工具订阅，而是小程序资产账户加企业微信社群交付。"
    };
    insight.textContent = copy[tab] || copy.scenes;
  }
}

function makePost(seed, index = Date.now()) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}-${index}`,
    author: seed.author,
    role: seed.role,
    avatar: seed.avatar,
    human: Boolean(seed.human),
    content: seed.content,
    tags: seed.tags,
    replies: seed.replies,
    liked: false,
    saved: false,
    comments: [
      seed.human
        ? { type: "agent", name: "增长官", text: seed.replies[0] }
        : { type: "user", name: "会员评论", text: "这个观点可以转成一个行动任务。" }
    ],
    time: ["刚刚", "12 分钟前", "35 分钟前", "1 小时前"][Math.floor(Math.random() * 4)]
  };
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function refreshFeed() {
  appState.feedPosts = shuffle(feedSeeds).slice(0, 5).map(makePost);
  renderFeed();
  showToast("硅基朋友圈已刷新");
}

function renderFeed() {
  const list = $("#feedList");
  list.innerHTML = appState.feedPosts.map((post) => `
    <article class="feed-post" data-post="${post.id}">
      <div class="post-head">
        <div class="post-avatar ${post.human ? "orange" : ""}" data-initial="${post.avatar}">${post.avatar}</div>
        <div class="post-author">
          <b>${post.author}</b>
          <span>${post.role}</span>
        </div>
        <span class="post-time">${post.time}</span>
      </div>
      <div class="post-body">
        <p>${post.content}</p>
        <div class="post-topic-row">
          ${post.tags.map((tag) => `<span class="post-chip">${tag}</span>`).join("")}
        </div>
      </div>
      <div class="post-actions">
        <button class="post-action" data-action="like">${post.liked ? "已赞" : "赞"}</button>
        <button class="post-action" data-action="comment">评论</button>
        <button class="post-action" data-action="save">${post.saved ? "已入档" : "入档"}</button>
      </div>
      <div class="comment-box">
        <input type="text" placeholder="点评他的观点，他会回复你">
        <button class="primary-button" data-action="send-comment">发送</button>
      </div>
      <div class="comment-list">
        ${post.comments.map((comment) => `
          <div class="comment ${comment.type === "user" ? "user-comment" : ""}">
            <b>${comment.name}：</b>${comment.text}
          </div>
        `).join("")}
      </div>
    </article>
  `).join("");

  list.querySelectorAll(".feed-post").forEach((postEl) => {
    const post = appState.feedPosts.find((item) => item.id === postEl.dataset.post);
    postEl.querySelector('[data-action="like"]').addEventListener("click", () => {
      post.liked = !post.liked;
      renderFeed();
    });
    postEl.querySelector('[data-action="save"]').addEventListener("click", () => {
      post.saved = true;
      appState.metrics.questions += 1;
      persistMetrics();
      updateMetrics();
      renderFeed();
      showToast("观点已沉淀到你的数字资产");
    });
    postEl.querySelector('[data-action="comment"]').addEventListener("click", () => {
      postEl.querySelector(".comment-box").classList.toggle("open");
      const input = postEl.querySelector(".comment-box input");
      window.setTimeout(() => input.focus(), 40);
    });
    postEl.querySelector('[data-action="send-comment"]').addEventListener("click", () => submitFeedComment(post, postEl));
    postEl.querySelector(".comment-box input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") submitFeedComment(post, postEl);
    });
  });
}

function submitFeedComment(post, postEl) {
  const input = postEl.querySelector(".comment-box input");
  const value = input.value.trim();
  if (!value) return;
  post.comments.push({ type: "user", name: "我", text: escapeHtml(value) });
  input.value = "";
  renderFeed();
  window.setTimeout(() => {
    const reply = generateDirectedReply(post, value);
    post.comments.push({ type: "agent", name: post.human ? "人物点评" : `${post.author} 回复我`, text: escapeHtml(reply) });
    renderFeed();
    showToast(`${post.human ? "有人物" : post.author} 回复了你`);
  }, 650);
}

function generateDirectedReply(post, commentText) {
  const text = commentText.replace(/\s+/g, " ").trim();
  const quote = text.length > 34 ? `${text.slice(0, 34)}…` : text;
  const hasChildrenQuestion = /孩子|生娃|生那么多|子女|家庭/.test(text);
  const asksWhy = /为什么|为啥|怎么会|何必/.test(text);
  const asksHow = /怎么|如何|怎样|变成|做到|落地/.test(text);
  const asksMoney = /赚钱|收入|商业|付费|会员|产品|增长/.test(text);

  if (post.author === "马斯克") {
    if (hasChildrenQuestion || asksWhy) {
      return `你问“${quote}”。我的回答是：如果一个文明对未来有信心，它就不会只优化当下的舒适度。孩子、火星、公司，本质上都和“未来是否值得投入”有关。你可以不同意，但这不是情绪问题，是时间尺度问题。`;
    }
    if (asksHow || asksMoney) {
      return `你问“${quote}”。先别把它做成复杂功能，先问：这个功能能不能把一个真实痛苦减少 10 倍？如果不能，就删掉；如果能，就用最小版本立刻测试。`;
    }
    return `你说“${quote}”。我会先把它拆成第一性原理：用户的痛苦是什么、约束是什么、最小可验证动作是什么。没有验证之前，观点只是噪音。`;
  }

  if (post.author === "巴菲特") {
    if (asksMoney) {
      return `你问“${quote}”。我会看它能不能产生长期现金流，而不是短期兴奋。会员愿意续费，说明你在持续创造价值；只靠新鲜感成交，迟早会变贵。`;
    }
    return `你提到“${quote}”。我的判断很简单：时间会过滤掉大多数热闹，留下真正能复利的东西。先看十年后它是否仍然有价值。`;
  }

  if (post.author === "苏格拉底") {
    return `你问“${quote}”。在回答之前，我更想追问：你真正想确认的是事实，还是想确认自己没有错？把这个分清楚，问题会变得更诚实。`;
  }

  if (post.author === "Naval") {
    return `你说“${quote}”。我会把它翻译成一个问题：这件事能不能增加你的自由度和长期杠杆？如果只是增加忙碌，它就不是好系统。`;
  }

  if (post.author === "Karpathy") {
    return `你问“${quote}”。先把它拆成输入、判断、输出、反馈四步。AI 真正能稳定帮你的地方，通常出现在边界清楚的中间步骤里。`;
  }

  if (post.human) {
    const reply = post.replies[Math.floor(Math.random() * post.replies.length)];
    return `针对你说的“${quote}”，${reply}`;
  }

  const reply = post.replies[Math.floor(Math.random() * post.replies.length)];
  return `你说“${quote}”。${reply}`;
}

function publishHumanPost(event) {
  event.preventDefault();
  const input = $("#feedInput");
  const value = input.value.trim();
  if (!value) return;
  const post = makePost({
    author: "我",
    role: "真人会员 / 刚刚发布",
    avatar: "我",
    human: true,
    content: escapeHtml(value),
    tags: ["真人观点", "等待人物点评"],
    replies: [
      "马斯克：这个观点要变成产品，需要先定义用户愿意付费的具体结果。",
      "巴菲特：如果它能反复解决同一类问题，就有机会成为长期资产。",
      "苏格拉底：你真正想验证的是观点本身，还是别人是否认可你？"
    ]
  });
  post.comments = [{ type: "agent", name: "人物点评", text: post.replies[0] }];
  appState.feedPosts.unshift(post);
  input.value = "";
  renderFeed();
  showToast("已发布，人物风格已给出第一条点评");
}

function renderScenes() {
  const grid = $("#sceneGrid");
  grid.innerHTML = scenes.map((scene) => `
    <button class="scene-card" data-scene="${scene.id}">
      <span class="solid-icon ${scene.color === "orange" ? "orange" : scene.color === "green" ? "green" : ""}">${scene.icon}</span>
      <div>
        <b>${scene.title}</b>
        <p>${scene.subtitle}</p>
      </div>
    </button>
  `).join("");

  grid.querySelectorAll("[data-scene]").forEach((button) => {
    button.addEventListener("click", () => startDiagnosis(button.dataset.scene));
  });
}

function startDiagnosis(sceneId) {
  appState.selectedScene = sceneId;
  appState.diagnosisStep = 0;
  appState.diagnosisAnswers = [];
  const scene = getScene(sceneId);
  $("#diagnosisKicker").textContent = scene.kicker;
  $("#diagnosisTitle").textContent = `${scene.title}诊断`;
  $("#diagnosisDesc").textContent = scene.desc;
  $("#diagnosisResult").classList.add("hidden");
  showTab("diagnosis");
  renderQuestion();
}

function renderQuestion() {
  const scene = getScene();
  const step = appState.diagnosisStep;
  const question = scene.questions[step];
  $("#diagnosisProgress").style.width = `${(step / scene.questions.length) * 100}%`;
  $("#questionTitle").textContent = question.title;
  $("#choiceList").innerHTML = question.choices.map((choice) => `
    <button class="choice">${choice}</button>
  `).join("");

  $("#choiceList").querySelectorAll(".choice").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.add("selected");
      appState.diagnosisAnswers.push(button.textContent);
      window.setTimeout(nextQuestion, 180);
    });
  });
}

function nextQuestion() {
  const scene = getScene();
  appState.diagnosisStep += 1;
  if (appState.diagnosisStep < scene.questions.length) {
    renderQuestion();
    return;
  }

  $("#diagnosisProgress").style.width = "100%";
  $("#questionTitle").textContent = "诊断完成";
  $("#choiceList").innerHTML = "";
  $("#resultText").textContent = scene.result;
  $("#diagnosisResult").classList.remove("hidden");
  appState.metrics.questions += 1;
  persistMetrics();
  updateMetrics();
  showToast("诊断已写入你的问题资产");
}

function renderAgents() {
  const scene = getScene();
  $("#agentStrip").innerHTML = scene.agents.map((agent, index) => `
    <button class="agent-pill ${index === 0 ? "active" : ""}">${agent}</button>
  `).join("");
}

function addBubble(type, html) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${type}`;
  bubble.innerHTML = html;
  $("#chatPanel").appendChild(bubble);
  bubble.scrollIntoView({ behavior: "smooth", block: "end" });
}

function seedCouncil() {
  renderAgents();
  $("#chatPanel").innerHTML = "";
  addBubble("user", "<p>我有咨询能力，但不知道怎么设计第一个付费产品。</p>");
  const replies = [
    "<p><b>马斯克：</b>先不要问产品形态，问你能替谁减少一个明确成本。</p>",
    "<p><b>巴菲特：</b>如果这个服务不能复购，就不要把它当长期资产。</p>",
    "<p><b>质疑者：</b>你说的“高端用户”太模糊，先定义一个具体画像。</p>"
  ];
  replies.forEach((reply, index) => window.setTimeout(() => addBubble("agent", reply), 180 + index * 160));
}

function runCouncil() {
  const input = $("#councilInput");
  const value = input.value.trim();
  if (!value) return;
  addBubble("user", `<p>${escapeHtml(value)}</p>`);
  input.value = "";
  const scene = getScene();
  const replies = [
    `<p><b>${scene.agents[0]}：</b>把问题压缩成一个可验证动作。不要先做完整产品，先找到一个愿意为结果付费的人。</p>`,
    `<p><b>${scene.agents[1]}：</b>判断它是不是长期资产，要看它能否复购、转介绍，或者沉淀成标准化方法。</p>`,
    `<p><b>行动官：</b>我建议生成 7 天行动方案，把本次议事写入你的个人档案。</p>`
  ];
  replies.forEach((reply, index) => window.setTimeout(() => addBubble("agent", reply), 300 + index * 420));
  appState.metrics.councils += 1;
  persistMetrics();
  updateMetrics();
}

function renderPlan() {
  $("#planList").innerHTML = planItems.map((item, index) => `
    <button class="plan-item" data-plan="${index}">
      <span class="plan-index">${index + 1}</span>
      <div>
        <b>${item.title}</b>
        <p>${item.text}</p>
      </div>
    </button>
  `).join("");

  $("#planList").querySelectorAll(".plan-item").forEach((item) => {
    item.addEventListener("click", () => item.classList.toggle("done"));
  });
}

function updateMetrics() {
  $("#metricQuestions").textContent = appState.metrics.questions;
  $("#metricCouncils").textContent = appState.metrics.councils;
  $("#metricPlans").textContent = appState.metrics.plans;
}

function renderTimeline(extra) {
  const items = extra ? [extra, ...baseTimeline] : baseTimeline;
  $("#timeline").innerHTML = items.map((item) => `
    <div class="timeline-item">
      <b>${item.title}</b>
      <p>${item.text}</p>
    </div>
  `).join("");
}

function renderMembers() {
  $("#memberList").innerHTML = members.map((member) => `
    <div class="member-card">
      <span class="solid-icon green">${member.icon}</span>
      <div>
        <b>${member.name} · ${member.tag}</b>
        <p>${member.need}</p>
      </div>
      <button class="connect-button">申请</button>
    </div>
  `).join("");

  $("#memberList").querySelectorAll(".connect-button").forEach((button) => {
    button.addEventListener("click", () => showToast("已生成连接申请，等待对方同意"));
  });
}

function openPayModal() {
  $("#payStepOne").classList.toggle("hidden", appState.membership);
  $("#payStepDone").classList.toggle("hidden", !appState.membership);
  $("#payModal").classList.add("open");
  $("#payModal").setAttribute("aria-hidden", "false");
}

function closePayModal() {
  $("#payModal").classList.remove("open");
  $("#payModal").setAttribute("aria-hidden", "true");
}

function confirmPay() {
  appState.membership = true;
  localStorage.setItem("ss-member", "true");
  $("#payStepOne").classList.add("hidden");
  $("#payStepDone").classList.remove("hidden");
  showToast("会员已开通，下一步添加企业微信");
}

function markWecom() {
  appState.wecom = true;
  localStorage.setItem("ss-wecom", "true");
  closePayModal();
  showToast("已记录企微状态，等待拉入会员群");
}

function openCommand() {
  $("#command").classList.add("open");
  $("#commandInput").value = "";
  renderCommand("");
  window.setTimeout(() => $("#commandInput").focus(), 40);
}

function closeCommand() {
  $("#command").classList.remove("open");
}

function renderCommand(query) {
  const list = commandOptions.filter((option) => option.label.includes(query));
  $("#commandList").innerHTML = list.map((option, index) => `
    <button class="command-option" data-command="${index}">${option.label}</button>
  `).join("");
  $("#commandList").querySelectorAll(".command-option").forEach((button) => {
    button.addEventListener("click", () => {
      const option = list[Number(button.dataset.command)];
      closeCommand();
      option.action();
    });
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function bindEvents() {
  $all("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => showTab(button.dataset.tab));
  });

  $("#weeklyTopic").addEventListener("click", () => {
    appState.selectedScene = "opc";
    showTab("council");
    seedCouncil();
  });

  $("#startCouncilFromResult").addEventListener("click", () => {
    showTab("council");
    seedCouncil();
  });

  $("#sendCouncil").addEventListener("click", runCouncil);
  $("#councilInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") runCouncil();
  });

  $("#saveCouncil").addEventListener("click", () => {
    appState.metrics.councils += 1;
    persistMetrics();
    updateMetrics();
    renderPlan();
    showTab("plan");
    showToast("议事已写入档案，并生成行动方案");
  });

  $("#finishPlan").addEventListener("click", () => {
    appState.metrics.plans += 1;
    persistMetrics();
    updateMetrics();
    renderTimeline({ title: "刚刚完成：7 天行动方案", text: "已写入行动资产，建议 7 天后生成复盘。" });
    showTab("assets");
    showToast("行动方案已沉淀为数字资产");
  });

  $("#generateReview").addEventListener("click", () => {
    renderTimeline({ title: "本月复盘：商业表达更清晰", text: "系统识别你的核心主题是个人能力产品化和首个付费产品验证。" });
    showToast("复盘已生成");
  });

  $("#profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    showToast("社交档案已保存");
  });

  $("#feedComposer").addEventListener("submit", publishHumanPost);
  $("#refreshFeed").addEventListener("click", refreshFeed);

  $("#openPay").addEventListener("click", openPayModal);
  $("#closePay").addEventListener("click", closePayModal);
  $("#confirmPay").addEventListener("click", confirmPay);
  $("#markWecom").addEventListener("click", markWecom);
  $("#payModal").addEventListener("click", (event) => {
    if (event.target.id === "payModal") closePayModal();
  });

  $("#openSearch").addEventListener("click", openCommand);
  $("#command").addEventListener("click", (event) => {
    if (event.target.id === "command") closeCommand();
  });
  $("#commandInput").addEventListener("input", (event) => renderCommand(event.target.value.trim()));

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openCommand();
    }
    if (event.key === "Escape") {
      closeCommand();
      closePayModal();
    }
  });
}

function init() {
  renderScenes();
  renderAgents();
  seedCouncil();
  renderPlan();
  updateMetrics();
  renderTimeline();
  renderMembers();
  refreshFeed();
  bindEvents();
  showTab("scenes");
}

init();
