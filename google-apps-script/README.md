# CCO — Centro de Controle Operacional
## Guia de Implantação e Configuração do Google Apps Script

Este módulo contém toda a automação do ecossistema Google Workspace (Google Sheets, Google Forms, Gmail e Webhooks) para o **Centro de Controle Operacional (CCO)**.

Com estes scripts, o sistema CCO é capaz de:
- Gerar formulários Google padronizados para cada setor operacional com apenas 1 clique;
- Estruturar a planilha central de controle com abas, painel com fórmulas dinâmicas, indicadores e cores institucionais;
- Disparar Webhooks com assinatura criptográfica HMAC-SHA256 para o backend Node.js do CCO;
- Gravar automaticamente os dados nas abas de histórico operacional;
- Enviar relatórios executivos em HTML formatado diretamente para a caixa postal dos gestores responsáveis.

---

## 📁 Estrutura dos Arquivos

| Arquivo | Descrição |
| :--- | :--- |
| `Config.gs` | Chaves de API, webhook URL, segredo HMAC, e-mail de destino e lista de setores, supervisores, viaturas e postos. |
| `Code.gs` | Menu de controle no Google Sheets (`onOpen`), orquestração e gerenciamento de acionadores (triggers). |
| `Forms.gs` | Criação automática, estilização e atualização dos formulários Google para cada setor. |
| `Sheets.gs` | Estruturação de abas da planilha, formatação condicional, cabeçalhos e painel de indicadores (KPIs). |
| `Webhook.gs` | Captura do evento de submissão, montagem do JSON, geração da assinatura HMAC-SHA256 e envio HTTP POST. |
| `Email.gs` | Template HTML de alta resolução e rotina de disparo de e-mails de supervisão via MailApp / GmailApp. |

---

## 🚀 Passo a Passo de Configuração

### Passo 1: Criar a Planilha no Google Drive
1. Acesse o [Google Drive](https://drive.google.com).
2. Clique no botão **Novo (+)** > **Planilhas Google** > **Planilha em branco**.
3. Renomeie o arquivo para:
   ```text
   CCO - Centro de Controle Operacional (Oficial)
   ```

---

### Passo 2: Abrir o Editor do Google Apps Script
1. Na planilha recém-criada, clique no menu superior em **Extensões** > **Apps Script**.
2. Uma nova aba será aberta com o ambiente de desenvolvimento do Google Apps Script.
3. No canto superior esquerdo, renomeie o projeto de `Projeto sem título` para:
   ```text
   CCO - Automação Operacional
   ```

---

### Passo 3: Criar e Copiar os Arquivos
No painel esquerdo do editor (seção **Arquivos**):

1. **Renomear `Código.gs`:**
   - Clique nos três pontos ao lado de `Código.gs`, selecione **Renomear** e altere para `Config.gs`.
   - Cole o conteúdo integral do arquivo `Config.gs`.

2. **Criar os demais arquivos:**
   - Clique no ícone **+ (Adicionar um arquivo)** ao lado de *Arquivos* e selecione **Script**.
   - Crie sucessivamente os arquivos com os seguintes nomes:
     - `Code.gs`
     - `Forms.gs`
     - `Sheets.gs`
     - `Webhook.gs`
     - `Email.gs`
   - Em cada um deles, cole o respectivo código fonte fornecido no repositório.

3. Clique no botão **Salvar projeto** (ícone de disquete ou `Ctrl + S`).

---

### Passo 4: Personalizar Variáveis no `Config.gs`
Abra o arquivo `Config.gs` no editor e ajuste as configurações conforme o seu ambiente:

```javascript
const CCO_CONFIG = {
  // Caso o backend esteja rodando localmente na sua máquina, utilize um túnel (ex: ngrok / cloudflared)
  // Exemplo: 'https://seu-tunel-ngrok.ngrok-free.app/api/v1/webhook/google-forms'
  WEBHOOK_URL: 'http://localhost:3000/api/v1/webhook/google-forms',
  
  // Segredo compartilhado (deve ser exatamente idêntico ao CCO_WEBHOOK_SECRET do seu .env)
  WEBHOOK_SECRET: 'cco-webhook-secret-change-me',
  
  // E-mail que receberá a notificação instantânea de cada plantão
  EMAIL_DESTINO: 'eduardoalbertonsantos@gmail.com',
  
  EMAIL_REMETENTE: 'CCO - Centro de Controle Operacional',
  
  // Setores, postos e equipes cadastrados
  SETORES: { ... }
};
```

---

### Passo 5: Estruturar a Planilha e Criar os Formulários
1. Retorne à aba da sua **Planilha Google** e recarregue a página (`F5`).
2. Aguarde alguns segundos até aparecer o menu personalizado **CCO Operacional** na barra superior.
3. Execute as seguintes ações na ordem:
   1. Clique em **CCO Operacional** > **📊 Estruturar Planilha CCO**:
      - Uma janela de autorização do Google será exibida (veja o *Passo 6* abaixo).
      - Após autorizar, clique novamente em **📊 Estruturar Planilha CCO**. O sistema criará todas as 11 abas, cabeçalhos e painel.
   2. Clique em **CCO Operacional** > **📝 Criar Formulários Google**:
      - Os formulários de cada setor serão gerados no seu Google Drive.
      - Os links públicos e de edição serão gravados automaticamente na aba `REGISTRO DE LINKS`.
   3. Clique em **CCO Operacional** > **⚡ Configurar Triggers Automáticos**:
      - O gatilho de submissão será ativado para processar respostas em tempo real.

---

### Passo 6: Autorização de Permissões OAuth do Google
Ao executar qualquer rotina pela primeira vez, o Google exigirá autorização de segurança:

1. Na janela suspensa **Autorização necessária**, clique em **Continuar**.
2. Escolha sua conta do Google Workspace / Gmail.
3. Caso surja o aviso *"O Google não verificou este app"*, clique no link **Avançado** (no canto inferior esquerdo da janela).
4. Clique em **Acessar CCO - Automação Operacional (não seguro)**.
5. Revise as permissões solicitadas (acesso a planilhas, formulários, e-mail e conexões externas via UrlFetch) e clique em **Permitir**.

---

### Passo 7: Como Testar a Integração

#### Teste 1: Notificação por E-mail
- Na planilha, vá em **CCO Operacional** > **✉️ Testar Notificação por E-mail**.
- Verifique a caixa de entrada do e-mail configurado em `EMAIL_DESTINO`. Você deverá receber um e-mail com o relatório visual completo.

#### Teste 2: Conexão Webhook
- Certifique-se de que o backend CCO está em execução.
- No menu da planilha, clique em **CCO Operacional** > **🌐 Testar Conexão Webhook**.
- Uma mensagem de status HTTP confirmará a conectividade.

#### Teste 3: Submissão Real via Formulário
1. Vá até a aba `REGISTRO DE LINKS` da planilha.
2. Copie o link do formulário do setor `ACARI/TINGUÁ` ou `GUANDU`.
3. Abra o link em uma nova janela e preencha um relatório simulado.
4. Envie o formulário.
5. Verifique:
   - A resposta gravada na aba `PLANTÕES` e `FISCALIZAÇÕES`;
   - O e-mail formatado recebido pelo gestor;
   - O evento recebido no backend CCO via Webhook.

---

## 🔧 Solução de Problemas Comuns (Troubleshooting)

### 1. "Falha na chamada UrlFetchApp" ao testar o Webhook
- **Causa:** O Google Apps Script executa na nuvem do Google e **não consegue acessar `http://localhost:3000` diretamente**, pois `localhost` aponta para o servidor interno da nuvem do Google.
- **Solução:**
  - Para testes locais, use um túnel como o [ngrok](https://ngrok.com) ou Cloudflare Tunnel:
    ```bash
    ngrok http 3000
    ```
  - Copie a URL pública gerada (ex: `https://abc1234.ngrok-free.app`) e altere o `WEBHOOK_URL` em `Config.gs`:
    ```javascript
    WEBHOOK_URL: 'https://abc1234.ngrok-free.app/api/v1/webhook/google-forms'
    ```
  - Quando o CCO estiver hospedado em produção (ex: AWS, Render, VPS), informe a URL oficial (ex: `https://cco.suaempresa.com.br/api/v1/webhook/google-forms`).

### 2. O menu "CCO Operacional" não aparece na planilha
- **Causa:** A página da planilha não foi atualizada após a criação do script ou ocorreu um erro de sintaxe no código.
- **Solução:**
  - Pressione `Ctrl + F5` na aba da planilha.
  - Se ainda não aparecer, abra o editor do Apps Script, selecione a função `onOpen` no seletor de funções superior e clique em **Executar**.

### 3. As respostas do formulário entram em uma nova aba em vez da aba PLANTÕES
- **Causa:** O Google Forms cria por padrão uma aba chamada *"Respostas ao formulário 1"* quando vinculado à planilha.
- **Solução:** O acionador `onFormSubmitSpreadsheet` configurado captura os dados dessa aba e os converte, gravando automaticamente nas abas oficiais `PLANTÕES`, `FISCALIZAÇÕES` e `OCORRÊNCIAS`. Você pode ocultar as abas de resposta bruta para manter a visualização limpa.

### 4. Limites e Cotas do Google Apps Script
- Contas gratuitas do Gmail possuem cota de **100 e-mails por dia** disparados via script. Contas Google Workspace (empresariais) possuem cota de **1.500 e-mails por dia**.
- As requisições de URLFetch possuem limite de tempo limite de execução de 6 minutos por disparo, mais do que suficiente para o processamento de cada relatório (< 3 segundos).

---

## 🛡️ Segurança e Integridade Operacional

- **HMAC-SHA256:** Toda requisição enviada ao webhook acompanha o cabeçalho `X-CCO-Signature`. O backend valida a assinatura utilizando a mesma chave secreta `WEBHOOK_SECRET`, descartando qualquer tentativa de injeção externa não autorizada.
- **Timestamp de Validade:** O cabeçalho `X-CCO-Timestamp` impede ataques de repetição (*replay attacks*).
- **Tratamento de Exceções:** Em caso de indisponibilidade momentânea do backend, a planilha grava localmente os dados com o status `ERRO CONEXÃO` na coluna *STATUS WEBHOOK*, permitindo reprocessamento posterior sem perda de informações.
