export type CampoTipo = "text" | "password" | "url";

export type IntegracaoCampo = {
  key: string;
  label: string;
  tipo: CampoTipo;
  placeholder?: string;
  ajuda?: string;
};

export type IntegracaoDef = {
  provider: string;
  nome: string;
  categoria: "pagamento";
  cor: string;
  descricao: string;
  resumo: string;
  webhook: boolean;
  prerequisitos: string[];
  passos: string[];
  urls: { label: string; url: string }[];
  campos: IntegracaoCampo[];
};

export const INTEGRACOES: IntegracaoDef[] = [
  {
    provider: "mercadopago",
    nome: "Mercado Pago",
    categoria: "pagamento",
    cor: "#00B1EA",
    resumo: "Recebimento automático das notificações de Pix do Mercado Pago.",
    descricao:
      "Receba no sistema, em tempo real, todos os pagamentos Pix confirmados na sua conta Mercado Pago.",
    webhook: true,
    prerequisitos: [
      "Conta Mercado Pago com chave Pix cadastrada",
      "Access Token de produção nas credenciais do painel de desenvolvedores",
    ],
    passos: [
      "Acesse o painel de desenvolvedores do Mercado Pago e abra Suas integrações.",
      "Na aplicação usada para receber o Pix, abra Credenciais de produção e copie novamente o Access Token completo iniciado por APP_USR-.",
      "Abra a seção Webhooks/Notificações da aplicação.",
      "Cole a URL de webhook exibida nesta página e marque o evento de pagamentos.",
      "Cole somente o token, sem a palavra Bearer, aspas ou espaços; salve e clique em Testar conexão.",
    ],
    urls: [
      { label: "Suas integrações", url: "https://www.mercadopago.com.br/developers/panel/app" },
      { label: "Documentação de webhooks", url: "https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks" },
    ],
    campos: [
      { key: "access_token", label: "Access Token (produção)", tipo: "password", placeholder: "APP_USR-..." },
      { key: "webhook_secret", label: "Assinatura secreta do webhook", tipo: "password", ajuda: "Opcional, usada para validar as notificações." },
    ],
  },
  {
    provider: "asaas",
    nome: "Asaas",
    categoria: "pagamento",
    cor: "#1B57D6",
    resumo: "Notificações de Pix e cobranças recebidas via Asaas.",
    descricao:
      "Integre a conta Asaas para registrar automaticamente os Pix recebidos e o status das cobranças.",
    webhook: true,
    prerequisitos: ["Conta Asaas ativa", "Chave de API (API Key) gerada no painel"],
    passos: [
      "No painel Asaas, acesse Integrações → Chave de API e gere a chave.",
      "Acesse Integrações → Webhooks e clique em Novo webhook.",
      "Cole a URL de webhook exibida nesta página.",
      "Selecione os eventos de cobrança recebida (PAYMENT_RECEIVED / PAYMENT_CONFIRMED).",
      "Salve e clique em Testar conexão aqui.",
    ],
    urls: [
      { label: "Painel Asaas", url: "https://www.asaas.com/login" },
      { label: "Documentação de webhooks", url: "https://docs.asaas.com/docs/webhook-para-cobrancas" },
    ],
    campos: [
      { key: "api_key", label: "API Key", tipo: "password", placeholder: "$aact_..." },
      { key: "webhook_token", label: "Token de autenticação do webhook", tipo: "password", ajuda: "Opcional, enviado no header asaas-access-token." },
    ],
  },
  {
    provider: "pagbank",
    nome: "PagBank",
    categoria: "pagamento",
    cor: "#008C4F",
    resumo: "Notificações de Pix recebidas na conta PagBank (PagSeguro).",
    descricao:
      "Receba automaticamente no sistema os Pix confirmados na sua conta PagBank / PagSeguro.",
    webhook: true,
    prerequisitos: ["Conta PagBank com chave Pix cadastrada", "Token de API gerado no painel do vendedor"],
    passos: [
      "Acesse o painel PagBank e abra Vendas → Integrações → Token de segurança.",
      "Gere e copie o token de API.",
      "Abra a área de Notificações/Webhooks e cadastre a URL exibida nesta página.",
      "Selecione as notificações de transação Pix.",
      "Salve e clique em Testar conexão aqui.",
    ],
    urls: [
      { label: "Painel PagBank", url: "https://minhaconta.pagbank.com.br" },
      { label: "Documentação de notificações", url: "https://dev.pagbank.uol.com.br/reference/webhooks" },
    ],
    campos: [
      { key: "token", label: "Token de API", tipo: "password" },
      { key: "email", label: "E-mail da conta", tipo: "text" },
    ],
  },
  {
    provider: "pagarme",
    nome: "Pagar.me",
    categoria: "pagamento",
    cor: "#65A300",
    resumo: "Notificações de Pix confirmadas na conta Pagar.me.",
    descricao:
      "Receba automaticamente no sistema os Pix confirmados na sua conta Pagar.me através de postbacks/webhooks.",
    webhook: true,
    prerequisitos: ["Conta Pagar.me ativa", "Chave secreta (Secret Key) da API"],
    passos: [
      "Acesse a Dashboard Pagar.me e abra Configurações → Chaves de API.",
      "Copie a Secret Key (sk_...) do ambiente de produção.",
      "Abra Configurações → Webhooks e clique em Adicionar endpoint.",
      "Cole a URL de webhook exibida nesta página no campo URL do endpoint.",
      "Habilite apenas os eventos order.paid e charge.paid (Pix confirmado).",
      "Salve e clique em Testar conexão aqui.",
    ],
    urls: [
      { label: "Dashboard Pagar.me", url: "https://dash.pagar.me" },
      { label: "Documentação de webhooks", url: "https://docs.pagar.me/docs/webhooks" },
    ],
    campos: [
      { key: "secret_key", label: "Secret Key", tipo: "password", placeholder: "sk_..." },
      { key: "public_key", label: "Public Key", tipo: "text", ajuda: "Opcional." },
    ],
  },
  {
    provider: "efi",
    nome: "Efí Bank (Gerencianet)",
    categoria: "pagamento",
    cor: "#F36C21",
    resumo: "Notificações de Pix recebidas na conta Efí Bank.",
    descricao:
      "Integre a conta Efí Bank (antiga Gerencianet) para registrar automaticamente os Pix recebidos.",
    webhook: true,
    prerequisitos: [
      "Conta Efí Bank com chave Pix cadastrada",
      "Aplicação criada com Client ID e Client Secret",
      "Certificado da API Pix gerado no painel",
    ],
    passos: [
      "Acesse o painel Efí e abra API → Minhas aplicações.",
      "Crie uma aplicação com os escopos de Pix (cob.read, pix.read, webhook.write).",
      "Copie o Client ID e o Client Secret de produção.",
      "Em API → Pix → Webhooks, cadastre a URL exibida nesta página para a sua chave Pix.",
      "Habilite apenas as notificações de Pix recebido.",
      "Salve e clique em Testar conexão aqui.",
    ],
    urls: [
      { label: "Painel Efí Bank", url: "https://sejaefi.com.br" },
      { label: "Documentação Pix / webhook", url: "https://dev.efipay.com.br/docs/api-pix/webhooks" },
    ],
    campos: [
      { key: "client_id", label: "Client ID", tipo: "text" },
      { key: "client_secret", label: "Client Secret", tipo: "password" },
      { key: "chave_pix", label: "Chave Pix", tipo: "text" },
    ],
  },
  {
    provider: "inter",
    nome: "Banco Inter",
    categoria: "pagamento",
    cor: "#FF7A00",
    resumo: "Notificações de Pix recebidas na conta PJ do Banco Inter.",
    descricao:
      "Receba automaticamente no sistema os Pix confirmados na sua conta Banco Inter Empresas.",
    webhook: true,
    prerequisitos: [
      "Conta PJ no Banco Inter com Internet Banking",
      "Aplicação criada em Integrações → API com escopos de Pix",
      "Certificado e chave privada emitidos pelo Inter",
    ],
    passos: [
      "No Internet Banking Inter, acesse Integrações → API e crie uma aplicação.",
      "Selecione os escopos de Pix recebidos (pix.read e webhook.write).",
      "Copie o Client ID e o Client Secret gerados.",
      "Cadastre a URL de webhook exibida nesta página para a sua chave Pix.",
      "Habilite apenas as notificações de Pix recebido.",
      "Salve e clique em Testar conexão aqui.",
    ],
    urls: [
      { label: "Internet Banking Inter", url: "https://internetbanking.bancointer.com.br" },
      { label: "Documentação Pix Inter", url: "https://developers.inter.co/references/pix" },
    ],
    campos: [
      { key: "client_id", label: "Client ID", tipo: "text" },
      { key: "client_secret", label: "Client Secret", tipo: "password" },
      { key: "chave_pix", label: "Chave Pix", tipo: "text" },
    ],
  },
  {
    provider: "stone",
    nome: "Stone",
    categoria: "pagamento",
    cor: "#00A868",
    resumo: "Notificações de Pix recebidas na conta Stone.",
    descricao: "Integre a conta Stone para registrar automaticamente os Pix confirmados.",
    webhook: true,
    prerequisitos: ["Conta Stone PJ ativa", "Credenciais de API (Client ID / Secret) liberadas pela Stone"],
    passos: [
      "Acesse o portal do desenvolvedor Stone e abra suas credenciais de API.",
      "Copie o Client ID e a Secret Key de produção.",
      "Na área de webhooks, cadastre a URL exibida nesta página.",
      "Habilite apenas os eventos de Pix recebido / crédito confirmado.",
      "Salve e clique em Testar conexão aqui.",
    ],
    urls: [
      { label: "Portal Stone", url: "https://conta.stone.com.br" },
      { label: "Documentação Stone", url: "https://docs.openbank.stone.com.br" },
    ],
    campos: [
      { key: "client_id", label: "Client ID", tipo: "text" },
      { key: "secret_key", label: "Secret Key", tipo: "password" },
      { key: "conta", label: "Número da conta", tipo: "text", ajuda: "Opcional." },
    ],
  },
  {
    provider: "cielo",
    nome: "Cielo",
    categoria: "pagamento",
    cor: "#0055A5",
    resumo: "Notificações de Pix recebidas via Cielo.",
    descricao: "Receba as confirmações de Pix processadas pela Cielo diretamente no sistema.",
    webhook: true,
    prerequisitos: ["Estabelecimento Cielo ativo", "MerchantId e MerchantKey da API E-commerce"],
    passos: [
      "Acesse o portal Cielo e abra a área de credenciais da API E-commerce.",
      "Copie o MerchantId e o MerchantKey de produção.",
      "Na configuração de notificações (Post de Notificação), cadastre a URL exibida nesta página.",
      "Habilite apenas as notificações de pagamento Pix confirmado.",
      "Salve e clique em Testar conexão aqui.",
    ],
    urls: [
      { label: "Portal Cielo", url: "https://www.cielo.com.br/minha-cielo" },
      { label: "Documentação Cielo API", url: "https://developercielo.github.io/manual/cielo-ecommerce" },
    ],
    campos: [
      { key: "merchant_id", label: "MerchantId", tipo: "text" },
      { key: "merchant_key", label: "MerchantKey", tipo: "password" },
    ],
  },
  {
    provider: "afs",
    nome: "AFS",
    categoria: "pagamento",
    cor: "#7B2FF7",
    resumo: "Notificações de Pix recebidas via AFS.",
    descricao: "Integre a conta AFS para registrar automaticamente os Pix confirmados no sistema.",
    webhook: true,
    prerequisitos: ["Conta AFS ativa", "Token/API Key liberada pelo suporte AFS"],
    passos: [
      "Acesse o painel AFS e abra a área de integrações/API.",
      "Gere e copie o Token (API Key) de produção.",
      "Cadastre a URL de webhook exibida nesta página no campo de notificações.",
      "Habilite apenas os eventos de Pix recebido/confirmado.",
      "Salve e clique em Testar conexão aqui.",
    ],
    urls: [{ label: "Painel AFS", url: "https://afs.com.br" }],
    campos: [
      { key: "api_key", label: "API Key / Token", tipo: "password" },
      { key: "secret_key", label: "Secret Key", tipo: "password", ajuda: "Opcional, se fornecida pela AFS." },
    ],
  },
];

export function getIntegracao(provider: string) {
  return INTEGRACOES.find((i) => i.provider === provider) ?? null;
}

export const CATEGORIA_LABEL: Record<IntegracaoDef["categoria"], string> = {
  pagamento: "Pagamentos / Pix",
};
