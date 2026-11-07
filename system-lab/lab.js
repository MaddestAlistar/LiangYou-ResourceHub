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
  let emulator = null;
  let current = null;
  let generation = 0;
  let scriptPromise = null;
  let ready = false;
  let isRunning = false;
  const controls = ["pause","resume","restart","fullscreen","exit","typeText","sendText","sendEnter"];
  const status = (message, live = false) => {
    $("machineStatus").textContent = message;
    $("led").classList.toggle("live", live);
  };
  const buttons = () => {
    $("pause").disabled = !ready || !isRunning;
    $("resume").disabled = !ready || isRunning;
    ["restart","fullscreen","exit","typeText","sendText","sendEnter"].forEach(id => $(id).disabled = !ready);
  };
  const resetUI = () => {
    ready = false; isRunning = false; controls.forEach(id => $(id).disabled = true);
    $("screenShell").classList.remove("running");
    document.querySelectorAll(".system-card").forEach(c => c.classList.remove("active"));
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
        status("运行中 · 本地计算",true);
        buttons();
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
  $("exit").addEventListener("click",async () => {++generation; resetUI();status("已退出");$("machineName").textContent="尚未启动";await stopExisting();});
  $("fullscreen").addEventListener("click",async () => {
    try {
      if(!emulator) return;
      if(document.fullscreenElement){await document.exitFullscreen();return;}
      if($("screenShell").requestFullscreen) await $("screenShell").requestFullscreen();
      else if(emulator.screen_go_fullscreen) emulator.screen_go_fullscreen();
      else throw new Error("当前浏览器不支持全屏显示");
    } catch(e) { $("runtimeHint").textContent = "当前设备可能不支持网页全屏。可以尝试横屏操作：" + e.message; }
  });
  $("typeForm").addEventListener("submit",event => {event.preventDefault();if(!ready || !emulator) return;const txt = $("typeText").value;if(txt)emulator.keyboard_send_text(txt);$("typeText").value="";});
  $("sendEnter").addEventListener("click",() => {if(ready && emulator) emulator.keyboard_send_scancodes([0x1c,0x9c]);});
  window.addEventListener("pagehide",() => { if(emulator) { try { emulator.stop(); } catch {} } });
})();
