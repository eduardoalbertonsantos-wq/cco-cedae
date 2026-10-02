-- CCO - CONTROLE OPERACIONAL CEDAE
-- Schema Atualizado e Relacional

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. SETORES
CREATE TABLE IF NOT EXISTS setores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    sigla TEXT,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    observacao TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. SUPERVISORES
CREATE TABLE IF NOT EXISTS supervisores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    matricula TEXT,
    telefone TEXT,
    setor_id INTEGER NOT NULL,
    funcao TEXT DEFAULT 'Supervisor Operacional',
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (setor_id) REFERENCES setores(id)
);

-- 3. VIATURAS
CREATE TABLE IF NOT EXISTS viaturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_modelo TEXT NOT NULL,
    marca TEXT,
    placa TEXT NOT NULL,
    prefixo TEXT,
    setor_id INTEGER NOT NULL,
    is_outros INTEGER NOT NULL DEFAULT 0,
    supervisor_id INTEGER,
    supervisor_nome TEXT,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    observacao TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (setor_id) REFERENCES setores(id),
    FOREIGN KEY (supervisor_id) REFERENCES supervisores(id)
);

-- 4. POSTOS
CREATE TABLE IF NOT EXISTS postos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    endereco TEXT,
    empresa TEXT,
    localidade TEXT,
    regiao TEXT,
    setor_origem TEXT,
    setor_id INTEGER NOT NULL,
    tipo_posto TEXT DEFAULT 'Patrimonial',
    latitude REAL,
    longitude REAL,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (setor_id) REFERENCES setores(id)
);

-- 4.1 RELACIONAMENTO N:N DE POSTOS COM SETORES (CADASTRO CENTRAL E COMPARTILHAMENTO)
CREATE TABLE IF NOT EXISTS posto_setores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    posto_id INTEGER NOT NULL,
    setor_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (posto_id) REFERENCES postos(id) ON DELETE CASCADE,
    FOREIGN KEY (setor_id) REFERENCES setores(id) ON DELETE CASCADE,
    UNIQUE(posto_id, setor_id)
);

-- 4.2 ATRIBUIÇÃO OFICIAL DE SUPERVISÃO MULTI-SETOR (N:N)
CREATE TABLE IF NOT EXISTS posto_setor_supervisao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    posto_id INTEGER NOT NULL,
    setor_id INTEGER NOT NULL,
    ativo INTEGER DEFAULT 1,
    usuario_responsavel TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(posto_id, setor_id),
    FOREIGN KEY (posto_id) REFERENCES postos(id) ON DELETE CASCADE,
    FOREIGN KEY (setor_id) REFERENCES setores(id) ON DELETE CASCADE
);

-- 4.3 HISTÓRICO DE DISTRIBUIÇÃO E ATRIBUIÇÃO DOS POSTOS
CREATE TABLE IF NOT EXISTS historico_distribuicao_postos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    posto_id INTEGER NOT NULL,
    posto_nome TEXT,
    setor_id INTEGER,
    setor_nome TEXT,
    setor_anterior_id INTEGER,
    setor_anterior_nome TEXT,
    setor_novo_id INTEGER,
    setor_novo_nome TEXT,
    acao TEXT NOT NULL CHECK(acao IN ('ATRIBUIDO', 'REMOVIDO', 'REINICIADO', 'RECLASSIFICADO')),
    usuario_nome TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- 5. USUARIOS
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL DEFAULT 'consulta' CHECK (perfil IN ('admin', 'supervisor', 'consulta')),
    setor_id INTEGER,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (setor_id) REFERENCES setores(id)
);

-- 6. RELATÓRIOS DO EXPEDIENTE (1 por setor por plantão)
CREATE TABLE IF NOT EXISTS relatorios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setor_id INTEGER NOT NULL,
    supervisor_id INTEGER,
    viatura_id INTEGER,
    viatura_outros_texto TEXT,
    data_servico DATE NOT NULL,
    turno TEXT NOT NULL CHECK (turno IN ('DIURNO', 'NOTURNO', 'PLANTÃO', 'PLANTAO')),
    km_inicial REAL,
    km_final REAL,
    km_rodado REAL,
    responsavel_nome TEXT,
    observacoes_gerais TEXT,
    providencias_gerais TEXT,
    pendencias_gerais TEXT,
    status TEXT NOT NULL DEFAULT 'concluido' CHECK (status IN ('concluido', 'em_aberto', 'cancelado')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (setor_id) REFERENCES setores(id),
    FOREIGN KEY (supervisor_id) REFERENCES supervisores(id),
    FOREIGN KEY (viatura_id) REFERENCES viaturas(id)
);

-- 7. POSTOS VINCULADOS AO RELATÓRIO DO EXPEDIENTE
CREATE TABLE IF NOT EXISTS postos_relatorio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    relatorio_id INTEGER NOT NULL,
    posto_id INTEGER,
    nome_posto_digitado TEXT,
    horario_supervisao TEXT,
    situacao_encontrada TEXT,
    efetivo_presente INTEGER DEFAULT 1,
    status_supervisao TEXT NOT NULL DEFAULT 'NORMAL' CHECK (status_supervisao IN ('NORMAL', 'COM_OCORRENCIA', 'PENDENCIA', 'SEM_ALTERACAO', 'NAO_SUPERVISIONADO')),
    supervisionado INTEGER NOT NULL DEFAULT 1,
    motivo_nao_supervisao TEXT,
    km_posto REAL,
    efetivo_completo INTEGER DEFAULT 1,
    falta_efetivo_qtd TEXT,
    tem_ocorrencia INTEGER DEFAULT 0,
    descricao_ocorrencia TEXT,
    observacao TEXT,
    endereco TEXT,
    localidade TEXT,
    empresa TEXT,
    setor_id_posto INTEGER,
    setor_nome_posto TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (relatorio_id) REFERENCES relatorios(id) ON DELETE CASCADE,
    FOREIGN KEY (posto_id) REFERENCES postos(id)
);

-- 8. OCORRÊNCIAS REGISTRADAS NO EXPEDIENTE
CREATE TABLE IF NOT EXISTS ocorrencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    relatorio_id INTEGER NOT NULL,
    posto_id INTEGER,
    tipo_ocorrencia TEXT DEFAULT 'Geral',
    descricao TEXT NOT NULL,
    providencias_adotadas TEXT,
    status TEXT DEFAULT 'resolvido' CHECK (status IN ('resolvido', 'pendente', 'em_analise')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (relatorio_id) REFERENCES relatorios(id) ON DELETE CASCADE,
    FOREIGN KEY (posto_id) REFERENCES postos(id)
);

-- 9. CONFIGURAÇÕES ADMINISTRATIVAS
CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    descricao TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. LOCALIZAÇÃO OPERACIONAL DOS FISCAIS (GPS EM TEMPO REAL)
CREATE TABLE IF NOT EXISTS fiscal_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    nome_usuario TEXT NOT NULL,
    setor TEXT,
    setor_id INTEGER,
    latitude REAL,
    longitude REAL,
    accuracy REAL,
    is_online INTEGER DEFAULT 1,
    gps_authorized INTEGER DEFAULT 1,
    device_info TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES usuarios(id)
);

-- Índices de Otimização e Integridade Única
CREATE INDEX IF NOT EXISTS idx_supervisores_setor ON supervisores(setor_id);
CREATE INDEX IF NOT EXISTS idx_viaturas_setor ON viaturas(setor_id);
CREATE INDEX IF NOT EXISTS idx_postos_setor ON postos(setor_id);
CREATE INDEX IF NOT EXISTS idx_relatorios_setor ON relatorios(setor_id);
CREATE INDEX IF NOT EXISTS idx_relatorios_data ON relatorios(data_servico);
CREATE INDEX IF NOT EXISTS idx_postos_relatorio_rel ON postos_relatorio(relatorio_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_rel ON ocorrencias(relatorio_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_locations_user ON fiscal_locations(user_id);

-- Índices Únicos para evitar duplicidades
CREATE UNIQUE INDEX IF NOT EXISTS idx_postos_nome_setor ON postos(nome, setor_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supervisores_matricula ON supervisores(matricula);
CREATE UNIQUE INDEX IF NOT EXISTS idx_viaturas_placa_setor ON viaturas(placa, setor_id);

