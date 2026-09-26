-- ============================================================================
-- CCO - CENTRO DE CONTROLE OPERACIONAL CEDAE
-- SCHEMA OFICIAL CENTRAL ONLINE (SUPABASE / POSTGRESQL)
-- Gerado com integridade total da base de 59 postos oficiais
-- ============================================================================

-- 0. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABELA SETORES
CREATE TABLE IF NOT EXISTS setores (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    sigla VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABELA SUPERVISORES
CREATE TABLE IF NOT EXISTS supervisores (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    matricula VARCHAR(50),
    telefone VARCHAR(50),
    setor_id INTEGER NOT NULL REFERENCES setores(id),
    funcao VARCHAR(100) DEFAULT 'Supervisor Operacional',
    status VARCHAR(20) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABELA VIATURAS
CREATE TABLE IF NOT EXISTS viaturas (
    id SERIAL PRIMARY KEY,
    tipo_modelo VARCHAR(100) NOT NULL,
    marca VARCHAR(50),
    placa VARCHAR(20) NOT NULL,
    prefixo VARCHAR(50),
    setor_id INTEGER NOT NULL REFERENCES setores(id),
    is_outros INTEGER NOT NULL DEFAULT 0,
    supervisor_id INTEGER REFERENCES supervisores(id),
    supervisor_nome VARCHAR(150),
    status VARCHAR(20) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABELA POSTOS (BASE OFICIAL CENTRAL DE 59 POSTOS)
CREATE TABLE IF NOT EXISTS postos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(200) NOT NULL,
    endereco TEXT,
    empresa VARCHAR(150) DEFAULT 'Segurança Patrimonial',
    localidade VARCHAR(100),
    regiao VARCHAR(100),
    setor_origem VARCHAR(100),
    setor_id INTEGER NOT NULL REFERENCES setores(id),
    tipo_posto VARCHAR(50) DEFAULT 'Patrimonial',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status VARCHAR(20) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    observacoes TEXT,
    supervisor_id INTEGER REFERENCES supervisores(id),
    supervisor_nome VARCHAR(150),
    viatura_id INTEGER REFERENCES viaturas(id),
    viatura_placa VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. TABELA PERMISSÕES DE SUPERVISÃO MULTI-SETOR (PLANTÃO SUPERVISIONA TODOS)
CREATE TABLE IF NOT EXISTS posto_setor_supervisao (
    id SERIAL PRIMARY KEY,
    posto_id INTEGER NOT NULL REFERENCES postos(id) ON DELETE CASCADE,
    setor_id INTEGER NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
    ativo INTEGER DEFAULT 1,
    usuario_responsavel VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(posto_id, setor_id)
);

-- 6. TABELA USUÁRIOS E AUTENTICAÇÃO
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    perfil VARCHAR(50) NOT NULL DEFAULT 'supervisor' CHECK (perfil IN ('admin', 'supervisor', 'consulta')),
    setor_id INTEGER REFERENCES setores(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. TABELA RELATÓRIOS DO EXPEDIENTE
CREATE TABLE IF NOT EXISTS relatorios (
    id SERIAL PRIMARY KEY,
    client_uuid VARCHAR(100) UNIQUE,
    setor_id INTEGER NOT NULL REFERENCES setores(id),
    supervisor_id INTEGER REFERENCES supervisores(id),
    viatura_id INTEGER REFERENCES viaturas(id),
    viatura_outros_texto TEXT,
    data_servico DATE NOT NULL,
    turno VARCHAR(30) NOT NULL CHECK (turno IN ('DIURNO', 'NOTURNO', 'PLANTÃO', 'PLANTAO')),
    km_inicial DOUBLE PRECISION,
    km_final DOUBLE PRECISION,
    km_rodado DOUBLE PRECISION,
    responsavel_nome VARCHAR(150),
    observacoes_gerais TEXT,
    providencias_gerais TEXT,
    pendencias_gerais TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'concluido' CHECK (status IN ('concluido', 'em_aberto', 'cancelado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. TABELA POSTOS VINCULADOS AO RELATÓRIO DO EXPEDIENTE
CREATE TABLE IF NOT EXISTS postos_relatorio (
    id SERIAL PRIMARY KEY,
    relatorio_id INTEGER NOT NULL REFERENCES relatorios(id) ON DELETE CASCADE,
    posto_id INTEGER REFERENCES postos(id),
    nome_posto_digitado VARCHAR(200),
    horario_supervisao VARCHAR(20),
    situacao_encontrada TEXT,
    efetivo_presente INTEGER DEFAULT 1,
    status_supervisao VARCHAR(30) NOT NULL DEFAULT 'NORMAL' CHECK (status_supervisao IN ('NORMAL', 'COM_OCORRENCIA', 'PENDENCIA', 'SEM_ALTERACAO', 'NAO_SUPERVISIONADO')),
    supervisionado INTEGER NOT NULL DEFAULT 1,
    motivo_nao_supervisao TEXT,
    km_posto DOUBLE PRECISION,
    efetivo_completo INTEGER DEFAULT 1,
    falta_efetivo_qtd VARCHAR(50),
    tem_ocorrencia INTEGER DEFAULT 0,
    descricao_ocorrencia TEXT,
    observacao TEXT,
    endereco TEXT,
    localidade VARCHAR(100),
    empresa VARCHAR(150),
    setor_id_posto INTEGER REFERENCES setores(id),
    setor_nome_posto VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. TABELA OCORRÊNCIAS
CREATE TABLE IF NOT EXISTS ocorrencias (
    id SERIAL PRIMARY KEY,
    relatorio_id INTEGER NOT NULL REFERENCES relatorios(id) ON DELETE CASCADE,
    posto_id INTEGER REFERENCES postos(id),
    tipo_ocorrencia VARCHAR(50) DEFAULT 'Geral',
    descricao TEXT NOT NULL,
    providencias_adotadas TEXT,
    status VARCHAR(30) DEFAULT 'resolvido' CHECK (status IN ('resolvido', 'pendente', 'em_analise')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. TABELA CONTROLE DE ACESSO (MOVIMENTAÇÃO E VISITANTES)
CREATE TABLE IF NOT EXISTS controle_acesso (
    id SERIAL PRIMARY KEY,
    posto_id INTEGER NOT NULL REFERENCES postos(id),
    posto_nome VARCHAR(200),
    setor_id INTEGER REFERENCES setores(id),
    ano_mes VARCHAR(10) NOT NULL,
    sequencial_mensal INTEGER NOT NULL,
    numero_registro VARCHAR(50) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
    data_registro DATE NOT NULL,
    hora_registro VARCHAR(20) NOT NULL,
    identificacao_nome VARCHAR(150) NOT NULL,
    documento VARCHAR(50),
    empresa VARCHAR(150),
    motivo TEXT,
    veiculo_modelo VARCHAR(100),
    veiculo_placa VARCHAR(30),
    observacao TEXT,
    supervisor_id INTEGER REFERENCES supervisores(id),
    supervisor_nome VARCHAR(150),
    usuario_nome VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. TABELA FECHAMENTOS DO LIVRO DIGITAL
CREATE TABLE IF NOT EXISTS livro_digital_fechamentos (
    id SERIAL PRIMARY KEY,
    tipo_fechamento VARCHAR(20) NOT NULL CHECK (tipo_fechamento IN ('TURNO', 'DIA', 'MES')),
    periodo_referencia VARCHAR(50) NOT NULL,
    posto_id INTEGER REFERENCES postos(id),
    posto_nome VARCHAR(200),
    setor_id INTEGER REFERENCES setores(id),
    responsavel_nome VARCHAR(150) NOT NULL,
    total_movimentacoes INTEGER DEFAULT 0,
    total_entradas INTEGER DEFAULT 0,
    total_saidas INTEGER DEFAULT 0,
    observacoes TEXT,
    status VARCHAR(30) DEFAULT 'FECHADO',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. TABELA HISTÓRICO DE AUDITORIA E RECLASSIFICAÇÕES
CREATE TABLE IF NOT EXISTS historico_distribuicao_postos (
    id SERIAL PRIMARY KEY,
    posto_id INTEGER NOT NULL,
    posto_nome VARCHAR(200),
    setor_id INTEGER,
    setor_nome VARCHAR(100),
    setor_anterior_id INTEGER,
    setor_anterior_nome VARCHAR(100),
    setor_novo_id INTEGER,
    setor_novo_nome VARCHAR(100),
    acao VARCHAR(50) NOT NULL,
    usuario_nome VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. CONFIGURAÇÕES
CREATE TABLE IF NOT EXISTS configuracoes (
    chave VARCHAR(100) PRIMARY KEY,
    valor TEXT NOT NULL,
    descricao TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE postos ENABLE ROW LEVEL SECURITY;
ALTER TABLE setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisores ENABLE ROW LEVEL SECURITY;
ALTER TABLE viaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE relatorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE postos_relatorio ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE controle_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE livro_digital_fechamentos ENABLE ROW LEVEL SECURITY;

-- POLICIES DE SEGURANÇA
CREATE POLICY "Leitura pública de postos autenticados" ON postos FOR SELECT USING (true);
CREATE POLICY "Leitura de setores" ON setores FOR SELECT USING (true);
CREATE POLICY "Leitura de viaturas" ON viaturas FOR SELECT USING (true);
CREATE POLICY "Leitura de supervisores" ON supervisores FOR SELECT USING (true);
CREATE POLICY "Inserção de relatórios" ON relatorios FOR INSERT WITH CHECK (true);
CREATE POLICY "Leitura de relatórios" ON relatorios FOR SELECT USING (true);
CREATE POLICY "Inserção de postos_relatorio" ON postos_relatorio FOR INSERT WITH CHECK (true);
CREATE POLICY "Leitura de postos_relatorio" ON postos_relatorio FOR SELECT USING (true);
CREATE POLICY "Acesso a controle de acesso" ON controle_acesso FOR ALL USING (true);
CREATE POLICY "Acesso a fechamentos de livro" ON livro_digital_fechamentos FOR ALL USING (true);

-- ============================================================================
-- DADOS INICIAIS OFICIAIS (59 POSTOS, SETORES, SUPERVISORES, VIATURAS, USUÁRIOS)
-- ============================================================================

-- INSERIR SETORES
INSERT INTO setores (id, nome, sigla, status, observacao) VALUES (1, 'CCO TINGUÁ', 'TINGUA', 'ativo', 'Atualizado em auditoria automática') ON CONFLICT (id) DO NOTHING;
INSERT INTO setores (id, nome, sigla, status, observacao) VALUES (2, 'CCO GUANDU', 'GUANDU', 'ativo', 'Complexo Operacional do Guandu') ON CONFLICT (id) DO NOTHING;
INSERT INTO setores (id, nome, sigla, status, observacao) VALUES (3, 'CCO LARANJAL', 'LARANJAL', 'ativo', 'Complexo Operacional do Laranjal e Elevatórias') ON CONFLICT (id) DO NOTHING;
INSERT INTO setores (id, nome, sigla, status, observacao) VALUES (4, 'PLANTÃO', 'PLANTAO', 'ativo', 'Equipes e Atividades de Plantão Geral / Assessoria') ON CONFLICT (id) DO NOTHING;
SELECT setval('setores_id_seq', (SELECT MAX(id) FROM setores));

-- INSERIR OS 59 POSTOS OFICIAIS
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (1, 'PRÉDIO SEDE - CEDAE CENTRO', 'Avenida Presidente Vargas, nº 2655 - Centro', 'FXX', 'Centro', '', 4, 'Patrimonial', 'ativo', 'Atualizado pelo Teste 4') ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (2, 'PRÉDIO - CMA - BOTAFOGO', 'Rua Mena Barreto, nº 76 - Botafogo', 'CEMAX', 'Botafogo', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (3, 'Rua de Santana - ASU - GER', 'Rua de Santana, nº 235 - Centro', 'CEMAX', 'Centro', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (4, 'LADEIRA DE SÃO BENTO', 'Praça Mauá, nº 1 - Centro', 'FXX', 'Praça Mauá', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (5, 'G.1 - G2 (Rua Equador - Santo Cristo)', 'Rua Equador, nº 76 - Santo Cristo', 'CEMAX', 'Santo Cristo', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (6, 'ASU - DF (Rua Bela)', 'Rua Bela, nº 1292 - São Cristóvão', 'CEMAX', 'São Cristóvão', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (7, 'UNIVERCEDAE', 'Rua Euclides Cunha, nº 95 - São Cristóvão', 'FXX', 'São Cristóvão', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (8, 'OFICINA DE MANUTENÇÃO CEDAE - COMPLEXO DO CAJU', 'Rua Carlos Seid, nº 1580 - Caju', 'FXX', 'Caju', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (9, 'ELEVATÓRIA DO LAMEIRÃO', 'Rua Uirapuru, nº 540 - Santíssimo', 'FORÇA TÁTICA', 'Santíssimo', '', 2, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (10, 'GOM-5 (Capitão Félix)', 'Rua Capitão Félix, nº 426 - Benfica', 'CEMAX', 'Benfica', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (11, 'ALMOXARIFADO DO RIACHUELO', 'Rua Filgueira Lima, nº 52 - Riachuelo', 'CEMAX', 'Riachuelo', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (12, 'POSTO OTÁVIO KELLY LAAPA', 'Rua Otávio Kelly, 81 - Tijuca', 'CEMAX', 'Tijuca', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (13, 'LABORATÓRIO - GCQ / CEDAE - COMPLEXO DO CAJU (Otávio Kelly)', 'Rua Otávio Kelly, 110 - Tijuca', 'FORÇA TÁTICA | FXX', 'Tijuca', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (14, 'PRÉDIO FELIPE CAMARÃO', 'Felipe Camarão, nº 83 - Vila Isabel', 'FORÇA TÁTICA', 'Vila Isabel', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (15, 'OFICINA DE HIDRÔMETRO GCG-6', 'Rua Pernambuco, nº 1 - Engenho de Dentro', 'ANGEL''S', 'Engenho de Dentro', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (16, 'REPRESA DA MANTIQUIRA', 'Rua Márcio S. Silva, s/n - Vila Alice', 'FORÇA TÁTICA', 'Vila Alice', '', 1, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (17, 'REPRESA DE XERÉM', 'Estr. Represa de Xerém, s/nº - Xerém', 'FORÇA TÁTICA', 'Xerém', '', 1, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (18, 'GOM - 2.1 EQUIPAMENTOS (Juramento)', 'Av. Meriti, nº 18 - Irajá', 'CEMAX', 'Irajá', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (19, 'GOM - 6 (Juramento)', 'Rua Alecrim, nº 1074 - Vila Cosmos', 'CEMAX', 'Vila Cosmos', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (20, 'GOM - 4 (Juramento)', 'Rua Alecrim, nº 1085 - Vila Cosmos', 'CEMAX', 'Vila Cosmos', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (21, 'DDEO - 1 - GRN (Deodoro)', 'Rua João Vicente, nº 2231 - Deodoro', 'CEMAX', 'Deodoro', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (22, 'BOOSTER (Sulacap)', 'Estr. Japore, 941 - Jardim Sulacap', 'CEMAX', 'Jardim Sulacap', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (23, 'PRECE (Base Plantão 24h)', 'Rua Prefeito Olímpio de Melo, 1676', 'CEMAX', 'Benfica', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (24, 'MENDANHA (2056) - GOM 4', 'Alm. Est. do Mendanha, nº 2056 - Campo Grande', 'CEMAX', 'Campo Grande', '', 2, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (25, 'ALMOXARIFADO CEDAE (51100)', 'Av. Brasil, 51.100 - Campo Grande', 'CEMAX', 'Campo Grande', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (26, 'ETA TINGUÁ CAPTAÇÃO', 'Rua Nossa Senhora da Conceição, nº 397 - Tinguá', 'CEMAX', 'Tinguá', '', 1, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (27, 'REPRESA SÃO PEDRO - JACERUBA', 'Estrada da Represa, s/n - Jaceruba', 'CEMAX', 'Jaceruba', '', 1, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (28, 'RESERVATÓRIO MOTO CROSS', 'Alameda, s/n - Campos Elíseos', 'CEMAX', 'Duque de Caxias', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (29, 'BOOSTER MOTO CROSS', 'Rua Borges Carneiro, s/n', 'CEMAX', 'Duque de Caxias', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (30, 'ELEVATÓRIA ZONA RURAL - GUANDU', 'RJ 105 - KM 32', 'FXX', 'Guandu - Nova Iguaçu', '', 2, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (31, 'GOM - 4.3 - COORDENAÇÃO DE MANUTENÇÃO (Belford Roxo)', 'Av. Florípedes Rocha, nº 42 - Belford Roxo', 'CEMAX', 'Belford Roxo', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (32, 'CASA DE BAMBU', 'Estrada Boa Esperança, s/n - Tinguá', 'CEMAX', 'Tinguá', '', 1, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (33, 'BOA ESPERANÇA (Tinguá)', 'Estrada Boa Esperança, s/n - Tinguá', 'CEMAX', 'Tinguá', '', 1, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (34, 'BARRELÃO (Tinguá)', 'Rua Nossa Senhora da Conceição, 397 - Tinguá', 'CEMAX', 'Tinguá', '', 1, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (35, 'BRG - GUANDU', 'Av. Min. Ferdnando Costa, nº 1', 'FORÇA TÁTICA', 'Guandu - Nova Iguaçu', '', 2, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (36, 'BRG - GUANDU AUXILIAR (PERÓXIDO)', 'Av. Min. Ferdnando Costa, nº 1', 'FORÇA TÁTICA', 'Guandu - Nova Iguaçu', '', 2, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (37, 'RIO D''OURO', 'Rio D''Ouro', 'FORÇA TÁTICA', 'Rio D''Ouro', '', 1, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (38, 'BARRAGEM AUXILIAR', 'Rua do Dique - esq. com Rua da Adutora', 'FORÇA TÁTICA', 'Guandu - Nova Iguaçu', '', 2, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (39, 'BARRAGEM PRINCIPAL', 'Rua do Dique - esq. com Rua da Adutora', 'FORÇA TÁTICA', 'Guandu - Nova Iguaçu', '', 2, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (40, 'GGL - ETA GUANDU', 'Estr. Rio São Paulo, nº 19 - Jardim Guandu', 'FORÇA TÁTICA', 'Guandu - Nova Iguaçu', '', 2, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (41, 'LAGOA DO GUANDU', 'Estrada do Dique, s/n', 'CEMAX', 'Guandu - Nova Iguaçu', '', 2, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (42, 'ETA JAPERI', 'Estrada Miguel Pereira, s/n - Seropédica', 'FORÇA TÁTICA', 'Seropédica', '', 1, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (43, 'TÚNEL IV', 'Rodovia Presidente Dutra, KM 212 - Paracambi', 'FORÇA TÁTICA', 'Paracambi', '', 1, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (44, 'GMP - SEDE GERÊNCIA (Piraí)', 'Rua Cpt. Manoel Torres, 283 - Piraí', 'FXX', 'Piraí', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (45, 'LOJA COMERCIAL (Angra dos Reis)', 'Rua Professor Lima, nº 140 - Centro', 'CEMAX', 'Angra dos Reis', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (46, 'ASU - 1.1 - G.4 (Niterói)', 'Trav. Sto Antônio, s/n - Centro de Niterói', 'CEMAX', 'Niterói', '', 3, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (47, 'CHÁCARA DO VINTÉM', 'Rua Andrade Pinto, nº 643 - Niterói', 'CEMAX', 'Niterói', '', 3, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (48, 'GIL - 5.3 PEDRINHAS', 'Estrada das Pedrinhas, 417 - São Gonçalo', 'FXX', 'São Gonçalo', '', 3, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (49, 'GIL - 4 ETA LARANJAL', 'Rua José Rosendo de Souza, nº 1419 - São Gonçalo', 'FXX', 'São Gonçalo', '', 3, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (50, 'GIL - 3.3 ELE DE IMUNANA', 'Rod. de Contorno da Guanabara, nº 4540 - Guapimirim', 'CEMAX', 'Guapimirim', '', 3, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (51, 'GIL - 3 BARRAGEM DE IMUNANA', 'Rod. de Contorno da Guanabara, nº 4540 - Guapimirim', 'CEMAX', 'Guapimirim', '', 3, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (52, 'PARQUE DOS TUBOS (Teresópolis)', 'Rua Guandu, s/n - Pimenteiras - Teresópolis', 'CEMAX', 'Teresópolis', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (53, 'GSE GERÊNCIA (Teresópolis)', 'Av. Feliciano Sodré, nº 848 - Teresópolis', 'CEMAX', 'Teresópolis', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (54, 'ALMOXARIFADO (Macaé)', 'Parque Aereporto Macaé ALM R 26 - S/Nº', 'CEMAX', 'Macaé', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (55, 'SEDE GLN (Macaé)', 'Av. Rui Barbosa, 870 - Centro - Macaé', 'FXX', 'Macaé', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (56, 'ETA MACAÉ', 'Rua Alcides Vieira - Morro do Santana - Macaé', 'FXX', 'Macaé', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (57, 'AGÊNCIA CAMPOS', 'Rua Treze de Maio, 77 - Centro - Campos dos Goytacazes', 'CEMAX', 'Campos dos Goytacazes', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (58, 'GRN - SEDE GERÊNCIA (Itaperuna)', 'Rua Tenente Otaviano, 4 - Horto - Itaperuna', 'FXX', 'Itaperuna', '', 4, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
INSERT INTO postos (id, nome, endereco, empresa, localidade, regiao, setor_id, tipo_posto, status, observacoes) VALUES (59, 'MENDANHA (3109) - GOM - 4', 'Estrada do Mendanha, nº 3109 - Campo Grande', 'CEMAX', 'Campo Grande', '', 2, 'Patrimonial', 'ativo', NULL) ON CONFLICT (id) DO UPDATE SET setor_id = EXCLUDED.setor_id;
SELECT setval('postos_id_seq', (SELECT MAX(id) FROM postos));

-- INSERIR SUPERVISORES
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (1, 'ANTONIO CARLOS', '1671', '(21) 996623578', 1, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (2, 'ALEX CARREIRO', '1695', '(21) 974480532', 1, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (3, 'ANDRÉ LUGARINE', '1696', '(21) 970779740', 1, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (4, 'EDUARDO ALBERTO', '1699', '(21) 999207221', 1, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (5, 'JASON HENRIQUE', '1701', '(21) 969860024', 1, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (6, 'LAURINDO LEMOS', '1691', '(21) 968006254', 1, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (7, 'ROBSON SANTOS', '1703', '(21) 975139853', 1, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (8, 'EDUARDO ACIOLE', '1700', '(21) 98000-1700', 2, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (9, 'ELIEZER GONÇALVES', '1685', '(21) 98000-1685', 2, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (10, 'LUIZ CLAUDIO', '1712', '(21) 98000-1712', 2, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (11, 'JOSÉ DINIZ', '1665', '(21) 98000-1801', 3, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (12, 'DANIEL NEROS', '1673', '(21) 98000-1802', 3, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (13, 'FABIO CHAGAS', '1686', '(21) 98000-1901', 3, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (14, 'WALLACE OLIVEIRA', '1639', '(21) 98000-1902', 3, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (15, 'PEDRO JESUS', '1821', '21972051979', 1, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (16, 'ANDERSON JOSE', '1707', NULL, 3, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (17, 'RICARDO LOURENÇO', '1708', NULL, 3, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (18, 'LUCIANA ROCHA', '1641', NULL, 3, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (19, 'EDIVAN LUCIANO', '1674', '', 2, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (20, 'ALEXANDER ALVES', '1668', NULL, 2, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (21, 'ARMANDO ASSIS', '1683', NULL, 2, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (22, 'ANDRÉ VENTURA', '1697', NULL, 2, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (33, 'SUPERVISOR LARANJAL 01', '1801', '(21) 98000-1801', 3, 'inativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (34, 'SUPERVISOR LARANJAL 02', '1802', '(21) 98000-1802', 3, 'inativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (35, 'JOSÉ ROBERTO GAMA TOBIAS', '1678', '(21) 98000-1901', 4, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (36, 'LEONILSON TIBURCIO DA SILVA', '1638', '(21) 98000-1902', 4, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (37, 'ROBERTO BARROS DA SILVA', '1637', '(21) 98000-1903', 4, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (38, 'LUIZ RANGEL', '13232-9', '(21) 97777-8888', 4, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (39, 'SUPERVISOR TESTE AUDITORIA', 'MAT5406', '(21) 98888-7777', 1, 'inativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (40, 'SUPERVISOR TESTE AUDITORIA', 'MAT4269', '(21) 98888-7777', 1, 'inativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (41, 'SUPERVISOR TESTE AUDITORIA', 'MAT4010', '(21) 98888-7777', 1, 'inativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (43, 'SUPERVISOR TESTE AUDITORIA', 'MAT5144', '(21) 98888-7777', 1, 'inativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO supervisores (id, nome, matricula, telefone, setor_id, status) VALUES (44, 'SUPERVISOR TESTE AUDITORIA', 'MAT9079', '(21) 98888-7777', 1, 'inativo') ON CONFLICT (id) DO NOTHING;
SELECT setval('supervisores_id_seq', (SELECT MAX(id) FROM supervisores));

-- INSERIR VIATURAS
INSERT INTO viaturas (id, tipo_modelo, marca, placa, setor_id, status) VALUES (1, 'S-10', 'CHEVROLET', 'TTU2F83', 1, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO viaturas (id, tipo_modelo, marca, placa, setor_id, status) VALUES (2, 'L200 Triton', 'MITSUBISHI', 'TUH1G04', 1, 'inativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO viaturas (id, tipo_modelo, marca, placa, setor_id, status) VALUES (3, 'Argo 1.3', 'FIAT', 'TTS1H48', 2, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO viaturas (id, tipo_modelo, marca, placa, setor_id, status) VALUES (4, 'Argo 1.3', 'FIAT', 'TTJ6I06', 3, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO viaturas (id, tipo_modelo, marca, placa, setor_id, status) VALUES (5, 'Spin Operacional', 'CHEVROLET', 'PLT-0001', 4, 'inativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO viaturas (id, tipo_modelo, marca, placa, setor_id, status) VALUES (9, 'Hilux 4x4', 'TOYOTA', 'PLACA A CADASTRAR', 3, 'inativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO viaturas (id, tipo_modelo, marca, placa, setor_id, status) VALUES (11, 'Argo 1.3', 'FIAT', 'TUS1F98', 4, 'ativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO viaturas (id, tipo_modelo, marca, placa, setor_id, status) VALUES (12, 'Hilux 4x4', 'TOYOTA', 'PLT-0003', 4, 'inativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO viaturas (id, tipo_modelo, marca, placa, setor_id, status) VALUES (13, 'HILUX 4X4 OPERACIONAL', 'TOYOTA', 'TST4407', 1, 'inativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO viaturas (id, tipo_modelo, marca, placa, setor_id, status) VALUES (14, 'HILUX 4X4 OPERACIONAL', 'TOYOTA', 'TST6672', 1, 'inativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO viaturas (id, tipo_modelo, marca, placa, setor_id, status) VALUES (15, 'HILUX 4X4 OPERACIONAL', 'TOYOTA', 'TST3578', 1, 'inativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO viaturas (id, tipo_modelo, marca, placa, setor_id, status) VALUES (17, 'HILUX 4X4 OPERACIONAL', 'TOYOTA', 'TST1380', 1, 'inativo') ON CONFLICT (id) DO NOTHING;
INSERT INTO viaturas (id, tipo_modelo, marca, placa, setor_id, status) VALUES (18, 'HILUX 4X4 OPERACIONAL', 'TOYOTA', 'TST8271', 1, 'inativo') ON CONFLICT (id) DO NOTHING;
SELECT setval('viaturas_id_seq', (SELECT MAX(id) FROM viaturas));

-- INSERIR USUÁRIOS COM HASH BCRYPT
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, setor_id, status) VALUES (1, 'ADMINISTRADOR CCO (Eduardo)', 'eduardoalbertonsantos@gmail.com', '$2a$10$KM2Cbfh/eBmzCRSlC/5Y0uWg3foh7AI5w8Tz0XHE4qCgOqmo5QiJ.', 'admin', NULL, 'ativo') ON CONFLICT (email) DO NOTHING;
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, setor_id, status) VALUES (2, 'ADMINISTRADOR CCO', 'admin@cedae.gov.br', '$2a$10$KM2Cbfh/eBmzCRSlC/5Y0uWg3foh7AI5w8Tz0XHE4qCgOqmo5QiJ.', 'admin', NULL, 'ativo') ON CONFLICT (email) DO NOTHING;
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, setor_id, status) VALUES (3, 'SUPERVISOR TINGUÁ', 'tingua@cedae.gov.br', '$2a$10$KM2Cbfh/eBmzCRSlC/5Y0uWg3foh7AI5w8Tz0XHE4qCgOqmo5QiJ.', 'supervisor', 1, 'ativo') ON CONFLICT (email) DO NOTHING;
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, setor_id, status) VALUES (4, 'SUPERVISOR GUANDU', 'guandu@cedae.gov.br', '$2a$10$KM2Cbfh/eBmzCRSlC/5Y0uWg3foh7AI5w8Tz0XHE4qCgOqmo5QiJ.', 'supervisor', 2, 'ativo') ON CONFLICT (email) DO NOTHING;
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, setor_id, status) VALUES (5, 'SUPERVISOR LARANJAL', 'laranjal@cedae.gov.br', '$2a$10$KM2Cbfh/eBmzCRSlC/5Y0uWg3foh7AI5w8Tz0XHE4qCgOqmo5QiJ.', 'supervisor', 3, 'ativo') ON CONFLICT (email) DO NOTHING;
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, setor_id, status) VALUES (6, 'SUPERVISOR PLANTÃO', 'plantao@cedae.gov.br', '$2a$10$KM2Cbfh/eBmzCRSlC/5Y0uWg3foh7AI5w8Tz0XHE4qCgOqmo5QiJ.', 'supervisor', 4, 'ativo') ON CONFLICT (email) DO NOTHING;
SELECT setval('usuarios_id_seq', (SELECT MAX(id) FROM usuarios));

-- INSERIR ATRIBUIÇÕES DE SUPERVISÃO MULTI-SETOR
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (1, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (2, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (3, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (4, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (5, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (6, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (7, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (8, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (9, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (10, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (11, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (12, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (13, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (14, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (15, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (16, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (17, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (18, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (19, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (20, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (21, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (22, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (23, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (24, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (25, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (26, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (27, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (28, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (29, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (30, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (31, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (32, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (33, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (34, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (35, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (36, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (37, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (38, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (39, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (40, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (41, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (42, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (43, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (44, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (45, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (46, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (47, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (48, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (49, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (50, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (51, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (52, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (53, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (54, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (55, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (56, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (57, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (58, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (59, 4, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (9, 2, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (16, 1, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (17, 1, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (24, 2, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (26, 1, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (27, 1, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (30, 2, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (32, 1, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (33, 1, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (34, 1, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (35, 2, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (36, 2, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (37, 1, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (38, 2, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (39, 2, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (40, 2, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (41, 2, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (42, 1, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (43, 1, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (46, 3, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (47, 3, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (48, 3, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (49, 3, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (50, 3, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (51, 3, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo) VALUES (59, 2, 1) ON CONFLICT (posto_id, setor_id) DO NOTHING;
