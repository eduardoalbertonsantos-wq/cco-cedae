# 🌐 MANUAL DE IMPLANTAÇÃO EM PRODUÇÃO 24/7 — CCO CEDAE
## COMO MANTER O SISTEMA ONLINE ININTERRUPTAMENTE SEM DEPENDER DO NOTEBOOK LIGADO

---

### 1. OBJETIVO DA ARQUITETURA CLOUD

Para que os supervisores nos postos (Tinguá, Guandu, Laranjal, Plantão) consigam acessar o aplicativo pelo celular em qualquer horário do dia ou da noite, o sistema **não pode depender do notebook pessoal ficar ligado 24 horas por dia**.

O sistema foi estruturado com arquivos de automação para deploy em nuvem gratuita ou profissional:
- **Render.com / Railway.app**: Hospedagem da aplicação Node.js (Web Service 24/7).
- **Supabase.com**: Banco de dados PostgreSQL com alta disponibilidade, backup diário e segurança por linha (Row Level Security - RLS).
- **Docker / Docker Compose**: Para instalação em qualquer servidor VPS (Ubuntu/Debian) da CEDAE ou comercial.

---

### 2. OPÇÃO RECOMENDADA: DEPLOY EM 10 MINUTOS NO RENDER + SUPABASE (GRATUITO OU PRO)

#### PASSO 1: Banco de Dados na Nuvem (Supabase)
1. Acesse **[supabase.com](https://supabase.com)** e crie uma conta gratuita.
2. Clique em **"New Project"**, defina o nome `cco-cedae` e escolha a região **São Paulo (sa-east-1)** para menor latência.
3. No menu lateral esquerdo, vá em **SQL Editor**.
4. Abra o arquivo gerado no projeto:
   `database/supabase_schema_complete.sql`
5. Cole todo o conteúdo no SQL Editor do Supabase e clique em **"Run"**.
   - Todas as tabelas, colunas, índices, políticas de segurança (RLS) e os **59 postos oficiais** serão criados instantaneamente na nuvem!
6. Em **Project Settings -> Database**, copie a **Connection String (URI)** no formato:
   `postgresql://postgres:[SUA-SENHA]@db.[SEU-PROJETO].supabase.co:5432/postgres`

#### PASSO 2: Hospedagem da Aplicação (Render.com)
1. Crie uma conta em **[render.com](https://render.com)**.
2. Conecte seu repositório GitHub ou GitLab onde o código do CCO está armazenado.
3. Clique em **"New +" -> "Web Service"**.
4. O Render detectará automaticamente o arquivo `render.yaml` já configurado na raiz do projeto:
   - **Environment:** Node
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `node backend/server.js`
5. Em **Environment Variables**, configure:
   - `NODE_ENV`: `production`
   - `JWT_SECRET`: (digite uma chave segura ou use o gerador do Render)
   - `DATABASE_URL`: (cole a URL do Supabase obtida no Passo 1)
6. Clique em **"Create Web Service"**.
7. Em menos de 3 minutos, o Render fornecerá uma URL pública definitiva com HTTPS (certificado SSL automático), por exemplo:
   `https://cco-supervisao-cedae.onrender.com`

---

### 3. ACESSO DOS SUPERVISORES E CHEFIA

Com a URL gerada:
- **Aplicativo dos Supervisores (Celular Android / iPhone):**
  `https://seu-dominio.onrender.com/app`
  *(O supervisor pode clicar nos 3 pontinhos do Chrome no celular e escolher "Adicionar à tela inicial" para instalar como aplicativo nativo PWA).*

- **Painel Administrativo CCO (Chefia / CCO & Diretoria):**
  `https://seu-dominio.onrender.com/painel`

- **Gerenciar Postos:**
  `https://seu-dominio.onrender.com/postos.html`

- **Relatórios Executivos:**
  `https://seu-dominio.onrender.com/relatorios.html`

---

### 4. OPÇÃO CORPORATIVA: SERVIDOR VPS / DOCKER NA INFRAESTRUTURA CEDAE

Se a CEDAE optar por hospedar em máquina virtual própria (Linux Ubuntu/Debian):

1. Instale o Docker e Docker Compose no servidor:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose
   ```
2. Clone ou envie os arquivos do sistema para o servidor `/opt/cco-sistema`.
3. Inicie o contêiner em background:
   ```bash
   docker-compose up -d --build
   ```
4. O sistema iniciará imediatamente na porta 3000 com reinicialização automática em caso de queda (`restart: unless-stopped`).
5. Todos os dados e bancos SQLite WAL ficam salvos permanentemente no diretório montado `/app/data`.

---

### 5. SEGURANÇA E BACKUPS AUTOMÁTICOS
- No Supabase: Backups diários automatizados gerenciados pelo PostgreSQL.
- No SQLite local: Cada alteração de setor ou migração gera snapshot em `data/backups/`.
- O isolamento de perfis impede que qualquer supervisor acesse telas gerenciais (`/painel`, `/organizacao-postos.html`), redirecionando-o para `/app`.
