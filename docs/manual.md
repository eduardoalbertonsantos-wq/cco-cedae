# CCO — Centro de Controle Operacional
## Manual Completo do Usuário e Guia de Operações

---

## Sumário
1. [Introdução ao Sistema](#1-introdução-ao-sistema)
2. [Requisitos do Sistema](#2-requisitos-do-sistema)
3. [Instalação e Primeiro Acesso](#3-instalação-e-primeiro-acesso)
4. [Dashboard Operacional — Interpretação dos Indicadores](#4-dashboard-operacional--interpretação-dos-indicadores)
5. [Formulário de Plantão — Passo a Passo de Preenchimento](#5-formulário-de-plantão--passo-a-passo-de-preenchimento)
6. [Relatórios — Consulta, Filtros e Exportação](#6-relatórios--consulta-filtros-e-exportação)
7. [Postos de Serviço — Gestão e Cadastro](#7-postos-de-serviço--gestão-e-cadastro)
8. [Supervisores — Gestão de Equipe e Matrículas](#8-supervisores--gestão-de-equipe-e-matrículas)
9. [Viaturas — Controle de Frota e Quilometragem](#9-viaturas--controle-de-frota-e-quilometragem)
10. [Auditoria 72h — Regras de Fiscalização Contínua](#10-auditoria-72h--regras-de-fiscalização-contínua)
11. [Central de Alertas — Tipos, Níveis e Tratativas](#11-central-de-alertas--tipos-níveis-e-tratativas)
12. [Mapa Operacional Georreferenciado](#12-mapa-operacional-georreferenciado)
13. [Integração Google Forms (Opcional)](#13-integração-google-forms-opcional)
14. [Configuração de Notificações Automáticas por E-mail](#14-configuração-de-notificações-automáticas-por-e-mail)
15. [Segurança e Perfis de Acesso (RBAC)](#15-segurança-e-perfis-de-acesso-rbac)
16. [Identificação e Gestão de Dados de Demonstração](#16-identificação-e-gestão-de-dados-de-demonstração)
17. [Perguntas Frequentes (FAQ)](#17-perguntas-frequentes-faq)

---

## 1. Introdução ao Sistema

O **CCO (Centro de Controle Operacional)** é uma plataforma integrada de gestão, fiscalização presencial e monitoramento de segurança corporativa voltada para ativos críticos de infraestrutura hídrica e patrimonial.

Desenvolvido para atender às necessidades da Assessoria de Segurança, o sistema centraliza:
- O controle diário das jornadas de supervisão operacional;
- O registro de conformidade de efetivo em postos remotos;
- O controle de quilometragem e frota de viaturas de ronda;
- A auditoria contínua de cobertura (garantia de que nenhum posto permaneça mais de 72 horas sem fiscalização presencial);
- A geração instantânea de relatórios consolidados e notificações em tempo real.

O CCO funciona em arquitetura híbrida: dispõe de uma interface web moderna e responsiva (compatível com smartphones e tablets de campo), um backend seguro em Node.js com banco de dados SQLite/PostgreSQL e integração nativa com o ecossistema Google Workspace (Google Forms, Google Sheets e Gmail).

---

## 2. Requisitos do Sistema

### 2.1. Ambiente de Execução do Servidor
- **Sistema Operacional:** Windows 10/11, Windows Server 2016+, Linux (Ubuntu 20.04+, Debian 11+, RHEL 8+) ou macOS 12+.
- **Node.js:** Versão LTS recomendada (v18.x, v20.x ou superior).
- **Gerenciador de Pacotes:** npm (v9.x+) ou yarn.
- **Espaço em Disco:** Mínimo de 500 MB livres.
- **Memória RAM:** Mínimo de 1 GB de RAM disponível para o processo do backend.

### 2.2. Navegadores Homologados (Clientes)
- Google Chrome (versão 100+)
- Microsoft Edge (versão 100+)
- Mozilla Firefox (versão 100+)
- Safari no iOS / iPadOS (versão 15+)
- Google Chrome Mobile no Android (versão 10+)

*Nota:* O sistema não requer instalação de aplicativos nas estações clientes, operando 100% via web (Progressive Web App - PWA).

---

## 3. Instalação e Primeiro Acesso

### 3.1. Procedimento de Instalação Passo a Passo

1. **Clonar ou Baixar o Repositório:**
   Abra o terminal (PowerShell no Windows ou Bash no Linux) no diretório do projeto:
   ```bash
   cd cco-sistema
   ```

2. **Instalação das Dependências:**
   Execute o comando de instalação:
   ```bash
   npm install
   ```

3. **Criação do Arquivo de Variáveis de Ambiente:**
   Copie o arquivo modelo para criar a sua configuração local:
   ```bash
   # No Windows (PowerShell):
   copy .env.example .env

   # No Linux/macOS:
   cp .env.example .env
   ```

4. **Configuração dos Parâmetros Essenciais (.env):**
   Abra o arquivo `.env` em seu editor preferido e confira as variáveis básicas:
   ```ini
   PORT=3000
   NODE_ENV=development
   JWT_SECRET=cco-chave-super-secreta-de-seguranca-2026
   CCO_WEBHOOK_SECRET=cco-webhook-secret-change-me
   ADMIN_EMAIL=eduardoalbertonsantos@gmail.com
   ADMIN_INITIAL_PASS=cco@2026
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=seu-email@gmail.com
   SMTP_PASS=sua-senha-de-aplicativo-google
   ```

5. **Inicialização do Sistema:**
   Inicie o servidor de aplicação:
   ```bash
   npm start
   ```
   Caso deseje iniciar em modo de desenvolvimento com recarregamento automático:
   ```bash
   npm run dev
   ```

6. **Mensagem de Sucesso no Console:**
   ```text
   [CCO] Servidor inicializado com sucesso na porta 3000.
   [CCO] Banco de dados operacional sincronizado.
   [CCO] Acesso disponível em: http://localhost:3000
   ```

### 3.2. Primeiro Acesso e Credenciais Padrão

1. Abra o navegador e acesse a URL:
   ```text
   http://localhost:3000
   ```
2. Na tela de autenticação, insira as credenciais do Administrador Geral:
   - **E-mail:** `eduardoalbertonsantos@gmail.com`
   - **Senha:** `cco@2026`
3. Clique em **Entrar**.
4. Recomenda-se alterar a senha após o primeiro login através do menu de perfil no canto superior direito.

---

## 4. Dashboard Operacional — Interpretação dos Indicadores

Ao realizar o login, a tela principal apresentará o **Dashboard Geral do CCO**. Ele foi desenhado segundo os princípios da consciência situacional operacional:

```
+-----------------------------------------------------------------------------------+
|  [CCO] CENTRO DE CONTROLE OPERACIONAL                           Usuário: Eduardo |
+-----------------------------------------------------------------------------------+
|  [KPI 1: 18]         [KPI 2: 94.4%]     [KPI 3: 01]         [KPI 4: 02]          |
|  Plantões no Mês     Conformidade Geral  Faltas de Efetivo   Alertas >72h Crítico|
+-----------------------------------------------------------------------------------+
|  [Gráfico: Fiscalizações por Setor]     |  [Tabela: Postos Próximos do Limite 72h]|
|  Acari/Tinguá: ████████████ 12          |  • ETA Japeri: 56h sem supervisão      |
|  Guandu:       ████████ 8               |  • Represa Xerém: 68h sem supervisão   |
+-----------------------------------------------------------------------------------+
```

### 4.1. Significado dos Cards de Indicadores (KPIs)
- **Total de Plantões Registrados:** Volume de escalas de fiscalização finalizadas no período selecionado.
- **Índice de Conformidade de Efetivo:** Percentual de postos que estavam com o efetivo integralmente completo durante as vistorias. Metas operacionais recomendadas: $\ge 95\%$.
- **Faltas de Efetivo Detectadas:** Número absoluto de postos onde foi constatada ausência de vigilantes ou porteiros contratados.
- **Alertas de Auditoria 72h:** Quantidade de postos de serviço que ultrapassaram 72 horas ininterruptas sem visita presencial da supervisão. Se este número for maior que zero, o card pisca em vermelho para chamar atenção imediata.
- **Quilometragem Total Percorrida:** Soma do odômetro das viaturas de ronda no período, auxiliando no planejamento logístico e trocas de óleo preventivas.

---

## 5. Formulário de Plantão — Passo a Passo de Preenchimento

O preenchimento do formulário eletrônico de supervisão pode ser realizado pelo supervisor diretamente em campo, através de celular ou tablet conectado à internet.

### 5.1. Acessando os Formulários por Setor
Cada grande setor operacional possui uma rota dedicada que já carrega seus postos, viaturas e supervisores automaticamente:

- **Setor 1 — ACARI / TINGUÁ:**
  ```text
  http://localhost:3000/formulario.html?setor=1
  ```
- **Setor 3 — GUANDU:**
  ```text
  http://localhost:3000/formulario.html?setor=3
  ```
- **Setor 2 (Plantão Assessoria) e Setor 4 (Laranjal):**
  Acessíveis via `formulario.html?setor=2` e `formulario.html?setor=4`.

---

### 5.2. Etapas de Preenchimento Passo a Passo

#### Etapa 1: Identificação da Escala
- **Data do Plantão:** Selecione a data civil do início da jornada. O campo vem pré-preenchido com a data atual.
- **Equipe de Supervisão:** Marque os nomes dos supervisores que estão na viatura.
  - *No Setor Acari/Tinguá:* Marque os supervisores presentes (ex: *ALEX — Mat. 1695*, *LAURINDO — Mat. 1691*).
  - Caso haja supervisor substituto ou apoio, utilize a opção "Outro / Adicionar".
- **Viatura Operacional:** Selecione o veículo utilizado (ex: *CHEVROLET S-10 — TTU2F83* ou *MITSUBISHI L200 — TUH1G04*).

#### Etapa 2: Controle de Odômetro (Quilometragem)
- **KM Inicial:** Insira a marcação do odômetro antes de sair da base (ex: `45210`).
- **KM Final:** Insira a marcação do odômetro ao encerrar o plantão e guardar a viatura (ex: `45395`).
- *Validação Automática:* O sistema valida se o KM Final é maior ou igual ao KM Inicial. A quilometragem total rodada é calculada automaticamente na tela (`185 km`).

#### Etapa 3: Avaliação de Efetivo Posto a Posto
Para cada posto listado na tela, o supervisor deve assinalar **obrigatoriamente** uma das três opções:
1. **Efetivo Completo (Verde):** Todos os vigilantes/porteiros previstos no contrato estavam no posto, uniformizados e portando os equipamentos necessários.
2. **Falta de Efetivo (Vermelho):** Constatada ausência parcial ou total de profissionais. O sistema abre um campo auxiliar para informar quantos vigilantes faltaram e o nome da empresa responsável.
3. **Não Fiscalizado (Amarelo):** Por motivo justificado (ex: tromba d'água impedindo acesso à Represa de São Pedro ou emergência operacional em outro ponto), o posto não foi visitado.

#### Etapa 4: Relato de Ocorrências e Observações
- Espaço aberto para registrar avarias na viatura, anormalidades estruturais no posto (portão danificado, iluminação inoperante, câmeras cegas) ou incidentes de segurança.
- Se tudo transcorreu normalmente, mantenha o texto padrão: `"Sem alterações"`.

#### Etapa 5: Termo de Conformidade e Envio
- Marque o checkbox:
  ```text
  [X] Declaro que as informações deste relatório correspondem às supervisões realizadas durante o plantão.
  ```
- Clique no botão **[Finalizar e Transmitir Relatório]**.
- O sistema exibirá uma mensagem de confirmação instantânea com o número do protocolo do plantão gerado (ex: `PLN-20260921-183010`).

---

## 6. Relatórios — Consulta, Filtros e Exportação

A aba **Relatórios** permite a auditabilidade total de todas as fiscalizações realizadas pela Assessoria de Segurança.

### 6.1. Filtros Disponíveis
- **Intervalo de Datas:** Data inicial e data final (permite buscar plantões históricos de qualquer período).
- **Setor Operacional:** Todos ou filtrar por *Acari/Tinguá*, *Guandu*, *Plantão Assessoria* ou *Laranjal*.
- **Supervisor:** Busca nominal por matrícula ou nome de supervisor participante.
- **Viatura:** Filtragem por placa da viatura de ronda.
- **Filtro de Inconformidade:** Exibir apenas plantões que registraram falta de efetivo ou ocorrências graves.

### 6.2. Visualização dos Detalhes do Plantão
Ao clicar no botão **[Detalhes]** de qualquer linha da tabela de relatórios:
- Abre-se uma janela modal com o espelho completo daquele plantão;
- Relação de todos os postos fiscalizados com os status individuais;
- Diferencial de quilometragem e mapa do trajeto estimado;
- Histórico de quem submeteu o relatório e carimbo de data/hora oficial.

### 6.3. Exportações Disponíveis
No canto superior direito da tela de relatórios, o usuário dispõe dos seguintes botões de exportação:
- **Exportar PDF (Relatório Executivo):** Gera um documento formatado com layout corporativo, cabeçalhos oficiais, tabela de postos e espaço para assinaturas de conferência.
- **Exportar CSV / Excel:** Gera planilha estruturada contendo todos os registros filtrados para integração com Power BI, Excel ou softwares de BI externos.

---

## 7. Postos de Serviço — Gestão e Cadastro

O módulo **Postos** cadastra os pontos fixos de vigilância patrimonial que devem receber rondas periódicas.

### 7.1. Visualização da Tabela de Postos
Cada posto exibe:
- **Nome do Posto:** Identificação oficial da instalação (ex: *ETA JAPERI*, *BARRAGEM PRINCIPAL*).
- **Setor:** A qual região operacional o posto pertence.
- **Grau de Criticidade:**
  - *Crítica (Alta):* Estações de tratamento de grande porte e reservatórios estratégicos.
  - *Média:* Elevatórias secundárias e almoxarifados.
  - *Padrão:* Postos administrativos e acessos secundários.
- **Efetivo Previsto:** Quantitativo de vigilantes acordado em contrato para cada escala (ex: 2 vigilantes diurnos / 2 noturnos).
- **Status de Auditoria 72h:** Indicador em tempo real do tempo decorrido desde a última fiscalização física.

### 7.2. Cadastro de Novo Posto
1. Clique em **[+ Novo Posto]**.
2. Preencha os campos obrigatórios:
   - *Nome do Posto:* Ex: `NOVA ELEVATÓRIA JAPERI`.
   - *Setor:* Selecione no menu suspenso.
   - *Criticidade:* Alta, Média ou Baixa.
   - *Coordenadas Geográficas (Latitude e Longitude):* Ex: `-22.651234, -43.654321`. Importante para a plotagem automática no Mapa Operacional.
3. Clique em **[Salvar Posto]**.

---

## 8. Supervisores — Gestão de Equipe e Matrículas

O cadastro de supervisores mantém a escala e os nomes oficiais que alimentam os formulários de campo.

### 8.1. Lista de Supervisores Cadastrados
Exemplo de dados homologados no setor Acari/Tinguá:
- `ACARLOS — Mat. 1671`
- `ALEX — Mat. 1695`
- `ANDRÉ — Mat. 1696`
- `EDUARDO — Mat. 1699`
- `JASON — Mat. 1701`
- `LAURINDO — Mat. 1691`
- `ROBSON — Mat. 1703`

Exemplo no setor Guandu:
- `EDUARDO ACIOLE — Mat. 1700`
- `ELIEZER GONÇALVES — Mat. 1685`
- `LUIZ CLAUDIO — Mat. 1712`

### 8.2. Ações de Gestão
- **Cadastrar Supervisor:** Adiciona novo membro à escala com matrícula e telefone institucional de contato para acionamentos de emergência.
- **Inativar / Afastamento:** Permite desativar temporariamente supervisores de férias ou licença médica, removendo seus nomes da lista suspensa do formulário de campo para evitar erros de lançamento.

---

## 9. Viaturas — Controle de Frota e Quilometragem

O módulo **Viaturas** monitora os veículos operacionais da frota da Assessoria de Segurança:

### 9.1. Cadastro e Histórico do Veículo
- **Modelo:** Ex: `CHEVROLET S-10`, `MITSUBISHI L200`, `FIAT ARGO`.
- **Placa do Veículo:** Identificação veicular (padrão Mercosul).
- **Setor Vinculado:** Região operacional onde o veículo está alocado.
- **Odômetro Atual:** Atualizado automaticamente a cada relatório de plantão submetido.
- **Alertas de Manutenção Preventiva:** O sistema emite aviso de manutenção a cada 10.000 km rodados a partir da última revisão cadastrada.

---

## 10. Auditoria 72h — Regras de Fiscalização Contínua

A **Auditoria 72h** é uma das regras de negócio mais importantes do sistema CCO. O objetivo primordial é **garantir que nenhuma instalação estratégica fique desprovida de fiscalização presencial por mais de três dias consecutivos (72 horas)**.

### 10.1. Como Funciona o Relógio de Auditoria
A cada submissão de plantão:
1. Para cada posto marcado como `Efetivo Completo` ou `Falta de Efetivo` (ou seja, fiscalizado presencialmente), o contador do relógio daquele posto é **zerado imediatamente**.
2. A partir daquele instante, o relógio começa a contar as horas decorridas de forma ininterrupta.
3. Se um posto for marcado como `Não Fiscalizado`, o contador **não é zerado**, continuando a contagem do último plantão presencial válido.

### 10.2. Classificação dos Status de Auditoria

| Horas Decorridas | Classificação | Cor do Badge | Ação Operacional Requerida |
| :--- | :--- | :--- | :--- |
| **0h a 48h** | **EM DIA** | Verde | Posto fiscalizado recentemente. Situação regular. |
| **49h a 72h** | **ATENÇÃO** | Amarelo / Âmbar | Posto aproximando-se do prazo limite. A próxima equipe de plantão deve priorizar a visita a este posto. |
| **> 72h** | **CRÍTICO** | Vermelho Piscante | **Meta violada.** Disparo de alerta prioritário na tela inicial e notificação por e-mail à coordenação. |

---

## 11. Central de Alertas — Tipos, Níveis e Tratativas

O CCO monitora anomalias de forma contínua e gera alertas visuais e sonoros quando desvios são detectados.

### 11.1. Categorias de Alertas
1. **Alerta de Falta de Efetivo (Nível Alto):**
   - Disparado imediatamente quando um plantão registra ausência de vigilante em posto contratado.
   - *Tratativa:* Registrar o número da Notificação de Ocorrência contratual enviada à empresa prestadora de serviço para desconto em fatura.
2. **Alerta de Auditoria > 72h (Nível Crítico):**
   - Disparado quando um posto ultrapassa 72 horas sem vistoria física.
   - *Tratativa:* Roteirização prioritária da viatura em serviço para o posto inadimplente.
3. **Alerta de Divergência de Quilometragem (Nível Médio):**
   - Disparado quando o KM Final for menor que o KM Inicial ou quando a distância percorrida for incompatível com o roteiro cadastrado.
4. **Alerta de Desconexão / Webhook (Nível Técnico):**
   - Disparado se uma integração com o Google Apps Script falhar na validação da assinatura criptográfica HMAC.

### 11.2. Painel de Tratativas
Ao clicar em qualquer alerta no dashboard, o operador pode:
- Assumir a ocorrência (`Em Tratativa`);
- Despachar instrução à equipe de campo;
- Encerrar o alerta registrando o parecer final no campo de observações.

---

## 12. Mapa Operacional Georreferenciado

Acessível na opção **Mapa Operacional** do menu de navegação lateral, esta tela apresenta uma visão cartográfica completa de todos os postos e setores de atuação.

### 12.1. Funcionalidades do Mapa
- **Marcadores Coloridos por Situação:**
  - Marcador Verde: Posto com auditoria em dia e efetivo regular.
  - Marcador Amarelo: Posto na faixa de atenção (48h a 72h).
  - Marcador Vermelho: Posto em estado crítico (>72h) ou com falta de efetivo ativa.
- **Popup de Detalhes:** Ao clicar sobre o marcador de um posto no mapa, exibe-se:
  - Nome da instalação;
  - Setor responsável;
  - Última data e hora de fiscalização;
  - Nome do último supervisor que esteve no local;
  - Link direto para traçar rota no Google Maps / Waze até o posto.
- **Filtros por Setor:** Visualize apenas os postos de Acari/Tinguá ou apenas do Guandu.

---

## 13. Integração Google Forms (Opcional)

Para cenários onde os supervisores de campo preferem utilizar formulários do ecossistema Google Forms (ou em caso de contingência operacional sem acesso direto à interface web do CCO), o sistema oferece total integração bidirecional.

### 13.1. Como Ativar a Integração
1. Siga as orientações contidas no arquivo `google-apps-script/README.md`.
2. Após criar a planilha oficial e os formulários pelo menu **CCO Operacional**, copie a URL pública do webhook do seu servidor CCO.
3. Ao responder qualquer formulário Google oficial, os dados serão validados via HMAC-SHA256 e entrarão diretamente na base de dados do CCO sem qualquer necessidade de digitação manual.

---

## 14. Configuração de Notificações Automáticas por E-mail

O sistema conta com dois motores independentes para envio de e-mails de alerta e relatórios executivos:

### 14.1. Motor 1: Disparo Direto pelo Backend (Node.js / Nodemailer)
Configurado no arquivo `.env` do servidor:
```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email-cco@gmail.com
SMTP_PASS=sua-senha-de-app-google
EMAIL_FROM="CCO - Centro de Controle Operacional <seu-email-cco@gmail.com>"
EMAIL_TO_DEFAULT=eduardoalbertonsantos@gmail.com
```
*Vantagens:* Envio instantâneo, integrado aos logs da aplicação e suporte a anexos em PDF gerados em tempo real.

### 14.2. Motor 2: Disparo via Google Apps Script (MailApp / GmailApp)
Configurado no arquivo `google-apps-script/Config.gs`:
```javascript
EMAIL_DESTINO: 'eduardoalbertonsantos@gmail.com',
EMAIL_REMETENTE: 'CCO - Centro de Controle Operacional'
```
*Vantagens:* Utiliza a infraestrutura de envio oficial do Google Workspace, sem necessidade de configurar portas SMTP ou liberar regras de firewall de saída na rede corporativa.

---

## 15. Segurança e Perfis de Acesso (RBAC)

O CCO implementa controle de acesso baseado em papéis (*Role-Based Access Control*), garantindo que cada usuário execute apenas as funções pertinentes ao seu nível de responsabilidade:

| Perfil | Acesso Permitido | Acesso Restrito |
| :--- | :--- | :--- |
| **ADMINISTRADOR (Admin)** | Acesso irrestrito a todas as funções, configurações de webhook, exclusão de registros, gestão de usuários e criação de postos. | Nenhuma restrição. |
| **OPERADOR DO CCO (Operador)** | Consulta a todos os dashboards, mapas, relatórios, tratamento de alertas e visualização de plantões. | Não pode excluir dados históricos nem alterar parâmetros de sistema. |
| **SUPERVISOR DE CAMPO (Fiscal)** | Acesso exclusivo ao formulário de envio de plantão e consulta ao histórico dos seus próprios plantões. | Não visualiza cadastros de outros setores nem dados administrativos. |

### 15.1. Proteção de Dados e Tokens JWT
- A autenticação web utiliza tokens JSON Web Tokens (JWT) armazenados em cookies seguros HTTP-Only ou cabeçalhos `Authorization: Bearer <token>`.
- As senhas são criptografadas com salt utilizando o algoritmo `bcrypt`.

---

## 16. Identificação e Gestão de Dados de Demonstração

Para fins de treinamento de novos supervisores e homologação de rotinas, o sistema pode ser inicializado com dados simulados (*Mock Data*).

### 16.1. Como Identificar Dados de Demonstração
- Todos os registros de plantões gerados pelo seeder de demonstração contêm o prefixo `[DEMO]` no campo de observações ou no código de identificação do plantão (ex: `PLN-DEMO-001`).
- Os nomes dos supervisores e placas de viaturas mantêm a nomenclatura oficial para facilitar a ambientação do operador, porém a quilometragem é ilustrativa.

### 16.2. Como Limpar Dados de Demonstração
Para limpar a base de dados de teste e iniciar a operação 100% real:
```bash
npm run db:reset
```
*Atenção:* Este comando recria o banco de dados preservando os cadastros mestres de setores, postos e viaturas, mas expurga todos os plantões e ocorrências de teste.

---

## 17. Perguntas Frequentes (FAQ)

### P1: O que fazer se a internet cair durante o preenchimento do formulário no celular?
**R:** O formulário web do CCO salva temporariamente as seleções no `localStorage` do navegador do dispositivo. Se a conexão oscilar, ao reconectar à rede o botão de envio transmitirá os dados normalmente. Em caso de falta total de conectividade de campo, o supervisor deve anotar o relatório no talonário de contingência e transmitir assim que chegar a uma base com sinal de telefonia ou Wi-Fi.

### P2: Como corrigir um relatório de plantão enviado com erro de quilometragem?
**R:** Somente usuários com perfil de **Administrador** têm permissão para retificar dados de plantões já encerrados. O supervisor deve acionar a sala de controle do CCO e informar o número do protocolo do plantão para que o operador faça a correção administrativa mantendo o registro de auditoria (*log*).

### P3: Por que o posto continua com status de alerta após o plantão ter sido finalizado?
**R:** Certifique-se de que o posto foi marcado com a opção **"Efetivo Completo"** ou **"Falta de Efetivo"**. Se a opção escolhida foi **"Não Fiscalizado"**, a regra de negócio do CCO determina que o contador de 72 horas não seja zerado, pois não houve a conferência presencial do local.

### P4: O e-mail automático com o relatório do plantão não chegou. O que verificar?
**R:** 
1. Verifique a pasta de *Spam / Lixo Eletrônico* do e-mail do destinatário.
2. No caso do envio via backend, confira se as credenciais SMTP no arquivo `.env` estão corretas e se a "Senha de Aplicativo" do Gmail ainda está válida.
3. No caso do envio via Google Apps Script, abra o histórico de execuções (*Apps Script* > *Execuções*) para verificar se houve estouro de cota diária de e-mails da conta Google.

### P5: Como adicionar um novo posto de fiscalização em um setor existente?
**R:** Acesse o menu lateral **Postos**, clique em **[+ Novo Posto]**, preencha os dados de nome, criticidade e coordenadas e clique em salvar. Caso utilize a integração Google Forms, vá até a planilha Google e clique em **CCO Operacional** > **🔄 Atualizar Opções dos Formulários** para que o novo posto passe a constar nas perguntas do formulário automaticamente.

---

**Assessoria de Segurança — Centro de Controle Operacional (CCO)**  
*Documentação Oficial de Operações — Versão 2.0.0*
