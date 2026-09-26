-- Demo data generation for testing

-- Acari/Tinguá (setor_id=1)
INSERT INTO plantoes (id, setor_id, data_plantao, viatura_id, km_inicial, km_final, km_rodado, ocorrencias, confirmacao, data_envio, is_demo) VALUES
(1, 1, date('now', '-1 days'), 1, 10000, 10120, 120, 'Sem ocorrências.', 1, datetime('now', '-1 days'), 1),
(2, 1, date('now', '-3 days'), 2, 12000, 12080, 80, 'Ronda realizada sem alterações no Barrelão e Macuco.', 1, datetime('now', '-3 days'), 1),
(3, 1, date('now', '-5 days'), 1, 9800, 10000, 200, 'Falta de efetivo no Casa de Bambu comunicada ao CCO.', 1, datetime('now', '-5 days'), 1),
(4, 1, date('now', '-7 days'), 2, 11850, 12000, 150, NULL, 1, datetime('now', '-7 days'), 1),
(5, 1, date('now', '-10 days'), 1, 9700, 9800, 100, 'Tudo ok.', 1, datetime('now', '-10 days'), 1),
(6, 1, date('now', '-15 days'), 2, 11700, 11850, 150, NULL, 1, datetime('now', '-15 days'), 1),
(7, 1, date('now', '-18 days'), 1, 9600, 9700, 100, 'Algumas posições não foram visitadas devido à chuva forte.', 1, datetime('now', '-18 days'), 1),
(8, 1, date('now', '-22 days'), 2, 11600, 11700, 100, NULL, 1, datetime('now', '-22 days'), 1),
(9, 1, date('now', '-28 days'), 1, 9500, 9600, 100, 'Operação normal.', 1, datetime('now', '-28 days'), 1);

-- Guandu (setor_id=3)
INSERT INTO plantoes (id, setor_id, data_plantao, viatura_id, km_inicial, km_final, km_rodado, ocorrencias, confirmacao, data_envio, is_demo) VALUES
(10, 3, date('now', '-2 days'), 3, 5000, 5090, 90, NULL, 1, datetime('now', '-2 days'), 1),
(11, 3, date('now', '-4 days'), 3, 4900, 5000, 100, 'Posto elevatória do lameirão sem vigilante.', 1, datetime('now', '-4 days'), 1),
(12, 3, date('now', '-8 days'), 3, 4750, 4900, 150, 'Problema no veículo.', 1, datetime('now', '-8 days'), 1),
(13, 3, date('now', '-12 days'), 3, 4650, 4750, 100, 'Tudo nos conformes.', 1, datetime('now', '-12 days'), 1),
(14, 3, date('now', '-16 days'), 3, 4550, 4650, 100, NULL, 1, datetime('now', '-16 days'), 1),
(15, 3, date('now', '-20 days'), 3, 4400, 4550, 150, 'Ronda completa.', 1, datetime('now', '-20 days'), 1),
(16, 3, date('now', '-25 days'), 3, 4300, 4400, 100, 'Falta efetivo BRG Peróxido.', 1, datetime('now', '-25 days'), 1),
(17, 3, date('now', '-29 days'), 3, 4200, 4300, 100, 'Operação padrão.', 1, datetime('now', '-29 days'), 1);

-- Supervisores nos plantões
-- Acari/Tinguá
INSERT INTO plantao_supervisores (plantao_id, supervisor_id) VALUES
(1, 1), (1, 2),
(2, 3), (2, 4),
(3, 5), (3, 6),
(4, 7), (4, 1),
(5, 2), (5, 3),
(6, 4), (6, 5),
(7, 6), (7, 7),
(8, 1), (8, 3),
(9, 2), (9, 4);

-- Guandu
INSERT INTO plantao_supervisores (plantao_id, supervisor_id) VALUES
(10, 8), (10, 9),
(11, 10), (11, 8),
(12, 9), (12, 10),
(13, 8), (13, 9),
(14, 10), (14, 8),
(15, 9), (15, 10),
(16, 8), (16, 9),
(17, 10), (17, 8);

-- Fiscalizações - Acari/Tinguá
-- Postos 1-12
INSERT INTO fiscalizacoes (plantao_id, posto_id, situacao) VALUES
(1, 1, 'efetivo_completo'), (1, 2, 'efetivo_completo'), (1, 3, 'efetivo_completo'),
(2, 1, 'efetivo_completo'), (2, 6, 'efetivo_completo'), (2, 12, 'efetivo_completo'),
(3, 3, 'falta_efetivo'), (3, 4, 'efetivo_completo'), (3, 5, 'efetivo_completo'),
(4, 7, 'efetivo_completo'), (4, 8, 'efetivo_completo'), (4, 9, 'efetivo_completo'),
(5, 10, 'efetivo_completo'), (5, 11, 'efetivo_completo'), (5, 12, 'efetivo_completo'),
(6, 1, 'efetivo_completo'), (6, 2, 'efetivo_completo'), (6, 3, 'efetivo_completo'),
(7, 4, 'nao_fiscalizado'), (7, 5, 'nao_fiscalizado'), (7, 6, 'efetivo_completo'),
(8, 7, 'efetivo_completo'), (8, 8, 'efetivo_completo'), (8, 9, 'efetivo_completo'),
(9, 10, 'efetivo_completo'), (9, 11, 'efetivo_completo'), (9, 12, 'efetivo_completo');

-- Fiscalizações - Guandu
-- Postos 13-23
INSERT INTO fiscalizacoes (plantao_id, posto_id, situacao) VALUES
(10, 13, 'efetivo_completo'), (10, 14, 'efetivo_completo'), (10, 15, 'efetivo_completo'),
(11, 16, 'falta_efetivo'), (11, 17, 'efetivo_completo'), (11, 18, 'efetivo_completo'),
(12, 19, 'efetivo_completo'), (12, 20, 'nao_fiscalizado'), (12, 21, 'efetivo_completo'),
(13, 22, 'efetivo_completo'), (13, 23, 'efetivo_completo'), (13, 13, 'efetivo_completo'),
(14, 14, 'efetivo_completo'), (14, 15, 'efetivo_completo'), (14, 16, 'efetivo_completo'),
(15, 17, 'efetivo_completo'), (15, 18, 'efetivo_completo'), (15, 19, 'efetivo_completo'),
(16, 15, 'falta_efetivo'), (16, 20, 'efetivo_completo'), (16, 21, 'efetivo_completo'),
(17, 22, 'efetivo_completo'), (17, 23, 'efetivo_completo'), (17, 13, 'efetivo_completo');
