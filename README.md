# Diagnóstico de CLS — Playwright

Ferramenta de linha de comando para **investigar mudanças inesperadas de layout (Cumulative Layout Shift — CLS)** em páginas web, com foco na experiência mobile. Usa **Node.js, Playwright e Chromium** para abrir a página, observar os deslocamentos e gerar evidências úteis para depuração e revisão de alterações de código.

> **Importante:** a ferramenta identifica elementos **afetados** por layout shifts e registra acontecimentos próximos no tempo. Isso **não garante** a identificação automática do elemento ou script causador.

## Funcionalidades

- Mede o **CLS da maior janela de sessão** a partir dos eventos da API `PerformanceObserver` (`layout-shift`), ignorando eventos com `hadRecentInput`.
- Informa **quando** cada deslocamento ocorreu, sua pontuação e os elementos/seções visivelmente afetados.
- Monitora geometria de `header`, `footer`, `section`, `main`, `.main-slider`, `.swiper-wrapper` e `#empreendimentos`, acompanhando posição e dimensões.
- Detecta alterações de tamanho com `ResizeObserver` e mudanças relevantes de classes, estilos e nós com `MutationObserver`.
- Registra eventos de carregamento de imagens `<img>`, informações de dimensões e presença de atributos `width`/`height`.
- Registra erros de JavaScript e requisições de rede que falharam.
- Gera um **relatório em Markdown**, **dados em JSON**, **captura da viewport mobile** e **trace do Playwright**.
- Permite executar testes em qualquer URL HTTP(S) com viewport personalizável.

## Requisitos

- Node.js e npm instalados (recomenda-se uma versão LTS recente).
- Bash em Linux/macOS; no Windows, utilize um ambiente Bash compatível, como WSL.
- Internet na primeira execução para instalar o pacote Playwright e o navegador Chromium, caso ainda não estejam disponíveis.

> O script consulta a página por um navegador automatizado. **Não altera os arquivos nem a configuração do site analisado.**

## Instalação e execução

Clone ou baixe o repositório, entre na pasta e execute:

```bash
bash diagnostico-cls.sh
```

O comando acima usa os padrões do projeto:

- **URL:** `https://montante.com.br/`
- **Largura:** `390` pixels
- **Altura:** `844` pixels

Para testar outra página:

```bash
bash diagnostico-cls.sh https://exemplo.com.br/
```

Para alterar a resolução:

```bash
bash diagnostico-cls.sh https://exemplo.com.br/ 375 812
```

Também é possível chamar o JavaScript diretamente se o Playwright e o Chromium já estiverem instalados:

```bash
node diagnostico-cls.js https://exemplo.com.br/ 390 844
```

O `.sh` verifica a presença de Node.js/npm, instala `playwright` localmente caso esteja ausente, verifica o executável do Chromium e chama `diagnostico-cls.js` com os parâmetros fornecidos.

## Arquivos gerados

Cada execução cria uma pasta `resultado-cls-<data-hora>/` no diretório do projeto, contendo:

| Arquivo | Finalidade |
| --- | --- |
| `relatorio.md` | Resumo do CLS, eventos importantes, seções afetadas e ocorrências próximas aos eventos. |
| `dados-cls.json` | Dados brutos/estruturados para análise, incluindo eventos, snapshots, mudanças, mutações e erros coletados. |
| `trace.zip` | Gravação do Playwright com snapshots do DOM e capturas para inspeção visual. |
| `screenshot-mobile.png` | Captura da **viewport** no fim da medição; não é um screenshot de página inteira. |

Para abrir o trace, a partir da pasta do projeto:

```bash
npx playwright show-trace resultado-cls-<data-hora>/trace.zip
```

Substitua `<data-hora>` pelo nome real da pasta gerada.

## Exemplo de saída

Trecho de **uma medição realizada em 22/10/2026** na URL de produção da Montante:

```text
=== DIAGNÓSTICO CLS ===
URL: https://montante.com.br/
Viewport: 390 x 844
CLS: 0.1754

Maiores eventos:
  3.01s  0.1754  section#empreendimentos.section-line.enterprises
```

Nesse exemplo, `#empreendimentos` é a **seção afetada**, e não uma causa confirmada. O relatório detalhado daquela medição registrou alterações de classe e estilo relacionadas a instâncias do Swiper próximas do evento. Isso fornece pistas para investigação, **não uma prova de causalidade**.

### Interpretação do CLS

| CLS | Interpretação usual |
| ---: | --- |
| Até `0,10` | Bom |
| Acima de `0,10` até `0,25` | Precisa melhorar |
| Acima de `0,25` | Ruim |

O número produzido é um **resultado de laboratório em um navegador automatizado**; pode diferir de ferramentas como PageSpeed Insights/Lighthouse e das métricas de usuários reais.

## Como comparar um MR (antes e depois)

1. Execute o diagnóstico na versão **sem** as alterações e salve o resultado.
2. Execute na versão **com** as alterações usando **a mesma URL/ambiente, viewport e condições de rede/CPU**, sempre que possível.
3. Faça múltiplas execuções por versão, pois o momento de carga dos recursos varia.
4. Compare a **pontuação CLS**, o momento dos eventos, os elementos afetados e o `trace.zip`.
5. Confirme visualmente que a interface e a navegação dos sliders continuam corretas.

Uma queda no CLS é evidência de melhoria. **Não conclua que um MR resolveu a causa** apenas por adicionar estilos ao Swiper ou por um único teste ter retornado `0.0000`.

## Como funciona internamente

```text
bash diagnostico-cls.sh
       |
       +-- valida Node.js/npm
       +-- prepara Playwright e Chromium (se necessário)
       |
       v
node diagnostico-cls.js
       |
       +-- cria viewport mobile e inicia trace
       +-- injeta coletor antes dos scripts da página
       +-- navega até a URL e aguarda DOMContentLoaded
       +-- observa layout shifts, tamanhos, DOM, imagens e erros
       +-- aguarda 7 segundos adicionais
       |
       +-- calcula o maior CLS por janela de sessão
       +-- grava relatorio.md, dados-cls.json, trace.zip e PNG
```

A API de Layout Shift é observada desde cedo com `addInitScript`. **A amostragem de geometria, o `ResizeObserver` e o `MutationObserver` começam em `DOMContentLoaded`**; portanto, podem não capturar mudanças anteriores a esse marco.

## Limitações importantes

- O script **não aponta automaticamente a causa raiz**: as fontes de um evento são elementos afetados.
- A duração fixa de observação é de **7 segundos após `DOMContentLoaded`**; alterações posteriores podem ficar de fora.
- A geometria é amostrada aproximadamente a cada **100 ms**; mudanças muito rápidas podem não aparecer.
- São considerados movimentos/diferenças dimensionais de **2 px ou mais** na lista de mudanças geométricas.
- As correlações exibidas no relatório usam uma janela de **±400 ms** em torno de cada evento.
- Não há simulação automática de rede lenta ou limitação de CPU equivalente ao Lighthouse.
- O teste usa Chromium headless com viewport mobile; não equivale necessariamente a um smartphone físico.
- Imagens de fundo em CSS não entram na lista de eventos de carregamento de `<img>`.
- O registro de eventos é limitado para evitar arquivos excessivos (veja o código-fonte).

## Segurança e privacidade

Os relatórios e, especialmente, `trace.zip`, `screenshot-mobile.png` e `dados-cls.json` podem conter **URLs, conteúdo da página ou informações sensíveis** se você testar páginas privadas. Verifique antes de compartilhar. Recomenda-se não versionar a pasta `resultado-cls-*` no Git.

## Estrutura do projeto

```text
diagnostico-cls/
├── diagnostico-cls.sh
├── diagnostico-cls.js
├── README.md
├── RELATORIO-TECNICO.md
├── .gitignore
└── resultado-cls-<data-hora>/   # gerado durante o teste; ignorado pelo Git
```

## Documentação complementar

Leia [`RELATORIO-TECNICO.md`](RELATORIO-TECNICO.md) para detalhes sobre o funcionamento do coletor, os campos registrados e o estudo de caso da Montante.
