-- CCO - CONTROLE OPERACIONAL CEDAE
-- Carga Inicial de Dados Reais

-- 1. SETORES OPERACIONAIS
INSERT OR IGNORE INTO setores (id, nome, sigla, status, observacao) VALUES
(1, 'CCO TINGUÁ', 'TINGUA', 'ativo', 'Setor Operacional Tinguá / Acari'),
(2, 'CCO GUANDU', 'GUANDU', 'ativo', 'Complexo Operacional do Guandu'),
(3, 'CCO LARANJAL', 'LARANJAL', 'ativo', 'Complexo Operacional do Laranjal e Elevatórias'),
(4, 'PLANTÃO', 'PLANTAO', 'ativo', 'Equipes e Atividades de Plantão Geral / Assessoria');

-- 2. SUPERVISORES
-- Tinguá (setor 1)
INSERT OR IGNORE INTO supervisores (nome, matricula, telefone, setor_id, funcao, status) VALUES
('ACARLOS', '1671', '(21) 98000-1671', 1, 'Supervisor Operacional', 'ativo'),
('ALEX', '1695', '(21) 98000-1695', 1, 'Supervisor Operacional', 'ativo'),
('ANDRÉ', '1696', '(21) 98000-1696', 1, 'Supervisor Operacional', 'ativo'),
('EDUARDO', '1699', '(21) 98000-1699', 1, 'Supervisor Operacional', 'ativo'),
('JASON', '1701', '(21) 98000-1701', 1, 'Supervisor Operacional', 'ativo'),
('LAURINDO', '1691', '(21) 98000-1691', 1, 'Supervisor Operacional', 'ativo'),
('ROBSON', '1703', '(21) 98000-1703', 1, 'Supervisor Operacional', 'ativo');

-- Guandu (setor 2)
INSERT OR IGNORE INTO supervisores (nome, matricula, telefone, setor_id, funcao, status) VALUES
('EDUARDO ACIOLE', '1700', '(21) 98000-1700', 2, 'Supervisor Operacional', 'ativo'),
('ELIEZER GONÇALVES', '1685', '(21) 98000-1685', 2, 'Supervisor Operacional', 'ativo'),
('LUIZ CLAUDIO', '1712', '(21) 98000-1712', 2, 'Supervisor Operacional', 'ativo');

-- Laranjal (setor 3)
INSERT OR IGNORE INTO supervisores (nome, matricula, telefone, setor_id, funcao, status) VALUES
('SUPERVISOR LARANJAL 01', '1801', '(21) 98000-1801', 3, 'Supervisor Operacional', 'ativo'),
('SUPERVISOR LARANJAL 02', '1802', '(21) 98000-1802', 3, 'Supervisor Operacional', 'ativo');

-- Plantão (setor 4)
INSERT OR IGNORE INTO supervisores (nome, matricula, telefone, setor_id, funcao, status) VALUES
('SUPERVISOR PLANTÃO 01', '1901', '(21) 98000-1901', 4, 'Supervisor de Plantão', 'ativo'),
('SUPERVISOR PLANTÃO 02', '1902', '(21) 98000-1902', 4, 'Supervisor de Plantão', 'ativo'),
('SUPERVISOR PLANTÃO 03', '1903', '(21) 98000-1903', 4, 'Supervisor de Plantão', 'ativo'),
('SUPERVISOR PLANTÃO 04', '1904', '(21) 98000-1904', 4, 'Supervisor de Plantão', 'ativo');

-- 3. VIATURAS
-- Tinguá (setor 1)
INSERT OR IGNORE INTO viaturas (tipo_modelo, marca, placa, prefixo, setor_id, is_outros, status) VALUES
('S-10 Cabine Dupla', 'CHEVROLET', 'TTU2F83', 'VTR-TINGUA-01', 1, 0, 'ativo'),
('L200 Triton', 'MITSUBISHI', 'TUH1G04', 'VTR-TINGUA-02', 1, 0, 'ativo');

-- Guandu (setor 2)
INSERT OR IGNORE INTO viaturas (tipo_modelo, marca, placa, prefixo, setor_id, is_outros, status) VALUES
('Argo 1.3', 'FIAT', 'TTS1H48', 'VTR-GUANDU-01', 2, 0, 'ativo');

-- Laranjal (setor 3)
INSERT OR IGNORE INTO viaturas (tipo_modelo, marca, placa, prefixo, setor_id, is_outros, status) VALUES
('Argo 1.3', 'FIAT', 'TTJ6I06', 'VTR-LARANJAL-01', 3, 0, 'ativo');

-- Plantão (setor 4)
INSERT OR IGNORE INTO viaturas (tipo_modelo, marca, placa, prefixo, setor_id, is_outros, status) VALUES
('Spin Operacional', 'CHEVROLET', 'PLT-0001', 'VTR-PLT-01', 4, 0, 'ativo'),
('Duster 4x4', 'RENAULT', 'PLT-0002', 'VTR-PLT-02', 4, 0, 'ativo'),
('Hilux 4x4', 'TOYOTA', 'PLT-0003', 'VTR-PLT-03', 4, 0, 'ativo');


-- 4. POSTOS OPERACIONAIS
-- Tinguá (setor 1)
INSERT OR IGNORE INTO postos (nome, endereco, empresa, setor_id, tipo_posto, status) VALUES
('BARRELÃO', 'Estrada do Tinguá', 'Segurança Patrimonial', 1, 'Reservatório / Estação', 'ativo'),
('BOA ESPERANÇA', 'Estrada Velha de Tinguá', 'Segurança Patrimonial', 1, 'Captação', 'ativo'),
('CASA DE BAMBU', 'Tinguá / Reserva Florestal', 'Segurança Patrimonial', 1, 'Posto Remoto', 'ativo'),
('ETA BARRELÃO', 'Estrada do Barrelão, S/N', 'Segurança Patrimonial', 1, 'Estação de Tratamento', 'ativo'),
('ETA JAPERI', 'Japeri - Centro', 'Segurança Patrimonial', 1, 'Estação de Tratamento', 'ativo'),
('MACUCO', 'Estrada do Macuco', 'Segurança Patrimonial', 1, 'Captação', 'ativo'),
('MANTIQUEIRA', 'Mantiqueira', 'Segurança Patrimonial', 1, 'Posto Operacional', 'ativo'),
('MICRO ETA JACERUBA', 'Jaceruba', 'Segurança Patrimonial', 1, 'Estação de Tratamento', 'ativo'),
('REPRESA DE SÃO PEDRO', 'São Pedro', 'Segurança Patrimonial', 1, 'Manancial / Represa', 'ativo'),
('REPRESA DE XERÉM', 'Xerém', 'Segurança Patrimonial', 1, 'Manancial / Represa', 'ativo'),
('RIO D’OURO', 'Reserva Rio D’Ouro', 'Segurança Patrimonial', 1, 'Manancial', 'ativo'),
('TÚNEL IV — ETA JAPERI', 'Japeri', 'Segurança Patrimonial', 1, 'Galeria / Túnel', 'ativo');

-- Guandu (setor 2)
INSERT OR IGNORE INTO postos (nome, endereco, empresa, setor_id, tipo_posto, status) VALUES
('ETA GUANDU', 'Km 34 - Nova Iguaçu', 'Segurança Patrimonial', 2, 'Complexo Principal', 'ativo'),
('BRG — PRINCIPAL', 'Acesso Guandu', 'Segurança Patrimonial', 2, 'Portaria Principal', 'ativo'),
('BRG — PERÓXIDO', 'Área de Tratamento Químico', 'Segurança Patrimonial', 2, 'Área Crítica', 'ativo'),
('ELEVATÓRIA ZONA RURAL', 'Zona Rural de Nova Iguaçu', 'Segurança Patrimonial', 2, 'Elevatória', 'ativo'),
('ELEVATÓRIA DO LAMEIRÃO', 'Serra do Mendanha / Campo Grande', 'Segurança Patrimonial', 2, 'Elevatória Subterrânea', 'ativo'),
('BARRAGEM PRINCIPAL', 'Rio Guandu', 'Segurança Patrimonial', 2, 'Barragem', 'ativo'),
('BARRAGEM AUXILIAR', 'Rio Guandu Auxiliar', 'Segurança Patrimonial', 2, 'Barragem', 'ativo'),
('LAGOA DE BOMBEAMENTO', 'Bacia do Guandu', 'Segurança Patrimonial', 2, 'Lagoa de Sucção', 'ativo'),
('ALMOXARIFADO — PALMARES', 'Palmares', 'Segurança Patrimonial', 2, 'Almoxarifado Geral', 'ativo'),
('MENDANHA Nº 2056', 'Estrada do Mendanha, 2056', 'Segurança Patrimonial', 2, 'Adutora', 'ativo'),
('MENDANHA Nº 3109', 'Estrada do Mendanha, 3109', 'Segurança Patrimonial', 2, 'Adutora', 'ativo');

-- Laranjal (setor 3)
INSERT OR IGNORE INTO postos (nome, endereco, empresa, setor_id, tipo_posto, status) VALUES
('ETA LARANJAL', 'São Gonçalo / Itaboraí', 'Segurança Patrimonial', 3, 'Complexo Principal', 'ativo'),
('ELEVATÓRIA DE PEDRINHAS', 'Pedrinhas', 'Segurança Patrimonial', 3, 'Elevatória', 'ativo'),
('ELEVATÓRIA IMUNANA', 'Imunana', 'Segurança Patrimonial', 3, 'Captação Imunana', 'ativo');

-- Plantão (setor 4)
INSERT OR IGNORE INTO postos (nome, endereco, empresa, setor_id, tipo_posto, status) VALUES
('BASE CENTRAL CCO', 'Sede Operacional', 'Segurança Corporativa', 4, 'Central de Monitoramento', 'ativo'),
('APOIO EXTERNO / ESCOLTA', 'Itinerante', 'Segurança Corporativa', 4, 'Móvel', 'ativo');

-- 5. CONFIGURAÇÕES
INSERT OR IGNORE INTO configuracoes (chave, valor, descricao) VALUES
('email_destino_relatorios', 'eduardoalbertonsantos@gmail.com', 'Destinatário dos relatórios de expediente'),
('whatsapp_grupo_nome', 'CCO CEDAE OPERACIONAL', 'Nome de referência para compartilhamento'),
('sistema_titulo', 'CCO — CONTROLE OPERACIONAL CEDAE', 'Título oficial da aplicação');
