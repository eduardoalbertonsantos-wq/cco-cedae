/**
 * CCO - Centro de Controle Operacional
 * Gestão e Formatação de Planilhas Google (Google Sheets)
 * 
 * Criação da estrutura completa de abas operacionais, cadastros,
 * histórico de fiscalizações, auditoria 72h e painel geral.
 */

const PALETA_CCO = {
  AZUL_ESCURO: '#1e3a8a',
  AZUL_MEDIO: '#2563eb',
  AZUL_CLARO: '#dbeafe',
  BRANCO: '#ffffff',
  CINZA_CLARO: '#f3f4f6',
  VERDE_SUAVE: '#dcfce7',
  VERMELHO_SUAVE: '#fee2e2',
  AMARELO_SUAVE: '#fef3c7',
  TEXTO_ESCURO: '#1f2937'
};

/**
 * Cria ou reestrutura a planilha com todas as abas e cabeçalhos padrão.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [spreadsheet] Planilha ativa opcional
 */
function criarPlanilha(spreadsheet) {
  const ss = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Nenhuma planilha disponível para estruturação.');
  }

  // Definição de todas as abas requeridas
  const abasDefinidas = [
    { nome: 'PAINEL GERAL', tipo: 'painel' },
    { nome: 'CADASTROS', tipo: 'cadastros' },
    { nome: 'SETORES', colunas: ['ID SETOR', 'CHAVE', 'NOME DO SETOR', 'TÍTULO DO FORMULÁRIO', 'STATUS', 'DATA CADASTRO'] },
    { nome: 'SUPERVISORES', colunas: ['ID', 'SETOR', 'NOME COMPLETO', 'MATRÍCULA', 'STATUS', 'CONTATO / TELEFONE'] },
    { nome: 'VIATURAS', colunas: ['ID', 'SETOR', 'MODELO', 'PLACA', 'STATUS OPERACIONAL', 'KM ATUAL'] },
    { nome: 'POSTOS', colunas: ['ID', 'SETOR', 'NOME DO POSTO', 'CRITICIDADE', 'EFETIVO PREVISTO', 'ÚLTIMA FISCALIZAÇÃO', 'STATUS ATUAL'] },
    { nome: 'PLANTÕES', colunas: ['ID PLANTÃO', 'CARIMBO DATA/HORA', 'SETOR', 'DATA PLANTÃO', 'SUPERVISORES', 'VIATURA', 'KM INICIAL', 'KM FINAL', 'KM RODADO', 'OCORRÊNCIAS', 'RESPONSÁVEL (E-MAIL)', 'STATUS WEBHOOK'] },
    { nome: 'FISCALIZAÇÕES', colunas: ['ID FISCALIZAÇÃO', 'ID PLANTÃO', 'DATA', 'SETOR', 'POSTO DE SERVIÇO', 'STATUS DE EFETIVO', 'SITUAÇÃO', 'SUPERVISORES'] },
    { nome: 'AUDITORIA 72H', colunas: ['POSTO', 'SETOR', 'ÚLTIMA FISCALIZAÇÃO', 'HORAS SEM FISCALIZAR', 'STATUS AUDITORIA', 'ÚLTIMO STATUS EFETIVO'] },
    { nome: 'OCORRÊNCIAS', colunas: ['ID OCORRÊNCIA', 'DATA PLANTÃO', 'SETOR', 'VIATURA', 'SUPERVISORES', 'DESCRIÇÃO COMPLETA', 'GRAVIDADE', 'TRATATIVA / STATUS'] },
    { nome: 'REGISTRO DE LINKS', colunas: ['CHAVE DO SETOR', 'NOME DO SETOR', 'FORM ID', 'LINK DE RESPOSTA (FORMULÁRIO)', 'LINK DE EDIÇÃO', 'DATA DE REGISTRO'] }
  ];

  // Criação ou obtenção das abas
  abasDefinidas.forEach(abaInfo => {
    let sheet = ss.getSheetByName(abaInfo.nome);
    if (!sheet) {
      sheet = ss.insertSheet(abaInfo.nome);
    }

    if (abaInfo.colunas) {
      configurarAbaPadrao(sheet, abaInfo.colunas);
    }
  });

  // Preenchimento de dados de referência padrão nas abas mestras
  popularTabelasReferencia(ss);

  // Configuração específica do PAINEL GERAL e AUDITORIA 72H
  configurarPainelGeral(ss.getSheetByName('PAINEL GERAL'));
  configurarAbaCadastros(ss.getSheetByName('CADASTROS'));
  configurarAuditoria72h(ss.getSheetByName('AUDITORIA 72H'));

  // Ordenar abas
  ordenarAbas(ss, abasDefinidas.map(a => a.nome));

  // Deletar folha inicial padrão caso exista (ex: 'Página1' ou 'Sheet1')
  removerAbasVaziasPadrao(ss);
}

/**
 * Configura cabeçalho, largura e congelamento de linha para aba comum.
 */
function configurarAbaPadrao(sheet, colunas) {
  sheet.getRange('A1:' + obterLetraColuna(colunas.length) + '1').setValues([colunas]);
  
  // Estilização do cabeçalho
  const cabecalho = sheet.getRange(1, 1, 1, colunas.length);
  cabecalho.setBackground(PALETA_CCO.AZUL_ESCURO)
    .setFontColor(PALETA_CCO.BRANCO)
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  
  sheet.setRowHeight(1, 35);
  sheet.setFrozenRows(1);

  // Ajuste inicial de larguras
  for (let i = 1; i <= colunas.length; i++) {
    sheet.setColumnWidth(i, 160);
  }
}

/**
 * Popula as abas mestras (SETORES, SUPERVISORES, VIATURAS, POSTOS) com os dados iniciais do CCO_CONFIG.
 */
function popularTabelasReferencia(ss) {
  const agora = Utilities.formatDate(new Date(), 'GMT-3', 'dd/MM/yyyy HH:mm:ss');

  // 1. SETORES
  const abaSetores = ss.getSheetByName('SETORES');
  if (abaSetores && abaSetores.getLastRow() <= 1) {
    const dadosSetores = [];
    Object.keys(CCO_CONFIG.SETORES).forEach(key => {
      const s = CCO_CONFIG.SETORES[key];
      dadosSetores.push([s.id, key, s.nome, s.formTitle, 'ATIVO', agora]);
    });
    if (dadosSetores.length > 0) {
      abaSetores.getRange(2, 1, dadosSetores.length, 6).setValues(dadosSetores);
    }
  }

  // 2. SUPERVISORES
  const abaSupervisores = ss.getSheetByName('SUPERVISORES');
  if (abaSupervisores && abaSupervisores.getLastRow() <= 1) {
    const dadosSup = [];
    let idSup = 1;
    Object.keys(CCO_CONFIG.SETORES).forEach(key => {
      const s = CCO_CONFIG.SETORES[key];
      (s.supervisores || []).forEach(supString => {
        // Exemplo: 'ALEX — Mat. 1695'
        const partes = supString.split('—');
        const nome = partes[0] ? partes[0].trim() : supString;
        const mat = partes[1] ? partes[1].replace('Mat.', '').trim() : 'S/M';
        dadosSup.push([idSup++, s.nome, nome, mat, 'ATIVO', '(21) 98888-0000']);
      });
    });
    if (dadosSup.length > 0) {
      abaSupervisores.getRange(2, 1, dadosSup.length, 6).setValues(dadosSup);
    }
  }

  // 3. VIATURAS
  const abaViaturas = ss.getSheetByName('VIATURAS');
  if (abaViaturas && abaViaturas.getLastRow() <= 1) {
    const dadosViat = [];
    let idViat = 1;
    Object.keys(CCO_CONFIG.SETORES).forEach(key => {
      const s = CCO_CONFIG.SETORES[key];
      (s.viaturas || []).forEach(viatString => {
        // Exemplo: 'CHEVROLET S-10 — TTU2F83'
        const partes = viatString.split('—');
        const modelo = partes[0] ? partes[0].trim() : viatString;
        const placa = partes[1] ? partes[1].trim() : 'A INFORMAR';
        dadosViat.push([idViat++, s.nome, modelo, placa, 'EM OPERAÇÃO', 45000]);
      });
    });
    if (dadosViat.length > 0) {
      abaViaturas.getRange(2, 1, dadosViat.length, 6).setValues(dadosViat);
    }
  }

  // 4. POSTOS
  const abaPostos = ss.getSheetByName('POSTOS');
  if (abaPostos && abaPostos.getLastRow() <= 1) {
    const dadosPostos = [];
    let idPosto = 1;
    Object.keys(CCO_CONFIG.SETORES).forEach(key => {
      const s = CCO_CONFIG.SETORES[key];
      (s.postos || []).forEach(postoNome => {
        dadosPostos.push([idPosto++, s.nome, postoNome, 'ALTA', '24 Horas', 'N/A', 'ATIVO']);
      });
    });
    if (dadosPostos.length > 0) {
      abaPostos.getRange(2, 1, dadosPostos.length, 7).setValues(dadosPostos);
    }
  }
}

/**
 * Configura e estiliza o Painel Geral com indicadores e KPIs operacionais.
 */
function configurarPainelGeral(sheet) {
  if (!sheet) return;
  sheet.clear();
  sheet.setFrozenRows(0);

  // Título e Subtítulo
  sheet.getRange('B2:H2').merge().setValue('CCO — CENTRO DE CONTROLE OPERACIONAL')
    .setBackground(PALETA_CCO.AZUL_ESCURO)
    .setFontColor(PALETA_CCO.BRANCO)
    .setFontSize(16)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(2, 45);

  sheet.getRange('B3:H3').merge().setValue('PAINEL CONSOLIDADO DE GESTÃO E FISCALIZAÇÃO OPERACIONAL')
    .setBackground('#334155')
    .setFontColor('#f8fafc')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(3, 24);

  // Linha 5: Cards de Indicadores Principais
  const kpis = [
    { rangeTitle: 'B5:C5', rangeVal: 'B6:C6', title: 'TOTAL DE PLANTÕES', formula: '=IFERROR(COUNTA(PLANTÕES!A2:A), 0)', cor: PALETA_CCO.AZUL_CLARO },
    { rangeTitle: 'D5:E5', rangeVal: 'D6:E6', title: 'POSTOS FISCALIZADOS', formula: '=IFERROR(COUNTA(FISCALIZAÇÕES!A2:A), 0)', cor: PALETA_CCO.AZUL_CLARO },
    { rangeTitle: 'F5:F5', rangeVal: 'F6:F6', title: 'EFETIVO COMPLETO', formula: '=IFERROR(COUNTIF(FISCALIZAÇÕES!F2:F, "Efetivo Completo"), 0)', cor: PALETA_CCO.VERDE_SUAVE },
    { rangeTitle: 'G5:G5', rangeVal: 'G6:G6', title: 'FALTAS EFETIVO', formula: '=IFERROR(COUNTIF(FISCALIZAÇÕES!F2:F, "Falta de Efetivo"), 0)', cor: PALETA_CCO.VERMELHO_SUAVE },
    { rangeTitle: 'H5:H5', rangeVal: 'H6:H6', title: 'NÃO FISCALIZADOS', formula: '=IFERROR(COUNTIF(FISCALIZAÇÕES!F2:F, "Não Fiscalizado"), 0)', cor: PALETA_CCO.AMARELO_SUAVE }
  ];

  kpis.forEach(k => {
    sheet.getRange(k.rangeTitle).merge().setValue(k.title)
      .setBackground('#e2e8f0')
      .setFontColor('#334155')
      .setFontWeight('bold')
      .setFontSize(9)
      .setHorizontalAlignment('center');

    sheet.getRange(k.rangeVal).merge().setValue(k.formula)
      .setBackground(k.cor)
      .setFontColor(PALETA_CCO.TEXTO_ESCURO)
      .setFontWeight('bold')
      .setFontSize(18)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
  });
  sheet.setRowHeight(5, 26);
  sheet.setRowHeight(6, 40);

  // Linha 8: Resumo de Quilometragem e Ocorrências
  sheet.getRange('B8:D8').merge().setValue('QUILOMETRAGEM TOTAL OPERADA')
    .setBackground('#e2e8f0').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange('B9:D9').merge().setValue('=IFERROR(SUM(PLANTÕES!I2:I), 0) & " KM"')
    .setBackground(PALETA_CCO.AZUL_CLARO).setFontSize(14).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');

  sheet.getRange('E8:H8').merge().setValue('TOTAL DE OCORRÊNCIAS REGISTRADAS')
    .setBackground('#e2e8f0').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange('E9:H9').merge().setValue('=IFERROR(COUNTA(OCORRÊNCIAS!A2:A), 0)')
    .setBackground(PALETA_CCO.AMARELO_SUAVE).setFontSize(14).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');

  sheet.setRowHeight(8, 25);
  sheet.setRowHeight(9, 35);

  // Linha 11: Guia Rápido de Navegação
  sheet.getRange('B11:H11').merge().setValue('GUIA DE ACESSO OPERACIONAL')
    .setBackground(PALETA_CCO.AZUL_ESCURO).setFontColor(PALETA_CCO.BRANCO).setFontWeight('bold').setHorizontalAlignment('center');
  
  const rotas = [
    ['SETORES', 'SUPERVISORES', 'VIATURAS', 'POSTOS'],
    ['PLANTÕES', 'FISCALIZAÇÕES', 'AUDITORIA 72H', 'REGISTRO DE LINKS']
  ];

  sheet.getRange('B12:E12').setValues([rotas[0]]).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#f1f5f9');
  sheet.getRange('B13:E13').setValues([rotas[1]]).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#f8fafc');

  // Ajuste de larguras das colunas do painel
  sheet.setColumnWidth(1, 40);
  sheet.setColumnWidth(2, 160);
  sheet.setColumnWidth(3, 160);
  sheet.setColumnWidth(4, 160);
  sheet.setColumnWidth(5, 160);
  sheet.setColumnWidth(6, 160);
  sheet.setColumnWidth(7, 160);
  sheet.setColumnWidth(8, 160);
}

/**
 * Configura a aba CADASTROS como índice explicativo do sistema.
 */
function configurarAbaCadastros(sheet) {
  if (!sheet) return;
  sheet.clear();
  sheet.setFrozenRows(0);

  sheet.getRange('B2:G2').merge().setValue('CENTRO DE CONTROLE OPERACIONAL — GUIA DE CADASTROS')
    .setBackground(PALETA_CCO.AZUL_ESCURO).setFontColor(PALETA_CCO.BRANCO).setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');

  const instrucoes = [
    ['Aba', 'Descrição e Finalidade', 'Regra de Atualização'],
    ['SETORES', 'Mapeia as 4 grandes regiões operacionais (Acari/Tinguá, Guandu, etc.)', 'Administrador'],
    ['SUPERVISORES', 'Cadastro nominal e matrícula de todos os supervisores escaláveis', 'Atualizar nas alterações de escala'],
    ['VIATURAS', 'Cadastro de viaturas ativas, placas e quilometragem de frota', 'Atualizar nas trocas de veículos'],
    ['POSTOS', 'Cadastro de postos fixos inspecionados periodicamente', 'Conforme contratos e ordens de serviço'],
    ['REGISTRO DE LINKS', 'URLs oficiais dos Google Forms e IDs no Google Drive', 'Gerado automaticamente pelo script']
  ];

  sheet.getRange(4, 2, instrucoes.length, 3).setValues(instrucoes);
  sheet.getRange(4, 2, 1, 3).setBackground('#334155').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 350);
  sheet.setColumnWidth(4, 220);
}

/**
 * Configura fórmulas e regras na aba AUDITORIA 72H.
 */
function configurarAuditoria72h(sheet) {
  if (!sheet) return;

  // Proteção opcional ou formatação condicional de criticidade
  const regras = sheet.getConditionalFormatRules();
  
  // Regra Vermelha para > 72h ou Crítico
  const regraCritica = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('CRÍTICO')
    .setBackground(PALETA_CCO.VERMELHO_SUAVE)
    .setFontColor('#991b1b')
    .setRanges([sheet.getRange('E2:E1000')])
    .build();

  // Regra Amarela para Atenção (> 48h)
  const regraAtencao = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('ATENÇÃO')
    .setBackground(PALETA_CCO.AMARELO_SUAVE)
    .setFontColor('#92400e')
    .setRanges([sheet.getRange('E2:E1000')])
    .build();

  // Regra Verde para Em Dia (<= 48h)
  const regraEmDia = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('EM DIA')
    .setBackground(PALETA_CCO.VERDE_SUAVE)
    .setFontColor('#166534')
    .setRanges([sheet.getRange('E2:E1000')])
    .build();

  regras.push(regraCritica);
  regras.push(regraAtencao);
  regras.push(regraEmDia);
  sheet.setConditionalFormatRules(regras);
}

/**
 * Remove abas padrão vazias criadas automaticamente na inicialização da planilha.
 */
function removerAbasVaziasPadrao(ss) {
  const nomesPadrao = ['Página1', 'Sheet1', 'Folha1'];
  nomesPadrao.forEach(nome => {
    const folha = ss.getSheetByName(nome);
    if (folha && ss.getSheets().length > 1) {
      try {
        ss.deleteSheet(folha);
      } catch (e) {
        Logger.log('Não foi possível remover aba padrão: ' + e.message);
      }
    }
  });
}

/**
 * Ordena abas na sequência especificada.
 */
function ordenarAbas(ss, ordemNomes) {
  ordemNomes.forEach((nome, index) => {
    const sheet = ss.getSheetByName(nome);
    if (sheet) {
      ss.setActiveSheet(sheet);
      ss.moveActiveSheet(index + 1);
    }
  });
}

/**
 * Converte índice numérico em letra de coluna do Excel/Sheets (1 = A, 26 = Z, 27 = AA).
 */
function obterLetraColuna(coluna) {
  let temp, letra = '';
  while (coluna > 0) {
    temp = (coluna - 1) % 26;
    letra = String.fromCharCode(temp + 65) + letra;
    coluna = (coluna - temp - 1) / 26;
  }
  return letra;
}
