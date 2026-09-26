/**
 * CCO — SUPERVISÃO OPERACIONAL
 * Gerenciador PWA, Instalação e Conectividade
 */

(function () {
  'use strict';

  // 1. Registro do Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registrado com sucesso:', reg.scope);

          // Verificar atualizações do Service Worker
          reg.addEventListener('updatefound', () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.addEventListener('statechange', () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  showUpdateBanner(reg);
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn('[PWA] Falha ao registrar Service Worker:', err);
        });
    });
  }

  // 2. Banner de Atualização Suave
  function showUpdateBanner(registration) {
    if (document.getElementById('pwa-update-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      background: #1e3a8a;
      color: #ffffff;
      padding: 14px 20px;
      border-radius: 10px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      border: 1px solid #3b82f6;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: inherit;
      font-size: 14px;
    `;
    banner.innerHTML = `
      <span>🚀 <strong>Nova versão disponível!</strong></span>
      <button id="pwa-update-btn" style="
        background: #00d2ff;
        color: #0a1628;
        border: none;
        padding: 6px 14px;
        border-radius: 6px;
        font-weight: 700;
        cursor: pointer;
      ">Atualizar Agora</button>
      <button id="pwa-update-close" style="
        background: transparent;
        color: #94a3b8;
        border: none;
        cursor: pointer;
        font-size: 16px;
      ">✕</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('pwa-update-btn').addEventListener('click', () => {
      if (registration && registration.waiting) {
        registration.waiting.postMessage({ action: 'skipWaiting' });
      }
      window.location.reload();
    });

    document.getElementById('pwa-update-close').addEventListener('click', () => {
      banner.remove();
    });
  }

  // 3. Captura do Prompt de Instalação (Android & Desktop)
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] Evento beforeinstallprompt capturado.');
    renderInstallButton();
  });

  function renderInstallButton() {
    // Se o app já estiver instalado em modo standalone, não exibe
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      return;
    }

    // Se já houver um botão de instalar na barra ou no header, ativa-o
    const existingBtn = document.getElementById('pwa-install-btn');
    if (existingBtn) {
      existingBtn.style.display = 'inline-flex';
      existingBtn.onclick = triggerInstall;
      return;
    }

    // Caso contrário, injeta botão flutuante discreto
    if (document.getElementById('pwa-floating-install')) return;
    const floatingBtn = document.createElement('button');
    floatingBtn.id = 'pwa-floating-install';
    floatingBtn.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 20px;
      z-index: 9998;
      background: linear-gradient(135deg, #0284c7, #0369a1);
      color: #ffffff;
      border: 1px solid #38bdf8;
      padding: 10px 18px;
      border-radius: 30px;
      box-shadow: 0 4px 15px rgba(2, 132, 199, 0.4);
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    `;
    floatingBtn.innerHTML = `<span>📲</span> <span>Instalar CCO</span>`;
    floatingBtn.addEventListener('click', triggerInstall);
    document.body.appendChild(floatingBtn);
  }

  function triggerInstall() {
    if (!deferredPrompt) {
      alert('Para instalar o CCO no seu dispositivo, acesse o menu do navegador (três pontinhos) e clique em "Adicionar à tela inicial" ou "Instalar Aplicativo".');
      return;
    }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] Usuário aceitou a instalação do CCO.');
        const btn = document.getElementById('pwa-floating-install');
        if (btn) btn.remove();
      }
      deferredPrompt = null;
    });
  }

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Aplicativo CCO instalado com sucesso!');
    const btn = document.getElementById('pwa-floating-install');
    if (btn) btn.remove();
  });

  // 4. Detecção de Status de Conexão (Online / Offline)
  window.addEventListener('online', () => {
    showConnectivityToast('🟢 Conexão restabelecida com sucesso!', 'online');
  });

  window.addEventListener('offline', () => {
    showConnectivityToast('🔴 Sem conexão com a internet. O CCO continuará operando com os dados locais salvos.', 'offline');
  });

  function showConnectivityToast(msg, type) {
    const existing = document.getElementById('pwa-conn-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'pwa-conn-toast';
    toast.style.cssText = `
      position: fixed;
      top: 15px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10001;
      background: ${type === 'online' ? '#166534' : '#991b1b'};
      color: #ffffff;
      padding: 10px 22px;
      border-radius: 8px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.5);
      font-size: 13px;
      font-weight: 600;
      text-align: center;
      transition: opacity 0.3s;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // 5. Prevenção Universal contra Duplo Clique / Reenvio Acidental
  document.addEventListener('submit', (e) => {
    const submitBtn = e.target.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn && !submitBtn.disabled) {
      submitBtn.setAttribute('data-original-html', submitBtn.innerHTML);
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.6';
      submitBtn.style.cursor = 'not-allowed';

      // Reativa automaticamente após 4 segundos caso a requisição não recarregue a tela
      setTimeout(() => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
          submitBtn.style.cursor = 'pointer';
        }
      }, 4000);
    }
  });

})();
