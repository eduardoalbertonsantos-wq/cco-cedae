# Sistema CCO CEDAE — Centro de Controle Operacional

Sistema WEB profissional, responsivo e modular para registro, consolidação e acompanhamento operacional da supervisão e segurança patrimonial da CEDAE.

---

## 🏗️ Arquitetura e Separação de Áreas

O sistema possui separação rígida entre a área de campo e a área administrativa:

1. **Área Pública dos Supervisores (`/formulario` ou `/formulario.html`)**:
   - Acesso livre para supervisores em campo via celular, tablet ou computador.
   - Suporte a PWA (pode ser instalado na tela de início do celular como aplicativo nativo).
   - Fluxo em cascata: **Setor &rarr; Supervisor &rarr; Viatura &rarr; Postos Supervisionados &rarr; Horários/Ocorrências &rarr; Envio**.
   - Integração automática com WhatsApp (gera texto pré-formatado e botão de compartilhamento imediato com a coordenação).
   - **Setor PLANTÃO**: Carrega automaticamente todos os postos de todos os setores e viaturas operacionais.

2. **Área Administrativa e Operacional (`/login`, `/admin` e `/dashboard.html`)**:
   - Protegida por autenticação JWT (JSON Web Token) e controle de permissões.
   - Acesso restrito a usuários cadastrados.
   - Painel de controle em tempo real com os 8 cards oficiais e gráficos de fiscalização.
   - Cadastros completos de Setores, Supervisores, Viaturas e Postos.
   - Auditoria de 72 horas e consulta a relatórios consolidados.

---

## 🚀 Como Executar Localmente

### Pré-requisitos:
- [Node.js](https://nodejs.org/) instalado (versão 18 ou superior recomendada).

### Passo a passo:
1. Instale as dependências:
   ```bash
   npm install
   ```
2. Inicie o servidor:
   ```bash
   npm start
   ```
3. Acesse no navegador:
   - **Formulário de Plantão (Supervisores):** `http://localhost:3000/formulario.html`
   - **Painel Administrativo / Login:** `http://localhost:3000/login.html` (ou `http://localhost:3000/index.html`)

---

## 🌐 Publicação Online na Vercel

O projeto já está configurado com o arquivo `vercel.json` na raiz.

1. Instale a Vercel CLI ou conecte seu repositório no [dashboard da Vercel](https://vercel.com).
2. Configure as seguintes **Environment Variables** (Variáveis de Ambiente) no painel da Vercel:
   - `JWT_SECRET`: uma chave secreta segura (ex: uma sequência longa de caracteres aleatórios).
   - `NODE_ENV`: `production`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (opcional, para envio automático de e-mails de relatório).
3. Faça o deploy:
   ```bash
   vercel --prod
   ```
4. Suas rotas ficarão disponíveis automaticamente:
   - `https://seu-dominio.vercel.app/formulario`
   - `https://seu-dominio.vercel.app/login`
   - `https://seu-dominio.vercel.app/admin`

---

## 🛡️ Segurança e Permissões das Rotas

- `POST /api/v1/auth/login`: Autentica usuário e retorna token JWT.
- `GET /api/v1/formulario/setor/:id`: **Público** — carrega estrutura filtrada por setor (ou todos os postos se for Plantão).
- `POST /api/v1/formulario/enviar`: **Público** — consolida e grava relatório de expediente.
- `GET /api/v1/setores`, `/supervisores`, `/viaturas`, `/postos`: **Protegido** — exige token (`Authorization: Bearer <token>`).
- `POST`, `PUT`, `DELETE` nas entidades: **Protegido** — exige permissão de Administrador.
