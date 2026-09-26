# Manual Técnico e Operacional — CCO Multiplataforma

> **Sistema**: CCO — SUPERVISÃO OPERACIONAL  
> **Versão Oficial**: v1.0.0  
> **Ponto de Restauração**: `CCO — VERSÃO ESTÁVEL ORIGINAL`  
> **Compatibilidade**: Android (PWA & APK/AAB), Windows, macOS, Linux, Tablets e Celulares.

---

## 1. Como Executar o Projeto Localmente

### Pré-requisitos
- Node.js v18+ ou v20+
- Navegador moderno (Chrome, Edge, Firefox, Safari)

### Inicialização
Na raiz do projeto (`cco-sistema`):
```bash
# Instalar dependências do backend
cd backend
npm install
cd ..

# Iniciar servidor CCO (Porta 3000)
npm start
```
Acesse no navegador: `http://localhost:3000`

---

## 2. Como Utilizar no Celular Android (PWA Direto)

O CCO foi estruturado com Progressive Web App (PWA) de nível nativo:

1. Abra o navegador no Android (Google Chrome recomendado) e acesse o endereço do CCO.
2. O sistema exibirá automaticamente um botão flutuante: **📲 Instalar CCO**.
3. Se preferir, toque no menu de três pontinhos do Chrome $\rightarrow$ **Adicionar à tela inicial** (ou **Instalar Aplicativo**).
4. O ícone oficial do **CCO — SUPERVISÃO OPERACIONAL** surgirá na tela inicial do celular.
5. Ao tocar no ícone:
   - Abre em tela cheia sem a barra de endereço do navegador;
   - Mantém a sessão do supervisor;
   - Salva cache de formulários e postos;
   - Exibe alerta imediato caso fique sem conexão com a internet.

---

## 3. Como Utilizar no Computador (Windows / macOS / Linux)

No computador, o sistema opera de duas formas idênticas e integradas:

### Opção A: No Navegador
Acesse `http://localhost:3000` (ou o domínio corporativo de produção) pelo Chrome ou Edge.

### Opção B: Instalado como Aplicativo Desktop
1. Na barra de endereços do Chrome ou Edge, clique no ícone **Instalar aplicativo CCO** (ao lado da estrela de favoritos).
2. O CCO será instalado como uma aplicação desktop nativa do Windows (com janela independente, ícone na barra de tarefas e menu Iniciar).

---

## 4. Como Gerar APK (Testes Internos) e AAB (Google Play Store)

O projeto possui a estrutura oficial do **Capacitor** pré-configurada na pasta `android/` com App ID `br.gov.rj.cedae.cco.supervisao`.

### Passos para Compilar:

1. **Sincronizar a aplicação web com o Android:**
   ```bash
   npx cap sync android
   ```

2. **Gerar APK de Teste (Debug/Instalação Direta via USB ou WhatsApp):**
   ```bash
   cd android
   .\gradlew.bat assembleDebug
   ```
   O arquivo APK estará em:  
   `android/app/build/outputs/apk/debug/app-debug.apk`

3. **Gerar AAB para Google Play Store (Release):**
   ```bash
   cd android
   .\gradlew.bat bundleRelease
   ```
   O arquivo AAB para upload no Play Console estará em:  
   `android/app/build/outputs/bundle/release/app-release.aab`

---

## 5. Estratégia de Backup e Restauração de Dados

> [!IMPORTANT]
> A base SQLite `data/cco.db` contém os **59 postos oficiais** e histórico. Nunca execute operações destrutivas sem backup.

### Realizar Backup Imediato
Para gerar um snapshot atômico do banco com data/hora e manifesto:
```bash
npm run backup
```
O arquivo será salvo em `data/backups/cco_backup_<data-hora>_postos_59.db`.

### Restaurar Backup
Para restaurar a partir do backup mais recente:
```bash
npm run restore
```
Para restaurar um backup específico:
```bash
node backend/scripts/restore.js data/backups/nome_do_arquivo.db
```
*(O script de restauração faz automaticamente uma cópia de segurança da base atual antes de aplicar a restauração).*

---

## 6. Configuração de Ambiente e Domínio de Produção

### Variáveis de Ambiente (`backend/.env`)
Para colocar em produção:
```env
PORT=3000
NODE_ENV=production
APP_URL=https://ccosupervisao.empresa.com.br
HTTPS_ENFORCE=true
JWT_SECRET=sua-chave-secreta-longa-e-segura-2026
```

### Configurar HTTPS e Proxy Reverso (Nginx)
Exemplo de configuração para o domínio corporativo:
```nginx
server {
    listen 80;
    server_name ccosupervisao.empresa.com.br;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ccosupervisao.empresa.com.br;

    ssl_certificate /etc/letsencrypt/live/ccosupervisao.empresa.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ccosupervisao.empresa.com.br/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 7. Controle de Atualizações e Versionamento

Quando for lançar uma nova versão (ex: `v1.0.1` ou `v1.1.0`):
1. Atualize a versão no `package.json` e no `backend/server.js` (`/api/v1/version`).
2. No Service Worker (`frontend/sw.js`), incremente `CACHE_NAME = 'cco-supervisao-v1.0.1'`.
3. Os usuários conectados receberão o banner:
   *"🚀 Nova versão disponível! [Atualizar Agora]"*
4. A atualização recarrega o app sem interromper relatórios em digitação nem desconectar a sessão.
