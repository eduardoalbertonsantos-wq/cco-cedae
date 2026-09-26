/**
 * CCO - Centro de Controle Operacional
 * Módulo de Disparo de E-mails Operacionais Formatados
 * 
 * Envia relatórios operacionais completos via HTML diretamente
 * a partir do Google Apps Script com layout profissional institucional.
 */

/**
 * Envia o relatório de supervisão operacional por e-mail com layout em HTML.
 * @param {Object} dados Dados do plantão
 */
function enviarRelatorioEmail(dados) {
  if (!dados) {
    throw new Error('Dados do plantão não fornecidos para o envio de e-mail.');
  }

  const destinatario = CCO_CONFIG.EMAIL_DESTINO;
  const remetenteNome = CCO_CONFIG.EMAIL_REMETENTE || 'CCO - Centro de Controle Operacional';
  const assunto = `[CCO] Relatório de Supervisão — ${dados.setorNome} — ${dados.dataPlantao}`;

  // Contabilização de status dos postos
  let totalPostos = (dados.fiscalizacoes || []).length;
  let efetivoCompleto = 0;
  let faltaEfetivo = 0;
  let naoFiscalizado = 0;

  (dados.fiscalizacoes || []).forEach(f => {
    if (f.status === 'Efetivo Completo') efetivoCompleto++;
    else if (f.status === 'Falta de Efetivo') faltaEfetivo++;
    else naoFiscalizado++;
  });

  const percentualConformidade = totalPostos > 0 
    ? Math.round((efetivoCompleto / (totalPostos - naoFiscalizado || 1)) * 100) 
    : 100;

  // Linhas da tabela de postos
  let linhasTabelaPostos = '';
  (dados.fiscalizacoes || []).forEach((f, idx) => {
    let corBadge = '#16a34a'; // verde
    let bgBadge = '#dcfce7';
    if (f.status === 'Falta de Efetivo') {
      corBadge = '#dc2626'; // vermelho
      bgBadge = '#fee2e2';
    } else if (f.status === 'Não Fiscalizado') {
      corBadge = '#d97706'; // âmbar
      bgBadge = '#fef3c7';
    }

    const bgLinha = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    linhasTabelaPostos += `
      <tr style="background-color: ${bgLinha}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 14px; font-weight: 600; color: #1e293b; font-size: 13px;">${f.postoNome}</td>
        <td style="padding: 10px 14px; text-align: center;">
          <span style="display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; color: ${corBadge}; background-color: ${bgBadge}; text-transform: uppercase;">
            ${f.status}
          </span>
        </td>
        <td style="padding: 10px 14px; color: #64748b; font-size: 12px;">${f.situacao || 'Normal'}</td>
      </tr>
    `;
  });

  if (totalPostos === 0) {
    linhasTabelaPostos = `
      <tr>
        <td colspan="3" style="padding: 16px; text-align: center; color: #94a3b8; font-style: italic;">
          Nenhum posto individual registrado neste plantão.
        </td>
      </tr>
    `;
  }

  // Bloco de ocorrências
  const ocorrenciasTexto = (dados.ocorrencias && dados.ocorrencias.trim()) ? dados.ocorrencias : 'Sem alterações';
  const temInconformidade = ocorrenciasTexto.toLowerCase() !== 'sem alterações' || faltaEfetivo > 0;
  const bordaOcorr = temInconformidade ? '#ef4444' : '#3b82f6';
  const bgOcorr = temInconformidade ? '#fff1f2' : '#f0fdf4';

  const htmlCorpo = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5;">
    
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 24px 12px;">
      <tr>
        <td align="center">
          
          <!-- Card Container Principal -->
          <table role="presentation" width="650" cellspacing="0" cellpadding="0" style="max-width: 650px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
            
            <!-- Header Institucional -->
            <tr>
              <td style="background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #93c5fd; text-transform: uppercase; margin-bottom: 6px;">
                  ASSESSORIA DE SEGURANÇA CORPORATIVA
                </div>
                <div style="font-size: 22px; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 4px;">
                  CENTRO DE CONTROLE OPERACIONAL (CCO)
                </div>
                <div style="display: inline-block; margin-top: 8px; padding: 4px 16px; background-color: rgba(255, 255, 255, 0.15); border-radius: 20px; font-size: 12px; font-weight: 600; color: #e0e7ff;">
                  RELATÓRIO ELETRÔNICO DE SUPERVISÃO
                </div>
              </td>
            </tr>

            <!-- Resumo do Plantão -->
            <tr>
              <td style="padding: 24px 24px 16px 24px;">
                <table width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="font-size: 16px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
                      DADOS DA ESCALA E FISCALIZAÇÃO
                    </td>
                    <td align="right" style="font-size: 12px; color: #64748b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
                      ID: <strong style="color: #1e3a8a;">${dados.idPlantao || 'PLN-CCO'}</strong>
                    </td>
                  </tr>
                </table>

                <!-- Grid de Informações -->
                <table width="100%" cellspacing="8" cellpadding="0" style="margin-top: 12px;">
                  <tr>
                    <td width="50%" style="background-color: #f8fafc; padding: 12px 14px; border-radius: 8px; border-left: 4px solid #1e3a8a;">
                      <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">Setor Operacional</div>
                      <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 2px;">${dados.setorNome}</div>
                    </td>
                    <td width="50%" style="background-color: #f8fafc; padding: 12px 14px; border-radius: 8px; border-left: 4px solid #2563eb;">
                      <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">Data do Plantão</div>
                      <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 2px;">${dados.dataPlantao}</div>
                    </td>
                  </tr>
                  <tr>
                    <td width="50%" style="background-color: #f8fafc; padding: 12px 14px; border-radius: 8px; border-left: 4px solid #0284c7;">
                      <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">Viatura Operacional</div>
                      <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px;">${dados.viatura || 'N/I'}</div>
                    </td>
                    <td width="50%" style="background-color: #f8fafc; padding: 12px 14px; border-radius: 8px; border-left: 4px solid #0d9488;">
                      <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">Controle de Odômetro</div>
                      <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px;">
                        ${dados.kmInicial} km → ${dados.kmFinal} km 
                        <span style="color: #059669; font-weight: 800;">(+${dados.kmRodado} km)</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="background-color: #f8fafc; padding: 12px 14px; border-radius: 8px; border-left: 4px solid #475569;">
                      <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">Equipe de Supervisores em Serviço</div>
                      <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 2px;">
                        ${(dados.supervisores && dados.supervisores.length > 0) ? dados.supervisores.join(' • ') : 'Não informado'}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Cartões de Indicadores (KPIs) -->
            <tr>
              <td style="padding: 0 24px 16px 24px;">
                <table width="100%" cellspacing="6" cellpadding="0">
                  <tr>
                    <td width="25%" align="center" style="background-color: #f1f5f9; padding: 12px 6px; border-radius: 8px;">
                      <div style="font-size: 20px; font-weight: 800; color: #1e293b;">${totalPostos}</div>
                      <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Postos</div>
                    </td>
                    <td width="25%" align="center" style="background-color: #dcfce7; padding: 12px 6px; border-radius: 8px;">
                      <div style="font-size: 20px; font-weight: 800; color: #15803d;">${efetivoCompleto}</div>
                      <div style="font-size: 10px; font-weight: 700; color: #166534; text-transform: uppercase;">Completo</div>
                    </td>
                    <td width="25%" align="center" style="background-color: #fee2e2; padding: 12px 6px; border-radius: 8px;">
                      <div style="font-size: 20px; font-weight: 800; color: #b91c1c;">${faltaEfetivo}</div>
                      <div style="font-size: 10px; font-weight: 700; color: #991b1b; text-transform: uppercase;">Faltas</div>
                    </td>
                    <td width="25%" align="center" style="background-color: #fef3c7; padding: 12px 6px; border-radius: 8px;">
                      <div style="font-size: 20px; font-weight: 800; color: #b45309;">${naoFiscalizado}</div>
                      <div style="font-size: 10px; font-weight: 700; color: #92400e; text-transform: uppercase;">Não Inspec.</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Tabela Detalhada dos Postos -->
            <tr>
              <td style="padding: 8px 24px 16px 24px;">
                <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">
                  SITUAÇÃO INDIVIDUAL DOS POSTOS FISCALIZADOS
                </div>
                
                <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                  <thead>
                    <tr style="background-color: #0f172a; color: #ffffff;">
                      <th align="left" style="padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase;">Posto de Serviço</th>
                      <th align="center" style="padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; width: 140px;">Status</th>
                      <th align="left" style="padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase;">Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${linhasTabelaPostos}
                  </tbody>
                </table>
              </td>
            </tr>

            <!-- Bloco de Ocorrências -->
            <tr>
              <td style="padding: 8px 24px 20px 24px;">
                <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">
                  RELATO DE OCORRÊNCIAS OPERACIONAIS
                </div>
                <div style="background-color: ${bgOcorr}; border-left: 4px solid ${bordaOcorr}; padding: 14px 16px; border-radius: 6px; font-size: 13px; color: #1e293b; white-space: pre-wrap;">
                  ${ocorrenciasTexto}
                </div>
              </td>
            </tr>

            <!-- Termo e Confirmação -->
            <tr>
              <td style="padding: 0 24px 24px 24px;">
                <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px 16px; font-size: 11px; color: #475569;">
                  <strong>✓ TERMO DE CONFORMIDADE DECLARADO:</strong> As informações contidas neste relatório foram atestadas pela equipe de supervisão no ato do envio eletrônico, em conformidade com as normas operacionais do CCO.
                </div>
              </td>
            </tr>

            <!-- Rodapé Institucional -->
            <tr>
              <td style="background-color: #0f172a; padding: 18px 24px; text-align: center; color: #94a3b8; font-size: 11px;">
                <div style="color: #e2e8f0; font-weight: 600; margin-bottom: 4px;">
                  CCO — CENTRO DE CONTROLE OPERACIONAL
                </div>
                <div>
                  Mensagem gerada automaticamente em ${dados.timestamp || Utilities.formatDate(new Date(), 'GMT-3', 'dd/MM/yyyy HH:mm:ss')}
                </div>
                <div style="margin-top: 4px; color: #64748b;">
                  Enviado por: ${dados.emailResponsavel || 'Sistema CCO'} | Não responda diretamente a este e-mail.
                </div>
              </td>
            </tr>

          </table>
          <!-- Fim do Card Principal -->

        </td>
      </tr>
    </table>

  </body>
  </html>
  `;

  // Versão em texto plano para clientes de e-mail legados
  const textoPlano = `
CCO - CENTRO DE CONTROLE OPERACIONAL
RELATÓRIO ELETRÔNICO DE SUPERVISÃO OPERACIONAL
==================================================

Setor: ${dados.setorNome}
Data do Plantão: ${dados.dataPlantao}
Viatura: ${dados.viatura || 'N/I'}
KM: ${dados.kmInicial} km inicial | ${dados.kmFinal} km final (+${dados.kmRodado} km rodados)
Supervisores: ${(dados.supervisores || []).join(', ')}

RESUMO DE POSTOS:
- Total: ${totalPostos}
- Efetivo Completo: ${efetivoCompleto}
- Falta de Efetivo: ${faltaEfetivo}
- Não Fiscalizado: ${naoFiscalizado}

OCORRÊNCIAS:
${ocorrenciasTexto}

Registro efetuado por: ${dados.emailResponsavel} em ${dados.timestamp}
==================================================
  `;

  // Disparo via MailApp ou GmailApp
  try {
    MailApp.sendEmail({
      to: destinatario,
      subject: assunto,
      htmlBody: htmlCorpo,
      body: textoPlano,
      name: remetenteNome
    });
    Logger.log('E-mail enviado com sucesso para: ' + destinatario);
  } catch (error) {
    Logger.log('Falha ao enviar e-mail via MailApp, tentando GmailApp: ' + error.message);
    GmailApp.sendEmail(destinatario, assunto, textoPlano, {
      htmlBody: htmlCorpo,
      name: remetenteNome
    });
  }
}
