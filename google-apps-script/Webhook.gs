/**
 * CCO - Centro de Controle Operacional
 * Módulo de Webhook e Integração de Respostas de Formulário
 * 
 * Processa envios de formulário, converte em estrutura padronizada,
 * gera assinatura HMAC-SHA256 e envia ao backend do CCO e à planilha.
 */

/**
 * Ponto de entrada padrão para acionadores onFormSubmit configurados na Planilha.
 * @param {Object} e Evento de submissão do formulário
 */
function onFormSubmitSpreadsheet(e) {
  Logger.log('Iniciando processamento onFormSubmitSpreadsheet...');
  try {
    const dados = parseSpreadsheetResponse(e);
    processarSubmissaoCCO(dados);
  } catch (error) {
    Logger.log('Erro ao processar submissão da planilha: ' + error.message);
  }
}

/**
 * Ponto de entrada padrão para acionadores vinculados diretamente ao Google Forms.
 * @param {Object} e Evento de submissão do formulário FormApp
 */
function onFormSubmit(e) {
  Logger.log('Iniciando processamento onFormSubmit (Google Forms)...');
  try {
    const dados = parseFormResponse(e);
    processarSubmissaoCCO(dados);
  } catch (error) {
    Logger.log('Erro ao processar submissão do formulário: ' + error.message);
  }
}

/**
 * Orquestra a gravação na planilha, notificação por e-mail e envio via Webhook HTTP.
 * @param {Object} dados Objeto estruturado do plantão
 */
function processarSubmissaoCCO(dados) {
  if (!dados) {
    Logger.log('Nenhum dado válido extraído da submissão.');
    return;
  }

  Logger.log('Dados do plantão extraídos com sucesso: ' + dados.setorNome + ' - ' + dados.dataPlantao);

  // 1. Enviar Webhook para o backend CCO
  let statusWebhook = 'NÃO ENVIADO';
  try {
    const resultadoWebhook = sendWebhook(dados);
    statusWebhook = (resultadoWebhook && resultadoWebhook.sucesso) ? 'SUCESSO (200)' : ('FALHA (' + (resultadoWebhook.statusCode || 'ERRO') + ')');
  } catch (err) {
    Logger.log('Falha ao acionar webhook CCO: ' + err.message);
    statusWebhook = 'ERRO CONEXÃO';
  }

  // 2. Gravar os dados estruturados nas abas da Planilha CCO
  try {
    gravarPlantaoNaPlanilha(dados, statusWebhook);
  } catch (err) {
    Logger.log('Erro ao gravar dados na planilha: ' + err.message);
  }

  // 3. Disparar e-mail de notificação com relatório formatado
  try {
    enviarRelatorioEmail(dados);
  } catch (err) {
    Logger.log('Erro ao enviar e-mail de notificação: ' + err.message);
  }
}

/**
 * Converte a resposta recebida de um evento do Google Forms (FormApp) em objeto estruturado.
 * @param {Object} e Evento com e.response e e.source
 * @return {Object} Dados padronizados do plantão
 */
function parseFormResponse(e) {
  if (!e || !e.response) {
    throw new Error('Evento de formulário inválido ou ausente.');
  }

  const formResponse = e.response;
  const form = e.source || FormApp.getActiveForm();
  const formTitle = form ? form.getTitle() : '';
  const itemResponses = formResponse.getItemResponses();

  // Identificar setor correspondente
  const setorInfo = identificarSetorPorTitulo(formTitle);

  const dados = {
    idPlantao: 'PLN-' + Utilities.formatDate(new Date(), 'GMT-3', 'yyyyMMdd-HHmmss'),
    setorId: setorInfo.id,
    setorNome: setorInfo.nome,
    formTitle: formTitle,
    emailResponsavel: formResponse.getRespondentEmail() || Session.getActiveUser().getEmail() || 'operador@cco.gov.br',
    timestamp: Utilities.formatDate(formResponse.getTimestamp() || new Date(), 'GMT-3', 'dd/MM/yyyy HH:mm:ss'),
    dataPlantao: '',
    supervisores: [],
    viatura: '',
    kmInicial: 0,
    kmFinal: 0,
    kmRodado: 0,
    ocorrencias: 'Sem alterações',
    confirmacao: false,
    fiscalizacoes: []
  };

  itemResponses.forEach(itemResp => {
    const item = itemResp.getItem();
    const titulo = item.getTitle().trim();
    const resposta = itemResp.getResponse();

    if (titulo.indexOf('Data do Plantão') !== -1) {
      dados.dataPlantao = resposta.toString();
    } else if (titulo.indexOf('Equipe de Supervisores') !== -1) {
      dados.supervisores = Array.isArray(resposta) ? resposta : [resposta.toString()];
    } else if (titulo.indexOf('Viatura Utilizada') !== -1 || titulo.indexOf('Viatura') !== -1) {
      dados.viatura = resposta.toString();
    } else if (titulo.indexOf('KM Inicial') !== -1) {
      dados.kmInicial = Number(resposta) || 0;
    } else if (titulo.indexOf('KM Final') !== -1) {
      dados.kmFinal = Number(resposta) || 0;
    } else if (titulo.indexOf('Relato de Ocorrências') !== -1 || titulo.indexOf('Ocorrências') !== -1) {
      dados.ocorrencias = resposta ? resposta.toString().trim() : 'Sem alterações';
    } else if (titulo.indexOf('Declaração de Veracidade') !== -1 || titulo.indexOf('Declaro') !== -1) {
      dados.confirmacao = true;
    } else {
      // Itens de postos da Seção 3
      const status = resposta ? resposta.toString() : 'Não Fiscalizado';
      let situacao = 'Normal';
      if (status === 'Falta de Efetivo') situacao = 'Inconformidade - Ausência de Posto';
      if (status === 'Não Fiscalizado') situacao = 'Pendente - Não Inspecionado';

      dados.fiscalizacoes.push({
        postoNome: titulo,
        status: status,
        situacao: situacao
      });
    }
  });

  // Cálculo da quilometragem rodada
  dados.kmRodado = Math.max(0, dados.kmFinal - dados.kmInicial);
  if (!dados.dataPlantao) {
    dados.dataPlantao = Utilities.formatDate(new Date(), 'GMT-3', 'yyyy-MM-dd');
  }

  return dados;
}

/**
 * Converte evento de submissão recebido pelo Google Sheets em objeto padronizado.
 * @param {Object} e Evento com e.namedValues ou e.values
 * @return {Object} Dados padronizados do plantão
 */
function parseSpreadsheetResponse(e) {
  if (!e) throw new Error('Evento de planilha ausente.');

  const namedValues = e.namedValues || {};
  const abaAtiva = e.range ? e.range.getSheet().getName() : '';
  const setorInfo = identificarSetorPorAbaOuTexto(abaAtiva, namedValues);

  const agora = new Date();
  const dados = {
    idPlantao: 'PLN-' + Utilities.formatDate(agora, 'GMT-3', 'yyyyMMdd-HHmmss'),
    setorId: setorInfo.id,
    setorNome: setorInfo.nome,
    emailResponsavel: extrairPrimeiroValor(namedValues, ['Endereço de e-mail', 'Email Address', 'E-mail']) || Session.getActiveUser().getEmail() || 'operador@cco.gov.br',
    timestamp: extrairPrimeiroValor(namedValues, ['Carimbo de data/hora', 'Timestamp']) || Utilities.formatDate(agora, 'GMT-3', 'dd/MM/yyyy HH:mm:ss'),
    dataPlantao: extrairPrimeiroValor(namedValues, ['Data do Plantão', 'Data']) || Utilities.formatDate(agora, 'GMT-3', 'yyyy-MM-dd'),
    supervisores: [],
    viatura: extrairPrimeiroValor(namedValues, ['Viatura Utilizada', 'Viatura']) || 'N/I',
    kmInicial: Number(extrairPrimeiroValor(namedValues, ['KM Inicial'])) || 0,
    kmFinal: Number(extrairPrimeiroValor(namedValues, ['KM Final'])) || 0,
    kmRodado: 0,
    ocorrencias: extrairPrimeiroValor(namedValues, ['Relato de Ocorrências do Plantão', 'Ocorrências do Plantão', 'Ocorrências']) || 'Sem alterações',
    confirmacao: true,
    fiscalizacoes: []
  };

  const supervisoresRaw = extrairPrimeiroValor(namedValues, ['Equipe de Supervisores em Serviço', 'Equipe de Supervisores', 'Supervisores']);
  dados.supervisores = supervisoresRaw ? supervisoresRaw.split(',').map(s => s.trim()) : ['Equipe Plantonista'];
  dados.kmRodado = Math.max(0, dados.kmFinal - dados.kmInicial);

  // Extrair postos das colunas restantes
  Object.keys(namedValues).forEach(chave => {
    const chaveTrim = chave.trim();
    const ignorar = [
      'Carimbo de data/hora', 'Timestamp', 'Endereço de e-mail', 'Email Address', 'E-mail',
      'Data do Plantão', 'Data', 'Equipe de Supervisores em Serviço', 'Equipe de Supervisores',
      'Viatura Utilizada', 'Viatura', 'KM Inicial', 'KM Final',
      'Relato de Ocorrências do Plantão', 'Ocorrências do Plantão', 'Ocorrências',
      'Declaração de Veracidade'
    ];

    const deveIgnorar = ignorar.some(ig => chaveTrim.toLowerCase().indexOf(ig.toLowerCase()) !== -1);
    if (!deveIgnorar) {
      const valor = Array.isArray(namedValues[chave]) ? namedValues[chave][0] : namedValues[chave];
      const status = valor ? valor.toString().trim() : 'Não Fiscalizado';
      dados.fiscalizacoes.push({
        postoNome: chaveTrim,
        status: status,
        situacao: status === 'Falta de Efetivo' ? 'Inconformidade' : 'Normal'
      });
    }
  });

  return dados;
}

/**
 * Envia os dados do plantão via chamada HTTP POST ao backend CCO com autenticação HMAC-SHA256.
 * @param {Object} data Objeto de dados a ser transmitido
 * @return {Object} Resultado da requisição { sucesso, statusCode, body }
 */
function sendWebhook(data) {
  const url = CCO_CONFIG.WEBHOOK_URL;
  const payloadString = JSON.stringify(data);
  const timestamp = Date.now().toString();

  // Criação da assinatura HMAC-SHA256
  const assinatura = gerarAssinaturaHmac(payloadString, CCO_CONFIG.WEBHOOK_SECRET);

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: payloadString,
    headers: {
      'X-CCO-Signature': assinatura,
      'X-CCO-Timestamp': timestamp,
      'User-Agent': 'Google-Apps-Script-CCO-Client/2.0'
    },
    muteHttpExceptions: true
  };

  Logger.log('Disparando POST para webhook CCO: ' + url);
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const responseText = response.getContentText();

  Logger.log('Resposta do Webhook CCO: HTTP ' + code + ' | ' + responseText);

  return {
    sucesso: (code >= 200 && code < 300),
    statusCode: code,
    body: responseText
  };
}

/**
 * Gera assinatura HMAC-SHA256 em formato hexadecimal.
 * @param {string} payload Mensagem a ser assinada
 * @param {string} secret Segredo compartilhado
 * @return {string} Assinatura hex
 */
function gerarAssinaturaHmac(payload, secret) {
  const bytes = Utilities.computeHmacSha256Signature(payload, secret);
  return bytes.map(byte => {
    const v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/**
 * Grava o plantão, suas fiscalizações e ocorrências nas abas da planilha Google Sheets.
 * @param {Object} dados Dados estruturados
 * @param {string} statusWebhook Status retornado do envio
 */
function gravarPlantaoNaPlanilha(dados, statusWebhook) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;

  // 1. Gravar na aba PLANTÕES
  const abaPlantoes = ss.getSheetByName('PLANTÕES');
  if (abaPlantoes) {
    abaPlantoes.appendRow([
      dados.idPlantao,
      dados.timestamp,
      dados.setorNome,
      dados.dataPlantao,
      dados.supervisores.join(', '),
      dados.viatura,
      dados.kmInicial,
      dados.kmFinal,
      dados.kmRodado,
      dados.ocorrencias,
      dados.emailResponsavel,
      statusWebhook
    ]);
  }

  // 2. Gravar na aba FISCALIZAÇÕES
  const abaFiscalizacoes = ss.getSheetByName('FISCALIZAÇÕES');
  if (abaFiscalizacoes && dados.fiscalizacoes && dados.fiscalizacoes.length > 0) {
    let contadorFisc = 1;
    const linhasFisc = dados.fiscalizacoes.map(f => [
      dados.idPlantao + '-F' + (contadorFisc++),
      dados.idPlantao,
      dados.dataPlantao,
      dados.setorNome,
      f.postoNome,
      f.status,
      f.situacao || 'Normal',
      dados.supervisores.join(', ')
    ]);
    const ultimaLinha = abaFiscalizacoes.getLastRow();
    abaFiscalizacoes.getRange(ultimaLinha + 1, 1, linhasFisc.length, 8).setValues(linhasFisc);
  }

  // 3. Gravar na aba OCORRÊNCIAS (se houver relato diferente de 'Sem alterações')
  const abaOcorrencias = ss.getSheetByName('OCORRÊNCIAS');
  if (abaOcorrencias && dados.ocorrencias && dados.ocorrencias.trim().toLowerCase() !== 'sem alterações' && dados.ocorrencias.trim() !== '') {
    const idOcorr = 'OCO-' + Utilities.formatDate(new Date(), 'GMT-3', 'yyyyMMdd-HHmmss');
    const gravidade = (dados.ocorrencias.toLowerCase().indexOf('falta') !== -1 || dados.ocorrencias.toLowerCase().indexOf('arma') !== -1 || dados.ocorrencias.toLowerCase().indexOf('furto') !== -1) ? 'ALTA' : 'MÉDIA';
    abaOcorrencias.appendRow([
      idOcorr,
      dados.dataPlantao,
      dados.setorNome,
      dados.viatura,
      dados.supervisores.join(', '),
      dados.ocorrencias,
      gravidade,
      'EM ANÁLISE PELO CCO'
    ]);
  }

  // 4. Atualizar registro de auditoria 72h para cada posto fiscalizado
  atualizarAbaAuditoria72h(ss, dados);
}

/**
 * Atualiza os postos inspecionados na aba AUDITORIA 72H.
 */
function atualizarAbaAuditoria72h(ss, dados) {
  const abaAuditoria = ss.getSheetByName('AUDITORIA 72H');
  if (!abaAuditoria || !dados.fiscalizacoes || dados.fiscalizacoes.length === 0) return;

  const valores = abaAuditoria.getDataRange().getValues();
  const agoraFormatada = Utilities.formatDate(new Date(), 'GMT-3', 'dd/MM/yyyy HH:mm');

  dados.fiscalizacoes.forEach(f => {
    let encontrado = false;
    for (let i = 1; i < valores.length; i++) {
      if (valores[i][0] === f.postoNome) {
        encontrado = true;
        abaAuditoria.getRange(i + 1, 3).setValue(agoraFormatada);
        abaAuditoria.getRange(i + 1, 4).setValue(0); // 0 horas decorridas logo após o plantão
        abaAuditoria.getRange(i + 1, 5).setValue('EM DIA');
        abaAuditoria.getRange(i + 1, 6).setValue(f.status);
        break;
      }
    }

    if (!encontrado) {
      abaAuditoria.appendRow([
        f.postoNome,
        dados.setorNome,
        agoraFormatada,
        0,
        'EM DIA',
        f.status
      ]);
    }
  });
}

/**
 * Identifica o setor a partir do título do formulário.
 */
function identificarSetorPorTitulo(formTitle) {
  const setores = CCO_CONFIG.SETORES;
  for (let key in setores) {
    if (formTitle && (formTitle.indexOf(setores[key].nome) !== -1 || formTitle.indexOf(key) !== -1)) {
      return setores[key];
    }
  }
  return { id: 0, nome: 'SETOR GERAL' };
}

/**
 * Identifica setor a partir do nome da aba ou campos nomeados.
 */
function identificarSetorPorAbaOuTexto(nomeAba, namedValues) {
  const setores = CCO_CONFIG.SETORES;
  for (let key in setores) {
    if (nomeAba && nomeAba.toUpperCase().indexOf(setores[key].nome) !== -1) {
      return setores[key];
    }
  }
  return { id: 1, nome: 'ACARI/TINGUÁ' };
}

/**
 * Retorna o primeiro valor presente no objeto para uma lista de nomes possíveis.
 */
function extrairPrimeiroValor(objeto, chaves) {
  for (let i = 0; i < chaves.length; i++) {
    const k = chaves[i];
    if (objeto[k] !== undefined && objeto[k] !== null) {
      return Array.isArray(objeto[k]) ? objeto[k][0] : objeto[k];
    }
  }
  return '';
}
