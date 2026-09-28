const nodemailer = require('nodemailer');
const { getDb } = require('../database/db');

class EmailService {
    getConfig() {
        const config = {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || '',
            from: process.env.SMTP_FROM || '',
            destino: process.env.EMAIL_DESTINO || 'eduardoalbertonsantos@gmail.com'
        };

        try {
            const db = getDb();
            const rows = db.prepare("SELECT chave, valor FROM configuracoes WHERE chave LIKE 'smtp_%' OR chave = 'email_destino_relatorios'").all();
            rows.forEach(r => {
                if (r.chave === 'smtp_host' && r.valor) config.host = r.valor;
                if (r.chave === 'smtp_port' && r.valor) config.port = Number(r.valor);
                if (r.chave === 'smtp_secure') config.secure = (r.valor === 'true' || r.valor === '1');
                if (r.chave === 'smtp_user' && r.valor) config.user = r.valor;
                if (r.chave === 'smtp_pass' && r.valor) config.pass = r.valor;
                if (r.chave === 'smtp_from' && r.valor) config.from = r.valor;
                if (r.chave === 'email_destino_relatorios' && r.valor) config.destino = r.valor;
            });
        } catch (e) {
            console.error('Erro ao ler configurações de SMTP do banco:', e.message);
        }

        if (!config.from && config.user) {
            config.from = `"CCO CEDAE" <${config.user}>`;
        }

        return config;
    }

    getTransporter(config) {
        if (!config.user || !config.pass || config.user === 'seu-email@gmail.com') {
            return null;
        }

        return nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure || config.port === 465,
            auth: {
                user: config.user.trim(),
                pass: config.pass.trim()
            },
            tls: {
                rejectUnauthorized: false
            }
        });
    }

    async testarEnvioEmail(destinatarioCustomizado) {
        const config = this.getConfig();
        const destino = (destinatarioCustomizado && destinatarioCustomizado.trim()) || config.destino || config.user;

        if (!config.user || !config.pass || config.user === 'seu-email@gmail.com' || config.pass === 'sua-senha-de-app') {
            return {
                success: false,
                error: 'Configurações de SMTP incompletas. Informe o E-mail Remetente e a Senha de Aplicativo (Google App Password de 16 caracteres).'
            };
        }

        const transporter = this.getTransporter(config);
        if (!transporter) {
            return {
                success: false,
                error: 'Não foi possível inicializar o transporte SMTP. Verifique as credenciais.'
            };
        }

        try {
            await transporter.verify();
        } catch (verifyErr) {
            let msg = verifyErr.message;
            if (msg.includes('BadCredentials') || msg.includes('535')) {
                msg = 'Falha de Autenticação (535): O Google rejeitou o e-mail ou a senha. É OBRIGATÓRIO utilizar uma "Senha de Aplicativo" de 16 letras gerada na Conta Google (Segurança > Verificação em 2 etapas > Senhas de app), e NÃO sua senha habitual.';
            }
            return { success: false, error: msg };
        }

        try {
            const html = `
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"></head>
            <body style="font-family: Arial, sans-serif; background-color: #f1f5f9; padding: 20px; color: #1e293b;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-top: 5px solid #22c55e;">
                    <div style="background-color: #0a1628; color: #ffffff; padding: 20px; text-align: center;">
                        <h1 style="margin: 0; font-size: 20px; letter-spacing: 1px;">CEDAE &mdash; CCO CONTROLE OPERACIONAL</h1>
                        <p style="margin: 5px 0 0 0; color: #00d2ff; font-size: 13px;">TESTE DE INTEGRAÇÃO DE E-MAIL CONCLUÍDO</p>
                    </div>
                    <div style="padding: 25px; line-height: 1.6;">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <span style="background: #22c55e; color: #fff; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 14px;">
                                ✓ DISPARO DE E-MAIL OPERACIONAL ATIVO
                            </span>
                        </div>
                        <p>Prezado(a) Gestor(a),</p>
                        <p>Este é um e-mail de teste confirmando que o sistema <strong>CCO — Centro de Controle Operacional CEDAE</strong> está configurado e pronto para o envio automático de relatórios consolidados de expediente.</p>
                        
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin: 20px 0; font-size: 13px;">
                            <strong>Informações Técnicas do Teste:</strong><br>
                            &bull; <strong>Remetente:</strong> ${config.from || config.user}<br>
                            &bull; <strong>Destinatário:</strong> ${destino}<br>
                            &bull; <strong>Servidor SMTP:</strong> ${config.host}:${config.port}<br>
                            &bull; <strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR')}
                        </div>

                        <p style="font-size: 13px; color: #64748b; margin-top: 25px; text-align: center;">
                            ASSESSORIA DE SEGURANÇA &bull; CENTRO DE CONTROLE OPERACIONAL CEDAE
                        </p>
                    </div>
                </div>
            </body>
            </html>
            `;

            await transporter.sendMail({
                from: config.from || config.user,
                to: destino,
                subject: `[CCO CEDAE] Confirmação de Configuração de E-mail (${new Date().toLocaleDateString('pt-BR')})`,
                html
            });

            return {
                success: true,
                message: `E-mail de teste enviado com sucesso para ${destino}!`
            };
        } catch (sendErr) {
            return {
                success: false,
                error: 'Falha no envio da mensagem: ' + sendErr.message
            };
        }
    }

    async enviarRelatorioCedae(relatorio, postos, ocorrencias) {
        try {
            const config = this.getConfig();
            const transporter = this.getTransporter(config);
            
            if (!transporter) {
                console.log('ℹ️ Notificação de e-mail desativada: SMTP não configurado com credenciais válidas.');
                return;
            }

            const emailDestino = config.destino || 'eduardoalbertonsantos@gmail.com';

            let rowsPostosHtml = '';
            (postos || []).forEach(p => {
                let badgeColor = '#22c55e';
                let statusLabel = p.status_supervisao || 'NORMAL';
                if (statusLabel === 'COM_OCORRENCIA') { badgeColor = '#ef4444'; statusLabel = 'COM OCORRÊNCIA'; }
                if (statusLabel === 'PENDENCIA') { badgeColor = '#eab308'; statusLabel = 'PENDÊNCIA'; }
                if (statusLabel === 'SEM_ALTERACAO') { badgeColor = '#64748b'; statusLabel = 'SEM ALTERAÇÃO'; }

                rowsPostosHtml += `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 8px 12px; font-weight: bold; color: #0a1628;">${p.posto_nome}</td>
                        <td style="padding: 8px 12px; color: #475569;">${p.horario_supervisao || 'Fiscalizado'}</td>
                        <td style="padding: 8px 12px; text-align: center;">
                            <span style="background-color: ${badgeColor}; color: white; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">
                                ${statusLabel}
                            </span>
                        </td>
                        <td style="padding: 8px 12px; text-align: center; color: #0a1628;">${p.efetivo_presente ?? 1}</td>
                        <td style="padding: 8px 12px; color: #64748b; font-size: 12px;">${p.observacao || '-'}</td>
                    </tr>
                `;
            });

            let ocorrenciasHtml = '';
            if (ocorrencias && ocorrencias.length > 0) {
                ocorrenciasHtml = `<h3 style="color: #ef4444; margin-top: 20px; border-bottom: 2px solid #ef4444; padding-bottom: 4px;">🚨 Ocorrências e Providências Registradas</h3><ul style="padding-left: 20px; line-height: 1.6;">`;
                ocorrencias.forEach(oc => {
                    ocorrenciasHtml += `<li style="margin-bottom: 8px;"><strong>[${oc.posto_nome || 'Geral'}]</strong> ${oc.descricao} &mdash; <span style="color: #0369a1;"><em>Providência: ${oc.providencias_adotadas || 'Adotada pelo fiscal'}</em></span></li>`;
                });
                ocorrenciasHtml += `</ul>`;
            }

            const html = `
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"></head>
            <body style="font-family: Arial, sans-serif; background-color: #f1f5f9; padding: 20px; color: #1e293b;">
                <div style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-top: 5px solid #2563eb;">
                    <div style="background-color: #0a1628; color: #ffffff; padding: 20px; text-align: center;">
                        <h1 style="margin: 0; font-size: 20px; letter-spacing: 1px;">CEDAE &mdash; CCO CONTROLE OPERACIONAL</h1>
                        <p style="margin: 5px 0 0 0; color: #00d2ff; font-size: 13px;">RELATÓRIO CONSOLIDADO DO EXPEDIENTE (#${relatorio.id})</p>
                    </div>

                    <div style="padding: 20px;">
                        <table style="width: 100%; margin-bottom: 20px; font-size: 14px; border-collapse: collapse;">
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 6px 0;"><strong>Setor:</strong> ${relatorio.setor_nome}</td>
                                <td style="padding: 6px 0;"><strong>Data do Serviço:</strong> ${relatorio.data_servico}</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 6px 0;"><strong>Fiscal:</strong> ${relatorio.supervisor_nome || relatorio.responsavel_nome || 'N/A'}</td>
                                <td style="padding: 6px 0;"><strong>Turno:</strong> ${relatorio.turno}</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 6px 0;"><strong>Viatura:</strong> ${relatorio.viatura_modelo || relatorio.viatura_outros_texto || 'OUTROS'} (${relatorio.viatura_placa || 'N/A'})</td>
                                <td style="padding: 6px 0;"><strong>KM Rodado:</strong> <span style="color: #2563eb; font-weight: bold;">${relatorio.km_rodado || 0} km</span> (Ini: ${relatorio.km_inicial} | Fim: ${relatorio.km_final})</td>
                            </tr>
                        </table>

                        <h3 style="color: #0a1628; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-top: 15px;">Postos Fiscalizados (${postos ? postos.length : 0})</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <thead>
                                <tr style="background: #f8fafc; text-align: left; color: #64748b;">
                                    <th style="padding: 8px 12px;">Posto</th>
                                    <th style="padding: 8px 12px;">Horário</th>
                                    <th style="padding: 8px 12px; text-align: center;">Situação</th>
                                    <th style="padding: 8px 12px; text-align: center;">Efetivo</th>
                                    <th style="padding: 8px 12px;">Observação</th>
                                </tr>
                            </thead>
                            <tbody>${rowsPostosHtml}</tbody>
                        </table>

                        ${ocorrenciasHtml}

                        ${relatorio.observacoes_gerais ? `
                            <h3 style="color: #0a1628; margin-top: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Observações Gerais</h3>
                            <p style="font-size: 13px; color: #334155; background: #f8fafc; padding: 10px; border-radius: 4px;">${relatorio.observacoes_gerais}</p>
                        ` : ''}

                        <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #cbd5e1; font-size: 12px; color: #64748b; text-align: center;">
                            ASSESSORIA DE SEGURANÇA &bull; CCO CENTRO DE CONTROLE OPERACIONAL CEDAE<br>
                            Status: <strong>RELATÓRIO RECEBIDO E CONSOLIDADO NO SISTEMA</strong>
                        </div>
                    </div>
                </div>
            </body>
            </html>
            `;

            await transporter.sendMail({
                from: config.from || `"CCO CEDAE" <${config.user}>`,
                to: emailDestino,
                subject: `[CCO CEDAE] Relatório de Expediente #${relatorio.id} - ${relatorio.setor_nome} (${relatorio.data_servico} - ${relatorio.turno})`,
                html
            });
            console.log(`✅ Relatório #${relatorio.id} enviado com sucesso por e-mail para ${emailDestino}`);
        } catch (error) {
            console.error('Erro ao enviar e-mail institucional CEDAE:', error.message);
        }
    }
}

module.exports = new EmailService();
