/** Cadastro offline-first de atendimentos — backend Google Apps Script. */
const PLANILHA_ATENDIMENTOS_ID = "1qY8SBowwMl2Z5N1-bpH3Q66ocNfayhj6ml2xnHZvudM";
const ABA_ATENDIMENTOS = "Atendimentos";
// Configure com a origem HTTPS do GitHub Pages, sem barra final.
const ORIGEM_PWA_PERMITIDA = "https://dadosturismo.github.io";
const SESSAO_ATENDIMENTO_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSAO_ATENDIMENTO_CACHE_TTL_SECONDS = 21600;
const CHAVE_SESSAO_ATENDIMENTO = "atendimentos:sessao:";
const USUARIOS_ATENDIMENTO = [
  { login: "adminCADASTRO", senha: "@turismo..", todosAtrativos: true },
  { login: "adminCTUR", senha: "@detur2@", atrativos: ["CTUR (DETUR)"] },
  { login: "adminCTUR", senha: "@pedra2@", atrativos: ["CTUR (Sala de Pedra)"] },
  { login: "adminTORRE", senha: "@torre2@", atrativos: ["Torre Panorâmica (Recepção)"] },
  { login: "adminTORREELEVADOR", senha: "@torre2@", atrativos: ["Torre Panorâmica (Elevador)"] },
  { login: "adminJARDIM", senha: "@botanico2@", atrativos: ["Jardim Botânico"] }
];

// Mantém as restrições atuais mesmo em sessões iniciadas antes de uma mudança de acesso.
const ATRATIVOS_FORCADOS_POR_USUARIO = {
  "adminTORRE": ["Torre Panorâmica (Recepção)"],
  "adminTORREELEVADOR": ["Torre Panorâmica (Elevador)"]
};

const PAISES_ORIGEM = [
  "Afeganistão", "África do Sul", "Albânia", "Alemanha", "Andorra", "Angola", "Antígua e Barbuda", "Arábia Saudita", "Argélia", "Argentina", "Armênia", "Austrália", "Áustria", "Azerbaijão",
  "Bahamas", "Bahrein", "Bangladesh", "Barbados", "Bélgica", "Belize", "Benim", "Bielorrússia", "Bolívia", "Bósnia e Herzegovina", "Botsuana", "Brasil", "Brunei", "Bulgária", "Burkina Faso", "Burundi", "Butão",
  "Cabo Verde", "Camarões", "Camboja", "Canadá", "Catar", "Cazaquistão", "Chade", "Chile", "China", "Chipre", "Colômbia", "Comores", "Congo (República do Congo)", "Coreia do Norte", "Coreia do Sul", "Costa do Marfim", "Costa Rica", "Croácia", "Cuba",
  "Dinamarca", "Djibuti", "Dominica", "Egito", "El Salvador", "Emirados Árabes Unidos", "Equador", "Eritreia", "Eslováquia", "Eslovênia", "Espanha", "Estado da Palestina", "Estados Unidos", "Estônia", "Eswatini", "Etiópia",
  "Fiji", "Filipinas", "Finlândia", "França", "Gabão", "Gâmbia", "Gana", "Geórgia", "Granada", "Grécia", "Guatemala", "Guiana", "Guiné", "Guiné-Bissau", "Guiné Equatorial",
  "Haiti", "Honduras", "Hungria", "Iêmen", "Ilhas Marshall", "Ilhas Salomão", "Índia", "Indonésia", "Irã", "Iraque", "Irlanda", "Islândia", "Israel", "Itália", "Jamaica", "Japão", "Jordânia",
  "Kiribati", "Kuwait", "Laos", "Lesoto", "Letônia", "Líbano", "Libéria", "Líbia", "Liechtenstein", "Lituânia", "Luxemburgo", "Macedônia do Norte", "Madagascar", "Malásia", "Malawi", "Maldivas", "Mali", "Malta", "Marrocos", "Maurício", "Mauritânia", "México", "Mianmar", "Micronésia", "Moçambique", "Moldávia", "Mônaco", "Mongólia", "Montenegro",
  "Namíbia", "Nauru", "Nepal", "Nicarágua", "Níger", "Nigéria", "Noruega", "Nova Zelândia", "Omã", "Holanda", "Palau", "Panamá", "Papua-Nova Guiné", "Paquistão", "Paraguai", "Peru", "Polônia", "Portugal",
  "Quênia", "Quirguistão", "Reino Unido", "República Centro-Africana", "República Democrática do Congo", "República Dominicana", "Romênia", "Ruanda", "Rússia", "Samoa", "San Marino", "Santa Lúcia", "São Cristóvão e Névis", "São Tomé e Príncipe", "São Vicente e Granadinas", "Seicheles", "Senegal", "Serra Leoa", "Sérvia", "Singapura", "Síria", "Somália", "Sri Lanka", "Sudão", "Sudão do Sul", "Suécia", "Suíça", "Suriname",
  "Tailândia", "Tajiquistão", "Tanzânia", "Tchéquia", "Timor-Leste", "Togo", "Tonga", "Trinidad e Tobago", "Tunísia", "Turcomenistão", "Turquia", "Tuvalu", "Ucrânia", "Uganda", "Uruguai", "Uzbequistão", "Vanuatu", "Vaticano", "Venezuela", "Vietnã", "Zâmbia", "Zimbábue"
];
const ESTADOS_BRASILEIROS = ["Acre","Alagoas","Amapá","Amazonas","Bahia","Ceará","Distrito Federal","Espírito Santo","Goiás","Maranhão","Mato Grosso","Mato Grosso do Sul","Minas Gerais","Pará","Paraíba","Paraná","Pernambuco","Piauí","Rio de Janeiro","Rio Grande do Norte","Rio Grande do Sul","Rondônia","Roraima","Santa Catarina","São Paulo","Sergipe","Tocantins"];
const TIPOS_ATENDIMENTO = ["Curitiba e Região Metropolitana", "Visitante"];
const ATRATIVOS_CONFIG = {
  "Torre Panorâmica (Recepção)": { permiteGrupo:true, principais:["Torre Panorâmica","Atrativos Turísticos","Linhas de ônibus","Linha Turismo","Shopping Center"], outros:["Viagem de Trem","Santa Felicidade","Endereços / Telefones","Litoral","Feira do Largo","Alimentação / Restaurantes","Hotéis","Pontos noturnos","Programação cultural / eventos","Guias de Turismo","RMC","Mapa Turístico","Outros"] },
  "Torre Panorâmica (Elevador)": { permiteGrupo:true, solicitaInformacao:false, principais:[], outros:[] },
  "Jardim Botânico": { permiteGrupo:true, principais:["Mapa Turístico","Linha Turismo","Jardim Botânico","Atrativos Turísticos","Viagem de Trem"], outros:["Litoral","Hotéis / Meios de Hospedagem","Linhas de ônibus","Endereços / Telefones","Locação de bicicletas","Shopping","Programação cultural / eventos","Santa Felicidade","Torre Panorâmica","Alimentação / Restaurantes","Pontos noturnos","Feira do Largo","Paraná","RMC","Mercado Municipal","Zoológico","Guias de Turismo","Outros"] },
  "CTUR (DETUR)": { permiteGrupo:false, principais:["Linha Turismo","Jardim Botânico","Atrativos Turísticos","Viagem de Trem","Litoral"], outros:["Hospedagem","Linhas de ônibus","Endereços/Telefones","Locação de Bicicletas","Shopping Center","Programação cultural/eventos","Santa Felicidade","Torre Panorâmica","Gastronomia","Feira do Largo","Paraná","RMC","Mercado Municipal","Zoológico","Guias de Turismo","Natal","Outros"] },
  "CTUR (Sala de Pedra)": { permiteGrupo:true, solicitaInformacao:true, principais:["Linha Turismo","Jardim Botânico","Atrativos Turísticos","Viagem de Trem","Litoral"], outros:["Hospedagem","Linhas de ônibus","Endereços/Telefones","Locação de Bicicletas","Shopping Center","Programação cultural/eventos","Santa Felicidade","Torre Panorâmica","Gastronomia","Feira do Largo","Paraná","RMC","Mercado Municipal","Zoológico","Guias de Turismo","Natal","Outros"] }
};

function doGet() {
  return ContentService.createTextOutput("Este endereço é o serviço de sincronização do Cadastro de Atendimentos. Use o aplicativo publicado no GitHub Pages.");
}

/** Ponte POST usada pela PWA externa. Não exige CORS: responde a um iframe com postMessage. */
function doPost(e) {
  const p = (e && e.parameter) || {};
  const nonce = String(p.nonce || "");
  let resposta;
  try {
    if (p.origin !== ORIGEM_PWA_PERMITIDA) throw new Error("Origem da PWA não autorizada.");
    if (!/^[A-Za-z0-9_-]{8,150}$/.test(nonce)) throw new Error("Requisição inválida.");
    const dados = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(String(p.payload || ""))).getDataAsString("UTF-8"));
    if (p.action === "login") {
      resposta = { sucesso: true, dados: iniciarSessaoAtendimento_(dados) };
    } else {
      const sessao = obterSessaoAtendimento_(p.token);
      resposta = p.action === "opcoes" ? { sucesso: true, opcoes: obterOpcoesAtendimento(sessao) } :
        p.action === "sincronizar" ? registrarAtendimento(dados, sessao) :
        p.action === "logout" ? encerrarSessaoAtendimento_(p.token) : (() => { throw new Error("Ação inválida."); })();
    }
  } catch (erro) {
    resposta = { sucesso: false, erro: erro.message || "Falha ao processar a solicitação." };
  }
  resposta.nonce = nonce;
  const mensagem = JSON.stringify({ tipo: "atendimento-pwa", resposta: resposta }).replace(/</g, "\\u003c");
  const origem = JSON.stringify(p.origin || "");
  // HTML Service cria um iframe interno; top é a PWA que submeteu o formulário oculto.
  return HtmlService.createHtmlOutput("<script>window.top.postMessage(" + mensagem + "," + origem + ");</script>")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function obterOpcoesAtendimento(sessao) {
  const atrativosPermitidos = {};
  listarAtrativosPermitidos_(sessao).forEach((atrativo) => { atrativosPermitidos[atrativo] = ATRATIVOS_CONFIG[atrativo]; });
  return { usuario: sessao.usuario, paises: PAISES_ORIGEM, estados: ESTADOS_BRASILEIROS, atrativos: atrativosPermitidos };
}

/** Idempotente: o mesmo idEnvio jamais cria uma segunda linha. */
function registrarAtendimento(dados, sessao) {
  validarConfiguracaoPlanilha_(); dados = dados || {};
  const idEnvio = limparTexto_(dados.idEnvio, 100);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(idEnvio)) throw new Error("ID de envio inválido.");
  const atrativo = limparTexto_(dados.atrativo, 100), nome = limparTexto_(dados.nome, 160), tipoAtendimento = limparTexto_(dados.tipoAtendimento, 100);
  const nacionalidade = limparTexto_(dados.nacionalidade, 20); let paisOrigem = limparTexto_(dados.paisOrigem, 100);
  let estadoOrigem = limparTexto_(dados.estadoOrigem, 80); let informacao = "", informacaoOutro = "";
  const observacoes = limparTexto_(dados.observacoes, 3000);
  if (!ATRATIVOS_CONFIG[atrativo] || !sessaoPermiteAtrativo_(sessao, atrativo)) throw new Error("Seu acesso não permite registrar atendimentos neste atrativo.");
  if (!nome) throw new Error("Informe seu nome.");
  if (!TIPOS_ATENDIMENTO.includes(tipoAtendimento)) throw new Error("Selecione o tipo de atendimento.");
  if (!["Brasileiro","Estrangeiro"].includes(nacionalidade)) throw new Error("Selecione se o visitante é brasileiro ou estrangeiro.");
  if (tipoAtendimento === "Curitiba e Região Metropolitana") { paisOrigem = "Brasil"; estadoOrigem = "Curitiba e Região Metropolitana"; }
  else if (nacionalidade === "Brasileiro") paisOrigem = "Brasil";
  if (!paisOrigemValido_(paisOrigem)) throw new Error("Selecione um país de origem válido.");
  paisOrigem = normalizarPaisOrigem_(paisOrigem);
  if (tipoAtendimento === "Curitiba e Região Metropolitana" && estadoOrigem !== "Curitiba e Região Metropolitana") throw new Error("Estado de origem inválido.");
  if (tipoAtendimento !== "Curitiba e Região Metropolitana" && nacionalidade === "Brasileiro" && !ESTADOS_BRASILEIROS.includes(estadoOrigem)) throw new Error("Selecione um estado de origem válido.");
  const configuracaoAtrativo = ATRATIVOS_CONFIG[atrativo];
  if (configuracaoAtrativo.solicitaInformacao === false) {
    informacao = "";
    informacaoOutro = "";
  } else {
    // Aceita o formato anterior de um único item para sincronizar filas offline já existentes.
    const informacoesRecebidas = Array.isArray(dados.informacoes) ? dados.informacoes : [{ informacao: dados.informacao, informacaoOutro: dados.informacaoOutro }];
    if (!informacoesRecebidas.length || informacoesRecebidas.length > 25) throw new Error("Informe de 1 a 25 informações solicitadas.");
    const opcoesInformacao = configuracaoAtrativo.principais.concat(configuracaoAtrativo.outros);
    const informacoesValidas = [], informacoesOutras = [], informacoesJaIncluidas = {};
    informacoesRecebidas.forEach((item) => {
      const valor = limparTexto_(item && item.informacao, 160);
      const outro = limparTexto_(item && item.informacaoOutro, 500);
      if (!opcoesInformacao.includes(valor)) throw new Error("Selecione uma informação solicitada válida.");
      if (informacoesJaIncluidas[valor]) throw new Error("Não repita a mesma informação solicitada.");
      if (valor === "Outros" && !outro) throw new Error("Descreva a outra informação solicitada.");
      informacoesJaIncluidas[valor] = true;
      informacoesValidas.push(valor);
      if (valor === "Outros") informacoesOutras.push(outro);
    });
    informacao = informacoesValidas.join(" | ");
    informacaoOutro = informacoesOutras.join(" | ");
  }
  const quantidadeGrupo = Number(dados.quantidadeGrupo || 0);
  if (configuracaoAtrativo.permiteGrupo && (!Number.isInteger(quantidadeGrupo) || quantidadeGrupo < 1 || quantidadeGrupo > 100)) throw new Error("Informe de 1 a 100 pessoas no grupo.");
  const dataInformada = new Date(dados.criadoEm || "");
  const dataHora = isNaN(dataInformada.getTime()) ? new Date() : dataInformada;
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const aba = obterAbaAtendimentos_(), colunaId = garantirCabecalhoAtendimentos_(aba);
    if (aba.getLastRow() > 1 && aba.getRange(2, colunaId, aba.getLastRow() - 1, 1).createTextFinder(idEnvio).matchEntireCell(true).findNext())
      return { sucesso: true, duplicado: true, idEnvio: idEnvio };
    aba.appendRow([dataHora,nome,tipoAtendimento,nacionalidade,paisOrigem,(tipoAtendimento === "Curitiba e Região Metropolitana" || nacionalidade === "Brasileiro") ? estadoOrigem : "",informacao,informacaoOutro,observacoes,idEnvio,atrativo,configuracaoAtrativo.permiteGrupo ? quantidadeGrupo : 1]);
    return { sucesso: true, duplicado: false, idEnvio: idEnvio };
  } finally { lock.releaseLock(); }
}

function obterAbaAtendimentos_() { const p = SpreadsheetApp.openById(PLANILHA_ATENDIMENTOS_ID); return p.getSheetByName(ABA_ATENDIMENTOS) || p.insertSheet(ABA_ATENDIMENTOS); }
function garantirCabecalhoAtendimentos_(aba) {
  const h = ["Data e hora","Nome","Tipo de atendimento","Nacionalidade","País de origem","Estado de origem","Informação solicitada","Informação solicitada — Outro","Observações","ID de envio","Atrativo","Pessoas no grupo"];
  if (!aba.getLastRow()) { aba.appendRow(h); aba.setFrozenRows(1); }
  else { const atual = aba.getRange(1,1,1,aba.getLastColumn()).getValues()[0]; h.forEach(x=>{if(atual.indexOf(x)===-1) aba.getRange(1,aba.getLastColumn()+1).setValue(x);}); }
  aba.getRange(1,1,1,aba.getLastColumn()).setFontWeight("bold").setBackground("#dfe84a");
  return aba.getRange(1,1,1,aba.getLastColumn()).getValues()[0].indexOf("ID de envio") + 1;
}
function validarConfiguracaoPlanilha_() { if (!PLANILHA_ATENDIMENTOS_ID || PLANILHA_ATENDIMENTOS_ID === "COLE_AQUI_O_ID_DA_PLANILHA") throw new Error("Configure PLANILHA_ATENDIMENTOS_ID."); }
function limparTexto_(valor, limite) { return String(valor || "").trim().slice(0, limite); }
// "Holanda" é o nome exibido no formulário; a base histórica usa "Países Baixos".
// Mantém compatibilidade com registros offline antigos que ainda trazem o nome da base.
function paisOrigemValido_(pais) { return PAISES_ORIGEM.includes(pais) || pais === "Países Baixos"; }
function normalizarPaisOrigem_(pais) { return pais === "Holanda" || pais === "Países Baixos" ? "Países Baixos" : pais; }

function iniciarSessaoAtendimento_(dados) {
  const login = limparTexto_(dados && dados.login, 80);
  const senha = String((dados && dados.senha) || "");
  const usuario = USUARIOS_ATENDIMENTO.filter((item) => item.login === login && item.senha === senha)[0];
  if (!usuario) throw new Error("Login ou senha inválidos.");

  const token = Utilities.getUuid().replace(/-/g, "");
  const sessao = {
    usuario: usuario.login,
    todosAtrativos: Boolean(usuario.todosAtrativos),
    atrativos: usuario.atrativos || [],
    expiraEm: Date.now() + SESSAO_ATENDIMENTO_TTL_MS
  };
  salvarSessaoAtendimento_(token, sessao);
  return { token: token, usuario: sessao.usuario, expiraEm: sessao.expiraEm, opcoes: obterOpcoesAtendimento(sessao) };
}

function obterSessaoAtendimento_(token) {
  token = String(token || "");
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(token)) throw new Error("Sessão inválida ou expirada. Entre novamente.");
  let sessao = null;
  try {
    const cache = CacheService.getScriptCache().get(CHAVE_SESSAO_ATENDIMENTO + token);
    if (cache) sessao = JSON.parse(cache);
  } catch (_) {}
  if (!sessao) {
    const salvo = PropertiesService.getScriptProperties().getProperty(CHAVE_SESSAO_ATENDIMENTO + token);
    if (salvo) {
      try { sessao = JSON.parse(salvo); } catch (_) {}
    }
  }
  if (!sessao || Number(sessao.expiraEm || 0) <= Date.now()) {
    encerrarSessaoAtendimento_(token);
    throw new Error("Sessão inválida ou expirada. Entre novamente.");
  }
  sessao.expiraEm = Date.now() + SESSAO_ATENDIMENTO_TTL_MS;
  salvarSessaoAtendimento_(token, sessao);
  return sessao;
}

function salvarSessaoAtendimento_(token, sessao) {
  const conteudo = JSON.stringify(sessao);
  PropertiesService.getScriptProperties().setProperty(CHAVE_SESSAO_ATENDIMENTO + token, conteudo);
  try { CacheService.getScriptCache().put(CHAVE_SESSAO_ATENDIMENTO + token, conteudo, SESSAO_ATENDIMENTO_CACHE_TTL_SECONDS); } catch (_) {}
}

function encerrarSessaoAtendimento_(token) {
  token = String(token || "");
  try { CacheService.getScriptCache().remove(CHAVE_SESSAO_ATENDIMENTO + token); } catch (_) {}
  if (token) PropertiesService.getScriptProperties().deleteProperty(CHAVE_SESSAO_ATENDIMENTO + token);
  return { sucesso: true };
}

function listarAtrativosPermitidos_(sessao) {
  if (sessao && sessao.todosAtrativos) return Object.keys(ATRATIVOS_CONFIG);
  const atrativosForcados = ATRATIVOS_FORCADOS_POR_USUARIO[String(sessao && sessao.usuario || "")];
  if (atrativosForcados) return atrativosForcados.filter((atrativo) => Boolean(ATRATIVOS_CONFIG[atrativo]));
  return (sessao && sessao.atrativos || []).filter((atrativo) => Boolean(ATRATIVOS_CONFIG[atrativo]));
}

function sessaoPermiteAtrativo_(sessao, atrativo) {
  return listarAtrativosPermitidos_(sessao).includes(atrativo);
}
