/**
 * CCO - Centro de Controle Operacional
 * Script Principal de Integração e Orquestração
 * 
 * Este arquivo gerencia os menus do Google Sheets, acionadores (triggers)
 * e o fluxo principal de criação e sincronização de formulários e planilhas.
 */

/**
 * Função executada automaticamente ao abrir a planilha vinculada.
 * Cria o menu personalizado "CCO Operacional".
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('CCO Operacional')
    .addItem('📊 Estruturar Planilha CCO', 'menuCriarPlanilha')
    .addSeparator()
    .addItem('📝 Criar Formulários Google', 'menuCriarForms')
    .addItem('🔄 Atualizar Opções dos Formulários', 'menuAtualizarForms')
    .addSeparator()
    .addItem('⚡ Configurar Triggers Automáticos', 'menuConfigurarTriggers')
    .addSeparator()
    .addItem('✉️ Testar Notificação por E-mail', 'menuTestarEmail')
    .addItem('🌐 Testar Conexão Webhook', 'menuTestarWebhook')
    .addSeparator()
    .addItem('ℹ️ Sobre o Sistema CCO', 'menuSobre')
    .addToUi();
}

/**
 * Menu: Estruturar a planilha com todas as abas e cabeçalhos padrão.
 */
function menuCriarPlanilha() {
  const ui = SpreadsheetApp.getUi();
  const resposta = ui.alert(
    'Estruturar Planilha CCO',
    'Esta ação criará e formatará todas as abas operacionais padrão (SETORES, SUPERVISORES, VIATURAS, POSTOS, PLANTÕES, FISCALIZAÇÕES, AUDITORIA 72H, OCORRÊNCIAS, REGISTRO DE LINKS e PAINEL GERAL).\n\nDeseja continuar?',
    ui.ButtonSet.YES_NO
  );

  if (resposta === ui.Button.YES) {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      criarPlanilha(ss);
      ui.alert('Sucesso', 'Planilha CCO estruturada com sucesso!', ui.ButtonSet.OK);
    } catch (error) {
      Logger.log('Erro ao estruturar planilha: ' + error.message);
      ui.alert('Erro', 'Falha ao estruturar planilha: ' + error.message, ui.ButtonSet.OK);
    }
  }
}

/**
 * Menu: Cria formulários do Google para todos os setores configurados.
 */
function menuCriarForms() {
  const ui = SpreadsheetApp.getUi();
  const resposta = ui.alert(
    'Criação de Formulários',
    'Serão criados os formulários de supervisão para todos os setores cadastrados no CCO_CONFIG.\n\nOs links serão salvos na aba "REGISTRO DE LINKS". Deseja prosseguir?',
    ui.ButtonSet.YES_NO
  );

  if (resposta === ui.Button.YES) {
    try {
      const resultados = criarTodosForms();
      let mensagem = 'Formulários criados com sucesso:\n\n';
      resultados.forEach(item => {
        mensagem += `• ${item.setorNome}: ${item.url}\n`;
      });
      ui.alert('Formulários Criados', mensagem, ui.ButtonSet.OK);
    } catch (error) {
      Logger.log('Erro ao criar formulários: ' + error.message);
      ui.alert('Erro', 'Falha ao criar formulários: ' + error.message, ui.ButtonSet.OK);
    }
  }
}

/**
 * Menu: Atualiza perguntas e opções dos formulários já existentes.
 */
function menuAtualizarForms() {
  const ui = SpreadsheetApp.getUi();
  try {
    const setores = Object.keys(CCO_CONFIG.SETORES);
    let atualizados = 0;
    
    setores.forEach(setorKey => {
      const formId = obterFormIdPorSetor(setorKey);
      if (formId) {
        atualizarFormulario(setorKey, formId);
        atualizados++;
      }
    });

    if (atualizados > 0) {
      ui.alert('Sucesso', `${atualizados} formulário(s) atualizado(s) com base na configuração atual.`, ui.ButtonSet.OK);
    } else {
      ui.alert('Aviso', 'Nenhum formulário vinculado encontrado para atualização. Crie os formulários primeiro.', ui.ButtonSet.OK);
    }
  } catch (error) {
    Logger.log('Erro ao atualizar formulários: ' + error.message);
    ui.alert('Erro', 'Falha ao atualizar formulários: ' + error.message, ui.ButtonSet.OK);
  }
}

/**
 * Menu: Configura os acionadores (triggers) para disparo no envio de formulários.
 */
function menuConfigurarTriggers() {
  const ui = SpreadsheetApp.getUi();
  try {
    setupTriggers();
    ui.alert(
      'Triggers Configurados',
      'O gatilho de envio de respostas (onFormSubmit) foi configurado com sucesso para esta planilha.\n\nSempre que um formulário for respondido, os dados serão encaminhados ao backend CCO e uma notificação por e-mail será enviada.',
      ui.ButtonSet.OK
    );
  } catch (error) {
    Logger.log('Erro ao configurar triggers: ' + error.message);
    ui.alert('Erro', 'Falha ao configurar triggers: ' + error.message, ui.ButtonSet.OK);
  }
}

/**
 * Menu: Teste de disparo de e-mail formatado.
 */
function menuTestarEmail() {
  const ui = SpreadsheetApp.getUi();
  try {
    const dadosTeste = {
      setorId: 1,
      setorNome: 'ACARI/TINGUÁ',
      dataPlantao: Utilities.formatDate(new Date(), 'GMT-3', 'dd/MM/yyyy'),
      supervisores: ['ALEX — Mat. 1695', 'LAURINDO — Mat. 1691'],
      viatura: 'CHEVROLET S-10 — TTU2F83',
      kmInicial: 45200,
      kmFinal: 45385,
      kmRodado: 185,
      emailResponsavel: Session.getActiveUser().getEmail() || 'operador@cco.gov.br',
      timestamp: Utilities.formatDate(new Date(), 'GMT-3', 'dd/MM/yyyy HH:mm:ss'),
      ocorrencias: 'Teste de envio de e-mail automatizado pelo sistema CCO. Todos os postos operando dentro dos parâmetros de segurança.',
      confirmacao: true,
      fiscalizacoes: [
        { postoNome: 'BARRELÃO', status: 'Efetivo Completo', situacao: 'Normal' },
        { postoNome: 'BOA ESPERANÇA', status: 'Efetivo Completo', situacao: 'Normal' },
        { postoNome: 'ETA JAPERI', status: 'Falta de Efetivo', situacao: 'Atenção — 01 vigilante ausente' },
        { postoNome: 'REPRESA DE XERÉM', status: 'Não Fiscalizado', situacao: 'Inacessível por chuva forte' }
      ]
    };

    enviarRelatorioEmail(dadosTeste);
    ui.alert('Sucesso', `E-mail de teste enviado para: ${CCO_CONFIG.EMAIL_DESTINO}`, ui.ButtonSet.OK);
  } catch (error) {
    Logger.log('Erro ao enviar e-mail de teste: ' + error.message);
    ui.alert('Erro', 'Falha ao enviar e-mail de teste: ' + error.message, ui.ButtonSet.OK);
  }
}

/**
 * Menu: Teste de conexão com o Webhook backend CCO.
 */
function menuTestarWebhook() {
  const ui = SpreadsheetApp.getUi();
  try {
    const payloadTeste = {
      tipo: 'PING_TESTE',
      timestamp: new Date().toISOString(),
      mensagem: 'Teste de integridade e conectividade entre Google Apps Script e CCO Backend.'
    };

    const resultado = sendWebhook(payloadTeste);
    if (resultado && resultado.sucesso) {
      ui.alert('Webhook Conectado', `Sucesso ao comunicar com ${CCO_CONFIG.WEBHOOK_URL}!\nStatus: ${resultado.statusCode}`, ui.ButtonSet.OK);
    } else {
      ui.alert('Alerta Webhook', `Não foi possível obter resposta 200 do Webhook.\nDetalhes: ${JSON.stringify(resultado)}`, ui.ButtonSet.OK);
    }
  } catch (error) {
    Logger.log('Erro no teste de webhook: ' + error.message);
    ui.alert('Erro no Webhook', 'Falha ao contatar webhook: ' + error.message + '\n\nCertifique-se de que o backend CCO está rodando e acessível na URL configurada.', ui.ButtonSet.OK);
  }
}

/**
 * Menu: Informações sobre o CCO.
 */
function menuSobre() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Sobre o CCO - Centro de Controle Operacional',
    'Sistema de Gestão e Fiscalização Operacional de Postos de Segurança.\n\nVersão Apps Script: 2.0.0\nDestino de Notificações: ' + CCO_CONFIG.EMAIL_DESTINO + '\nWebhook: ' + CCO_CONFIG.WEBHOOK_URL,
    ui.ButtonSet.OK
  );
}

/**
 * Configura os acionadores (triggers) da planilha ativa.
 * Remove triggers duplicados do tipo onFormSubmit antes de criar um novo.
 */
function setupTriggers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Nenhuma planilha ativa vinculada encontrada.');
  }

  // Remover triggers existentes para evitar duplicidade de disparos
  const triggersExistentes = ScriptApp.getProjectTriggers();
  triggersExistentes.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onFormSubmitSpreadsheet' || trigger.getHandlerFunction() === 'onFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Criar trigger de envio de formulário na planilha
  ScriptApp.newTrigger('onFormSubmitSpreadsheet')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  Logger.log('Trigger onFormSubmitSpreadsheet configurado com sucesso para a planilha ' + ss.getName());
}

/**
 * Retorna o ID do formulário associado a um setor consultando as ScriptProperties ou a aba REGISTRO DE LINKS.
 * @param {string} setorKey Chave do setor (ex: 'ACARI_TINGUA')
 * @return {string|null} ID do formulário ou null
 */
function obterFormIdPorSetor(setorKey) {
  const prop = PropertiesService.getScriptProperties().getProperty('FORM_ID_' + setorKey);
  if (prop) return prop;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return null;
    const abaLinks = ss.getSheetByName('REGISTRO DE LINKS');
    if (!abaLinks) return null;

    const dados = abaLinks.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0] === setorKey && dados[i][2]) {
        return dados[i][2]; // Coluna 3: Form ID
      }
    }
  } catch (e) {
    Logger.log('Erro ao buscar Form ID: ' + e.message);
  }

  return null;
}
