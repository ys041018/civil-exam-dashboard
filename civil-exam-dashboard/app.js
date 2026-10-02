(() => {
  "use strict";

  const STORAGE_KEY = "civil-exam-dashboard-v1";
  const MODULES = ["言语理解", "判断推理", "数量关系", "资料分析", "常识判断"];
  const CAUSES = ["不会", "太慢", "粗心", "蒙对", "方法不熟"];
  const JOB_STATUSES = ["待核验", "可报", "优先", "放弃", "已报名"];
  const REVIEW_INTERVALS = [2, 4, 7, 14, 30];
  const ROUTES = Array.isArray(window.CIVIL_EXAM_ROUTES) ? window.CIVIL_EXAM_ROUTES : [];

  const DEFAULT_SETTINGS = {
    region: "江苏",
    degree: "本科",
    major: "交通设备与控制工程",
    nationalExamDate: "2026-11-29",
    jiangsuExamDate: "2026-12-06",
    nationalRegistrationStart: "2026-10-15",
    nationalRegistrationEnd: "2026-10-24",
    jiangsuRegistrationStart: "2026-11-04",
    jiangsuRegistrationEnd: "",
    datesAreEstimated: false,
    baselineScore: 50,
    targetScore: 75,
    dailyHours: 6,
    studyDaysPerWeek: 7,
    startDate: "2026-10-02"
  };

  const DEFAULT_STATE = {
    schemaVersion: 2,
    settings: { ...DEFAULT_SETTINGS },
    mocks: [],
    drills: [],
    focusSessions: [],
    routeNotes: {},
    errors: [],
    jobs: [],
    completedTasks: {},
    customTasks: []
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let state = loadState();
  let selectedPlanDate = todayString();
  let selectedRouteId = ROUTES[0]?.id || "";
  let timerState = { totalSeconds: 25 * 60, remainingSeconds: 25 * 60, intervalId: null, running: false, routeId: "", routeName: "" };
  let toastId = 0;
  let chartResizeTimer = 0;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : normalizeState(DEFAULT_STATE);
    } catch (error) {
      console.error("读取本地数据失败", error);
      return normalizeState(DEFAULT_STATE);
    }
  }

  function normalizeState(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const settings = { ...DEFAULT_SETTINGS, ...(source.settings || {}) };
    const storedVersion = Number(source.schemaVersion) || 1;
    if (storedVersion < 2) {
      if (Number(settings.targetScore) === 70) settings.targetScore = 75;
      if (Number(settings.dailyHours) === 8) settings.dailyHours = 6;
      if (settings.datesAreEstimated === true) settings.datesAreEstimated = false;
    }
    return {
      schemaVersion: 2,
      settings,
      mocks: Array.isArray(source.mocks) ? source.mocks.map(normalizeMock).filter(Boolean) : [],
      drills: Array.isArray(source.drills) ? source.drills.map(normalizeDrill).filter(Boolean) : [],
      focusSessions: Array.isArray(source.focusSessions) ? source.focusSessions.filter((item) => item && item.date) : [],
      routeNotes: source.routeNotes && typeof source.routeNotes === "object" ? { ...source.routeNotes } : {},
      errors: Array.isArray(source.errors) ? source.errors.map(normalizeError).filter(Boolean) : [],
      jobs: Array.isArray(source.jobs) ? source.jobs.map(normalizeJob).filter(Boolean) : [],
      completedTasks: source.completedTasks && typeof source.completedTasks === "object" ? { ...source.completedTasks } : {},
      customTasks: Array.isArray(source.customTasks)
        ? source.customTasks
          .filter((task) => task && task.date && task.title)
          .map((task) => ({ ...task, id: task.id || uid() }))
        : [],
      updatedAt: source.updatedAt || null
    };
  }

  function normalizeMock(item) {
    if (!item || typeof item !== "object" || !item.date) return null;
    const modules = {};
    if (item.modules && typeof item.modules === "object") {
      MODULES.forEach((moduleName) => {
        const value = Number(item.modules[moduleName]);
        if (Number.isFinite(value)) modules[moduleName] = clamp(value, 0, 100);
      });
    }
    return {
      id: item.id || uid(),
      date: item.date,
      type: item.type || "其他",
      xingceScore: clamp(Number(item.xingceScore) || 0, 0, 100),
      shenlunScore: item.shenlunScore === null || item.shenlunScore === "" || item.shenlunScore === undefined ? null : clamp(Number(item.shenlunScore) || 0, 0, 100),
      durationMinutes: Math.max(1, Number(item.durationMinutes) || 120),
      modules,
      notes: String(item.notes || ""),
      createdAt: item.createdAt || new Date().toISOString()
    };
  }

  function normalizeError(item) {
    if (!item || typeof item !== "object" || !item.summary) return null;
    const date = item.date || todayString();
    return {
      id: item.id || uid(),
      date,
      module: MODULES.includes(item.module) || item.module === "申论" ? item.module : "判断推理",
      cause: CAUSES.includes(item.cause) ? item.cause : "方法不熟",
      summary: String(item.summary || ""),
      knowledgePoint: String(item.knowledgePoint || ""),
      nextReviewDate: item.nextReviewDate || addDays(date, 2),
      reviewCount: Math.max(0, Number(item.reviewCount) || 0),
      lastReviewed: item.lastReviewed || null,
      notes: String(item.notes || "")
    };
  }

  function normalizeDrill(item) {
    if (!item || typeof item !== "object" || !item.date || !item.module) return null;
    const total = Math.max(1, Number(item.total) || 1);
    return {
      id: item.id || uid(),
      date: item.date,
      module: MODULES.includes(item.module) || item.module === "申论" ? item.module : "言语理解",
      total,
      correct: clamp(Number(item.correct) || 0, 0, total),
      minutes: Math.max(1, Number(item.minutes) || 1),
      notes: String(item.notes || ""),
      createdAt: item.createdAt || new Date().toISOString()
    };
  }

  function normalizeJob(item) {
    if (!item || typeof item !== "object" || !item.title) return null;
    return {
      id: item.id || uid(),
      examType: item.examType === "江苏省考" ? "江苏省考" : "国考",
      title: String(item.title || ""),
      region: String(item.region || ""),
      majorRequirement: String(item.majorRequirement || ""),
      deadline: item.deadline || "",
      status: JOB_STATUSES.includes(item.status) ? item.status : "待核验",
      notes: String(item.notes || ""),
      createdAt: item.createdAt || new Date().toISOString()
    };
  }

  function saveState() {
    try {
      state.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      persistStateToServer();
      renderLastUpdated();
      return true;
    } catch (error) {
      console.error("保存本地数据失败", error);
      showToast("数据保存失败，请先导出备份并检查浏览器存储权限。", "error");
      return false;
    }
  }

  async function persistStateToServer() {
    if (!/^https?:$/.test(window.location.protocol)) return;
    if (window.location.hostname.endsWith("github.io")) return;
    try {
      await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
        keepalive: true
      });
    } catch (error) {
      console.warn("服务端数据同步暂时不可用，已保留浏览器本地数据。", error);
    }
  }

  async function hydrateStateFromServer() {
    if (!/^https?:$/.test(window.location.protocol)) return;
    if (window.location.hostname.endsWith("github.io")) return;
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json();
        if (payload?.exists === false) {
          if (state.updatedAt) await persistStateToServer();
          return;
        }
        const remoteState = normalizeState(payload);
        const localTime = Date.parse(state.updatedAt || 0) || 0;
        const remoteTime = Date.parse(remoteState.updatedAt || 0) || 0;
        if (remoteTime >= localTime) state = remoteState;
        else await persistStateToServer();
      } else if (state.updatedAt) {
        await persistStateToServer();
      }
    } catch (error) {
      console.warn("共享数据服务暂不可用，继续使用浏览器本地数据。", error);
    }
  }

  async function renderMobileAccess() {
    const container = $("#mobile-access-status");
    if (!container) return;
    if (window.location.hostname.endsWith("github.io")) {
      container.innerHTML = `
        <p class="notice-text">当前是云端网页版，不需要电脑持续开机。</p>
        <ol class="ordered-list">
          <li>用手机或平板浏览器打开当前网址。</li>
          <li>选择“添加到主屏幕”，以后像 App 一样进入。</li>
          <li>学习记录保存在当前设备；如需多设备自动同步，再接入云端数据库。</li>
        </ol>`;
      return;
    }
    if (!/^https?:$/.test(window.location.protocol)) {
      container.innerHTML = '<div class="empty-state">请通过桌面启动快捷方式打开，才能使用局域网共享模式。</div>';
      return;
    }
    try {
      const response = await fetch("/api/info", { cache: "no-store" });
      if (!response.ok) throw new Error("info unavailable");
      const info = await response.json();
      if (info.lanEnabled && info.urls?.length) {
        container.innerHTML = `
          <p class="notice-text">手机和平板与电脑连接同一个 Wi-Fi 后，用浏览器打开下面地址：</p>
          <div class="mobile-url-list">${info.urls.map((url) => `<code>${escapeHTML(url)}</code>`).join("")}</div>
          <p class="form-hint">电脑和移动设备共用同一份记录。请只在可信的家庭网络中开启共享模式。</p>`;
      } else {
        container.innerHTML = `
          <p class="notice-text">当前是电脑本地模式，手机暂时无法访问。</p>
          <ol class="ordered-list">
            <li>关闭当前服务窗口。</li>
            <li>双击桌面“启动手机访问模式”。</li>
            <li>手机连接同一个 Wi-Fi，并打开窗口显示的局域网地址。</li>
          </ol>
          <p class="form-hint">第一次启动时 Windows 可能询问防火墙权限，请允许“专用网络”。</p>`;
      }
    } catch (error) {
      container.innerHTML = '<div class="empty-state">无法读取共享模式状态，请确认使用桌面快捷方式启动。</div>';
    }
  }

  function commit(message, tone = "success") {
    if (!saveState()) return;
    renderAll();
    if (message) showToast(message, tone);
  }

  function todayString() {
    return toISODate(new Date());
  }

  function parseLocalDate(value) {
    if (!value || typeof value !== "string") return new Date(NaN);
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return new Date(NaN);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(value, amount) {
    const date = typeof value === "string" ? parseLocalDate(value) : new Date(value);
    date.setDate(date.getDate() + amount);
    return toISODate(date);
  }

  function daysBetween(from, to) {
    const start = parseLocalDate(from);
    const end = parseLocalDate(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((end.getTime() - start.getTime()) / msPerDay);
  }

  function formatDateCN(value) {
    const date = parseLocalDate(value);
    if (Number.isNaN(date.getTime())) return "未设置";
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function formatDateTime(value) {
    if (!value) return "尚未保存";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "尚未保存";
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  function weekdayLabel(value) {
    const labels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return labels[parseLocalDate(value).getDay()] || "";
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function roundToFive(value) {
    return Math.max(5, Math.round(value / 5) * 5);
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHTML(value) {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return String(value ?? "").replace(/[&<>"']/g, (character) => map[character]);
  }

  function formatScore(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "--";
    return Number.isInteger(number) ? String(number) : number.toFixed(1);
  }

  function formatMinutes(minutes) {
    if (!Number.isFinite(minutes) || minutes <= 0) return "0 小时";
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);
    if (!hours) return `${rest} 分钟`;
    return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
  }

  function showToast(message, tone = "success") {
    const region = $("#toast-region");
    if (!region) return;
    const id = `toast-${++toastId}`;
    const element = document.createElement("div");
    element.className = `toast is-${tone}`;
    element.id = id;
    element.textContent = message;
    region.appendChild(element);
    window.setTimeout(() => element.remove(), 3600);
  }

  function getSortedMocks(ascending = true) {
    const items = [...state.mocks].sort((a, b) => {
      const dateCompare = parseLocalDate(a.date) - parseLocalDate(b.date);
      if (dateCompare !== 0) return dateCompare;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });
    return ascending ? items : items.reverse();
  }

  function getLatestMock() {
    const items = getSortedMocks(false);
    return items[0] || null;
  }

  function getCurrentScoreInfo() {
    const latest = getLatestMock();
    if (latest) return { score: latest.xingceScore, label: "最近套卷", source: "mock" };
    return { score: Number(state.settings.baselineScore) || 0, label: "基线", source: "baseline" };
  }

  function getWeakModules() {
    const latest = getLatestMock();
    if (!latest) return [];
    return Object.entries(latest.modules || {})
      .filter(([, value]) => Number.isFinite(Number(value)))
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 2);
  }

  function getCompletedMinutes() {
    return Object.values(state.completedTasks || {}).reduce((sum, minutes) => sum + Math.max(0, Number(minutes) || 0), 0);
  }

  function getStreak() {
    const completedDates = new Set(Object.keys(state.completedTasks || {}).map((key) => key.split("::")[0]));
    if (!completedDates.size) return 0;
    let cursor = todayString();
    if (!completedDates.has(cursor)) cursor = addDays(cursor, -1);
    let streak = 0;
    while (completedDates.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function getDueErrors() {
    const today = todayString();
    return [...state.errors]
      .filter((item) => daysBetween(item.nextReviewDate, today) >= 0)
      .sort((a, b) => parseLocalDate(a.nextReviewDate) - parseLocalDate(b.nextReviewDate));
  }

  function getFocusForDate(date) {
    const weekday = parseLocalDate(date).getDay();
    const defaults = { 1: "判断推理", 2: "言语理解", 3: "资料分析", 4: "数量关系", 5: "判断推理 + 言语理解" };
    const weakNames = getWeakModules().map((item) => item.name);
    const unique = (items) => [...new Set(items.filter(Boolean))];

    if (weekday === 1) return weakNames[0] || defaults[1];
    if (weekday === 2) return weakNames[1] || weakNames[0] || defaults[2];
    if (weekday === 3) return weakNames.includes("资料分析") ? "资料分析" : defaults[3];
    if (weekday === 4) return weakNames.includes("数量关系") ? "数量关系" : defaults[4];
    if (weekday === 5) {
      const focus = unique([weakNames[0], weakNames[1], "判断推理", "言语理解"]).slice(0, 2);
      return focus.join(" + ") || defaults[5];
    }
    return defaults[weekday] || "判断推理";
  }

  function generateDailyPlan(date) {
    const totalMinutes = Math.max(60, (Number(state.settings.dailyHours) || 8) * 60);
    const weekday = parseLocalDate(date).getDay();
    const allRouteIds = ROUTES.map((route) => route.id);
    const weakRouteIds = getWeakModules()
      .map((item) => getRouteByName(item.name)?.id)
      .filter(Boolean);
    const priorityRouteIds = weakRouteIds.length ? weakRouteIds : allRouteIds;
    let blocks;

    if (weekday === 6) {
      blocks = [
        { id: "mock", title: "限时行测套卷", category: "套卷", ratio: 0.4, detail: "严格计时，优先使用国考或江苏真题。", routeIds: allRouteIds },
        { id: "mock-review", title: "套卷全量复盘", category: "复盘", ratio: 0.3, detail: "逐题标出错因，并回填模块正确率。", routeIds: allRouteIds },
        { id: "essay", title: "申论限时训练", category: "申论", ratio: 0.15, detail: "按题型完成，重点写清要点来源。", routeIds: ["essay"] },
        { id: "error", title: "错题归档与重做", category: "错题", ratio: 0.1, detail: "把本周错题按模块归入错题本。", routeIds: priorityRouteIds },
        { id: "plan", title: "下周计划微调", category: "计划", ratio: 0.05, detail: "依据套卷弱项调整下一周模块顺序。" }
      ];
    } else if (weekday === 0) {
      blocks = [
        { id: "weak", title: "本周弱项集中重做", category: "补弱", ratio: 0.35, detail: "只做最弱模块，追求正确率和速度同时提升。", routeIds: priorityRouteIds },
        { id: "error-review", title: "到期错题复习", category: "错题", ratio: 0.25, detail: "先复述方法，再做同类题验证。", routeIds: allRouteIds },
        { id: "essay", title: "申论复盘与重写", category: "申论", ratio: 0.2, detail: "对照参考答案重写一段或一道题。", routeIds: ["essay"] },
        { id: "weekly", title: "本周学习盘点", category: "复盘", ratio: 0.1, detail: "记录完成量、正确率和主要问题。", routeIds: allRouteIds },
        { id: "plan", title: "制定下周计划", category: "计划", ratio: 0.1, detail: "明确下一周主攻模块和套卷安排。" }
      ];
    } else {
      const focus = getFocusForDate(date);
      const focusRoutes = getRoutesForFocus(focus);
      const focusRouteIds = focusRoutes.length ? focusRoutes.map((route) => route.id) : ["judgment"];
      const questionTarget = focusRoutes.reduce((sum, route) => sum + route.dailyQuestions, 0) || 30;
      blocks = [
        { id: "review", title: "昨日错题复做", category: "复盘", ratio: 0.1, detail: "先不看答案，重做昨天标记的错题；做完再查看方法卡。", routeIds: focusRouteIds },
        { id: "foundation", title: `${focus}基础学习`, category: "学习", ratio: 0.15, detail: "固定跟一位老师学 1 节方法课，整理题型、公式和常见陷阱。", routeIds: focusRouteIds },
        { id: "practice", title: `${focus}专项刷题（约 ${questionTarget} 题）`, category: "刷题", ratio: 0.2, detail: "按题型分组完成，记录正确数和用时；先保证方法正确，再逐步压缩时间。", routeIds: focusRouteIds },
        { id: "essay", title: "申论题型训练", category: "申论", ratio: 0.2, detail: "按概括、分析、对策或写作轮换推进；必须动笔并对照答案复盘。", routeIds: ["essay"] },
        { id: "speed", title: "资料分析 / 速算", category: "速度", ratio: 0.15, detail: "练截位直除、百化分和分数比较，重点记录找数与计算时间。", routeIds: ["data"] },
        { id: "error", title: "错因归档", category: "错题", ratio: 0.1, detail: "把错题写成可复习的错因和知识点，并安排下次复做。", routeIds: focusRouteIds },
        { id: "memory", title: "时政 / 常识 / 词语", category: "积累", ratio: 0.05, detail: "做 30 题并复盘高频考点，控制在 30 分钟内。", routeIds: ["knowledge"] },
        { id: "flex", title: "弹性补弱", category: "补弱", ratio: 0.05, detail: "根据当天状态补最弱的一小块，不新增低优先级内容。", routeIds: focusRouteIds }
      ];
    }

    return blocks.map((block) => ({
      ...block,
      minutes: roundToFive(totalMinutes * block.ratio),
      type: "generated"
    }));
  }

  function getTasksForDate(date) {
    const generated = generateDailyPlan(date);
    const custom = state.customTasks
      .filter((task) => task.date === date)
      .map((task) => ({
        id: `custom-${task.id}`,
        title: task.title,
        category: "自定义",
        detail: task.detail || "自定义任务",
        minutes: clamp(Number(task.minutes) || 60, 5, 600),
        type: "custom",
        customId: task.id
      }));
    return [...generated, ...custom];
  }

  function getTaskKey(date, taskId) {
    return `${date}::${taskId}`;
  }

  function isTaskComplete(date, taskId) {
    return Object.prototype.hasOwnProperty.call(state.completedTasks, getTaskKey(date, taskId));
  }

  function renderAll() {
    renderHeader();
    renderOverview();
    renderMethods();
    renderPlan();
    renderMocks();
    renderErrors();
    renderJobs();
    renderSettingsForm();
    renderLastUpdated();
  }

  function renderLastUpdated() {
    const element = $("#last-updated");
    if (element) element.textContent = state.updatedAt ? formatDateTime(state.updatedAt) : "尚未保存";
  }

  function renderHeader() {
    const current = getCurrentScoreInfo();
    const target = Number(state.settings.targetScore) || 0;
    const targetElement = $("#header-target");
    const daysElement = $("#header-days");
    if (targetElement) targetElement.textContent = `行测 ${formatScore(current.score)} → ${formatScore(target)}`;
    if (daysElement) {
      const days = daysBetween(todayString(), state.settings.nationalExamDate);
      daysElement.textContent = days > 0 ? `距国考约 ${days} 天` : days === 0 ? "今天国考笔试" : "国考笔试已结束";
    }
  }

  function renderOverview() {
    renderCountdowns();
    renderRegistrationTimeline();
    renderKpis();
    renderOverviewToday();
    renderWeakness();
    renderModuleOverview();
    renderDashboardErrors();
    renderRecentMocks();
  }

  function renderCountdowns() {
    const container = $("#countdown-grid");
    if (!container) return;
    const today = todayString();
    const start = state.settings.startDate;
    const exams = [
      { id: "national", label: "国考笔试", date: state.settings.nationalExamDate, className: "" },
      { id: "jiangsu", label: "江苏省考笔试", date: state.settings.jiangsuExamDate, className: "secondary" }
    ];

    container.innerHTML = exams.map((exam) => {
      const days = daysBetween(today, exam.date);
      const total = Math.max(1, daysBetween(start, exam.date));
      const elapsed = clamp(daysBetween(start, today), 0, total);
      const progress = clamp((elapsed / total) * 100, 0, 100);
      let value;
      let note;
      if (days > 0) {
        value = `${days}<small>天</small>`;
        note = "距离笔试";
      } else if (days === 0) {
        value = "今天";
        note = "调整状态，准备应考";
      } else {
        value = "已结束";
        note = "请按官方公告更新考试日期";
      }
      return `
        <article class="countdown-card ${exam.className}">
          <div class="countdown-topline">
            <span class="countdown-label">${escapeHTML(exam.label)}</span>
            <span class="countdown-badge">${state.settings.datesAreEstimated ? "预计" : "已确认"}</span>
          </div>
          <div class="countdown-value">${value}</div>
          <p class="countdown-date">${formatDateCN(exam.date)} · ${note}</p>
          <div class="progress-track"><div class="progress-fill" style="width:${progress.toFixed(1)}%"></div></div>
        </article>`;
    }).join("");
  }

  function getRegistrationEvents() {
    const settings = state.settings;
    return [
      { label: "国考报名开始", date: settings.nationalRegistrationStart, kind: "start" },
      { label: "国考报名截止", date: settings.nationalRegistrationEnd, kind: "deadline" },
      { label: "江苏省考报名开始", date: settings.jiangsuRegistrationStart, kind: "start" },
      { label: "江苏省考报名截止", date: settings.jiangsuRegistrationEnd, kind: "deadline" },
      { label: "国考笔试", date: settings.nationalExamDate, kind: "exam" },
      { label: "江苏省考笔试", date: settings.jiangsuExamDate, kind: "exam" }
    ]
      .filter((event) => event.date)
      .sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date));
  }

  function renderRegistrationTimeline() {
    const container = $("#registration-timeline");
    if (!container) return;
    const events = getRegistrationEvents();
    if (!events.length) {
      container.innerHTML = '<div class="empty-state">尚未设置报名和考试日期。</div>';
      return;
    }
    const today = todayString();
    const nextIndex = events.findIndex((event) => daysBetween(today, event.date) >= 0);
    container.innerHTML = events.map((event, index) => {
      const days = daysBetween(today, event.date);
      const past = days < 0;
      const isToday = days === 0;
      const isNext = index === nextIndex && !isToday;
      let status;
      if (isToday) status = "今天";
      else if (days > 0) status = `还有 ${days} 天`;
      else if (event.kind === "deadline") status = "已截止";
      else if (event.kind === "exam") status = "已结束";
      else status = "已开始";
      return `
        <article class="registration-node ${isNext ? "is-next" : ""} ${isToday ? "is-today" : ""} ${past ? "is-past" : ""}">
          <strong>${escapeHTML(event.label)}</strong>
          <time>${formatDateCN(event.date)}</time>
          <span class="registration-status">${status}</span>
        </article>`;
    }).join("");
  }

  function renderKpis() {
    const container = $("#overview-kpis");
    if (!container) return;
    const current = getCurrentScoreInfo();
    const baseline = Number(state.settings.baselineScore) || 0;
    const target = Number(state.settings.targetScore) || 0;
    const gap = Math.max(0, target - Number(current.score));
    const completedMinutes = getCompletedMinutes();
    const dueErrors = getDueErrors().length;
    const streak = getStreak();
    const totalQuestions = state.drills.reduce((sum, drill) => sum + drill.total, 0);
    const cards = [
      { label: "当前行测", value: formatScore(current.score), note: current.label },
      { label: "距离目标", value: `${formatScore(gap)} 分`, note: `目标 ${formatScore(target)} 分` },
      { label: "累计学习", value: formatMinutes(completedMinutes), note: `基线 ${formatScore(baseline)} 分` },
      { label: "累计刷题", value: `${totalQuestions} 题`, note: `连续执行 ${streak} 天` },
      { label: "到期错题", value: `${dueErrors} 条`, note: dueErrors ? "建议今天优先复习" : "当前没有积压" },
    ];
    container.innerHTML = cards.map((card) => `
      <article class="kpi-card">
        <span class="kpi-label">${escapeHTML(card.label)}</span>
        <strong class="kpi-value">${escapeHTML(card.value)}</strong>
        <span class="kpi-note">${escapeHTML(card.note)}</span>
      </article>`).join("");
  }

  function renderOverviewToday() {
    const container = $("#overview-today-list");
    if (!container) return;
    const date = todayString();
    const tasks = getTasksForDate(date);
    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state">今天还没有计划。</div>';
      return;
    }
    const completed = tasks.filter((task) => isTaskComplete(date, task.id));
    const progress = Math.round((completed.length / tasks.length) * 100);
    const nextTasks = tasks.filter((task) => !isTaskComplete(date, task.id)).slice(0, 3);
    container.innerHTML = `
      <div class="compact-item">
        <div class="compact-item-main">
          <strong>今日完成 ${completed.length}/${tasks.length}</strong>
          <div class="progress-track dark" style="margin-top:9px"><div class="progress-fill" style="width:${progress}%"></div></div>
        </div>
        <span class="compact-meta">${progress}%</span>
      </div>
      ${nextTasks.length ? nextTasks.map((task) => `
        <div class="compact-item">
          <div class="compact-item-main">
            <strong>${escapeHTML(task.title)}</strong>
            <p>${escapeHTML(task.detail)}</p>
          </div>
          <span class="compact-meta">${task.minutes} 分钟</span>
        </div>`).join("") : '<div class="empty-state">今天的任务已经全部完成。</div>'}`;
  }

  function renderWeakness() {
    const container = $("#weakness-list");
    if (!container) return;
    const weakModules = getWeakModules();
    if (!weakModules.length) {
      container.innerHTML = `
        <div class="empty-state">
          完成第一次限时行测并录入五个模块正确率后，系统会自动判断弱项。
        </div>`;
      return;
    }
    container.innerHTML = weakModules.map((item, index) => `
      <div class="weakness-item">
        <span class="weakness-rank">${index + 1}</span>
        <div>
          <strong>${escapeHTML(item.name)}</strong>
          <p>${item.value < 50 ? "优先补基础方法和题型识别。" : "需要提高稳定性和做题速度。"}</p>
        </div>
        <span class="weakness-score">${formatScore(item.value)}%</span>
      </div>`).join("");
  }

  function renderModuleOverview() {
    const container = $("#module-overview");
    if (!container) return;
    const latest = getLatestMock();
    const weakNames = new Set(getWeakModules().map((item) => item.name));
    container.innerHTML = MODULES.map((moduleName) => {
      const value = latest && Number.isFinite(Number(latest.modules?.[moduleName])) ? Number(latest.modules[moduleName]) : null;
      const display = value === null ? "--" : `${formatScore(value)}%`;
      const stateText = value === null ? "待诊断" : weakNames.has(moduleName) ? "当前弱项" : value >= 70 ? "较稳定" : "需要加强";
      const width = value === null ? 0 : clamp(value, 0, 100);
      return `
        <article class="module-card">
          <div class="module-card-header">
            <strong>${escapeHTML(moduleName)}</strong>
            ${weakNames.has(moduleName) ? '<span class="badge badge-warning">弱项</span>' : ""}
          </div>
          <span class="module-value">${display}</span>
          <span class="module-state">${stateText}</span>
          <div class="mini-track"><span style="width:${width}%"></span></div>
        </article>`;
    }).join("");
  }

  function renderDashboardErrors() {
    const container = $("#dashboard-errors");
    if (!container) return;
    const due = getDueErrors().slice(0, 5);
    if (!due.length) {
      container.innerHTML = '<div class="empty-state">当前没有到期错题。</div>';
      return;
    }
    const today = todayString();
    container.innerHTML = due.map((item) => {
      const overdueDays = Math.max(0, daysBetween(item.nextReviewDate, today));
      return `
        <div class="compact-item">
          <div class="compact-item-main">
            <strong>${escapeHTML(item.summary)}</strong>
            <p>${escapeHTML(item.module)} · ${escapeHTML(item.cause)}${item.knowledgePoint ? ` · ${escapeHTML(item.knowledgePoint)}` : ""}</p>
          </div>
          <span class="badge ${overdueDays ? "badge-danger" : "badge-warning"}">${overdueDays ? `逾期 ${overdueDays} 天` : "今天复习"}</span>
        </div>`;
    }).join("");
  }

  function renderRecentMocks() {
    const container = $("#recent-mocks");
    if (!container) return;
    const mocks = getSortedMocks(false).slice(0, 3);
    if (!mocks.length) {
      container.innerHTML = '<div class="empty-state">还没有套卷记录，先完成一次限时行测。</div>';
      return;
    }
    container.innerHTML = mocks.map((mock) => `
      <div class="compact-item">
        <div class="compact-item-main">
          <strong>${escapeHTML(mock.type)}</strong>
          <p>${formatDateCN(mock.date)} · 用时 ${mock.durationMinutes} 分钟</p>
        </div>
        <span class="compact-meta">行测 ${formatScore(mock.xingceScore)}</span>
      </div>`).join("");
  }

  function renderPlan() {
    renderPhaseTimeline();
    const dateInput = $("#plan-date");
    if (dateInput && dateInput.value !== selectedPlanDate) dateInput.value = selectedPlanDate;
    const customForm = $("#custom-task-form");
    if (customForm && customForm.elements.date) customForm.elements.date.value = selectedPlanDate;
    renderDailyPlan();
    renderWeeklyTemplate();
    renderTimer();
  }

  function buildPhases() {
    const start = state.settings.startDate;
    const national = state.settings.nationalExamDate;
    const jiangsu = state.settings.jiangsuExamDate;
    const toNational = daysBetween(start, national);
    const phases = [];

    if (toNational > 28) {
      phases.push({
        title: "诊断与基础启动",
        start,
        end: addDays(start, 13),
        description: "完成行测、申论诊断，建立五个行测模块基线，确定每天执行节奏。"
      });
      phases.push({
        title: "共同底座强化",
        start: addDays(start, 14),
        end: addDays(national, -14),
        description: "主攻高频模块和申论基础，保留江苏真题训练，不把省考拖到国考后。"
      });
      phases.push({
        title: "国考专项冲刺",
        start: addDays(national, -13),
        end: national,
        description: "以国考真题、申论风格、时政和限时套卷为主，补齐弱项。"
      });
    } else {
      const firstEnd = addDays(start, Math.max(0, Math.floor(toNational / 3)));
      const secondEnd = addDays(start, Math.max(1, Math.floor((toNational * 2) / 3)));
      phases.push({ title: "诊断与基础启动", start, end: firstEnd, description: "先完成摸底，建立模块基线。" });
      phases.push({ title: "共同底座强化", start: addDays(firstEnd, 1), end: secondEnd, description: "快速补齐高频模块和申论基础。" });
      phases.push({ title: "国考专项冲刺", start: addDays(secondEnd, 1), end: national, description: "进入真题和套卷节奏。" });
    }

    if (daysBetween(national, jiangsu) >= 0) {
      phases.push({
        title: "江苏专项冲刺",
        start: addDays(national, 1),
        end: jiangsu,
        description: "切换江苏真题、A/B/C 类差异和特色考点，保持套卷手感。"
      });
    }
    return phases;
  }

  function renderPhaseTimeline() {
    const container = $("#phase-timeline");
    if (!container) return;
    const today = todayString();
    const phases = buildPhases();
    container.innerHTML = phases.map((phase, index) => {
      const isCurrent = daysBetween(phase.start, today) >= 0 && daysBetween(today, phase.end) >= 0;
      return `
        <article class="phase-card ${isCurrent ? "is-current" : ""}">
          <span class="phase-index">${index + 1}</span>
          <h4>${escapeHTML(phase.title)}${isCurrent ? " · 当前" : ""}</h4>
          <p>${escapeHTML(phase.description)}</p>
          <time>${formatDateCN(phase.start)} - ${formatDateCN(phase.end)}</time>
        </article>`;
    }).join("");
  }

  function renderDailyPlan() {
    const container = $("#daily-plan-list");
    const title = $("#daily-plan-title");
    const progressLabel = $("#daily-plan-progress");
    const progressBar = $("#daily-plan-progress-bar");
    if (!container) return;
    const tasks = getTasksForDate(selectedPlanDate);
    const completed = tasks.filter((task) => isTaskComplete(selectedPlanDate, task.id));
    const progress = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;
    const completedMinutes = completed.reduce((sum, task) => sum + task.minutes, 0);
    if (title) title.textContent = `${formatDateCN(selectedPlanDate)} ${weekdayLabel(selectedPlanDate)}`;
    if (progressLabel) progressLabel.textContent = `${progress}%`;
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state">这一天还没有计划。</div>';
      return;
    }
    container.innerHTML = tasks.map((task) => {
      const complete = isTaskComplete(selectedPlanDate, task.id);
      const methodLink = task.routeIds?.length
        ? `<button class="text-button task-method-link" type="button" data-open-route="${escapeHTML(task.routeIds[0])}">查看模块方法与名师视频</button>`
        : "";
      return `
        <label class="task-item ${complete ? "is-complete" : ""}">
          <input class="task-checkbox" type="checkbox" data-task-id="${escapeHTML(task.id)}" data-task-minutes="${task.minutes}" ${complete ? "checked" : ""}>
          <span>
            <span class="task-title"><span class="task-category">${escapeHTML(task.category)}</span>${escapeHTML(task.title)}</span>
            <span class="task-detail">${escapeHTML(task.detail)}</span>
            ${methodLink}
          </span>
          <span class="task-minutes">${task.minutes} 分钟</span>
        </label>`;
    }).join("") + `<p class="form-hint">已完成 ${completedMinutes} 分钟。任务状态按日期保存在本机。</p>`;
  }

  function renderWeeklyTemplate() {
    const container = $("#weekly-template");
    if (!container) return;
    const items = [
      { day: "周一", text: "判断推理主攻" },
      { day: "周二", text: "言语理解主攻" },
      { day: "周三", text: "资料分析 + 速算" },
      { day: "周四", text: "数量关系基础题" },
      { day: "周五", text: "判断 + 言语混合" },
      { day: "周六", text: "限时套卷 + 全量复盘" },
      { day: "周日", text: "弱项重做 + 下周计划" }
    ];
    container.innerHTML = items.map((item) => `<div class="week-day"><strong>${item.day}</strong><span>${item.text}</span></div>`).join("");
  }

  function renderMocks() {
    renderMockChart();
    renderModuleBars();
    renderMockTable();
  }

  function renderMockChart() {
    const canvas = $("#score-chart");
    const empty = $("#score-chart-empty");
    if (!canvas) return;
    const mocks = getSortedMocks(true).slice(-12);
    if (mocks.length < 2) {
      canvas.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }
    canvas.hidden = false;
    if (empty) empty.hidden = true;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 80) return;

    const dpr = window.devicePixelRatio || 1;
    const width = rect.width;
    const height = 310;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const padding = { top: 28, right: 18, bottom: 42, left: 42 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const scores = mocks.map((item) => Number(item.xingceScore) || 0);
    let minScore = Math.max(0, Math.floor((Math.min(...scores) - 5) / 5) * 5);
    let maxScore = Math.min(100, Math.ceil((Math.max(...scores) + 5) / 5) * 5);
    if (maxScore - minScore < 10) {
      minScore = Math.max(0, minScore - 5);
      maxScore = Math.min(100, maxScore + 5);
    }
    const scoreToY = (score) => padding.top + chartHeight - ((score - minScore) / (maxScore - minScore)) * chartHeight;
    const indexToX = (index) => padding.left + (mocks.length === 1 ? chartWidth / 2 : (index / (mocks.length - 1)) * chartWidth);

    context.font = '12px "Microsoft YaHei", sans-serif';
    context.textBaseline = "middle";
    context.strokeStyle = "#dce5e8";
    context.fillStyle = "#7b8b91";
    context.lineWidth = 1;
    for (let index = 0; index <= 5; index += 1) {
      const value = minScore + ((maxScore - minScore) * index) / 5;
      const y = scoreToY(value);
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
      context.fillText(formatScore(value), 4, y);
    }

    context.lineWidth = 3;
    context.strokeStyle = "#176b6b";
    context.lineJoin = "round";
    context.beginPath();
    mocks.forEach((mock, index) => {
      const x = indexToX(index);
      const y = scoreToY(Number(mock.xingceScore) || 0);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();

    mocks.forEach((mock, index) => {
      const x = indexToX(index);
      const y = scoreToY(Number(mock.xingceScore) || 0);
      context.beginPath();
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#176b6b";
      context.lineWidth = 3;
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = "#176b6b";
      context.textAlign = "center";
      context.textBaseline = "bottom";
      context.fillText(formatScore(mock.xingceScore), x, y - 8);
      if (mocks.length <= 6 || index % 2 === 0 || index === mocks.length - 1) {
        context.fillStyle = "#7b8b91";
        context.textBaseline = "top";
        const [, month, day] = mock.date.split("-");
        context.fillText(`${month}/${day}`, x, height - padding.bottom + 13);
      }
    });
    context.textAlign = "start";
  }

  function renderModuleBars() {
    const container = $("#module-bars");
    const label = $("#mock-latest-label");
    if (!container) return;
    const latest = getLatestMock();
    if (!latest || !Object.keys(latest.modules || {}).length) {
      container.innerHTML = '<div class="empty-state">录入带模块正确率的套卷后显示分析。</div>';
      if (label) label.textContent = latest ? `${formatDateCN(latest.date)} · 未录入模块数据` : "暂无记录";
      return;
    }
    const weak = new Set(getWeakModules().map((item) => item.name));
    if (label) label.textContent = `${formatDateCN(latest.date)} · ${latest.type}`;
    container.innerHTML = MODULES.map((moduleName) => {
      const raw = latest.modules?.[moduleName];
      const value = Number.isFinite(Number(raw)) ? Number(raw) : null;
      return `
        <div class="module-bar-row ${value !== null && weak.has(moduleName) ? "is-weak" : ""}">
          <span class="module-bar-label">${escapeHTML(moduleName)}</span>
          <div class="module-bar-track"><span style="width:${value === null ? 0 : clamp(value, 0, 100)}%"></span></div>
          <span class="module-bar-value">${value === null ? "--" : `${formatScore(value)}%`}</span>
        </div>`;
    }).join("");
  }

  function renderMockTable() {
    const body = $("#mock-table-body");
    const empty = $("#mock-table-empty");
    if (!body) return;
    const mocks = getSortedMocks(false);
    body.innerHTML = mocks.map((mock) => `
      <tr>
        <td>${formatDateCN(mock.date)}</td>
        <td>${escapeHTML(mock.type)}</td>
        <td><strong>${formatScore(mock.xingceScore)}</strong></td>
        <td>${mock.shenlunScore === null ? "--" : formatScore(mock.shenlunScore)}</td>
        <td>${mock.durationMinutes} 分钟</td>
        <td class="note-cell" title="${escapeHTML(mock.notes)}">${escapeHTML(mock.notes || "--")}</td>
        <td><button class="button button-small button-danger" type="button" data-delete-mock="${escapeHTML(mock.id)}">删除</button></td>
      </tr>`).join("");
    if (empty) empty.hidden = mocks.length > 0;
  }

  function renderErrors() {
    renderErrorList();
  }

  function renderErrorList() {
    const container = $("#error-list");
    const summary = $("#error-filter-summary");
    if (!container) return;
    const moduleFilter = $("#error-module-filter")?.value || "all";
    const causeFilter = $("#error-cause-filter")?.value || "all";
    let errors = [...state.errors];
    if (moduleFilter !== "all") errors = errors.filter((item) => item.module === moduleFilter);
    if (causeFilter !== "all") errors = errors.filter((item) => item.cause === causeFilter);
    errors.sort((a, b) => parseLocalDate(a.nextReviewDate) - parseLocalDate(b.nextReviewDate));
    if (summary) summary.textContent = `当前筛选共 ${errors.length} 条错题`;
    if (!errors.length) {
      const message = state.errors.length ? "没有符合当前筛选条件的错题。" : "还没有错题记录。";
      container.innerHTML = `<div class="empty-state">${message}</div>`;
      return;
    }
    const today = todayString();
    container.innerHTML = errors.map((item) => {
      const overdue = daysBetween(item.nextReviewDate, today) > 0;
      const dueToday = daysBetween(item.nextReviewDate, today) === 0;
      const dueText = overdue ? `已逾期 ${daysBetween(item.nextReviewDate, today)} 天` : dueToday ? "今天到期" : `下次 ${formatDateCN(item.nextReviewDate)}`;
      return `
        <article class="error-item ${overdue ? "is-overdue" : ""}">
          <div>
            <div class="error-topline">
              <span class="badge badge-primary">${escapeHTML(item.module)}</span>
              <span class="badge badge-blue">${escapeHTML(item.cause)}</span>
              <span class="badge ${overdue ? "badge-danger" : dueToday ? "badge-warning" : ""}">${dueText}</span>
              <span class="badge">已复习 ${item.reviewCount} 次</span>
            </div>
            <h4>${escapeHTML(item.summary)}</h4>
            <p>${item.knowledgePoint ? `知识点：${escapeHTML(item.knowledgePoint)} · ` : ""}记录于 ${formatDateCN(item.date)}${item.notes ? ` · ${escapeHTML(item.notes)}` : ""}</p>
          </div>
          <div class="error-actions">
            <button class="button button-small button-primary" type="button" data-review-error="${escapeHTML(item.id)}">已复习</button>
            <button class="button button-small button-ghost" type="button" data-delete-error="${escapeHTML(item.id)}">删除</button>
          </div>
        </article>`;
    }).join("");
  }

  function renderJobs() {
    const body = $("#job-table-body");
    const empty = $("#job-table-empty");
    if (!body) return;
    const jobs = [...state.jobs].sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return parseLocalDate(a.deadline) - parseLocalDate(b.deadline);
    });
    body.innerHTML = jobs.map((job) => {
      const statusClass = job.status === "优先" ? "badge-primary" : job.status === "放弃" ? "badge-danger" : job.status === "已报名" ? "badge-blue" : "badge-warning";
      return `
        <tr>
          <td>${escapeHTML(job.examType)}</td>
          <td><strong>${escapeHTML(job.title)}</strong></td>
          <td>${escapeHTML(job.region)}</td>
          <td>${escapeHTML(job.majorRequirement || "--")}</td>
          <td>${job.deadline ? formatDateCN(job.deadline) : "--"}</td>
          <td><span class="badge ${statusClass}">${escapeHTML(job.status)}</span></td>
          <td class="note-cell" title="${escapeHTML(job.notes)}">${escapeHTML(job.notes || "--")}</td>
          <td><button class="button button-small button-danger" type="button" data-delete-job="${escapeHTML(job.id)}">删除</button></td>
        </tr>`;
    }).join("");
    if (empty) empty.hidden = jobs.length > 0;
  }

  function renderSettingsForm() {
    const form = $("#settings-form");
    if (!form) return;
    const settings = state.settings;
    Object.entries(settings).forEach(([key, value]) => {
      const control = form.elements.namedItem(key);
      if (!control) return;
      if (control.type === "checkbox") control.checked = Boolean(value);
      else control.value = value ?? "";
    });
  }

  function getRouteById(id) {
    return ROUTES.find((route) => route.id === id) || null;
  }

  function getRouteByName(name) {
    return ROUTES.find((route) => route.name === name) || null;
  }

  function getRoutesForFocus(focus) {
    return ROUTES.filter((route) => focus.includes(route.name));
  }

  function renderMethods() {
    renderRouteSelector();
    renderRouteDetail();
    renderTargetBreakdown();
    renderDrillStats();
    renderDrillRecords();
  }

  function renderRouteSelector() {
    const container = $("#route-selector");
    if (!container) return;
    if (!ROUTES.length) {
      container.innerHTML = '<div class="empty-state">学习路线数据未加载。</div>';
      return;
    }
    if (!getRouteById(selectedRouteId)) selectedRouteId = ROUTES[0].id;
    const weakNames = new Set(getWeakModules().map((item) => item.name));
    container.innerHTML = ROUTES.map((route) => `
      <button class="route-button ${route.id === selectedRouteId ? "is-active" : ""}" type="button" data-route-id="${escapeHTML(route.id)}">
        <span class="route-icon">${escapeHTML(route.icon)}</span>
        <span>
          <strong>${escapeHTML(route.name)}</strong>
          <small>${weakNames.has(route.name) ? "当前优先 · " : ""}每天约 ${route.dailyQuestions} 题</small>
        </span>
      </button>`).join("");
  }

  function renderRouteDetail() {
    const container = $("#route-detail");
    if (!container) return;
    const route = getRouteById(selectedRouteId) || ROUTES[0];
    if (!route) {
      container.innerHTML = '<div class="empty-state">暂无学习路线。</div>';
      return;
    }
    const detail = window.CIVIL_EXAM_ROUTE_DETAILS?.[route.id] || {};
    const questionTypes = detail.questionTypes || [];
    const teacherLinks = (route.teachers || []).map((teacher) => {
      const url = `https://search.bilibili.com/all?keyword=${encodeURIComponent(teacher.query)}`;
      return `<a class="teacher-link" href="${url}" target="_blank" rel="noopener noreferrer"><strong>${escapeHTML(teacher.name)}</strong><span>搜索该老师的相关课程</span></a>`;
    }).join("");
    const questionTypeMarkup = questionTypes.map((type, index) => `
      <details class="question-type" ${index === 0 ? "open" : ""}>
        <summary>
          <span class="qt-index">${index + 1}</span>
          <span class="qt-summary">
            <strong>${escapeHTML(type.name)}</strong>
            <small>识别：${escapeHTML(type.recognition)}</small>
          </span>
        </summary>
        <div class="qt-body">
          <div class="qt-block">
            <h5>做题步骤</h5>
            <ol class="route-list">${type.steps.map((step) => `<li>${escapeHTML(step)}</li>`).join("")}</ol>
          </div>
          <div class="method-note-grid">
            <div class="method-note"><b>公式 / 判断规则</b><p>${escapeHTML(type.formula)}</p></div>
            <div class="method-note"><b>最常见陷阱</b><p>${escapeHTML(type.pitfall)}</p></div>
            <div class="method-note"><b>专项练法</b><p>${escapeHTML(type.drill)}</p></div>
          </div>
        </div>
      </details>`).join("");
    const today = todayString();
    const routeTasks = getTasksForDate(today).filter((task) => task.routeIds?.includes(route.id));
    const routeTaskMarkup = routeTasks.map((task) => {
      const complete = isTaskComplete(today, task.id);
      return `
        <label class="route-daily-task ${complete ? "is-complete" : ""}">
          <input class="route-task-checkbox" type="checkbox" data-task-id="${escapeHTML(task.id)}" data-task-minutes="${task.minutes}" ${complete ? "checked" : ""}>
          <span><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(task.detail)}</small></span>
          <em>${task.minutes} 分钟</em>
        </label>`;
    }).join("");
    const routeNote = state.routeNotes[route.id] || "";
    container.innerHTML = `
      <div class="route-hero">
        <div class="route-hero-icon">${escapeHTML(route.icon)}</div>
        <div>
          <h3>${escapeHTML(route.name)}</h3>
          <p>${escapeHTML(route.priority)}</p>
          <div class="route-badges">
            <span class="badge badge-primary">目标正确率 ${route.targetAccuracy}%</span>
            <span class="badge badge-blue">每天约 ${route.dailyQuestions} 题</span>
            <span class="badge">建议 ${route.dailyMinutes} 分钟</span>
          </div>
        </div>
      </div>
      <div class="route-actions">
        <button class="button button-primary" type="button" data-start-route-timer="${escapeHTML(route.id)}">开始本模块专注 ${route.dailyMinutes} 分钟</button>
        <button class="button button-ghost" type="button" data-print-target="route">打印本模块方法卡</button>
      </div>
      <section class="route-section full-width route-teacher-section">
        <h4>推荐老师与视频入口</h4>
        <div class="teacher-grid">${teacherLinks}</div>
        <p class="teacher-note">先从中选一位固定跟随，不要同时看多位老师。老师可能更换机构或课程版本，链接打开的是搜索入口，不代表平台背书或长期课程承诺。</p>
      </section>
      <section class="route-section full-width route-today-section">
        <h4>本模块今日任务</h4>
        <div class="route-daily-task-list">${routeTaskMarkup || '<div class="empty-state">今天这个模块没有单独安排任务，可查看完整执行计划。</div>'}</div>
      </section>
      <section class="route-section full-width route-note-section">
        <h4>我的方法卡</h4>
        <textarea id="route-note-input" class="route-note-input" rows="5" placeholder="记录自己容易错的步骤、公式、词语和提醒。">${escapeHTML(routeNote)}</textarea>
        <div class="route-note-actions">
          <button class="button button-primary button-small" type="button" data-save-route-note="${escapeHTML(route.id)}">保存方法卡</button>
          <button class="button button-ghost button-small" type="button" data-copy-route-note="${escapeHTML(route.id)}">复制方法卡</button>
        </div>
      </section>
      <div class="route-grid">
        <section class="route-section full-width method-principle-section">
          <h4>学习总原则</h4>
          <ol class="route-list">${route.methods.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ol>
        </section>
        <section class="route-section full-width question-type-section">
          <h4>不同题型的做题方法</h4>
          <div class="question-type-list">${questionTypeMarkup || '<div class="empty-state">暂无题型方法。</div>'}</div>
        </section>
        <section class="route-section">
          <h4>阶段节奏</h4>
          <div class="stage-list">${route.stages.map((stage) => `<div class="stage-item"><strong>${escapeHTML(stage.name)}</strong><span>${escapeHTML(stage.task)}</span></div>`).join("")}</div>
        </section>
        <section class="route-section">
          <h4>每周节奏</h4>
          <ul class="route-list">${route.weekly.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
        </section>
        <section class="route-section">
          <h4>错题怎么处理</h4>
          <ul class="route-list">${route.mistakes.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
        </section>
        <section class="route-section">
          <h4>江苏备考侧重</h4>
          <p class="notice-text">${escapeHTML(route.jiangsuFocus)}</p>
        </section>
      </div>`;
  }

  function renderTargetBreakdown() {
    const container = $("#target-breakdown");
    if (!container) return;
    const latest = getLatestMock();
    if (!latest) {
      container.innerHTML = '<div class="empty-state">先录入一次完整套卷，系统才能显示各模块与目标分的差距。</div>';
      return;
    }
    container.innerHTML = ROUTES.map((route) => {
      const raw = route.name === "申论" ? latest.shenlunScore : latest.modules?.[route.name];
      const current = raw === null || raw === undefined || raw === "" ? null : Number(raw);
      const gap = current === null ? null : Math.max(0, route.targetAccuracy - current);
      const met = current !== null && current >= route.targetAccuracy;
      const priority = current !== null && gap > 15;
      return `
        <article class="target-item ${met ? "is-met" : priority ? "is-priority" : ""}">
          <div class="target-item-top">
            <strong>${escapeHTML(route.name)}</strong>
            <span class="badge ${met ? "badge-primary" : priority ? "badge-warning" : "badge-blue"}">${met ? "已达标" : priority ? "优先补" : "继续练"}</span>
          </div>
          <span class="target-current">${current === null ? "--" : `${formatScore(current)}%`}</span>
          <span class="target-goal">目标 ${route.targetAccuracy}%</span>
          <div class="target-gap">${current === null ? "待诊断" : gap <= 0 ? "已达到目标" : `还需提高 ${formatScore(gap)} 分`}</div>
        </article>`;
    }).join("");
  }

  function renderDrillStats() {
    const container = $("#drill-stats");
    if (!container) return;
    const today = todayString();
    const weekStart = addDays(today, -parseLocalDate(today).getDay());
    const todayQuestions = state.drills.filter((item) => item.date === today).reduce((sum, item) => sum + item.total, 0);
    const weekQuestions = state.drills.filter((item) => daysBetween(weekStart, item.date) >= 0 && daysBetween(item.date, today) >= 0).reduce((sum, item) => sum + item.total, 0);
    const totalQuestions = state.drills.reduce((sum, item) => sum + item.total, 0);
    const totalCorrect = state.drills.reduce((sum, item) => sum + item.correct, 0);
    const accuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    container.innerHTML = `
      <div class="drill-stat"><strong>${todayQuestions}</strong><span>今日题量</span></div>
      <div class="drill-stat"><strong>${weekQuestions}</strong><span>本周题量</span></div>
      <div class="drill-stat"><strong>${totalQuestions ? `${accuracy}%` : "--"}</strong><span>累计正确率</span></div>`;
  }

  function renderDrillRecords() {
    const container = $("#recent-drills");
    if (!container) return;
    const drills = [...state.drills]
      .sort((a, b) => parseLocalDate(b.date) - parseLocalDate(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 5);
    if (!drills.length) {
      container.innerHTML = '<div class="empty-state">还没有专项训练记录。</div>';
      return;
    }
    container.innerHTML = drills.map((drill) => {
      const accuracy = Math.round((drill.correct / drill.total) * 100);
      return `
        <div class="drill-item">
          <div>
            <strong>${escapeHTML(drill.module)} · ${accuracy}%</strong>
            <p>${formatDateCN(drill.date)} · ${drill.correct}/${drill.total} 题 · ${drill.minutes} 分钟${drill.notes ? ` · ${escapeHTML(drill.notes)}` : ""}</p>
          </div>
          <button class="button button-small button-ghost" type="button" data-delete-drill="${escapeHTML(drill.id)}">删除</button>
        </div>`;
    }).join("");
  }

  function formatTimer(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safe / 60);
    const rest = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  function renderTimer() {
    const display = $("#focus-timer");
    const toggle = $("#timer-toggle");
    const count = $("#timer-session-count");
    const note = $("#timer-note");
    if (!display || !toggle) return;
    display.textContent = formatTimer(timerState.remainingSeconds);
    toggle.textContent = timerState.running ? "暂停" : timerState.remainingSeconds <= 0 ? "再来一轮" : "开始专注";
    $$("[data-timer-minutes]").forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.timerMinutes) === Math.round(timerState.totalSeconds / 60));
    });
    if (count) {
      const todayCount = state.focusSessions.filter((item) => item.date === todayString()).length;
      count.textContent = `今日 ${todayCount} 次`;
    }
    if (note && !timerState.running && timerState.remainingSeconds > 0) {
      note.textContent = "开始后建议不看手机，结束后再记录训练结果。";
    }
    if (note && timerState.running) {
      note.textContent = `正在专注：${timerState.routeName || "自由学习"}`;
    }
  }

  function setTimerMinutes(minutes) {
    pauseTimer();
    timerState.totalSeconds = Math.max(5, Number(minutes) || 25) * 60;
    timerState.remainingSeconds = timerState.totalSeconds;
    timerState.routeId = "";
    timerState.routeName = "";
    renderTimer();
  }

  function startRouteTimer(routeId) {
    const route = getRouteById(routeId);
    if (!route) return;
    pauseTimer();
    timerState.totalSeconds = Math.max(5, route.dailyMinutes) * 60;
    timerState.remainingSeconds = timerState.totalSeconds;
    timerState.routeId = route.id;
    timerState.routeName = route.name;
    timerState.running = true;
    timerState.intervalId = window.setInterval(tickTimer, 1000);
    activateTab("plan");
    renderTimer();
    $(".timer-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast(`已开始 ${route.name} 专注 ${route.dailyMinutes} 分钟。`);
  }

  function toggleTimer() {
    if (timerState.running) {
      pauseTimer();
      return;
    }
    if (timerState.remainingSeconds <= 0) {
      timerState.remainingSeconds = timerState.totalSeconds;
    }
    timerState.running = true;
    timerState.intervalId = window.setInterval(tickTimer, 1000);
    renderTimer();
  }

  function pauseTimer() {
    if (timerState.intervalId) window.clearInterval(timerState.intervalId);
    timerState.intervalId = null;
    timerState.running = false;
    renderTimer();
  }

  function resetTimer() {
    pauseTimer();
    timerState.remainingSeconds = timerState.totalSeconds;
    renderTimer();
  }

  function tickTimer() {
    if (!timerState.running) return;
    timerState.remainingSeconds -= 1;
    if (timerState.remainingSeconds <= 0) {
      timerState.remainingSeconds = 0;
      if (timerState.intervalId) window.clearInterval(timerState.intervalId);
      timerState.intervalId = null;
      timerState.running = false;
      const minutes = Math.round(timerState.totalSeconds / 60);
      state.focusSessions.push({
        id: uid(),
        date: todayString(),
        minutes,
        routeId: timerState.routeId,
        module: timerState.routeName,
        completedAt: new Date().toISOString()
      });
      saveState();
      const note = $("#timer-note");
      if (note) note.textContent = `完成 ${minutes} 分钟专注，休息一下再继续。`;
      renderTimer();
      showToast(`完成 ${minutes} 分钟专注训练。`);
      timerState.routeId = "";
      timerState.routeName = "";
      return;
    }
    renderTimer();
  }

  function bindNavigation() {
    $$('[data-tab-target]').forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.tabTarget));
    });
    $$('[data-tab-jump]').forEach((button) => {
      button.addEventListener("click", () => {
        activateTab(button.dataset.tabJump);
        $("#tab-" + button.dataset.tabJump)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function activateTab(tabName) {
    if (!tabName) return;
    $$("[data-tab-panel]").forEach((panel) => {
      const active = panel.dataset.tabPanel === tabName;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    $$("[data-tab-target]").forEach((button) => {
      const active = button.dataset.tabTarget === tabName;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    if (tabName === "mocks") window.requestAnimationFrame(renderMockChart);
  }

  function bindGlobalActions() {
    $$('[data-action="export-data"]').forEach((button) => button.addEventListener("click", exportData));
    $$('[data-action="reset-data"]').forEach((button) => button.addEventListener("click", resetData));
    ["#header-import-file", "#settings-import-file"].forEach((selector) => {
      const input = $(selector);
      if (input) input.addEventListener("change", handleImportFile);
    });
  }

  function bindTimer() {
    $$('[data-timer-minutes]').forEach((button) => {
      button.addEventListener("click", () => setTimerMinutes(Number(button.dataset.timerMinutes)));
    });
    $("#timer-toggle")?.addEventListener("click", toggleTimer);
    $("#timer-reset")?.addEventListener("click", resetTimer);
  }

  function bindForms() {
    $("#mock-form")?.addEventListener("submit", handleMockSubmit);
    $("#drill-form")?.addEventListener("submit", handleDrillSubmit);
    $("#error-form")?.addEventListener("submit", handleErrorSubmit);
    $("#job-form")?.addEventListener("submit", handleJobSubmit);
    $("#settings-form")?.addEventListener("submit", handleSettingsSubmit);
    $("#custom-task-form")?.addEventListener("submit", handleCustomTaskSubmit);
    $("#plan-date")?.addEventListener("change", (event) => {
      selectedPlanDate = event.target.value || todayString();
      renderPlan();
    });
    $("#plan-today-button")?.addEventListener("click", () => {
      selectedPlanDate = todayString();
      renderPlan();
    });
    $("#error-module-filter")?.addEventListener("change", renderErrorList);
    $("#error-cause-filter")?.addEventListener("change", renderErrorList);
  }

  function bindDelegatedEvents() {
    document.addEventListener("change", (event) => {
      const routeCheckbox = event.target.closest(".route-task-checkbox");
      if (routeCheckbox) {
        handleRouteTaskToggle(routeCheckbox);
        return;
      }
      const checkbox = event.target.closest(".task-checkbox");
      if (checkbox) handleTaskToggle(checkbox);
    });
    document.addEventListener("click", (event) => {
      const timerButton = event.target.closest("[data-start-route-timer]");
      if (timerButton) return startRouteTimer(timerButton.dataset.startRouteTimer);
      const printButton = event.target.closest("[data-print-target]");
      if (printButton) return printTarget(printButton.dataset.printTarget);
      const saveNoteButton = event.target.closest("[data-save-route-note]");
      if (saveNoteButton) return saveRouteNote(saveNoteButton.dataset.saveRouteNote);
      const copyNoteButton = event.target.closest("[data-copy-route-note]");
      if (copyNoteButton) return copyRouteNote(copyNoteButton.dataset.copyRouteNote);
      const methodButton = event.target.closest("[data-open-route]");
      if (methodButton) {
        event.preventDefault();
        event.stopPropagation();
        selectedRouteId = methodButton.dataset.openRoute;
        activateTab("methods");
        renderMethods();
        $("#tab-methods")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const routeButton = event.target.closest("[data-route-id]");
      if (routeButton) {
        selectedRouteId = routeButton.dataset.routeId;
        renderMethods();
        return;
      }
      const mockButton = event.target.closest("[data-delete-mock]");
      if (mockButton) return deleteMock(mockButton.dataset.deleteMock);
      const reviewButton = event.target.closest("[data-review-error]");
      if (reviewButton) return reviewError(reviewButton.dataset.reviewError);
      const errorButton = event.target.closest("[data-delete-error]");
      if (errorButton) return deleteError(errorButton.dataset.deleteError);
      const jobButton = event.target.closest("[data-delete-job]");
      if (jobButton) return deleteJob(jobButton.dataset.deleteJob);
      const drillButton = event.target.closest("[data-delete-drill]");
      if (drillButton) return deleteDrill(drillButton.dataset.deleteDrill);
    });
  }

  function setDefaultFormDates() {
    const today = todayString();
    const mockForm = $("#mock-form");
    const drillForm = $("#drill-form");
    const errorForm = $("#error-form");
    if (mockForm?.elements.date) mockForm.elements.date.value = today;
    if (drillForm?.elements.date) drillForm.elements.date.value = today;
    if (errorForm?.elements.date) errorForm.elements.date.value = today;
  }

  function handleTaskToggle(checkbox) {
    const taskId = checkbox.dataset.taskId;
    const minutes = Math.max(0, Number(checkbox.dataset.taskMinutes) || 0);
    const key = getTaskKey(selectedPlanDate, taskId);
    if (checkbox.checked) state.completedTasks[key] = minutes;
    else delete state.completedTasks[key];
    if (!saveState()) return;
    checkbox.closest(".task-item")?.classList.toggle("is-complete", checkbox.checked);
    renderOverview();
    const tasks = getTasksForDate(selectedPlanDate);
    const completed = tasks.filter((task) => isTaskComplete(selectedPlanDate, task.id));
    const progress = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;
    const completedMinutes = completed.reduce((sum, task) => sum + task.minutes, 0);
    const progressLabel = $("#daily-plan-progress");
    const progressBar = $("#daily-plan-progress-bar");
    const hint = $("#daily-plan-list .form-hint");
    if (progressLabel) progressLabel.textContent = `${progress}%`;
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (hint) hint.textContent = `已完成 ${completedMinutes} 分钟。任务状态按日期保存在本机。`;
  }

  function handleRouteTaskToggle(checkbox) {
    const taskId = checkbox.dataset.taskId;
    const minutes = Math.max(0, Number(checkbox.dataset.taskMinutes) || 0);
    const date = todayString();
    const key = getTaskKey(date, taskId);
    if (checkbox.checked) state.completedTasks[key] = minutes;
    else delete state.completedTasks[key];
    if (!saveState()) return;
    checkbox.closest(".route-daily-task")?.classList.toggle("is-complete", checkbox.checked);
    renderOverview();
    renderPlan();
  }

  function saveRouteNote(routeId) {
    const textarea = $("#route-note-input");
    if (!textarea) return;
    const value = textarea.value.trim();
    if (value) state.routeNotes[routeId] = value;
    else delete state.routeNotes[routeId];
    commit("本模块方法卡已保存。");
  }

  async function copyRouteNote(routeId) {
    const route = getRouteById(routeId);
    if (!route) return;
    const detail = window.CIVIL_EXAM_ROUTE_DETAILS?.[routeId] || {};
    const savedNote = state.routeNotes[routeId] || "";
    const lines = [
      `# ${route.name}`,
      `目标：正确率 ${route.targetAccuracy}%`,
      `建议：每天约 ${route.dailyQuestions} 题，${route.dailyMinutes} 分钟`,
      "",
      "## 学习总原则",
      ...route.methods.map((item, index) => `${index + 1}. ${item}`),
      "",
      "## 我的方法卡",
      savedNote || "暂未填写",
      "",
      "## 题型方法"
    ];
    (detail.questionTypes || []).forEach((type) => {
      lines.push(`\n### ${type.name}`);
      lines.push(`识别：${type.recognition}`);
      type.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
      lines.push(`规则：${type.formula}`);
      lines.push(`陷阱：${type.pitfall}`);
      lines.push(`练法：${type.drill}`);
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      showToast("本模块方法卡已复制。");
    } catch (error) {
      console.error("复制失败", error);
      showToast("复制失败，请使用打印或手动选择文本。", "error");
    }
  }

  function printTarget(target) {
    const routeDetails = target === "route" ? $$("#route-detail details") : [];
    const previousOpenStates = routeDetails.map((item) => item.open);
    routeDetails.forEach((item) => { item.open = true; });
    document.body.dataset.printTarget = target;
    const cleanup = () => {
      delete document.body.dataset.printTarget;
      routeDetails.forEach((item, index) => { item.open = previousOpenStates[index]; });
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
  }

  function handleMockSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const modules = {};
    $$('[data-module]', form).forEach((input) => {
      if (input.value.trim() === "") return;
      const value = Number(input.value);
      if (Number.isFinite(value)) modules[input.dataset.module] = clamp(value, 0, 100);
    });
    state.mocks.push({
      id: uid(),
      date: String(formData.get("date")),
      type: String(formData.get("type") || "其他"),
      xingceScore: clamp(Number(formData.get("xingceScore")) || 0, 0, 100),
      shenlunScore: formData.get("shenlunScore") === "" ? null : clamp(Number(formData.get("shenlunScore")) || 0, 0, 100),
      durationMinutes: Math.max(1, Number(formData.get("durationMinutes")) || 120),
      modules,
      notes: String(formData.get("notes") || ""),
      createdAt: new Date().toISOString()
    });
    form.reset();
    if (form.elements.date) form.elements.date.value = todayString();
    if (form.elements.durationMinutes) form.elements.durationMinutes.value = "120";
    commit("套卷记录已保存，弱项分析已更新。");
  }

  function handleErrorSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const date = String(formData.get("date") || todayString());
    const nextReviewDate = String(formData.get("nextReviewDate") || addDays(date, 2));
    state.errors.push({
      id: uid(),
      date,
      module: String(formData.get("module") || "判断推理"),
      cause: String(formData.get("cause") || "方法不熟"),
      summary: String(formData.get("summary") || "").trim(),
      knowledgePoint: String(formData.get("knowledgePoint") || "").trim(),
      nextReviewDate,
      reviewCount: 0,
      lastReviewed: null,
      notes: String(formData.get("notes") || "").trim()
    });
    form.reset();
    if (form.elements.date) form.elements.date.value = todayString();
    commit("错题已加入复习队列。");
  }

  function handleDrillSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const total = Math.max(1, Number(formData.get("total")) || 1);
    const correct = clamp(Number(formData.get("correct")) || 0, 0, total);
    const moduleName = String(formData.get("module") || "言语理解");
    state.drills.push({
      id: uid(),
      date: String(formData.get("date") || todayString()),
      module: moduleName,
      total,
      correct,
      minutes: Math.max(1, Number(formData.get("minutes")) || 1),
      notes: String(formData.get("notes") || "").trim(),
      createdAt: new Date().toISOString()
    });
    selectedRouteId = getRouteByName(moduleName)?.id || selectedRouteId;
    form.reset();
    if (form.elements.date) form.elements.date.value = todayString();
    commit("专项训练已记录，题量和正确率已更新。");
  }

  function handleJobSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    state.jobs.push({
      id: uid(),
      examType: String(formData.get("examType") || "国考"),
      title: String(formData.get("title") || "").trim(),
      region: String(formData.get("region") || "").trim(),
      majorRequirement: String(formData.get("majorRequirement") || "").trim(),
      deadline: String(formData.get("deadline") || ""),
      status: String(formData.get("status") || "待核验"),
      notes: String(formData.get("notes") || "").trim(),
      createdAt: new Date().toISOString()
    });
    form.reset();
    commit("候选岗位已保存。");
  }

  function handleCustomTaskSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const date = String(formData.get("date") || selectedPlanDate);
    const title = String(formData.get("title") || "").trim();
    if (!title) return;
    state.customTasks.push({
      id: uid(),
      date,
      title,
      minutes: clamp(Number(formData.get("minutes")) || 60, 5, 600),
      detail: String(formData.get("detail") || "").trim()
    });
    selectedPlanDate = date;
    form.reset();
    if (form.elements.date) form.elements.date.value = selectedPlanDate;
    if (form.elements.minutes) form.elements.minutes.value = "60";
    commit("自定义任务已加入当天计划。");
  }

  function handleSettingsSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const baselineScore = clamp(Number(formData.get("baselineScore")) || 0, 0, 100);
    const targetScore = clamp(Number(formData.get("targetScore")) || 0, 0, 100);
    if (targetScore < baselineScore) {
      showToast("目标分数不能低于当前基线分数。", "error");
      return;
    }
    const nextSettings = {
      region: String(formData.get("region") || "").trim(),
      degree: String(formData.get("degree") || "").trim(),
      major: String(formData.get("major") || "").trim(),
      nationalExamDate: String(formData.get("nationalExamDate")),
      jiangsuExamDate: String(formData.get("jiangsuExamDate")),
      nationalRegistrationStart: String(formData.get("nationalRegistrationStart") || ""),
      nationalRegistrationEnd: String(formData.get("nationalRegistrationEnd") || ""),
      jiangsuRegistrationStart: String(formData.get("jiangsuRegistrationStart") || ""),
      jiangsuRegistrationEnd: String(formData.get("jiangsuRegistrationEnd") || ""),
      datesAreEstimated: form.elements.datesAreEstimated.checked,
      baselineScore,
      targetScore,
      dailyHours: clamp(Number(formData.get("dailyHours")) || 6, 1, 16),
      studyDaysPerWeek: clamp(Math.round(Number(formData.get("studyDaysPerWeek")) || 7), 1, 7),
      startDate: String(formData.get("startDate") || todayString())
    };
    if (daysBetween(nextSettings.startDate, nextSettings.nationalExamDate) < 0) {
      showToast("国考日期不能早于计划开始日期。", "error");
      return;
    }
    if (daysBetween(nextSettings.nationalExamDate, nextSettings.jiangsuExamDate) < 0) {
      showToast("江苏省考日期不能早于国考日期。", "error");
      return;
    }
    if (nextSettings.nationalRegistrationStart && nextSettings.nationalRegistrationEnd && daysBetween(nextSettings.nationalRegistrationStart, nextSettings.nationalRegistrationEnd) < 0) {
      showToast("国考报名截止日期不能早于报名开始日期。", "error");
      return;
    }
    if (nextSettings.nationalRegistrationStart && daysBetween(nextSettings.nationalRegistrationStart, nextSettings.nationalExamDate) < 0) {
      showToast("国考报名开始日期不能晚于国考笔试日期。", "error");
      return;
    }
    if (nextSettings.jiangsuRegistrationStart && daysBetween(nextSettings.jiangsuRegistrationStart, nextSettings.jiangsuExamDate) < 0) {
      showToast("江苏省考报名开始日期不能晚于江苏省考笔试日期。", "error");
      return;
    }
    if (nextSettings.jiangsuRegistrationStart && nextSettings.jiangsuRegistrationEnd && daysBetween(nextSettings.jiangsuRegistrationStart, nextSettings.jiangsuRegistrationEnd) < 0) {
      showToast("江苏省考报名截止日期不能早于报名开始日期。", "error");
      return;
    }
    state.settings = { ...state.settings, ...nextSettings };
    commit("设置已保存，倒计时和计划已重新计算。");
  }

  function deleteMock(id) {
    const mock = state.mocks.find((item) => item.id === id);
    if (!mock || !window.confirm(`确认删除 ${formatDateCN(mock.date)} 的套卷记录吗？`)) return;
    state.mocks = state.mocks.filter((item) => item.id !== id);
    commit("套卷记录已删除。", "warning");
  }

  function reviewError(id) {
    const item = state.errors.find((error) => error.id === id);
    if (!item) return;
    item.reviewCount = (Number(item.reviewCount) || 0) + 1;
    item.lastReviewed = todayString();
    const intervalIndex = Math.min(item.reviewCount, REVIEW_INTERVALS.length - 1);
    item.nextReviewDate = addDays(todayString(), REVIEW_INTERVALS[intervalIndex]);
    commit(`已记录复习，下次安排到 ${formatDateCN(item.nextReviewDate)}。`);
  }

  function deleteError(id) {
    const item = state.errors.find((error) => error.id === id);
    if (!item || !window.confirm(`确认删除错题“${item.summary}”吗？`)) return;
    state.errors = state.errors.filter((error) => error.id !== id);
    commit("错题记录已删除。", "warning");
  }

  function deleteJob(id) {
    const item = state.jobs.find((job) => job.id === id);
    if (!item || !window.confirm(`确认删除候选岗位“${item.title}”吗？`)) return;
    state.jobs = state.jobs.filter((job) => job.id !== id);
    commit("候选岗位已删除。", "warning");
  }

  function deleteDrill(id) {
    const item = state.drills.find((drill) => drill.id === id);
    if (!item || !window.confirm(`确认删除这条${item.module}专项训练记录吗？`)) return;
    state.drills = state.drills.filter((drill) => drill.id !== id);
    commit("专项训练记录已删除。", "warning");
  }

  function exportData() {
    const payload = JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `双考备考驾驶舱-备份-${todayString()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("数据已导出为 JSON 备份。");
  }

  async function handleImportFile(event) {
    const input = event.currentTarget;
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || !parsed.settings || !Array.isArray(parsed.mocks)) {
        throw new Error("文件结构不符合本工具的数据格式。");
      }
      if (!window.confirm("导入会覆盖当前本机数据，是否继续？")) return;
      state = normalizeState(parsed);
      selectedPlanDate = todayString();
      commit("数据导入成功。");
    } catch (error) {
      console.error("导入失败", error);
      showToast(`导入失败：${error.message}`, "error");
    }
  }

  function resetData() {
    if (!window.confirm("确认清空全部学习记录吗？此操作不可撤销。")) return;
    if (!window.confirm("再次确认：套卷、错题、岗位和任务记录都会删除。")) return;
    pauseTimer();
    timerState.remainingSeconds = timerState.totalSeconds;
    localStorage.removeItem(STORAGE_KEY);
    state = normalizeState(DEFAULT_STATE);
    selectedPlanDate = todayString();
    commit("全部数据已清空。", "warning");
  }

  async function init() {
    bindNavigation();
    bindGlobalActions();
    bindTimer();
    bindForms();
    bindDelegatedEvents();
    setDefaultFormDates();
    await hydrateStateFromServer();
    renderAll();
    renderMobileAccess();
    window.addEventListener("resize", () => {
      window.clearTimeout(chartResizeTimer);
      chartResizeTimer = window.setTimeout(renderMockChart, 120);
    });
  }

  init();
})();
