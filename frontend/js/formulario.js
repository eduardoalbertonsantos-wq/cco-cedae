let postosDoSetor = [];
let textoWhatsAppGerado = '';
let relatorioIdAtivoDesk = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Definir data operacional de Brasília como padrão
    const dataInput = document.getElementById('data_servico');
    if (dataInput) {
        dataInput.value = typeof getHojeBrasiliaISO === 'function' ? getHojeBrasiliaISO() : new Date().toISOString().split('T')[0];
    }
    
    setupPwa();
    await carregarSetoresIniciais();
    setupCalculoKm();
    setupFormSubmit();
    setupWhatsAppHandlers();
    setupConferenciaDesktop();
    setupSalvarProgressoDesktop();
});

// 0. CONFIGURAÇÃO DO APLICATIVO PROGRESSIVO (PWA - MOBILE)
function setupPwa() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        });
    }

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) {
        return; // Já está rodando como app instalado
    }

    const pwaBanner = document.getElementById('pwaBanner');
    const btnInstalar = document.getElementById('btnInstalarApp');
    const btnFechar = document.getElementById('btnFecharPwaBanner');
    let deferredPrompt = null;

    btnFechar?.addEventListener('click', () => {
        if (pwaBanner) pwaBanner.style.display = 'none';
        sessionStorage.setItem('cco_pwa_dismissed', 'true');
    });

    if (sessionStorage.getItem('cco_pwa_dismissed')) {
        return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (pwaBanner) pwaBanner.style.display = 'block';
    });

    // Detecção de iPhone / iPad
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIos && pwaBanner) {
        pwaBanner.style.display = 'block';
        const sub = document.getElementById('pwaBannerSubtitle');
        if (sub) sub.textContent = 'No iPhone/iPad: toque em Compartilhar e selecione "Adicionar à Tela de Início"';
        if (btnInstalar) btnInstalar.textContent = 'Como Instalar';
    }

    btnInstalar?.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted' && pwaBanner) {
                pwaBanner.style.display = 'none';
            }
            deferredPrompt = null;
        } else if (isIos) {
            alert('📱 Como instalar no iPhone / iPad:\n\n1. No Safari, toque no botão de Compartilhar (ícone com quadrado e seta para cima no rodapé);\n2. Role as opções e toque em "Adicionar à Tela de Início";\n3. Confirme em "Adicionar".\n\nPronto! O ícone do CCO CEDAE será criado na sua tela inicial e abrirá em tela cheia como um aplicativo nativo.');
        } else {
            alert('📱 Como instalar no celular Android:\n\n1. Toque nos 3 pontinhos no canto superior do navegador Chrome;\n2. Toque em "Instalar aplicativo" ou "Adicionar à tela inicial";\n3. Confirme.\n\nPronto! O aplicativo CCO CEDAE ficará instalado na sua tela inicial.');
        }
    });
}

// 1. CARREGAR LISTA DE SETORES (Rota Pública sem necessidade de Token)
async function carregarSetoresIniciais() {
    try {
        const setores = await apiGet('/formulario/setores');
        const selectSetor = document.getElementById('selectSetor');
        if (!selectSetor) return;
        
        selectSetor.innerHTML = '<option value="">Selecione o Setor do seu expediente...</option>';
        setores.forEach(s => {
            selectSetor.innerHTML += `<option value="${s.id}">${s.nome} (${s.sigla || 'CEDAE'})</option>`;
        });

        // Verificar se veio setor na URL (?setor=1)
        const urlParams = new URLSearchParams(window.location.search);
        const setorUrl = urlParams.get('setor');
        if (setorUrl) {
            selectSetor.value = setorUrl;
            carregarEstruturaDoSetor(setorUrl);
        }

        selectSetor.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val) {
                carregarEstruturaDoSetor(val);
            } else {
                document.getElementById('etapasCascata').style.display = 'none';
            }
        });

    } catch (e) {
        alert('Erro ao carregar setores operacionais: ' + e.message);
    }
}

// 2. CARREGAR ESTRUTURA EM CASCATA POR SETOR
async function carregarEstruturaDoSetor(setorId) {
    try {
        const etapasDiv = document.getElementById('etapasCascata');
        etapasDiv.style.display = 'block';
        
        const data = await apiGet(`/formulario/setor/${setorId}`);
        
        // 2.1 Preencher Supervisores do Setor
        const selectSup = document.getElementById('selectSupervisor');
        selectSup.innerHTML = '<option value="">Selecione o fiscal...</option>';
        if (data.supervisores && data.supervisores.length > 0) {
            data.supervisores.forEach(sup => {
                const mat = sup.matricula ? `(Mat. ${sup.matricula})` : '';
                selectSup.innerHTML += `<option value="${sup.id}" data-nome="${sup.nome}">${sup.nome} ${mat}</option>`;
            });
        } else {
            selectSup.innerHTML = '<option value="">Nenhum fiscal ativo cadastrado para este setor</option>';
        }

        // 2.2 Preencher Viaturas do Setor + Opção OUTROS
        const selectVtr = document.getElementById('selectViatura');
        selectVtr.innerHTML = '<option value="">Selecione a viatura...</option>';
        if (data.viaturas && data.viaturas.length > 0) {
            data.viaturas.forEach(vtr => {
                selectVtr.innerHTML += `<option value="${vtr.id}">${vtr.tipo_modelo} — Placa: ${vtr.placa} ${vtr.prefixo ? `(${vtr.prefixo})` : ''}</option>`;
            });
        }
        selectVtr.innerHTML += '<option value="OUTROS">OUTROS — (Veículo Sobressalente / Não Cadastrado)</option>';

        selectVtr.addEventListener('change', (e) => {
            const grupoOutros = document.getElementById('grupoViaturaOutros');
            if (e.target.value === 'OUTROS') {
                grupoOutros.style.display = 'block';
                document.getElementById('viaturaOutrosTexto').required = true;
            } else {
                grupoOutros.style.display = 'none';
                document.getElementById('viaturaOutrosTexto').required = false;
            }
        });

        // 2.3 Renderizar Postos do Setor (ou 12 slots se Plantão)
        postosDoSetor = data.postos || [];
        const isPlantao = data.isPlantao || (data.setor && data.setor.nome && data.setor.nome.toUpperCase().includes('PLANT'));
        
        const postosContainer = document.getElementById('postosContainer');
        postosContainer.innerHTML = '';
        
        if (isPlantao) {
            document.getElementById('contadorPostosBadge').textContent = `Plantão: 59 postos disponíveis (até 12 por expediente)`;

            let optionsPlantao = '<option value="">-- [Vazio / Selecione o Posto Fiscalizado] --</option>';
            optionsPlantao += '<option value="MANUAL">➕ OUTRO POSTO (Digitar manualmente)</option>';
            
            postosDoSetor.forEach(p => {
                const rotuloOrigem = p.setor_origem ? ` [${p.setor_origem}]` : '';
                optionsPlantao += `<option value="${p.id}" 
                    data-nome="${encodeURIComponent(p.nome)}" 
                    data-endereco="${encodeURIComponent(p.endereco || '')}" 
                    data-localidade="${encodeURIComponent(p.localidade || '')}" 
                    data-empresa="${encodeURIComponent(p.empresa || '')}" 
                    data-regiao="${encodeURIComponent(p.regiao || '')}" 
                    data-origem="${encodeURIComponent(p.setor_origem || '')}">
                    ${p.nome} — ${p.localidade || 'RJ'} (${p.empresa || 'CEDAE'})${rotuloOrigem}
                </option>`;
            });

            for (let i = 1; i <= 12; i++) {
                const numFmt = i.toString().padStart(2, '0');
                postosContainer.innerHTML += `
                    <div class="posto-card plantao-posto-card" data-slot="${i}" id="plantao_slot_${i}" style="border: 1px solid #cbd5e1; border-radius: 0.5rem; padding: 1.15rem; margin-bottom: 1.25rem; background: #ffffff; transition: all 0.2s ease;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem; flex-wrap:wrap; gap:0.5rem;">
                            <h3 style="margin:0; font-size:1.05rem; color:var(--cco-navy); font-weight:800; display:flex; align-items:center; gap:0.5rem;">
                                🏢 POSTO ${numFmt}
                            </h3>
                            <span class="slot-badge" id="slot_badge_${i}" style="font-size:0.75rem; font-weight:700; color:#64748b; background:#f1f5f9; padding:0.25rem 0.65rem; border-radius:9999px;">
                                Vazio / Não Utilizado
                            </span>
                        </div>

                        <div class="form-group" style="margin-bottom:0.75rem;">
                            <label class="form-label" style="font-weight:700; font-size:0.85rem; color:#1e293b;">Selecionar posto do Plantão:</label>
                            <select class="form-select plantao-posto-select" data-slot="${i}" id="plantao_posto_select_${i}" style="font-weight:600; font-size:0.95rem; min-height:46px;">
                                ${optionsPlantao}
                            </select>
                            <small style="color:#64748b; font-size:0.75rem;">Selecione o posto entre os 59 oficiais da planilha ou escolha digitar manualmente.</small>
                        </div>

                        <div id="plantao_manual_wrap_${i}" style="display:none; margin-bottom:0.75rem;">
                            <label class="form-label" style="font-weight:700; font-size:0.85rem; color:#1e293b;">Nome do posto digitado:</label>
                            <input type="text" class="form-input plantao-posto-nome-manual" data-slot="${i}" id="posto_nome_manual_${i}" placeholder="Digite o nome do posto..." autocomplete="off">
                        </div>

                        <!-- Card de Visualização dos Dados Oficiais do Posto -->
                        <div class="plantao-posto-info-box" id="plantao_info_${i}" style="display:none; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:0.375rem; padding:0.85rem; margin-bottom:0.85rem; font-size:0.85rem; line-height:1.5;">
                            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:0.5rem;">
                                <div><strong style="color:#166534;">📍 ENDEREÇO:</strong> <span id="info_end_${i}" style="color:#1e293b;"></span></div>
                                <div><strong style="color:#166534;">🏙️ LOCALIDADE:</strong> <span id="info_loc_${i}" style="color:#1e293b;"></span></div>
                                <div><strong style="color:#166534;">🛡️ EMPRESA:</strong> <span id="info_emp_${i}" style="color:#1e293b;"></span></div>
                                <div><strong style="color:#166534;">🏷️ SETOR ORIGEM:</strong> <span id="info_orig_${i}" style="color:#0369a1; font-weight:700;"></span></div>
                            </div>
                        </div>

                        <div class="plantao-posto-campos" id="plantao_campos_${i}" style="display:none; background:#fafafa; padding:1rem; border-radius:0.375rem; border:1px solid #e2e8f0; margin-top:0.5rem;">
                            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.75rem; margin-bottom:0.85rem;">
                                <div class="form-group" style="margin:0;">
                                    <label class="form-label" style="font-size:0.8rem; font-weight:700; color:#334155;">Hora da fiscalização: *</label>
                                    <input type="time" class="form-input plantao-hora" data-slot="${i}" id="plantao_hora_${i}">
                                </div>
                                <div class="form-group" style="margin:0;">
                                    <label class="form-label" style="font-size:0.8rem; font-weight:700; color:#334155;">KM no posto: *</label>
                                    <input type="number" step="0.1" class="form-input plantao-km" data-slot="${i}" id="plantao_km_${i}" placeholder="Ex: 12450.0">
                                </div>
                                <div class="form-group" style="margin:0;">
                                    <label class="form-label" style="font-size:0.8rem; font-weight:700; color:#334155;">Situação: *</label>
                                    <select class="form-select plantao-situacao" data-slot="${i}" id="plantao_situacao_${i}">
                                        <option value="NORMAL">🟢 NORMAL</option>
                                        <option value="SEM_ALTERACAO">⚪ SEM ALTERAÇÃO</option>
                                        <option value="COM_OCORRENCIA">🔴 COM OCORRÊNCIA</option>
                                        <option value="PENDENCIA">🟡 PENDÊNCIA</option>
                                        <option value="NAO_SUPERVISIONADO">⚫ POSTO NÃO FISCALIZADO</option>
                                    </select>
                                </div>
                            </div>

                            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.85rem; background:#ffffff; padding:0.85rem; border-radius:0.375rem; border:1px solid #e2e8f0;">
                                <!-- Efetivo Completo -->
                                <div>
                                    <label class="form-label" style="font-size:0.8rem; font-weight:700; margin-bottom:0.4rem; display:block; color:#1e293b;">Efetivo completo:</label>
                                    <div style="display:flex; gap:1.25rem; align-items:center;">
                                        <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-weight:700; color:#15803d; font-size:0.85rem;">
                                            <input type="radio" name="efetivo_slot_${i}" value="SIM" class="plantao-efetivo-radio" data-slot="${i}" checked>
                                            SIM
                                        </label>
                                        <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-weight:700; color:#b91c1c; font-size:0.85rem;">
                                            <input type="radio" name="efetivo_slot_${i}" value="NAO" class="plantao-efetivo-radio" data-slot="${i}">
                                            NÃO
                                        </label>
                                    </div>
                                    <div class="campo-falta-slot" id="campo_falta_${i}" style="display:none; margin-top:0.5rem;">
                                        <label style="font-size:0.75rem; font-weight:700; color:#b91c1c;">Falta: (obrigatório se NÃO) *</label>
                                        <input type="text" class="form-input plantao-falta" data-slot="${i}" id="plantao_falta_${i}" placeholder="Ex: Falta 01 vigilante / Ausente">
                                    </div>
                                </div>

                                <!-- Ocorrência -->
                                <div>
                                    <label class="form-label" style="font-size:0.8rem; font-weight:700; margin-bottom:0.4rem; display:block; color:#1e293b;">Ocorrência:</label>
                                    <div style="display:flex; gap:1.25rem; align-items:center;">
                                        <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-weight:700; color:#475569; font-size:0.85rem;">
                                            <input type="radio" name="ocorrencia_slot_${i}" value="NAO" class="plantao-ocorrencia-radio" data-slot="${i}" checked>
                                            NÃO
                                        </label>
                                        <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-weight:700; color:#b91c1c; font-size:0.85rem;">
                                            <input type="radio" name="ocorrencia_slot_${i}" value="SIM" class="plantao-ocorrencia-radio" data-slot="${i}">
                                            SIM
                                        </label>
                                    </div>
                                    <div class="campo-ocorrencia-slot" id="campo_ocorrencia_${i}" style="display:none; margin-top:0.5rem;">
                                        <label style="font-size:0.75rem; font-weight:700; color:#b91c1c;">Informar ocorrência: (obrigatório se SIM) *</label>
                                        <textarea class="form-textarea plantao-ocorrencia-desc" data-slot="${i}" id="plantao_ocorrencia_desc_${i}" rows="2" placeholder="Descreva detalhadamente a ocorrência..."></textarea>
                                    </div>
                                </div>
                            </div>

                            <!-- Se marcar NÃO SUPERVISIONADO no select -->
                            <div class="campo-motivo-nao-sup" id="campo_motivo_nao_sup_${i}" style="display:none; margin-top:0.75rem; background:#fef2f2; border:1px solid #fecaca; border-radius:0.375rem; padding:0.75rem;">
                                <label style="font-size:0.8rem; font-weight:800; color:#b91c1c;">Motivo / Justificativa da Não Fiscalização *</label>
                                <select class="form-select plantao-motivo-select" data-slot="${i}" id="plantao_motivo_${i}">
                                    <option value="">Selecione o motivo...</option>
                                    <option value="Posto fechado">Posto fechado</option>
                                    <option value="Sem acesso ao local">Sem acesso ao local</option>
                                    <option value="Impedimento operacional">Impedimento operacional</option>
                                    <option value="Viatura indisponível">Viatura indisponível</option>
                                    <option value="Falta de efetivo">Falta de efetivo</option>
                                    <option value="Emergência operacional">Emergência operacional</option>
                                    <option value="Condições climáticas">Condições climáticas</option>
                                    <option value="Outro">Outro (especificar)</option>
                                </select>
                                <input type="text" class="form-input plantao-motivo-outro" data-slot="${i}" id="plantao_motivo_outro_${i}" placeholder="Especifique a justificativa detalhada..." style="display:none; margin-top:0.4rem;">
                            </div>
                        </div>
                    </div>
                `;
            }

            setupPlantaoSlotsListeners();

        } else if (postosDoSetor.length > 0) {
            // Setor regular (Tinguá, Guandu, Laranjal) - MODELO DE SUPERVISÃO EM SLOTS COM LISTA SUSPENSA
            const totalSlots = postosDoSetor.length;
            document.getElementById('contadorPostosBadge').textContent = `${data.setor.nome}: até ${totalSlots} postos`;
            
            // Montar opções da lista suspensa com apenas os postos deste setor
            let optionsHtml = '<option value="">-- [Vazio / Posto Não Fiscalizado] --</option>';
            postosDoSetor.forEach(p => {
                optionsHtml += `<option value="${p.id}">${p.nome} (${p.empresa || 'CEDAE'})</option>`;
            });

            for (let i = 1; i <= totalSlots; i++) {
                const numFmt = i.toString().padStart(2, '0');
                postosContainer.innerHTML += `
                    <div class="posto-card regular-posto-card" data-slot="${i}" id="reg_slot_${i}" style="border: 1px solid #cbd5e1; border-radius: 0.5rem; padding: 1.15rem; margin-bottom: 1.25rem; background: #ffffff; transition: all 0.2s ease;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem; flex-wrap:wrap; gap:0.5rem;">
                            <h3 style="margin:0; font-size:1.05rem; color:var(--cco-navy); font-weight:800; display:flex; align-items:center; gap:0.5rem;">
                                🏢 POSTO ${numFmt}
                            </h3>
                            <span class="slot-badge" id="reg_slot_badge_${i}" style="font-size:0.75rem; font-weight:700; color:#64748b; background:#f1f5f9; padding:0.25rem 0.65rem; border-radius:9999px;">
                                Vazio / Não Utilizado
                            </span>
                        </div>

                        <div class="form-group" style="margin-bottom:0.75rem;">
                            <label class="form-label" style="font-weight:700; font-size:0.85rem; color:#1e293b;">Nome do posto:</label>
                            <select class="form-select regular-posto-select" data-slot="${i}" id="reg_posto_select_${i}" style="font-weight:600; font-size:0.95rem; min-height:46px;">
                                ${optionsHtml}
                            </select>
                            <small style="color:#64748b; font-size:0.75rem;">Deixe vazio se não fiscalizou este posto (postos vazios são desconsiderados).</small>
                        </div>

                        <div class="regular-posto-campos" id="reg_campos_${i}" style="display:none; background:#fafafa; padding:1rem; border-radius:0.375rem; border:1px solid #e2e8f0; margin-top:0.5rem;">
                            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.75rem; margin-bottom:0.85rem;">
                                <div class="form-group" style="margin:0;">
                                    <label class="form-label" style="font-size:0.8rem; font-weight:700; color:#334155;">Hora da fiscalização: *</label>
                                    <input type="time" class="form-input reg-hora" data-slot="${i}" id="reg_hora_${i}" style="min-height:44px;">
                                </div>
                                <div class="form-group" style="margin:0;">
                                    <label class="form-label" style="font-size:0.8rem; font-weight:700; color:#334155;">KM no posto: *</label>
                                    <input type="number" step="0.1" class="form-input reg-km" data-slot="${i}" id="reg_km_${i}" placeholder="Ex: 12450.0" style="min-height:44px;">
                                </div>
                                <div class="form-group" style="margin:0;">
                                    <label class="form-label" style="font-size:0.8rem; font-weight:700; color:#334155;">Situação: *</label>
                                    <select class="form-select reg-situacao" data-slot="${i}" id="reg_situacao_${i}" style="min-height:44px;">
                                        <option value="NORMAL">🟢 NORMAL</option>
                                        <option value="SEM_ALTERACAO">⚪ SEM ALTERAÇÃO</option>
                                        <option value="COM_OCORRENCIA">🔴 COM OCORRÊNCIA</option>
                                        <option value="PENDENCIA">🟡 PENDÊNCIA</option>
                                        <option value="NAO_SUPERVISIONADO">⚫ NÃO FISCALIZADO</option>
                                    </select>
                                </div>
                            </div>

                            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.85rem; background:#ffffff; padding:0.85rem; border-radius:0.375rem; border:1px solid #e2e8f0;">
                                <!-- Efetivo Completo -->
                                <div>
                                    <label class="form-label" style="font-size:0.8rem; font-weight:700; margin-bottom:0.4rem; display:block; color:#1e293b;">Efetivo completo:</label>
                                    <div style="display:flex; gap:1.25rem; align-items:center; min-height:40px;">
                                        <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-weight:700; color:#15803d; font-size:0.85rem;">
                                            <input type="radio" name="reg_efetivo_slot_${i}" value="SIM" class="reg-efetivo-radio" data-slot="${i}" checked>
                                            SIM
                                        </label>
                                        <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-weight:700; color:#b91c1c; font-size:0.85rem;">
                                            <input type="radio" name="reg_efetivo_slot_${i}" value="NAO" class="reg-efetivo-radio" data-slot="${i}">
                                            NÃO
                                        </label>
                                    </div>
                                    <div class="campo-falta-slot" id="reg_campo_falta_${i}" style="display:none; margin-top:0.5rem;">
                                        <label style="font-size:0.75rem; font-weight:700; color:#b91c1c;">Falta: (obrigatório se NÃO) *</label>
                                        <input type="text" class="form-input reg-falta" data-slot="${i}" id="reg_falta_${i}" placeholder="Ex: Falta 01 vigilante / Ausente" style="min-height:44px;">
                                    </div>
                                </div>

                                <!-- Ocorrência -->
                                <div>
                                    <label class="form-label" style="font-size:0.8rem; font-weight:700; margin-bottom:0.4rem; display:block; color:#1e293b;">Ocorrência:</label>
                                    <div style="display:flex; gap:1.25rem; align-items:center; min-height:40px;">
                                        <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-weight:700; color:#475569; font-size:0.85rem;">
                                            <input type="radio" name="reg_ocorrencia_slot_${i}" value="NAO" class="reg-ocorrencia-radio" data-slot="${i}" checked>
                                            NÃO
                                        </label>
                                        <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-weight:700; color:#b91c1c; font-size:0.85rem;">
                                            <input type="radio" name="reg_ocorrencia_slot_${i}" value="SIM" class="reg-ocorrencia-radio" data-slot="${i}">
                                            SIM
                                        </label>
                                    </div>
                                    <div class="campo-ocorrencia-slot" id="reg_campo_ocorrencia_${i}" style="display:none; margin-top:0.5rem;">
                                        <label style="font-size:0.75rem; font-weight:700; color:#b91c1c;">Informar ocorrência: (obrigatório se SIM) *</label>
                                        <textarea class="form-textarea reg-ocorrencia-desc" data-slot="${i}" id="reg_ocorrencia_desc_${i}" rows="2" placeholder="Descreva detalhadamente a ocorrência..."></textarea>
                                    </div>
                                </div>
                            </div>

                            <!-- Se marcar NÃO SUPERVISIONADO no select -->
                            <div class="campo-motivo-nao-sup" id="reg_campo_motivo_nao_sup_${i}" style="display:none; margin-top:0.75rem; background:#fef2f2; border:1px solid #fecaca; border-radius:0.375rem; padding:0.75rem;">
                                <label style="font-size:0.8rem; font-weight:800; color:#b91c1c;">Motivo da Não Fiscalização *</label>
                                <select class="form-select reg-motivo-select" data-slot="${i}" id="reg_motivo_${i}" style="min-height:44px;">
                                    <option value="">Selecione o motivo...</option>
                                    <option value="Posto fechado">Posto fechado</option>
                                    <option value="Sem acesso ao local">Sem acesso ao local</option>
                                    <option value="Impedimento operacional">Impedimento operacional</option>
                                    <option value="Viatura indisponível">Viatura indisponível</option>
                                    <option value="Falta de efetivo">Falta de efetivo</option>
                                    <option value="Emergência operacional">Emergência operacional</option>
                                    <option value="Condições climáticas">Condições climáticas</option>
                                    <option value="Outro">Outro (especificar)</option>
                                </select>
                                <input type="text" class="form-input reg-motivo-outro" data-slot="${i}" id="reg_motivo_outro_${i}" placeholder="Especifique o motivo..." style="display:none; margin-top:0.4rem; min-height:44px;">
                            </div>
                        </div>
                    </div>
                `;
            }

            // Listeners regulares
            setupRegularSlotsListeners();
        } else {
            document.getElementById('contadorPostosBadge').textContent = '0 Postos atribuídos';
            postosContainer.innerHTML = `
                <div style="text-align:center; padding:2.5rem 1rem; background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:0.5rem; color:#475569;">
                    <div style="font-size:2rem; margin-bottom:0.5rem;">⚠️</div>
                    <strong style="font-size:1.05rem; color:#1e293b; display:block; margin-bottom:0.25rem;">Nenhum posto atribuído a este setor operacional pela chefia.</strong>
                    <span style="font-size:0.88rem; color:#64748b;">A chefia/administrador deve definir os postos deste setor na tela de <strong>Distribuição de Postos</strong>.</span>
                </div>
            `;
        }

        await checarERecuperarRelatorioEmAndamentoDesk();

    } catch (e) {
        alert('Erro ao carregar fiscais e postos do setor: ' + e.message);
    }
}

// Listeners dos 12 slots do Plantão (Seleção entre os 59 oficiais ou Manual)
function setupPlantaoSlotsListeners() {
    document.querySelectorAll('.plantao-posto-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const slot = e.target.dataset.slot;
            const campos = document.getElementById(`plantao_campos_${slot}`);
            const badge = document.getElementById(`slot_badge_${slot}`);
            const card = document.getElementById(`plantao_slot_${slot}`);
            const infoBox = document.getElementById(`plantao_info_${slot}`);
            const manualWrap = document.getElementById(`plantao_manual_wrap_${slot}`);
            const manualInp = document.getElementById(`posto_nome_manual_${slot}`);
            const selectedVal = e.target.value;

            if (selectedVal === 'MANUAL') {
                if (manualWrap) manualWrap.style.display = 'block';
                if (manualInp) {
                    manualInp.focus();
                    manualInp.required = true;
                }
                if (infoBox) infoBox.style.display = 'none';
                campos.style.display = 'block';
                badge.style.background = '#dcfce7';
                badge.style.color = '#15803d';
                badge.textContent = '🟢 MANUAL';
                card.style.borderColor = '#3b82f6';
            } else if (selectedVal) {
                // Prevenir seleção duplicada do mesmo posto em slots diferentes
                let duplicado = false;
                document.querySelectorAll('.plantao-posto-select').forEach(outroSel => {
                    if (outroSel !== e.target && outroSel.value && outroSel.value === selectedVal) {
                        duplicado = true;
                    }
                });

                if (duplicado) {
                    alert('Este posto já foi selecionado em outro slot deste relatório!');
                    e.target.value = '';
                    campos.style.display = 'none';
                    if (infoBox) infoBox.style.display = 'none';
                    if (manualWrap) manualWrap.style.display = 'none';
                    badge.style.background = '#f1f5f9';
                    badge.style.color = '#64748b';
                    badge.textContent = 'Vazio / Não Utilizado';
                    card.style.borderColor = '#cbd5e1';
                    atualizarContadorPlantao();
                    return;
                }

                if (manualWrap) manualWrap.style.display = 'none';
                if (manualInp) {
                    manualInp.value = '';
                    manualInp.required = false;
                }

                const opt = e.target.selectedOptions[0];
                const end = decodeURIComponent(opt.dataset.endereco || '');
                const loc = decodeURIComponent(opt.dataset.localidade || '');
                const emp = decodeURIComponent(opt.dataset.empresa || '');
                const orig = decodeURIComponent(opt.dataset.origem || '');

                const endEl = document.getElementById(`info_end_${slot}`);
                const locEl = document.getElementById(`info_loc_${slot}`);
                const empEl = document.getElementById(`info_emp_${slot}`);
                const origEl = document.getElementById(`info_orig_${slot}`);

                if (endEl) endEl.textContent = end || 'Não informado na planilha';
                if (locEl) locEl.textContent = loc || 'Rio de Janeiro';
                if (empEl) empEl.textContent = emp || 'CEDAE';
                if (origEl) origEl.textContent = orig || 'PLANTÃO';

                if (infoBox) infoBox.style.display = 'block';
                campos.style.display = 'block';
                badge.style.background = '#dcfce7';
                badge.style.color = '#15803d';
                badge.textContent = '🟢 PREENCHIDO';
                card.style.borderColor = '#15803d';
            } else {
                if (manualWrap) manualWrap.style.display = 'none';
                if (infoBox) infoBox.style.display = 'none';
                campos.style.display = 'none';
                badge.style.background = '#f1f5f9';
                badge.style.color = '#64748b';
                badge.textContent = 'Vazio / Não Utilizado';
                card.style.borderColor = '#cbd5e1';

                const hora = document.getElementById(`plantao_hora_${slot}`);
                if (hora) hora.value = '';
                const km = document.getElementById(`plantao_km_${slot}`);
                if (km) km.value = '';
            }
            atualizarContadorPlantao();
        });
    });

    document.querySelectorAll('.plantao-posto-nome-manual').forEach(inp => {
        inp.addEventListener('input', () => {
            atualizarContadorPlantao();
        });
    });

    document.querySelectorAll('.plantao-efetivo-radio').forEach(rad => {
        rad.addEventListener('change', (e) => {
            const slot = e.target.dataset.slot;
            const campoFalta = document.getElementById(`campo_falta_${slot}`);
            const faltaInput = document.getElementById(`plantao_falta_${slot}`);
            if (e.target.value === 'NAO') {
                campoFalta.style.display = 'block';
                if (faltaInput) faltaInput.focus();
            } else {
                campoFalta.style.display = 'none';
                if (faltaInput) faltaInput.value = '';
            }
        });
    });

    document.querySelectorAll('.plantao-ocorrencia-radio').forEach(rad => {
        rad.addEventListener('change', (e) => {
            const slot = e.target.dataset.slot;
            const campoOcorr = document.getElementById(`campo_ocorrencia_${slot}`);
            const descInput = document.getElementById(`plantao_ocorrencia_desc_${slot}`);
            const situacaoSel = document.getElementById(`plantao_situacao_${slot}`);
            
            if (e.target.value === 'SIM') {
                campoOcorr.style.display = 'block';
                if (situacaoSel && (situacaoSel.value === 'NORMAL' || situacaoSel.value === 'SEM_ALTERACAO')) {
                    situacaoSel.value = 'COM_OCORRENCIA';
                }
                if (descInput) descInput.focus();
            } else {
                campoOcorr.style.display = 'none';
                if (descInput) descInput.value = '';
                if (situacaoSel && situacaoSel.value === 'COM_OCORRENCIA') {
                    situacaoSel.value = 'NORMAL';
                }
            }
        });
    });

    document.querySelectorAll('.plantao-situacao').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const slot = e.target.dataset.slot;
            const campoMotivo = document.getElementById(`campo_motivo_nao_sup_${slot}`);
            if (e.target.value === 'NAO_SUPERVISIONADO') {
                campoMotivo.style.display = 'block';
            } else {
                campoMotivo.style.display = 'none';
            }
        });
    });

    document.querySelectorAll('.plantao-motivo-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const slot = e.target.dataset.slot;
            const inputOutro = document.getElementById(`plantao_motivo_outro_${slot}`);
            if (e.target.value === 'Outro') {
                inputOutro.style.display = 'block';
                inputOutro.focus();
            } else {
                inputOutro.style.display = 'none';
            }
        });
    });
}

function atualizarContadorPlantao() {
    let preenchidos = 0;
    for (let i = 1; i <= 12; i++) {
        const sel = document.getElementById(`plantao_posto_select_${i}`);
        if (sel && sel.value) {
            if (sel.value === 'MANUAL') {
                const manual = document.getElementById(`posto_nome_manual_${i}`);
                if (manual && manual.value.trim()) preenchidos++;
            } else {
                preenchidos++;
            }
        }
    }
    const badge = document.getElementById('contadorPostosBadge');
    if (badge) {
        badge.textContent = `Plantão: ${preenchidos} de 12 Postos Utilizados (59 disponíveis)`;
    }
}

// Listeners dos slots dos setores regulares
function setupRegularSlotsListeners() {
    document.querySelectorAll('.regular-posto-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const slot = e.target.dataset.slot;
            const campos = document.getElementById(`reg_campos_${slot}`);
            const badge = document.getElementById(`reg_slot_badge_${slot}`);
            const card = document.getElementById(`reg_slot_${slot}`);
            const selectedVal = e.target.value;

            if (selectedVal) {
                // Verificar se o posto já foi selecionado em outro slot para evitar duplicidade
                let duplicado = false;
                document.querySelectorAll('.regular-posto-select').forEach(outroSel => {
                    if (outroSel !== e.target && outroSel.value && outroSel.value === selectedVal) {
                        duplicado = true;
                    }
                });

                if (duplicado) {
                    alert('Este posto já foi selecionado em outro slot deste relatório!');
                    e.target.value = '';
                    campos.style.display = 'none';
                    badge.style.background = '#f1f5f9';
                    badge.style.color = '#64748b';
                    badge.textContent = 'Vazio / Não Utilizado';
                    card.style.borderColor = '#cbd5e1';
                    atualizarContadorRegular();
                    return;
                }

                campos.style.display = 'block';
                badge.style.background = '#dcfce7';
                badge.style.color = '#15803d';
                badge.textContent = '🟢 PREENCHENDO';
                card.style.borderColor = '#3b82f6';
            } else {
                campos.style.display = 'none';
                badge.style.background = '#f1f5f9';
                badge.style.color = '#64748b';
                badge.textContent = 'Vazio / Não Utilizado';
                card.style.borderColor = '#cbd5e1';

                const hora = document.getElementById(`reg_hora_${slot}`);
                if (hora) hora.value = '';
                const km = document.getElementById(`reg_km_${slot}`);
                if (km) km.value = '';
            }
            atualizarContadorRegular();
        });
    });

    document.querySelectorAll('.reg-efetivo-radio').forEach(rad => {
        rad.addEventListener('change', (e) => {
            const slot = e.target.dataset.slot;
            const campoFalta = document.getElementById(`reg_campo_falta_${slot}`);
            const faltaInput = document.getElementById(`reg_falta_${slot}`);
            if (e.target.value === 'NAO') {
                campoFalta.style.display = 'block';
                if (faltaInput) faltaInput.focus();
            } else {
                campoFalta.style.display = 'none';
                if (faltaInput) faltaInput.value = '';
            }
        });
    });

    document.querySelectorAll('.reg-ocorrencia-radio').forEach(rad => {
        rad.addEventListener('change', (e) => {
            const slot = e.target.dataset.slot;
            const campoOcorr = document.getElementById(`reg_campo_ocorrencia_${slot}`);
            const descInput = document.getElementById(`reg_ocorrencia_desc_${slot}`);
            const situacaoSel = document.getElementById(`reg_situacao_${slot}`);
            
            if (e.target.value === 'SIM') {
                campoOcorr.style.display = 'block';
                if (situacaoSel && (situacaoSel.value === 'NORMAL' || situacaoSel.value === 'SEM_ALTERACAO')) {
                    situacaoSel.value = 'COM_OCORRENCIA';
                }
                if (descInput) descInput.focus();
            } else {
                campoOcorr.style.display = 'none';
                if (descInput) descInput.value = '';
                if (situacaoSel && situacaoSel.value === 'COM_OCORRENCIA') {
                    situacaoSel.value = 'NORMAL';
                }
            }
        });
    });

    document.querySelectorAll('.reg-situacao').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const slot = e.target.dataset.slot;
            const campoMotivo = document.getElementById(`reg_campo_motivo_nao_sup_${slot}`);
            if (e.target.value === 'NAO_SUPERVISIONADO') {
                campoMotivo.style.display = 'block';
            } else {
                campoMotivo.style.display = 'none';
            }
        });
    });

    document.querySelectorAll('.reg-motivo-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const slot = e.target.dataset.slot;
            const inputOutro = document.getElementById(`reg_motivo_outro_${slot}`);
            if (e.target.value === 'Outro') {
                inputOutro.style.display = 'block';
                inputOutro.focus();
            } else {
                inputOutro.style.display = 'none';
            }
        });
    });
}

function atualizarContadorRegular() {
    const selects = document.querySelectorAll('.regular-posto-select');
    let preenchidos = 0;
    selects.forEach(s => {
        if (s.value) preenchidos++;
    });
    const badge = document.getElementById('contadorPostosBadge');
    if (badge) {
        badge.textContent = `${preenchidos} de ${selects.length} Postos Utilizados`;
    }
}

// 3. CÁLCULO DINÂMICO DE QUILOMETRAGEM
function setupCalculoKm() {
    const kmIni = document.getElementById('km_inicial');
    const kmFim = document.getElementById('km_final');
    const kmRodado = document.getElementById('km_rodado');
    
    const atualizarKm = () => {
        const ini = parseFloat(kmIni.value) || 0;
        const fim = parseFloat(kmFim.value) || 0;
        if (fim >= ini && fim > 0) {
            kmRodado.value = (fim - ini).toFixed(1) + ' km';
        } else {
            kmRodado.value = '0.0 km';
        }
    };
    
    kmIni.addEventListener('input', atualizarKm);
    kmFim.addEventListener('input', atualizarKm);
    
    document.getElementById('btnTodosNormal')?.addEventListener('click', () => {
        document.querySelectorAll('.plantao-situacao, .reg-situacao').forEach(s => s.value = 'NORMAL');
    });
    
    document.getElementById('btnTodosSemAlteracao')?.addEventListener('click', () => {
        document.querySelectorAll('.plantao-situacao, .reg-situacao').forEach(s => s.value = 'SEM_ALTERACAO');
    });
}

// 4. SUBMISSÃO DO FORMULÁRIO CONSOLIDADO DO EXPEDIENTE
function setupFormSubmit() {
    const form = document.getElementById('formPlantao');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const setorId = document.getElementById('selectSetor').value;
        const supervisorId = document.getElementById('selectSupervisor').value;
        const viaturaVal = document.getElementById('selectViatura').value;
        const dataServico = document.getElementById('data_servico').value;
        const turno = document.getElementById('selectTurno').value;
        const responsavelNome = document.getElementById('responsavel_nome').value;
        
        const kmIni = parseFloat(document.getElementById('km_inicial').value) || 0;
        const kmFim = parseFloat(document.getElementById('km_final').value) || 0;
        
        if (kmFim < kmIni && kmFim > 0) {
            return alert('O KM Final não pode ser menor que o KM Inicial.');
        }

        const isPlantao = document.querySelectorAll('.plantao-posto-card').length > 0;
        const postosSupervisionados = [];
        const ocorrenciasExtra = [];
        let pendenciaValidacao = null;

        if (isPlantao) {
            // Processamento dos 12 slots do Plantão (Seleção oficial dos 59 postos ou Digitação Manual)
            for (let i = 1; i <= 12; i++) {
                const sel = document.getElementById(`plantao_posto_select_${i}`);
                const selVal = sel?.value || '';
                if (!selVal) continue; // Postos em branco não são contabilizados nem salvos!

                let pId = null;
                let nomePosto = '';
                let endPosto = '';
                let locPosto = '';
                let empPosto = '';

                if (selVal === 'MANUAL') {
                    const inpManual = document.getElementById(`posto_nome_manual_${i}`);
                    nomePosto = inpManual?.value?.trim() || '';
                    if (!nomePosto) continue;
                    endPosto = 'Cadastrado manualmente via Fiscalização do Plantão';
                    locPosto = 'Rio de Janeiro';
                    empPosto = 'CEDAE';
                } else {
                    pId = parseInt(selVal);
                    const opt = sel.selectedOptions[0];
                    nomePosto = decodeURIComponent(opt.dataset.nome || '');
                    endPosto = decodeURIComponent(opt.dataset.endereco || '');
                    locPosto = decodeURIComponent(opt.dataset.localidade || '');
                    empPosto = decodeURIComponent(opt.dataset.empresa || '');
                }

                const hora = document.getElementById(`plantao_hora_${i}`)?.value || '';
                const kmVal = document.getElementById(`plantao_km_${i}`)?.value;
                const situacao = document.getElementById(`plantao_situacao_${i}`)?.value || 'NORMAL';
                const efetivoRad = document.querySelector(`input[name="efetivo_slot_${i}"]:checked`)?.value || 'SIM';
                const faltaTxt = document.getElementById(`plantao_falta_${i}`)?.value?.trim() || '';
                const ocorrenciaRad = document.querySelector(`input[name="ocorrencia_slot_${i}"]:checked`)?.value || 'NAO';
                const ocorrenciaTxt = document.getElementById(`plantao_ocorrencia_desc_${i}`)?.value?.trim() || '';
                
                const isSupervisionado = situacao !== 'NAO_SUPERVISIONADO';
                let motivoNaoSup = null;

                if (!isSupervisionado) {
                    const motivoSel = document.getElementById(`plantao_motivo_${i}`)?.value || '';
                    const motivoOutro = document.getElementById(`plantao_motivo_outro_${i}`)?.value?.trim() || '';
                    motivoNaoSup = motivoSel === 'Outro' ? motivoOutro : (motivoSel || motivoOutro);
                    if (!motivoNaoSup) {
                        pendenciaValidacao = `Por favor, informe o MOTIVO / JUSTIFICATIVA DA NÃO FISCALIZAÇÃO no POSTO ${i.toString().padStart(2, '0')} (${nomePosto}).`;
                        document.getElementById(`plantao_slot_${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        break;
                    }
                } else {
                    if (!hora) {
                        pendenciaValidacao = `Por favor, informe a HORA DA FISCALIZAÇÃO no POSTO ${i.toString().padStart(2, '0')} (${nomePosto}).`;
                        document.getElementById(`plantao_hora_${i}`)?.focus();
                        break;
                    }
                    if (kmVal === '' || kmVal === null || isNaN(parseFloat(kmVal))) {
                        pendenciaValidacao = `Por favor, informe o KM NO POSTO no POSTO ${i.toString().padStart(2, '0')} (${nomePosto}).`;
                        document.getElementById(`plantao_km_${i}`)?.focus();
                        break;
                    }
                    if (efetivoRad === 'NAO' && !faltaTxt) {
                        pendenciaValidacao = `Para o POSTO ${i.toString().padStart(2, '0')} (${nomePosto}), o efetivo está incompleto. Informe o campo Falta.`;
                        document.getElementById(`plantao_falta_${i}`)?.focus();
                        break;
                    }
                    if (ocorrenciaRad === 'SIM' && !ocorrenciaTxt) {
                        pendenciaValidacao = `Para o POSTO ${i.toString().padStart(2, '0')} (${nomePosto}), foi indicada ocorrência. Descreva a ocorrência.`;
                        document.getElementById(`plantao_ocorrencia_desc_${i}`)?.focus();
                        break;
                    }
                }

                const kmNum = isSupervisionado ? parseFloat(kmVal) : null;
                const statusFinal = (ocorrenciaRad === 'SIM' && situacao !== 'NAO_SUPERVISIONADO') ? 'COM_OCORRENCIA' : situacao;

                postosSupervisionados.push({
                    posto_id: pId,
                    posto_nome: nomePosto,
                    endereco: endPosto,
                    localidade: locPosto,
                    empresa: empPosto,
                    supervisionado: isSupervisionado ? 1 : 0,
                    status_supervisao: statusFinal,
                    motivo_nao_supervisao: motivoNaoSup,
                    horario_supervisao: isSupervisionado ? hora : '',
                    km_posto: kmNum,
                    efetivo_completo: efetivoRad === 'SIM' ? 1 : 0,
                    falta_efetivo_qtd: efetivoRad === 'NAO' ? faltaTxt : null,
                    tem_ocorrencia: ocorrenciaRad === 'SIM' ? 1 : 0,
                    descricao_ocorrencia: ocorrenciaRad === 'SIM' ? ocorrenciaTxt : null,
                    observacao: ocorrenciaRad === 'SIM' ? ocorrenciaTxt : (efetivoRad === 'NAO' ? `Falta: ${faltaTxt}` : '')
                });

                if (ocorrenciaRad === 'SIM' && ocorrenciaTxt) {
                    ocorrenciasExtra.push({
                        posto_id: pId,
                        posto_nome: nomePosto,
                        tipo_ocorrencia: 'COM_OCORRENCIA',
                        descricao: `[${nomePosto}] ${ocorrenciaTxt}`,
                        providencias_adotadas: 'Registrado pelo fiscal no posto',
                        status: 'resolvido'
                    });
                }
            }

            if (!pendenciaValidacao && postosSupervisionados.length === 0) {
                return alert('Por favor, informe e preencha ao menos um posto fiscalizado neste expediente do Plantão.');
            }

        } else {
            // Processamento dos slots do Setor Regular com lista suspensa
            const regularSelects = document.querySelectorAll('.regular-posto-select');
            for (let i = 1; i <= regularSelects.length; i++) {
                const sel = document.getElementById(`reg_posto_select_${i}`);
                if (!sel || !sel.value) continue; // Postos vazios/não selecionados são ignorados!

                const postoId = parseInt(sel.value);
                const nomePosto = sel.options[sel.selectedIndex]?.textContent || `Posto #${postoId}`;
                const hora = document.getElementById(`reg_hora_${i}`)?.value || '';
                const kmVal = document.getElementById(`reg_km_${i}`)?.value;
                const situacao = document.getElementById(`reg_situacao_${i}`)?.value || 'NORMAL';
                const efetivoRad = document.querySelector(`input[name="reg_efetivo_slot_${i}"]:checked`)?.value || 'SIM';
                const faltaTxt = document.getElementById(`reg_falta_${i}`)?.value?.trim() || '';
                const ocorrenciaRad = document.querySelector(`input[name="reg_ocorrencia_slot_${i}"]:checked`)?.value || 'NAO';
                const ocorrenciaTxt = document.getElementById(`reg_ocorrencia_desc_${i}`)?.value?.trim() || '';
                
                const isSupervisionado = situacao !== 'NAO_SUPERVISIONADO';
                let motivoNaoSup = null;

                if (!isSupervisionado) {
                    const motivoSel = document.getElementById(`reg_motivo_${i}`)?.value || '';
                    const motivoOutro = document.getElementById(`reg_motivo_outro_${i}`)?.value?.trim() || '';
                    motivoNaoSup = motivoSel === 'Outro' ? motivoOutro : motivoSel;
                    if (!motivoNaoSup) {
                        pendenciaValidacao = `Por favor, informe o MOTIVO DA NÃO FISCALIZAÇÃO no POSTO ${i.toString().padStart(2, '0')} (${nomePosto}).`;
                        document.getElementById(`reg_slot_${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        break;
                    }
                } else {
                    if (!hora) {
                        pendenciaValidacao = `Por favor, informe a HORA DA FISCALIZAÇÃO no POSTO ${i.toString().padStart(2, '0')} (${nomePosto}).`;
                        document.getElementById(`reg_hora_${i}`)?.focus();
                        break;
                    }
                    if (kmVal === '' || kmVal === null || isNaN(parseFloat(kmVal))) {
                        pendenciaValidacao = `Por favor, informe o KM NO POSTO no POSTO ${i.toString().padStart(2, '0')} (${nomePosto}).`;
                        document.getElementById(`reg_km_${i}`)?.focus();
                        break;
                    }
                    if (efetivoRad === 'NAO' && !faltaTxt) {
                        pendenciaValidacao = `Para o POSTO ${i.toString().padStart(2, '0')} (${nomePosto}), o efetivo está incompleto. Informe o campo Falta.`;
                        document.getElementById(`reg_falta_${i}`)?.focus();
                        break;
                    }
                    if (ocorrenciaRad === 'SIM' && !ocorrenciaTxt) {
                        pendenciaValidacao = `Para o POSTO ${i.toString().padStart(2, '0')} (${nomePosto}), foi indicada ocorrência. Descreva a ocorrência.`;
                        document.getElementById(`reg_ocorrencia_desc_${i}`)?.focus();
                        break;
                    }
                }

                const kmNum = isSupervisionado ? parseFloat(kmVal) : null;
                const statusFinal = (ocorrenciaRad === 'SIM' && situacao !== 'NAO_SUPERVISIONADO') ? 'COM_OCORRENCIA' : situacao;

                postosSupervisionados.push({
                    posto_id: postoId,
                    supervisionado: isSupervisionado ? 1 : 0,
                    status_supervisao: statusFinal,
                    motivo_nao_supervisao: motivoNaoSup,
                    horario_supervisao: isSupervisionado ? hora : '',
                    km_posto: kmNum,
                    efetivo_completo: efetivoRad === 'SIM' ? 1 : 0,
                    falta_efetivo_qtd: efetivoRad === 'NAO' ? faltaTxt : null,
                    tem_ocorrencia: ocorrenciaRad === 'SIM' ? 1 : 0,
                    descricao_ocorrencia: ocorrenciaRad === 'SIM' ? ocorrenciaTxt : null,
                    observacao: ocorrenciaRad === 'SIM' ? ocorrenciaTxt : (efetivoRad === 'NAO' ? `Falta: ${faltaTxt}` : '')
                });

                if (ocorrenciaRad === 'SIM' && ocorrenciaTxt) {
                    ocorrenciasExtra.push({
                        posto_id: postoId,
                        tipo_ocorrencia: 'COM_OCORRENCIA',
                        descricao: `[${nomePosto}] ${ocorrenciaTxt}`,
                        providencias_adotadas: 'Registrado pelo fiscal no posto',
                        status: 'resolvido'
                    });
                }
            }

            if (!pendenciaValidacao && postosSupervisionados.length === 0) {
                return alert('Por favor, selecione e preencha ao menos um posto fiscalizado neste expediente.');
            }
        }

        if (pendenciaValidacao) {
            return alert(pendenciaValidacao);
        }

        const ocorrenciasGeraisTexto = document.getElementById('ocorrencias_gerais')?.value || '';
        if (ocorrenciasGeraisTexto.trim()) {
            ocorrenciasExtra.push({
                posto_id: null,
                tipo_ocorrencia: 'Geral',
                descricao: ocorrenciasGeraisTexto,
                providencias_adotadas: document.getElementById('providencias_gerais')?.value || 'Registrado',
                status: 'resolvido'
            });
        }

        const payload = {
            setor_id: parseInt(setorId),
            supervisor_id: supervisorId ? parseInt(supervisorId) : null,
            viatura_id: (viaturaVal && viaturaVal !== 'OUTROS') ? parseInt(viaturaVal) : null,
            viatura_outros_texto: viaturaVal === 'OUTROS' ? document.getElementById('viaturaOutrosTexto').value : '',
            data_servico: dataServico,
            turno: turno,
            km_inicial: kmIni,
            km_final: kmFim,
            relatorio_id: relatorioIdAtivoDesk,
            responsavel_nome: responsavelNome,
            observacoes_gerais: ocorrenciasGeraisTexto,
            providencias_gerais: document.getElementById('providencias_gerais')?.value || '',
            pendencias_gerais: document.getElementById('pendencias_gerais')?.value || '',
            postos_supervisionados: postosSupervisionados,
            ocorrencias: ocorrenciasExtra
        };

        const submitBtn = document.getElementById('btnEnviarRelatorio');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando e auditando expediente...';

        try {
            const resposta = await apiPost('/formulario/enviar', payload);
            
            ultimoRelatorioId = resposta.id;
            relatorioIdAtivoDesk = null;
            const bannerDesk = document.getElementById('bannerEmAndamentoDesk');
            if (bannerDesk) bannerDesk.style.display = 'none';

            textoWhatsAppGerado = resposta.texto_whatsapp || '';
            document.getElementById('whatsappPreview').textContent = textoWhatsAppGerado;
            
            form.style.display = 'none';
            document.getElementById('successMessage').style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (err) {
            alert('Falha ao enviar relatório do expediente: ' + err.message);
            submitBtn.disabled = false;
            submitBtn.textContent = '✓ FINALIZAR E ENVIAR RELATÓRIO DO EXPEDIENTE';
        }
    });
}

let ultimoRelatorioId = null;

// 5. COMPARTILHAMENTO WHATSAPP & MODAL DE VISUALIZAÇÃO
function setupWhatsAppHandlers() {
    document.getElementById('btnCopiarWhats')?.addEventListener('click', () => {
        if (!textoWhatsAppGerado) return;
        navigator.clipboard.writeText(textoWhatsAppGerado).then(() => {
            alert('✓ Texto do relatório copiado para a área de transferência! Pronto para colar no WhatsApp.');
        });
    });

    document.getElementById('btnAbrirWhats')?.addEventListener('click', () => {
        if (!textoWhatsAppGerado) return;
        const encoded = encodeURIComponent(textoWhatsAppGerado);
        window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    });

    document.getElementById('btnVerRelatorioEnviado')?.addEventListener('click', async () => {
        if (!ultimoRelatorioId) return;
        await exibirRelatorioModal(ultimoRelatorioId);
    });

    const fechar = () => document.getElementById('modalRelatorioEnviado')?.classList.remove('active');
    document.getElementById('btnFecharModalEnvioTopo')?.addEventListener('click', fechar);
    document.getElementById('btnFecharModalEnvioRodape')?.addEventListener('click', fechar);
    document.getElementById('modalRelatorioEnviado')?.addEventListener('click', (e) => {
        if (e.target.id === 'modalRelatorioEnviado') fechar();
    });

    document.getElementById('btnCopiarWhatsModalEnvio')?.addEventListener('click', () => {
        if (!textoWhatsAppGerado) return;
        navigator.clipboard.writeText(textoWhatsAppGerado).then(() => alert('✓ Relatório copiado para o WhatsApp!'));
    });

    document.getElementById('btnAbrirWhatsModalEnvio')?.addEventListener('click', () => {
        if (!textoWhatsAppGerado) return;
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(textoWhatsAppGerado)}`, '_blank');
    });

    document.getElementById('btnImprimirModalEnvio')?.addEventListener('click', () => {
        window.print();
    });
}

async function exibirRelatorioModal(id) {
    try {
        const r = await apiGet(`/formulario/relatorio/${id}`);
        document.getElementById('modalEnvioTitulo').textContent = `RELATÓRIO CONSOLIDADO DO EXPEDIENTE #${r.id}`;
        document.getElementById('envioSetor').textContent = r.setor_nome;
        document.getElementById('envioData').textContent = formatDate(r.data_servico);
        document.getElementById('envioTurno').textContent = r.turno;
        document.getElementById('envioSupervisor').textContent = r.supervisor_nome || r.responsavel_nome || 'N/A';
        document.getElementById('envioViatura').textContent = `${r.viatura_modelo || r.viatura_outros_texto || 'OUTROS'} (${r.viatura_placa || 'N/A'})`;
        document.getElementById('envioKmIni').textContent = r.km_inicial ?? 0;
        document.getElementById('envioKmFim').textContent = r.km_final ?? 0;
        document.getElementById('envioKmRodado').textContent = (r.km_rodado ?? 0) + ' km';
        document.getElementById('envioObservacoes').textContent = r.observacoes_gerais || 'Nenhuma observação geral.';

        const postosBody = document.getElementById('envioPostosBody');
        postosBody.innerHTML = '';
        (r.postos || []).forEach(p => {
            let badge = '<span class="badge badge-green">NORMAL</span>';
            if (p.supervisionado === 0 || p.status_supervisao === 'NAO_SUPERVISIONADO') {
                badge = `<span class="badge badge-red">NÃO FISCALIZADO</span><br><small style="color:#b91c1c; font-weight:700;">Motivo: ${p.motivo_nao_supervisao || 'Não informado'}</small>`;
            } else if (p.status_supervisao === 'COM_OCORRENCIA') {
                badge = '<span class="badge badge-red">COM OCORRÊNCIA</span>';
            } else if (p.status_supervisao === 'PENDENCIA') {
                badge = '<span class="badge badge-yellow">PENDÊNCIA</span>';
            } else if (p.status_supervisao === 'SEM_ALTERACAO') {
                badge = '<span class="badge" style="background:#64748b; color:#fff;">SEM ALTERAÇÃO</span>';
            }

            const hora = p.horario_supervisao || '-';
            const km = (p.km_posto !== null && p.km_posto !== undefined) ? `${p.km_posto} km` : '-';
            const efetivo = (p.efetivo_completo === 0) 
                ? `<span style="color:#b91c1c; font-weight:700;">FALTA (${p.falta_efetivo_qtd || '1'})</span>`
                : `<span style="color:#15803d; font-weight:700;">COMPLETO</span>`;
            const ocorrencia = (p.tem_ocorrencia === 1 || p.descricao_ocorrencia)
                ? `<span style="color:#b91c1c; font-weight:700;">SIM (${p.descricao_ocorrencia || 'Sim'})</span>`
                : `<span style="color:#475569;">NÃO</span>`;

            postosBody.innerHTML += `
                <tr>
                    <td style="padding:0.6rem 0.8rem; border-bottom:1px solid #e2e8f0;"><strong>${p.posto_nome}</strong></td>
                    <td style="padding:0.6rem 0.8rem; border-bottom:1px solid #e2e8f0;">${hora}</td>
                    <td style="padding:0.6rem 0.8rem; border-bottom:1px solid #e2e8f0;"><strong>${km}</strong></td>
                    <td style="padding:0.6rem 0.8rem; border-bottom:1px solid #e2e8f0; text-align:center;">${badge}</td>
                    <td style="padding:0.6rem 0.8rem; border-bottom:1px solid #e2e8f0; text-align:center;">${efetivo}</td>
                    <td style="padding:0.6rem 0.8rem; border-bottom:1px solid #e2e8f0;">${ocorrencia}</td>
                </tr>
            `;
        });

        const ocBody = document.getElementById('envioOcorrenciasBody');
        if (r.ocorrencias && r.ocorrencias.length > 0) {
            document.getElementById('secaoEnvioOcorrencias').style.display = 'block';
            ocBody.innerHTML = '';
            r.ocorrencias.forEach(oc => {
                ocBody.innerHTML += `<div style="margin-bottom:4px;"><strong>[${oc.posto_nome || 'Geral'}]</strong> ${oc.descricao} &bull; <span style="color:#0369a1;"><em>Providência: ${oc.providencias_adotadas || 'Registrada'}</em></span></div>`;
            });
        } else {
            document.getElementById('secaoEnvioOcorrencias').style.display = 'none';
        }

        document.getElementById('modalRelatorioEnviado').classList.add('active');
    } catch (e) {
        alert('Erro ao carregar detalhes do relatório: ' + e.message);
    }
}

// 6. ETAPA CONFERIR RELATÓRIO DO EXPEDIENTE (DESKTOP)
function setupConferenciaDesktop() {
    const btnConferir = document.getElementById('btnConferirRelatorio');
    const modal = document.getElementById('modalConferenciaDesktop');
    if (!btnConferir || !modal) return;

    const fechar = () => modal.classList.remove('active');
    document.getElementById('btnFecharModalConfTopo')?.addEventListener('click', fechar);
    document.getElementById('btnFecharModalConfRodape')?.addEventListener('click', fechar);
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'modalConferenciaDesktop') fechar();
    });

    btnConferir.addEventListener('click', () => {
        const setorSel = document.getElementById('selectSetor');
        if (!setorSel || !setorSel.value) {
            alert('Por favor, selecione o setor operacional antes de conferir o relatório.');
            setorSel?.focus();
            return;
        }

        const supSel = document.getElementById('selectSupervisor');
        const vtrSel = document.getElementById('selectViatura');
        const dataServ = document.getElementById('data_servico')?.value || '';
        const turno = document.getElementById('selectTurno')?.value || '';
        const kmIni = document.getElementById('km_inicial')?.value || '0';
        const kmFim = document.getElementById('km_final')?.value || '0';
        const kmRod = document.getElementById('km_rodado')?.value || '0.0 km';

        document.getElementById('confSetorDesk').textContent = setorSel.options[setorSel.selectedIndex]?.text || '-';
        document.getElementById('confDataDesk').textContent = dataServ;
        document.getElementById('confTurnoDesk').textContent = turno;
        document.getElementById('confSupervisorDesk').textContent = supSel?.options[supSel.selectedIndex]?.text || document.getElementById('responsavel_nome')?.value || '-';
        document.getElementById('confViaturaDesk').textContent = vtrSel?.options[vtrSel.selectedIndex]?.text || '-';
        document.getElementById('confKmIniDesk').textContent = kmIni;
        document.getElementById('confKmFimDesk').textContent = kmFim;
        document.getElementById('confKmRodadoDesk').textContent = kmRod;

        const isPlantao = document.querySelectorAll('.plantao-posto-card').length > 0;
        let postosConferidos = [];

        if (isPlantao) {
            for (let i = 1; i <= 12; i++) {
                const sel = document.getElementById(`plantao_posto_select_${i}`);
                if (!sel || !sel.value) continue;

                let nome = '';
                if (sel.value === 'MANUAL') {
                    nome = document.getElementById(`posto_nome_manual_${i}`)?.value.trim() || `Posto Manual ${i}`;
                } else {
                    nome = sel.selectedOptions[0]?.text || `Posto ${i}`;
                }

                const hora = document.getElementById(`plantao_hora_${i}`)?.value || '';
                const km = document.getElementById(`plantao_km_${i}`)?.value || '';
                const situacao = document.getElementById(`plantao_situacao_${i}`)?.value || 'NORMAL';
                const ocorrencia = document.querySelector(`input[name="ocorrencia_slot_${i}"]:checked`)?.value || 'NAO';
                const motivoNao = document.getElementById(`plantao_motivo_${i}`)?.value || '';

                postosConferidos.push({
                    nome, hora, km, situacao, ocorrencia, motivoNao
                });
            }
        } else {
            const selects = document.querySelectorAll('.regular-posto-select');
            for (let i = 1; i <= selects.length; i++) {
                const sel = document.getElementById(`reg_posto_select_${i}`);
                if (!sel || !sel.value) continue;

                const nome = sel.selectedOptions[0]?.text || `Posto ${i}`;
                const hora = document.getElementById(`reg_hora_${i}`)?.value || '';
                const km = document.getElementById(`reg_km_${i}`)?.value || '';
                const situacao = document.getElementById(`reg_situacao_${i}`)?.value || 'NORMAL';
                const ocorrencia = document.querySelector(`input[name="reg_ocorrencia_slot_${i}"]:checked`)?.value || 'NAO';
                const motivoNao = document.getElementById(`reg_motivo_${i}`)?.value || '';

                postosConferidos.push({
                    nome, hora, km, situacao, ocorrencia, motivoNao
                });
            }
        }

        if (postosConferidos.length === 0) {
            alert('Nenhum posto foi preenchido ainda. Selecione e avalie os postos antes de conferir.');
            return;
        }

        let sup = 0, pend = 0, nao = 0;
        const listaDiv = document.getElementById('confDeskListaPostos');
        listaDiv.innerHTML = '';

        postosConferidos.forEach(p => {
            const isNao = (p.situacao === 'NAO_SUPERVISIONADO');
            let icone = '✓';
            let cor = '#15803d';
            let desc = p.situacao;

            if (isNao) {
                nao++;
                icone = '✕';
                cor = '#b91c1c';
                desc = `Não Fiscalizado: ${p.motivoNao || 'Sem justificativa'}`;
            } else {
                sup++;
                if (p.situacao === 'PENDENCIA') {
                    pend++;
                    icone = '🟡';
                    cor = '#b45309';
                } else if (p.ocorrencia === 'SIM' || p.situacao === 'COM_OCORRENCIA') {
                    icone = '⚠️';
                    cor = '#b91c1c';
                    desc = 'Com Ocorrência';
                }
            }

            listaDiv.innerHTML += `
                <div style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
                    <div>
                        <strong style="color: ${cor};">${icone} ${p.nome}</strong>
                        <div style="font-size: 0.75rem; color: #64748b;">${desc}</div>
                    </div>
                    <div style="text-align: right; color: #334155; font-size: 0.8rem;">
                        ${p.hora ? `🕒 ${p.hora}` : ''} ${p.km ? ` &bull; 🚗 KM ${p.km}` : ''}
                    </div>
                </div>
            `;
        });

        document.getElementById('confDeskTotal').textContent = postosConferidos.length;
        document.getElementById('confDeskSup').textContent = sup;
        document.getElementById('confDeskPend').textContent = pend;
        document.getElementById('confDeskNao').textContent = nao;

        const alerta = document.getElementById('confDeskAlertaPend');
        if (pend > 0 || nao > 0) {
            alerta.style.display = 'block';
        } else {
            alerta.style.display = 'none';
        }

        modal.classList.add('active');
    });

    document.getElementById('btnConfirmarEnvioPelaConfDesk')?.addEventListener('click', () => {
        modal.classList.remove('active');
        const form = document.getElementById('formPlantao');
        if (form.requestSubmit) {
            form.requestSubmit();
        } else {
            document.getElementById('btnEnviarRelatorio')?.click();
        }
    });
}

// 6. SALVAMENTO PROGRESSIVO E RECUPERAÇÃO DO EXPEDIENTE (DESKTOP)
function setupSalvarProgressoDesktop() {
    const handler = async (btn) => {
        const txt = btn.textContent;
        btn.disabled = true;
        btn.textContent = '💾 SALVANDO NO SISTEMA CCO...';
        try {
            await salvarProgressoDesktop(false);
        } finally {
            btn.disabled = false;
            btn.textContent = txt;
        }
    };

    document.getElementById('btnSalvarProgressoDesk')?.addEventListener('click', function() {
        handler(this);
    });

    document.getElementById('btnSalvarProgressoDeskTop')?.addEventListener('click', function() {
        handler(this);
    });

    document.getElementById('data_servico')?.addEventListener('change', () => {
        checarERecuperarRelatorioEmAndamentoDesk();
    });

    document.getElementById('selectTurno')?.addEventListener('change', () => {
        checarERecuperarRelatorioEmAndamentoDesk();
    });

    document.getElementById('selectSupervisor')?.addEventListener('change', () => {
        checarERecuperarRelatorioEmAndamentoDesk();
    });
}

async function salvarProgressoDesktop(silencioso = false) {
    const setorId = document.getElementById('selectSetor')?.value;
    if (!setorId) {
        if (!silencioso) alert('Por favor, selecione primeiro o setor operacional.');
        return false;
    }

    const dataServico = document.getElementById('data_servico')?.value;
    const turno = document.getElementById('selectTurno')?.value;
    if (!dataServico || !turno) {
        if (!silencioso) alert('Por favor, informe a Data do Serviço e o Turno.');
        return false;
    }

    const supervisorId = document.getElementById('selectSupervisor')?.value;
    const viaturaVal = document.getElementById('selectViatura')?.value;
    const responsavelNome = document.getElementById('responsavel_nome')?.value || '';
    const kmIni = parseFloat(document.getElementById('km_inicial')?.value) || 0;
    const kmFim = parseFloat(document.getElementById('km_final')?.value) || 0;

    const isPlantao = document.querySelectorAll('.plantao-posto-card').length > 0;
    const postosSupervisionados = [];
    const ocorrenciasExtra = [];

    if (isPlantao) {
        for (let i = 1; i <= 12; i++) {
            const sel = document.getElementById(`plantao_posto_select_${i}`);
            const selVal = sel?.value || '';
            if (!selVal) continue;

            let pId = null;
            let nomePosto = '';
            let endPosto = '';
            let locPosto = '';
            let empPosto = '';

            if (selVal === 'MANUAL') {
                const inpManual = document.getElementById(`posto_nome_manual_${i}`);
                nomePosto = inpManual?.value?.trim() || '';
                if (!nomePosto) continue;
                endPosto = 'Cadastrado manualmente via Fiscalização do Plantão';
                locPosto = 'Rio de Janeiro';
                empPosto = 'CEDAE';
            } else {
                pId = parseInt(selVal);
                const opt = sel.selectedOptions[0];
                nomePosto = decodeURIComponent(opt?.dataset.nome || '');
                endPosto = decodeURIComponent(opt?.dataset.endereco || '');
                locPosto = decodeURIComponent(opt?.dataset.localidade || '');
                empPosto = decodeURIComponent(opt?.dataset.empresa || '');
            }

            const hora = document.getElementById(`plantao_hora_${i}`)?.value || '';
            const kmVal = document.getElementById(`plantao_km_${i}`)?.value;
            const situacao = document.getElementById(`plantao_situacao_${i}`)?.value || 'NORMAL';
            const efetivoRad = document.querySelector(`input[name="efetivo_slot_${i}"]:checked`)?.value || 'SIM';
            const faltaTxt = document.getElementById(`plantao_falta_${i}`)?.value?.trim() || '';
            const ocorrenciaRad = document.querySelector(`input[name="ocorrencia_slot_${i}"]:checked`)?.value || 'NAO';
            const ocorrenciaTxt = document.getElementById(`plantao_ocorrencia_desc_${i}`)?.value?.trim() || '';

            const isSupervisionado = (situacao !== 'NAO_SUPERVISIONADO');
            let motivoNaoSup = null;
            if (!isSupervisionado) {
                const motivoSel = document.getElementById(`plantao_motivo_${i}`)?.value || '';
                const motivoOutro = document.getElementById(`plantao_motivo_outro_${i}`)?.value?.trim() || '';
                motivoNaoSup = motivoSel === 'Outro' ? motivoOutro : (motivoSel || motivoOutro);
            }

            postosSupervisionados.push({
                slot: i,
                posto_id: pId,
                posto_nome: nomePosto,
                endereco: endPosto,
                localidade: locPosto,
                empresa: empPosto,
                supervisionado: isSupervisionado ? 1 : 0,
                status_supervisao: (ocorrenciaRad === 'SIM' && situacao !== 'NAO_SUPERVISIONADO') ? 'COM_OCORRENCIA' : situacao,
                motivo_nao_supervisao: motivoNaoSup,
                horario_supervisao: isSupervisionado ? hora : '',
                km_posto: (isSupervisionado && kmVal !== '' && kmVal !== undefined && kmVal !== null) ? parseFloat(kmVal) : null,
                efetivo_completo: efetivoRad === 'SIM' ? 1 : 0,
                falta_efetivo_qtd: efetivoRad === 'NAO' ? faltaTxt : null,
                tem_ocorrencia: ocorrenciaRad === 'SIM' ? 1 : 0,
                descricao_ocorrencia: ocorrenciaRad === 'SIM' ? ocorrenciaTxt : null,
                observacao: ocorrenciaRad === 'SIM' ? ocorrenciaTxt : (efetivoRad === 'NAO' ? ('Falta: ' + faltaTxt) : '')
            });
        }
    } else {
        const cards = document.querySelectorAll('.regular-posto-card');
        cards.forEach(card => {
            const slot = card.dataset.slot;
            const sel = document.getElementById(`reg_posto_select_${slot}`);
            const pIdVal = sel?.value;
            if (!pIdVal) return;

            const pId = parseInt(pIdVal);
            const nomePosto = sel.selectedOptions[0]?.textContent || `Posto #${pId}`;
            const hora = document.getElementById(`reg_hora_${slot}`)?.value || '';
            const kmVal = document.getElementById(`reg_km_${slot}`)?.value;
            const situacao = document.getElementById(`reg_situacao_${slot}`)?.value || 'NORMAL';
            const efetivoRad = document.querySelector(`input[name="reg_efetivo_slot_${slot}"]:checked`)?.value || 'SIM';
            const faltaTxt = document.getElementById(`reg_falta_${slot}`)?.value?.trim() || '';
            const ocorrenciaRad = document.querySelector(`input[name="reg_ocorrencia_slot_${slot}"]:checked`)?.value || 'NAO';
            const ocorrenciaTxt = document.getElementById(`reg_ocorrencia_desc_${slot}`)?.value?.trim() || '';

            const isSupervisionado = (situacao !== 'NAO_SUPERVISIONADO');
            let motivoNaoSup = null;
            if (!isSupervisionado) {
                const motivoSel = document.getElementById(`reg_motivo_${slot}`)?.value || '';
                const motivoOutro = document.getElementById(`reg_motivo_outro_${slot}`)?.value?.trim() || '';
                motivoNaoSup = motivoSel === 'Outro' ? motivoOutro : (motivoSel || motivoOutro);
            }

            postosSupervisionados.push({
                slot: parseInt(slot),
                posto_id: pId,
                posto_nome: nomePosto,
                supervisionado: isSupervisionado ? 1 : 0,
                status_supervisao: (ocorrenciaRad === 'SIM' && situacao !== 'NAO_SUPERVISIONADO') ? 'COM_OCORRENCIA' : situacao,
                motivo_nao_supervisao: motivoNaoSup,
                horario_supervisao: isSupervisionado ? hora : '',
                km_posto: (isSupervisionado && kmVal !== '' && kmVal !== undefined && kmVal !== null) ? parseFloat(kmVal) : null,
                efetivo_completo: efetivoRad === 'SIM' ? 1 : 0,
                falta_efetivo_qtd: efetivoRad === 'NAO' ? faltaTxt : null,
                tem_ocorrencia: ocorrenciaRad === 'SIM' ? 1 : 0,
                descricao_ocorrencia: ocorrenciaRad === 'SIM' ? ocorrenciaTxt : null,
                observacao: ocorrenciaRad === 'SIM' ? ocorrenciaTxt : (efetivoRad === 'NAO' ? ('Falta: ' + faltaTxt) : '')
            });
        });
    }

    const ocorrenciasGeraisTexto = document.getElementById('ocorrencias_gerais')?.value || '';
    if (ocorrenciasGeraisTexto.trim()) {
        ocorrenciasExtra.push({
            posto_id: null,
            tipo_ocorrencia: 'Geral',
            descricao: ocorrenciasGeraisTexto,
            providencias_adotadas: document.getElementById('providencias_gerais')?.value || 'Registrado',
            status: 'resolvido'
        });
    }

    const payload = {
        relatorio_id: relatorioIdAtivoDesk,
        client_uuid: 'desk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
        setor_id: parseInt(setorId),
        supervisor_id: supervisorId ? parseInt(supervisorId) : null,
        viatura_id: (viaturaVal && viaturaVal !== 'OUTROS') ? parseInt(viaturaVal) : null,
        viatura_outros_texto: viaturaVal === 'OUTROS' ? document.getElementById('viaturaOutrosTexto')?.value : '',
        data_servico: dataServico,
        turno: turno,
        km_inicial: kmIni,
        km_final: kmFim,
        responsavel_nome: responsavelNome,
        observacoes_gerais: ocorrenciasGeraisTexto,
        providencias_gerais: document.getElementById('providencias_gerais')?.value || '',
        pendencias_gerais: document.getElementById('pendencias_gerais')?.value || '',
        postos_supervisionados: postosSupervisionados,
        ocorrencias: ocorrenciasExtra
    };

    try {
        const resposta = await apiPost('/formulario/salvar', payload);
        relatorioIdAtivoDesk = resposta.id;

        const banner = document.getElementById('bannerEmAndamentoDesk');
        const bannerTexto = document.getElementById('bannerEmAndamentoTextoDesk');
        if (banner && bannerTexto) {
            banner.style.display = 'flex';
            bannerTexto.innerHTML = `🟡 <strong>RELATÓRIO EM PREENCHIMENTO (Nº ${resposta.id}):</strong> ${postosSupervisionados.length} posto(s) gravado(s) no CCO.`;
        }

        if (!silencioso) {
            const detalhe = postosSupervisionados.length > 0 
                ? `${postosSupervisionados.length} posto(s) registrado(s)` 
                : 'Início do expediente (dados gerais) gravado';
            alert(`✓ PROGRESSO SALVO COM SUCESSO NO CCO!\n\nRelatório nº ${resposta.id} mantido em preenchimento (Status: 🟡 EM PREENCHIMENTO).\n${detalhe}.\n\nVocê pode continuar preenchendo os postos a qualquer momento.`);
        }
        return true;
    } catch (err) {
        console.warn('Erro ao salvar progresso desktop:', err);
        if (!silencioso) {
            alert('Falha ao salvar progresso no CCO: ' + err.message);
        }
        return false;
    }
}

async function checarERecuperarRelatorioEmAndamentoDesk() {
    const setorId = document.getElementById('selectSetor')?.value;
    const dataServico = document.getElementById('data_servico')?.value;
    const turno = document.getElementById('selectTurno')?.value;
    const supId = document.getElementById('selectSupervisor')?.value;

    const banner = document.getElementById('bannerEmAndamentoDesk');
    const bannerTexto = document.getElementById('bannerEmAndamentoTextoDesk');

    if (!setorId || !dataServico || !turno) {
        if (banner) banner.style.display = 'none';
        return;
    }

    try {
        let url = `/formulario/em-andamento?setor_id=${setorId}&data_servico=${dataServico}&turno=${turno}`;
        if (supId) url += `&supervisor_id=${supId}`;

        const data = await apiGet(url);
        if (data && data.tem_relatorio && data.relatorio) {
            const r = data.relatorio;
            relatorioIdAtivoDesk = r.id;

            if (r.viatura_id) {
                const vSel = document.getElementById('selectViatura');
                if (vSel) {
                    vSel.value = r.viatura_id;
                    vSel.dispatchEvent(new Event('change'));
                }
            } else if (r.viatura_outros_texto) {
                const vSel = document.getElementById('selectViatura');
                if (vSel) {
                    vSel.value = 'OUTROS';
                    vSel.dispatchEvent(new Event('change'));
                    const inpOutros = document.getElementById('viaturaOutrosTexto');
                    if (inpOutros) inpOutros.value = r.viatura_outros_texto;
                }
            }

            if (r.km_inicial !== null && r.km_inicial !== undefined) {
                document.getElementById('km_inicial').value = r.km_inicial;
            }
            if (r.km_final !== null && r.km_final !== undefined && r.km_final > 0) {
                document.getElementById('km_final').value = r.km_final;
            }
            if (r.responsavel_nome) {
                document.getElementById('responsavel_nome').value = r.responsavel_nome;
            }
            if (r.observacoes_gerais) {
                document.getElementById('ocorrencias_gerais').value = r.observacoes_gerais;
            }
            if (r.providencias_gerais) {
                document.getElementById('providencias_gerais').value = r.providencias_gerais;
            }
            if (r.pendencias_gerais) {
                document.getElementById('pendencias_gerais').value = r.pendencias_gerais;
            }

            if (data.postos && data.postos.length > 0) {
                preencherCardsDesktopComDados(data.postos);
            }

            document.getElementById('km_inicial')?.dispatchEvent(new Event('input'));

            if (banner && bannerTexto) {
                banner.style.display = 'flex';
                bannerTexto.innerHTML = `🟡 <strong>RELATÓRIO EM PREENCHIMENTO (Nº ${r.id}) RECUPERADO:</strong> ${data.postos ? data.postos.length : 0} postos carregados. Continue preenchendo os postos pendentes.`;
            }
        } else {
            relatorioIdAtivoDesk = null;
            if (banner) banner.style.display = 'none';
        }
    } catch (err) {
        console.warn('Erro ao checar relatório em andamento desk:', err);
    }
}

function preencherCardsDesktopComDados(postosSalvos) {
    if (!postosSalvos || !Array.isArray(postosSalvos)) return;
    const isPlantao = document.querySelectorAll('.plantao-posto-card').length > 0;

    if (isPlantao) {
        postosSalvos.forEach((p, idx) => {
            const slot = p.slot || (idx + 1);
            if (slot > 12) return;
            const sel = document.getElementById(`plantao_posto_select_${slot}`);
            if (!sel) return;

            if (p.posto_id) {
                sel.value = p.posto_id;
            } else if (p.nome_posto_digitado || p.posto_nome) {
                sel.value = 'MANUAL';
                const inpManual = document.getElementById(`posto_nome_manual_${slot}`);
                if (inpManual) inpManual.value = p.nome_posto_digitado || p.posto_nome || '';
            }
            sel.dispatchEvent(new Event('change'));

            const hora = document.getElementById(`plantao_hora_${slot}`);
            if (hora && p.horario_supervisao) hora.value = p.horario_supervisao;

            const km = document.getElementById(`plantao_km_${slot}`);
            if (km && p.km_posto !== null && p.km_posto !== undefined) km.value = p.km_posto;

            const sit = document.getElementById(`plantao_situacao_${slot}`);
            if (sit && p.status_supervisao) {
                sit.value = p.status_supervisao;
                sit.dispatchEvent(new Event('change'));
            }

            const efComp = (p.efetivo_completo === 1 || p.efetivo_completo === '1' || p.efetivo_completo === true);
            const radEf = document.querySelector(`input[name="efetivo_slot_${slot}"][value="${efComp ? 'SIM' : 'NAO'}"]`);
            if (radEf) {
                radEf.checked = true;
                radEf.dispatchEvent(new Event('change'));
            }
            const falta = document.getElementById(`plantao_falta_${slot}`);
            if (falta && p.falta_efetivo_qtd) falta.value = p.falta_efetivo_qtd;

            const temOc = (p.tem_ocorrencia === 1 || p.tem_ocorrencia === '1' || p.tem_ocorrencia === true || p.status_supervisao === 'COM_OCORRENCIA');
            const radOc = document.querySelector(`input[name="ocorrencia_slot_${slot}"][value="${temOc ? 'SIM' : 'NAO'}"]`);
            if (radOc) {
                radOc.checked = true;
                radOc.dispatchEvent(new Event('change'));
            }
            const descOc = document.getElementById(`plantao_ocorrencia_desc_${slot}`);
            if (descOc && (p.descricao_ocorrencia || p.observacao)) descOc.value = p.descricao_ocorrencia || p.observacao;

            if (p.motivo_nao_supervisao) {
                const motSel = document.getElementById(`plantao_motivo_${slot}`);
                const motOutro = document.getElementById(`plantao_motivo_outro_${slot}`);
                if (motSel) {
                    motSel.value = p.motivo_nao_supervisao;
                    if (!motSel.value) {
                        motSel.value = 'Outro';
                        if (motOutro) motOutro.value = p.motivo_nao_supervisao;
                    }
                }
            }
        });
    } else {
        postosSalvos.forEach((p, idx) => {
            let targetSlot = p.slot;
            if (!targetSlot) {
                for (let s = 1; s <= postosDoSetor.length; s++) {
                    const sel = document.getElementById(`reg_posto_select_${s}`);
                    if (sel && parseInt(sel.value) === parseInt(p.posto_id)) {
                        targetSlot = s;
                        break;
                    }
                }
            }
            if (!targetSlot) targetSlot = idx + 1;

            const sel = document.getElementById(`reg_posto_select_${targetSlot}`);
            if (sel) {
                sel.value = p.posto_id;
                sel.dispatchEvent(new Event('change'));
            }

            const hora = document.getElementById(`reg_hora_${targetSlot}`);
            if (hora && p.horario_supervisao) hora.value = p.horario_supervisao;

            const km = document.getElementById(`reg_km_${targetSlot}`);
            if (km && p.km_posto !== null && p.km_posto !== undefined) km.value = p.km_posto;

            const sit = document.getElementById(`reg_situacao_${targetSlot}`);
            if (sit && p.status_supervisao) {
                sit.value = p.status_supervisao;
                sit.dispatchEvent(new Event('change'));
            }

            const efComp = (p.efetivo_completo === 1 || p.efetivo_completo === '1' || p.efetivo_completo === true);
            const radEf = document.querySelector(`input[name="reg_efetivo_slot_${targetSlot}"][value="${efComp ? 'SIM' : 'NAO'}"]`);
            if (radEf) {
                radEf.checked = true;
                radEf.dispatchEvent(new Event('change'));
            }
            const falta = document.getElementById(`reg_falta_${targetSlot}`);
            if (falta && p.falta_efetivo_qtd) falta.value = p.falta_efetivo_qtd;

            const temOc = (p.tem_ocorrencia === 1 || p.tem_ocorrencia === '1' || p.tem_ocorrencia === true || p.status_supervisao === 'COM_OCORRENCIA');
            const radOc = document.querySelector(`input[name="reg_ocorrencia_slot_${targetSlot}"][value="${temOc ? 'SIM' : 'NAO'}"]`);
            if (radOc) {
                radOc.checked = true;
                radOc.dispatchEvent(new Event('change'));
            }
            const descOc = document.getElementById(`reg_ocorrencia_desc_${targetSlot}`);
            if (descOc && (p.descricao_ocorrencia || p.observacao)) descOc.value = p.descricao_ocorrencia || p.observacao;

            if (p.motivo_nao_supervisao) {
                const motSel = document.getElementById(`reg_motivo_${targetSlot}`);
                const motOutro = document.getElementById(`reg_motivo_outro_${targetSlot}`);
                if (motSel) {
                    motSel.value = p.motivo_nao_supervisao;
                    if (!motSel.value) {
                        motSel.value = 'Outro';
                        if (motOutro) motOutro.value = p.motivo_nao_supervisao;
                    }
                }
            }
        });
    }
}
