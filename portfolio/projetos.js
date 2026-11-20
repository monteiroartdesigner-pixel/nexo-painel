/* Lista de projetos do portfólio NEXO.
 *
 * É AQUI que a atualização semanal mexe. A página monta as fichas sozinha a partir desta lista.
 *
 * Para incluir um projeto:
 *   1. Ponha o vídeo leve e a capa em assets/media/  (nome.mp4 e nome.jpg, mesmo nome).
 *   2. Copie um bloco abaixo, troque os textos e escolha o formato do vídeo:
 *        "horizontal" (16:9) · "vertical" (9:16) · "4x5" · "dupla" (dois vídeos verticais lado a lado)
 *   3. Troque a data em "atualizado".
 *
 * Regras (as mesmas do resto da NEXO):
 *   - Só entra o que aparece no vídeo. Nada de funcionalidade, número ou cliente inventado.
 *   - Protótipo é chamado de protótipo; proposta é chamada de proposta.
 *   - Vídeo que mostra dado de lead ou de cliente final não entra.
 *   - Projeto de cliente só entra com a autorização dele.
 */
window.PROJETOS = {
  atualizado: "2026-11-20",
  lista: [
    {
      id: "meinerz",
      nome: "Meinerz Esportes",
      tipo: "Site de vitrine e sistema interno de orçamentos para uma marca de uniformes esportivos.",
      formato: "horizontal",
      videos: [{ arquivo: "meinerz", descricao: "Vídeo: site e sistema de orçamentos da Meinerz Esportes" }],
      itens: [
        "O cliente monta o pedido no site e vê o total na hora.",
        "O pedido chega ao vendedor no WhatsApp, já descrito.",
        "A equipe consulta 188 produtos e alterna entre três tabelas de preço.",
        "A margem é conferida antes de enviar e o orçamento sai em PDF com a marca.",
        "O envio de cada pedido à fábrica é acompanhado por prazo e situação.",
      ],
      serve: "confecções, indústrias, distribuidoras e toda empresa que faz orçamento sob medida.",
    },
    {
      id: "scariot",
      nome: "Scariot Bike",
      tipo: "Loja online de bikes de grau, com oficina, em Toledo, no Paraná.",
      formato: "vertical",
      videos: [{ arquivo: "scariot", descricao: "Vídeo: loja online da Scariot Bike" }],
      itens: [
        "Abertura em vídeo e catálogo com busca, filtro por marca e opção de cor.",
        "Preço no Pix e parcelado em cada produto.",
        "Carrinho com frete calculado pelo CEP e cupom de desconto.",
        "Painel do lojista para mudar preço, parcelas, estoque e cadastrar produto.",
      ],
      serve: "lojas que vendem pelo Instagram e respondem preço e modelo um a um.",
    },
    {
      id: "fornari",
      nome: "Fornari Uniformes",
      tipo: "Proposta de site com catálogo para uma confecção de uniformes profissionais.",
      formato: "horizontal",
      videos: [{ arquivo: "fornari", descricao: "Vídeo: proposta de site da Fornari Uniformes" }],
      itens: [
        "Catálogo de 201 modelos organizado em 8 linhas, com filtro.",
        "Página própria da linha esportiva, com simulador de uniforme.",
        "Pedido de orçamento que abre o WhatsApp com a mensagem pronta.",
        "Rodízio dos pedidos entre as vendedoras.",
        "Tela para a equipe trocar fotos, nomes e incluir modelos.",
      ],
      serve: "empresas com catálogo grande e equipe de vendas: confecções, gráficas, distribuidoras, imobiliárias.",
    },
    {
      id: "movin",
      nome: "MOVIN",
      tipo: "Protótipo navegável de um estúdio de treino: o painel da dona e o app da aluna.",
      formato: "dupla",
      videos: [
        { arquivo: "movin-painel", descricao: "Vídeo: painel da dona do estúdio MOVIN" },
        { arquivo: "movin-app", descricao: "Vídeo: app da aluna do estúdio MOVIN" },
      ],
      itens: [
        "Painel com o recebido no mês, quem está em dia, pendente ou em atraso.",
        "Convite por link: a própria aluna preenche o cadastro e envia o atestado.",
        "Cobranças com quatro lembretes, de três dias antes até o dia do vencimento.",
        "Construtor de treinos, grade com lotação por horário e mural de recados.",
        "No app: treino do dia, registro de carga, check-in, reagendamento e faturas.",
      ],
      serve: "estúdios, academias, clínicas e negócios com cliente recorrente e mensalidade.",
    },
    {
      id: "nexo-sport",
      nome: "NEXO Sport",
      tipo: "Plataforma própria da NEXO para escolinhas esportivas, com três perfis de acesso.",
      formato: "horizontal",
      videos: [{ arquivo: "nexo-sport", descricao: "Vídeo: como usar o NEXO Sport" }],
      itens: [
        "Família: cadastro em dois minutos, documentos, comunicados com confirmação de leitura e mensalidades.",
        "Professor: chamada com um toque por aluno, que funciona mesmo sem internet.",
        "Frequência do mês com filtro para quem está abaixo de 75%.",
        "Área master: todas as escolinhas, planos, situação do contrato e chamados.",
      ],
      serve: "escolinhas, escolas de dança, música, idiomas e cursos com turmas.",
    },
    {
      id: "nexo-varzea",
      nome: "NEXO Várzea",
      tipo: "Produto próprio da NEXO para quem organiza time amador de campo, society ou futsal.",
      formato: "4x5",
      videos: [{ arquivo: "nexo-varzea", descricao: "Vídeo: lançamento do NEXO Várzea" }],
      itens: [
        "Elenco pelo link: cada jogador se cadastra sozinho, sem baixar nada.",
        "Mensalidade no Pix: o app gera a cobrança do mês e marca quem pagou.",
        "Caixa do time: o que entrou, o que saiu e o motivo de cada lançamento.",
        "Pedido de uniforme com tamanho, número e nome, pronto para a confecção.",
      ],
      serve: "times, ligas e grupos que cobram mensalidade pelo grupo do WhatsApp. Tem 14 dias grátis.",
    },
    {
      id: "nexo-resenha",
      nome: "Nexo Resenha",
      tipo: "Site de uma loja de camisas de time, com abertura em vídeo e pedido pelo WhatsApp.",
      formato: "vertical",
      videos: [{ arquivo: "nexo-resenha", descricao: "Vídeo: site da Nexo Resenha" }],
      itens: [
        "Abertura cinematográfica que acompanha a rolagem da página.",
        "Catálogo de lançamentos e retrôs, com filtro por liga.",
        "Foto ampliada de cada camisa e botão de pedido.",
        "Painel para trocar foto, preço, nome e ordem dos modelos.",
      ],
      serve: "lojas de artigos esportivos, moda e colecionáveis.",
    },
  ],
};
