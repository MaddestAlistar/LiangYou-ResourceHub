/* LiangYou Web OS Lab — static browser-only v86 host. No VM backend. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const BASE = "https://raw.githubusercontent.com/copy/images/master/";
  const UPSTREAM = "https://cdn.jsdelivr.net/npm/v86@0.5.473/";
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
  let bootMonitor = null;
  const controls = ["pause","resume","restart","fullscreen","exit","typeText","sendText","sendEnter"];
  const status = (message, live = false) => {
    $("machineStatus").textContent = message;
    $("led").classList.toggle("live", live);
  };
  const updateGuideButtons = () => {
    const enabled = ready && isRunning;
    const allowCommands = enabled && guestReady && !commandBusy;
    $("quickCommands").querySelectorAll("[data-command]").forEach(button => {
      button.disabled = !allowCommands;
    });
    $("virtualKeys").querySelectorAll("[data-vkey]").forEach(button => {
      button.disabled = !enabled || (button.dataset.vkey === "ctrlc" && current === "kolibri");
    });
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
    ready = false; isRunning = false; guestReady = false; commandBusy = false;
    if(bootMonitor) { clearInterval(bootMonitor); bootMonitor = null; }
    controls.forEach(id => $(id).disabled = true);
    $("screenShell").classList.remove("running");
    document.querySelectorAll(".system-card").forEach(c => c.classList.remove("active"));
    updateGuideButtons();
  };
  const fail = error => {
    const detail = error && error.message ? error.message : String(error || "未知错误");
    status("启动未完成");
    $("errorBox").hidden = false;
    $("errorMessage").textContent = "无法加载模拟器或系统镜像。可能是网络跨域策略、浏览器限制或第三方资源不可用。" + " 详情：" + detail;
    $("runtimeHint").textContent = "如遇 iOS Safari 兼容性问题，可尝试电脑浏览器或打开 v86 官方演示。";
  };
  function loadRuntime() {
    if (window.V86 || window.V86Starter) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve,reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => reject(new Error("模拟器核心加载超时")), 30000);
      script.src = UPSTREAM + "build/libv86.js";
      script.async = true;
      script.onload = () => { clearTimeout(timer); (window.V86 || window.V86Starter) ? resolve() : reject(new Error("无法找到 v86 模拟器接口")); };
      script.onerror = () => { clearTimeout(timer); reject(new Error("无法获取 v86 模拟器脚本")); };
      document.head.append(script);
    }).catch(error => {scriptPromise = null; throw error;});
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
    renderGuide(id);
    document.querySelector('[data-system="' + id + '"]').classList.add("active");
    $("runtime").scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
    status("正在加载模拟器核心…");
    try {
      await stopExisting();
      if(token !== generation) return;
      await loadRuntime();
      if(token !== generation) return;
      status("正在下载系统镜像并启动…");
      const Emulator = window.V86 || window.V86Starter;
      const options = {
        wasm_path: UPSTREAM + "build/v86.wasm",
        memory_size: config.memory * 1024 * 1024,
        vga_memory_size: config.vga * 1024 * 1024,
        screen_container: $("screen_container"),
        bios: {url:"https://raw.githubusercontent.com/copy/v86/master/bios/seabios.bin"},
        vga_bios: {url:"https://raw.githubusercontent.com/copy/v86/master/bios/vgabios.bin"},
        autostart:true,
        boot_order:config.type === "cdrom" ? 0x132 : 0x213,
        disable_keyboard:false,
        disable_mouse:false
      };
      options[config.type] = {url:BASE + config.file};
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
            updateGuideButtons();
            clearInterval(bootMonitor); bootMonitor = null;
          } else if(id === "linux" && /(?:login:\s*$|(?:^|\n)[^\n]*[#$]\s*$|\/root%\s*$)/m.test(text)) {
            guestReady = true;
            status("Linux 命令行已就绪 · 本地运行",true);
            updateGuideButtons();
            clearInterval(bootMonitor); bootMonitor = null;
          } else if(id === "kolibri" && graphics) {
            guestReady = true;
            status("已切换图形模式 · 请确认桌面",true);
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
      setTimeout(() => {
        if(token !== generation || isRunning) return;
        if(!ready) fail(new Error("等待模拟器启动超时；可能是 WASM/CORS 或移动设备兼容性问题"));
      }, 45000);
    } catch(error) {
      if(token === generation) { resetUI(); fail(error); }
    }
  }
  document.querySelectorAll("[data-launch]").forEach(button => button.addEventListener("click", () => launch(button.dataset.launch)));
  $("pause").addEventListener("click",async () => {if(emulator && ready) {try{await emulator.stop();}catch(e){fail(e);}}});
  $("resume").addEventListener("click",async () => {if(emulator && ready) {try{await emulator.run();}catch(e){fail(e);}}});
  $("restart").addEventListener("click",() => {if(emulator && ready) emulator.restart();});
  $("exit").addEventListener("click",async () => {++generation; resetUI();current = null;renderGuide(null);status("已退出");$("machineName").textContent="尚未启动";await stopExisting();});
  $("fullscreen").addEventListener("click",async () => {
    try {
      if(!emulator) return;
      if(document.fullscreenElement){await document.exitFullscreen();return;}
      if($("screenShell").requestFullscreen) await $("screenShell").requestFullscreen();
      else if(emulator.screen_go_fullscreen) emulator.screen_go_fullscreen();
      else throw new Error("当前浏览器不支持全屏显示");
    } catch(e) { $("runtimeHint").textContent = "当前设备可能不支持网页全屏。可以尝试横屏操作：" + e.message; }
  });
  const feedback = message => { $("quickFeedback").textContent = message; };
  async function pressVirtualKey(name) {
    if(!emulator || !ready || !isRunning || !KEY_CODES[name]) return;
    if(current === "kolibri" && name === "ctrlc") return;
    const instance = emulator;
    try {
      await instance.keyboard_send_scancodes(KEY_CODES[name], 12);
      if(instance === emulator) feedback("虚拟按键 " + (name === "enter" ? "Enter" : name.toUpperCase()) + " 已发送到 " + SYSTEMS[current].name + "。");
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
      if(instance === emulator) feedback("已输入并执行「" + cmd + "」。请看上方黑色窗口的输出。");
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
  window.addEventListener("pagehide",() => { if(emulator) { try { emulator.stop(); } catch {} } });
})();
