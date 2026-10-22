# Diagnóstico CLS — Mobile

O teste inicializa um Chromium via Playwright e começa a observar Layout Shift **antes dos scripts da página**. Gera uma pasta `resultado-cls-*` com `relatorio.md`, `dados-cls.json`, `trace.zip` e `screenshot-mobile.png`.

## Como executar (Linux/macOS)

1. Instale Node.js e npm, se necessário.
2. Extraia os arquivos do ZIP na mesma pasta.
3. Abra um terminal nessa pasta.
4. Execute:

   ```bash
   bash diagnostico-cls.sh https://exemplo.com
   ```

   Para alterar o viewport:

   ```bash
   bash diagnostico-cls.sh https://exemplo.com 412 823
   ```

O script `.sh` instala `playwright` e o Chromium na primeira execução, se faltarem. Caso o Linux indique bibliotecas do sistema ausentes, instale-as seguindo a orientação exibida pelo Playwright.

## Como comparar um MR

Execute primeiro na versão atual e depois na versão modificada, preferencialmente com a mesma URL/viewport e rede semelhantes. Compare `CLS`, os eventos e as mudanças de altura no `relatorio.md`. Repetir o teste algumas vezes reduz conclusões baseadas em variação momentânea.

## Como ver a gravação

Dentro da pasta que contém `trace.zip`, execute:

```bash
npx playwright show-trace trace.zip
```

## Limitação importante

Os elementos listados em `LayoutShift.sources` são **elementos afetados**. O relatório tenta aproximar possíveis causas correlacionando alterações de tamanho e mutações, mas isso não estabelece causa com certeza absoluta. Scripts de terceiros, fonts, elementos em iframes, mudanças de scroll e diferentes perfis de CPU/rede podem afetar o resultado. O relatório **não é uma réplica do PageSpeed**.
