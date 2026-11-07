/* LiangYou Web OS Lab — static browser-only v86 host. No VM backend. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const BASE = "https://raw.githubusercontent.com/copy/images/master/";
  const UPSTREAM = "https://cdn.jsdelivr.net/npm/v86@0.5.473/";
  const UNPKG = "https://unpkg.com/v86@0.5.473/";
  const ASSETS = Object.freeze({
    seabios:[
      "https://cdn.jsdelivr.net/gh/copy/v86@master/bios/seabios.bin",
      "https://raw.githubusercontent.com/copy/v86/master/bios/seabios.bin"
    ],
    vgabios:[
      "https://cdn.jsdelivr.net/gh/copy/v86@master/bios/vgabios.bin",
      "https://raw.githubusercontent.com/copy/v86/master/bios/vgabios.bin"
    ],
    image: name => [
      "https://cdn.jsdelivr.net/gh/copy/images@master/" + name,
      "https://raw.githubusercontent.com/copy/images/master/" + name
    ],
    wasm:[
      UPSTREAM + "build/v86.wasm",
      UNPKG + "build/v86.wasm"
    ]
  });
  const SYSTEMS = Object.freeze({
    freedos: {name:"FreeDOS", type:"fda", file:"freedos722.img", memory:32, vga:4},
    kolibri: {name:"KolibriOS", type:"fda", file:"kolibri.img", memory:64, vga:8},
    linux: {name:"Buildroot Linux", type:"cdrom", file:"linux.iso", memory:128, vga:8}
  });

  const GUIDES = Object.freeze({
    freedos: {
      title:"FreeDOS · 进入系统后怎么操作",
      intro:"这是命令行系统。看到 A:\\>（也可能是其他盘符提示符），就表示已进入系统。不需要登录。",
      steps:[
        "先等待黑色窗口出现 A:\\> 提示符。开头出现「Boot failed: CDROM」并不一定是故障，之后从 Floppy 启动成功即可。",
        "点击下面的「列出文件 · dir」即可自动输入并回车，查看当前目录。",
        "如果想自己输入，先在输入框写命令，点击「仅发送文字」，再点击 Enter 执行。也可以试试 snake 小游戏。"
      ],
      note:"DOS 命令无需输入中文。执行命令前请确认屏幕已经出现 A:\\>。",
      commands:[
        {name:"列出文件",value:"dir",hint:"查看当前目录"},
        {name:"查看帮助",value:"help",hint:"显示可用命令"},
        {name:"清屏",value:"cls",hint:"清空屏幕"},
        {name:"试玩贪吃蛇",value:"snake",hint:"镜像内置小游戏"}
      ]
    },
    kolibri: {
      title:"KolibriOS · 进入图形桌面",
      intro:"这是图形桌面系统，不需要输入 DOS / Linux 命令，也没有登录密码。",
      steps:[
        "刚开始会看到硬件和 CPU 初始化信息，这是开机过程，不是操作界面。",
        "等待画面切换到图形桌面后再操作；单纯切换为图形模式也不保证已完全进入桌面。",
        "先尝试点桌面菜单或图标；如出现选择菜单，可使用方向键、Tab、Enter 确认，Esc 退出。手机触摸与模拟鼠标不一定完全兼容。"
      ],
      note:"KolibriOS 主要用鼠标操作。下面提供方向键、Tab、Esc 和 Enter；输入框不适合操作图形桌面。",
      commands:[]
    },
    linux: {
      title:"Buildroot Linux · 进入 Shell",
      intro:"这是命令行 Linux，不会显示常见的电脑桌面。看到 /root% 等提示符就可以输入命令。",
      steps:[
        "先等待内核启动日志走完。「VFS: Mounted root」表示根文件系统已挂载，但还未必能输入。",
        "出现 /root% 或其他 Shell 提示符后，点击下方「列出文件 · ls」一键执行。",
        "也可以在输入框输入 pwd、uname -a 等命令，然后「仅发送文字」和「Enter」依次操作。"
      ],
      note:"Linux 的命令对大小写敏感；/root% 是提示符，不用自己输入。",
      commands:[
        {name:"列出文件",value:"ls",hint:"查看文件与目录"},
        {name:"当前位置",value:"pwd",hint:"显示工作目录"},
        {name:"查看系统信息",value:"uname -a",hint:"显示内核信息"},
        {name:"打印文字",value:"echo hello",hint:"确认终端可输入"}
      ]
    }
  });
  // Set 1 keyboard scan codes with key-down and key-up for each virtual key.
  const KEY_CODES = Object.freeze({
    esc:[0x01,0x81],
    tab:[0x0f,0x8f],
    enter:[0x1c,0x9c],
    backspace:[0x0e,0x8e],
    up:[0xe0,0x48,0xe0,0xc8],
    down:[0xe0,0x50,0xe0,0xd0],
    left:[0xe0,0x4b,0xe0,0xcb],
    right:[0xe0,0x4d,0xe0,0xcd],
    ctrlc:[0x1d,0x2e,0xae,0x9d]
  });

  let emulator = null;
  let current = null;
  let generation = 0;
  let scriptPromise = null;
  let ready = false;
  let isRunning = false;
  let guestReady = false;
  let commandBusy = false;
  let gamePlaying = false;
  let bootMonitor = null;
  const pendingDownloads = new Set();
  let loadingTimer = null;
  const controls = ["pause","resume","restart","fullscreen","exit","typeText","sendText","sendEnter"];
  const status = (message, live = false) => {
    $("machineStatus").textContent = message;
    $("led").classList.toggle("live", live);
  };

  const showLoading = (title,detail = "") => {
    $("loadingCover").hidden = false;
    $("loadingTitle").textContent = title;
    $("loadingDetail").textContent = detail;
    $("loadingCover").classList.remove("load-failed");
    status(title);
    simpleStatus(detail || title);
  };
  const hideLoading = () => {
    $("loadingCover").hidden = true;
    $("loadingCover").classList.remove("load-failed");
  };
  function cancelDownloads() {
    for(const controller of pendingDownloads) controller.abort();
    pendingDownloads.clear();
    if(loadingTimer) {clearTimeout(loadingTimer);loadingTimer=null;}
  }
  async function fetchAsset(label,urls,minSize,token) {
    const failures = [];
    for(let i=0;i<urls.length;i++) {
      if(token !== generation) throw new Error("已取消旧的加载任务");
      const controller = new AbortController();
      pendingDownloads.add(controller);
      const timer = setTimeout(()=>controller.abort(),23000);
      try {
        showLoading("正在获取" + label, i ? "第一个下载地址连接失败，已自动切换备用地址…" : "下载由访客设备完成，不会运行云服务器。");
        const response = await fetch(urls[i], {mode:"cors",cache:"default",signal:controller.signal});
        if(!response.ok) throw new Error("HTTP " + response.status);
        const data = await response.arrayBuffer();
        if(data.byteLength < minSize) throw new Error("文件内容不完整");
        if(token !== generation) throw new Error("已取消旧的加载任务");
        return {buffer:data,url:urls[i]};
      } catch(error) {
        if(token !== generation) throw error;
        failures.push((i===0?"主地址":"备用地址")+": "+(error?.message||String(error)));
      } finally {
        clearTimeout(timer);
        pendingDownloads.delete(controller);
      }
    }
    throw new Error(label+"下载失败（"+failures.join("；")+"）。请检查网络，或稍后重新尝试。");
  }
  async function prepareAssets(config,token) {
    let completed = 0;
    async function one(label,urls,min) {
      const value = await fetchAsset(label,urls,min,token);
      completed += 1;
      if(token === generation) showLoading("资源准备中 " + completed + "/4","已取得"+label+"，正在准备剩余文件…");
      return value;
    }
    const [bios,vga,image,wasm] = await Promise.all([
      one("系统 BIOS",ASSETS.seabios,50000),
      one("显示 BIOS",ASSETS.vgabios,10000),
      one(config.name+"镜像",ASSETS.image(config.file),100000),
      one("运行核心 WASM",ASSETS.wasm,1000000)
    ]);
    return {bios:{buffer:bios.buffer},vga_bios:{buffer:vga.buffer},disk:{buffer:image.buffer},wasm_path:wasm.url};
  }

  const simpleStatus = text => { $("playStatus").textContent = text; };
  function updateSimpleUI() {
    const canUse = ready && isRunning;
    const btn = $("primaryAction");
    const isReady = canUse && guestReady;
    $("screenMode").disabled = !current;
    $("padEnter").disabled = !canUse;
    $("padEsc").disabled = !canUse;
    $("dpad").querySelectorAll("[data-padkey]").forEach(key => { key.disabled = !canUse; });
    btn.disabled = !isReady || commandBusy;
    if(!current) {
      $("simpleStep").textContent = "先在上面选择一个系统，点击「启动」。";
      $("simpleActionHelp").textContent = "之后会自动告诉你下一步做什么。";
      btn.textContent = "▶ 启动系统后可操作";
    } else if(!guestReady) {
      $("simpleStep").textContent = current === "freedos" ? "等黑色画面出现 A:\\>，就能玩游戏。" : current === "linux" ? "等黑色画面出现 /root%，再点下方大按钮。" : "正在开机，等待桌面出现。";
      $("simpleActionHelp").textContent = "先不用输入任何文字；开机结束后按钮会自动亮起。";
      btn.textContent = "⌛ 正在等待系统启动";
    } else if(current === "freedos") {
      $("simpleStep").textContent = gamePlaying ? "贪吃蛇已发送启动指令，试试右侧方向键！" : "已开机！点「开始贪吃蛇」，然后按右侧方向键。";
      $("simpleActionHelp").textContent = gamePlaying ? "点方向键控制移动；Esc 可以退出游戏。" : "不需要打字，也不用先寻找下面的方向键。";
      btn.textContent = gamePlaying ? "↻ 重新开始游戏" : "🎮 开始贪吃蛇";
    } else if(current === "linux") {
      $("simpleStep").textContent = "已进入 Linux。点下面的大按钮即可查看文件。";
      $("simpleActionHelp").textContent = "无需输入 /root%，只需点击即可自动执行。";
      btn.textContent = "📁 看看有哪些文件";
    } else {
      $("simpleStep").textContent = "已切换到桌面显示；尝试点屏幕上的图标。";
      $("simpleActionHelp").textContent = "可按方向键移动选择，用「确认」进入，用「返回」退出。";
      btn.textContent = "↵ 确认选择";
    }
    const immersive = document.body.classList.contains("lab-immersive");
    $("fullscreen").textContent = immersive ? "↙ 退出放大" : "⛶ 放大操作";
    $("screenMode").textContent = immersive ? "↙ 返回页面" : "⛶ 放大操作";
    for(const control of [$("fullscreen"), $("screenMode")]) control.setAttribute("aria-pressed",String(immersive));
  }
  function setImmersive(enabled) {
    document.body.classList.toggle("lab-immersive",enabled);
    updateSimpleUI();
    if(enabled) {
      simpleStatus("已放大为整页操作区；iPhone Safari 可能仍显示浏览器地址栏，可横屏获得更多空间。");
    } else {
      simpleStatus("已返回普通页面，游戏方向键仍在屏幕下方。");
    }
  }
  async function toggleImmersive() {
    const enabled = document.body.classList.contains("lab-immersive");
    if(enabled) {
      setImmersive(false);
      if(document.fullscreenElement && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch {}
      }
    } else {
      setImmersive(true);
      // iPhone Safari does not support fullscreen for arbitrary page elements.
      // Fixed viewport mode is usable without the Fullscreen API.
      if(document.fullscreenEnabled && $("machine").requestFullscreen) {
        try { await $("machine").requestFullscreen({navigationUI:"hide"}); } catch {}
      }
    }
  }
  const updateGuideButtons = () => {
    const enabled = ready && isRunning;
    const allowCommands = enabled && guestReady && !commandBusy;
    $("quickCommands").querySelectorAll("[data-command]").forEach(button => {
      button.disabled = !allowCommands;
    });
    $("virtualKeys").querySelectorAll("[data-vkey]").forEach(button => {
      button.disabled = !enabled || (button.dataset.vkey === "ctrlc" && current === "kolibri");
    });
    updateSimpleUI();
    $("guestIndicator").textContent = !current ? "尚未选择"
      : !guestReady ? "等待系统就绪"
      : current === "freedos" ? "DOS 已进入"
      : current === "linux" ? "Shell 已进入"
      : "已切换图形模式";
  };
  const renderGuide = id => {
    const guide = GUIDES[id];
    $("guideTitle").textContent = guide ? guide.title : "选择系统后显示操作提示";
    $("guideIntro").textContent = guide ? guide.intro : "FreeDOS 和 Linux 用命令操作；KolibriOS 则使用桌面和鼠标。下面会根据你启动的系统自动切换提示。";
    const steps = guide ? guide.steps : ["从上方选择一个系统并点击「启动」。","等待系统进入命令提示符或桌面。","通过下方快捷命令和虚拟按键操作。"];
    $("guideSteps").replaceChildren(...steps.map(step => {
      const item = document.createElement("li");
      item.textContent = step;
      return item;
    }));
    $("quickTitle").textContent = id === "kolibri" ? "图形桌面操作" : "一键执行常用命令";
    $("quickNote").textContent = guide ? guide.note : "启动系统后自动显示对应快捷命令";
    const commands = $("quickCommands");
    commands.replaceChildren();
    if(guide?.commands.length) {
      for(const cmd of guide.commands) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "quick-command";
        button.dataset.command = cmd.value;
        const name = document.createElement("strong");
        name.textContent = cmd.name;
        const code = document.createElement("code");
        code.textContent = cmd.value;
        const hint = document.createElement("small");
        hint.textContent = cmd.hint;
        button.append(name,code,hint);
        commands.append(button);
      }
    } else {
      const hint = document.createElement("p");
      hint.className = "quick-empty";
      hint.textContent = guide ? "不用输入命令。等待桌面出现后，可以直接触摸图标，或使用下方的虚拟方向键、Tab、Enter、Esc。" : "尚未选择系统";
      commands.append(hint);
    }
    $("quickFeedback").textContent = guide ? "已切换到 " + SYSTEMS[id].name + " 的操作提示；请等待系统真正进入操作界面。" : "先启动一个系统，虚拟按键才会启用。";
    $("typeText").placeholder = id === "kolibri" ? "图形系统主要用鼠标与虚拟按键操作" : id === "linux" ? "例如：ls（不用输入 /root%）" : id === "freedos" ? "例如：dir（不用输入 A:\\>）" : "输入命令或文本（不适合输入密码）";
    updateGuideButtons();
  };
  const buttons = () => {
    $("pause").disabled = !ready || !isRunning;
    $("resume").disabled = !ready || isRunning;
    ["restart","fullscreen","exit","typeText","sendText","sendEnter"].forEach(id => $(id).disabled = !ready);
    updateGuideButtons();
  };
  const resetUI = () => {
    ready = false; isRunning = false; guestReady = false; commandBusy = false; gamePlaying = false;
    if(bootMonitor) { clearInterval(bootMonitor); bootMonitor = null; }
    cancelDownloads();
    controls.forEach(id => $(id).disabled = true);
    $("screenShell").classList.remove("running");
    document.querySelectorAll(".system-card").forEach(c => c.classList.remove("active"));
    updateGuideButtons();
  };
  const fail = error => {
    const detail = error && error.message ? error.message : String(error || "未知错误");
    cancelDownloads();
    status("启动未完成 · 可点击重新尝试");
    $("errorBox").hidden = false;
    $("errorMessage").textContent = "系统暂时没能启动。原因：" + detail;
    $("loadingCover").hidden = false;
    $("loadingCover").classList.add("load-failed");
    $("loadingTitle").textContent = "没有启动成功";
    $("loadingDetail").textContent = "可能是网络连接或 iPhone 浏览器限制。点击「重新尝试启动」，网页将自动重新选择下载地址。";
    $("runtimeHint").textContent = "已经停止等待，不会一直停留在「正在下载」。如仍失败，可尝试刷新页面或打开官方 v86 演示。";
    simpleStatus("加载失败，点击上方「重新尝试启动」可再次尝试。");
  };
  function loadRuntime() {
    if (window.V86 || window.V86Starter) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    const sources = [UPSTREAM+"build/libv86.js",UNPKG+"build/libv86.js"];
    const attempt = url => new Promise((resolve,reject)=>{
      const script = document.createElement("script");
      let done = false;
      const finish = (ok,reason) => {
        if(done) return;
        done = true;
        clearTimeout(timer);
        if(!ok) script.remove();
        ok ? resolve() : reject(new Error(reason));
      };
      const timer = setTimeout(()=>finish(false,"模拟器脚本加载超时"),18000);
      script.src=url;
      script.async=true;
      script.onload=()=>finish(!!(window.V86||window.V86Starter),"脚本未提供模拟器接口");
      script.onerror=()=>finish(false,"当前镜像站点无法连接");
      document.head.append(script);
    });
    scriptPromise = (async () => {
      for(let i=0;i<sources.length;i++) {
        showLoading("正在获取模拟器程序",i?"已自动切换备用程序下载地址…":"即将准备系统核心和开机文件…");
        try {await attempt(sources[i]);return;}catch(error) {
          if(window.V86 || window.V86Starter) return;
          if(i===sources.length-1) throw new Error("模拟器程序下载失败：" + error.message);
        }
      }
    })().catch(error=>{scriptPromise=null;throw error;});
    return scriptPromise;
  }
  async function stopExisting() {
    const old = emulator;
    emulator = null;
    if(old) { try { await old.destroy(); } catch (error) { console.warn("VM teardown:",error); } }
    $("screen_container").replaceChildren(Object.assign(document.createElement("div"),{style:"white-space:pre;font:14px monospace;line-height:14px"}), Object.assign(document.createElement("canvas"),{style:"display:none"}));
  }
  async function launch(id) {
    const config = SYSTEMS[id];
    if (!config) return;
    const token = ++generation;
    current = id;
    $("errorBox").hidden = true;
    $("machineName").textContent = config.name;
    resetUI();
    showLoading("正在准备系统…","首次运行需要下载几个系统文件。若下载失败会自动切换备用地址。");
    renderGuide(id);
    simpleStatus("系统正在启动，等屏幕出现提示后，点击旁边的大按钮即可。");
    document.querySelector('[data-system="' + id + '"]').classList.add("active");
    $("runtime").scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
    status("正在加载模拟器核心…");
    try {
      await stopExisting();
      if(token !== generation) return;
      await loadRuntime();
      if(token !== generation) return;
      const assets = await prepareAssets(config,token);
      if(token !== generation) return;
      showLoading("系统文件已准备完成","正在启动虚拟机，出现开机画面后即可操作。");
      const Emulator = window.V86 || window.V86Starter;
      const options = {
        wasm_path: assets.wasm_path,
        memory_size: config.memory * 1024 * 1024,
        vga_memory_size: config.vga * 1024 * 1024,
        screen_container: $("screen_container"),
        bios: assets.bios,
        vga_bios: assets.vga_bios,
        autostart:true,
        boot_order:config.type === "cdrom" ? 0x132 : 0x213,
        disable_keyboard:false,
        disable_mouse:false
      };
      options[config.type] = assets.disk;
      const instance = new Emulator(options);
      if(token !== generation) { await instance.destroy(); return; }
      emulator = instance;
      $("screenShell").classList.add("running");
      instance.add_listener("emulator-ready", () => {
        if(token !== generation) return;
        ready = true;
        status("模拟器就绪，系统正在启动…",true);
        buttons();
        $("screen_container").focus({preventScroll:true});
      });
      instance.add_listener("emulator-started", () => {
        if(token !== generation) return;
        ready = true; isRunning = true;
        hideLoading();
        status("虚拟机运行中 · 系统正在引导",true);
        buttons();
        // v86's emulator-started event only means the emulated CPU is running.
        // It does NOT mean the guest OS has reached a usable prompt or desktop.
        if(bootMonitor) clearInterval(bootMonitor);
        const startedAt = Date.now();
        let warningShown = false;
        bootMonitor = setInterval(() => {
          if(token !== generation || !emulator) { clearInterval(bootMonitor); bootMonitor = null; return; }
          if(!isRunning) return;
          const screen = $("screen_container");
          const text = screen.textContent || "";
          const canvas = screen.querySelector("canvas");
          const graphics = canvas && getComputedStyle(canvas).display !== "none" && canvas.width >= 320 && canvas.height >= 200;
          if(id === "freedos" && /A:\\>/.test(text)) {
            guestReady = true;
            status("DOS 提示符已就绪 · 本地运行",true);
            simpleStatus("已开机！点击「开始贪吃蛇」，方向键就在屏幕下方。");
            updateGuideButtons();
            clearInterval(bootMonitor); bootMonitor = null;
          } else if(id === "linux" && /(?:login:\s*$|(?:^|\n)[^\n]*[#$]\s*$|\/root%\s*$)/m.test(text)) {
            guestReady = true;
            status("Linux 命令行已就绪 · 本地运行",true);
            simpleStatus("Linux 已就绪，点「看看有哪些文件」即可操作。");
            updateGuideButtons();
            clearInterval(bootMonitor); bootMonitor = null;
          } else if(id === "kolibri" && graphics) {
            guestReady = true;
            status("已切换图形模式 · 请确认桌面",true);
            simpleStatus("试着点击桌面图标；也可以使用旁边的方向键、确认和返回。");
            updateGuideButtons();
            clearInterval(bootMonitor); bootMonitor = null;
          } else if(Date.now() - startedAt > 60000 && !warningShown) {
            warningShown = true;
            status("系统仍在引导 · 可以继续等待");
            $("runtimeHint").textContent = "模拟器仍在运行，但尚未检测到系统就绪界面。若画面长时间不动，可重启或尝试桌面浏览器。";
          } else if(Date.now() - startedAt > 180000) {
            clearInterval(bootMonitor); bootMonitor = null;
          }
        }, 1400);
      });
      instance.add_listener("emulator-stopped", () => {
        if(token !== generation) return;
        isRunning = false;
        status("已暂停");
        buttons();
      });
      // Don't claim success until the engine explicitly reports it has started.
      loadingTimer = setTimeout(() => {
        if(token !== generation || isRunning) return;
        fail(new Error("文件已下载，但虚拟机在 45 秒内没有开始运行。可能是浏览器 WebAssembly 内存或兼容性问题。"));
      }, 45000);
    } catch(error) {
      if(token === generation) { resetUI(); fail(error); }
    }
  }
  document.querySelectorAll("[data-launch]").forEach(button => button.addEventListener("click", () => launch(button.dataset.launch)));
  $("pause").addEventListener("click",async () => {if(emulator && ready) {try{await emulator.stop();}catch(e){fail(e);}}});
  $("resume").addEventListener("click",async () => {if(emulator && ready) {try{await emulator.run();}catch(e){fail(e);}}});
  $("restart").addEventListener("click",() => {if(emulator && ready) emulator.restart();});
  $("exit").addEventListener("click",async () => {++generation; if(document.body.classList.contains("lab-immersive")) setImmersive(false); resetUI();current = null;renderGuide(null);status("已退出");$("machineName").textContent="尚未启动";await stopExisting();});
  $("fullscreen").addEventListener("click",toggleImmersive);
  $("screenMode").addEventListener("click",toggleImmersive);
  $("retryLoading").addEventListener("click",()=>{if(current) launch(current);});
  $("retryFailed").addEventListener("click",()=>{if(current) launch(current);});
  document.addEventListener("fullscreenchange",() => {
    if(!document.fullscreenElement && document.body.classList.contains("lab-immersive")) setImmersive(false);
  });
  const feedback = message => { $("quickFeedback").textContent = message; };
  async function pressVirtualKey(name) {
    if(!emulator || !ready || !isRunning || !KEY_CODES[name]) return;
    if(current === "kolibri" && name === "ctrlc") return;
    const instance = emulator;
    try {
      await instance.keyboard_send_scancodes(KEY_CODES[name], 12);
      if(instance === emulator) {
        feedback("虚拟按键 " + (name === "enter" ? "Enter" : name.toUpperCase()) + " 已发送到 " + SYSTEMS[current].name + "。");
        if(!gamePlaying) simpleStatus("按键已发送：" + (name === "enter" ? "确认" : name) + "。");
      }
    } catch(error) {
      feedback("按键未发送成功：" + (error?.message || "模拟器暂不可用"));
    }
  }
  async function runQuickCommand(cmd) {
    if(!emulator || !ready || !isRunning || !guestReady || commandBusy || current === "kolibri") return;
    if(!GUIDES[current].commands.some(item => item.value === cmd)) return;
    const instance = emulator;
    commandBusy = true;
    updateGuideButtons();
    feedback("正在发送 " + cmd + " 并执行…");
    try {
      await instance.keyboard_send_text(cmd, 15);
      if(instance !== emulator || !isRunning) return;
      await instance.keyboard_send_scancodes(KEY_CODES.enter, 15);
      if(instance === emulator) {
        feedback("已输入并执行「" + cmd + "」。请看上方黑色窗口的输出。");
        if(cmd === "snake" && current === "freedos") gamePlaying = true;
        simpleStatus(cmd === "snake" ? "已发送贪吃蛇启动指令！用屏幕下方的方向键控制移动，按返回键退出。" : "已执行「" + cmd + "」，请查看屏幕内容。");
      }
    } catch(error) {
      feedback("快捷命令未执行成功：" + (error?.message || "模拟器暂不可用"));
    } finally {
      commandBusy = false;
      updateGuideButtons();
    }
  }
  $("quickCommands").addEventListener("click", event => {
    const button = event.target.closest("[data-command]");
    if(button && $("quickCommands").contains(button) && !button.disabled) runQuickCommand(button.dataset.command);
  });
  $("virtualKeys").addEventListener("click", event => {
    const button = event.target.closest("[data-vkey]");
    if(button && $("virtualKeys").contains(button) && !button.disabled) pressVirtualKey(button.dataset.vkey);
  });
  $("primaryAction").addEventListener("click", () => {
    if(!guestReady || !ready || !isRunning || commandBusy) return;
    if(current === "freedos") runQuickCommand("snake");
    else if(current === "linux") runQuickCommand("ls");
    else if(current === "kolibri") pressVirtualKey("enter");
  });
  $("padEnter").addEventListener("click",() => pressVirtualKey("enter"));
  $("padEsc").addEventListener("click",() => pressVirtualKey("esc"));
  // Pointerdown sends immediately (without waiting for delayed iOS click synthesis).
  // Click remains available for keyboard and assistive-technology activation.
  const sentOnPointer = new WeakSet();
  $("dpad").addEventListener("pointerdown", event => {
    const key = event.target.closest("[data-padkey]");
    if(!key || key.disabled || !event.isPrimary) return;
    event.preventDefault();
    sentOnPointer.add(key);
    pressVirtualKey(key.dataset.padkey);
  });
  $("dpad").addEventListener("click", event => {
    const key = event.target.closest("[data-padkey]");
    if(!key || key.disabled) return;
    if(sentOnPointer.has(key)) { sentOnPointer.delete(key); return; }
    pressVirtualKey(key.dataset.padkey);
  });
  $("typeForm").addEventListener("submit", async event => {
    event.preventDefault();
    if(!ready || !isRunning || !emulator) return;
    const input = $("typeText");
    const txt = input.value;
    if(!txt) { feedback("输入框是空的。可以选择上面的一键执行，或输入命令。"); return; }
    const instance = emulator;
    try {
      await instance.keyboard_send_text(txt, 15);
      if(instance === emulator) {
        input.value = "";
        feedback("文字已发送。需要执行命令的话，再点击「Enter ↵ 执行」。");
      }
    } catch(error) { feedback("文字发送失败：" + (error?.message || "模拟器暂不可用")); }
  });
  $("sendEnter").addEventListener("click", () => pressVirtualKey("enter"));
  renderGuide(null);
  updateSimpleUI();
  window.addEventListener("pagehide",() => { if(emulator) { try { emulator.stop(); } catch {} } });
})();
