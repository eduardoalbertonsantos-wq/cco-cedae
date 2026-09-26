// CCO - Centro de Controle Operacional
// Configurações do Google Apps Script

const CCO_CONFIG = {
  // URL do webhook do backend CCO
  WEBHOOK_URL: 'http://localhost:3000/api/v1/webhook/google-forms',
  
  // Chave secreta para autenticação do webhook
  WEBHOOK_SECRET: 'cco-webhook-secret-change-me',
  
  // E-mail destino dos relatórios
  EMAIL_DESTINO: 'eduardoalbertonsantos@gmail.com',
  
  // Nome do remetente
  EMAIL_REMETENTE: 'CCO - Centro de Controle Operacional',
  
  // Setores
  SETORES: {
    'ACARI_TINGUA': {
      id: 1,
      nome: 'ACARI/TINGUÁ',
      formTitle: 'SUPERVISÃO — ACARI/TINGUÁ',
      supervisores: [
        'ACARLOS — Mat. 1671',
        'ALEX — Mat. 1695',
        'ANDRÉ — Mat. 1696',
        'EDUARDO — Mat. 1699',
        'JASON — Mat. 1701',
        'LAURINDO — Mat. 1691',
        'ROBSON — Mat. 1703'
      ],
      viaturas: [
        'CHEVROLET S-10 — TTU2F83',
        'MITSUBISHI L200 — TUH1G04'
      ],
      postos: [
        'BARRELÃO', 'BOA ESPERANÇA', 'CASA DE BAMBU', 'ETA BARRELÃO',
        'ETA JAPERI', 'MACUCO', 'MANTIQUEIRA', 'MICRO ETA JACERUBA',
        'REPRESA DE SÃO PEDRO', 'REPRESA DE XERÉM', 'RIO D\'OURO', 'TÚNEL IV — ETA JAPERI'
      ]
    },
    'PLANTAO_ASSESSORIA': {
      id: 2,
      nome: 'PLANTÃO ASSESSORIA',
      formTitle: 'SUPERVISÃO — PLANTÃO ASSESSORIA',
      supervisores: [],
      viaturas: [],
      postos: []
    },
    'GUANDU': {
      id: 3,
      nome: 'GUANDU',
      formTitle: 'SUPERVISÃO — GUANDU',
      supervisores: [
        'EDUARDO ACIOLE — Mat. 1700',
        'ELIEZER GONÇALVES — Mat. 1685',
        'LUIZ CLAUDIO — Mat. 1712'
      ],
      viaturas: [
        'FIAT ARGO — A INFORMAR'
      ],
      postos: [
        'ETA GUANDU', 'BRG — PRINCIPAL', 'BRG — PERÓXIDO',
        'ELEVATÓRIA ZONA RURAL', 'ELEVATÓRIA DO LAMEIRÃO',
        'BARRAGEM PRINCIPAL', 'BARRAGEM AUXILIAR',
        'LAGOA DE BOMBEAMENTO', 'ALMOXARIFADO — PALMARES',
        'MENDANHA Nº 2056', 'MENDANHA Nº 3109'
      ]
    },
    'LARANJAL': {
      id: 4,
      nome: 'LARANJAL',
      formTitle: 'SUPERVISÃO — LARANJAL',
      supervisores: [],
      viaturas: [],
      postos: []
    }
  }
};
