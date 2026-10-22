# Relatório técnico — Diagnóstico de Cumulative Layout Shift (CLS)

**Projeto:** Diagnóstico de CLS com Playwright  
**Implementação:** Bash + Node.js + Playwright + Chromium  
**Objeto do relatório:** documentação das funcionalidades, metodologia, saídas e resultados de uma medição de referência.  
**Medição apresentada:** 22/10/2026, site Montante em produção.

## 1. Objetivo

Desenvolver uma ferramenta de diagnóstico para identificar **quais elementos se deslocam durante o carregamento** de uma página e reunir evidências que auxiliem a investigar os possíveis responsáveis pelo Cumulative Layout Shift (CLS). O foco inicial é a reprodução de um problema de estabilidade visual observado no mobile da Montante, mas o script aceita qualquer URL HTTP(S).

A solução apoia revisão de código, investigação de regressões de performance e comparação de resultados antes/depois de mudanças no front-end. **Não realiza correções automáticas.**

## 2. Componentes da aplicação

| Componente | Responsabilidade |
| --- | --- |
| `diagnostico-cls.sh` | Entrada do usuário: valida Node.js/npm, verifica/instala Playwright e Chromium e inicia o teste. |
| `diagnostico-cls.js` | Orquestra o navegador, injeta a instrumentação, coleta os eventos, calcula o CLS e gera os artefatos. |
| `relatorio.md` (gerado) | Apresenta os principais achados em formato legível para análises e MRs. |
| `dados-cls.json` (gerado) | Preserva registros estruturados para investigações aprofundadas. |
| `trace.zip` (gerado) | Permite revisar snapshots e a atividade do navegador no Playwright Trace Viewer. |
| `screenshot-mobile.png` (gerado) | Registra o estado visual da viewport ao fim da execução. |

## 3. Etapas da execução

1. O shell recebe URL, largura e altura, usando como padrão `https://montante.com.br/` e `390 × 844`.
2. O Node.js inicia o Chromium headless com **viewport mobile**, toque habilitado, `locale: pt-BR` e `deviceScaleFactor: 1`.
3. Antes dos scripts do site, a rotina `installProbe` é injetada com `context.addInitScript` e instala o coletor de eventos `layout-shift`.
4. O navegador abre a página, aguardando `DOMContentLoaded` (limite de navegação configurado em 45 segundos).
5. A partir de `DOMContentLoaded`, começa a observação de geometria, redimensionamentos, alterações do DOM e carregamento de imagens.
6. A página permanece aberta por mais **7 segundos** para a coleta.
7. O script calcula a maior janela de sessão de CLS, consolida os eventos e grava quatro arquivos no diretório de resultado.

## 4. O que é monitorado

### 4.1 Eventos de layout shift

O `PerformanceObserver` registra:

- Instante do evento (`atMs`, em milissegundos da navegação).
- Pontuação do evento (`score`).
- Indicação de interação recente (`hadRecentInput`).
- Elementos afetados e a seção que os contém (`sources`, `section`).
- Retângulos visuais anterior e atual (`previousRect`, `currentRect`) e deslocamentos X/Y associados.

O cálculo principal segue a **maior janela de sessão**, somando eventos sem interação recente enquanto o intervalo entre eventos é de no máximo 1 segundo e a janela total não ultrapassa 5 segundos. O script não usa a soma irrestrita de todos os eventos como CLS final.

### 4.2 Geometria e redimensionamento

O coletor monitora `header`, `footer`, `section`, `main`, `.main-slider`, `.swiper-wrapper` e `#empreendimentos`, registrando:

- Posição vertical no documento (`docY`) e no viewport (`viewportY`).
- Largura e altura de cada elemento.
- Diferenças em X/Y e dimensões entre amostras (quando atingem os limites do código).
- Mudanças dimensionais adicionais capturadas pelo `ResizeObserver`.

A amostragem é solicitada a cada 100 ms, com limiar interno de 70 ms entre amostras. Movimentos rápidos demais podem não ser observados.

### 4.3 Mutações do DOM

O `MutationObserver` acompanha alterações relevantes em elementos da página, incluindo mudanças de `class`, `style`, adição e remoção de nós. Essas informações ajudam a relacionar o CLS a inicializações de bibliotecas, renderização de componentes e ajustes dinâmicos.

Uma mutação próxima de um evento **não prova que ela o causou**.

### 4.4 Imagens, fontes, rede e JavaScript

- Captura eventos de `load` de imagens HTML e verifica se têm `width` e `height` explícitos.
- Registra marcos de `DOMContentLoaded`, `load` e `document.fonts.ready`.
- Coleta erros de execução JavaScript e requisições falhas.
- Não observa carregamento de `background-image` da mesma forma que elementos `<img>`.

## 5. Artefatos e interpretação

| Arquivo | Conteúdo | Aplicação |
| --- | --- | --- |
| `relatorio.md` | CLS calculado, principais eventos, seções afetadas, mutações e mudanças geométricas próximas. | Análise rápida e comentário técnico em MR. |
| `dados-cls.json` | Métricas, fontes dos eventos, snapshots, mudanças, mutações, marcas e erros. | Auditoria e investigação detalhada. |
| `trace.zip` | Trace com snapshots e screenshots do Playwright. | Análise temporal e visual no Trace Viewer. |
| `screenshot-mobile.png` | Captura final do viewport. | Evidência visual auxiliar. |

No relatório gerado, **`dy`** representa mudança de posição vertical no documento e **`dh`** representa mudança de altura. A rotina procura alterações em até **400 ms antes ou depois** dos principais layout shifts.

> As dimensões dos retângulos de `LayoutShiftAttribution` são áreas visuais utilizadas pela API; um valor `height: 0` não significa, por si só, que o elemento teve sua altura CSS zerada.

## 6. Estudo de caso: Montante

**Site:** https://montante.com.br/  
**Viewport:** 390 × 844 (mobile)  
**Data da medição informada:** 22/10/2026  
**CLS observado em produção:** **0,1754**

### Resultado do diagnóstico

| Indicador | Resultado |
| --- | --- |
| CLS (maior janela de sessão) | `0,1754` |
| Eventos sem interação | `1` |
| Momento do evento principal | Aproximadamente `2,96 s` |
| Seção identificada como afetada | `section#empreendimentos.section-line.enterprises` |
| Mudança geométrica amostrada dentro de ±400 ms | Nenhuma registrada |

Próximo ao evento, o relatório registrou:

- Alteração na lista de elementos da paginação do banner: `#main-slider-pagination`.
- Alteração de classe em `div.center.swiper.swiper-container`.
- Alterações de estilo inline em slides `.enterprises__card--0` até `.enterprises__card--3`.

Esses eventos são **compatíveis com atividades de inicialização/atualização do Swiper**, mas o diagnóstico **não estabelece** que o slider de empreendimentos ou o banner principal seja a causa do CLS. A ausência de mudanças geométricas amostradas é uma limitação do registro, não confirmação de que não ocorreram.

### Referência adicional do mesmo contexto

Uma execução anterior em `http://localhost:8080/` retornou `CLS: 0,0000` na viewport 390 × 844. **Não é uma comparação controlada suficiente**, pois URLs, conteúdos, recursos carregados e/ou condições de execução podem ser diferentes. O resultado local não comprova correção do problema em produção.

### Conclusão do caso

A ferramenta **reproduziu o deslocamento em produção** e identificou a seção impactada e seu momento aproximado. O passo seguinte para atribuição de causa é verificar o trace e comparar medições antes/depois das alterações do MR sob condições equivalentes.

## 7. Critérios para revisão de MR

Para validar uma alteração destinada a reduzir CLS:

1. Registrar as execuções de base, com a mesma URL, viewport e configuração do navegador.
2. Executar a versão alterada sob as mesmas condições, preferencialmente em ambiente equivalente à produção.
3. Repetir ambos os cenários várias vezes para diminuir o peso da variação de carregamento.
4. Comparar os valores do CLS, a presença do evento e as seções afetadas.
5. Revisar o `trace.zip` e inspecionar regressões visuais, inclusive navegação dos sliders.
6. Aprovar a alegação de correção apenas quando houver **evidência reproduzível de melhoria**, não apenas pela presença de `display: flex`, `flex-shrink: 0` ou `width: 100%`.

## 8. Limitações e cuidados

- **Causa raiz:** o relatório mostra correlações e elementos deslocados, não prova causalidade.
- **Período de observação:** o navegador coleta aproximadamente 7 segundos após `DOMContentLoaded`.
- **Eventos precoces:** a observação de layout shift é instalada antes dos scripts do site, mas geometry/DOM/resize começam somente em `DOMContentLoaded`.
- **Amostragem:** mudanças geométricas podem ocorrer entre duas medições.
- **Ambiente:** não há throttling automático de CPU ou rede nem equivalência garantida com Lighthouse/PageSpeed ou um celular real.
- **Volume:** listas de snapshots, erros, mutações e outros eventos possuem limites no código.
- **Privacidade:** traces, screenshots e JSON podem conter URLs e conteúdo da página; não publique resultados de ambientes restritos sem revisão.

## 9. Possíveis evoluções

- Adicionar opções de duração, tipo de dispositivo, rede e CPU ao CLI.
- Gerar comparação automatizada entre vários testes e estatísticas (mediana, mínimos e máximos).
- Ampliar a instrumentação antes de `DOMContentLoaded` e coletar estilos calculados próximos aos eventos.
- Produzir um arquivo HTML interativo com linha do tempo e destaques dos elementos afetados.
- Integrar a execução a pipelines de CI para detectar regressões de CLS.

## 10. Considerações finais

O diagnóstico automatiza a coleta de evidências que seriam difíceis de reunir somente observando a página. É especialmente útil para **localizar o instante e o elemento afetado** e orientar testes controlados. Seu valor técnico está no cruzamento de sinais — Layout Shift API, geometria, mutações, traces e erros — sempre acompanhado da ressalva de que **correlação temporal não significa causalidade**.
