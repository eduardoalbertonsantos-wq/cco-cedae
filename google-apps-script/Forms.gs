/**
 * CCO - Centro de Controle Operacional
 * Gestão e Geração de Formulários Google (Google Forms)
 * 
 * Cria e atualiza automaticamente os formulários dinâmicos de supervisão para cada setor.
 */

/**
 * Cria o formulário do Google para um setor específico.
 * @param {string} setorKey Chave do setor (ex: 'ACARI_TINGUA', 'GUANDU')
 * @return {GoogleAppsScript.Forms.Form} O formulário criado
 */
function criarFormulario(setorKey) {
  const setor = CCO_CONFIG.SETORES[setorKey];
  if (!setor) {
    throw new Error('Setor não encontrado nas configurações: ' + setorKey);
  }

  const titulo = setor.formTitle || ('SUPERVISÃO — ' + setor.nome);
  const form = FormApp.create(titulo);

  // Configurações Gerais de Apresentação e Coleta
  form.setTitle(titulo);
  form.setDescription(
    'CCO — CENTRO DE CONTROLE OPERACIONAL\n' +
    'ASSESSORIA DE SEGURANÇA EMPRESARIAL\n\n' +
    'Setor Operacional: ' + setor.nome + '\n' +
    'Relatório Eletrônico de Supervisão Operacional e Fiscalização de Postos.\n' +
    'Preenchimento obrigatório ao término de cada turno de plantão.\n' +
    'Todas as informações são transmitidas em tempo real ao CCO.'
  );

  form.setCollectEmail(true);
  form.setAllowResponseEdits(false);
  form.setShowLinkToRespondAgain(true);
  form.setConfirmationMessage(
    '✓ Relatório de Supervisão registrado com sucesso no CCO!\n\n' +
    'Os dados foram catalogados na planilha central, sincronizados com o backend operacional ' +
    'e as notificações foram disparadas para os e-mails dos gestores responsáveis.'
  );

  // ==========================================
  // SEÇÃO 1: IDENTIFICAÇÃO DO PLANTÃO
  // ==========================================
  // Data do Plantão (obrigatória)
  form.addDateItem()
    .setTitle('Data do Plantão')
    .setHelpText('Informe a data de início da jornada de supervisão.')
    .setRequired(true);

  // Equipe de Supervisores (Checkboxes)
  const itemEquipe = form.addCheckboxItem()
    .setTitle('Equipe de Supervisores em Serviço')
    .setHelpText('Selecione todos os supervisores participantes do plantão.')
    .setRequired(true);

  if (setor.supervisores && setor.supervisores.length > 0) {
    const escolhasSupervisores = setor.supervisores.map(sup => itemEquipe.createChoice(sup));
    itemEquipe.setChoices(escolhasSupervisores);
    itemEquipe.showOtherOption(true);
  } else {
    itemEquipe.setChoices([
      itemEquipe.createChoice('Supervisor Plantonista a Informar'),
      itemEquipe.createChoice('Escala Extra / Apoio Externo')
    ]);
    itemEquipe.showOtherOption(true);
  }

  // Viatura (Dropdown)
  const itemViatura = form.addListItem()
    .setTitle('Viatura Utilizada')
    .setHelpText('Selecione o veículo operacional utilizado na fiscalização.')
    .setRequired(true);

  if (setor.viaturas && setor.viaturas.length > 0) {
    const escolhasViaturas = setor.viaturas.map(v => itemViatura.createChoice(v));
    itemViatura.setChoices(escolhasViaturas);
  } else {
    itemViatura.setChoices([
      itemViatura.createChoice('Viatura Reserva / Apoio Operacional'),
      itemViatura.createChoice('Veículo Operacional a Designar')
    ]);
  }

  // ==========================================
  // SEÇÃO 2: QUILOMETRAGEM
  // ==========================================
  form.addPageBreakItem()
    .setTitle('CONTROLE DE QUILOMETRAGEM')
    .setHelpText('Informe a quilometragem marcada no odômetro da viatura no início e no fim da jornada.');

  const validacaoKm = FormApp.createTextValidation()
    .requireNumberGreaterThanOrEqualTo(0)
    .setHelpText('Insira apenas números inteiros maiores ou iguais a zero.')
    .build();

  form.addTextItem()
    .setTitle('KM Inicial')
    .setHelpText('Odômetro registrado na saída da base.')
    .setValidation(validacaoKm)
    .setRequired(true);

  form.addTextItem()
    .setTitle('KM Final')
    .setHelpText('Odômetro registrado no retorno à base.')
    .setValidation(validacaoKm)
    .setRequired(true);

  // ==========================================
  // SEÇÃO 3: FISCALIZAÇÃO DOS POSTOS
  // ==========================================
  form.addPageBreakItem()
    .setTitle('FISCALIZAÇÃO DOS POSTOS DE SERVIÇO')
    .setHelpText('Avalie a situação operacional de cada um dos postos do setor ' + setor.nome + '. Preenchimento obrigatório para cada posto.');

  if (setor.postos && setor.postos.length > 0) {
    setor.postos.forEach(postoNome => {
      const itemPosto = form.addMultipleChoiceItem();
      itemPosto.setTitle(postoNome)
        .setHelpText('Situação operacional observada durante a fiscalização presencial:')
        .setRequired(true)
        .setChoices([
          itemPosto.createChoice('Efetivo Completo'),
          itemPosto.createChoice('Falta de Efetivo'),
          itemPosto.createChoice('Não Fiscalizado')
        ]);
    });
  } else {
    // Setor sem postos previamente listados
    const itemPostoGenerico = form.addMultipleChoiceItem();
    itemPostoGenerico.setTitle('Posto Operacional Principal')
      .setHelpText('Avaliação do efetivo no setor')
      .setRequired(true)
      .setChoices([
        itemPostoGenerico.createChoice('Efetivo Completo'),
        itemPostoGenerico.createChoice('Falta de Efetivo'),
        itemPostoGenerico.createChoice('Não Fiscalizado')
      ]);
  }

  // ==========================================
  // SEÇÃO 4: OCORRÊNCIAS E OBSERVAÇÕES
  // ==========================================
  form.addPageBreakItem()
    .setTitle('OCORRÊNCIAS E OBSERVAÇÕES RELEVANTES')
    .setHelpText('Espaço para detalhamento de inconformidades, falhas de efetivo, avarias e apontamentos do plantão.');

  form.addParagraphTextItem()
    .setTitle('Relato de Ocorrências do Plantão')
    .setHelpText('Detalhe eventuais desvios, rondas não executadas, problemas técnicos ou faltas de vigilantes. Caso não haja novidades, registre "Sem alterações".')
    .setRequired(false);

  // ==========================================
  // SEÇÃO 5: CONFIRMAÇÃO E DECLARAÇÃO
  // ==========================================
  form.addPageBreakItem()
    .setTitle('TERMO DE RESPONSABILIDADE E CONFORMIDADE')
    .setHelpText('Validação formal das informações prestadas pela equipe.');

  const itemConfirmacao = form.addCheckboxItem()
    .setTitle('Declaração de Veracidade')
    .setRequired(true);

  itemConfirmacao.setChoices([
    itemConfirmacao.createChoice('Declaro que as informações deste relatório correspondem às supervisões realizadas durante o plantão.')
  ]);

  // Vínculo com a planilha ativa, se disponível
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    }
  } catch (err) {
    Logger.log('Aviso ao vincular destino da planilha: ' + err.message);
  }

  // Salvar ID do formulário nas ScriptProperties
  PropertiesService.getScriptProperties().setProperty('FORM_ID_' + setorKey, form.getId());
  PropertiesService.getScriptProperties().setProperty('FORM_URL_' + setorKey, form.getPublishedUrl());

  // Registrar na aba REGISTRO DE LINKS
  registrarLinkPlanilha(setorKey, setor.nome, form.getId(), form.getPublishedUrl(), form.getEditUrl());

  return form;
}

/**
 * Cria os formulários para todos os setores cadastrados em CCO_CONFIG.
 * @return {Array<Object>} Lista de formulários criados com URLs
 */
function criarTodosForms() {
  const setores = Object.keys(CCO_CONFIG.SETORES);
  const resultados = [];

  setores.forEach(setorKey => {
    const form = criarFormulario(setorKey);
    resultados.push({
      setorKey: setorKey,
      setorNome: CCO_CONFIG.SETORES[setorKey].nome,
      formId: form.getId(),
      url: form.getPublishedUrl(),
      editUrl: form.getEditUrl()
    });
  });

  return resultados;
}

/**
 * Atualiza opções de um formulário existente sem recriá-lo,
 * preservando o histórico de respostas existentes.
 * @param {string} setorKey Chave do setor
 * @param {string} formId ID do formulário no Google Drive
 */
function atualizarFormulario(setorKey, formId) {
  const setor = CCO_CONFIG.SETORES[setorKey];
  if (!setor) {
    throw new Error('Setor inválido para atualização: ' + setorKey);
  }

  const form = FormApp.openById(formId);
  const itens = form.getItems();

  itens.forEach(item => {
    const titulo = item.getTitle();

    // Atualizar supervisores
    if (titulo.indexOf('Equipe de Supervisores') !== -1 && item.getType() === FormApp.ItemType.CHECKBOX) {
      const checkboxItem = item.asCheckboxItem();
      if (setor.supervisores && setor.supervisores.length > 0) {
        checkboxItem.setChoices(setor.supervisores.map(s => checkboxItem.createChoice(s)));
        checkboxItem.showOtherOption(true);
      }
    }

    // Atualizar viaturas
    if (titulo.indexOf('Viatura') !== -1 && item.getType() === FormApp.ItemType.LIST) {
      const listItem = item.asListItem();
      if (setor.viaturas && setor.viaturas.length > 0) {
        listItem.setChoices(setor.viaturas.map(v => listItem.createChoice(v)));
      }
    }
  });

  Logger.log('Formulário atualizado com sucesso: ' + setor.nome + ' (' + formId + ')');
}

/**
 * Salva o link do formulário na aba "REGISTRO DE LINKS" da planilha CCO.
 */
function registrarLinkPlanilha(setorKey, setorNome, formId, publishedUrl, editUrl) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;

    let abaLinks = ss.getSheetByName('REGISTRO DE LINKS');
    if (!abaLinks) {
      abaLinks = ss.insertSheet('REGISTRO DE LINKS');
      abaLinks.appendRow(['CHAVE DO SETOR', 'NOME DO SETOR', 'FORM ID', 'LINK DE RESPOSTA (FORMULÁRIO)', 'LINK DE EDIÇÃO', 'DATA DE REGISTRO']);
      abaLinks.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
    }

    // Verificar se já existe linha para o setor
    const dados = abaLinks.getDataRange().getValues();
    let linhaExistente = -1;

    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0] === setorKey) {
        linhaExistente = i + 1;
        break;
      }
    }

    const agora = Utilities.formatDate(new Date(), 'GMT-3', 'dd/MM/yyyy HH:mm:ss');
    const valoresLinha = [setorKey, setorNome, formId, publishedUrl, editUrl, agora];

    if (linhaExistente > 0) {
      abaLinks.getRange(linhaExistente, 1, 1, valoresLinha.length).setValues([valoresLinha]);
    } else {
      abaLinks.appendRow(valoresLinha);
    }
  } catch (err) {
    Logger.log('Erro ao registrar link na planilha: ' + err.message);
  }
}
